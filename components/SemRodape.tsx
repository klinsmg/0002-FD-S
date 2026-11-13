'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Painel (/admin/*, inclusive login e 2FA do admin): sem rodapé nenhum.
// Login (/login) e área do cliente (/conta/*): rodapé mínimo, só com os links jurídicos. O resto do site: rodapé completo.
const SEM = ['/login', '/conta'];
const dentro = (p: string, r: string) => p === r || p.startsWith(r + '/');
export default function SemRodape({ children }: { children: React.ReactNode }) {
  const p = usePathname();
  if (dentro(p, '/admin')) return null;
  if (!SEM.some(r => dentro(p, r))) return children;
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
