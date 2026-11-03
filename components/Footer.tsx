import Link from 'next/link';
import Logo from './Logo';
import { nav } from './links';
import { info, wa, mapa } from '@/lib/info';

// Estrutura do footer do template (logo, chamada, redes, nav principal, nav legal, aviso) com os dados do Dogão.
const sociais: [string, string, React.ReactNode][] = [
  ['Instagram', info.insta, <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r=".6" /></>],
  ['WhatsApp', wa(), <><path d="M3 21l1.6-4.8A8.5 8.5 0 1 1 8 19.5z" /><path d="M9 9c0 3 3 6 6 6l1.2-1.4-2-1-1 .6c-.8-.4-1.6-1.2-2-2l.6-1-1-2z" /></>],
  ['E-mail', `mailto:${info.email}`, <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3.5 7l8.5 6 8.5-6" /></>],
  ['Como chegar', mapa, <><path d="M12 21s7-5.6 7-11a7 7 0 0 0-14 0c0 5.4 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></>],
];

export default function Footer() {
  return (
    <footer>
      <div className="logo-s"><Logo size={96} /></div>
      <p className="fome"><span>FOME?</span> PEÇA AGORA</p>
      <div className="sociais">
        {sociais.map(([nome, href, d]) => (
          <a key={nome} href={href} aria-label={nome} target={href.startsWith('mailto') ? undefined : '_blank'} rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
          </a>
        ))}
      </div>
      <div className="nav1">{nav.map(([t, h]) => <Link key={h} href={h}>{t}</Link>)}</div>
      <div className="nav2">
        <Link href="/politica-de-privacidade">Política de privacidade</Link>
        <Link href="/politica-de-cookies">Cookies</Link>
        <Link href="/termos-de-uso">Termos de uso</Link>
      </div>
      <p className="end">{info.rua} · {info.bairro}<br />{info.horarios.map(([d, h]) => `${d}: ${h}`).join(' · ')}</p>
      <div className="legal-row">
        <p className="legal">© {new Date().getFullYear()} MDogão Itapevi · Desde 1995. Imagens do acervo do restaurante.</p>
        <small className="credito">MakeByKlinsmann</small>
      </div>
    </footer>
  );
}
