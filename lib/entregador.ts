import { cache } from 'react';
import { usuarioAtual } from '@/lib/supabase/server';

// Quem está usando o app do entregador: logado (Google) e liberado pelo admin (tabela couriers, ativo).
// O RLS e as funções do banco conferem o mesmo de novo (is_courier), então isto é só para decidir o que mostrar.
export const entregadorAtual = cache(async () => {
  const { supabase, user } = await usuarioAtual();
  if (!user) return { supabase, user: null, liberado: false };
  const { data } = await supabase.rpc('is_courier');
  return { supabase, user, liberado: data === true };
});

export const ATIVAS = ['assigned', 'en_route', 'arriving', 'arrived'] as const;
export const ETAPA_ENTREGA: Record<string, string> = {
  assigned: 'Aguardando saída', en_route: 'A caminho', arriving: 'Chegando', arrived: 'No local',
  delivered: 'Entregue', failed: 'Falhou', cancelled: 'Cancelada',
};
