import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// O cabeçalho é estático e os cookies da sessão são httpOnly: ele pergunta aqui se há alguém logado.
// Devolve só o primeiro nome (nada de token). getClaims valida o JWT e renova a sessão se o access token venceu.
export async function GET() {
  const { data } = await (await createClient()).auth.getClaims();
  const c = data?.claims;
  const nome = c ? String(c.user_metadata?.full_name ?? c.user_metadata?.name ?? c.email ?? '').split(/[\s@]/)[0].slice(0, 24) : null;
  return NextResponse.json({ logado: !!c, nome }, { headers: { 'Cache-Control': 'private, no-store' } });
}
