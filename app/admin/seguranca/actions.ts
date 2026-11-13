'use server';
import { redirect } from 'next/navigation';
import { adminLogado } from '@/lib/admin';

// Ativação do TOTP no servidor (a sessão fica em cookie httpOnly, invisível ao navegador).
export async function gerarTotp(): Promise<{ id: string; qr: string; segredo: string } | { erro: string }> {
  const { supabase } = await adminLogado();
  // fator iniciado e nunca confirmado bloqueia um novo enroll com o mesmo nome: remove os pendentes
  const { data: lista } = await supabase.auth.mfa.listFactors();
  for (const f of lista?.all ?? []) if (f.factor_type === 'totp' && f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `painel-${Date.now()}` });
  if (error || !data) return { erro: 'Não foi possível gerar o QR Code. Tente novamente.' };
  return { id: data.id, qr: data.totp.qr_code, segredo: data.totp.secret };
}

export async function confirmarTotp(id: string, codigo: string): Promise<{ erro: string }> {
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id) || typeof codigo !== 'string' || !/^\d{6}$/.test(codigo)) return { erro: 'Digite os 6 dígitos.' };
  const { supabase } = await adminLogado();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code: codigo });
  if (error) return { erro: 'Código inválido ou expirado.' };
  redirect('/admin');
}
