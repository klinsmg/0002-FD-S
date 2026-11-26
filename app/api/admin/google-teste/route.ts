import { adminApi, json } from '@/lib/api';
import { ehDev } from '@/lib/regras';
import { configMapas } from '@/lib/mapas/config';

// GET /api/admin/google-teste — diagnóstico da chave do Google (só admin Dev). Faz 1 createSession (Map Tiles) e
// 1 computeRoutes curto e devolve a resposta CRUA do Google (status, mensagem, details: projeto, motivo, links).
// A chave nunca sai: é removida de qualquer texto devolvido. Chamada com erro não é cobrada; com sucesso, 1 evento da cota.
export async function GET() {
  const adm = await adminApi();
  if (!adm) return json(404, { erro: 'not_found' });
  const { data: { user } } = await adm.supabase.auth.getUser();
  if (!ehDev(user?.email)) return json(404, { erro: 'not_found' });
  const cfg = configMapas();
  const chave = cfg.google.chave;
  if (!chave) return json(200, { ligado: false, motivo: 'GOOGLE_MAPS_ENABLED diferente de true ou GOOGLE_MAPS_API_KEY ausente/inválida' });
  const limpo = (t: string) => t.split(chave).join('***');
  const chamar = async (url: string, init: RequestInit) => {
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(8000), cache: 'no-store' });
      const corpo = limpo(await r.text()).slice(0, 4000);
      let j: unknown = corpo; try { j = JSON.parse(corpo); } catch { /* texto */ }
      return { http: r.status, resposta: r.ok ? 'ok' : j };
    } catch (e) { return { http: 0, resposta: String((e as Error)?.message ?? e) }; }
  };
  const tiles = await chamar(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(chave)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mapType: 'roadmap', language: 'pt-BR', region: 'BR' }),
  });
  const rotas = await chamar('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': chave, 'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters' },
    body: JSON.stringify({ origin: { location: { latLng: { latitude: -23.5411, longitude: -46.9345 } } }, destination: { location: { latLng: { latitude: -23.5491, longitude: -46.9372 } } }, travelMode: 'DRIVE' }),
  });
  return json(200, { ligado: true, chave: `${chave.slice(0, 6)}…${chave.slice(-4)} (${chave.length} caracteres)`, tiles, rotas });
}
