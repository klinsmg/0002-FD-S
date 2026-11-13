'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

// Recarrega os dados da página (sem recarregar a página inteira) enquanto a aba está visível.
export default function AtualizarSozinho({ segundos = 30 }: { segundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, segundos * 1000);
    const volta = () => { if (document.visibilityState === 'visible') router.refresh(); };
    document.addEventListener('visibilitychange', volta);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', volta); };
  }, [router, segundos]);
  return null;
}
