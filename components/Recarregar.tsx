'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Atualiza os dados da página (sem recarregar) a cada N s enquanto a aba está visível, e ao voltar para a aba.
// ponytail: polling na lista do entregador; um canal Realtime "entregador:<id>" resolve se a frota crescer.
export default function Recarregar({ segundos = 20 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const vis = () => document.visibilityState === 'visible';
    const t = setInterval(() => { if (vis()) router.refresh(); }, segundos * 1000);
    const volta = () => { if (vis()) router.refresh(); };
    document.addEventListener('visibilitychange', volta);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', volta); };
  }, [router, segundos]);
  return null;
}
