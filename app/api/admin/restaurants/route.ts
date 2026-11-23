import { revalidatePath } from 'next/cache';
import type { NextRequest } from 'next/server';
import { UUID, adminApi, dadosRestaurante, json, lerJson, mesmaOrigem } from '@/lib/api';

// POST /api/admin/restaurants — cria (sem id) ou atualiza (com id) um restaurante (admin, 2FA; o RLS confere de novo).
// { id?, name, lat?, lng?, active?, google_maps_enabled?, plan?, google_maps_percent? }
export async function POST(req: NextRequest) {
  if (!mesmaOrigem(req)) return json(403, { erro: 'origin' });
  const adm = await adminApi();
  if (!adm) return json(404, { erro: 'not_found' });
  const b = await lerJson(req, 1024);
  if (!b) return json(400, { erro: 'invalid' });
  const r = dadosRestaurante(b);
  if (!r) return json(400, { erro: 'invalid' });
  const id = typeof b.id === 'string' && UUID.test(b.id) ? b.id : null;
  const { data, error } = id
    ? await adm.supabase.from('restaurants').update(r).eq('id', id).select('id').maybeSingle()
    : await adm.supabase.from('restaurants').insert(r).select('id').single();
  if (error || !data) return json(error ? 500 : 404, { erro: error ? 'falha' : 'not_found' });
  revalidatePath('/admin/mapas');
  return json(200, { id: data.id });
}
