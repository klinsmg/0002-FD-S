import Link from 'next/link';
import { nav } from './links';
import Logo from './Logo';
import { A } from '@/lib/alp';
import { wa } from '@/lib/info';

// Alpine controla o menu mobile (x-data aqui, x-show no <nav>).
export default function Header() {
  return (
    <div x-data="{open:false}" className="topo-wrap">
      <header className="topo">
        <Link className="marca" href="/" aria-label="MDogão Itapevi, início"><Logo priority /></Link>
        <nav className="desk" aria-label="Principal">
          {nav.map(([t, h]) => <Link key={h} href={h}>{t}</Link>)}
        </nav>
        <a className="btn btn-p topo-cta" href={wa('Olá! Quero fazer um pedido.')} target="_blank" rel="noopener noreferrer">Pedir no WhatsApp</a>
        <button className="menu-btn" aria-label="Abrir menu" aria-controls="menu-mobile" {...A({ 'x-on:click': 'open=!open', 'x-bind:aria-expanded': 'open' })} />
      </header>
      <nav id="menu-mobile" className="menu" aria-label="Principal" x-show="open" x-cloak="" {...A({ 'x-on:click': 'open=false' })}>
        {nav.map(([t, h]) => <Link key={h} href={h}>{t}</Link>)}
        <a className="btn btn-p" href={wa('Olá! Quero fazer um pedido.')} target="_blank" rel="noopener noreferrer">Pedir no WhatsApp</a>
      </nav>
    </div>
  );
}
