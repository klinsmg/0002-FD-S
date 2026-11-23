import { json, pedidoVisivel } from '@/lib/api';

// GET /api/orders/{id}/tracking — rastreio do pedido (posição APROXIMADA ~100 m, ETA, rota, loja e destino).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, pedido } = await pedidoVisivel(id);
  if (!user) return json(401, { erro: 'login' });
  if (!pedido) return json(404, { erro: 'not_found' });
  const { data } = await supabase.rpc('order_tracking', { p_order_id: id });
  return data?.[0] ? json(200, data[0]) : json(404, { erro: 'sem_entrega' });
}
