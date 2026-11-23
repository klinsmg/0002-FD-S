import type { NextRequest } from 'next/server';
import { json, lerJson, mesmaOrigem } from '@/lib/api';
import { permitir } from '@/lib/protecao';
import { usuarioAtual } from '@/lib/supabase/server';
import { geocodificar } from '@/lib/mapas/servico';

// POST /api/maps/geocode — { street, number, district, city, state, zip_code } -> ponto sugerido (Nominatim próprio)
// para o pino do checkout. Exige sessão (inclusive a anônima do carrinho) e respeita o limite 'mapas'.
const t = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim().slice(0, max) : '');
export async function POST(req: NextRequest) {
  if (!mesmaOrigem(req)) return json(403, { erro: 'origin' });
  const b = await lerJson(req, 1024);
  if (!b) return json(400, { erro: 'invalid' });
  const { user } = await usuarioAtual();
  if (!user) return json(401, { erro: 'login' });
  if (!(await permitir('mapas'))) return json(429, { erro: 'rate_limited' });
  const g = await geocodificar({ street: t(b.street, 120), number: t(b.number, 10), district: t(b.district, 100), city: t(b.city, 100), state: t(b.state, 2), zip_code: t(b.zip_code, 9) });
  return g ? json(200, g) : json(404, { erro: 'nao_encontrado' });
}
