// Provedores de rota (RoutingProvider) e de mapa (MapProvider). Escolha e fallback ficam em lib/mapas/servico.ts.
//   Rota: OsrmRoutingProvider (padrão, self-hosted, custo zero) | GoogleRoutingProvider (opcional, com cota)
//         | EstimativaRoutingProvider (último recurso: Haversine x fator de ruas, nunca falha)
//   Mapa: SelfHostedMapProvider (Leaflet + PMTiles do VPS) | GoogleMapProvider (tiles do Google via proxy do backend)
// A chave do Google só existe aqui no servidor: o navegador recebe URLs do nosso domínio, nunca a chave.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { etaEstimada } from '@/lib/regras';

export type Ponto = { lat: number; lng: number };
export type NomeRota = 'osrm' | 'google' | 'estimativa';
export type Rota = { minutos: number; km: number; polyline: string | null; provedor: NomeRota };

export interface RoutingProvider {
  readonly nome: NomeRota;
  rota(origem: Ponto, destino: Ponto): Promise<Rota | null>;
}

const TEMPO_MS = 5000;
const pt = (p: Ponto) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`;

export class OsrmRoutingProvider implements RoutingProvider {
  readonly nome = 'osrm' as const;
  private base: string; private token: string; private f: typeof fetch;
  constructor(base: string, token: string, f: typeof fetch = fetch) { this.base = base; this.token = token; this.f = f; }
  private get(caminho: string) {
    return this.f(`${this.base}${caminho}`, { headers: { 'X-Mapas-Token': this.token }, signal: AbortSignal.timeout(TEMPO_MS), cache: 'no-store' });
  }
  async rota(o: Ponto, d: Ponto): Promise<Rota | null> {
    const r = await this.get(`/route/v1/driving/${pt(o)};${pt(d)}?overview=full&geometries=polyline`);
    const j = await r.json().catch(() => null);
    const x = j?.routes?.[0];
    if (!r.ok || j?.code !== 'Ok' || !Number.isFinite(x?.duration)) return null;
    return { minutos: Math.max(1, Math.round(x.duration / 60)), km: Math.round((x.distance ?? 0) / 100) / 10, polyline: typeof x.geometry === 'string' ? x.geometry : null, provedor: 'osrm' };
  }
  // map matching: encaixa as últimas posições do GPS nas ruas; devolve o último ponto ajustado (ou null)
  async ajustar(pontos: (Ponto & { t: number; prec: number })[]): Promise<Ponto | null> {
    if (pontos.length < 2) return null;
    const ps = pontos.slice(-8);
    const q = `/match/v1/driving/${ps.map(pt).join(';')}?timestamps=${ps.map(p => Math.round(p.t / 1000)).join(';')}` +
      `&radiuses=${ps.map(p => Math.min(50, Math.max(5, Math.round(p.prec)))).join(';')}&overview=false&gaps=ignore&tidy=true`;
    const r = await this.get(q);
    const j = await r.json().catch(() => null);
    const w = Array.isArray(j?.tracepoints) ? j.tracepoints.filter(Boolean).at(-1) : null;
    const [lng, lat] = Array.isArray(w?.location) ? w.location : [];
    return r.ok && j?.code === 'Ok' && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }
}

// Routes API, faixa Essentials (sem trânsito): a cota grátis é a maior. Erro/timeout -> null (o serviço cai no OSRM).
export class GoogleRoutingProvider implements RoutingProvider {
  readonly nome = 'google' as const;
  private chave: string; private f: typeof fetch;
  constructor(chave: string, f: typeof fetch = fetch) { this.chave = chave; this.f = f; }
  async rota(o: Ponto, d: Ponto): Promise<Rota | null> {
    const r = await this.f('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': this.chave, 'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline' },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: o.lat, longitude: o.lng } } },
        destination: { location: { latLng: { latitude: d.lat, longitude: d.lng } } },
        travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE', languageCode: 'pt-BR', regionCode: 'BR',
      }),
      signal: AbortSignal.timeout(TEMPO_MS), cache: 'no-store',
    });
    const j = await r.json().catch(() => null);
    const x = j?.routes?.[0];
    const seg = Number(String(x?.duration ?? '').replace('s', ''));
    // erro do Google (chave, API não ativada, faturamento): o motivo vai para o registro de chamadas (Admin → Dev · Mapas)
    if (!r.ok) throw Object.assign(new Error(String(j?.error?.message ?? '')), { name: `${r.status} ${j?.error?.message ?? j?.error?.status ?? ''}`.trim() });
    if (!x || !Number.isFinite(seg)) return null;
    return { minutos: Math.max(1, Math.round(seg / 60)), km: Math.round((x.distanceMeters ?? 0) / 100) / 10, polyline: x.polyline?.encodedPolyline ?? null, provedor: 'google' };
  }
}

export class EstimativaRoutingProvider implements RoutingProvider {
  readonly nome = 'estimativa' as const;
  async rota(o: Ponto, d: Ponto): Promise<Rota> { return { ...etaEstimada(o, d), polyline: null, provedor: 'estimativa' }; }
}

// ---------- mapa ----------
// O que o navegador recebe para desenhar o mapa. Nenhuma chave: só URLs do próprio site/VPS.
export type MapaConfig = {
  provedor: 'proprio' | 'google' | 'simples';   // simples = sem tiles (só marcadores e rota sobre fundo neutro)
  tipo: 'pmtiles' | 'raster' | null;
  tiles: string | null;
  atribuicao: string;
  maxZoom: number;
  fallback: boolean;                            // true = não é o mapa pretendido (Google sem cota/erro, ou sem tiles)
  expira: number;                               // ms epoch: quando pedir a configuração de novo
};

export interface MapProvider {
  readonly nome: MapaConfig['provedor'];
  config(pedido: string, agora: number): MapaConfig | null;
}

const SESSAO_MS = 2 * 60 * 60_000; // uma sessão de rastreamento: o mapa é carregado (e contado) uma vez

export class SelfHostedMapProvider implements MapProvider {
  readonly nome = 'proprio' as const;
  private url: string;
  constructor(url: string) { this.url = url; }
  config(_p: string, agora: number): MapaConfig | null {
    if (!this.url) return null;
    return { provedor: 'proprio', tipo: 'pmtiles', tiles: this.url, atribuicao: '© OpenStreetMap · Protomaps', maxZoom: 17, fallback: false, expira: agora + SESSAO_MS };
  }
}

export class GoogleMapProvider implements MapProvider {
  readonly nome = 'google' as const;
  private segredo: string;
  constructor(segredo: string) { this.segredo = segredo; }
  config(pedido: string, agora: number): MapaConfig | null {
    if (!this.segredo) return null;
    const t = assinarTiles(pedido, agora + SESSAO_MS, this.segredo);
    return { provedor: 'google', tipo: 'raster', tiles: `/api/maps/tiles/{z}/{x}/{y}?t=${t}`, atribuicao: 'Dados do mapa © Google', maxZoom: 19, fallback: false, expira: agora + SESSAO_MS };
  }
}

// Link do proxy de tiles: pedido + validade, assinados com HMAC-SHA256. Sem o segredo ninguém usa o proxy (e a cota).
export function assinarTiles(pedido: string, expira: number, segredo: string) {
  const corpo = Buffer.from(JSON.stringify({ p: pedido, e: expira })).toString('base64url');
  return `${corpo}.${createHmac('sha256', segredo).update(corpo).digest('base64url')}`;
}
export function verificarTiles(token: string, segredo: string, agora: number): { pedido: string } | null {
  if (!segredo || typeof token !== 'string' || token.length > 400) return null;
  const [corpo, sig] = token.split('.');
  if (!corpo || !sig) return null;
  const esperado = Buffer.from(createHmac('sha256', segredo).update(corpo).digest('base64url'));
  const recebido = Buffer.from(sig);
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) return null;
  try {
    const j = JSON.parse(Buffer.from(corpo, 'base64url').toString());
    return typeof j?.p === 'string' && Number.isFinite(j?.e) && j.e > agora ? { pedido: j.p } : null;
  } catch { return null; }
}
