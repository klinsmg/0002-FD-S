import { revalidatePath } from 'next/cache';
import type { NextRequest } from 'next/server';
import { adminApi, json, lerJson, mesmaOrigem } from '@/lib/api';

// POST /api/admin/couriers — { email, ativo } (admin, 2FA): libera/tira o entregador pela conta Google (admin_set_courier).
export async function POST(req: NextRequest) {
  if (!mesmaOrigem(req)) return json(403, { erro: 'origin' });
  const adm = await adminApi();
  if (!adm) return json(404, { erro: 'not_found' });
  const b = await lerJson(req, 512);
  const email = String(b?.email ?? '').trim().toLowerCase().slice(0, 254);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || typeof b?.ativo !== 'boolean') return json(400, { erro: 'invalid' });
  const { data, error } = await adm.supabase.rpc('admin_set_courier', { p_email: email, p_active: b.ativo });
  const naoAchou = !!error?.message.includes('user_not_found');
  if (error) return json(naoAchou ? 404 : 500, { erro: naoAchou ? 'user_not_found' : 'falha' });
  revalidatePath('/admin/configuracoes'); revalidatePath('/admin/loja');
  return json(200, { id: data, ativo: b.ativo });
}
