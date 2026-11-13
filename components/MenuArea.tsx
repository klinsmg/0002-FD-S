'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Menu das áreas logadas (conta e painel): marca a seção atual e, no celular, rola para o lado em vez de quebrar em linhas.
export default function MenuArea({ itens, rotulo, children }: { itens: readonly (readonly [string, string])[]; rotulo: string; children?: React.ReactNode }) {
  const atual = usePathname();
  // a seção ativa é o item com o prefixo mais longo que casa com a URL (/admin/pedidos/123 -> Pedidos, não Painel)
  const ativo = itens.map(([, h]) => h).filter(h => atual === h || atual.startsWith(`${h}/`)).sort((a, b) => b.length - a.length)[0];
  return (
    <nav className="area-menu" aria-label={rotulo}>
      <div className="wrap area-menu-in">
        {itens.map(([t, h]) => <Link key={h} href={h} aria-current={h === ativo ? 'page' : undefined}>{t}</Link>)}
        {children}
      </div>
    </nav>
  );
}
