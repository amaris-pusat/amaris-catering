/* ============================================================
   Unit test — data.js (Amaris Catering)
   Jalankan: node test-data.js
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

// ---- Mock localStorage minimal ----
global.localStorage = (() => {
  let store = {};
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; }
  };
})();

// Muat data.js sebagai skrip global (bukan modul) supaya fungsi-fungsinya tersedia.
// vm.runInThisContext mengeksekusi di scope global; deklarasi function menjadi
// properti global object sehingga dapat dipanggil dari file test ini.
const vm = require('vm');
const dataSrc = fs.readFileSync(path.join(__dirname, 'js', 'data.js'), 'utf8');
vm.runInThisContext(dataSrc, { filename: 'data.js' });

let passed = 0, failed = 0;
function assert(cond, name) {
  if (cond) { passed++; console.log('  ✅ ' + name); }
  else { failed++; console.error('  ❌ ' + name); }
}
function assertEq(actual, expected, name) {
  const ok = Object.is(actual, expected);
  if (ok) { passed++; console.log('  ✅ ' + name); }
  else { failed++; console.error(`  ❌ ${name} — expected ${expected}, got ${actual}`); }
}

function reset() {
  resetAll();
  updateSettings({ saldoAwal: 1000000 });
}

function tx(kategori, jumlah, extra = {}) {
  return Object.assign({ kategori, jumlah, tipe: 'masuk' }, extra);
}

console.log('== Helper saldoDelta ==');
reset();
assertEq(saldoDelta(tx('masuk-pembayaran', 500000)), 500000, 'saldoDelta pembayaran = +500000');
assertEq(saldoDelta(tx('masuk-modal', 200000)), 200000, 'saldoDelta modal = +200000');
assertEq(saldoDelta(tx('masuk-fee', 75000)), -75000, 'saldoDelta fee = -75000 (mengurangi saldo)');
assertEq(saldoDelta({ tipe: 'keluar', kategori: 'keluar-snack', jumlah: 220000 }), -220000, 'saldoDelta keluar = -220000');

console.log('\n== Saldo berjalan (computeRunningBalances) ==');
reset();
addTransaction({ tanggal: '2026-08-01', tipe: 'masuk', kategori: 'masuk-modal', keterangan: 'Modal', metode: 'Tunai', jumlah: 500000, uptd: '', qty: 0, qty_nasi: 0 });
addTransaction({ tanggal: '2026-08-02', tipe: 'masuk', kategori: 'masuk-fee', keterangan: 'Fee jasa', metode: 'Tunai', jumlah: 100000, uptd: '', qty: 0, qty_nasi: 0 });
addTransaction({ tanggal: '2026-08-03', tipe: 'keluar', kategori: 'keluar-snack', keterangan: 'Snack', metode: 'Tunai', jumlah: 50000, uptd: 'debong', qty: 5, qty_nasi: 0 });
const rows = computeRunningBalances();
assertEq(rows.length, 3, '3 baris saldo berjalan');
assertEq(rows[0].saldo, 1500000, 'saldo setelah Modal = 1.000.000 + 500.000 = 1.500.000');
assertEq(rows[1].saldo, 1400000, 'saldo setelah Fee = 1.500.000 - 100.000 = 1.400.000 (berkurang!)');
assertEq(rows[2].saldo, 1350000, 'saldo setelah keluar = 1.400.000 - 50.000 = 1.350.000');
assertEq(getCurrentBalance(), 1350000, 'getCurrentBalance = 1.350.000');

console.log('\n== saldoBefore ==');
assertEq(saldoBefore('2026-08-02'), 1500000, 'saldo sebelum Fee = 1.500.000 (Fee belum dihitung)');
assertEq(saldoBefore('2026-08-03'), 1400000, 'saldo sebelum keluar = 1.400.000 (Fee sudah mengurangi)');

console.log('\n== Keuntungan (Fee tetap menambah) ==');
assertEq(keuntunganTxn(tx('masuk-fee', 100000)), 100000, 'keuntunganTxn fee = 100000');
assertEq(keuntunganTxn(tx('masuk-pembayaran', 500000)), 0, 'keuntunganTxn pembayaran = 0');
assertEq(keuntunganFeePerMonth('2026-08'), 100000, 'keuntunganFeePerMonth Agustus = 100000');
assertEq(keuntunganForMonth('2026-08'), 100000 + 5 * 2500, 'keuntunganForMonth = fee 100.000 + snack 5×2.500 = 112.500');

console.log('\n== groupByUptdAndMonth (Fee di grup Umum, tampil di kolom Kredit) ==');
const groups = groupByUptdAndMonth(getTransactions());
const umum = groups.find(g => g.key === '__umum__');
const debong = groups.find(g => g.key === 'debong');
assert(!!umum, 'grup "Tanpa UPTD / Umum" ada');
assert(!!debong, 'grup debong ada');
const mUmum = umum.months[0];
const mDebong = debong.months[0];
assertEq(mUmum.masuk, 500000, 'bulan Umum masuk = 500.000 (Modal; Fee TIDAK dihitung masuk)');
assertEq(mUmum.keluar, 100000, 'bulan Umum keluar = 100.000 (Fee ditampilkan di kolom keluar)');
assertEq(mUmum.saldoAkhir, 1000000 + 500000 - 100000, 'saldo akhir Umum = 1.000.000 + 500.000 - 100.000 = 1.400.000');
assertEq(mDebong.keluar, 50000, 'bulan debong keluar = 50.000');
assertEq(mDebong.saldoAkhir, 1000000 - 50000, 'saldo akhir debong = 1.000.000 - 50.000 = 950.000');

console.log('\n== Ringkasan masuk/keluar: Fee termasuk pengeluaran (pengaruh kas) ==');
assertEq(sumForMonth('2026-08', 'masuk'), 500000, 'sumForMonth masuk = 500.000 (Fee dikecualikan dari pemasukan)');
assertEq(sumForMonth('2026-08', 'keluar'), 150000, 'sumForMonth keluar = 50.000 + fee 100.000 = 150.000 (Fee termasuk pengeluaran)');
assertEq(statsToday().masuk, 500000, 'statsToday.masuk tidak termasuk Fee');
assertEq(statsToday().keluar, 150000, 'statsToday.keluar termasuk Fee (mengurangi kas)');
assertEq(categoryTotals('masuk', '2026-08').grand, 500000, 'rekap kategori masuk tidak termasuk Fee');
assertEq(categoryTotals('keluar', '2026-08').grand, 150000, 'rekap kategori keluar termasuk Fee (kolom pengeluaran)');
assertEq(categoryTotals('keluar', '2026-08').items.find(i => i.id === '__fee__').total, 100000, 'kategori "Fee" muncul di rekap pengeluaran = 100.000');

console.log('\n== monthlySeries TIDAK terpengaruh Fee (masuk) ==');
const series = monthlySeries().find(s => s.key === '2026-08');
assertEq(series.masuk, 500000, 'grafik masuk tidak termasuk Fee');
assertEq(series.keluar, 150000, 'grafik keluar termasuk Fee = 150.000');

console.log('\n== REKONSILIASI: selisih kas = perubahan saldo berjalan ==');
// Invariant inti: saldoAwal + (masuk − keluar)  ===  saldo berjalan terakhir.
// Sebelum perbaikan, keluar tidak termasuk Fee sehingga terjadi ketidakcocokan
// sebesar total Fee (100.000).
reset();
addTransaction({ tanggal: '2026-08-01', tipe: 'masuk', kategori: 'masuk-modal', keterangan: 'Modal', metode: 'Tunai', jumlah: 500000, uptd: '', qty: 0, qty_nasi: 0 });
addTransaction({ tanggal: '2026-08-02', tipe: 'masuk', kategori: 'masuk-fee', keterangan: 'Fee jasa', metode: 'Tunai', jumlah: 100000, uptd: '', qty: 0, qty_nasi: 0 });
addTransaction({ tanggal: '2026-08-03', tipe: 'keluar', kategori: 'keluar-snack', keterangan: 'Snack', metode: 'Tunai', jumlah: 50000, uptd: 'debong', qty: 5, qty_nasi: 0 });
const saldoAwalR = Number(state.settings.saldoAwal) || 0;
const mR = sumForMonth('2026-08', 'masuk');
const kR = sumForMonth('2026-08', 'keluar');
assertEq(saldoAwalR + mR - kR, getCurrentBalance(), 'saldoAwal + masuk − keluar == saldo berjalan terakhir (1.350.000)');
assertEq(mR - kR, getCurrentBalance() - saldoAwalR, 'selisih kas (350.000) == perubahan saldo kas bulan ini');

console.log('\n== CSV: Fee tampil di kolom Keuntungan & Kredit ==');
const csv = buildCSV(getTransactions(), true);
const csvLines = csv.split('\r\n');
const feeRow = csvLines.find(l => l.includes('Fee jasa'));
assert(!!feeRow, 'baris Fee ada di CSV');
assertEq(feeRow.split(';')[7], '', 'kolom Debit Fee kosong');
assertEq(feeRow.split(';')[8], '100000', 'kolom Kredit Fee = 100000 (angka fee tampil di pengeluaran)');
assertEq(feeRow.split(';')[9], '100000', 'kolom Keuntungan Fee = 100000');
assertEq(feeRow.split(';')[10], '1400000', 'kolom Saldo Fee = 1.400.000');

console.log('\n== Penarikan & gabungan tetap benar (regresi) ==');
reset();
addTransaction({ tanggal: '2026-08-05', tipe: 'keluar', kategori: 'keluar-penarikan', keterangan: 'Tarik tunai', metode: 'Tunai', jumlah: 200000, uptd: '', qty: 0, qty_nasi: 0 });
assertEq(getCurrentBalance(), 800000, 'penarikan mengurangi saldo: 1.000.000 - 200.000');
addTransaction({ tanggal: '2026-08-06', tipe: 'keluar', kategori: 'keluar-gabungan', keterangan: 'Paket', metode: 'Transfer Bank', jumlah: 10 * 11000 + 5 * 25000, uptd: 'debong', qty: 10, qty_nasi: 5 });
assertEq(keuntunganTxn(getTransactions().find(t => t.kategori === 'keluar-gabungan')), 10 * 2500 + 5 * 3000, 'keuntungan gabungan = 40.000');
const g2 = groupByUptdAndMonth(getTransactions()).find(g => g.key === 'debong').months[0];
assertEq(g2.keluar, 235000, 'bulan debong keluar gabungan = 235.000');

console.log('\n== Pencairan Keuntungan (pending → approve/reject) ==');
reset();
addTransaction({ tanggal: '2026-08-01', tipe: 'keluar', kategori: 'keluar-snack', keterangan: 'Snack', metode: 'Tunai', jumlah: 55000, uptd: 'debong', qty: 5, qty_nasi: 0 });
addTransaction({ tanggal: '2026-08-02', tipe: 'masuk', kategori: 'masuk-fee', keterangan: 'Fee jasa', metode: 'Tunai', jumlah: 100000, uptd: '', qty: 0, qty_nasi: 0 });
const kotor = totalKeuntunganKotor();
assertEq(kotor, 100000 + 5 * 2500, 'keuntungan kotor = fee 100.000 + snack 5×2.500 = 112.500');
assertEq(keuntunganTersedia(), kotor, 'sebelum pencairan, tersedia = kotor');
const wd1 = addProfitWithdrawal({ tanggal: '2026-08-03', jumlah: 40000, keterangan: 'Gaji pemilik' });
assertEq(wd1.status, 'pending', 'pencairan baru berstatus pending');
assertEq(totalProfitWithdrawn(), 0, 'pending TIDAK dihitung sebelum disetujui');
assertEq(keuntunganTersedia(), kotor, 'pending belum mengurangi keuntungan tersedia');
// Approve → uang ditarik (terkunci, tidak bisa diubah)
assert(approveProfitWithdrawal(wd1.id), 'approve berhasil');
assertEq(wd1.status, 'approved', 'status menjadi approved');
assertEq(totalProfitWithdrawn(), 40000, 'total dicairkan = 40.000 (approved)' );
assertEq(keuntunganTersedia(), kotor - 40000, 'tersedia berkurang: 112.500 - 40.000 = 72.500');
assert(!approveProfitWithdrawal(wd1.id), 'approve kedua ditolak (terkunci)');
assert(!rejectProfitWithdrawal(wd1.id), 'reject data approved ditolak (terkunci)');
// Reject → uang kembali
const wd2 = addProfitWithdrawal({ tanggal: '2026-08-04', jumlah: 20000, keterangan: 'Uang saku' });
assert(rejectProfitWithdrawal(wd2.id), 'reject berhasil untuk pending');
assertEq(wd2.status, 'rejected', 'status menjadi rejected');
assertEq(totalProfitWithdrawn(), 40000, 'rejected TIDAK menambah total dicairkan (uang kembali)');
assertEq(keuntunganTersedia(), kotor - 40000, 'rejected mengembalikan uang: tersedia tetap 72.500');
// Saldo kas TIDAK berubah karena pencairan keuntungan (approved ataupun rejected):
assertEq(getCurrentBalance(), 1000000 - 55000 - 100000, 'saldo kas tetap: 1.000.000 − snack 55.000 − fee 100.000');
assertEq(getProfitWithdrawals().length, 2, 'dua riwayat pencairan tersimpan');
assertEq(addProfitWithdrawal({ tanggal: '2026-08-05', jumlah: 0, keterangan: 'nol' }), null, 'pencairan 0 ditolak');

console.log('\n== UPTD dinamis (Kelola UPTD) ==');
reset();
const uptds = getUptdList();
assertEq(uptds.length, 2, 'default 2 UPTD (debong & barat)');
assertEq(uptdLabel('debong'), 'UPTD Puskesmas Debong Lor', 'label debong default');
assertEq(hargaSatuan('debong', 'keluar-snack'), 11000, 'harga snack debong default');
assertEq(profitSatuan('barat', 'keluar-nasi'), 3000, 'profit nasi barat default');
// Tambah UPTD baru
const resAdd = addUptd({ label: 'UPTD Puskesmas Dukuhturi', harga: { snack: 12000, nasi: 25000, prasmanan: 0 }, profit: { snack: 3000, nasi: 3000, prasmanan: 0 } });
assert(resAdd.ok, 'tambah UPTD baru berhasil');
assertEq(getUptdList().length, 3, 'daftar UPTD bertambah jadi 3');
assertEq(hargaSatuan(resAdd.uptd.id, 'keluar-snack'), 12000, 'harga snack UPTD baru = 12000');
assertEq(profitSatuan(resAdd.uptd.id, 'keluar-nasi'), 3000, 'profit nasi UPTD baru = 3000');
assert(!addUptd({ label: 'uptd puskesmas dukuhturi', harga: {}, profit: {} }).ok, 'nama UPTD duplikat (case-insensitive) ditolak');
// Perbarui
const upd = updateUptd(resAdd.uptd.id, { label: 'UPTD Puskesmas Dukuhturi Baru', harga: { snack: 13000, nasi: 26000, prasmanan: 0 } });
assert(upd.ok, 'update UPTD berhasil');
assertEq(hargaSatuan(resAdd.uptd.id, 'keluar-snack'), 13000, 'harga snack setelah update = 13000');
// Hapus: masih dipakai transaksi → ditolak
addTransaction({ tanggal: '2026-08-10', tipe: 'keluar', kategori: 'keluar-snack', keterangan: 'Snack dukuhturi', metode: 'Tunai', jumlah: 10 * 13000, uptd: resAdd.uptd.id, qty: 10, qty_nasi: 0 });
assert(!removeUptd(resAdd.uptd.id).ok, 'hapus UPTD yang masih dipakai transaksi ditolak');
// Hapus setelah transaksi dihapus → berhasil
state.transactions = state.transactions.filter(t => t.uptd !== resAdd.uptd.id);
assert(removeUptd(resAdd.uptd.id).ok, 'hapus UPTD tanpa transaksi berhasil');
assertEq(getUptdList().length, 2, 'daftar UPTD kembali ke 2');
assertEq(keuntunganPerUPTD('2026-08').debong.total, 0, 'keuntunganPerUPTD mendukung UPTD dinamis');

console.log('\n========================================');
console.log(`Hasil: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
