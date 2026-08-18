/* ============================================================
   AMARIS CATERING — Lapisan Data (penyimpanan & perhitungan)
   ============================================================ */
'use strict';

const STORAGE_KEY = 'amaris-catering-data-v1';

/* ---------- Sinkronisasi cloud (Cloudflare Worker + D1) ---------- */
const API_BASE = (typeof window !== 'undefined' && window.AMARIS_API_BASE)
  ? window.AMARIS_API_BASE
  : (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin !== 'null')
    ? window.location.origin
    : '';
const API_STATE = API_BASE ? API_BASE + '/api/state' : '/api/state';
const API_TOKEN = (typeof window !== 'undefined' && window.AMARIS_API_TOKEN) || '';
let apiAvailable = false;   // true setelah GET /api/state berhasil
let saveQueue = Promise.resolve(); // antrian agar PUT tidak tumpang tindih
let saveTimer = null;

function getApiToken() {
  return API_TOKEN;
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(API_TOKEN ? { 'X-Api-Token': API_TOKEN } : {}),
      ...(opts.headers || {})
    }
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// Ambil state dari Worker D1. Mengembalikan objek state atau null jika kosong/gagal.
async function loadRemoteState() {
  try {
    const r = await fetchJSON(API_STATE);
    apiAvailable = true;
    return r && r.data ? r.data : null;
  } catch (e) {
    apiAvailable = false;
    console.warn('[cloud] Gagal ambil state dari cloud:', e.message);
    return null;
  }
}

// Simpan state ke Worker D1 (fire-and-forget dengan antrian; tanpa menunggu UI).
function saveRemoteState(data) {
  saveQueue = saveQueue
    .then(async () => {
      try {
        await fetchJSON(API_STATE, {
          method: 'PUT',
          body: JSON.stringify(data)
        });
        apiAvailable = true;
        return true;
      } catch (e) {
        apiAvailable = false;
        throw new Error('Cloud save failed: ' + e.message);
      }
    });
  return saveQueue;
}

// Debounce simpan: panggilan bertubi-tubi (mis. ketik isian form) digabung menjadi satu PUT.
function scheduleCloudSave() {
  if (!apiAvailable) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveRemoteState(JSON.parse(JSON.stringify(state)));
  }, 500);
}

/* ---------- Kategori bawaan (tidak bisa dihapus) ---------- */
const DEFAULT_CATEGORIES = {
  masuk: [
    { id: 'masuk-modal', label: 'Modal', builtin: true },
    { id: 'masuk-pembayaran', label: 'Pembayaran', builtin: true },
    { id: 'masuk-fee', label: 'Fee', builtin: true }
  ],
  keluar: [
    { id: 'keluar-snack', label: 'Snack', builtin: true },
    { id: 'keluar-nasi', label: 'Nasi Box', builtin: true },
    { id: 'keluar-gabungan', label: 'Snack + Nasi Box', builtin: true },
    { id: 'keluar-prasmanan', label: 'Prasmanan', builtin: true },
    { id: 'keluar-penarikan', label: 'Penarikan', builtin: true }
  ]
};

const METHODS = ['Tunai', 'Transfer Bank', 'QRIS / E-Wallet', 'Lainnya'];

/* ---------- UPTD Puskesmas: daftar dinamis (tersimpan di localStorage) ---------- */
// Struktur: { id, label, harga:{snack,nasi,prasmanan}, profit:{snack,nasi,prasmanan} }
const DEFAULT_UPTDS = [
  {
    id: 'debong', label: 'UPTD Puskesmas Debong Lor',
    harga: { snack: 11000, nasi: 25000, prasmanan: 0 },
    profit: { snack: 2500, nasi: 3000, prasmanan: 0 }
  },
  {
    id: 'barat', label: 'UPTD Puskesmas Tegal Barat',
    harga: { snack: 13000, nasi: 25000, prasmanan: 0 },
    profit: { snack: 3000, nasi: 3000, prasmanan: 0 }
  }
];

// Migrasi data lama: jika state.uptds belum ada, gunakan DEFAULT_UPTDS.
function mergeUptds(parsed) {
  const src = Array.isArray(parsed && parsed.uptds) ? parsed.uptds : DEFAULT_UPTDS;
  return src.map(u => ({
    id: u.id,
    label: u.label || u.id,
    harga: { snack: num(u.harga && u.harga.snack, 0), nasi: num(u.harga && u.harga.nasi, 0), prasmanan: num(u.harga && u.harga.prasmanan, 0) },
    profit: { snack: num(u.profit && u.profit.snack, 0), nasi: num(u.profit && u.profit.nasi, 0), prasmanan: num(u.profit && u.profit.prasmanan, 0) }
  }));
}

function num(v, d) { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : d; }

function getUptdList() {
  return (state && state.uptds) || DEFAULT_UPTDS;
}

function uptdLabel(id) {
  const f = getUptdList().find(u => u.id === id);
  return f ? f.label : '';
}

function hargaSatuan(uptdId, kategoriId) {
  // kategoriId: 'keluar-snack' | 'keluar-nasi' | 'keluar-prasmanan'
  const kat = (kategoriId || '').replace('keluar-', '');
  const u = getUptdList().find(x => x.id === uptdId);
  return (u && u.harga && u.harga[kat]) || 0;
}

function profitSatuan(uptdId, kategoriId) {
  const kat = (kategoriId || '').replace('keluar-', '');
  const u = getUptdList().find(x => x.id === uptdId);
  return (u && u.profit && u.profit[kat]) || 0;
}

// Hitung otomatis: Total = Qty × harga satuan.
// Kategori 'keluar-gabungan' (Snack + Nasi Box): qty = Snack, qtyNasi = Nasi Box.
function hitungTotal(uptdId, kategoriId, qty, qtyNasi) {
  if (kategoriId === 'keluar-gabungan') {
    const q = Math.max(0, Math.round(Number(qty) || 0));
    const qn = Math.max(0, Math.round(Number(qtyNasi) || 0));
    return q * hargaSatuan(uptdId, 'keluar-snack') + qn * hargaSatuan(uptdId, 'keluar-nasi');
  }
  return Math.max(0, Math.round(Number(qty) || 0)) * hargaSatuan(uptdId, kategoriId);
}

// Keuntungan = Qty × profit per porsi.
function hitungKeuntungan(uptdId, kategoriId, qty, qtyNasi) {
  if (kategoriId === 'keluar-gabungan') {
    const q = Math.max(0, Math.round(Number(qty) || 0));
    const qn = Math.max(0, Math.round(Number(qtyNasi) || 0));
    return q * profitSatuan(uptdId, 'keluar-snack') + qn * profitSatuan(uptdId, 'keluar-nasi');
  }
  return Math.max(0, Math.round(Number(qty) || 0)) * profitSatuan(uptdId, kategoriId);
}

const DEFAULT_STATE = () => ({
  settings: { namaUsaha: 'Amaris Catering', saldoAwal: 0 },
  categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)),
  uptds: JSON.parse(JSON.stringify(DEFAULT_UPTDS)),
  transactions: [], // {id, tanggal, tipe, kategori, keterangan, metode, jumlah, uptd, qty, harga_manual?}
  profitWithdrawals: [] // {id, tanggal, jumlah, keterangan, status: 'pending'|'approved'|'rejected'}
});

// state diisi default sinkron agar seluruh fungsi aman dipanggil kapan pun;
// initData() (async, dipanggil saat boot) akan menggantinya dari cloud/localStorage.
let state = DEFAULT_STATE();

/* ---------- Utilitas ---------- */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------- Tanggal hari ini (lokal, hindari pergeseran UTC) ---------- */
function todayISOLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function loadState() {
  // Data produksi wajib berasal dari Worker/D1 agar semua device konsisten.
  const remote = await loadRemoteState();
  if (remote) return normalizeState(remote);
  return DEFAULT_STATE();
}

function normalizeState(parsed) {
  const def = DEFAULT_STATE();
  return {
    settings: { ...def.settings, ...(parsed && parsed.settings ? parsed.settings : {}) },
    categories: mergeCategories(def, parsed && parsed.categories),
    uptds: mergeUptds(parsed),
    // Migrasi data lama: transaksi keluar yang dulu menyimpan harga_manual
    // (dan belum punya qty) diubah menjadi qty=1, jumlah=harga_manual.
    transactions: Array.isArray(parsed && parsed.transactions)
      ? parsed.transactions.map(migrateTxn)
      : [],
    profitWithdrawals: Array.isArray(parsed && parsed.profitWithdrawals)
      ? parsed.profitWithdrawals.map(migrateWd)
      : []
  };
}

function migrateTxn(t) {
  if (t && typeof t === 'object') {
    if (t.tipe === 'keluar' && (t.harga_manual != null) && (t.qty == null)) {
      t.qty = 1;
      t.jumlah = Math.round(Number(t.harga_manual) || 0);
    }
  }
  return t;
}

// Migrasi pencairan lama: data tanpa status dianggap SUDAH disetujui (approved),
// karena sebelumnya pencairan langsung dihitung sebagai uang yang ditarik.
function migrateWd(w) {
  if (w && typeof w === 'object' && !w.status) {
    w.status = 'approved';
  }
  return w;
}

function mergeCategories(def, parsed) {
  const out = {
    masuk: def.categories.masuk.map(c => ({ ...c })),
    keluar: def.categories.keluar.map(c => ({ ...c }))
  };
  if (parsed && Array.isArray(parsed.masuk)) {
    for (const c of parsed.masuk) {
      if (c && c.id && !out.masuk.some(x => x.id === c.id)) {
        out.masuk.push({ id: c.id, label: c.label, builtin: !!c.builtin });
      }
    }
  }
  if (parsed && Array.isArray(parsed.keluar)) {
    for (const c of parsed.keluar) {
      if (c && c.id && !out.keluar.some(x => x.id === c.id)) {
        out.keluar.push({ id: c.id, label: c.label, builtin: !!c.builtin });
      }
    }
  }
  return out;
}

async function saveState() {
  return saveRemoteState(JSON.parse(JSON.stringify(state)));
}

/* ---------- Inisialisasi data (dipanggil saat boot aplikasi) ---------- */
async function initData() {
  state = await loadState();
  return state;
}

function getState() { return state; }
function setStateForTest(s) { state = s; }

function getCategoryLabel(tipe, id) {
  const cats = state.categories[tipe] || [];
  const found = cats.find(c => c.id === id);
  return found ? found.label : 'Tanpa kategori';
}

/* ---------- Transaksi ---------- */
function addTransaction({ tanggal, tipe, kategori, keterangan, metode, jumlah, uptd, qty, qty_nasi }) {
  const txn = {
    id: uid(),
    tanggal: tanggapValidate(tanggal) ? tanggal : todayISOLocal(),
    tipe: tipe === 'keluar' ? 'keluar' : 'masuk',
    kategori: kategori || '',
    keterangan: (keterangan || '').trim(),
    metode: metode || 'Transfer Bank',
    jumlah: Math.max(0, Math.round(Number(jumlah) || 0)),
    uptd: uptd || '',
    qty: tipe === 'keluar' ? Math.max(0, Math.round(Number(qty) || 0)) : 0,
    qty_nasi: tipe === 'keluar' ? Math.max(0, Math.round(Number(qty_nasi) || 0)) : 0
  };
  state.transactions.push(txn);
  saveState();
  return txn;
}

function updateTransaction(id, patch) {
  const txn = state.transactions.find(t => t.id === id);
  if (!txn) return false;
  if ('tanggal' in patch) txn.tanggal = patch.tanggal;
  if ('tipe' in patch) txn.tipe = patch.tipe === 'keluar' ? 'keluar' : 'masuk';
  if ('kategori' in patch) txn.kategori = patch.kategori;
  if ('keterangan' in patch) txn.keterangan = patch.keterangan.trim();
  if ('metode' in patch) txn.metode = patch.metode;
  if ('jumlah' in patch) txn.jumlah = Math.max(0, Math.round(Number(patch.jumlah) || 0));
  // field khusus pengeluaran (UPTD & qty)
  if ('uptd' in patch) txn.uptd = patch.uptd;
  if ('qty' in patch) txn.qty = Math.max(0, Math.round(Number(patch.qty) || 0));
  if ('qty_nasi' in patch) txn.qty_nasi = Math.max(0, Math.round(Number(patch.qty_nasi) || 0));
  saveState();
  return true;
}

function deleteTransaction(id) {
  const idx = state.transactions.findIndex(t => t.id === id);
  if (idx === -1) return false;
  state.transactions.splice(idx, 1);
  saveState();
  return true;
}

function getTransactions() {
  return state.transactions.slice().sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.id.localeCompare(b.id));
}

/* ---------- Keuntungan usaha (per UPTD & per bulan) ---------- */
// Keuntungan dari:
//  - Pesanan Snack & Nasi Box di tiap UPTD (qty × profit per porsi); Prasmanan: belum ada keuntungan.
//  - Kategori pemasukan "Fee": seluruh nominal langsung dihitung sebagai keuntungan.
function keuntunganTxn(t) {
  if (t.tipe === 'masuk') {
    return t.kategori === 'masuk-fee' ? (Number(t.jumlah) || 0) : 0;
  }
  return hitungKeuntungan(t.uptd, t.kategori, t.qty, t.qty_nasi);
}

function keuntunganFeePerMonth(monthKeyStr) {
  return state.transactions
    .filter(t => t.tipe === 'masuk' && t.kategori === 'masuk-fee' && monthKey(t.tanggal) === monthKeyStr)
    .reduce((acc, t) => acc + (Number(t.jumlah) || 0), 0);
}

function keuntunganForMonth(monthKeyStr) {
  // Total keuntungan = (qty × profit/porsi untuk pesanan keluar) + (nominal Fee).
  return state.transactions
    .filter(t => monthKey(t.tanggal) === monthKeyStr && (t.tipe === 'keluar' || t.kategori === 'masuk-fee'))
    .reduce((acc, t) => acc + keuntunganTxn(t), 0);
}

// Keuntungan per UPTD (dinamis dari daftar UPTD)
function keuntunganPerUPTD(monthKeyStr) {
  const out = {};
  for (const u of getUptdList()) {
    out[u.id] = { total: 0, snack: 0, nasi: 0, prasmanan: 0, prasmananCount: 0 };
  }
  for (const t of state.transactions) {
    if (t.tipe !== 'keluar') continue;
    if (monthKeyStr && monthKey(t.tanggal) !== monthKeyStr) continue;
    if (!t.uptd || !out[t.uptd]) continue;
    const key = out[t.uptd];
    const kat = (t.kategori || '').replace('keluar-', '');
    if (kat === 'gabungan') {
      const valS = profitSatuan(t.uptd, 'keluar-snack') * (Number(t.qty) || 0);
      const valN = profitSatuan(t.uptd, 'keluar-nasi') * (Number(t.qty_nasi) || 0);
      key.total += valS + valN;
      key.snack += valS;
      key.nasi += valN;
      continue;
    }
    const profit = profitSatuan(t.uptd, t.kategori);
    const val = profit * (Number(t.qty) || 0);
    key.total += val;
    if (kat === 'snack') key.snack += val;
    if (kat === 'nasi') key.nasi += val;
    if (kat === 'prasmanan') { key.prasmanan += val; key.prasmananCount += 1; }
  }
  return out;
}

/* ---------- Pencairan Keuntungan ---------- */
// Pencairan keuntungan adalah uang keuntungan yang DIAMBIL oleh pemilik usaha.
// Berbeda dengan transaksi kas: pencairan TIDAK mengurangi saldo kas (saldo kas
// tetap mencerminkan uang operasional). Pencairan hanya mengurangi akumulasi
// keuntungan yang bisa dicairkan (Keuntungan kotor − total pencairan).
function addProfitWithdrawal({ tanggal, jumlah, keterangan }) {
  if (!(Number(jumlah) > 0)) return null;
  const wd = {
    id: uid(),
    tanggal: tanggapValidate(tanggal) ? tanggal : todayISOLocal(),
    jumlah: Math.max(0, Math.round(Number(jumlah) || 0)),
    keterangan: (keterangan || '').trim(),
    status: 'pending' // menunggu persetujuan → approved (uang ditarik) atau rejected (uang kembali)
  };
  state.profitWithdrawals.push(wd);
  saveState();
  return wd;
}

// Approve: pencairan dianggap sah; tidak bisa diubah lagi (status terkunci).
function approveProfitWithdrawal(id) {
  const wd = state.profitWithdrawals.find(w => w.id === id);
  if (!wd || wd.status !== 'pending') return false;
  wd.status = 'approved';
  saveState();
  return true;
}

// Reject: pencairan dibatalkan → uang keuntungan otomatis kembali ke saldo yang
// bisa dicairkan (tidak dihitung dalam totalProfitWithdrawn).
function rejectProfitWithdrawal(id) {
  const wd = state.profitWithdrawals.find(w => w.id === id);
  if (!wd || wd.status !== 'pending') return false;
  wd.status = 'rejected';
  saveState();
  return true;
}

function getProfitWithdrawals() {
  return state.profitWithdrawals.slice().sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.id.localeCompare(b.id));
}

// Hanya pencairan yang DISETUJUI yang mengurangi keuntungan tersedia.
// Pencairan yang ditolak otomatis "kembali" (tidak mengurangi).
function totalProfitWithdrawn() {
  return state.profitWithdrawals
    .filter(w => w.status === 'approved')
    .reduce((acc, w) => acc + (Number(w.jumlah) || 0), 0);
}

// Total keuntungan kotor sepanjang waktu (dari pesanan & fee), tanpa batas bulan.
function totalKeuntunganKotor() {
  return state.transactions
    .filter(t => t.tipe === 'keluar' || t.kategori === 'masuk-fee')
    .reduce((acc, t) => acc + keuntunganTxn(t), 0);
}

// Keuntungan yang tersedia untuk dicairkan = kotor − sudah dicairkan.
function keuntunganTersedia() {
  return totalKeuntunganKotor() - totalProfitWithdrawn();
}

/* ---------- Helper: pengaruh transaksi terhadap saldo kas ---------- */
// Fee (pemasukan kategori 'masuk-fee') MENGURANGI saldo kas (seperti biaya
// operasional) namun seluruh nominalnya langsung menjadi keuntungan.
// Transaksi lain: masuk menambah saldo, keluar mengurangi saldo.
function saldoDelta(t) {
  if (t.tipe === 'keluar') return -Number(t.jumlah) || 0;
  if (t.tipe === 'masuk' && t.kategori === 'masuk-fee') return -(Number(t.jumlah) || 0);
  return Number(t.jumlah) || 0;
}

/* ---------- Perhitungan (selalu dari sumber asli, dihitung ulang) ---------- */
function computeRunningBalances() {
  const sorted = getTransactions();
  let saldo = Number(state.settings.saldoAwal) || 0;
  return sorted.map(t => {
    saldo += saldoDelta(t);
    return { txn: t, saldo };
  });
}

function getCurrentBalance() {
  const rows = computeRunningBalances();
  return rows.length ? rows[rows.length - 1].saldo : (Number(state.settings.saldoAwal) || 0);
}

function saldoBefore(dateStr) {
  const rows = computeRunningBalances();
  let saldo = Number(state.settings.saldoAwal) || 0;
  for (const r of rows) {
    if (r.txn.tanggal >= dateStr) break;
    saldo += saldoDelta(r.txn);
  }
  return saldo;
}

/* ---------- Rekening koran: kelompok per UPTD & per bulan ---------- */
// Setiap UPTD dianggap "rekening" terpisah dengan saldo berjalan sendiri.
// Transaksi tanpa UPTD (Modal, Fee, Penarikan, dsb.) masuk grup "Tanpa UPTD / Umum".
// Fee MENGURANGI saldo kas (saldoDelta negatif) namun TIDAK dihitung sebagai
// pemasukan bulan (m.masuk) agar ringkasan masuk/keluar tetap konsisten.
function groupByUptdAndMonth(transactions) {
  const groups = [];
  const index = {}; // key -> group

  const getGroup = (key, label) => {
    if (!index[key]) {
      const g = { key, label, months: [] };
      groups.push(g);
      index[key] = g;
    }
    return index[key];
  };
  const getMonth = (group, mk) => {
    let m = group.months.find(x => x.key === mk);
    if (!m) {
      m = { key: mk, saldoAwal: 0, masuk: 0, keluar: 0, saldoAkhir: 0, rows: [] };
      group.months.push(m);
    }
    return m;
  };

  // Urutkan transaksi sesuai tanggal (naik) untuk saldo berjalan
  const sorted = transactions.slice().sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.id.localeCompare(b.id));
  // Saldo awal tiap UPTD = saldoAwal global (rekening dimulai dari kas awal)
  const saldoAwalGlobal = Number(state.settings.saldoAwal) || 0;
  const saldoPerUptd = {};

  for (const t of sorted) {
    const key = t.uptd || '__umum__';
    const label = t.uptd ? uptdLabel(t.uptd) : 'Tanpa UPTD / Umum';
    const group = getGroup(key, label);
    const mk = monthKey(t.tanggal);
    const m = getMonth(group, mk);

    if (!(key in saldoPerUptd)) saldoPerUptd[key] = saldoAwalGlobal;
    const saldoSebelum = saldoPerUptd[key];

    const delta = saldoDelta(t);
    saldoPerUptd[key] += delta;
    if (delta !== 0) {
      if (t.tipe === 'masuk' && t.kategori !== 'masuk-fee') m.masuk += t.jumlah;
      else if (t.tipe === 'keluar') m.keluar += t.jumlah;
      // Fee: mengurangi saldo kas → angkanya tampil juga di kolom Kredit.
      else if (t.tipe === 'masuk' && t.kategori === 'masuk-fee') m.keluar += t.jumlah;
    }
    m.saldoAkhir = saldoPerUptd[key];
    m.rows.push({ txn: t, saldo: saldoPerUptd[key], saldoSebelum });
  }

  // Sortir group: UPTD berlabel dulu (debong, barat), grup umum terakhir
  groups.sort((a, b) => {
    if (a.key === '__umum__') return 1;
    if (b.key === '__umum__') return -1;
    return a.label.localeCompare(b.label);
  });
  // Sortir bulan: kronologis naik (Januari → Desember) agar saldo berjalan bernilai
  for (const g of groups) {
    g.months.sort((a, b) => a.key.localeCompare(b.key));
    // saldoAwal bulan = saldoAkhir bulan sebelumnya (atau saldo awal rekening)
    let prevSaldo = saldoAwalGlobal;
    for (const m of g.months) {
      if (m.rows.length) m.saldoAwal = prevSaldo;
      prevSaldo = m.saldoAkhir;
    }
  }
  return groups;
}

/* ---------- Agregasi per bulan ---------- */
function monthKey(dateStr) { return (dateStr || '').slice(0, 7); }

function sumForMonth(monthKeyStr, tipe) {
  // "keluar" mencakup Fee: Fee mengurangi saldo kas (biaya jasa) sehingga
  // ringkasan masuk − keluar selalu sama dengan perubahan saldo kas aktual.
  return state.transactions
    .filter(t => {
      if (monthKey(t.tanggal) !== monthKeyStr) return false;
      if (tipe === 'keluar') return t.tipe === 'keluar' || (t.tipe === 'masuk' && t.kategori === 'masuk-fee');
      return t.tipe === 'masuk' && t.kategori !== 'masuk-fee';
    })
    .reduce((acc, t) => acc + t.jumlah, 0);
}

function sumForRange(from, to, tipe) {
  // Konsisten dengan sumForMonth: Fee termasuk pengeluaran (mengurangi kas).
  return state.transactions
    .filter(t => {
      if (t.tanggal < from || t.tanggal > to) return false;
      if (tipe === 'keluar') return t.tipe === 'keluar' || (t.tipe === 'masuk' && t.kategori === 'masuk-fee');
      return t.tipe === 'masuk' && t.kategori !== 'masuk-fee';
    })
    .reduce((acc, t) => acc + t.jumlah, 0);
}

function statsToday() {
  const today = new Date();
  const y = today.getFullYear(), m = String(today.getMonth() + 1).padStart(2, '0');
  const mk = `${y}-${m}`;
  const now = todayISOLocal();
  return {
    bulan: mk,
    masuk: sumForMonth(mk, 'masuk'),
    keluar: sumForMonth(mk, 'keluar'),
    masukHariIni: sumForRange(now, now, 'masuk'),
    keluarHariIni: sumForRange(now, now, 'keluar')
  };
}

function monthlySeries() {
  const byMonth = new Map();
  for (const mk of Object.keys(groupMonths())) {
    byMonth.set(mk, { masuk: 0, keluar: 0 });
  }
  for (const t of state.transactions) {
    const mk = monthKey(t.tanggal);
    if (!byMonth.has(mk)) byMonth.set(mk, { masuk: 0, keluar: 0 });
    const item = byMonth.get(mk);
    if (t.tipe === 'masuk' && t.kategori !== 'masuk-fee') item.masuk += t.jumlah;
    else if (t.tipe === 'keluar' || t.kategori === 'masuk-fee') item.keluar += t.jumlah;
  }
  const arr = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return arr.map(([key, v]) => ({ key, ...v }));
}

function groupMonths() {
  const map = {};
  for (const t of state.transactions) {
    const mk = monthKey(t.tanggal);
    if (!map[mk]) map[mk] = true;
  }
  const mkNow = monthKey(todayISOLocal());
  if (!map[mkNow]) map[mkNow] = true;
  return map;
}

function categoryTotals(tipe, monthKeyStr) {
  const totals = {};
  let grand = 0;
  const add = (id, amount) => {
    totals[id] = (totals[id] || 0) + amount;
    grand += amount;
  };
  for (const t of state.transactions) {
    if (monthKeyStr && monthKey(t.tanggal) !== monthKeyStr) continue;
    // Fee: pemasukan kategori 'masuk-fee' mengurangi kas → direkap sebagai
    // kategori pengeluaran (biaya jasa) agar total keluar = perubahan kas.
    if (tipe === 'keluar' && t.tipe === 'masuk' && t.kategori === 'masuk-fee') {
      add('__fee__', t.jumlah);
      continue;
    }
    if (t.tipe !== tipe) continue;
    // Fee tidak direkap sebagai pemasukan (nilainya tampil di kolom Keuntungan).
    if (tipe === 'masuk' && t.kategori === 'masuk-fee') continue;
    if (tipe === 'keluar' && t.kategori === 'keluar-gabungan') {
      // Pisahkan rekap Snack + Nasi Box agar konsisten dengan daftar transaksi.
      add('keluar-snack', hitungTotal(t.uptd, 'keluar-snack', t.qty));
      add('keluar-nasi', hitungTotal(t.uptd, 'keluar-nasi', t.qty_nasi));
      continue;
    }
    const key = t.kategori || '(tanpa kategori)';
    add(key, t.jumlah);
  }
  const arr = Object.entries(totals)
    .map(([id, total]) => ({ id, label: id === '__fee__' ? 'Fee' : getCategoryLabel(tipe, id), total }))
    .sort((a, b) => b.total - a.total);
  return { items: arr, grand };
}

/* ---------- Saldo awal & nama ---------- */
function updateSettings(patch) {
  const before = state.settings.saldoAwal;
  state.settings = { ...state.settings, ...patch };
  if ('saldoAwal' in patch) {
    const num = Number(patch.saldoAwal);
    state.settings.saldoAwal = Number.isFinite(num) && num > 0 ? Math.round(num) : 0;
  }
  saveState();
  return { changed: before !== state.settings.saldoAwal };
}

/* ---------- Kategori: tambah & hapus ---------- */
function addCategory(tipe, label) {
  const clean = (label || '').trim();
  if (!clean) return null;
  const list = state.categories[tipe];
  if (list.some(c => c.label.toLowerCase() === clean.toLowerCase())) return null;
  const cat = { id: uid(), label: clean, builtin: false };
  list.push(cat);
  saveState();
  return cat;
}

function deleteCategory(tipe, id) {
  const list = state.categories[tipe];
  const cat = list.find(c => c.id === id);
  if (!cat || cat.builtin) return false;
  const idx = list.indexOf(cat);
  list.splice(idx, 1);
  // transaksi yang memakai kategori ini direset ke kategori bawaan pertama
  const fallback = DEFAULT_CATEGORIES[tipe][0].id;
  for (const t of state.transactions) {
    if (t.tipe === tipe && t.kategori === id) t.kategori = fallback;
  }
  saveState();
  return true;
}

function buildCSV(transactions, includeBalance = true) {
  const rows = computeRunningBalances();
  const lines = [
    ['No', 'Tanggal', 'Tipe', 'Kategori', 'UPTD', 'Keterangan', 'Metode', 'Debit', 'Kredit', 'Keuntungan', ...(includeBalance ? ['Saldo'] : [])].join(';')
  ];
  const csvTxn = (t, i, saldo) => {
    const isFee = t.tipe === 'masuk' && t.kategori === 'masuk-fee';
    return [
      i + 1,
      t.tanggal,
      t.tipe === 'masuk' ? 'DEBIT' : 'KREDIT',
      getCategoryLabel(t.tipe, t.kategori),
      t.uptd ? uptdLabel(t.uptd) : '',
      t.keterangan.replace(/;/g, ','),
      t.metode,
      !isFee && t.tipe === 'masuk' ? t.jumlah : '',
      (t.tipe === 'keluar' || isFee) ? t.jumlah : '',
      isFee ? t.jumlah : '',
      saldo != null ? saldo : ''
    ].join(';');
  };
  if (!includeBalance) {
    // urutan sesuai filter, tanpa saldo
    transactions.forEach((t, i) => {
      lines.push(csvTxn(t, i));
    });
  } else {
    rows.forEach((r, i) => {
      lines.push(csvTxn(r.txn, i, r.saldo));
    });
  }
  return lines.join('\r\n');
}

async function importState(data) {
  const def = DEFAULT_STATE();
  state = {
    settings: { ...def.settings, ...(data.settings || {}) },
    categories: mergeCategories(def, data.categories),
    uptds: mergeUptds(data),
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
    profitWithdrawals: Array.isArray(data.profitWithdrawals)
      ? data.profitWithdrawals.map(migrateWd)
      : []
  };
  const saved = await saveState();
  if (!saved) throw new Error('cloud-save-failed');
  return state;
}

/* ---------- Kelola UPTD (Superadmin) ---------- */
function addUptd({ label, harga, profit }) {
  const clean = (label || '').trim();
  if (!clean) return { ok: false, error: 'Nama UPTD tidak boleh kosong.' };
  if (getUptdList().some(u => u.label.toLowerCase() === clean.toLowerCase())) {
    return { ok: false, error: 'Nama UPTD sudah ada.' };
  }
  const u = {
    id: uid(),
    label: clean,
    harga: {
      snack: satuan(harga, 'snack'),
      nasi: satuan(harga, 'nasi'),
      prasmanan: satuan(harga, 'prasmanan')
    },
    profit: {
      snack: satuan(profit, 'snack'),
      nasi: satuan(profit, 'nasi'),
      prasmanan: satuan(profit, 'prasmanan')
    }
  };
  state.uptds.push(u);
  saveState();
  return { ok: true, uptd: u };
}

function satuan(h, k) { return Math.max(0, Math.round(Number(h && h[k]) || 0)); }

function updateUptd(id, { label, harga, profit }) {
  const u = getUptdList().find(x => x.id === id);
  if (!u) return { ok: false, error: 'UPTD tidak ditemukan.' };
  const clean = (label || '').trim();
  if (!clean) return { ok: false, error: 'Nama UPTD tidak boleh kosong.' };
  const exists = getUptdList().some(x => x.id !== id && x.label.toLowerCase() === clean.toLowerCase());
  if (exists) return { ok: false, error: 'Nama UPTD sudah dipakai UPTD lain.' };
  u.label = clean;
  if (harga) {
    u.harga = { snack: satuan(harga, 'snack'), nasi: satuan(harga, 'nasi'), prasmanan: satuan(harga, 'prasmanan') };
  }
  if (profit) {
    u.profit = { snack: satuan(profit, 'snack'), nasi: satuan(profit, 'nasi'), prasmanan: satuan(profit, 'prasmanan') };
  }
  saveState();
  return { ok: true, uptd: u };
}

// Hapus UPTD hanya jika belum memiliki transaksi (menjaga integritas saldo/riwayat).
function removeUptd(id) {
  const u = getUptdList().find(x => x.id === id);
  if (!u) return { ok: false, error: 'UPTD tidak ditemukan.' };
  const dipakai = state.transactions.some(t => t.uptd === id);
  if (dipakai) {
    return { ok: false, error: `UPTD "${u.label}" masih dipakai ${state.transactions.filter(t => t.uptd === id).length} transaksi dan tidak bisa dihapus.` };
  }
  state.uptds = state.uptds.filter(x => x.id !== id);
  saveState();
  return { ok: true };
}

function resetAll() {
  state = DEFAULT_STATE();
  saveState();
}

function loadSampleData() {
  state = DEFAULT_STATE();
  state.settings = { namaUsaha: 'Amaris Catering', saldoAwal: 1500000 };
  const now = new Date();
  const y = now.getFullYear();
  const mk = (offset) => {
    const d = new Date(y, now.getMonth() - offset, 15);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const sample = [
    // ===== Pemasukan (Debit) =====
    { tanggal: day(20), tipe: 'masuk', kategori: 'masuk-modal', keterangan: 'Modal awal usaha katering', metode: 'Tunai', jumlah: 5000000 },
    { tanggal: day(18), tipe: 'masuk', kategori: 'masuk-pembayaran', keterangan: 'Pembayaran pesanan nasi box — UPTD Debong Lor', metode: 'Transfer Bank', jumlah: 500000 },
    { tanggal: day(9), tipe: 'masuk', kategori: 'masuk-pembayaran', keterangan: 'Pembayaran pesanan snack — UPTD Tegal Barat', metode: 'QRIS / E-Wallet', jumlah: 390000 },
    { tanggal: day(5), tipe: 'masuk', kategori: 'masuk-pembayaran', keterangan: 'Pembayaran pesanan tambahan', metode: 'Tunai', jumlah: 150000 },
    // bulan lalu
    { tanggal: mk(1) + '-02', tipe: 'masuk', kategori: 'masuk-pembayaran', keterangan: 'Pembayaran snack 100 box — UPTD Debong Lor', metode: 'Transfer Bank', jumlah: 1100000 },
    { tanggal: mk(1) + '-18', tipe: 'masuk', kategori: 'masuk-pembayaran', keterangan: 'Pembayaran prasmanan acara — UPTD Debong Lor', metode: 'Transfer Bank', jumlah: 5000000 },
    // ===== Pengeluaran (Kredit) UPTD: total = qty × harga satuan =====
    { tanggal: day(15), tipe: 'keluar', kategori: 'keluar-snack', keterangan: 'Snack 20 box — UPTD Puskesmas Debong Lor', metode: 'Tunai', qty: 20, uptd: 'debong', jumlah: 20 * 11000 },
    { tanggal: day(12), tipe: 'keluar', kategori: 'keluar-nasi', keterangan: 'Nasi box 10 pcs — UPTD Puskesmas Debong Lor', metode: 'Transfer Bank', qty: 10, uptd: 'debong', jumlah: 10 * 25000 },
    { tanggal: day(7), tipe: 'keluar', kategori: 'keluar-snack', keterangan: 'Snack 30 box — UPTD Puskesmas Tegal Barat', metode: 'Tunai', qty: 30, uptd: 'barat', jumlah: 30 * 13000 },
    { tanggal: day(3), tipe: 'keluar', kategori: 'keluar-nasi', keterangan: 'Nasi box 15 pcs — UPTD Puskesmas Tegal Barat', metode: 'QRIS / E-Wallet', qty: 15, uptd: 'barat', jumlah: 15 * 25000 },
    { tanggal: day(1), tipe: 'keluar', kategori: 'keluar-prasmanan', keterangan: 'Prasmanan 50 porsi — UPTD Puskesmas Debong Lor (belum ada keuntungan)', metode: 'Transfer Bank', qty: 50, uptd: 'debong', jumlah: 50 * 0 },
    // gabungan: Snack + Nasi Box (satu transaksi, dua item)
    { tanggal: day(0), tipe: 'keluar', kategori: 'keluar-gabungan', keterangan: 'Paket Snack 10 + Nasi Box 5 — UPTD Puskesmas Debong Lor', metode: 'Transfer Bank', qty: 10, qty_nasi: 5, uptd: 'debong', jumlah: 10 * 11000 + 5 * 25000 }
  ];
  for (const s of sample) {
    state.transactions.push({
      id: uid(), tanggal: s.tanggal, tipe: s.tipe, kategori: s.kategori,
      keterangan: s.keterangan, metode: s.metode, jumlah: s.jumlah,
      uptd: s.uptd || '', qty: s.qty || 0, qty_nasi: s.qty_nasi || 0
    });
  }
  saveState();
}

/* ---------- Validasi kecil ---------- */
function tanggapValidate(dateStr) {
  if (!dateStr) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr + 'T00:00:00');
  return !isNaN(d.getTime());
}
