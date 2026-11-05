'use client';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// Ativação do TOTP: enroll (gera QR + segredo) -> challenge -> verify com o 1º código. Só depois disso o fator fica "verified" e a sessão vira aal2.
export default function AtivarTotp() {
  const [fase, setFase] = useState<'inicio' | 'qr'>('inicio');
  const [dados, setDados] = useState<{ id: string; qr: string; segredo: string } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function gerar() {
    setOcupado(true); setErro('');
    const supabase = createClient();
    // fator iniciado e nunca confirmado bloqueia um novo enroll com o mesmo nome: remove os pendentes
    const { data: lista } = await supabase.auth.mfa.listFactors();
    for (const f of lista?.all ?? []) if (f.factor_type === 'totp' && f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `painel-${Date.now()}` });
    setOcupado(false);
    if (error || !data) { setErro('Não foi possível gerar o QR Code. Tente novamente.'); return; }
    setDados({ id: data.id, qr: data.totp.qr_code, segredo: data.totp.secret });
    setFase('qr');
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!dados || !/^\d{6}$/.test(codigo)) { setErro('Digite os 6 dígitos.'); return; }
    setOcupado(true); setErro('');
    const supabase = createClient();
    const { data: desafio, error: e1 } = await supabase.auth.mfa.challenge({ factorId: dados.id });
    const { error: e2 } = e1 || !desafio ? { error: e1 } : await supabase.auth.mfa.verify({ factorId: dados.id, challengeId: desafio.id, code: codigo });
    setOcupado(false);
    if (e1 || e2) { setErro('Código inválido ou expirado.'); return; }
    window.location.assign('/admin');
  }

  if (fase === 'inicio') return (
    <>
      {erro && <p className="nota" role="alert">{erro}</p>}
      <button className="btn btn-p" type="button" onClick={gerar} disabled={ocupado}>Ativar 2FA</button>
    </>
  );
  return (
    <form className="form" onSubmit={confirmar}>
      {/* qr_code é um data URI SVG gerado pelo Supabase; <img> não executa script */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dados!.qr} alt="QR Code para o app autenticador" width={200} height={200} style={{ background: '#fff', padding: 8, borderRadius: 12 }} />
      <p className="nota">Sem câmera? Digite este segredo no app: <code>{dados!.segredo}</code></p>
      {erro && <p className="nota" role="alert">{erro}</p>}
      <label htmlFor="t-cod">Código de 6 dígitos</label>
      <input id="t-cod" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))} />
      <button className="btn btn-p" type="submit" disabled={ocupado}>Confirmar e ativar</button>
    </form>
  );
}
