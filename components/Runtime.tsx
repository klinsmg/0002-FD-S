'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Carrega o Alpine sob demanda (fora do bundle inicial) e faz a entrada suave dos elementos [data-reveal].
export default function Runtime() {
  const path = usePathname();
  // Alpine (carrinho) sob demanda, uma vez só
  useEffect(() => {
    const w = window as unknown as { Alpine?: object };
    if (w.Alpine) return;
    (async () => {
      const [{ default: Alpine }, { carrinho }] = await Promise.all([import('alpinejs'), import('@/lib/carrinho')]);
      if (w.Alpine) return;
      Alpine.data('carrinho', carrinho);
      w.Alpine = Alpine;
      Alpine.start();
    })();
  }, []);
  // Entrada suave dos [data-reveal] ao rolar: IntersectionObserver + transição CSS (globals.css).
  // Antes era GSAP ScrollTrigger: com 238 itens no cardápio, criar os gatilhos travava o celular por ~4 s.
  // O CSS só esconde os itens depois que html.rv-on existe, então sem JS nada some.
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>('[data-reveal]:not(.rv-vis)')];
    if (!els.length || !('IntersectionObserver' in window)) return;
    document.documentElement.classList.add('rv-on');
    const io = new IntersectionObserver(entradas => {
      let i = 0;
      for (const e of entradas) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        el.style.transitionDelay = `${Math.min(i++, 8) * 60}ms`; // escada curta para o lote que entra junto
        el.classList.add('rv-vis');
        io.unobserve(el);
      }
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [path]);
  // bloqueia clique direito e arrastar de imagens (campos de formulário continuam normais)
  useEffect(() => {
    const campo = (t: EventTarget | null) => t instanceof Element && !!t.closest('input, textarea, address, .hor, .end, .canais, .sel');
    const bloqueia = (e: Event) => { if (!campo(e.target)) e.preventDefault(); };
    document.addEventListener('contextmenu', bloqueia);
    document.addEventListener('dragstart', bloqueia);
    return () => { document.removeEventListener('contextmenu', bloqueia); document.removeEventListener('dragstart', bloqueia); };
  }, []);
  return null;
}
