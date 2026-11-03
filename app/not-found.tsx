import Image from 'next/image';
import Link from 'next/link';
import { nav } from '@/components/links';

export const metadata = { title: 'Página não encontrada' };

// 404: mesma linguagem das heroes (fundo escuro com brilho, foto que se dissolve), com saídas claras para o resto do site.
export default function NotFound() {
  return (
    <main className="nf">
      <div className="nf-txt">
        <p className="script">ops, esse prato não saiu da cozinha</p>
        <p className="nf-num" aria-hidden="true">404</p>
        <h1>Página não <em>encontrada</em></h1>
        <p className="nf-sub">O endereço que você abriu não existe ou foi movido. Que tal voltar para o início ou dar uma olhada no cardápio?</p>
        <div className="nf-acoes">
          <Link className="btn btn-p" href="/">Voltar ao início</Link>
          <Link className="btn btn-o" href="/cardapio">Ver o cardápio</Link>
        </div>
        <nav className="nf-links" aria-label="Páginas do site">
          <p>Ou vá direto para:</p>
          <ul>{nav.map(([t, h]) => <li key={h}><Link href={h}>{t}</Link></li>)}</ul>
        </nav>
      </div>
      <div className="nf-img" aria-hidden="true">
        <Image src="/img/p14.webp" alt="" width={1000} height={1250} sizes="(min-width:900px) 50vw, 0px" quality={85} />
      </div>
    </main>
  );
}
