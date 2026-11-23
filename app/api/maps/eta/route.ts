import type { NextRequest } from 'next/server';
import { rotaOuEta } from '@/lib/mapas/rota-api';

// POST /api/maps/eta — ETA do pedido (calculada + local). { manual: true } recalcula se o intervalo mínimo passou.
export const POST = (req: NextRequest) => rotaOuEta(req, 'eta');
