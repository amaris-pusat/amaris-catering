/* ============================================================
   AMARIS CATERING — Pages Function: REST API state (D1)
   Berjalan di domain Pages yang sama (/api/*) — tanpa biaya.
   Binding D1 & token dari wrangler.toml ([vars]/[[d1_databases]]).
   ============================================================ */
'use strict';

// Simpan/muat seluruh state aplikasi ke D1 (satu baris JSON).
// Semua device membaca dari sini → data sinkron.

export async function onRequestGet(context) {
  const cors = corsHeaders();
  try {
    const row = await context.env.amaris_catering_db
      .prepare('SELECT data, updated_at FROM state WHERE id = 1')
      .first();
    if (!row) {
      return json({ data: null, updated_at: null }, cors);
    }
    return json({ data: JSON.parse(row.data), updated_at: row.updated_at }, cors);
  } catch (e) {
    return json({ error: 'Gagal membaca data: ' + e.message }, cors, 500);
  }
}

export async function onRequestPut(context) {
  const cors = corsHeaders();
  // Lindungi tulis: butuh token yang sama dengan env API_TOKEN.
  const auth = context.request.headers.get('X-Api-Token') || '';
  if (context.env.API_TOKEN && auth !== context.env.API_TOKEN) {
    return json({ error: 'Unauthorized' }, cors, 401);
  }
  let body;
  try {
    body = await context.request.json();
  } catch (e) {
    return json({ error: 'Invalid JSON' }, cors, 400);
  }
  const data = JSON.stringify(body);
  const now = new Date().toISOString();
  try {
    await context.env.amaris_catering_db
      .prepare(
        `INSERT INTO state (id, data, updated_at) VALUES (1, ?, ?)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
      )
      .bind(data, now)
      .run();
    return json({ ok: true, updated_at: now }, cors);
  } catch (e) {
    return json({ error: 'Gagal menyimpan data: ' + e.message }, cors, 500);
  }
}

// Preflight CORS (dipanggil otomatis untuk request OPTIONS)
export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Api-Token',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store'
  };
}

function json(obj, cors, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors }
  });
}
