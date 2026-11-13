import { cache } from 'react';
import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';
import { cookies } from 'next/headers';
import { COOKIE_MANTER, COOKIE_SESSAO, ajustarCookie } from './sessao';

// Cliente do Supabase para Server Components, Server Actions e Route Handlers (o único que o site usa: não há cliente no navegador).
// Lê e grava a sessão nos cookies da requisição. Em Next 16, cookies() é assíncrono, então esta função também é.
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (veja .env.example).');
  }
  const cookieStore = await cookies();
  const manter = cookieStore.get(COOKIE_MANTER)?.value !== '0';
  return createServerClient<Database>(url, key, {
    cookieOptions: COOKIE_SESSAO,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(lista) {
        try {
          lista.forEach(({ name, value, options }) => cookieStore.set(name, value, ajustarCookie(options, manter)));
        } catch {
          // Chamado de um Server Component (cookies somente leitura): pode ignorar se a sessão for renovada em outro ponto.
        }
      },
    },
  });
}

// Quem está logado nesta requisição. getClaims confere a assinatura do JWT localmente (chave ES256 do projeto), sem ida ao
// servidor de auth; cache() faz layout, página e ações da mesma requisição dividirem a checagem. O RLS do banco confere o mesmo JWT.
// Limite: sessão encerrada em outro aparelho vale até o JWT vencer (até 1 h).
export const usuarioAtual = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  return { supabase, user: c ? { id: c.sub, email: c.email ?? '', app_metadata: c.app_metadata } : null };
});
