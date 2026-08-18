export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, PUT, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Api-Token','Cache-Control':'no-store'};
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
    if (url.pathname === '/api/health') return json({ok:true},cors);
    if (url.pathname !== '/api/state') return json({error:'Not found'},cors,404);
    if (request.method === 'GET') {
      try { const row=await env.amaris_catering_db.prepare('SELECT data, updated_at FROM state WHERE id = 1').first(); return json(row ? {data:JSON.parse(row.data),updated_at:row.updated_at}:{data:null,updated_at:null},cors); }
      catch(e) { return json({error:e.message},cors,500); }
    }
    if (request.method === 'PUT') {
      if (env.API_TOKEN && request.headers.get('X-Api-Token') !== env.API_TOKEN) return json({error:'Unauthorized'},cors,401);
      try { const body=await request.json(); const now=new Date().toISOString(); await env.amaris_catering_db.prepare('INSERT INTO state (id,data,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind(JSON.stringify(body),now).run(); return json({ok:true,updated_at:now},cors); }
      catch(e) { return json({error:e.message},cors,500); }
    }
    return json({error:'Method not allowed'},cors,405);
  }
};
function json(body,headers,status=200){return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json',...headers}});}
