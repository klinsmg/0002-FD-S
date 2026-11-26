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
      // o checkout e o app do entregador deixam o cookie 'voltar' (lista fixa, nada vem da URL)
      const jar = await cookies();
      const DESTINOS: Record<string, string> = { cardapio: '/cardapio', entregador: '/entregador' };
      const volta = DESTINOS[jar.get('voltar')?.value ?? ''] ?? '/conta';
      jar.delete('voltar');
      return NextResponse.redirect(`${origin}${volta}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?erro=1`);
}
