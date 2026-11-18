'use server';
import { createClient } from '@/lib/supabase/server';

// Token para o WebSocket do Realtime (canais privados). Os cookies da sessão são httpOnly, então o navegador pede o JWT aqui
// só para abrir o canal. Vai só o access token (vale até 1 h); o refresh token nunca sai do servidor.
// Server Action: o Next aceita só POST da mesma origem. Quem pode entrar em cada canal é decidido pelo RLS (migration 013).
export async function tokenTempoReal(): Promise<{ token: string; expira: number } | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession(); // renova a sessão se o JWT venceu (e regrava os cookies)
  const s = data.session;
  if (!s) return null;
  const { data: c } = await supabase.auth.getClaims(); // confere a assinatura antes de entregar
  if (!c?.claims || c.claims.sub !== s.user.id) return null;
  return { token: s.access_token, expira: (s.expires_at ?? 0) * 1000 };
}
