/* ============================================================
   AMARIS CATERING — Grafik (bar bulanan & donat kategori)
   ============================================================ */
'use strict';

const PALETTE = ['#ffb547', '#60a5fa', '#34d399', '#f87171', '#a78bfa', '#f472b6', '#2dd4bf', '#facc15', '#fb923c', '#38bdf8'];

/* ---------- Bar chart pemasukan vs pengeluaran ---------- */
function renderBarChart(containerId, items) {
  const el = document.getElementById(containerId);
  if (!el) return;
  // items: [{key, masuk, keluar}]
  const data = items.slice(-12);

  const maxVal = Math.max(1, ...data.map(d => Math.max(d.masuk, d.keluar)));
  const barMax = 190;

  const html = ['<div class="chart-bars">'];
  for (const d of data) {
    const hIn = Math.max(d.masuk > 0 ? 6 : 2, (d.masuk / maxVal) * barMax);
    const hOut = Math.max(d.keluar > 0 ? 6 : 2, (d.keluar / maxVal) * barMax);
    html.push(`<div class="bar-col" title="${formatBulanKey(d.key)}">`);
    html.push(`<div class="bar-pair">`);
    html.push(`<div class="bar in" style="height:${hIn.toFixed(1)}px" title="Pemasukan ${formatRupiah(d.masuk)}"></div>`);
    html.push(`<div class="bar out" style="height:${hOut.toFixed(1)}px" title="Pengeluaran ${formatRupiah(d.keluar)}"></div>`);
    html.push('</div>');
    html.push(`<div class="bar-col-label">${escapeHtml(formatBulanKey(d.key))}</div>`);
    html.push('</div>');
  }
  html.push('</div>');
  html.push('<div class="constraint-note">Tinggi batang menyesuaikan nilai terbesar dalam 12 bulan terakhir.</div>');
  el.innerHTML = html.join('');
}

/* ---------- Donat (SVG) ---------- */
function renderDonut(containerId, legendId, titleElId, items, grand, centerLabel) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const total = grand || items.reduce((a, i) => a + i.total, 0);
  const size = 180, r = 70, cx = size / 2, cy = size / 2, stroke = 30;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  let svg = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`;
  svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(255,255,255,.06)" stroke-width="${stroke}"/>`;
  if (total > 0) {
    items.forEach((item, i) => {
      const frac = item.total / total;
      const len = frac * circ;
      const color = PALETTE[i % PALETTE.length];
      svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
        stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}"
        stroke-dashoffset="${(-offset).toFixed(2)}"
        transform="rotate(-90 ${cx} ${cy})" opacity=".92"
        style="transition: stroke-dasharray .6s ease">
        <title>${escapeHtml(item.label)}: ${formatRupiah(item.total)}</title></circle>`;
      offset += len;
    });
  }
  svg += '</svg>';

  const center = total > 0
    ? `<div class="donut-center"><b>${centerLabel || ''}</b><small>${items.length} kategori</small></div>`
    : `<div class="donut-center"><b>—</b><small>belum ada data</small></div>`;

  el.innerHTML = `<div class="donut-wrap"><div class="donut-box">${svg}${center}</div><div class="donut-legend" id="${legendId || ''}"></div></div>`;
  // legend diisi setelahnya
  const legendEl = document.getElementById(legendId);
  if (legendEl) {
    if (items.length === 0) {
      legendEl.innerHTML = '<div class="muted">Tidak ada pengeluaran pada periode ini.</div>';
    } else {
      legendEl.innerHTML = items.slice(0, 8).map((item, i) => `
        <div class="legend-item">
          <span class="legend-swatch" style="background:${PALETTE[i % PALETTE.length]}"></span>
          <span>${escapeHtml(item.label)}</span>
          <b>${formatRupiah(item.total)}</b>
        </div>`).join('');
    }
  }
}


