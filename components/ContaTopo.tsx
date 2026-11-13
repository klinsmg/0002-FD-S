'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { sair } from '@/app/conta/actions';

const Icone = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
  </svg>
);

// Visitante: ícone que leva ao login (no desktop aparece ao passar o mouse no cabeçalho; no celular, sempre).
// Logado: menu da conta. A sessão é httpOnly, então pergunta ao servidor (/api/sessao).
export default function ContaTopo() {
  const [nome, setNome] = useState<string | null>(null);
  const menu = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    fetch('/api/sessao', { cache: 'no-store' }).then(r => r.json()).then(j => j.logado && setNome(j.nome || 'Conta')).catch(() => {});
    // fecha o menu ao clicar fora
    const fora = (e: MouseEvent) => { if (menu.current?.open && !menu.current.contains(e.target as Node)) menu.current.open = false; };
    document.addEventListener('click', fora);
    return () => document.removeEventListener('click', fora);
  }, []);

  if (!nome) return <Link className="topo-conta" href="/login" aria-label="Entrar na sua conta" title="Entrar"><Icone /></Link>;
  return (
    <details className="topo-conta topo-conta-on" ref={menu} onKeyDown={e => { if (e.key === 'Escape' && menu.current) { menu.current.open = false; menu.current.querySelector('summary')?.focus(); } }}>
      <summary aria-label={`Menu da conta de ${nome}`}><Icone /><span>{nome}</span></summary>
      <nav className="topo-conta-menu" aria-label="Minha conta">
        <Link href="/conta">Minha conta</Link>
        <Link href="/conta/pedidos">Pedidos</Link>
        <Link href="/conta/configuracoes">Configurações</Link>
        <form action={sair}><button type="submit">Sair</button></form>
      </nav>
    </details>
  );
}
