import { json, pedidoVisivel } from '@/lib/api';

// GET /api/orders/{id} — resumo do pedido para quem pode vê-lo (RLS: dono, admin, equipe da loja, entregador da entrega).
// Criar pedido continua pela Server Action do checkout (createOrder): preços e regras ficam no banco.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, user, pedido } = await pedidoVisivel(id);
  if (!user) return json(401, { erro: 'login' });
  if (!pedido) return json(404, { erro: 'not_found' });
  const [{ data: p }, { data: eventos }] = await Promise.all([
    supabase.from('orders').select('id, order_number, status, order_type, created_at, total_cents, has_price_pending, order_items(product_name, variant_label, quantity)').eq('id', id).maybeSingle(),
    supabase.from('order_events').select('type, created_at').eq('order_id', id).order('created_at'),
  ]);
  return json(200, { ...p, eventos: eventos ?? [] });
}
