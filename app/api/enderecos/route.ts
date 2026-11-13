import { NextResponse } from 'next/server';
import { usuarioAtual } from '@/lib/supabase/server';

// Dados do cliente logado para o carrinho (página estática): nome do perfil (ou da conta Google) e endereços salvos.
// Visitante recebe vazio (200, sem erro no console). Filtra pelo dono (o RLS deixaria o admin ver os de todos).
export async function GET() {
  const sem = { 'Cache-Control': 'private, no-store' };
  const { supabase, user } = await usuarioAtual();
  if (!user) return NextResponse.json({ nome: null, enderecos: [] }, { headers: sem });
  const [{ data: perfil }, { data }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    supabase
      .from('addresses')
      .select('id, label, street, number, complement, district, city, state, zip_code, is_default')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at'),
  ]);
  return NextResponse.json({ nome: perfil?.full_name || null, enderecos: data ?? [] }, { headers: sem });
}
