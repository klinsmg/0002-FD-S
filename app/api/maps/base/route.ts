import { NextResponse } from 'next/server';
import { clienteServico } from '@/lib/supabase/servico';
import { configMapas } from '@/lib/mapas/config';

// GET /api/maps/base — mapa base PRÓPRIO para o pino do checkout (nunca Google: não gasta cota) + ponto da loja.
// Público: só URLs e o ponto da loja (o endereço já está no site). Sem tiles configurados: { tipo: null }.
export async function GET() {
  const cfg = configMapas();
  const s = clienteServico();
  const { data: loja } = s ? await s.from('restaurants').select('lat, lng').eq('active', true).order('created_at').limit(1).maybeSingle() : { data: null };
  return NextResponse.json(
    { tipo: cfg.tiles ? 'pmtiles' : null, tiles: cfg.tiles || null, atribuicao: '© OpenStreetMap · Protomaps', maxZoom: 17, loja: loja?.lat != null ? { lat: loja.lat, lng: loja.lng } : null },
    // s-maxage: a CDN da Vercel responde por 5 min sem chamar a função nem o banco (rota pública)
    { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } },
  );
}
