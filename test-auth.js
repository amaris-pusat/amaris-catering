/* ============================================================
   TEST — Autentikasi multi-role (headless, tanpa browser)
   Menjalankan js/auth.js + js/data.js di Node dengan stub
   sessionStorage & localStorage.
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');

/* ---------- Stub browser storage ---------- */
const store = {};
const ls = {};
global.sessionStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
global.localStorage = {
  getItem: k => (k in ls ? ls[k] : null),
  setItem: (k, v) => { ls[k] = String(v); },
  removeItem: k => { delete ls[k]; }
};
global.console = console;

/* ---------- Muat modul ---------- */
const vm = require('vm');
const load = (rel) => {
  const code = fs.readFileSync(path.join(__dirname, rel), 'utf8');
  vm.runInThisContext(code, { filename: rel });
};
load('js/auth.js');
load('js/data.js');

const results = [];
const assert = (name, cond) => {
  results.push([name, !!cond]);
  if (!cond) console.error('  ❌ FAIL:', name);
};

/* ---------- 1. Login valid / invalid ---------- */
assert('Admin login valid', login('nurulamar', 'nurulamar1') && currentSession().role === 'admin');
assert('Debonglor login valid', login('debonglor', 'debonglor1') && currentSession().uptdId === 'debong');
assert('Tegalbarat login valid', login('tegalbarat', 'tegalbarat2') && currentSession().uptdId === 'barat');
assert('Login salah password ditolak', login('nurulamar', 'salah') === null);
assert('Login username tidak dikenal ditolak', login('hacker', 'x') === null);
assert('Logout menghapus sesi', (login('nurulamar', 'nurulamar1'), logout(), currentSession() === null));
assert('Sesi rusak ditolak', (store['amaris-auth-session'] = '{{{', currentSession() === null));

/* ---------- 2. Helper peran ---------- */
login('nurulamar', 'nurulamar1');
assert('isAdmin benar', isAdmin() === true);
assert('isUptdUser salah untuk admin', isUptdUser() === false);
login('debonglor', 'debonglor1');
assert('isUptdUser benar', isUptdUser() === true);
assert('currentUptdId = debong', currentUptdId() === 'debong');
login('tegalbarat', 'tegalbarat2');
assert('currentUptdId = barat', currentUptdId() === 'barat');
logout();

/* ---------- 3. Mapping UPTD benar (kredensial sesuai permintaan) ---------- */
const u = findUser('debonglor');
assert('debonglor → uptd debong', u && u.uptdId === 'debong');
const u2 = findUser('tegalbarat');
assert('tegalbarat → uptd barat', u2 && u2.uptdId === 'barat');

/* ---------- 4. Scoping data UPTD (simulasi filteredTransactions) ---------- */
const scoped = (uptdId) => {
  const all = getTransactions();
  return all.filter(t => {
    if (uptdId && t.uptd !== uptdId) return false;
    return true;
  });
};
const txnDebong = scoped('debong');
const txnBarat = scoped('barat');
assert('UPTD debong hanya melihat transaksi debong', txnDebong.every(t => t.uptd === 'debong'));
assert('UPTD barat hanya melihat transaksi barat', txnBarat.every(t => t.uptd === 'barat'));
assert('Data debong + barat + umum tidak tercampur', txnDebong.length + txnBarat.length <= getTransactions().length);

/* ---------- 5. Kelola akun UPTD dinamis ---------- */
// getUptdUsers() melakukan seed otomatis saat pertama dipanggil
const seeded = getUptdUsers();
assert('Seed otomatis 2 akun UPTD bawaan', seeded.length === 2 && seeded.some(u => u.username === 'debonglor') && seeded.some(u => u.username === 'tegalbarat'));
assert('seed disimpan ke localStorage', ls['amaris-auth-users'] && JSON.parse(ls['amaris-auth-users']).length === 2);

// Tambah akun baru
const added = addUptdUser({ uptdId: 'debong', username: 'userbaru', password: 'pass123', name: 'User Baru' });
assert('Tambah akun UPTD baru berhasil', added.ok && !!added.user);
assert('Akun baru bisa login', login('userbaru', 'pass123') && currentSession().uptdId === 'debong');
logout();

// Duplikat username ditolak (case-insensitive)
const dup = addUptdUser({ uptdId: 'barat', username: 'USERBARU', password: 'x' });
assert('Username duplikat ditolak', !dup.ok);
// Username sama dengan admin ditolak
const dupAdmin = addUptdUser({ uptdId: 'barat', username: 'nurulamar', password: 'x' });
assert('Username admin tidak bisa dipakai', !dupAdmin.ok);

// Update akun
const added2 = addUptdUser({ uptdId: 'debong', username: 'akun2', password: 'p1' });
const upd = updateUptdUser(added2.user.id, { uptdId: 'barat', username: 'akun2', password: 'p2' });
assert('Update akun berhasil', upd.ok && upd.user.uptdId === 'barat');
assert('Password baru berlaku', login('akun2', 'p2') && currentSession().uptdId === 'barat');
logout();

// Hapus akun
assert('Hapus akun berhasil', deleteUptdUser(added2.user.id));
assert('Akun terhapus tidak bisa login', login('akun2', 'p2') === null);

/* ---------- Ringkasan ---------- */
const failed = results.filter(r => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} tes lolos.`);
if (failed.length) {
  console.error(`GAGAL: ${failed.length}`);
  process.exit(1);
}
process.exit(0);
