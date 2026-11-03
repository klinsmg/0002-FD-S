'use client';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

// Carrega Alpine e GSAP sob demanda (fora do bundle inicial) e anima elementos [data-reveal].
export default function Runtime() {
  const path = usePathname();
  useEffect(() => {
    let dead = false;
    let ctx: { revert(): void } | undefined;
    let ro: ResizeObserver | undefined;
    (async () => {
      const w = window as unknown as { Alpine?: object };
      if (!w.Alpine) {
        const [{ default: Alpine }, { carrinho }] = await Promise.all([import('alpinejs'), import('@/lib/carrinho')]);
        Alpine.data('carrinho', carrinho);
        w.Alpine = Alpine;
        Alpine.start();
      }
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([import('gsap'), import('gsap/ScrollTrigger')]);
      if (dead) return;
      gsap.registerPlugin(ScrollTrigger);
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      ctx = gsap.context(() => {
        const els = gsap.utils.toArray<HTMLElement>('[data-reveal]');
        gsap.set(els, { opacity: 0, y: 30 });
        ScrollTrigger.batch(els, {
          start: 'top 92%', once: true,
          onEnter: b => gsap.to(b, { opacity: 1, y: 0, duration: 0.6, stagger: 0.06 }),
        });
      });
      // Alpine mostra/esconde blocos (filtro, FAQ): recalcula as posições do ScrollTrigger quando a altura muda.
      let raf = 0;
      ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => ScrollTrigger.refresh()); });
      ro.observe(document.body);
    })();
    return () => { dead = true; ro?.disconnect(); ctx?.revert(); };
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
