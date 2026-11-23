import { revalidatePath } from 'next/cache';
import type { NextRequest } from 'next/server';
import { STATUS_LISTA, podeIr, type Status } from '@/lib/admin';
import { UUID, adminApi, json, lerJson, mesmaOrigem } from '@/lib/api';

// POST /api/orders/{id}/status — { status } (admin, 2FA). Mesmo fluxo do quadro da loja: só o próximo passo válido,
// e só se ninguém mudou antes (update condicionado ao status lido). "Saiu para entrega" é pelo assign-courier.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!mesmaOrigem(req)) return json(403, { erro: 'origin' });
  const adm = await adminApi();
  if (!adm) return json(404, { erro: 'not_found' });
  const { id } = await params;
  const b = await lerJson(req, 256);
  const para = String(b?.status ?? '') as Status;
  if (!UUID.test(id) || !STATUS_LISTA.includes(para)) return json(400, { erro: 'invalid' });
  const { data: p } = await adm.supabase.from('orders').select('status, order_type').eq('id', id).maybeSingle();
  if (!p) return json(404, { erro: 'not_found' });
  if (!podeIr(p.status, para, p.order_type)) return json(409, { erro: 'fluxo' });
  const { data: ok } = await adm.supabase.from('orders').update({ status: para }).eq('id', id).eq('status', p.status).select('id');
  if (!ok?.length) return json(409, { erro: 'fluxo' });
  for (const r of ['/admin', '/admin/loja', '/admin/pedidos', `/pedido/${id}`]) revalidatePath(r);
  return json(200, { status: para });
}
