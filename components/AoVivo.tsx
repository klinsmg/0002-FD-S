'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { RealtimeClient } from '@supabase/realtime-js';
import { tokenTempoReal } from '@/app/tempo-real/actions';

type Estado = 'ligando' | 'vivo' | 'caiu';

// Tempo real: assina um canal PRIVADO do Supabase Realtime (wss, com o JWT do usuário; o RLS decide quem entra).
// Cada aviso do banco faz router.refresh(): o servidor redesenha só os dados, sem recarregar nem piscar a tela.
// Caiu? O cliente do Realtime reconecta sozinho; enquanto isso, um polling leve cobre (a cada `reserva` s).
// Ao voltar (reconexão ou aba visível de novo), atualiza uma vez para pegar o que passou.
export default function AoVivo({ topico, reserva = 30, alertaNovo = false, selo = true }: { topico: string; reserva?: number; alertaNovo?: boolean; selo?: boolean }) {
  const router = useRouter();
  const rota = usePathname();
  const rotaRef = useRef(rota);
  rotaRef.current = rota;
  const [estado, setEstado] = useState<Estado>('ligando');
  const [novos, setNovos] = useState<number[]>([]);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL, chave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !chave) { setEstado('caiu'); return; }
    let tk: { token: string; expira: number } | null = null;
    // token renovado 2 min antes de vencer; o Realtime chama isto ao conectar e a cada heartbeat
    const token = async () => {
      if (!tk || tk.expira - Date.now() < 120_000) tk = await tokenTempoReal().catch(() => null);
      return tk?.token ?? null;
    };
    let espera: ReturnType<typeof setTimeout> | undefined;
    const atualizar = () => { clearTimeout(espera); espera = setTimeout(() => router.refresh(), 300); }; // junta rajadas
    let jaConectou = false;

    const rt = new RealtimeClient(`${url.replace(/^http/, 'ws')}/realtime/v1`, { params: { apikey: chave }, accessToken: token });
    const canal = rt.channel(topico, { config: { private: true } });
    canal
      .on('broadcast', { event: '*' }, ({ event, payload }) => {
        // posição/ETA do entregador: vai direto para o mapa (MapaRastreio), sem redesenhar a página a cada 7 s
        window.dispatchEvent(new CustomEvent('aovivo', { detail: { topico, event, payload } }));
        if (event === 'rastreio') return;
        if (alertaNovo && payload?.evento === 'novo' && rotaRef.current !== '/admin/loja') setNovos(n => [...n, Number(payload.numero)]);
        atualizar();
      })
      .subscribe(st => {
        if (st === 'SUBSCRIBED') { setEstado('vivo'); if (jaConectou) atualizar(); jaConectou = true; }
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') setEstado('caiu');
      });

    const volta = () => { if (document.visibilityState === 'visible') atualizar(); };
    document.addEventListener('visibilitychange', volta);
    return () => { clearTimeout(espera); document.removeEventListener('visibilitychange', volta); void rt.removeAllChannels(); rt.disconnect(); };
  }, [topico, alertaNovo, router]);

  // reserva: só enquanto o canal não está de pé
  useEffect(() => {
    if (estado === 'vivo') return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') router.refresh(); }, reserva * 1000);
    return () => clearInterval(t);
  }, [estado, reserva, router]);

  return (
    <>
      {selo && (
        <span className={`aovivo aovivo-${estado}`} role="status">
          {estado === 'vivo' ? 'Ao vivo' : estado === 'ligando' ? 'Conectando…' : 'Reconectando…'}
        </span>
      )}
      {novos.length > 0 && (
        <p className="aovivo-aviso" role="alert">
          Novo pedido {novos.map(n => `#${n}`).join(', ')}! <Link href="/admin/loja" onClick={() => setNovos([])}>Ver na loja</Link>
          <button type="button" onClick={() => setNovos([])} aria-label="Fechar aviso">×</button>
        </p>
      )}
    </>
  );
}
