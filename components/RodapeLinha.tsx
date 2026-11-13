import Link from 'next/link';

// Última linha de todo rodapé: copyright à esquerda, links jurídicos no centro, assinatura à direita.
// No celular os links vêm primeiro e copyright + assinatura dividem a linha de baixo.
export default function RodapeLinha() {
  return (
    <div className="rodape-linha">
      <p className="legal">© {new Date().getFullYear()} MDogão Itapevi · Desde 1995.</p>
      <nav className="nav2" aria-label="Links jurídicos">
        <Link href="/politica-de-privacidade">Política de privacidade</Link>
        <Link href="/termos-de-uso">Termos de uso</Link>
        <Link href="/politica-de-cookies">Política de cookies</Link>
      </nav>
      <small className="credito">MakeByKlinsmann</small>
    </div>
  );
}
