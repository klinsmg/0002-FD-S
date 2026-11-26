// Serviço de rotas e mapa: escolhe o provedor, controla a cota do Google, usa o cache e garante o fallback.
//   GPS do entregador  = atualização local, barata e frequente (não passa por aqui a cada envio)
//   Rota do Google     = cálculo caro, raro e controlado (gatilho real + intervalo + cota + elegibilidade)
//   OSRM               = fallback sempre disponível; Estimativa (Haversine) se o OSRM cair
//   Mapa               = carregado uma vez por sessão de rastreamento (1 evento map_load quando é Google)
//   ETA                = estimada localmente entre recálculos (lib/regras.ts: etaLocal)
import { chaveRota, distanciaM } from '@/lib/regras';
import { clienteServico } from '@/lib/supabase/servico';
import { configMapas, emPico, type ConfigMapas } from './config';
import {
  EstimativaRoutingProvider, GoogleMapProvider, GoogleRoutingProvider, OsrmRoutingProvider, SelfHostedMapProvider,
  type MapaConfig, type Ponto, type Rota,
} from './provedores';

export type Sku = 'routes' | 'map_load' | 'map_tiles';
export type Reserva = 'ok' | 'soft' | 'blocked';
export type Chamada = {
  order_id?: string | null; delivery_id?: string | null; restaurant_id?: string | null; courier_id?: string | null;
  provider: 'google' | 'osrm' | 'estimativa' | 'proprio'; sku?: Sku | null; endpoint: string; status: string; latency_ms?: number | null; cost_estimate?: number;
};
// custo de referência por 1.000 eventos ACIMA da cota grátis (USD, tabela pública; confira a atual). Dentro da cota = 0.
export const PRECO_MIL: Record<Sku, number> = { routes: 5, map_load: 7, map_tiles: 0.6 };

// Dependências injetáveis (testes usam versões em memória)
export type Deps = {
  cfg: ConfigMapas;
  reservar(sku: Sku, cap: number, softPct: number): Promise<Reserva>;
  registrar(c: Chamada): Promise<void>;
  lerCache(chave: string): Promise<Rota | null>;
  gravarCache(chave: string, r: Rota, ttlMs: number): Promise<void>;
  // o mapa Google deste pedido já foi carregado (e contado) na sessão atual? Recarregar a página não gasta de novo.
  mapaJaContado(pedido: string, desdeMs: number): Promise<boolean>;
  fetch: typeof fetch;
  agora(): number;
};

export function depsPadrao(): Deps {
  const s = clienteServico();
  return {
    cfg: configMapas(),
    // sem a chave secreta não há controle de cota -> Google fica bloqueado (nunca gasta sem contar)
    async reservar(sku, cap, softPct) {
      if (!s) return 'blocked';
      const { data, error } = await s.rpc('google_reserve', { p_sku: sku, p_cap: cap, p_soft_pct: softPct });
      if (error) { console.error('[mapas] cota', error.message); return 'blocked'; }
      return data === 'ok' || data === 'soft' ? data : 'blocked';
    },
    async registrar(c) {
      if (!s) return;
      const { error } = await s.from('google_api_calls').insert({ cost_estimate: 0, ...c });
      if (error) console.error('[mapas] registro', error.message);
    },
    async lerCache(chave) {
      if (!s) return null;
      const { data } = await s.from('route_cache').select('provider, polyline, duration_s, distance_m, expires_at').eq('key', chave).maybeSingle();
      if (!data || new Date(data.expires_at).getTime() <= Date.now()) return null;
      return { minutos: Math.max(1, Math.round(data.duration_s / 60)), km: Math.round(data.distance_m / 100) / 10, polyline: data.polyline, provedor: data.provider as Rota['provedor'] };
    },
    async gravarCache(chave, r, ttl) {
      if (!s || r.provedor === 'estimativa') return;
      await s.from('route_cache').upsert({ key: chave, provider: r.provedor, polyline: r.polyline, duration_s: r.minutos * 60, distance_m: Math.round(r.km * 1000), expires_at: new Date(Date.now() + ttl).toISOString() });
    },
    async mapaJaContado(pedido, desde) {
      if (!s) return false;
      const { data } = await s.from('google_api_calls').select('id').eq('order_id', pedido).eq('provider', 'google').eq('sku', 'map_load')
        .gte('created_at', new Date(desde).toISOString()).limit(1);
      return !!data?.length;
    },
    fetch,
    agora: () => Date.now(),
  };
}

// ---------- elegibilidade do Google ----------
export type ContextoPedido = {
  id: string; status: string; customer_name?: string | null; restaurant_id?: string | null;
  restaurante?: { google_maps_enabled: boolean; plan: string; google_maps_percent: number } | null;
};
// fração estável do pedido (0-99) para o "percentual de pedidos com Google"
const balde = (id: string) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 100; };
export const ehTeste = (p: ContextoPedido) => /\b(teste|test)\b/i.test(p.customer_name ?? '');

export function googlePermitido(p: ContextoPedido, cfg: ConfigMapas, agora: number): { ok: boolean; motivo: string } {
  const g = cfg.google;
  if (!g.ligado) return { ok: false, motivo: 'desligado' };
  if (['pending', 'cancelled', 'delivered'].includes(p.status)) return { ok: false, motivo: 'status' };  // rascunho/encerrado
  if (ehTeste(p)) return { ok: false, motivo: 'teste' };
  const r = p.restaurante;
  if (!r?.google_maps_enabled) return { ok: false, motivo: 'restaurante' };
  if (!g.planos.includes(r.plan)) return { ok: false, motivo: 'plano' };
  if (balde(p.id) >= r.google_maps_percent) return { ok: false, motivo: 'percentual' };
  if (!emPico(g.pico, new Date(agora))) return { ok: false, motivo: 'fora_do_pico' };
  return { ok: true, motivo: 'ok' };
}

// ---------- rota ----------
export type PedidoRota = { pedido: ContextoPedido; entregaId?: string | null; entregadorId?: string | null; endpoint: string; podeGoogle: boolean };

// Rota com cache e fallback em cadeia: [Google se permitido e com cota] -> OSRM -> Estimativa. Nunca lança erro.
export async function calcularRota(o: Ponto, d: Ponto, x: PedidoRota, deps: Deps = depsPadrao()): Promise<Rota & { fallback: string | null }> {
  const { cfg } = deps;
  const base = { order_id: x.pedido.id, delivery_id: x.entregaId ?? null, restaurant_id: x.pedido.restaurant_id ?? null, courier_id: x.entregadorId ?? null, endpoint: x.endpoint };
  const chave = chaveRota(o, d, 'drive', deps.agora());
  const cache = await deps.lerCache(chave).catch(() => null);
  if (cache) return { ...cache, fallback: null };

  let fallback: string | null = null;
  const tentar = async (nome: 'google' | 'osrm', fn: () => Promise<Rota | null>, sku: Sku | null) => {
    const t0 = deps.agora();
    try {
      const r = await fn();
      await deps.registrar({ ...base, provider: nome, sku, status: r ? 'ok' : 'erro', latency_ms: deps.agora() - t0 });
      return r;
    } catch (e) {
      await deps.registrar({ ...base, provider: nome, sku, status: String((e as Error)?.name ?? 'erro').slice(0, 60), latency_ms: deps.agora() - t0 });
      return null;
    }
  };

  let rota: Rota | null = null, tentouGoogle = false;
  if (x.podeGoogle && googlePermitido(x.pedido, cfg, deps.agora()).ok) {
    tentouGoogle = true;
    const res = await deps.reservar('routes', cfg.google.capRotas, cfg.google.softPct);
    if (res === 'ok') {
      rota = await tentar('google', () => new GoogleRoutingProvider(cfg.google.chave, deps.fetch).rota(o, d), 'routes');
      if (!rota) fallback = 'google_falhou';
    } else fallback = res === 'soft' ? 'cota_perto_do_limite' : 'cota_esgotada';
  }
  // GOOGLE_MAPS_FALLBACK_PROVIDER=estimativa: quando o Google falha, pula o OSRM; sem Google na jogada, o OSRM é o padrão
  if (!rota && cfg.osrm && !(tentouGoogle && cfg.google.reserva === 'estimativa')) rota = await tentar('osrm', () => new OsrmRoutingProvider(cfg.osrm, cfg.token, deps.fetch).rota(o, d), null);
  if (!rota) {
    if (cfg.osrm) fallback ??= 'osrm_falhou';
    rota = await new EstimativaRoutingProvider().rota(o, d);
    await deps.registrar({ ...base, provider: 'estimativa', sku: null, status: fallback ? `fallback:${fallback}` : 'ok', latency_ms: 0 });
  } else if (fallback) {
    await deps.registrar({ ...base, provider: rota.provedor, sku: null, status: `fallback:${fallback}`, latency_ms: 0 });
  }
  await deps.gravarCache(chave, rota, cfg.google.cacheMs).catch(() => {});
  return { ...rota, fallback };
}

// Encaixa as últimas posições nas ruas (OSRM match). Sem OSRM ou erro: a última posição como veio.
export async function ajustarPosicao(pontos: (Ponto & { t: number; prec: number })[], deps: Deps = depsPadrao()): Promise<Ponto | null> {
  const ultimo = pontos.at(-1) ?? null;
  if (!deps.cfg.osrm || pontos.length < 2) return ultimo;
  try { return (await new OsrmRoutingProvider(deps.cfg.osrm, deps.cfg.token, deps.fetch).ajustar(pontos)) ?? ultimo; } catch { return ultimo; }
}

// ---------- mapa ----------
const SESSAO_MAPA_MS = 2 * 60 * 60_000;
// Google (se permitido, com segredo de assinatura e cota de map_load) -> tiles próprios -> mapa simples.
export async function configurarMapa(p: ContextoPedido, deps: Deps = depsPadrao()): Promise<MapaConfig> {
  const { cfg } = deps, agora = deps.agora();
  let fallback = false;
  if (cfg.google.mapaLigado && googlePermitido(p, cfg, agora).ok && cfg.hmac) {
    // 1 carregamento por pedido por sessão (2 h): pedir a configuração de novo não consome outra vez
    if (await deps.mapaJaContado(p.id, agora - SESSAO_MAPA_MS).catch(() => false)) return new GoogleMapProvider(cfg.hmac).config(p.id, agora)!;
    const res = await deps.reservar('map_load', cfg.google.capMapas, cfg.google.softPct);
    if (res === 'ok') {
      await deps.registrar({ order_id: p.id, restaurant_id: p.restaurant_id ?? null, provider: 'google', sku: 'map_load', endpoint: 'mapa', status: 'ok' });
      return new GoogleMapProvider(cfg.hmac).config(p.id, agora)!;
    }
    fallback = true;
    await deps.registrar({ order_id: p.id, restaurant_id: p.restaurant_id ?? null, provider: 'proprio', sku: null, endpoint: 'mapa', status: `fallback:${res === 'soft' ? 'cota_perto_do_limite' : 'cota_esgotada'}` });
  }
  const proprio = new SelfHostedMapProvider(cfg.tiles).config(p.id, agora);
  if (proprio) return { ...proprio, fallback };
  return { provedor: 'simples', tipo: null, tiles: null, atribuicao: '', maxZoom: 18, fallback: true, expira: agora + 30 * 60_000 };
}

// ---------- endereço (Nominatim próprio) ----------
export type Local = { lat: number; lng: number; preciso: boolean };
export async function geocodificar(e: { street?: string; number?: string; district?: string; city?: string; state?: string; zip_code?: string },
  deps: Pick<Deps, 'cfg' | 'fetch'> = depsPadrao()): Promise<Local | null> {
  const base = deps.cfg.nominatim;
  const cep = (e.zip_code ?? '').replace(/\D/g, '');
  // sem VPS: Nominatim público (1-2 chamadas por pedido, só o endereço, sem nome). Sem isto, toda entrega pedia coordenadas à mão.
  if (!base) {
    const g = await geocodificarTexto([`${e.street ?? ''}, ${e.number ?? ''}`, e.district, `${e.city ?? ''} ${e.state ?? ''}`, cep].filter(v => v?.replace(/[\s,]/g, '')).join(', '), deps);
    return g && { lat: g.lat, lng: g.lng, preciso: !g.aproximado };
  }
  const tentativas: Record<string, string>[] = [
    { street: `${e.number ?? ''} ${e.street ?? ''}`.trim(), city: e.city ?? '', state: e.state ?? '', postalcode: cep },
    { street: e.street ?? '', city: e.city ?? '', state: e.state ?? '' },
    ...(cep ? [{ postalcode: cep }] : []),
  ];
  for (const [i, t] of tentativas.entries()) {
    const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(t).filter(([, v]) => v)), country: 'Brasil', countrycodes: 'br', format: 'jsonv2', limit: '1', addressdetails: '0' });
    try {
      const r = await deps.fetch(`${base}/search?${qs}`, { headers: { 'X-Mapas-Token': deps.cfg.token }, signal: AbortSignal.timeout(5000), cache: 'no-store' });
      const j = await r.json().catch(() => null);
      const x = Array.isArray(j) ? j[0] : null;
      const lat = Number(x?.lat), lng = Number(x?.lon);
      if (r.ok && Number.isFinite(lat) && Number.isFinite(lng)) {
        // exato só no 1º formato e se o OSM achou o imóvel/número (casa); rua/CEP = aproximado
        const preciso = i === 0 && ['house', 'building', 'residential_building'].includes(String(x?.addresstype ?? x?.type));
        return { lat, lng, preciso };
      }
      if (!r.ok) return null;
    } catch { return null; }
  }
  return null;
}

// Endereço da loja em texto livre (Admin → Mapas; raro). Nominatim do VPS; sem VPS, o Nominatim público do OSM
// (política de uso: tráfego leve, 1 req/s, User-Agent próprio — aqui é 1 chamada por "Salvar loja").
export async function geocodificarTexto(q: string, deps: Pick<Deps, 'cfg' | 'fetch'> = depsPadrao()): Promise<(Ponto & { aproximado: boolean }) | null> {
  const proprio = deps.cfg.nominatim;
  const base = proprio || 'https://nominatim.openstreetmap.org';
  const headers: Record<string, string> = proprio ? { 'X-Mapas-Token': deps.cfg.token } : { 'User-Agent': 'mapas-admin/1.0 (geocodificacao ocasional)' };
  // o OSM não tem todas as ruas do Brasil: sem a rua, cai no CEP (centro do CEP = aproximado)
  const cep = q.match(/\b\d{5}-?\d{3}\b/)?.[0];
  const tentativas: Record<string, string>[] = [{ q: q.slice(0, 200) }, ...(cep ? [{ postalcode: cep.replace(/^(\d{5})(\d{3})$/, '$1-$2') }] : [])];
  for (const [i, t] of tentativas.entries()) {
    try {
      const r = await deps.fetch(`${base}/search?${new URLSearchParams({ ...t, countrycodes: 'br', format: 'jsonv2', limit: '1' })}`, { headers, signal: AbortSignal.timeout(6000), cache: 'no-store' });
      if (!r.ok) return null;
      const x = (await r.json().catch(() => null))?.[0];
      const lat = Number(x?.lat), lng = Number(x?.lon);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng, aproximado: i > 0 || !['house', 'building', 'place'].includes(String(x?.addresstype)) };
    } catch { return null; }
  }
  return null;
}

// Ponto do pedido aceito? (perto da loja; evita pino arrastado para outra cidade ou valor forjado)
export const pontoValido = (p: Ponto, loja: Ponto | null, maxM = 50000) =>
  Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && (!loja || distanciaM(p, loja) <= maxM);
