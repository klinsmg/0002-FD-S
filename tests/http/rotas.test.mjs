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
  for (const p of ['/', '/cardapio', '/contato', '/login', '/entregador', '/entregador.webmanifest', '/admin/login', '/politica-de-privacidade', '/termos-de-uso', '/politica-de-cookies', '/llms.txt', '/robots.txt', '/sitemap.xml']) {
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

test('cabeçalhos de segurança', { skip: !online }, async () => {
  const h = (await get('/')).headers;
  assert.match(h.get('content-security-policy') ?? '', /default-src 'self'/);
  assert.match(h.get('content-security-policy') ?? '', /frame-ancestors 'none'/);
  assert.match(h.get('content-security-policy') ?? '', /object-src 'none'/);
  assert.equal(h.get('x-frame-options'), 'DENY');
  assert.equal(h.get('x-content-type-options'), 'nosniff');
  assert.match(h.get('strict-transport-security') ?? '', /max-age=\d{8}/);
  assert.match(h.get('permissions-policy') ?? '', /geolocation=\(\)/);
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

// ---------- rastreamento removido (022): GPS, mapas e REST de pedidos não existem mais (a entrega com entregador continua) ----------
test('rotas do rastreamento removidas respondem 404', { skip: !online }, async () => {
  for (const p of ['/api/maps/base', '/api/maps/config', `/api/entregas/${UUID0}/posicao`, '/api/courier/location', `/api/orders/${UUID0}`, `/api/orders/${UUID0}/tracking`, '/api/cron/mapas', '/api/admin/google-teste']) {
    assert.equal((await get(p)).status, 404, p);
  }
});

test('CSP sem domínios do Google Maps em script/img/connect', { skip: !online }, async () => {
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

test('CSP libera o WebSocket do Supabase Realtime (wss://), senão o "Ao vivo" nunca conecta', { skip: !online }, async () => {
  const cc = ((await get('/')).headers.get('content-security-policy') ?? '').split(';').find(x => x.trim().startsWith('connect-src')) ?? '';
  const https = cc.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0];
  if (!https) return; // build sem NEXT_PUBLIC_SUPABASE_URL
  assert.ok(cc.includes(https.replace('https://', 'wss://')), cc);
});

test('SEO: canonical, sitemap e JSON-LD apontam para o mesmo domínio que responde; cardápio com Menu e preços', { skip: !online }, async () => {
  const html = await (await get('/')).text();
  const canon = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  assert.ok(canon && !canon.includes('mdogao.com.br'), `canonical ${canon}`);
  const base = new URL(canon).origin;
  assert.match(await (await get('/sitemap.xml')).text(), new RegExp(`<loc>${base}/cardapio</loc>`));
  assert.match(await (await get('/robots.txt')).text(), new RegExp(`Sitemap: ${base}/sitemap.xml`));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.+?)<\/script>/)[1]);
  const r = ld['@graph'].find(x => x['@id']?.endsWith('#restaurante'));
  assert.equal(r.url, base); assert.ok(r.openingHoursSpecification.length > 0); assert.equal(r.hasMenu, `${base}/cardapio`);
  const menu = JSON.parse((await (await get('/cardapio')).text()).match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema.org","@type":"Menu".+?)<\/script>/)[1]);
  const itens = menu.hasMenuSection.flatMap(s => s.hasMenuItem);
  assert.ok(itens.length > 50 && itens.some(i => i.offers?.[0]?.priceCurrency === 'BRL'));
});
