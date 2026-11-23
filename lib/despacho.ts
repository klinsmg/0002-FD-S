import type { usuarioAtual } from '@/lib/supabase/server';
import { contextoPedido } from '@/lib/gps';
import { calcularRota, geocodificar, pontoValido, type ContextoPedido } from '@/lib/mapas/servico';
import { lerCoords } from '@/lib/regras';

type Sb = Awaited<ReturnType<typeof usuarioAtual>>['supabase'];
export type Despacho = { ok: true; entrega: string; rotaInicial: () => Promise<void> } | { ok: false; erro: 'fluxo' | 'endereco' | 'coords' | 'entregador' };

// Despacho (admin, cliente do usuário + RLS). Destino, em ordem:
//   1) coordenadas coladas pela loja (exatas)  2) ponto do pedido: pino do cliente (exato) ou Nominatim (aproximado)
//   3) Nominatim agora (exato só se achou o número)
// Depois: rota inicial loja -> cliente (pode usar o Google: é o "início da entrega"), fora da resposta.
export async function despachar(supabase: Sb, pedidoId: string, entregador: string, coordsTexto = ''): Promise<Despacho> {
  const { data: p } = await supabase.from('orders')
    .select('id, status, order_type, customer_name, restaurant_id, delivery_address, dest_lat, dest_lng, dest_source, restaurants(lat, lng)')
    .eq('id', pedidoId).maybeSingle();
  if (!p || p.status !== 'ready' || p.order_type !== 'delivery') return { ok: false, erro: 'fluxo' };
  const lojaR = p.restaurants as unknown as { lat: number | null; lng: number | null } | null;
  const loja = lojaR?.lat != null && lojaR?.lng != null ? { lat: lojaR.lat, lng: lojaR.lng } : null;

  let destino: { lat: number; lng: number; aprox: boolean } | null = null;
  if (coordsTexto.trim()) {
    const c = lerCoords(coordsTexto);
    if (!c || !pontoValido(c, loja)) return { ok: false, erro: 'coords' };
    destino = { ...c, aprox: false };
  } else if (p.dest_lat != null && p.dest_lng != null) {
    destino = { lat: p.dest_lat, lng: p.dest_lng, aprox: p.dest_source !== 'pino' };
  } else {
    const g = await geocodificar((p.delivery_address ?? {}) as Record<string, string>);
    if (g && pontoValido(g, loja)) destino = { lat: g.lat, lng: g.lng, aprox: !g.preciso };
  }
  if (!destino) return { ok: false, erro: 'endereco' };

  const { data: entrega, error } = await supabase.rpc('dispatch_order', { p_order_id: pedidoId, p_courier_id: entregador, p_dest_lat: destino.lat, p_dest_lng: destino.lng, p_dest_approx: destino.aprox });
  if (error || !entrega) return { ok: false, erro: error?.message.includes('courier_not_found') ? 'entregador' : 'fluxo' };

  const fim = destino;
  return {
    ok: true, entrega,
    rotaInicial: async () => {
      if (!loja) return; // sem o ponto da loja, a primeira rota sai do 1º GPS do entregador
      const ctx = await contextoPedido({ id: p.id, status: 'out_for_delivery', customer_name: p.customer_name, restaurant_id: p.restaurant_id } as ContextoPedido);
      const r = await calcularRota(loja, fim, { pedido: ctx, entregaId: entrega, entregadorId: entregador, endpoint: 'despacho', podeGoogle: true });
      await supabase.rpc('courier_set_eta', { p_delivery_id: entrega, p_eta_minutes: r.minutos, p_distance_km: r.km, p_polyline: r.polyline as string, p_provider: r.provedor });
    },
  };
}
