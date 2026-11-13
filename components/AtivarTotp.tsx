'use client';
import { useState } from 'react';
import { confirmarTotp, gerarTotp } from '@/app/admin/seguranca/actions';

// Ativação do TOTP: enroll (gera QR + segredo) -> challenge -> verify com o 1º código. Só depois disso o fator fica "verified" e a sessão vira aal2.
export default function AtivarTotp() {
  const [fase, setFase] = useState<'inicio' | 'qr'>('inicio');
  const [dados, setDados] = useState<{ id: string; qr: string; segredo: string } | null>(null);
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function gerar() {
    setOcupado(true); setErro('');
    const r = await gerarTotp();
    setOcupado(false);
    if ('erro' in r) { setErro(r.erro); return; }
    setDados(r);
    setFase('qr');
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    if (!dados || !/^\d{6}$/.test(codigo)) { setErro('Digite os 6 dígitos.'); return; }
    setOcupado(true); setErro('');
    const r = await confirmarTotp(dados.id, codigo); // certo: o servidor redireciona para /admin
    setOcupado(false);
    setErro(r.erro);
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
