import Link from 'next/link';
import { nav } from './links';
import Logo from './Logo';
import ContaTopo from './ContaTopo';
import CtaTopo from './CtaTopo';
import { A } from '@/lib/alp';

// Alpine controla o menu mobile (x-data aqui, x-show no <nav>). Ordem: logo, menu, "Realizar pedido", botão do menu (celular)
// e, no extremo direito e sempre visível, a conta.
export default function Header() {
  return (
    <div x-data="{open:false}" className="topo-wrap">
      <header className="topo">
        <Link className="marca" href="/" aria-label="MDogão Itapevi, início"><Logo priority /></Link>
        <nav className="desk" aria-label="Principal">
          {nav.map(([t, h]) => <Link key={h} href={h}>{t}</Link>)}
        </nav>
        <CtaTopo />
        <button className="menu-btn" aria-label="Abrir menu" aria-controls="menu-mobile" {...A({ 'x-on:click': 'open=!open', 'x-bind:aria-expanded': 'open' })} />
        <ContaTopo />
      </header>
      <nav id="menu-mobile" className="menu" aria-label="Principal" x-show="open" x-cloak="" {...A({ 'x-on:click': 'open=false' })}>
        {nav.map(([t, h]) => <Link key={h} href={h}>{t}</Link>)}
        <Link className="btn btn-p" href="/cardapio">Realizar pedido</Link>
      </nav>
    </div>
  );
}
