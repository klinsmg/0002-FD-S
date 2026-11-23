// Testes HTTP das rotas contra o servidor LOCAL (next start). Só GETs de visitante e requisições recusadas antes do banco:
// nenhum teste escreve dados. Uso: suba `npx next start -p 3100` e rode `npm run test:http` (TEST_BASE muda o endereço).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.TEST_BASE ?? 'http://localhost:3100';
const UUID0 = '00000000-0000-4000-8000-000000000000';
let online = true;
before(async () => { try { await fetch(BASE, { signal: AbortSignal.timeout(5000) }); } catch { online = false; } });
const get = (p, init = {}) => fetch(BASE + p, { redirect: 'manual', ...init });
// página protegida: 307 para o login ou (com streaming do loading.tsx) redirecionamento no corpo — e nunca o conteúdo
async function redirecionaPara(p, destino) {
  const r = await get(p);
  if (r.status === 307 || r.status === 308) return assert.equal(new URL(r.headers.get('location'), BASE).pathname, destino, p);
  const html = await r.text();
  assert.match(html, new RegExp(`NEXT_REDIRECT;replace;${destino.replace('/', '\\/')};`), `${p} deveria levar a ${destino}`);
}

test('páginas públicas respondem 200', { skip: !online && 'servidor local fora do ar' }, async t => {
  for (const p of ['/', '/cardapio', '/contato', '/login', '/entregador', '/admin/login', '/politica-de-privacidade', '/termos-de-uso', '/politica-de-cookies', '/llms.txt', '/robots.txt', '/sitemap.xml']) {
    await t.test(p, async () => assert.equal((await get(p)).status, 200));
  }
});

test('rota inexistente dá 404', { skip: !online }, async () => assert.equal((await get('/nao-existe-xyz')).status, 404));

test('áreas logadas mandam para o login (sem vazar conteúdo)', { skip: !online }, async () => {
  await redirecionaPara('/conta', '/login');
  await redirecionaPara('/conta/pedidos', '/login');
  await redirecionaPara(`/pedido/${UUID0}`, '/login');
  await redirecionaPara('/admin', '/admin/login');
  await redirecionaPara('/admin/loja', '/admin/login');
  await redirecionaPara('/admin/configuracoes', '/admin/login');
  await redirecionaPara('/admin/auditoria', '/admin/login');
  await redirecionaPara(`/admin/imprimir/${UUID0}`, '/admin/login');
  await redirecionaPara(`/entregador/${UUID0}`, '/entregador');
});

test('APIs para visitante', { skip: !online }, async () => {
  assert.deepEqual(await (await get('/api/sessao')).json(), { logado: false, nome: null });
  assert.deepEqual(await (await get('/api/enderecos')).json(), { nome: null, enderecos: [] });
  assert.equal((await get('/admin/relatorios/export?tipo=diario')).status, 401);
  assert.equal((await get('/admin/logout')).status, 405, 'logout só por POST');
});

test('POST de posição do GPS: travas antes do banco', { skip: !online }, async () => {
  const url = `/api/entregas/${UUID0}/posicao`;
  const corpo = JSON.stringify({ latitude: -23.5, longitude: -46.9, precisaoMetros: 8, capturadoEm: new Date().toISOString() });
  const post = (headers, body = corpo, p = url) => get(p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
  assert.equal((await post({})).status, 403, 'sem Origin');
  assert.equal((await post({ origin: 'https://evil.example' })).status, 403, 'Origin de outro site');
  assert.equal((await post({ origin: BASE }, 'a'.repeat(2000))).status, 413, 'payload grande');
  assert.equal((await post({ origin: BASE }, '{"latitude":999}')).status, 400, 'dado inválido');
  assert.equal((await post({ origin: BASE }, 'nao-json')).status, 400, 'JSON inválido');
  assert.equal((await post({ origin: BASE })).status, 401, 'sem login');
  assert.equal((await post({ origin: BASE }, corpo, '/api/entregas/xx/posicao')).status, 404, 'id inválido');
});

test('cabeçalhos de segurança', { skip: !online }, async () => {
  const h = (await get('/')).headers;
  assert.match(h.get('content-security-policy') ?? '', /default-src 'self'/);
  assert.match(h.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  assert.match(h.get('content-security-policy') ?? '', /object-src 'none'/);
  assert.equal(h.get('x-frame-options'), 'DENY');
  assert.equal(h.get('x-content-type-options'), 'nosniff');
  assert.match(h.get('strict-transport-security') ?? '', /max-age=\d{8}/);
  assert.match(h.get('permissions-policy') ?? '', /geolocation=\(self\)/);
  assert.match(h.get('permissions-policy') ?? '', /camera=\(\)/);
  assert.equal(h.get('x-powered-by'), null);
});

test('respostas com sessão não ficam em cache compartilhado', { skip: !online }, async () => {
  for (const p of ['/api/sessao', '/api/enderecos']) assert.match((await get(p)).headers.get('cache-control') ?? '', /no-store/, p);
});

test('nenhum segredo nos arquivos JS entregues ao navegador', { skip: !online }, async () => {
  const html = await (await get('/cardapio')).text();
  const scripts = [...new Set([...html.matchAll(/src="(\/_next\/static\/[^"]+\.js)"/g)].map(m => m[1]))];
  assert.ok(scripts.length > 3, 'achou os scripts da página');
  for (const s of scripts) {
    const js = await (await get(s)).text();
    assert.doesNotMatch(js, /sb_secret_|service_role|SUPABASE_SERVICE_ROLE_KEY|GOOGLE_MAPS_SERVER_KEY/, s);
  }
});

// ---------- rastreamento (sem variáveis de mapas/Google: o modo "sem VPS, sem Google") ----------
const postJ = (p, body, headers = {}) => get(p, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });

test('APIs de mapa: mesma origem, login e corpo válidos antes de qualquer coisa', { skip: !online }, async () => {
  for (const p of ['/api/maps/config', '/api/maps/route', '/api/maps/eta', '/api/maps/geocode']) {
    assert.equal((await postJ(p, { pedido: UUID0 })).status, 403, `${p} sem Origin`);
    assert.equal((await postJ(p, { pedido: UUID0 }, { origin: 'https://evil.example' })).status, 403, `${p} de outro site`);
    assert.equal((await postJ(p, 'x'.repeat(5000), { origin: BASE })).status, 400, `${p} corpo grande/ inválido`);
    assert.equal((await postJ(p, { pedido: UUID0, street: 'a' }, { origin: BASE })).status, 401, `${p} sem login`);
  }
  assert.equal((await get('/api/maps/route')).status, 405, 'rota de mapa só por POST');
});

test('mapa base público (pino do checkout): só URLs, nenhuma chave; sem VPS = sem tiles', { skip: !online }, async () => {
  const r = await get('/api/maps/base');
  assert.equal(r.status, 200);
  const t = await r.text();
  assert.doesNotMatch(t, /AIza|token|secret|key/i);
  assert.equal(JSON.parse(t).tipo, null);
});

test('proxy de tiles do Google: sem link assinado (ou Google desligado) não serve nada', { skip: !online }, async () => {
  assert.equal((await get('/api/maps/tiles/1/0/0')).status, 403);
  assert.equal((await get('/api/maps/tiles/1/0/0?t=abc.def')).status, 403);
  assert.equal((await get('/api/maps/tiles/99/0/0')).status, 400, 'zoom fora do limite');
  assert.equal((await get('/api/maps/tiles/2/9/0')).status, 400, 'x fora da grade');
  assert.equal((await get('/api/maps/tiles/a/b/c')).status, 400);
});

test('REST de pedidos e rastreio: visitante não vê nada', { skip: !online }, async () => {
  for (const p of [`/api/orders/${UUID0}`, `/api/orders/${UUID0}/tracking`, `/api/orders/${UUID0}/tracking-stream`]) assert.equal((await get(p)).status, 401, p);
  assert.equal((await get('/api/orders/xx/tracking')).status, 401, 'id inválido também pede login primeiro');
});

test('REST de admin: mesma origem e admin com 2FA (visitante recebe 404, sem revelar o endpoint)', { skip: !online }, async () => {
  const casos = [[`/api/orders/${UUID0}/status`, { status: 'preparing' }], [`/api/deliveries/${UUID0}/assign-courier`, { courierId: UUID0 }], ['/api/admin/couriers', { email: 'a@b.co', ativo: true }], ['/api/admin/restaurants', { name: 'X' }]];
  for (const [p, b] of casos) {
    assert.equal((await postJ(p, b)).status, 403, `${p} sem Origin`);
    assert.equal((await postJ(p, b, { origin: BASE })).status, 404, `${p} sem ser admin`);
  }
});

test('GPS pelo contrato /api/courier/location: mesmas travas', { skip: !online }, async () => {
  const corpo = { entregaId: UUID0, latitude: -23.5, longitude: -46.9, precisaoMetros: 8, capturadoEm: new Date().toISOString() };
  assert.equal((await postJ('/api/courier/location', corpo)).status, 403, 'sem Origin');
  assert.equal((await postJ('/api/courier/location', { ...corpo, entregaId: 'x' }, { origin: BASE })).status, 404, 'entrega inválida');
  assert.equal((await postJ('/api/courier/location', { ...corpo, latitude: 91 }, { origin: BASE })).status, 400, 'latitude impossível');
  assert.equal((await postJ('/api/courier/location', { ...corpo, capturadoEm: 'ontem' }, { origin: BASE })).status, 400, 'timestamp inválido');
  assert.equal((await postJ('/api/courier/location', corpo, { origin: BASE })).status, 401, 'sem login');
});

test('job diário dos mapas: só com o segredo do cron', { skip: !online }, async () => {
  assert.equal((await get('/api/cron/mapas')).status, 401);
  assert.equal((await get('/api/cron/mapas', { headers: { authorization: 'Bearer chute' } })).status, 401);
});

test('CSP sem domínios do Google Maps em script/img/connect (mapa vem do VPS ou do nosso proxy)', { skip: !online }, async () => {
  const csp = (await get('/')).headers.get('content-security-policy') ?? '';
  for (const d of ['script-src', 'img-src', 'connect-src']) assert.doesNotMatch(csp.split(';').find(x => x.trim().startsWith(d)) ?? '', /googleapis|gstatic/, d);
});

test('nenhum segredo/chave em NENHUM JS do build (inclusive os carregados sob demanda, como o mapa)', async () => {
  const { readdirSync, readFileSync, existsSync } = await import('node:fs');
  const dir = new URL('../../.next/static/', import.meta.url);
  if (!existsSync(dir)) return;
  const arquivos = readdirSync(dir, { recursive: true }).filter(f => String(f).endsWith('.js'));
  assert.ok(arquivos.length > 10);
  for (const f of arquivos) {
    const js = readFileSync(new URL(String(f).replaceAll('\\', '/'), dir), 'utf8');
    assert.doesNotMatch(js, /AIza[0-9A-Za-z_-]{35}|sb_secret_|service_role|GOOGLE_MAPS_API_KEY|MAPAS_TOKEN|MAPAS_HMAC_SECRET|CRON_SECRET/, String(f));
  }
});
