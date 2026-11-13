import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Endereços salvos do cliente logado, para o carrinho (que é uma página estática) oferecer "usar endereço salvo".
// Visitante recebe lista vazia (200, sem erro no console). Filtra pelo dono (o RLS deixaria o admin ver os de todos).
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ enderecos: [] }, { headers: { 'Cache-Control': 'private, no-store' } });
  const { data } = await supabase
    .from('addresses')
    .select('id, label, street, number, complement, district, city, state, zip_code, is_default')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('created_at');
  return NextResponse.json({ enderecos: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}
