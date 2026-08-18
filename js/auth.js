/* ============================================================
   AMARIS CATERING — Lapisan Autentikasi & Peran (Role)
   ============================================================
   Aplikasi ini berjalan sepenuhnya di sisi klien (tanpa backend).
   Akun superadmin tetap di-hardcode; akun UPTD dinamis disimpan
   di localStorage (dikelola superadmin lewat menu Pengaturan).
   ============================================================ */
'use strict';

const AUTH_KEY = 'amaris-auth-session';
const USERS_KEY = 'amaris-auth-users';

const ADMIN_USER = {
  username: 'nurulamar',
  password: 'nurulamar1',
  role: 'admin',
  name: 'Admin',
  uptdId: ''
};

/* ---------- Akun UPTD bawaan (seed pertama kali) ---------- */
const DEFAULT_UPTD_USERS = [
  { username: 'debonglor', password: 'debonglor1', role: 'uptd', name: 'UPTD Puskesmas Debong Lor', uptdId: 'debong' },
  { username: 'tegalbarat', password: 'tegalbarat2', role: 'uptd', name: 'UPTD Puskesmas Tegal Barat', uptdId: 'barat' }
];

/* ---------- Akun UPTD dinamis (localStorage) ---------- */
// Struktur: { id, username, password, role:'uptd', name, uptdId }
function getUptdUsers() {
  let raw = null;
  try {
    raw = localStorage.getItem(USERS_KEY);
  } catch (e) {
    console.error('Gagal memuat akun UPTD:', e);
    return [];
  }
  if (raw === null) {
    // Pertama kali: seed akun UPTD bawaan agar tetap bisa login.
    const seed = DEFAULT_UPTD_USERS.map(u => ({ id: uidAuth(), ...u }));
    saveUptdUsers(seed);
    return seed;
  }
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) {
    console.error('Gagal parse akun UPTD:', e);
    return [];
  }
}

function uidAuth() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function saveUptdUsers(users) {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  } catch (e) {
    console.error('Gagal menyimpan akun UPTD:', e);
  }
}

/* ---------- Daftar akun (admin + UPTD) ---------- */
function findAllUsers() {
  return [ADMIN_USER].concat(getUptdUsers());
}

function findUser(username) {
  const u = (username || '').trim().toLowerCase();
  return findAllUsers().find(x => x.username === u) || null;
}

/* ---------- Kelola akun UPTD (Superadmin) ---------- */
function addUptdUser({ uptdId, username, password, name }) {
  const uname = (username || '').trim().toLowerCase();
  if (!uname) return { ok: false, error: 'Username tidak boleh kosong.' };
  if (!/^[a-z0-9._-]+$/.test(uname)) {
    return { ok: false, error: 'Username hanya boleh huruf kecil, angka, titik, strip, underscore.' };
  }
  if (findAllUsers().some(x => x.username === uname)) {
    return { ok: false, error: 'Username sudah dipakai.' };
  }
  if (!(password || '')) return { ok: false, error: 'Password tidak boleh kosong.' };
  const u = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    username: uname,
    password: String(password),
    role: 'uptd',
    name: (name || '').trim() || uname,
    uptdId: uptdId || ''
  };
  const users = getUptdUsers();
  users.push(u);
  saveUptdUsers(users);
  return { ok: true, user: u };
}

function updateUptdUser(id, { uptdId, username, password, name }) {
  const users = getUptdUsers();
  const u = users.find(x => x.id === id);
  if (!u) return { ok: false, error: 'Akun tidak ditemukan.' };
  const uname = (username || '').trim().toLowerCase();
  if (!uname) return { ok: false, error: 'Username tidak boleh kosong.' };
  if (!/^[a-z0-9._-]+$/.test(uname)) {
    return { ok: false, error: 'Username hanya boleh huruf kecil, angka, titik, strip, underscore.' };
  }
  const dup = findAllUsers().some(x => x.id !== id && x.username === uname);
  if (dup) return { ok: false, error: 'Username sudah dipakai.' };
  u.username = uname;
  if (password) u.password = String(password);
  u.uptdId = uptdId || '';
  u.name = (name || '').trim() || uname;
  saveUptdUsers(users);
  return { ok: true, user: u };
}

function deleteUptdUser(id) {
  const users = getUptdUsers();
  const idx = users.findIndex(x => x.id === id);
  if (idx === -1) return false;
  users.splice(idx, 1);
  saveUptdUsers(users);
  return true;
}

function getUptdUserById(id) {
  return getUptdUsers().find(x => x.id === id) || null;
}

/* ---------- Login / Logout ---------- */
function login(username, password) {
  const user = findUser(username);
  if (!user) return null;
  if (String(password) !== user.password) return null;

  const session = {
    username: user.username,
    role: user.role,
    name: user.name,
    uptdId: user.uptdId,
    loginAt: new Date().toISOString()
  };
  try {
    sessionStorage.setItem(AUTH_KEY, JSON.stringify(session));
  } catch (e) {
    console.error('Gagal menyimpan sesi:', e);
  }
  return session;
}

function logout() {
  try {
    sessionStorage.removeItem(AUTH_KEY);
  } catch (e) {
    console.error('Gagal menghapus sesi:', e);
  }
}

function currentSession() {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Validasi: sesi harus mengacu ke akun yang masih terdaftar.
    const user = findUser(parsed.username);
    if (!user) return null;
    return {
      username: user.username,
      role: user.role,
      name: user.name,
      uptdId: user.uptdId,
      loginAt: parsed.loginAt || ''
    };
  } catch (e) {
    return null;
  }
}

/* ---------- Helper peran ---------- */
function isAdmin() {
  const s = currentSession();
  return !!(s && s.role === 'admin');
}

function isUptdUser() {
  const s = currentSession();
  return !!(s && s.role === 'uptd');
}

function currentUptdId() {
  const s = currentSession();
  return (s && s.uptdId) || '';
}
