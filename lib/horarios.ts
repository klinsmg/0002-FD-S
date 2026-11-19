import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import { info } from '@/lib/info';
import { agruparHorarios } from '@/lib/regras';

// Horário de funcionamento para o site público, vindo do banco (editado em Admin > Configurações > Horários).
// Cliente SEM cookies (só a chave pública, leitura liberada pelo RLS): as páginas continuam estáticas e são
// regeradas quando o admin salva (revalidatePath). Se o banco falhar, usa o horário fixo de lib/info.ts.
export const horariosLoja = cache(async (): Promise<readonly (readonly [string, string])[]> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !chave) return info.horarios;
  try {
    const sb = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await sb.from('business_hours').select('weekday, opens_at, closes_at, closed');
    const linhas = !error && data?.length === 7 ? agruparHorarios(data) : [];
    return linhas.length ? linhas : info.horarios;
  } catch { return info.horarios; }
});
export const PAGINAS_COM_HORARIO = ['/', '/contato', '/cardapio', '/llms.txt', '/llms-full.txt'];
