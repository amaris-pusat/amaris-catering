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
const AUTH_API = ((typeof window !== 'undefined' && window.AMARIS_API_BASE) || '') + '/api/auth';
let serverSession = null;

async function authFetch(path, options = {}) {
  const res = await fetch(AUTH_API + path, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  let body = null;
  try { body = await res.json(); } catch (e) { /* response tanpa JSON */ }
  return { ok: res.ok, status: res.status, body };
}

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

/* ---------- Login / Logout server-side ---------- */
async function login(username, password) {
  const r = await authFetch('/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  if (!r.ok || !r.body || !r.body.user) return null;
  serverSession = r.body.user;
  return serverSession;
}

async function logout() {
  try { await authFetch('/logout', { method: 'POST', body: '{}' }); } catch (e) { /* session server tetap dibersihkan lokal */ }
  serverSession = null;
  try { sessionStorage.removeItem(AUTH_KEY); } catch (e) { /* abaikan */ }
}

async function currentSession() {
  if (serverSession) return serverSession;
  try {
    const r = await authFetch('/session');
    if (!r.ok || !r.body || !r.body.user) return null;
    serverSession = r.body.user;
    return serverSession;
  } catch (e) { return null; }
}

/* Helper sinkron untuk renderer lama; diisi setelah initAuthSession(). */
function cachedSession() { return serverSession; }

async function initAuthSession() {
  serverSession = null;
  return currentSession();
}

/* ---------- Helper peran ---------- */
function isAdmin() {
  const s = cachedSession();
  return !!(s && s.role === 'admin');
}

function isUptdUser() {
  const s = cachedSession();
  return !!(s && s.role === 'uptd');
}

function currentUptdId() {
  const s = cachedSession();
  return (s && s.uptdId) || '';
}
