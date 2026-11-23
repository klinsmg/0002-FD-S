import type { NextRequest } from 'next/server';
import { json, lerJson, mesmaOrigem, pedidoVisivel } from '@/lib/api';
import { permitir } from '@/lib/protecao';
import { contextoPedido } from '@/lib/gps';
import { configurarMapa, type ContextoPedido } from '@/lib/mapas/servico';

// POST /api/maps/config — { pedido } -> configuração SEGURA do mapa (provedor, URL dos tiles, atribuição). Sem chaves.
// O navegador guarda a resposta na sessão (sessionStorage) até "expira": o mapa é carregado (e contado) uma vez por
// sessão de rastreamento.
export async function POST(req: NextRequest) {
  if (!mesmaOrigem(req)) return json(403, { erro: 'origin' });
  const b = await lerJson(req, 512);
  if (!b || typeof b.pedido !== 'string') return json(400, { erro: 'invalid' });
  const { user, pedido } = await pedidoVisivel(b.pedido);
  if (!user) return json(401, { erro: 'login' });
  if (!pedido) return json(404, { erro: 'not_found' });
  if (!(await permitir('mapas'))) return json(429, { erro: 'rate_limited' });
  return json(200, await configurarMapa(await contextoPedido(pedido as unknown as ContextoPedido)));
}
