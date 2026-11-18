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
