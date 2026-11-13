'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// No login (/login), na área do cliente (/conta/*) e no painel (/admin/*) o rodapé institucional dá lugar a um rodapé
// mínimo, só com os links jurídicos (privacidade, cookies, termos). O resto do site segue com o rodapé completo.
const SEM = ['/login', '/conta', '/admin'];
export default function SemRodape({ children }: { children: React.ReactNode }) {
  const p = usePathname();
  if (!SEM.some(r => p === r || p.startsWith(r + '/'))) return children;
  return (
    <footer className="rodape-min">
      <nav className="nav2" aria-label="Links jurídicos">
        <Link href="/politica-de-privacidade">Política de privacidade</Link>
        <Link href="/politica-de-cookies">Cookies</Link>
        <Link href="/termos-de-uso">Termos de uso</Link>
      </nav>
      <p className="legal">© {new Date().getFullYear()} MDogão Itapevi</p>
    </footer>
  );
}
