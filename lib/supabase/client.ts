import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';

// Cliente do Supabase para Client Components (navegador). Usa só a chave pública (publishable):
// ela só é segura porque o RLS está ligado em todas as tabelas (veja supabase/migrations).
// Nunca use a SUPABASE_SERVICE_ROLE_KEY aqui: tudo que é importado neste arquivo vai para o navegador.
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (veja .env.example).');
  }
  return createBrowserClient<Database>(url, key);
}
