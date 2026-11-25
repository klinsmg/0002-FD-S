'use client';
import { useEffect, useRef } from 'react';

// Página do pedido (cliente): quando a etapa muda (o AoVivo redesenha a página), vibra no celular e, se a aba estiver em
// segundo plano, mostra a etapa no título — o cliente vê "Saiu para entrega" sem precisar abrir a aba.
export default function AvisoEtapa({ etapa }: { etapa: string }) {
  const anterior = useRef(etapa);
  useEffect(() => {
    if (anterior.current === etapa) return;
    anterior.current = etapa;
    navigator.vibrate?.([120, 60, 120]);
    if (document.visibilityState !== 'hidden') return;
    const original = document.title;
    document.title = `● ${etapa}`;
    const volta = () => { if (document.visibilityState === 'visible') { document.title = original; document.removeEventListener('visibilitychange', volta); } };
    document.addEventListener('visibilitychange', volta);
    return () => document.removeEventListener('visibilitychange', volta);
  }, [etapa]);
  return null;
}
