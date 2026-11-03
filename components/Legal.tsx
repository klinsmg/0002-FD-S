import type { ReactNode } from 'react';
import Link from 'next/link';

// Página de documento legal: título, subtítulo, data de revisão, menu dos documentos e seções numeradas (1., 1.1.).
// Marcação simples nos textos: **negrito** e [texto](/caminho ou mailto:...).
export type Bloco = string | { h3: string } | { lista: string[] } | { tabela: { cab: string[]; linhas: string[][] } };
export type Secao = { id: string; titulo: string; blocos: Bloco[] };

export const REVISAO = '3 de novembro de 2026';

const docs: [string, string][] = [
  ['/politica-de-privacidade', 'Política de privacidade'],
  ['/politica-de-cookies', 'Política de cookies'],
  ['/termos-de-uso', 'Termos de uso'],
];

const inline = (t: string): ReactNode[] =>
  t.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g).map((p, i) => {
    const b = p.match(/^\*\*([^*]+)\*\*$/);
    if (b) return <strong key={i}>{b[1]}</strong>;
    const l = p.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (l) return l[2].startsWith('/') ? <Link key={i} href={l[2]}>{l[1]}</Link> : <a key={i} href={l[2]}>{l[1]}</a>;
    return p;
  });

export default function Legal({ atual, titulo, sub, secoes }: { atual: string; titulo: string; sub: string; secoes: Secao[] }) {
  return (
    <main className="legal-pg wrap">
      <header className="legal-cab" id="topo">
        <h1>{titulo}</h1>
        <p className="legal-sub">{sub}</p>
        <p className="legal-rev">Última revisão: {REVISAO}</p>
      </header>

      <div className="legal-corpo">
        <aside className="legal-nav">
          <nav aria-label="Documentos legais">
            <p className="legal-nav-t">Documentos legais</p>
            <ul>
              {docs.map(([h, t]) => (
                <li key={h}><Link href={h} aria-current={h === atual ? 'page' : undefined}>{t}</Link></li>
              ))}
            </ul>
          </nav>
          <nav aria-label="Nesta página" className="legal-toc">
            <p className="legal-nav-t">Nesta página</p>
            <ol>
              {secoes.map((s, i) => <li key={s.id}><a href={`#${s.id}`}>{i + 1}. {s.titulo}</a></li>)}
            </ol>
          </nav>
        </aside>

        <article className="legal-texto">
          {secoes.map((s, i) => (
            <section key={s.id} id={s.id}>
              <h2>{i + 1}. {s.titulo}</h2>
              {s.blocos.map((b, k) => {
                if (typeof b === 'string') return <p key={k}>{inline(b)}</p>;
                if ('h3' in b) return <h3 key={k}>{b.h3}</h3>;
                if ('lista' in b) return <ul key={k}>{b.lista.map((x, j) => <li key={j}>{inline(x)}</li>)}</ul>;
                return (
                  <div key={k} className="legal-tab" role="region" aria-label="Tabela" tabIndex={0}>
                    <table>
                      <thead><tr>{b.tabela.cab.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>
                      <tbody>{b.tabela.linhas.map((l, r) => <tr key={r}>{l.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                );
              })}
            </section>
          ))}
          <p className="legal-aviso">Texto-base elaborado a partir do funcionamento atual do site. Recomendamos revisão por assessoria jurídica antes da publicação e sempre que o site passar a coletar novos dados.</p>
          <a className="legal-topo" href="#topo">↑ Voltar ao topo</a>
        </article>
      </div>
    </main>
  );
}
