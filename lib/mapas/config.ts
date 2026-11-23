// Configuração do rastreamento (só servidor). Nada daqui vai ao navegador: o frontend recebe apenas a configuração
// segura do mapa (provedor, URL dos tiles, atribuição) montada em lib/mapas/servico.ts.
//
// Infra própria (VPS, ver infra/README.md):
//   MAPAS_URL            base HTTPS do VPS (ex.: https://mapas.mdogao.com.br) -> /osrm, /nominatim e /tiles
//   OSRM_BASE_URL        opcional; padrão MAPAS_URL/osrm
//   NOMINATIM_BASE_URL   opcional; padrão MAPAS_URL/nominatim
//   MAPAS_TILES_URL      opcional; padrão MAPAS_URL/tiles/regiao.pmtiles
//   MAPAS_TOKEN          segredo enviado no cabeçalho X-Mapas-Token (o Nginx do VPS recusa sem ele)
//   MAPAS_HMAC_SECRET    assina os links curtos do proxy de tiles do Google (sem ele, o mapa Google fica desligado)
// Google (opcional, desligado por padrão):
//   GOOGLE_MAPS_ENABLED=true, GOOGLE_MAPS_API_KEY (chave de SERVIDOR), GOOGLE_MAPS_MONTHLY_ROUTE_CAP, _MAP_CAP, _TILE_CAP,
//   GOOGLE_ROUTE_RECALC_INTERVAL_MINUTES, GOOGLE_ROUTE_CACHE_TTL_MINUTES, GOOGLE_MAPS_FALLBACK_PROVIDER (osrm|estimativa),
//   GOOGLE_MAPS_SOFT_LIMIT_PCT, GOOGLE_MAPS_PEAK_HOURS (ex.: "11-14,18-23"; vazio = o dia todo), GOOGLE_MAPS_PLANS
//   (planos de restaurante com Google; padrão "basico,premium"), GOOGLE_MAPS_MAP_ENABLED (mapa Google além da rota).
const env = (k: string) => (process.env[k] ?? '').trim();
const inteiro = (k: string, padrao: number, min: number, max: number) => {
  const n = Number(env(k));
  return Number.isFinite(n) && env(k) !== '' ? Math.min(max, Math.max(min, Math.round(n))) : padrao;
};
const https = (v: string) => { try { const u = new URL(v); return u.protocol === 'https:' || u.hostname === 'localhost' || u.hostname === '127.0.0.1' ? v.replace(/\/+$/, '') : ''; } catch { return ''; } };

export function configMapas() {
  const base = https(env('MAPAS_URL'));
  const chave = env('GOOGLE_MAPS_API_KEY');
  const googleLigado = env('GOOGLE_MAPS_ENABLED') === 'true' && /^AIza[0-9A-Za-z_-]{35}$/.test(chave);
  return {
    osrm: https(env('OSRM_BASE_URL')) || (base && `${base}/osrm`),
    nominatim: https(env('NOMINATIM_BASE_URL')) || (base && `${base}/nominatim`),
    tiles: https(env('MAPAS_TILES_URL')) || (base && `${base}/tiles/regiao.pmtiles`),
    token: env('MAPAS_TOKEN'),
    hmac: env('MAPAS_HMAC_SECRET').length >= 32 ? env('MAPAS_HMAC_SECRET') : '',
    google: {
      ligado: googleLigado,
      chave: googleLigado ? chave : '',
      mapaLigado: googleLigado && env('GOOGLE_MAPS_MAP_ENABLED') !== 'false',
      capRotas: inteiro('GOOGLE_MAPS_MONTHLY_ROUTE_CAP', 10000, 0, 1_000_000),
      capMapas: inteiro('GOOGLE_MAPS_MONTHLY_MAP_CAP', 10000, 0, 1_000_000),
      capTiles: inteiro('GOOGLE_MAPS_MONTHLY_TILE_CAP', 100000, 0, 10_000_000),
      intervaloMs: inteiro('GOOGLE_ROUTE_RECALC_INTERVAL_MINUTES', 2, 1, 60) * 60_000,
      cacheMs: inteiro('GOOGLE_ROUTE_CACHE_TTL_MINUTES', 10, 5, 15) * 60_000,
      reserva: env('GOOGLE_MAPS_FALLBACK_PROVIDER') === 'estimativa' ? 'estimativa' as const : 'osrm' as const,
      softPct: inteiro('GOOGLE_MAPS_SOFT_LIMIT_PCT', 95, 50, 100),
      pico: env('GOOGLE_MAPS_PEAK_HOURS'),
      planos: (env('GOOGLE_MAPS_PLANS') || 'basico,premium').split(',').map(s => s.trim()).filter(Boolean),
    },
  };
}
export type ConfigMapas = ReturnType<typeof configMapas>;

// "11-14,18-23" -> a hora (São Paulo) está numa das faixas? Vazio = sempre. Faixa pode virar a meia-noite (22-2).
export function emPico(faixas: string, agora: Date): boolean {
  if (!faixas.trim()) return true;
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }).format(agora));
  return faixas.split(',').some(f => {
    const [a, b] = f.split('-').map(Number);
    if (!Number.isInteger(a) || !Number.isInteger(b)) return false;
    return a <= b ? h >= a && h < b : h >= a || h < b;
  });
}
