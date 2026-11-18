// Chamadas ao Google Maps Platform feitas SÓ no servidor, com a chave de backend (GOOGLE_MAPS_SERVER_KEY).
// Essa chave nunca vai ao navegador: não tem NEXT_PUBLIC_ e este arquivo só é importado por Server Actions/Route Handlers.
// Restrinja-a no Google Cloud a "Geocoding API" e "Routes API" (ver .env.example).
const CHAVE = () => {
  const k = process.env.GOOGLE_MAPS_SERVER_KEY ?? '';
  return /^AIza[0-9A-Za-z_-]{35}$/.test(k) ? k : null;
};
export const temChaveServidor = () => !!CHAVE();

type Endereco = { street?: string; number?: string; district?: string; city?: string; state?: string; zip_code?: string };

// Endereço do pedido -> coordenadas. Tenta o endereço completo e, se não achar, só o CEP.
export async function geocodificar(e: Endereco): Promise<{ lat: number; lng: number } | null> {
  const k = CHAVE();
  if (!k) return null;
  const cep = (e.zip_code ?? '').replace(/\D/g, '');
  const tentativas = [
    `${e.street ?? ''}, ${e.number ?? ''} - ${e.district ?? ''}, ${e.city ?? ''} - ${e.state ?? ''}, ${cep}, Brasil`,
    cep && `${cep}, Brasil`,
  ].filter(Boolean) as string[];
  for (const endereco of tentativas) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?region=br&language=pt-BR&address=${encodeURIComponent(endereco)}&key=${k}`;
      const r = await fetch(url, { signal: AbortSignal.timeout(6000), cache: 'no-store' });
      const j = await r.json();
      const loc = j?.results?.[0]?.geometry?.location;
      if (j.status === 'OK' && Number.isFinite(loc?.lat) && Number.isFinite(loc?.lng)) return { lat: loc.lat, lng: loc.lng };
      if (j.status !== 'ZERO_RESULTS') { console.error('[geo] geocode', j.status, j.error_message ?? ''); return null; }
    } catch (err) { console.error('[geo] geocode falhou', String(err)); return null; }
  }
  return null;
}

type Ponto = { lat: number; lng: number };
const retaKm = (a: Ponto, b: Ponto) => {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};

// Rota e ETA com trânsito (Routes API, chave de backend). A origem já chega arredondada (~100 m): a rota mostrada
// ao cliente não revela a posição exata do entregador. Sem chave ou com falha: estimativa em linha reta
// (x1,4 pelo traçado das ruas, a 25 km/h de média urbana) e sem desenho de rota.
export async function rotaEta(origem: Ponto, destino: Ponto): Promise<{ minutos: number; km: number; polyline: string | null }> {
  const estimativa = () => { const km = retaKm(origem, destino) * 1.4; return { minutos: Math.max(1, Math.round((km / 25) * 60)), km: Math.round(km * 10) / 10, polyline: null }; };
  const k = CHAVE();
  if (!k) return estimativa();
  try {
    const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': k, 'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline' },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origem.lat, longitude: origem.lng } } },
        destination: { location: { latLng: { latitude: destino.lat, longitude: destino.lng } } },
        travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE', languageCode: 'pt-BR', regionCode: 'BR',
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
