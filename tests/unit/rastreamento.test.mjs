// Rastreamento: regras puras, provedores (Google/OSRM/estimativa), cota, cache, fallback e mapa. fetch simulado: sem rede,
// sem banco. Respostas no formato real do OSRM (/route, /match), Nominatim (jsonv2) e Routes API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';

const raiz = pathToFileURL(process.cwd() + '/').href;
registerHooks({
  resolve: (s, c, next) => {
    if (s === 'server-only') return { url: 'data:text/javascript,export{}', shortCircuit: true };
    if (s.startsWith('@/')) return next(raiz + s.slice(2) + '.ts', c);
    if (/^\.\.?\//.test(s) && !/\.[a-z]+$/i.test(s) && c.parentURL?.endsWith('.ts')) return next(s + '.ts', c); // './config' -> './config.ts'
    return next(s, c);
  },
});
const R = await import('../../lib/regras.ts');
const S = await import('../../lib/mapas/servico.ts');
const P = await import('../../lib/mapas/provedores.ts');
const { emPico } = await import('../../lib/mapas/config.ts');
console.error = () => {}; console.warn = () => {};

const LOJA = { lat: -23.5367, lng: -46.9342 }, CASA = { lat: -23.5512, lng: -46.9101 };
const T0 = Date.UTC(2026, 10, 23, 22, 0, 0); // 19h em São Paulo

// configuração de teste (o que configMapas() montaria a partir do ambiente)
const cfg = (g = {}, x = {}) => ({
  osrm: 'https://mapas.test/osrm', nominatim: 'https://mapas.test/nominatim', tiles: 'https://mapas.test/tiles/regiao.pmtiles',
  token: 'tok', hmac: 'h'.repeat(40), ...x,
  google: { ligado: true, chave: 'AIza' + 'x'.repeat(35), mapaLigado: true, capRotas: 10000, capMapas: 10000, capTiles: 100000, intervaloMs: 120000,
    cacheMs: 600000, reserva: 'osrm', softPct: 95, pico: '', planos: ['basico', 'premium'], ...g },
});
const ok = b => ({ ok: true, status: 200, json: async () => b });
const falha = (st = 500) => ({ ok: false, status: st, json: async () => ({ error: { message: 'x' } }) });
const osrmOk = { code: 'Ok', routes: [{ duration: 540, distance: 3200, geometry: '_p~iF~ps|U_ulLnnqC' }] };
const googleOk = { routes: [{ duration: '420s', distanceMeters: 3000, polyline: { encodedPolyline: 'abc' } }] };

// deps em memória: conta chamadas por provedor, guarda o cache e o registro
function deps({ c = cfg(), reserva = 'ok', google = () => ok(googleOk), osrm = () => ok(osrmOk), nominatim = () => ok([]), agora = T0 } = {}) {
  const n = { google: 0, osrm: 0, nominatim: 0, reservas: [] }, cache = new Map(), log = [];
  const d = {
    cfg: c, agora: () => agora, n, cache, log,
    reservar: async (sku, cap, soft) => { n.reservas.push({ sku, cap, soft }); return typeof reserva === 'function' ? reserva(sku) : reserva; },
    registrar: async x => { log.push(x); },
    lerCache: async k => cache.get(k) ?? null,
    gravarCache: async (k, r) => { if (r.provedor !== 'estimativa') cache.set(k, r); },
    mapaJaContado: async id => log.some(x => x.order_id === id && x.provider === 'google' && x.sku === 'map_load'),
    fetch: async (url, init) => {
      const u = String(url);
      if (u.includes('googleapis.com')) { n.google++; return google(u, init); }
      if (u.includes('/osrm/')) { n.osrm++; assert.equal(init.headers['X-Mapas-Token'], 'tok'); return osrm(u, init); }
      if (u.includes('/nominatim/')) { n.nominatim++; return nominatim(u, init); }
      throw new Error('rede proibida no teste: ' + u);
    },
  };
  return d;
}
const pedido = (x = {}) => ({ id: '11111111-1111-1111-1111-111111111111', status: 'out_for_delivery', customer_name: 'Maria', restaurant_id: 'r1',
  restaurante: { google_maps_enabled: true, plan: 'basico', google_maps_percent: 100 }, ...x });
const ctx = (x = {}) => ({ pedido: pedido(x.pedido), entregaId: 'e1', entregadorId: 'k1', endpoint: 'teste', podeGoogle: true, ...x, ...(x.pedido ? { pedido: pedido(x.pedido) } : {}) });

// ---------- regras puras ----------
test('polyline: decodifica o exemplo oficial (precisão 5) e não quebra com lixo', () => {
  const p = R.decodificarPolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.deepEqual(p.map(x => [x.lat, x.lng]), [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]]);
  assert.deepEqual(R.decodificarPolyline(''), []);
  assert.ok(Array.isArray(R.decodificarPolyline('\u0000\u0001zzz')));
  assert.equal(R.decodificarPolyline('_p~iF~ps|U'.repeat(10), 3).length, 3, 'limite de pontos');
});

test('desvio: distância até a rota', () => {
  const rota = [{ lat: -23.5, lng: -46.9 }, { lat: -23.5, lng: -46.8 }];
  assert.ok(R.distanciaAteRota({ lat: -23.5, lng: -46.85 }, rota) < 1);
  const d = R.distanciaAteRota({ lat: -23.502, lng: -46.85 }, rota);
  assert.ok(d > 200 && d < 240, String(d));
  assert.equal(R.distanciaAteRota({ lat: 0, lng: 0 }, []), Infinity);
});

test('ETA local: mistura ETA da rota (menos o decorrido) com distância/velocidade; sem dados, estimativa urbana', () => {
  assert.equal(R.etaLocal({ etaRotaMin: 10, calculadoEm: T0, agora: T0 + 4 * 60000, restanteM: null, velocidades: [] }), 6);
  const v = R.etaLocal({ etaRotaMin: 10, calculadoEm: T0, agora: T0, restanteM: 3000, velocidades: [30, 30, 30] });
  assert.equal(v, Math.round((10 + (3000 * 1.3 / 1000 / 30) * 60) / 2));
  assert.equal(R.etaLocal({ etaRotaMin: null, calculadoEm: null, agora: T0, restanteM: 2500, velocidades: [] }), Math.round(2500 * 1.4 / 1000 / 25 * 60));
  assert.equal(R.etaLocal({ etaRotaMin: 1, calculadoEm: T0, agora: T0 + 10 * 60000, restanteM: null, velocidades: [] }), 1, 'nunca abaixo de 1 min');
  assert.equal(R.etaLocal({ etaRotaMin: null, calculadoEm: null, agora: T0, restanteM: null, velocidades: [] }), null);
  assert.equal(R.etaLocal({ etaRotaMin: null, calculadoEm: null, agora: T0, restanteM: 3000, velocidades: [0, 1, 900] }), Math.round(3000 * 1.4 / 1000 / 25 * 60), 'velocidades absurdas ignoradas');
});

test('quando recalcular: 1ª rota sempre; nada antes de 2 min; gatilhos podem usar Google; periódico só OSRM', () => {
  const base = { agora: T0, intervaloMs: 120000, posicao: { lat: -23.54, lng: -46.93 }, destino: CASA, rota: [] };
  assert.deepEqual(R.deveRecalcular({ ...base, ultimaRotaEm: null }), { recalcular: true, motivo: 'inicio', podeGoogle: true });
  assert.equal(R.deveRecalcular({ ...base, ultimaRotaEm: T0 - 119000, manual: true, virouEmRota: true }).recalcular, false, 'intervalo segura até o manual');
  assert.equal(R.deveRecalcular({ ...base, ultimaRotaEm: T0 - 120000, manual: true }).motivo, 'manual');
  assert.equal(R.deveRecalcular({ ...base, ultimaRotaEm: T0 - 130000, virouEmRota: true }).motivo, 'em_rota');
  const rota = [{ lat: -23.54, lng: -46.95 }, { lat: -23.54, lng: -46.90 }];
  assert.equal(R.deveRecalcular({ ...base, ultimaRotaEm: T0 - 130000, rota, posicao: { lat: -23.545, lng: -46.93 } }).motivo, 'desvio');
  assert.equal(R.deveRecalcular({ ...base, ultimaRotaEm: T0 - 130000, posicao: { lat: CASA.lat + 0.003, lng: CASA.lng } }).motivo, 'perto');
  const p = R.deveRecalcular({ ...base, ultimaRotaEm: T0 - 130000, rota, posicao: { lat: -23.54, lng: -46.93 } });
  assert.deepEqual(p, { recalcular: true, motivo: 'periodico', podeGoogle: false });
});

test('chave do cache: origem/destino ~100 m, modo e janela de 15 min', () => {
  const a = R.chaveRota({ lat: -23.53671, lng: -46.93419 }, CASA, 'drive', T0);
  assert.equal(a, R.chaveRota({ lat: -23.53702, lng: -46.93448 }, CASA, 'drive', T0 + 60000), 'mesmos ~100 m e mesma janela');
  assert.notEqual(a, R.chaveRota(LOJA, CASA, 'drive', T0 + 16 * 60000), 'outra janela de horário');
  assert.notEqual(a, R.chaveRota(LOJA, CASA, 'bike', T0), 'outro modo');
});

test('coordenadas coladas pela loja', () => {
  assert.deepEqual(R.lerCoords(' -23.5367, -46.9342 '), { lat: -23.5367, lng: -46.9342 });
  assert.deepEqual(R.lerCoords('-23.5367 -46.9342'), { lat: -23.5367, lng: -46.9342 });
  for (const x of ['', 'abc', '-123.4, 10', '1,2,3', '-23.5;', "-23.5, -46.9'; drop table"]) assert.equal(R.lerCoords(x), null, x);
  assert.ok(S.pontoValido({ lat: -23.55, lng: -46.91 }, LOJA));
  assert.ok(!S.pontoValido({ lat: -22.9, lng: -43.2 }, LOJA), 'Rio fica a > 50 km');
});

test('horário de pico (São Paulo), inclusive virando a meia-noite', () => {
  assert.equal(emPico('', new Date(T0)), true);
  assert.equal(emPico('18-23', new Date(T0)), true);   // 19h
  assert.equal(emPico('11-14', new Date(T0)), false);
  assert.equal(emPico('22-2', new Date(Date.UTC(2026, 10, 24, 4))), true); // 1h
  assert.equal(emPico('lixo', new Date(T0)), false);
});

// ---------- provedores e serviço de rota ----------
test('Google com cota: usa o Google (1 chamada), grava cache e registra', async () => {
  const d = deps();
  const r = await S.calcularRota(LOJA, CASA, ctx(), d);
  assert.equal(r.provedor, 'google'); assert.equal(r.minutos, 7); assert.equal(r.fallback, null);
  assert.equal(d.n.google, 1); assert.equal(d.n.osrm, 0);
  assert.deepEqual(d.n.reservas, [{ sku: 'routes', cap: 10000, soft: 95 }]);
  assert.ok(d.log.some(x => x.provider === 'google' && x.sku === 'routes' && x.status === 'ok' && x.order_id && x.courier_id === 'k1' && x.restaurant_id === 'r1'));
});

test('cache: a 2ª rota igual não chama ninguém', async () => {
  const d = deps();
  await S.calcularRota(LOJA, CASA, ctx(), d);
  const r = await S.calcularRota({ lat: LOJA.lat + 0.0001, lng: LOJA.lng - 0.0001 }, CASA, ctx(), d);
  assert.equal(r.provedor, 'google'); assert.equal(d.n.google, 1); assert.equal(d.n.reservas.length, 1);
});

test('cota esgotada: OSRM na hora, fallback registrado, zero chamada ao Google', async () => {
  const d = deps({ reserva: 'blocked' });
  const r = await S.calcularRota(LOJA, CASA, ctx(), d);
  assert.equal(r.provedor, 'osrm'); assert.equal(r.fallback, 'cota_esgotada'); assert.equal(d.n.google, 0);
  assert.ok(d.log.some(x => x.status === 'fallback:cota_esgotada'));
});

test('cota perto do limite (soft): OSRM, sem consumir', async () => {
  const d = deps({ reserva: 'soft' });
  const r = await S.calcularRota(LOJA, CASA, ctx(), d);
  assert.equal(r.provedor, 'osrm'); assert.equal(r.fallback, 'cota_perto_do_limite'); assert.equal(d.n.google, 0);
});

test('Google falha (erro/timeout): OSRM sem interromper', async () => {
  for (const google of [() => falha(500), () => { throw Object.assign(new Error('t'), { name: 'TimeoutError' }); }, () => ok({ routes: [] })]) {
    const d = deps({ google });
    const r = await S.calcularRota(LOJA, CASA, ctx(), d);
    assert.equal(r.provedor, 'osrm'); assert.equal(r.fallback, 'google_falhou');
  }
});

test('Google e OSRM caem: estimativa Haversine, rastreio segue', async () => {
  const d = deps({ google: () => falha(), osrm: () => falha(503) });
  const r = await S.calcularRota(LOJA, CASA, ctx(), d);
  assert.equal(r.provedor, 'estimativa'); assert.ok(r.minutos >= 1 && r.km > 0); assert.equal(r.polyline, null);
  assert.ok(d.log.some(x => x.provider === 'estimativa' && x.status.startsWith('fallback:')));
});

test('reserva = estimativa: Google falhou -> pula o OSRM', async () => {
  const d = deps({ c: cfg({ reserva: 'estimativa' }), google: () => falha() });
  const r = await S.calcularRota(LOJA, CASA, ctx(), d);
  assert.equal(r.provedor, 'estimativa'); assert.equal(d.n.osrm, 0);
});

test('sem Google configurado: 100% OSRM, nenhuma reserva nem chamada ao Google', async () => {
  const d = deps({ c: cfg({ ligado: false, chave: '', mapaLigado: false }) });
  const r = await S.calcularRota(LOJA, CASA, ctx(), d);
  assert.equal(r.provedor, 'osrm'); assert.equal(r.fallback, null); assert.equal(d.n.google, 0); assert.equal(d.n.reservas.length, 0);
});

test('sem Google e sem VPS: estimativa local, sem nenhuma requisição', async () => {
  const d = deps({ c: cfg({ ligado: false, chave: '' }, { osrm: '', nominatim: '', tiles: '' }) });
  const r = await S.calcularRota(LOJA, CASA, ctx(), d);
  assert.equal(r.provedor, 'estimativa'); assert.equal(d.n.google + d.n.osrm, 0); assert.equal(r.fallback, null);
});

test('recálculo periódico (sem gatilho) nunca usa o Google, mesmo com cota', async () => {
  const d = deps();
  const r = await S.calcularRota(LOJA, CASA, ctx({ podeGoogle: false }), d);
  assert.equal(r.provedor, 'osrm'); assert.equal(d.n.google, 0); assert.equal(d.n.reservas.length, 0);
});

test('elegibilidade do Google: teste, rascunho, cancelado, entregue, restaurante, plano, percentual e pico', () => {
  const c = cfg();
  const motivo = x => S.googlePermitido(pedido(x), c, T0).motivo;
  assert.equal(motivo({}), 'ok');
  assert.equal(motivo({ customer_name: 'Pedido TESTE da loja' }), 'teste');
  assert.equal(motivo({ status: 'pending' }), 'status');
  assert.equal(motivo({ status: 'cancelled' }), 'status');
  assert.equal(motivo({ status: 'delivered' }), 'status');
  assert.equal(motivo({ restaurante: null }), 'restaurante');
  assert.equal(motivo({ restaurante: { google_maps_enabled: false, plan: 'premium', google_maps_percent: 100 } }), 'restaurante');
  assert.equal(S.googlePermitido(pedido(), cfg({ planos: ['premium'] }), T0).motivo, 'plano');
  assert.equal(motivo({ restaurante: { google_maps_enabled: true, plan: 'basico', google_maps_percent: 0 } }), 'percentual');
  assert.equal(S.googlePermitido(pedido(), cfg({ pico: '11-14' }), T0).motivo, 'fora_do_pico');
  assert.equal(S.googlePermitido(pedido(), cfg({ ligado: false }), T0).motivo, 'desligado');
  // percentual estável por pedido: ~metade dos pedidos com 50%
  const ids = Array.from({ length: 400 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`);
  const com = ids.filter(id => S.googlePermitido(pedido({ id, restaurante: { google_maps_enabled: true, plan: 'basico', google_maps_percent: 50 } }), c, T0).ok).length;
  assert.ok(com > 120 && com < 280, String(com));
});

test('pedido não elegível (ex.: teste) não chama o Google mesmo em gatilho', async () => {
  const d = deps();
  const r = await S.calcularRota(LOJA, CASA, ctx({ pedido: { customer_name: 'teste' } }), d);
  assert.equal(r.provedor, 'osrm'); assert.equal(d.n.google, 0); assert.equal(d.n.reservas.length, 0);
});

test('entrega de 20 min com GPS a cada 15 s: Google só no início; recálculo no máximo a cada 2 min', async () => {
  const d = deps();
  let ultima = null, rota = [], recalculos = 0;
  const caminho = t => ({ lat: LOJA.lat + (CASA.lat - LOJA.lat) * t, lng: LOJA.lng + (CASA.lng - LOJA.lng) * t });
  for (let s = 0; s <= 20 * 60; s += 15) {
    const agora = T0 + s * 1000, pos = caminho(Math.min(1, s / (20 * 60)) * 0.6); // não chega perto do destino
    d.agora = () => agora;
    const dec = R.deveRecalcular({ agora, ultimaRotaEm: ultima, intervaloMs: 120000, posicao: pos, destino: CASA, rota });
    if (!dec.recalcular) continue;
    recalculos++;
    const r = await S.calcularRota(pos, CASA, ctx({ podeGoogle: dec.podeGoogle }), d);
    ultima = agora; rota = [caminho(0), caminho(1)];
    assert.ok(r.minutos >= 1);
  }
  assert.equal(d.n.google, 1, `${d.n.google} chamadas ao Google em 81 envios de GPS`);
  assert.ok(recalculos <= 11 && recalculos >= 9, `recálculos: ${recalculos}`);
});

test('map matching: usa o ponto encaixado do OSRM; sem OSRM, a última posição', async () => {
  const pts = [{ lat: -23.54, lng: -46.93, t: T0, prec: 8 }, { lat: -23.541, lng: -46.931, t: T0 + 15000, prec: 8 }];
  const d = deps({ osrm: u => { assert.match(u, /\/match\/v1\/driving\/.*timestamps=.*radiuses=/); return ok({ code: 'Ok', tracepoints: [null, { location: [-46.9312, -23.5409] }] }); } });
  assert.deepEqual(await S.ajustarPosicao(pts, d), { lat: -23.5409, lng: -46.9312 });
  assert.deepEqual(await S.ajustarPosicao(pts, deps({ c: cfg({}, { osrm: '' }) })), pts[1]);
  assert.deepEqual(await S.ajustarPosicao(pts, deps({ osrm: () => falha() })), pts[1]);
});

// ---------- mapa ----------
test('mapa Google: 1 map_load por sessão, tiles pelo NOSSO proxy assinado, sem chave', async () => {
  const d = deps();
  const m = await S.configurarMapa(pedido(), d);
  assert.equal(m.provedor, 'google'); assert.equal(m.tipo, 'raster'); assert.match(m.tiles, /^\/api\/maps\/tiles\/\{z\}\/\{x\}\/\{y\}\?t=/);
  assert.ok(!JSON.stringify(m).includes('AIza'), 'a chave nunca vai ao navegador');
  assert.deepEqual(d.n.reservas.map(x => x.sku), ['map_load']);
  assert.ok(m.expira - T0 >= 3_600_000, 'sessão de rastreamento longa');
  const m2 = await S.configurarMapa(pedido(), d);
  assert.equal(m2.provedor, 'google'); assert.equal(d.n.reservas.length, 1, 'recarregar a página não conta outro map_load');
  await S.configurarMapa(pedido({ id: '22222222-2222-2222-2222-222222222222' }), d);
  assert.equal(d.n.reservas.length, 2, 'outro pedido conta o seu');
});

test('mapa: sem cota -> próprio com aviso de fallback; sem tiles -> simples; Google desligado -> próprio sem aviso', async () => {
  const a = await S.configurarMapa(pedido(), deps({ reserva: 'blocked' }));
  assert.equal(a.provedor, 'proprio'); assert.equal(a.fallback, true);
  const b = await S.configurarMapa(pedido(), deps({ reserva: 'blocked', c: cfg({}, { tiles: '' }) }));
  assert.equal(b.provedor, 'simples'); assert.equal(b.fallback, true);
  const c = await S.configurarMapa(pedido(), deps({ c: cfg({ ligado: false, mapaLigado: false }) }));
  assert.equal(c.provedor, 'proprio'); assert.equal(c.fallback, false); assert.equal(c.tipo, 'pmtiles');
  const e = await S.configurarMapa(pedido(), deps({ c: cfg({}, { hmac: '' }) }));
  assert.equal(e.provedor, 'proprio', 'sem segredo de assinatura, nada de mapa Google');
});

test('link assinado dos tiles (HMAC): válido, adulterado, vencido, outro segredo', () => {
  const seg = 's'.repeat(40), t = P.assinarTiles('pedido-1', T0 + 60000, seg);
  assert.deepEqual(P.verificarTiles(t, seg, T0), { pedido: 'pedido-1' });
  const [corpo, sig] = t.split('.');
  const outro = Buffer.from(JSON.stringify({ p: 'pedido-2', e: T0 + 60000 })).toString('base64url');
  assert.equal(P.verificarTiles(`${outro}.${sig}`, seg, T0), null, 'corpo trocado');
  assert.equal(P.verificarTiles(`${corpo}.${sig.slice(0, -2)}xx`, seg, T0), null, 'assinatura adulterada');
  assert.equal(P.verificarTiles(t, seg, T0 + 61000), null, 'vencido');
  assert.equal(P.verificarTiles(t, 'o'.repeat(40), T0), null, 'outro segredo');
  assert.equal(P.verificarTiles(t, '', T0), null, 'sem segredo');
  for (const x of ['', '.', 'a.b.c', 'x'.repeat(500)]) assert.equal(P.verificarTiles(x, seg, T0), null);
});

// ---------- endereço ----------
test('Nominatim próprio: número da casa = exato; rua/CEP = aproximado; nada = null; sem VPS = sem requisição', async () => {
  const end = { street: 'Rua A', number: '10', district: 'Centro', city: 'Itapevi', state: 'SP', zip_code: '06653-000' };
  const casa = deps({ nominatim: u => { assert.match(u, /format=jsonv2/); assert.match(u, /countrycodes=br/); return ok([{ lat: '-23.55', lon: '-46.91', addresstype: 'house' }]); } });
  assert.deepEqual(await S.geocodificar(end, casa), { lat: -23.55, lng: -46.91, preciso: true });
  let n = 0;
  const rua = deps({ nominatim: () => (++n === 1 ? ok([]) : ok([{ lat: '-23.5', lon: '-46.9', addresstype: 'road' }])) });
  assert.deepEqual(await S.geocodificar(end, rua), { lat: -23.5, lng: -46.9, preciso: false });
  assert.equal(await S.geocodificar(end, deps({ nominatim: () => ok([]) })), null);
  assert.equal(await S.geocodificar(end, deps({ nominatim: () => falha(403) })), null);
  const semVps = deps({ c: cfg({}, { nominatim: '' }) });
  assert.equal(await S.geocodificar(end, semVps), null); assert.equal(semVps.n.nominatim, 0);
});
