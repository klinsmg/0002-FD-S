import { etaEstimada } from '@/lib/regras';

// Chamadas ao Google Maps Platform feitas SÓ no servidor, com a chave de backend (GOOGLE_MAPS_SERVER_KEY).
// Essa chave nunca vai ao navegador: não tem NEXT_PUBLIC_ e este arquivo só é importado por Server Actions/Route Handlers.
// Restrinja-a no Google Cloud a "Geocoding API" e "Routes API" (ver .env.example). Só a Routes já basta (reserva abaixo).
const CHAVE = () => {
  const k = process.env.GOOGLE_MAPS_SERVER_KEY ?? '';
  return /^AIza[0-9A-Za-z_-]{35}$/.test(k) ? k : null;
};
export const temChaveServidor = () => !!CHAVE();

type Endereco = { street?: string; number?: string; district?: string; city?: string; state?: string; zip_code?: string };

// Endereço do pedido -> coordenadas. Tenta o endereço completo e, se não achar, só o CEP.
// aprox = true quando o Google só achou a região (centro do CEP/bairro): a confirmação usa raio maior (migration 017).
export async function geocodificar(e: Endereco): Promise<{ lat: number; lng: number; aprox: boolean } | null> {
  const k = CHAVE();
  if (!k) return null;
  const cep = (e.zip_code ?? '').replace(/\D/g, '');
  const tentativas = [
    `${e.street ?? ''}, ${e.number ?? ''} - ${e.district ?? ''}, ${e.city ?? ''} - ${e.state ?? ''}, ${cep}, Brasil`,
    cep && `${cep}, Brasil`,
  ].filter(Boolean) as string[];
  let reserva = false; // Geocoding API recusou (faturamento/API desligada): usa a Routes API, que também geocodifica
  for (const [i, endereco] of tentativas.entries()) {
    try {
      if (!reserva) {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?region=br&language=pt-BR&address=${encodeURIComponent(endereco)}&key=${k}`;
        const j = await (await fetch(url, { signal: AbortSignal.timeout(6000), cache: 'no-store' })).json();
        const geo = j?.results?.[0]?.geometry, loc = geo?.location;
        const preciso = i === 0 && ['ROOFTOP', 'RANGE_INTERPOLATED'].includes(geo?.location_type);
        if (j.status === 'OK' && Number.isFinite(loc?.lat) && Number.isFinite(loc?.lng)) return { lat: loc.lat, lng: loc.lng, aprox: !preciso };
        if (j.status === 'ZERO_RESULTS') continue;
        console.error('[geo] geocode', j.status, j.error_message ?? '', '-> usando Routes API');
        reserva = true;
      }
      const r = await geoPelaRota(endereco, k, i === 0);
      if (r) return r;
    } catch (err) { console.error('[geo] geocode falhou', String(err)); return null; }
  }
  return null;
}

// Routes API com o mesmo endereço na origem e no destino: devolve o ponto e o tipo do que o Google achou.
// Correspondência parcial só é aceita se for o CEP (senão o Google "acha" uma rua com nome parecido em outro estado).
async function geoPelaRota(endereco: string, k: string, completo: boolean) {
  const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': k, 'X-Goog-FieldMask': 'routes.legs.endLocation,geocodingResults' },
    body: JSON.stringify({ origin: { address: endereco }, destination: { address: endereco }, travelMode: 'DRIVE', regionCode: 'BR', languageCode: 'pt-BR' }),
    signal: AbortSignal.timeout(6000), cache: 'no-store',
  });
  const j = await r.json();
  const ll = j?.routes?.[0]?.legs?.[0]?.endLocation?.latLng, g = j?.geocodingResults?.destination;
  const tipos: string[] = g?.type ?? [];
  if (!r.ok || !Number.isFinite(ll?.latitude) || !Number.isFinite(ll?.longitude)) { if (!r.ok) console.error('[geo] rota-geocode', r.status, j?.error?.message ?? ''); return null; }
  if (g?.partialMatch && !tipos.includes('postal_code')) return null;
  const preciso = completo && !g?.partialMatch && tipos.some(t => ['street_address', 'premise', 'subpremise'].includes(t));
  return { lat: ll.latitude, lng: ll.longitude, aprox: !preciso };
}

type Ponto = { lat: number; lng: number };

// Rota e ETA sem trânsito (Routes API faixa Essentials, cota grátis maior que a TRAFFIC_AWARE, que é Pro). A origem já chega arredondada (~100 m): a rota mostrada
// ao cliente não revela a posição exata do entregador. Sem chave ou com falha: estimativa em linha reta
// (x1,4 pelo traçado das ruas, a 25 km/h de média urbana) e sem desenho de rota.
export async function rotaEta(origem: Ponto, destino: Ponto): Promise<{ minutos: number; km: number; polyline: string | null }> {
  const estimativa = () => ({ ...etaEstimada(origem, destino), polyline: null });
  const k = CHAVE();
  if (!k) return estimativa();
  try {
    const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': k, 'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline' },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origem.lat, longitude: origem.lng } } },
        destination: { location: { latLng: { latitude: destino.lat, longitude: destino.lng } } },
        travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE', languageCode: 'pt-BR', regionCode: 'BR',
      }),
      signal: AbortSignal.timeout(6000), cache: 'no-store',
    });
    const j = await r.json();
    const rota = j?.routes?.[0];
    const seg = Number(String(rota?.duration ?? '').replace('s', ''));
    if (!r.ok || !rota || !Number.isFinite(seg)) { console.error('[geo] rota', r.status, j?.error?.message ?? ''); return estimativa(); }
    return { minutos: Math.max(1, Math.round(seg / 60)), km: Math.round((rota.distanceMeters ?? 0) / 100) / 10, polyline: rota.polyline?.encodedPolyline ?? null };
  } catch (err) { console.error('[geo] rota falhou', String(err)); return estimativa(); }
}
