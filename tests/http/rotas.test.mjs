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
