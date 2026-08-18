/* ============================================================
   AMARIS CATERING — Lapisan UI (helper & modal)
   ============================================================ */
'use strict';

/* ---------- Format uang ---------- */
function formatRupiah(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  return sign + 'Rp ' + abs.toLocaleString('id-ID');
}

function formatRupiahPlain(n) {
  return (Number(n) || 0).toLocaleString('id-ID');
}

function parseUang(str) {
  if (str == null) return 0;
  // Hapus pemisah ribuan (titik gaya id-ID "1.500.000" atau koma "1,500") dan
  // karakter non-angka, sisakan hanya digit & tanda minus.
  const clean = String(str).replace(/[^\d-]/g, '');
  if (!clean || clean === '-') return 0;
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : 0;
}

/* ---------- Format tanggal Indonesia ---------- */
const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BULAN_SINGKAT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function formatTanggal(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  const mi = parseInt(m, 10) - 1;
  return `${parseInt(d, 10)} ${BULAN_ID[mi] || m} ${y}`;
}

function formatTanggalPendek(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  const mi = parseInt(m, 10) - 1;
  return `${parseInt(d, 10)} ${BULAN_SINGKAT[mi] || m}`;
}

function formatBulanKey(mk) {
  if (!mk) return '';
  const [y, m] = mk.split('-');
  const mi = parseInt(m, 10) - 1;
  return `${BULAN_SINGKAT[mi] || m} ${y}`;
}

function todayISO() {
  return todayISOLocal();
}

function currentMonthKey() {
  return todayISO().slice(0, 7);
}

/* ---------- Toast ---------- */
function toast(message, type = 'ok') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s ease, transform .3s ease';
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

/* ---------- Pembungkus modal ---------- */
function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('open');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('open');
}

function showConfirm(message, onOk) {
  const msg = document.getElementById('confirm-msg');
  if (!msg) return;
  msg.textContent = message;
  const okBtn = document.getElementById('confirm-ok');
  okBtn.onclick = () => {
    closeModal('modal-confirm');
    if (onOk) onOk();
  };
  openModal('modal-confirm');
}

/* ---------- Deteksi Esc & klik luar modal ---------- */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeAllModals();
});

document.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('modal')) closeAllModals();
});

function closeAllModals() {
  document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
}

/* ---------- Bantuan umum ---------- */
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function downloadFile(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 400);
}

/* ---------- Input rupiah live-format ---------- */
function attachUangInput(el) {
  if (!el) return;
  el.addEventListener('input', () => {
    const digits = String(el.value).replace(/[^\d]/g, '').slice(0, 13);
    el.value = digits ? Number(digits).toLocaleString('id-ID') : '';
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' || e.key === 'Delete') return;
    if (!/^\d$/.test(e.key) && !e.ctrlKey && !e.metaKey) e.preventDefault();
  });
}

function uangInputToNumber(el) {
  return parseUang(el.value);
}

/* ---------- State navigasi ---------- */
function setActiveNav(page) {
  sessionStorage.setItem('amaris-page', page);
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  const titles = { dashboard: 'Ringkasan', kas: 'Buku Kas', laporan: 'Laporan', pengaturan: 'Pengaturan' };
  const h1 = document.getElementById('page-title');
  if (h1) h1.textContent = titles[page] || 'Ringkasan';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
