import type { NextRequest } from 'next/server';
import { receberPosicao } from '@/lib/gps';

// POST /api/courier/location — mesmo contrato do app, com a entrega no corpo:
// { entregaId | deliveryId, latitude, longitude, precisaoMetros | accuracy, velocidadeKmh | speedKmh, capturadoEm | timestamp }
export async function POST(req: NextRequest) {
  return receberPosicao(req, null);
}
