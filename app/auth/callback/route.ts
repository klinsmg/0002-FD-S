import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Volta do Google/Supabase com ?code=...: troca o código pela sessão (cookies) e abre /conta.
// O destino é fixo (nada vem da URL), então não há redirecionamento aberto.
export async function GET(request: NextRequest) {
  const { origin, searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  if (code) {
    const { error } = await (await createClient()).auth.exchangeCodeForSession(code);
    if (!error) {
      // o checkout deixa o cookie 'voltar' (lista fixa, nada vem da URL): depois do login, volta ao cardápio com o carrinho salvo
      const jar = await cookies();
      const volta = jar.get('voltar')?.value === 'cardapio';
      jar.delete('voltar');
      return NextResponse.redirect(`${origin}${volta ? '/cardapio' : '/conta'}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?erro=1`);
}
