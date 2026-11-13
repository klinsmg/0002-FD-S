'use server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { COOKIE_MANTER, COOKIE_SESSAO } from '@/lib/supabase/sessao';

// Login com Google começado no servidor: o código PKCE e, depois, a sessão ficam em cookies httpOnly.
// Sem "manter conectado", grava manter=0 como cookie de sessão: todos os cookies da conta somem ao fechar o navegador.
export async function entrarComGoogle(f: FormData) {
  const jar = await cookies();
  if (f.get('manter') === 'on') jar.delete(COOKIE_MANTER);
  else jar.set(COOKIE_MANTER, '0', COOKIE_SESSAO);

  const origem = (await headers()).get('origin'); // Server Actions só aceitam origem igual à do site
  const { data, error } = await (await createClient()).auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origem}/auth/callback` },
  });
  redirect(error || !data.url ? '/login?erro=1' : data.url);
}
