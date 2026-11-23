import type { NextRequest } from 'next/server';
import { rotaOuEta } from '@/lib/mapas/rota-api';

// POST /api/maps/route — rota atual do pedido (polyline + ETA + provedor). Regras em lib/mapas/rota-api.ts.
export const POST = (req: NextRequest) => rotaOuEta(req, 'route');
