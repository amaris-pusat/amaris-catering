/* ============================================================
   AMARIS CATERING — Aplikasi utama (perangkai seluruh modul)
   ============================================================ */
'use strict';

const PAGE_SIZE = 15;
let kasFilter = { search: '', tipe: '', uptd: '', kategori: '', dari: '', sampai: '' };
let kasPage = 1;
let editingId = null;

/* ================= INISIALISASI ================= */
document.addEventListener('DOMContentLoaded', async () => {
  const applyAuthUI = initAuth();
  try {
    await initAuthSession();
    await initData();
  } catch (e) {
    console.error('Gagal memuat sesi/data awal:', e);
  }
  initNav();
  initButtons();
  initTxnModal();
  initKatManagement();
  initSettingsForm();
  initBackup();
  initLaporanControls();
  initProfitControls();
  initProfitCairkan();
  initUptdAkunControls();
  setInterval(updateTopDate, 1000);
  await applyAuthUI();
});

/* ================= AUTENTIKASI & PERAN ================= */
function initAuth() {
  const form = document.getElementById('login-form');
  const errBox = document.getElementById('login-error');
  const userEl = document.getElementById('login-username');
  const passEl = document.getElementById('login-password');

  const applyAuthUI = async () => {
    const session = cachedSession();
    const userBox = document.getElementById('sidebar-user');
    if (session) {
      document.body.classList.add('logged-in');
      document.body.classList.toggle('role-uptd', session.role === 'uptd');
      userBox.hidden = false;
      userBox.innerHTML = `<b>${escapeHtml(session.name)}</b><span>${session.role === 'uptd' ? 'Lihat saja' : 'Superadmin'}</span>`;
      if (session.role === 'uptd') {
        // Akun UPTD hanya melihat Daftar Transaksi milik UPTD-nya.
        setActiveNav('kas');
        kasPage = 1;
        kasFilter = { search: '', tipe: '', uptd: currentUptdId(), kategori: '', dari: '', sampai: '' };
        refreshKasControls();
      } else {
        const saved = sessionStorage.getItem('amaris-page');
        if (saved && document.getElementById('page-' + saved)) setActiveNav(saved);
      }
      renderAll();
    } else {
      document.body.classList.remove('logged-in', 'role-uptd');
      userBox.hidden = true;
      userBox.innerHTML = '';
      closeAllModals();
    }
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.hidden = true;
    const submit = document.getElementById('login-submit');
    submit.disabled = true;
    try {
      const session = await login(userEl.value, passEl.value);
      if (!session) {
        errBox.textContent = 'Username atau password salah. Silakan coba lagi.';
        errBox.hidden = false;
        passEl.value = '';
        passEl.focus();
        return;
      }
      passEl.value = '';
      await initData();
      await applyAuthUI();
    } catch (err) {
      errBox.textContent = 'Tidak dapat terhubung ke server login.';
      errBox.hidden = false;
    } finally {
      submit.disabled = false;
    }
  });

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await logout();
    userEl.value = '';
    passEl.value = '';
    await applyAuthUI();
  });

  return applyAuthUI;
}

/* ================= NAVIGASI ================= */
function initNav() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      if (isUptdUser() && btn.dataset.page !== 'kas') {
        toast('⚠️ Akun UPTD hanya dapat membuka Daftar Transaksi.', 'err');
        return;
      }
      setActiveNav(btn.dataset.page);
      if (btn.dataset.page === 'kas') kasPage = 1;
      if (btn.dataset.page === 'kas') { kasFilter = { search: '', tipe: '', uptd: isUptdUser() ? currentUptdId() : '', kategori: '', dari: '', sampai: '' }; refreshKasControls(); }
      renderAll();
    });
  });

  document.getElementById('btn-go-kas').addEventListener('click', () => {
    setActiveNav('kas');
    kasPage = 1;
    kasFilter = { search: '', tipe: '', uptd: isUptdUser() ? currentUptdId() : '', kategori: '', dari: '', sampai: '' };
    refreshKasControls();
    renderAll();
  });

  document.getElementById('btn-dash-lihat-kas').addEventListener('click', () => {
    setActiveNav('kas');
    renderAll();
  });

  document.getElementById('btn-help').addEventListener('click', () => openModal('modal-help'));
}

/* ================= TOMBOL UMUM ================= */
function initButtons() {
  document.getElementById('btn-add-transaksi-2').addEventListener('click', () => openTxnModal('masuk'));

  document.querySelectorAll('[data-open-txn]').forEach(btn => {
    btn.addEventListener('click', () => openTxnModal(btn.dataset.openTxn === 'transaksi' ? 'masuk' : btn.dataset.openTxn));
  });

  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeAllModals());
  });

  // kontrol transaksi
  const search = document.getElementById('kas-search');
  let debounceTimer = null;
  search.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      kasFilter.search = search.value.trim().toLowerCase();
      kasPage = 1;
      renderKas();
    }, 220);
  });

  document.getElementById('kas-filter-tipe').addEventListener('change', (e) => {
    kasFilter.tipe = e.target.value;
    kasPage = 1;
    renderKas();
  });

  document.getElementById('kas-filter-uptd').addEventListener('change', (e) => {
    kasFilter.uptd = e.target.value;
    kasPage = 1;
    renderKas();
  });

  document.getElementById('kas-filter-kategori').addEventListener('change', (e) => {
    kasFilter.kategori = e.target.value;
    kasPage = 1;
    renderKas();
  });

  document.getElementById('kas-filter-dari').addEventListener('change', (e) => {
    kasFilter.dari = e.target.value;
    kasPage = 1;
    renderKas();
  });

  document.getElementById('kas-filter-sampai').addEventListener('change', (e) => {
    kasFilter.sampai = e.target.value;
    kasPage = 1;
    renderKas();
  });

  document.getElementById('btn-kas-reset').addEventListener('click', () => {
    kasFilter = { search: '', tipe: '', uptd: isUptdUser() ? currentUptdId() : '', kategori: '', dari: '', sampai: '' };
    refreshKasControls();
    kasPage = 1;
    renderAll();
  });

  document.getElementById('kas-prev').addEventListener('click', () => {
    if (kasPage > 1) { kasPage -= 1; renderKas(); }
  });
  document.getElementById('kas-next').addEventListener('click', () => {
    if (kasPage < totalKasPages()) { kasPage += 1; renderKas(); }
  });

  document.getElementById('btn-kas-csv').addEventListener('click', () => exportKasCSV(false));
  document.getElementById('btn-kas-print').addEventListener('click', () => {
    if (isUptdUser()) { toast('⚠️ Akun UPTD tidak memiliki akses mencetak.', 'err'); return; }
    const name = (getState().settings.namaUsaha || 'Amaris Catering').toUpperCase();
    document.getElementById('print-name').textContent = name;
    window.print();
  });

  document.getElementById('btn-laporan-csv').addEventListener('click', () => exportLaporanCSV());
  document.getElementById('btn-laporan-print').addEventListener('click', () => {
    const name = (getState().settings.namaUsaha || 'Amaris Catering').toUpperCase();
    document.getElementById('print-name-lap').textContent = name;
    const month = document.getElementById('laporan-month').value;
    document.getElementById('print-month-lap').textContent = formatBulanKey(month);
    window.print();
  });
}

/* ================= MODAL TRANSAKSI ================= */
function refreshKasControls() {
  // Dropdown filter UPTD diisi dinamis dari daftar UPTD (admin hanya; UPTD disembunyikan CSS)
  const filterUptd = document.getElementById('kas-filter-uptd');
  if (filterUptd) {
    filterUptd.innerHTML = ['<option value="">Semua UPTD</option>']
      .concat(getUptdList().map(u => `<option value="${u.id}">${escapeHtml(u.label)}</option>`))
      .join('');
    filterUptd.value = kasFilter.uptd;
  }
  document.getElementById('kas-search').value = kasFilter.search;
  document.getElementById('kas-filter-tipe').value = kasFilter.tipe;
  document.getElementById('kas-filter-kategori').value = kasFilter.kategori;
  document.getElementById('kas-filter-dari').value = kasFilter.dari;
  document.getElementById('kas-filter-sampai').value = kasFilter.sampai;
}

function setTxnMode() {
  const isKeluar = document.getElementById('txn-keluar').checked;
  document.getElementById('txn-masuk-fields').hidden = isKeluar;
  document.getElementById('txn-keluar-fields').hidden = !isKeluar;
  if (isKeluar) calculateTxnTotal();
}

function getTxnTipe() {
  return document.getElementById('txn-keluar').checked ? 'keluar' : 'masuk';
}

function populateTxnKategori(selectedId) {
  const tipe = getTxnTipe();
  const s = getState();
  const sel = document.getElementById(tipe === 'masuk' ? 'txn-kategori' : 'txn-keluar-kategori');

  let cats = s.categories[tipe];
  // Kategori pengeluaran dibatasi: hanya Snack, Nasi Box, Prasmanan, dan Penarikan.
  if (tipe === 'keluar') {
    const allowed = ['keluar-snack', 'keluar-nasi', 'keluar-gabungan', 'keluar-prasmanan', 'keluar-penarikan'];
    cats = cats.filter(c => allowed.includes(c.id));
  }

  const opts = cats.map(c =>
    `<option value="${c.id}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.label)}</option>`
  ).join('');
  sel.innerHTML = opts;
  if (!selectedId && cats.length) sel.value = cats[0].id;
  // Tampilkan hint khusus untuk kategori Fee (pemasukan): mengurangi saldo, menambah keuntungan.
  const feeHint = document.getElementById('txn-masuk-fee-hint');
  if (feeHint) feeHint.hidden = !(tipe === 'masuk' && sel.value === 'masuk-fee');
  updateKreditFieldsMode();
}

function populateTxnMetode(selected) {
  const sel = document.getElementById('txn-metode');
  sel.innerHTML = METHODS.map(m => `<option value="${m}" ${m === selected ? 'selected' : ''}>${m}</option>`).join('');
  const sel2 = document.getElementById('txn-keluar-metode');
  sel2.innerHTML = METHODS.map(m => `<option value="${m}" ${m === selected ? 'selected' : ''}>${m}</option>`).join('');
}

function populateTxnUptd(selected) {
  const opts = ['<option value="">— Pilih UPTD —</option>']
    .concat(getUptdList().map(u => `<option value="${u.id}" ${u.id === selected ? 'selected' : ''}>${u.label}</option>`))
    .join('');
  const selKeluar = document.getElementById('txn-uptd');
  if (selKeluar) selKeluar.innerHTML = opts;
  const selMasuk = document.getElementById('txn-masuk-uptd');
  if (selMasuk) selMasuk.innerHTML = opts;
}

// Tampilkan/sembunyikan field sesuai kategori pengeluaran:
// Penarikan → input nominal manual (tanpa UPTD/Qty); lainnya → UPTD + Qty + total otomatis.
// Snack + Nasi Box → dua input qty (Snack & Nasi Box).
function updateKreditFieldsMode() {
  const kat = document.getElementById('txn-keluar-kategori').value;
  const penarikan = kat === 'keluar-penarikan';
  const gabungan = kat === 'keluar-gabungan';
  const qtyField = document.getElementById('txn-qty-field');
  const qtyNasiField = document.getElementById('txn-qty-nasi-field');
  const manualField = document.getElementById('txn-keluar-jumlah-field');
  const totalField = document.getElementById('txn-keluar-total-field');
  const hint = document.getElementById('txn-harga-info');
  const qtyLabel = document.getElementById('txn-qty-label');

  // UPTD selalu tampil untuk semua kategori pengeluaran (termasuk Penarikan)
  if (qtyField) qtyField.hidden = penarikan;
  if (qtyNasiField) qtyNasiField.hidden = !gabungan;
  if (qtyLabel) qtyLabel.textContent = gabungan ? 'Jumlah Qty Snack' : 'Jumlah Qty';
  if (manualField) manualField.hidden = !penarikan;
  if (totalField) totalField.hidden = penarikan;
  if (hint) hint.textContent = penarikan
    ? 'Penarikan: masukkan jumlah nominal langsung.'
    : (gabungan
      ? 'Pilih UPTD: harga Snack & Nasi Box dihitung otomatis dari kedua qty.'
      : 'Pilih UPTD dan Kategori untuk melihat harga & keuntungan otomatis.');
}

function calculateTxnTotal() {
  const kat = document.getElementById('txn-keluar-kategori').value;
  updateKreditFieldsMode();

  if (kat === 'keluar-penarikan') return;

  const uptd = document.getElementById('txn-uptd').value;
  const qty = Math.max(0, Math.round(Number(document.getElementById('txn-qty').value) || 0));
  const qtyNasi = Math.max(0, Math.round(Number(document.getElementById('txn-qty-nasi').value) || 0));
  const total = hitungTotal(uptd, kat, qty, qtyNasi);
  document.getElementById('txn-keluar-jumlah').value = total ? formatRupiah(total) : '';

  const hint = document.getElementById('txn-harga-info');
  if (hint) {
    if (!uptd || !kat) {
      hint.textContent = 'Pilih UPTD dan Kategori untuk melihat harga & keuntungan otomatis.';
    } else if (kat === 'keluar-gabungan') {
      const hS = hargaSatuan(uptd, 'keluar-snack');
      const hN = hargaSatuan(uptd, 'keluar-nasi');
      const pS = profitSatuan(uptd, 'keluar-snack');
      const pN = profitSatuan(uptd, 'keluar-nasi');
      hint.textContent = `${uptdLabel(uptd)} · Snack Rp ${hS.toLocaleString('id-ID')}/porsi (profit Rp ${pS.toLocaleString('id-ID')}) · Nasi Box Rp ${hN.toLocaleString('id-ID')}/porsi (profit Rp ${pN.toLocaleString('id-ID')})`;
    } else {
      const h = hargaSatuan(uptd, kat);
      const p = profitSatuan(uptd, kat);
      const satuan = p > 0 ? ` · Keuntungan Rp ${p.toLocaleString('id-ID')}/porsi` : ' · Belum ada keuntungan untuk Prasmanan';
      hint.textContent = `${uptdLabel(uptd)} · Rp ${h.toLocaleString('id-ID')}/porsi${satuan}`;
    }
  }
}

function initTxnModal() {
  const radios = document.querySelectorAll('input[name="txn-tipe"]');
  radios.forEach(r => r.addEventListener('change', () => {
    setTxnMode();
    populateTxnKategori(editingId ? getState().transactions.find(t => t.id === editingId)?.kategori : '');
  }));

  attachUangInput(document.getElementById('txn-jumlah'));
  attachUangInput(document.getElementById('txn-keluar-jumlah-manual'));

  document.getElementById('txn-uptd').addEventListener('change', calculateTxnTotal);
  document.getElementById('txn-keluar-kategori').addEventListener('change', calculateTxnTotal);
  document.getElementById('txn-qty').addEventListener('input', calculateTxnTotal);
  document.getElementById('txn-qty-nasi').addEventListener('input', calculateTxnTotal);

  // Hint Fee pada form pemasukan: tampil saat kategori Fee dipilih
  document.getElementById('txn-kategori').addEventListener('change', () => {
    const feeHint = document.getElementById('txn-masuk-fee-hint');
    if (feeHint) feeHint.hidden = document.getElementById('txn-kategori').value !== 'masuk-fee';
  });

  document.getElementById('txn-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const tipe = getTxnTipe();

    if (tipe === 'masuk') {
      const tanggal = document.getElementById('txn-tanggal').value;
      const kategori = document.getElementById('txn-kategori').value;
      const keterangan = document.getElementById('txn-keterangan').value.trim();
      const metode = document.getElementById('txn-metode').value || 'Transfer Bank';
      const jumlah = uangInputToNumber(document.getElementById('txn-jumlah'));
      const uptd = document.getElementById('txn-masuk-uptd').value;
      const errors = [];
      if (!tanggapValidate(tanggal)) errors.push('Tanggal belum valid.');
      if (!keterangan) errors.push('Keterangan wajib diisi.');
      if (!kategori) errors.push('Pilih kategori.');
      if (!(jumlah > 0)) errors.push('Total harus lebih dari 0.');
      if (errors.length) { toast('❌ ' + errors.join(' '), 'err'); return; }

      if (editingId) {
        updateTransaction(editingId, { tanggal, tipe, kategori, keterangan, metode, jumlah, uptd });
        toast('Transaksi berhasil diperbarui.');
      } else {
        addTransaction({ tanggal, tipe, kategori, keterangan, metode, jumlah, uptd });
        toast(`✅ Pemasukan ${formatRupiah(jumlah)} dicatat.`);
      }
    } else {
      const tanggal = document.getElementById('txn-keluar-tanggal').value;
      const kategori = document.getElementById('txn-keluar-kategori').value;
      const keterangan = document.getElementById('txn-keluar-keterangan').value.trim();
      const metode = document.getElementById('txn-keluar-metode').value || 'Transfer Bank';
      const penarikan = kategori === 'keluar-penarikan';

      let uptd = document.getElementById('txn-uptd').value;
      let qty = 0, qtyNasi = 0, jumlah = 0;
      if (penarikan) {
        jumlah = uangInputToNumber(document.getElementById('txn-keluar-jumlah-manual'));
      } else {
        qty = Math.max(0, Math.round(Number(document.getElementById('txn-qty').value) || 0));
        if (kategori === 'keluar-gabungan') {
          qtyNasi = Math.max(0, Math.round(Number(document.getElementById('txn-qty-nasi').value) || 0));
        }
        jumlah = hitungTotal(uptd, kategori, qty, qtyNasi);
      }

      const errors = [];
      if (!uptd) errors.push('Pilih UPTD.');
      if (!tanggapValidate(tanggal)) errors.push('Tanggal belum valid.');
      if (!keterangan) errors.push('Keterangan wajib diisi.');
      if (!kategori) errors.push('Pilih kategori.');
      if (penarikan && !(jumlah > 0)) errors.push('Jumlah nominal harus lebih dari 0.');
      if (!penarikan && !(qty > 0)) errors.push('Jumlah Qty harus lebih dari 0.');
      if (kategori === 'keluar-gabungan' && !(qtyNasi > 0)) errors.push('Jumlah Qty Nasi Box harus lebih dari 0.');
      if (errors.length) { toast('❌ ' + errors.join(' '), 'err'); return; }

      const payload = { tanggal, tipe, kategori, keterangan, metode, jumlah, uptd, qty, qty_nasi: qtyNasi };
      if (editingId) {
        updateTransaction(editingId, payload);
        toast('Transaksi berhasil diperbarui.');
      } else {
        addTransaction(payload);
        toast(penarikan
          ? `✅ Penarikan ${formatRupiah(jumlah)} dicatat.`
          : `✅ Pengeluaran ${formatRupiah(jumlah)} (${qty} porsi) dicatat.`);
      }
    }
    closeModal('modal-txn');
    renderAll();
  });
}

function populateKatFilter() {
  const sel = document.getElementById('kas-filter-kategori');
  const current = sel.value;
  const s = getState();
  const opts = ['<option value="">Semua kategori</option>'];
  for (const tipe of ['masuk', 'keluar']) {
    const cats = s.categories[tipe];
    opts.push(`<optgroup label="${tipe === 'masuk' ? 'Pemasukan' : 'Pengeluaran'}">`);
    for (const c of cats) {
      opts.push(`<option value="${c.id}" ${c.id === current ? 'selected' : ''}>${escapeHtml(c.label)}</option>`);
    }
    opts.push('</optgroup>');
  }
  sel.innerHTML = opts.join('');
}

function openTxnModal(tipe) {
  if (isUptdUser()) {
    toast('⚠️ Akun UPTD tidak memiliki akses menambah transaksi.', 'err');
    return;
  }
  editingId = null;
  const form = document.getElementById('txn-form');
  form.reset();
  const radio = document.getElementById('txn-' + (tipe || 'masuk'));
  radio.checked = true;
  document.getElementById('txn-tanggal').value = todayISO();
  document.getElementById('txn-keluar-tanggal').value = todayISO();
  document.getElementById('txn-jumlah').value = '';
  document.getElementById('txn-keluar-jumlah').value = '';
  document.getElementById('txn-keluar-jumlah-manual').value = '';
  document.getElementById('txn-qty-nasi').value = '';
  document.getElementById('txn-title').textContent = 'Tambah Transaksi';
  document.getElementById('btn-txn-save').textContent = 'Simpan Transaksi';
  populateTxnKategori('');
  populateTxnMetode('Transfer Bank');
  populateTxnUptd('');
  setTxnMode();
  openModal('modal-txn');
  setTimeout(() => document.getElementById('txn-keterangan').focus(), 100);
}

function openEditTxn(id) {
  if (isUptdUser()) {
    toast('⚠️ Akun UPTD tidak memiliki akses mengubah transaksi.', 'err');
    return;
  }
  const s = getState();
  const t = s.transactions.find(x => x.id === id);
  if (!t) return;
  editingId = id;
  document.getElementById('txn-title').textContent = 'Ubah Transaksi';
  document.getElementById('btn-txn-save').textContent = 'Simpan Perubahan';
  const radio = document.getElementById('txn-' + t.tipe);
  radio.checked = true;
  document.getElementById('txn-tanggal').value = t.tanggal;
  document.getElementById('txn-keterangan').value = t.keterangan;
  document.getElementById('txn-jumlah').value = t.jumlah ? Number(t.jumlah).toLocaleString('id-ID') : '';
  document.getElementById('txn-keluar-tanggal').value = t.tanggal;
  document.getElementById('txn-keluar-keterangan').value = t.keterangan;
  document.getElementById('txn-qty').value = t.qty || 1;
  document.getElementById('txn-qty-nasi').value = t.qty_nasi || '';
  document.getElementById('txn-keluar-jumlah').value = t.jumlah ? formatRupiah(t.jumlah) : '';
  populateTxnKategori(t.kategori);
  populateTxnMetode(t.metode);
  populateTxnUptd(t.uptd || '');
  // Pastikan dropdown UPTD pemasukan ikut terisi saat mengedit transaksi masuk
  const masukUptd = document.getElementById('txn-masuk-uptd');
  if (masukUptd) masukUptd.value = t.uptd || '';
  setTxnMode();
  updateKreditFieldsMode();
  // Isi nilai manual SETELAH mode field diterapkan, agar tidak terhapus
  if (t.kategori === 'keluar-penarikan') {
    const manualEl = document.getElementById('txn-keluar-jumlah-manual');
    if (manualEl) {
      manualEl.value = t.jumlah ? Number(t.jumlah).toLocaleString('id-ID') : '';
      if (typeof attachUangInput === 'function') attachUangInput(manualEl);
    }
  }
  openModal('modal-txn');
}


/* ================= BUKU KAS ================= */
function filteredTransactions() {
  const all = getTransactions();
  const scopeUptd = isUptdUser() ? currentUptdId() : '';
  return all.filter(t => {
    if (scopeUptd && t.uptd !== scopeUptd) return false;
    if (kasFilter.tipe && t.tipe !== kasFilter.tipe) return false;
    if (kasFilter.uptd && t.uptd !== kasFilter.uptd) return false;
    if (kasFilter.kategori && t.kategori !== kasFilter.kategori) return false;
    if (kasFilter.dari && t.tanggal < kasFilter.dari) return false;
    if (kasFilter.sampai && t.tanggal > kasFilter.sampai) return false;
    if (kasFilter.search) {
      const hay = (t.keterangan + ' ' + getCategoryLabel(t.tipe, t.kategori) + ' ' + (t.metode || '') + ' ' + (uptdLabel(t.uptd) || '')).toLowerCase();
      if (!hay.includes(kasFilter.search)) return false;
    }
    return true;
  });
}

function totalKasPages() {
  const groups = groupByUptdAndMonth(filteredTransactions());
  let units = 0;
  for (const g of groups) units += g.months.length;
  return Math.max(1, Math.ceil(units / PAGE_SIZE));
}

function renderKas() {
  populateKatFilter();
  const limited = isUptdUser();
  const colSpan = limited ? 6 : 8;
  const filtered = filteredTransactions();
  const groups = groupByUptdAndMonth(filtered);

  // Pagination berbasis unit bulan (grup UPTD × bulan) agar header tidak terpotong
  const units = [];
  for (const g of groups) {
    for (const m of g.months) units.push({ g, m });
  }
  const totalPages = Math.max(1, Math.ceil(units.length / PAGE_SIZE));
  if (kasPage > totalPages) kasPage = totalPages;
  const startIdx = (kasPage - 1) * PAGE_SIZE;
  const pageUnits = units.slice(startIdx, startIdx + PAGE_SIZE);

  const tbody = document.getElementById('kas-table-body');
  const emptyBox = document.getElementById('kas-empty');

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    emptyBox.hidden = false;
    const hasFilter = kasFilter.search || kasFilter.tipe || (limited ? '' : kasFilter.uptd) || kasFilter.kategori || kasFilter.dari || kasFilter.sampai;
    document.getElementById('kas-empty-title').textContent = hasFilter ? 'Tidak ada hasil' : 'Belum ada transaksi';
    document.getElementById('kas-empty-desc').textContent = hasFilter
      ? 'Coba ubah kata kunci atau filter yang digunakan.'
      : 'Catat pemasukan atau pengeluaran pertama Anda untuk mulai menghitung saldo.';
    document.querySelectorAll('.empty-actions').forEach(a => a.style.display = hasFilter ? 'none' : '');
    document.getElementById('kas-count').textContent = '0 transaksi';
    document.getElementById('kas-total-masuk').textContent = formatRupiahPlain(0);
    document.getElementById('kas-total-keluar').textContent = formatRupiahPlain(0);
    document.getElementById('kas-prev').disabled = true;
    document.getElementById('kas-next').disabled = true;
    document.getElementById('kas-page-info').style.display = 'none';
    return;
  }
  emptyBox.hidden = true;

  // Total dari baris yang tampil (Fee bukan pemasukan kas; tampil di kolom Kredit)
  const totIn = filtered.filter(t => t.tipe === 'masuk' && t.kategori !== 'masuk-fee').reduce((a, t) => a + t.jumlah, 0);
  const totOut = filtered.filter(t => t.tipe === 'keluar' || (t.tipe === 'masuk' && t.kategori === 'masuk-fee')).reduce((a, t) => a + t.jumlah, 0);

  // Bangun HTML: grup UPTD → header bulan collapsible → baris transaksi
  // Nomor urut (No) di-cut off per bulan: setiap header bulan mulai dari 1.
  const htmlParts = [];

  for (const g of groups) {
    const gUnits = pageUnits.filter(u => u.g === g);
    if (!gUnits.length) continue;
    let totalRows = 0;
    gUnits.forEach(u => totalRows += u.m.rows.length);

    htmlParts.push(`
      <tr class="koran-uptd-row">
        <td colspan="${colSpan}">
          <div class="koran-uptd">
            <div class="koran-uptd-name">${escapeHtml(g.label)}</div>
            <div class="koran-uptd-meta">${g.months.length} bulan · ${totalRows} transaksi</div>
          </div>
        </td>
      </tr>`);

      for (const { m } of gUnits) {
      const bulan = formatBulanKey(m.key);
      const mutasi = `${m.masuk > 0 ? 'Masuk ' + formatRupiah(m.masuk) : ''}${m.masuk > 0 && m.keluar > 0 ? ' · ' : ''}${m.keluar > 0 ? 'Keluar ' + formatRupiah(m.keluar) : ''}`;
      // Keuntungan di bulan itu (grup UPTD × bulan): qty × profit + Fee milik grup
      const profitBulan = m.rows.reduce((acc, r) => acc + keuntunganTxn(r.txn), 0);

      htmlParts.push(`
        <tr class="koran-month-row" data-month="${escapeHtml(m.key)}" data-group="${escapeHtml(g.key)}">
          <td colspan="${colSpan}">
            <button class="koran-month-toggle" type="button" aria-expanded="false">
              <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              <span class="koran-month-title">${bulan}</span>
              <span class="koran-month-mutasi">${mutasi || 'Tidak ada mutasi'}</span>
              ${limited ? '' : `<span class="koran-month-profit">Keuntungan ${formatRupiah(profitBulan)}</span>`}
              <span class="koran-month-saldo">Saldo akhir ${formatRupiah(m.saldoAkhir)}</span>
            </button>
          </td>
        </tr>
        <tr class="koran-month-body" data-month="${escapeHtml(m.key)}" data-group="${escapeHtml(g.key)}" hidden>
          <td colspan="${colSpan}">
            <div class="koran-month-list">`);

      // Baris transaksi (kronologis naik — dari tanggal terkecil ke terbesar)
      let no = 0; // nomor urut per bulan: mulai dari 1 di setiap header bulan
      for (const r of m.rows) {
        no++;
        const t = r.txn;
        const isFee = t.tipe === 'masuk' && t.kategori === 'masuk-fee';
        const badgeCls = isFee ? 'fee' : (t.tipe === 'masuk' ? 'in' : 'out');
        const badgeTxt = isFee ? 'Fee' : (t.tipe === 'masuk' ? 'Debit' : 'Kredit');
        const uptdStr = t.uptd ? ` · ${uptdLabel(t.uptd)}` : '';

        // Transaksi gabungan (Snack + Nasi Box) → 2 baris terpisah, masing-masing
        // mendapat nomor urut sendiri; saldo dihitung bertahap per item.
        if (t.tipe === 'keluar' && t.kategori === 'keluar-gabungan') {
          const qS = Number(t.qty) || 0;
          const qN = Number(t.qty_nasi) || 0;
          const hS = hargaSatuan(t.uptd, 'keluar-snack');
          const hN = hargaSatuan(t.uptd, 'keluar-nasi');
          const pS = profitSatuan(t.uptd, 'keluar-snack');
          const pN = profitSatuan(t.uptd, 'keluar-nasi');
          const jumS = qS * hS;
          const jumN = qN * hN;
          const profitS = qS * pS;
          const profitN = qN * pN;
          const sub = (jum, profit) => limited
            ? `
                <span class="num koran-debit"><span class="tx-amount pos">&ndash;</span></span>
                <span class="num koran-kredit"><span class="tx-amount neg">${formatRupiah(jum)}</span></span>`
            : `
                <span class="num koran-debit"><span class="tx-amount pos">&ndash;</span></span>
                <span class="num koran-kredit"><span class="tx-amount neg">${formatRupiah(jum)}</span></span>
                <span class="num koran-profit"><span class="profit-cell">${profit > 0 ? formatRupiah(profit) : '&ndash;'}</span></span>`;

          // Saldo bertahap: Snack mengurangi duluan, lalu Nasi Box (saldo akhir).
          const saldoAwalGab = (r.saldoSebelum != null) ? r.saldoSebelum : r.saldo + jumS + jumN;
          const saldoSnack = saldoAwalGab - jumS;
          const aksiGab = limited ? '' : `
                <span class="koran-aksi no-print">
                  <button class="btn-icon" data-edit="${t.id}" title="Ubah transaksi">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                  </button>
                  <button class="btn-icon danger" data-del="${t.id}" title="Hapus transaksi">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </span>`;

          // Baris 1: Snack — nomor sendiri & saldo setelah Snack
          htmlParts.push(`
              <div class="koran-item">
                <span class="num koran-no">${no}</span>
                <span class="num koran-tgl">${formatTanggalPendek(t.tanggal)}</span>
                <span class="koran-desc">
                  <span class="tx-badge ${badgeCls}">${badgeTxt}</span>
                  <span style="color:var(--text)">${escapeHtml(t.keterangan)}</span>
                  <span class="tx-kat">Snack${qS ? ' · ' + qS + ' porsi' : ''}${uptdStr}${t.metode ? ' · ' + escapeHtml(t.metode) : ''}</span>
                </span>
                ${sub(jumS, profitS)}
                <span class="num koran-saldo"><span class="tx-balance">${formatRupiah(saldoSnack)}</span></span>
                ${aksiGab}
              </div>`);
          // Baris 2: Nasi Box — nomor lanjutan & saldo akhir
          no++;
          htmlParts.push(`
              <div class="koran-item">
                <span class="num koran-no">${no}</span>
                <span class="num koran-tgl">${formatTanggalPendek(t.tanggal)}</span>
                <span class="koran-desc">
                  <span class="tx-badge ${badgeCls}">${badgeTxt}</span>
                  <span style="color:var(--text)">${escapeHtml(t.keterangan)}</span>
                  <span class="tx-kat">Nasi Box${qN ? ' · ' + qN + ' porsi' : ''}${uptdStr}${t.metode ? ' · ' + escapeHtml(t.metode) : ''}</span>
                </span>
                ${sub(jumN, profitN)}
                <span class="num koran-saldo"><span class="tx-balance">${formatRupiah(r.saldo)}</span></span>
                ${aksiGab}
              </div>`);
          continue;
        }

        const qtyLabel = t.tipe === 'keluar' && t.qty ? ` · ${t.qty} porsi` : '';
        const profit = keuntunganTxn(t);
        // Fee: mengurangi saldo & menambah keuntungan. Tampil di kolom Keuntungan
        // (bukan Debit) agar ringkasan masuk/keluar tidak terpengaruh.
        const debitHtml = isFee
          ? '&ndash;'
          : (t.tipe === 'masuk' ? formatRupiah(t.jumlah) : '&ndash;');
        // Fee: mengurangi saldo kas & menambah keuntungan → tampil di kolom
        // Kredit (Pengeluaran) DAN kolom Keuntungan.
        const kreditHtml = (t.tipe === 'keluar' || isFee) ? formatRupiah(t.jumlah) : '&ndash;';
        const profitHtml = isFee
          ? formatRupiah(t.jumlah)
          : (profit > 0 ? formatRupiah(profit) : '&ndash;');
        // Role UPTD: kolom Keuntungan & Aksi tidak dirender (data tidak masuk DOM).
        const profitSpan = limited ? '' : `<span class="num koran-profit"><span class="profit-cell">${profitHtml}</span></span>`;
        const aksiSpan = limited ? '' : `
              <span class="koran-aksi no-print">
                <button class="btn-icon" data-edit="${t.id}" title="Ubah transaksi">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                </button>
                <button class="btn-icon danger" data-del="${t.id}" title="Hapus transaksi">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </span>`;
        htmlParts.push(`
              <div class="koran-item">
                <span class="num koran-no">${no}</span>
                <span class="num koran-tgl">${formatTanggalPendek(t.tanggal)}</span>
                <span class="koran-desc">
                  <span class="tx-badge ${badgeCls}">${badgeTxt}</span>
                  <span style="color:var(--text)">${escapeHtml(t.keterangan)}</span>
                  <span class="tx-kat">${escapeHtml(getCategoryLabel(t.tipe, t.kategori))}${qtyLabel}${uptdStr}${t.metode ? ' · ' + escapeHtml(t.metode) : ''}</span>
                </span>
                <span class="num koran-debit"><span class="tx-amount pos">${debitHtml}</span></span>
                <span class="num koran-kredit"><span class="tx-amount neg">${kreditHtml}</span></span>
                ${profitSpan}
                <span class="num koran-saldo"><span class="tx-balance">${formatRupiah(r.saldo)}</span></span>
                ${aksiSpan}
              </div>`);
      }
      htmlParts.push(`
            </div>
          </td>
        </tr>`);
    }
  }

  tbody.innerHTML = htmlParts.join('');
  document.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openEditTxn(btn.dataset.edit));
  });
  document.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.del;
      const t = getState().transactions.find(x => x.id === id);
      showConfirm(
        `Hapus transaksi "${t ? t.keterangan : ''}" sebesar ${t ? formatRupiah(t.jumlah) : ''}? Saldo akan dihitung ulang otomatis.`,
        () => {
          deleteTransaction(id);
          toast('Transaksi dihapus. Saldo diperbarui.', 'err');
          renderAll();
        }
      );
    });
  });

  // Toggle bulan collapsible
  document.querySelectorAll('.koran-month-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const tr = btn.closest('tr.koran-month-row');
      const month = tr.dataset.month;
      const group = tr.dataset.group;
      const body = document.querySelector(`tr.koran-month-body[data-month="${month}"][data-group="${group}"]`);
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      if (body) body.hidden = expanded;
    });
  });

  document.getElementById('kas-count').textContent = filtered.length + ' transaksi';
  document.getElementById('kas-total-masuk').textContent = formatRupiahPlain(totIn);
  document.getElementById('kas-total-keluar').textContent = formatRupiahPlain(totOut);
  const pgInfo = document.getElementById('kas-page-info');
  if (totalPages > 1) {
    pgInfo.style.display = '';
    pgInfo.textContent = `Hal ${kasPage} dari ${totalPages}`;
    document.getElementById('kas-prev').disabled = kasPage <= 1;
    document.getElementById('kas-next').disabled = kasPage >= totalPages;
  } else {
    pgInfo.style.display = 'none';
    document.getElementById('kas-prev').disabled = true;
    document.getElementById('kas-next').disabled = true;
  }
}

function exportKasCSV(filteredOnly) {
  if (isUptdUser()) {
    toast('⚠️ Akun UPTD tidak memiliki akses ekspor data.', 'err');
    return;
  }
  const rows = filteredTransactions();
  const csv = filteredOnly ? buildCSV(rows, false) : buildCSV(rows, true);
  const s = getState();
  const stamp = todayISO();
  downloadFile(`buku-kas-${s.settings.namaUsaha.replace(/\s+/g, '-')}-${stamp}.csv`, csv, 'text/csv');
  toast('CSV buku kas berhasil diunduh.');
}

/* ================= DASHBOARD ================= */
function renderDashboard() {
  const s = getState();
  const balance = getCurrentBalance();
  const stats = statsToday();
  const monthKeyNow = currentMonthKey();

  // salam sesuai jam
  const hour = new Date().getHours();
  const greet = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 19 ? 'Selamat sore' : 'Selamat malam';
  document.getElementById('dash-greet').textContent = `${greet} 👋`;
  document.getElementById('dash-sub').textContent =
    `Selamat bekerja! Pemasukan hari ini ${formatRupiah(stats.masukHariIni)} dan pengeluaran ${formatRupiah(stats.keluarHariIni)}.`;

  document.getElementById('dash-saldo').textContent = formatRupiah(balance);
  document.getElementById('dash-masuk').textContent = formatRupiah(stats.masuk);
  document.getElementById('dash-keluar').textContent = formatRupiah(stats.keluar);
  document.getElementById('dash-laba').textContent = formatRupiah(stats.masuk - stats.keluar);
  document.getElementById('dash-laba').className = 'stat-value ' + (stats.masuk - stats.keluar >= 0 ? 'pos' : 'neg');

  const profit = keuntunganForMonth(monthKeyNow);
  document.getElementById('dash-profit').textContent = formatRupiah(profit);
  document.getElementById('dash-profit').className = 'stat-value ' + (profit >= 0 ? 'pos' : 'neg');

  const countIn = s.transactions.filter(t => t.tipe === 'masuk' && t.kategori !== 'masuk-fee' && monthKey(t.tanggal) === monthKeyNow).length;
  const countOut = s.transactions.filter(t => t.tipe === 'keluar' && monthKey(t.tanggal) === monthKeyNow).length;
  document.getElementById('dash-sub-masuk').textContent = countIn + ' transaksi';
  document.getElementById('dash-sub-keluar').textContent = countOut + ' transaksi';

  // barang 12 bulan
  const series = monthlySeries();
  document.getElementById('dash-chart-range').textContent =
    series.length ? `${formatBulanKey(series[Math.max(0, series.length - 12)].key)} — ${formatBulanKey(series[series.length - 1].key)}` : 'Belum ada data';
  renderBarChart('dash-bars', series);

  // donut pengeluaran bulan ini
  const katKeluar = categoryTotals('keluar', monthKeyNow);
  const el = document.getElementById('dash-donut');
  const legend = document.getElementById('dash-legend');
  el.innerHTML = '';
  legend.innerHTML = '';
  renderDonut('dash-donut', 'dash-legend', null, katKeluar.items, katKeluar.grand, formatRupiah(katKeluar.grand));
  document.getElementById('dash-donut-title').textContent = formatBulanKey(monthKeyNow);

  // Transaksi terbaru (5)
  const recent = getTransactions().slice(-5).reverse();
  const box = document.getElementById('dash-recent');
  if (recent.length === 0) {
    box.innerHTML = `<div class="empty-state" style="padding:28px">
      <div class="empty-emoji">📒</div>
      <p class="muted">Belum ada transaksi. Mulai catat pemasukan atau pengeluaran pertama Anda!</p>
    </div>`;
    return;
  }
  box.innerHTML = `
    <div class="table-scroll">
      <table class="kas-table">
        <thead><tr><th class="th-tgl">Tanggal</th><th>Keterangan</th><th class="num">Debit</th><th class="num">Kredit</th><th class="num">Keuntungan</th><th class="num">Saldo</th></tr></thead>
        <tbody>${recent.map(t => {
          const bal = computeRunningBalances().find(r => r.txn.id === t.id);
          const isFee = t.tipe === 'masuk' && t.kategori === 'masuk-fee';
          const profit = keuntunganTxn(t);
          return `<tr>
            <td class="num">${formatTanggalPendek(t.tanggal)}</td>
            <td><span class="tx-badge ${isFee ? 'fee' : (t.tipe === 'masuk' ? 'in' : 'out')}">${isFee ? 'Fee' : (t.tipe === 'masuk' ? 'Debit' : 'Kredit')}</span>
                <span style="color:var(--text)">${escapeHtml(t.keterangan)}</span>
                <span class="tx-kat">${escapeHtml(getCategoryLabel(t.tipe, t.kategori))}</span></td>
            <td class="num"><span class="tx-amount pos">${(!isFee && t.tipe === 'masuk') ? formatRupiah(t.jumlah) : '–'}</span></td>
            <td class="num"><span class="tx-amount neg">${(t.tipe === 'keluar' || isFee) ? formatRupiah(t.jumlah) : '–'}</span></td>
            <td class="num"><span class="profit-cell">${profit > 0 ? formatRupiah(profit) : '–'}</span></td>
            <td class="num tx-balance">${formatRupiah(bal ? bal.saldo : 0)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
}

function renderSidebar() {
  // Role UPTD: saldo global tidak dihitung & tidak masuk DOM.
  document.getElementById('side-saldo-value').textContent = isUptdUser() ? '—' : formatRupiah(getCurrentBalance());
  document.getElementById('brand-name').textContent = getState().settings.namaUsaha || 'Amaris Catering';
}

/* ================= KEUNTUNGAN (per UPTD) ================= */
function initProfitControls() {
  const monthInput = document.getElementById('profit-month');
  if (!monthInput) return;
  // Ambil bulan terakhir yang punya transaksi keluar, fallback ke bulan ini
  const s = getState();
  const months = s.transactions
    .filter(t => t.tipe === 'keluar')
    .map(t => monthKey(t.tanggal))
    .sort();
  monthInput.value = months.length ? months[months.length - 1] : currentMonthKey();
  monthInput.addEventListener('change', renderKeuntungan);
}

/* ================= CAIRKAN KEUNTUNGAN ================= */
function openProfitCairModal() {
  const tersedia = keuntunganTersedia();
  if (tersedia <= 0) {
    toast('❌ Belum ada keuntungan yang bisa dicairkan.', 'err');
    return;
  }
  document.getElementById('profit-cair-tanggal').value = todayISO();
  document.getElementById('profit-cair-jumlah').value = '';
  document.getElementById('profit-cair-keterangan').value = '';
  updateProfitCairInfo();
  openModal('modal-profit-cair');
  setTimeout(() => document.getElementById('profit-cair-jumlah').focus(), 100);
}

function updateProfitCairInfo() {
  const tersedia = keuntunganTersedia();
  const jumlah = uangInputToNumber(document.getElementById('profit-cair-jumlah'));
  document.getElementById('profit-cair-total').textContent = formatRupiah(tersedia);
  document.getElementById('profit-cair-sisa').textContent = formatRupiah(Math.max(0, tersedia - jumlah));
}

function initProfitCairkan() {
  // Modal pencairan bersifat statis; listener-nya selalu terpasang.
  const jumlahInput = document.getElementById('profit-cair-jumlah');
  attachUangInput(jumlahInput);
  jumlahInput.addEventListener('input', updateProfitCairInfo);
  document.getElementById('btn-profit-cair-save').addEventListener('click', () => {
    const tersedia = keuntunganTersedia();
    const jumlah = uangInputToNumber(jumlahInput);
    if (!(jumlah > 0)) {
      toast('❌ Masukkan jumlah yang akan dicairkan.', 'err');
      return;
    }
    if (jumlah > tersedia) {
      toast('❌ Jumlah melebihi keuntungan yang tersedia.', 'err');
      return;
    }
    const tanggal = document.getElementById('profit-cair-tanggal').value;
    const keterangan = document.getElementById('profit-cair-keterangan').value.trim();
    showConfirm(
      `Cairkan keuntungan ${formatRupiah(jumlah)}${keterangan ? ' — ' + keterangan : ''}? Keuntungan yang tersedia akan berkurang, saldo kas tidak terpengaruh.`,
      () => {
        addProfitWithdrawal({ tanggal, jumlah, keterangan });
        toast(`✅ Keuntungan ${formatRupiah(jumlah)} berhasil dicairkan.`);
        closeModal('modal-profit-cair');
        renderAll();
      }
    );
  });

  // Tombol di profit-grid bersifat dinamis (di-render tiap renderKeuntungan);
  // binding dilakukan ulang di sana. Jika sudah ada, ikat juga (aman, objek baru).
  const btn = document.getElementById('btn-profit-cairkan');
  if (btn) btn.addEventListener('click', openProfitCairModal);
  const riwayatBtn = document.getElementById('btn-profit-riwayat');
  if (riwayatBtn) {
    riwayatBtn.addEventListener('click', () => {
      renderProfitHistory();
      openModal('modal-profit-riwayat');
    });
  }
}

function renderKeuntungan() {
  const monthInput = document.getElementById('profit-month');
  const mk = (monthInput && monthInput.value) ? monthInput.value : currentMonthKey();
  const per = keuntunganPerUPTD(mk);
  const label = formatBulanKey(mk);
  const grid = document.getElementById('profit-grid');
  if (!grid) return;

  const uptds = getUptdList();
  const fees = keuntunganFeePerMonth(mk);
  const cards = uptds.map(u => {
    const d = per[u.id] || { total: 0, snack: 0, nasi: 0, prasmanan: 0, prasmananCount: 0 };
    const hasPras = d.prasmananCount > 0;
    const prasVal = hasPras
      ? formatRupiah(d.prasmanan)
      : (profitSatuan(u.id, 'keluar-prasmanan') > 0 ? formatRupiah(0) : 'belum ada keuntungan');
    return `
      <div class="card profit-card">
        <div class="profit-head">
          <div class="profit-title">${escapeHtml(u.label)}</div>
          <span class="profit-total">${formatRupiah(d.total)}</span>
        </div>
        <div class="profit-sub">Keuntungan ${label}</div>
        <div class="profit-rows">
          <div class="profit-row"><span>Snack <small>×${profitSatuan(u.id, 'keluar-snack').toLocaleString('id-ID')}</small></span><b>${formatRupiah(d.snack)}</b></div>
          <div class="profit-row"><span>Nasi Box <small>×${profitSatuan(u.id, 'keluar-nasi').toLocaleString('id-ID')}</small></span><b>${formatRupiah(d.nasi)}</b></div>
          <div class="profit-row ${hasPras ? '' : 'muted-row'}"><span>Prasmanan</span><b class="${hasPras ? '' : 'muted'}">${prasVal}</b></div>
        </div>
      </div>`;
  }).join('');

  grid.innerHTML = cards + `
      <div class="card profit-card profit-total-card">
        <div class="profit-total-big" id="profit-grand-total">${formatRupiah(uptds.reduce((a, u) => a + ((per[u.id] || {}).total || 0), 0) + fees)}</div>
        <div class="muted" id="profit-grand-sub">Total Keuntungan ${label}</div>
        <div class="profit-note profit-fee-note" id="profit-fee-note" ${fees <= 0 ? 'hidden' : ''}>Termasuk Fee: <b id="profit-fee">${formatRupiah(fees)}</b></div>
        <div class="profit-sisa" id="profit-sisa">
          Sisa keuntungan yang bisa dicairkan: <b id="profit-sisa-value">${formatRupiah(keuntunganTersedia())}</b>
        </div>
        <button class="btn-profit-cairkan no-print" id="btn-profit-cairkan" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 10l5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
          Cairkan Keuntungan
        </button>
        <button class="btn-profit-riwayat no-print" id="btn-profit-riwayat" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
            <path d="M12 7v5l3 2" />
          </svg>
          Riwayat Pencairan
        </button>
        <div class="profit-note">Semua pesanan dari Amaris Catering</div>
      </div>`;

  // Ikat ulang tombol (konten diganti tiap render)
  const cairBtn = document.getElementById('btn-profit-cairkan');
  if (cairBtn) {
    cairBtn.disabled = keuntunganTersedia() <= 0;
    cairBtn.addEventListener('click', openProfitCairModal);
  }
  const riwayatBtn = document.getElementById('btn-profit-riwayat');
  if (riwayatBtn) {
    riwayatBtn.addEventListener('click', () => {
      renderProfitHistory();
      openModal('modal-profit-riwayat');
    });
  }
}

/* ================= RIWAYAT PENCAIRAN KEUNTUNGAN ================= */
function statusBadge(w) {
  const map = {
    pending: ['Menunggu', 'pending'],
    approved: ['Disetujui', 'approved'],
    rejected: ['Ditolak', 'rejected']
  };
  const [label, cls] = map[w.status] || ['—', ''];
  return `<span class="wd-status ${cls}">${label}</span>`;
}

function renderProfitHistory() {
  const wds = getProfitWithdrawals();
  const list = document.getElementById('profit-riwayat-list');
  const totalEl = document.getElementById('profit-cair-total-dicairkan');
  if (!list) return;

  const approvedOnly = wds.filter(w => w.status === 'approved');
  totalEl.textContent = formatRupiah(approvedOnly.reduce((a, w) => a + (Number(w.jumlah) || 0), 0));

  if (wds.length === 0) {
    list.innerHTML = '<div class="empty-state" style="padding:26px"><div class="empty-emoji">💸</div><p class="muted">Belum ada pencairan keuntungan.</p></div>';
    return;
  }

  // Riwayat kecil: tanggal, keterangan, status, jumlah, dan aksi Approve/Reject
  // (Aksi hanya tampil saat status masih pending. Approved terkunci, Rejected
  // otomatis mengembalikan uang ke keuntungan tersedia.)
  list.innerHTML = wds.slice().reverse().map((w, i) => {
    const actions = w.status === 'pending' ? `
      <span class="wd-actions no-print">
        <button class="btn-icon wd-approve" data-wd="${w.id}" title="Setujui pencairan">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
        </button>
        <button class="btn-icon danger wd-reject" data-wd="${w.id}" title="Tolak pencairan (uang kembali)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </span>` : '';
    return `
    <div class="profit-riwayat-item">
      <span class="profit-riwayat-no">${wds.length - i}</span>
      <span class="profit-riwayat-desc">
        <span class="profit-riwayat-tgl">${formatTanggalPendek(w.tanggal)} · ${statusBadge(w)}</span>
        <span class="profit-riwayat-ket">${w.keterangan ? escapeHtml(w.keterangan) : 'Pencairan keuntungan'}</span>
      </span>
      <span class="num profit-cair-jumlah ${w.status === 'rejected' ? 'strike' : ''}">${w.status === 'rejected' ? '' : '− '}${formatRupiah(w.jumlah)}</span>
      ${actions}
    </div>`;
  }).join('');

  // Aksi Approve / Reject
  list.querySelectorAll('.wd-approve').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.wd;
      const w = getProfitWithdrawals().find(x => x.id === id);
      showConfirm(`Setujui pencairan keuntungan ${w ? formatRupiah(w.jumlah) : ''}? Setelah disetujui, pencairan ini tidak bisa diubah lagi.`, () => {
        approveProfitWithdrawal(id);
        toast('✅ Pencairan disetujui.');
        renderProfitHistory();
        renderKeuntungan();
      });
    });
  });
  list.querySelectorAll('.wd-reject').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.wd;
      const w = getProfitWithdrawals().find(x => x.id === id);
      showConfirm(`Tolak pencairan keuntungan ${w ? formatRupiah(w.jumlah) : ''}? Uang keuntungan akan kembali ke sisa yang bisa dicairkan.`, () => {
        rejectProfitWithdrawal(id);
        toast('Pencairan ditolak. Uang keuntungan kembali.', 'err');
        renderProfitHistory();
        renderKeuntungan();
      });
    });
  });
}

/* ================= LAPORAN ================= */
function initLaporanControls() {
  const monthInput = document.getElementById('laporan-month');
  monthInput.value = currentMonthKey();
  monthInput.addEventListener('change', renderLaporan);
}

function renderLaporan() {
  const s = getState();
  const mk = document.getElementById('laporan-month').value || currentMonthKey();
  const year = mk.slice(0, 4);

  const saldoAwal = saldoBefore(mk + '-01');
  const masuk = sumForMonth(mk, 'masuk');
  const keluar = sumForMonth(mk, 'keluar'); // sudah termasuk Fee (mengurangi kas)
  const saldoAkhir = saldoAwal + masuk - keluar;
  const selisih = masuk - keluar;

  document.getElementById('lap-saldo-awal').textContent = formatRupiah(saldoAwal);
  document.getElementById('lap-masuk').textContent = formatRupiah(masuk);
  document.getElementById('lap-keluar').textContent = formatRupiah(keluar);
  document.getElementById('lap-saldo-akhir').textContent = formatRupiah(saldoAkhir);
  const selisihEl = document.getElementById('lap-selisih');
  selisihEl.textContent = formatRupiah(selisih);
  selisihEl.className = 'selisih-value ' + (selisih >= 0 ? 'pos' : 'neg');

  const profitLap = keuntunganForMonth(mk);
  const profitEl = document.getElementById('lap-profit');
  if (profitEl) profitEl.textContent = formatRupiah(profitLap);

  const count = s.transactions.filter(t => monthKey(t.tanggal) === mk).length;
  document.getElementById('lap-count').textContent = count + ' transaksi pada ' + formatBulanKey(mk);

  // grafik tahunan (12 bulan di tahun terpilih)
  const series = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, '0')}`;
    series.push({
      key,
      masuk: sumForMonth(key, 'masuk'),
      keluar: sumForMonth(key, 'keluar')
    });
  }
  document.getElementById('lap-chart-title').textContent = 'Tahun ' + year;
  renderBarChart('lap-chart', series);

  // rekap per bulan (12 bulan terakhir)
  const monthRows = computeRunningBalances();
  const byMonth = {};
  for (const r of monthRows) {
    const k = monthKey(r.txn.tanggal);
    if (!byMonth[k]) byMonth[k] = { masuk: 0, keluar: 0, akhir: r.saldo };
    if (r.txn.tipe === 'masuk' && r.txn.kategori !== 'masuk-fee') byMonth[k].masuk += r.txn.jumlah;
    else if (r.txn.tipe === 'keluar') byMonth[k].keluar += r.txn.jumlah;
    else if (r.txn.kategori === 'masuk-fee') byMonth[k].keluar += r.txn.jumlah; // Fee mengurangi saldo → kolom keluar
    byMonth[k].akhir = r.saldo;
  }
  const monthsSorted = Object.keys(byMonth).sort((a, b) => a.localeCompare(b)).slice(-12).reverse();
  document.getElementById('lap-table-months').innerHTML = monthsSorted.length ? monthsSorted.map(k => {
    const row = byMonth[k];
    return `<tr>
      <td>${formatBulanKey(k)}</td>
      <td class="num pos">${formatRupiah(row.masuk)}</td>
      <td class="num neg">${formatRupiah(row.keluar)}</td>
      <td class="num">${formatRupiah(row.akhir)}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="4" class="muted">Belum ada data bulanan.</td></tr>';

  // kategori
  const katIn = categoryTotals('masuk', mk);
  const katOut = categoryTotals('keluar', mk);
  const smallRow = (items, grand) => items.length ? items.map(i => `
    <tr>
      <td>${escapeHtml(i.label)}</td>
      <td class="num">${i.total ? (i.total / Math.max(1, grand || 1)).toLocaleString('id-ID', { style: 'percent', maximumFractionDigits: 0 }) : '0%'}</td>
      <td class="num">${formatRupiah(i.total)}</td>
    </tr>`).join('') : '<tr><td colspan="3" class="muted">Tidak ada data.</td></tr>';
  document.getElementById('lap-table-masuk').innerHTML = smallRow(katIn.items, katIn.grand);
  document.getElementById('lap-table-keluar').innerHTML = smallRow(katOut.items, katOut.grand);
}

function exportLaporanCSV() {
  const s = getState();
  const mk = document.getElementById('laporan-month').value || currentMonthKey();
  const lines = [];
  lines.push('LAPORAN KEUANGAN - ' + s.settings.namaUsaha);
  lines.push('Periode: ' + formatBulanKey(mk));
  lines.push('');
  lines.push(['No', 'Tanggal', 'Tipe', 'Kategori', 'UPTD', 'Keterangan', 'Metode', 'Debit', 'Kredit', 'Keuntungan', 'Saldo'].join(';'));
  const rows = getTransactions().filter(t => monthKey(t.tanggal) === mk);
  const balMap = new Map(computeRunningBalances().map(r => [r.txn.id, r.saldo]));
  rows.forEach((t, i) => {
    const isFee = t.tipe === 'masuk' && t.kategori === 'masuk-fee';
    const debit = !isFee && t.tipe === 'masuk' ? t.jumlah : '';
    const kredit = (t.tipe === 'keluar' || isFee) ? t.jumlah : '';
    const profit = isFee ? t.jumlah : '';
    lines.push([
      i + 1, t.tanggal,
      t.tipe === 'masuk' ? 'DEBIT' : 'KREDIT',
      getCategoryLabel(t.tipe, t.kategori),
      t.uptd ? uptdLabel(t.uptd) : '',
      t.keterangan.replace(/;/g, ','),
      t.metode,
      debit, kredit, profit,
      balMap.get(t.id) != null ? balMap.get(t.id) : ''
    ].join(';'));
  });
  lines.push('');
  lines.push('Total Debit (Pemasukan);' + sumForMonth(mk, 'masuk'));
  lines.push('Total Kredit (Pengeluaran);' + sumForMonth(mk, 'keluar'));
  lines.push('Selisih;' + (sumForMonth(mk, 'masuk') - sumForMonth(mk, 'keluar')));
  lines.push('Keuntungan (qty × profit/porsi + fee);' + keuntunganForMonth(mk));
  downloadFile(`laporan-${mk}.csv`, lines.join('\r\n'), 'text/csv');
  toast('CSV laporan berhasil diunduh.');
}

/* ================= PENGATURAN ================= */
function initSettingsForm() {
  document.getElementById('btn-set-save').addEventListener('click', () => {
    const nama = document.getElementById('set-nama').value.trim();
    const saldoRaw = parseUang(document.getElementById('set-saldo-awal').value);
    const saldo = Number.isFinite(saldoRaw) ? Math.round(saldoRaw) : 0;
    if (!nama) { toast('❌ Nama usaha tidak boleh kosong.', 'err'); return; }
    if (saldo < 0) { toast('❌ Saldo awal tidak boleh negatif.', 'err'); return; }
    updateSettings({ namaUsaha: nama, saldoAwal: saldo });
    toast('Pengaturan tersimpan. Saldo dihitung ulang otomatis.');
    renderAll();
  });
}

function renderPengaturan() {
  const s = getState();
  document.getElementById('set-nama').value = s.settings.namaUsaha || '';
  document.getElementById('set-saldo-awal').value = s.settings.saldoAwal ? Number(s.settings.saldoAwal).toLocaleString('id-ID') : '';

  document.getElementById('stat-trx').textContent = s.transactions.length;
  document.getElementById('stat-bulan').textContent = new Set(s.transactions.map(t => monthKey(t.tanggal))).size;
  try {
    const bytes = new Blob([JSON.stringify(s)]).size;
    document.getElementById('stat-ukuran').textContent = (bytes / 1024).toFixed(1) + ' KB';
  } catch (e) {
    document.getElementById('stat-ukuran').textContent = '—';
  }

  renderKatLists();
  renderUptdAkun();
}

function renderKatLists() {
  const s = getState();
  const countByCat = (tipe, id) => s.transactions.filter(t => t.tipe === tipe && t.kategori === id).length;

  const listIn = document.getElementById('kat-masuk-list');
  listIn.innerHTML = s.categories.masuk.map(c => `
    <li class="kat-item">
      <span>${escapeHtml(c.label)} <small>${c.builtin ? 'bawaan' : ''}</small></span>
      <span class="kat-right">
        <span class="kat-count">${countByCat('masuk', c.id)}</span>
        ${c.builtin ? '' : `<button class="btn-icon danger" data-del-kat="masuk:${c.id}" title="Hapus kategori">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>`}
      </span>
    </li>`).join('');

  const listOut = document.getElementById('kat-keluar-list');
  listOut.innerHTML = s.categories.keluar.map(c => `
    <li class="kat-item">
      <span>${escapeHtml(c.label)} <small>${c.builtin ? 'bawaan' : ''}</small></span>
      <span class="kat-right">
        <span class="kat-count">${countByCat('keluar', c.id)}</span>
        ${c.builtin ? '' : `<button class="btn-icon danger" data-del-kat="keluar:${c.id}" title="Hapus kategori">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>`}
      </span>
    </li>`).join('');

  document.querySelectorAll('[data-del-kat]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [tipe, id] = btn.dataset.delKat.split(':');
      const s2 = getState();
      const cat = s2.categories[tipe].find(c => c.id === id);
      showConfirm(`Hapus kategori "${cat ? cat.label : ''}"? Transaksi dengan kategori ini akan dipindah ke kategori bawaan.`, () => {
        deleteCategory(tipe, id);
        toast('Kategori dihapus.');
        renderAll();
      });
    });
  });
}

/* ================= KELOLA AKUN & UPTD (SUPERADMIN) ================= */
let editingUptdId = null;
let editingAkunId = null;

function renderUptdAkun() {
  const card = document.getElementById('kelola-akun-card');
  if (!card) return;
  // Role UPTD tidak melihat kartu kelola akun.
  card.hidden = isUptdUser();
  if (isUptdUser()) return;

  const uptds = getUptdList();
  const users = getUptdUsers();

  const uptdList = document.getElementById('uptd-manage-list');
  uptdList.innerHTML = uptds.map(u => {
    const jmlAkun = users.filter(x => x.uptdId === u.id).length;
    const dipakai = getState().transactions.filter(t => t.uptd === u.id).length;
    return `
      <li class="kat-item">
        <span>
          <b>${escapeHtml(u.label)}</b><br>
          <small>Snack Rp ${(u.harga.snack || 0).toLocaleString('id-ID')} · Nasi Rp ${(u.harga.nasi || 0).toLocaleString('id-ID')} ·
            Profit Snack Rp ${(u.profit.snack || 0).toLocaleString('id-ID')}, Nasi Rp ${(u.profit.nasi || 0).toLocaleString('id-ID')}</small><br>
          <small class="muted">${jmlAkun} akun · ${dipakai} transaksi</small>
        </span>
        <span class="kat-right">
          <button class="btn-icon" data-edit-uptd="${e(u.id)}" title="Ubah UPTD">✏️</button>
          <button class="btn-icon danger" data-del-uptd="${e(u.id)}" title="Hapus UPTD">🗑️</button>
        </span>
      </li>`;
  }).join('') || '<li class="muted" style="padding:8px 2px">Belum ada UPTD.</li>';

  const akunList = document.getElementById('akun-manage-list');
  akunList.innerHTML = users.map(u => {
    const uptdName = uptdLabel(u.uptdId) || '—';
    return `
      <li class="kat-item">
        <span>
          <b>${escapeHtml(u.username)}</b><br>
          <small>${escapeHtml(uptdName)}</small>
        </span>
        <span class="kat-right">
          <button class="btn-icon" data-edit-akun="${e(u.id)}" title="Ubah akun">✏️</button>
          <button class="btn-icon danger" data-del-akun="${e(u.id)}" title="Hapus akun">🗑️</button>
        </span>
      </li>`;
  }).join('') || '<li class="muted" style="padding:8px 2px">Belum ada akun UPTD.</li>';

  document.querySelectorAll('[data-edit-uptd]').forEach(b => b.addEventListener('click', () => openUptdModal(b.dataset.editUptd)));
  document.querySelectorAll('[data-del-uptd]').forEach(b => b.addEventListener('click', () => delUptd(b.dataset.delUptd)));
  document.querySelectorAll('[data-edit-akun]').forEach(b => b.addEventListener('click', () => openAkunModal(b.dataset.editAkun)));
  document.querySelectorAll('[data-del-akun]').forEach(b => b.addEventListener('click', () => delAkun(b.dataset.delAkun)));
}

function e(v) { return (v || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }

function openUptdModal(id) {
  editingUptdId = id || null;
  const form = document.getElementById('uptd-form');
  form.reset();
  const u = editingUptdId ? getUptdList().find(x => x.id === editingUptdId) : null;
  document.getElementById('uptd-title').textContent = editingUptdId ? 'Ubah UPTD' : 'Tambah UPTD';
  document.getElementById('btn-uptd-save').textContent = editingUptdId ? 'Simpan Perubahan' : 'Simpan UPTD';
  if (u) {
    document.getElementById('uptd-label').value = u.label;
    document.getElementById('uptd-harga-snack').value = u.harga.snack ? u.harga.snack.toLocaleString('id-ID') : '';
    document.getElementById('uptd-harga-nasi').value = u.harga.nasi ? u.harga.nasi.toLocaleString('id-ID') : '';
    document.getElementById('uptd-profit-snack').value = u.profit.snack ? u.profit.snack.toLocaleString('id-ID') : '';
    document.getElementById('uptd-profit-nasi').value = u.profit.nasi ? u.profit.nasi.toLocaleString('id-ID') : '';
  }
  openModal('modal-uptd');
  setTimeout(() => document.getElementById('uptd-label').focus(), 100);
}

function initUptdAkunControls() {
  const card = document.getElementById('kelola-akun-card');
  if (!card) return;

  document.getElementById('btn-add-uptd').addEventListener('click', () => openUptdModal());
  document.getElementById('btn-add-akun').addEventListener('click', () => openAkunModal());

  document.getElementById('uptd-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const label = document.getElementById('uptd-label').value.trim();
    const ambil = (id) => {
      const v = parseUang(document.getElementById(id).value);
      return Number.isFinite(v) ? Math.round(v) : 0;
    };
    const harga = { snack: ambil('uptd-harga-snack'), nasi: ambil('uptd-harga-nasi'), prasmanan: 0 };
    const profit = { snack: ambil('uptd-profit-snack'), nasi: ambil('uptd-profit-nasi'), prasmanan: 0 };
    const res = editingUptdId ? updateUptd(editingUptdId, { label, harga, profit }) : addUptd({ label, harga, profit });
    if (!res.ok) {
      toast('❌ ' + res.error, 'err');
      return;
    }
    closeModal('modal-uptd');
    toast(editingUptdId ? 'UPTD diperbarui.' : `UPTD "${label}" ditambahkan.`);
    editingUptdId = null;
    renderAll();
  });

  document.getElementById('akun-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const uptdId = document.getElementById('akun-uptd').value;
    const username = document.getElementById('akun-username').value;
    const password = document.getElementById('akun-password').value;
    if (!uptdId) { toast('❌ Pilih UPTD untuk akun ini.', 'err'); return; }
    const res = editingAkunId
      ? await updateUptdUser(editingAkunId, { uptdId, username, password })
      : await addUptdUser({ uptdId, username, password });
    if (!res.ok) { toast('❌ ' + res.error, 'err'); return; }
    closeModal('modal-akun');
    toast(editingAkunId ? 'Akun diperbarui.' : `Akun "${username}" ditambahkan.`);
    editingAkunId = null;
    renderAll();
  });
}

function openAkunModal(id) {
  editingAkunId = id || null;
  const form = document.getElementById('akun-form');
  form.reset();
  const sel = document.getElementById('akun-uptd');
  sel.innerHTML = ['<option value="">— Pilih UPTD —</option>']
    .concat(getUptdList().map(u => `<option value="${e(u.id)}">${escapeHtml(u.label)}</option>`))
    .join('');
  const u = editingAkunId ? getUptdUserById(editingAkunId) : null;
  document.getElementById('akun-title').textContent = editingAkunId ? 'Ubah Akun UPTD' : 'Tambah Akun UPTD';
  document.getElementById('btn-akun-save').textContent = editingAkunId ? 'Simpan Perubahan' : 'Simpan Akun';
  if (u) {
    sel.value = u.uptdId;
    document.getElementById('akun-username').value = u.username;
  }
  openModal('modal-akun');
  setTimeout(() => document.getElementById('akun-username').focus(), 100);
}

function delUptd(id) {
  const u = getUptdList().find(x => x.id === id);
  showConfirm(`Hapus UPTD "${u ? u.label : ''}"? Semua akun login untuk UPTD ini juga akan dihapus. Hanya bisa jika tidak ada transaksi yang memakainya.`, async () => {
    const res = removeUptd(id);
    if (!res.ok) { toast('❌ ' + res.error, 'err'); return; }
    const linked = getUptdUsers().filter(x => x.uptdId === id);
    await Promise.all(linked.map(x => deleteUptdUser(x.id)));
    toast('UPTD dihapus.');
    renderAll();
  });
}

function delAkun(id) {
  const u = getUptdUserById(id);
  showConfirm(`Hapus akun "${u ? u.username : ''}"? Pengguna ini tidak bisa login lagi.`, async () => {
    if (!await deleteUptdUser(id)) { toast('❌ Akun tidak ditemukan atau gagal dihapus.', 'err'); return; }
    toast('Akun dihapus.');
    renderAll();
  });
}


function initKatManagement() {
  document.getElementById('btn-kat-masuk-add').addEventListener('click', () => addKatFromInput('masuk'));
  document.getElementById('btn-kat-keluar-add').addEventListener('click', () => addKatFromInput('keluar'));
  const keys = ['kat-masuk-add', 'kat-keluar-add'];
  keys.forEach(id => {
    document.getElementById(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const tipe = id === 'kat-masuk-add' ? 'masuk' : 'keluar';
        addKatFromInput(tipe);
      }
    });
  });
}

function addKatFromInput(tipe) {
  const inputId = tipe === 'masuk' ? 'kat-masuk-add' : 'kat-keluar-add';
  const input = document.getElementById(inputId);
  const label = input.value.trim();
  if (!label) return;
  const cat = addCategory(tipe, label);
  if (!cat) {
    toast('❌ Kategori sudah ada atau nama tidak valid.', 'err');
    return;
  }
  input.value = '';
  toast(`Kategori "${label}" ditambahkan.`);
  renderAll();
}

/* ================= BACKUP ================= */
function initBackup() {
  document.getElementById('btn-backup-export').addEventListener('click', () => {
    const s = getState();
    const stamp = todayISO();
    const filename = `backup-amaris-${stamp}.json`;
    const content = JSON.stringify({ app: 'amaris-catering', version: 1, exportedAt: new Date().toISOString(), data: s }, null, 2);
    downloadFile(filename, content, 'application/json');
    toast('File backup berhasil diunduh. Simpan di tempat aman!');
  });

  document.getElementById('btn-backup-import').addEventListener('click', () => {
    document.getElementById('backup-file').click();
  });

  document.getElementById('backup-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const data = parsed.data ? parsed.data : parsed;
        if (!data || !Array.isArray(data.transactions)) throw new Error('format');
        showConfirm(`Pulihkan dari backup "${file.name}"? Data saat ini akan diganti seluruhnya.`, async () => {
          try {
            await importState(data);
            renderAll();
            toast('✅ Backup berhasil dipulihkan dan tersimpan di cloud.');
          } catch (saveErr) {
            toast('❌ Backup gagal disimpan ke cloud. Data device lain belum berubah.', 'err');
          }
        });
      } catch (err) {
        toast('❌ File backup tidak valid.', 'err');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
}

/* ================= RENDER SEMUA ================= */
function renderAll() {
  const limited = isUptdUser();
  const active = document.querySelector('.nav-item.active');
  const page = limited ? 'kas' : (active ? active.dataset.page : 'dashboard');

  renderSidebar();
  if (limited) {
    // Role UPTD: hanya Daftar Transaksi milik UPTD-nya yang dirender,
    // sehingga data keuntungan/saldo global tidak pernah masuk DOM.
    renderKas();
  } else {
    renderDashboard();
    renderKeuntungan();
    renderProfitHistory();
    renderKas();
    renderLaporan();
    renderPengaturan();
  }

  updateTopDate();

  if (!active) setActiveNav(page);
}

/* ---------- Jam realtime di topbar (tanggal + waktu dengan detik) ---------- */
function updateTopDate() {
  const el = document.getElementById('top-date');
  if (!el) return;
  el.textContent = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  }) + ' · ' + new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}
