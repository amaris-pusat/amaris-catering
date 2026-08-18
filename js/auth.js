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

let userCache = [];
async function refreshUptdUsers() {
  const r = await authFetch('/users');
  if (!r.ok || !r.body || !Array.isArray(r.body.users)) throw new Error('Gagal memuat akun');
  userCache = r.body.users.map(u => ({ id:u.id, username:u.username, role:u.role, name:u.name, uptdId:u.uptd_id || u.uptdId || '' }));
  return userCache;
}
function getUptdUsers() { return userCache.filter(u => u.role === 'uptd'); }
function findAllUsers() { return userCache.slice(); }
function findUser(username) { const u=(username||'').trim().toLowerCase(); return userCache.find(x=>x.username===u)||null; }
async function addUptdUser({ uptdId, username, password, name }) {
  const r = await authFetch('/users', { method:'POST', body:JSON.stringify({ uptdId, username, password, name, role:'uptd' }) });
  if (!r.ok) return { ok:false, error:(r.body&&r.body.error)||'Gagal menambah akun.' };
  await refreshUptdUsers(); return { ok:true, user:r.body.user };
}
async function updateUptdUser(id, { uptdId, username, password, name }) {
  const r = await authFetch('/users/'+encodeURIComponent(id), { method:'PUT', body:JSON.stringify({ uptdId, username, password, name, role:'uptd' }) });
  if (!r.ok) return { ok:false, error:(r.body&&r.body.error)||'Gagal memperbarui akun.' };
  await refreshUptdUsers(); return { ok:true, user:getUptdUserById(id) };
}
async function deleteUptdUser(id) {
  const r = await authFetch('/users/'+encodeURIComponent(id), { method:'DELETE' });
  if (!r.ok) return false;
  await refreshUptdUsers(); return true;
}
function getUptdUserById(id) { return userCache.find(u=>u.id===id)||null; }

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
  const session = await currentSession();
  if (session && session.role === 'admin') {
    try { await refreshUptdUsers(); } catch (e) { console.warn('Akun belum termuat:', e.message); }
  }
  return session;
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
