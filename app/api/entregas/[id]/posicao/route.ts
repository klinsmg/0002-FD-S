import type { NextRequest } from 'next/server';
import { receberPosicao } from '@/lib/gps';

// POST /api/entregas/{id}/posicao — o app do entregador envia o GPS aqui (com os cookies da sessão). Regras em lib/gps.ts.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return receberPosicao(req, (await params).id);
}
