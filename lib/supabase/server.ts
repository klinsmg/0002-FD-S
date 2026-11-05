import { createServerClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';
import { cookies } from 'next/headers';

// Cliente do Supabase para Server Components, Server Actions e Route Handlers.
// Lê e grava a sessão nos cookies da requisição. Em Next 16, cookies() é assíncrono, então esta função também é.
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (veja .env.example).');
  }
  const cookieStore = await cookies();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(lista) {
        try {
          lista.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Chamado de um Server Component (cookies somente leitura): pode ignorar se a sessão for renovada em outro ponto.
        }
      },
    },
  });
}
