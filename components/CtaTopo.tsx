'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

// "Realizar pedido" no cabeçalho. Em página com o botão da hero (data-cta-hero), só aparece quando esse botão sai da tela;
// nas outras páginas fica sempre visível. No cardápio não aparece (já é a página do pedido).
export default function CtaTopo() {
  const caminho = usePathname();
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const el = ref.current;
    const hero = document.querySelector('[data-cta-hero]');
    if (!el || !hero) return;
    const io = new IntersectionObserver(([e]) => el.classList.toggle('fora', !e.isIntersecting), { rootMargin: '-76px 0px 0px 0px' }); // desconta o cabeçalho fixo
    io.observe(hero);
    return () => io.disconnect();
  }, [caminho]);

  // sem "Realizar pedido" onde não faz sentido: cardápio (já é o pedido), login, painel e app do entregador
  if (['/cardapio', '/entregador', '/admin', '/login'].some(r => caminho === r || caminho.startsWith(r + '/'))) return null;
  return <Link ref={ref} className="btn btn-p topo-cta" href="/cardapio">Realizar pedido</Link>;
}
