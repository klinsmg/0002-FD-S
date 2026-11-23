import type { NextRequest } from 'next/server';
import { json, lerJson, mesmaOrigem, pedidoVisivel } from '@/lib/api';
import { aproximar, decodificarPolyline, deveRecalcular, distanciaM, etaLocal } from '@/lib/regras';
import { permitir } from '@/lib/protecao';
import { clienteServico } from '@/lib/supabase/servico';
import { contextoPedido } from '@/lib/gps';
import { configMapas } from './config';
import { calcularRota, type ContextoPedido } from './servico';

// POST /api/maps/route e /api/maps/eta — { pedido, manual? }
// Valida: sessão, mesma origem, limite ('mapas'), permissão sobre o pedido (RLS: dono, admin, equipe da loja, entregador).
// Devolve a rota/ETA já calculadas (cache da entrega) + ETA local. "manual" = o cliente pediu para atualizar: recalcula
// só se o intervalo mínimo passou (deveRecalcular) — nunca a cada clique.
export async function rotaOuEta(req: NextRequest, tipo: 'route' | 'eta') {
  if (!mesmaOrigem(req)) return json(403, { erro: 'origin' });
  const b = await lerJson(req, 512);
  if (!b || typeof b.pedido !== 'string') return json(400, { erro: 'invalid' });
  const { supabase, user, pedido } = await pedidoVisivel(b.pedido);
  if (!user) return json(401, { erro: 'login' });
  if (!pedido) return json(404, { erro: 'not_found' });
  if (!(await permitir('mapas'))) return json(429, { erro: 'rate_limited' });

  const { data: t } = await supabase.rpc('order_tracking', { p_order_id: pedido.id });
  const r = t?.[0];
  if (!r) return json(404, { erro: 'sem_entrega' });
  let rota = { minutos: r.eta_minutes as number | null, km: r.distance_km as number | null, polyline: r.route_polyline as string | null, provedor: r.route_provider as string | null, calculadoEm: r.eta_updated_at as string | null };

  const ativa = ['assigned', 'en_route', 'arriving', 'arrived'].includes(r.status);
  const s = clienteServico();
  if (b.manual === true && ativa && s && r.lat !== null && r.lng !== null) {
    const dec = deveRecalcular({
      agora: Date.now(), ultimaRotaEm: r.eta_updated_at ? new Date(r.eta_updated_at).getTime() : null, intervaloMs: configMapas().google.intervaloMs,
      posicao: { lat: r.lat, lng: r.lng }, destino: { lat: r.dest_lat, lng: r.dest_lng }, rota: [], manual: true,
    });
    if (dec.recalcular) {
      const { data: d } = await s.from('deliveries').select('id, courier_id').eq('order_id', pedido.id).in('status', ['assigned', 'en_route', 'arriving', 'arrived']).maybeSingle();
      if (d) {
        const ctx = await contextoPedido(pedido as unknown as ContextoPedido);
        const n = await calcularRota({ lat: aproximar(r.lat), lng: aproximar(r.lng) }, { lat: r.dest_lat, lng: r.dest_lng },
          { pedido: ctx, entregaId: d.id, entregadorId: d.courier_id, endpoint: `api:${tipo}:manual`, podeGoogle: dec.podeGoogle });
        const agora = new Date().toISOString();
        // gravação pelo servidor (o cliente não tem permissão de escrever na entrega); o gatilho publica no canal
        await s.from('deliveries').update({ eta_minutes: n.minutos, distance_km: n.km, route_polyline: n.polyline, route_provider: n.provedor, eta_updated_at: agora }).eq('id', d.id);
        rota = { minutos: n.minutos, km: n.km, polyline: n.polyline, provedor: n.provedor, calculadoEm: agora };
      }
    }
  }
  const restanteM = r.lat !== null && r.lng !== null ? distanciaM({ lat: r.lat, lng: r.lng }, { lat: r.dest_lat, lng: r.dest_lng }) : null;
  const local = etaLocal({ etaRotaMin: rota.minutos, calculadoEm: rota.calculadoEm ? new Date(rota.calculadoEm).getTime() : null, agora: Date.now(), restanteM, velocidades: r.speed_kmh ? [r.speed_kmh, r.speed_kmh] : [] });
  const corpo = { status: r.status, etaMinutos: rota.minutos, etaLocalMinutos: local, distanciaKm: rota.km, provedor: rota.provedor, calculadoEm: rota.calculadoEm };
  return json(200, tipo === 'route' ? { ...corpo, rota: rota.polyline, pontos: rota.polyline ? decodificarPolyline(rota.polyline).length : 0 } : corpo);
}
