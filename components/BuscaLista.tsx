'use client';
import { useEffect, useRef, useState } from 'react';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Busca instantânea numa lista já desenhada pelo servidor: esconde os itens [data-busca] do alvo que não batem.
// Sem ida ao servidor, com debounce de 120 ms; acentos e maiúsculas não importam.
export default function BuscaLista({ alvo, rotulo, placeholder }: { alvo: string; rotulo: string; placeholder?: string }) {
  const [q, setQ] = useState('');
  const [vazio, setVazio] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    clearTimeout(t.current);
    t.current = setTimeout(() => {
      const termos = norm(q).split(/\s+/).filter(Boolean);
      const itens = [...document.querySelectorAll<HTMLElement>(`${alvo} [data-busca]`)];
      let vistos = 0;
      for (const el of itens) {
        const texto = norm(el.dataset.busca ?? '');
        const ok = termos.every(x => texto.includes(x));
        el.hidden = !ok;
        if (ok) vistos++;
      }
      setVazio(itens.length > 0 && vistos === 0);
    }, 120);
    return () => clearTimeout(t.current);
  }, [q, alvo]);

  return (
    <div className="busca-lista">
      <label className="sr" htmlFor={`busca-${alvo}`}>{rotulo}</label>
      <input id={`busca-${alvo}`} type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder ?? rotulo} autoComplete="off" />
      <p className="nota" role="status" aria-live="polite">{vazio ? `Nada encontrado para "${q}".` : ''}</p>
    </div>
  );
}
