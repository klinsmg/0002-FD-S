'use client';
import { useEffect, useRef, useState } from 'react';

const CHAVE_SOM = 'loja-som';

// Alerta de pedido novo no quadro da loja: quando chega um pedido "Novo" que ainda não estava na tela, toca um bipe
// (se o som estiver ligado), vibra no celular, pisca o título da aba, mostra um aviso (e uma notificação do sistema com a
// aba em segundo plano) e mantém a tela acesa enquanto o quadro está aberto.
export default function AlertaPedidos({ novos }: { novos: { id: string; n: number }[] }) {
  const vistos = useRef<Set<string> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const [som, setSom] = useState(false);
  const [aviso, setAviso] = useState<number[]>([]);

  // o quadro é atualizado pelo AoVivo do layout do painel (tempo real); aqui só o alerta
  useEffect(() => {
    try { setSom(localStorage.getItem(CHAVE_SOM) === '1'); } catch {}
  }, []);

  useEffect(() => {
    if (!vistos.current) { vistos.current = new Set(novos.map(p => p.id)); return; } // primeira carga: nada é "novo"
    const chegaram = novos.filter(p => !vistos.current!.has(p.id));
    novos.forEach(p => vistos.current!.add(p.id));
    if (!chegaram.length) return;
    setAviso(a => [...a, ...chegaram.map(p => p.n)]);
    navigator.vibrate?.([200, 100, 200]);
    if (som) bipe();
    // aba em segundo plano (outra tela aberta no tablet/PC): aviso do sistema, se a loja permitiu ao ligar o som
    if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification('Novo pedido!', { body: chegaram.map(p => `#${p.n}`).join(', '), tag: 'pedido-novo' }); } catch {}
    }
  }, [novos]); // eslint-disable-line react-hooks/exhaustive-deps

  // título da aba pisca enquanto houver aviso não visto
  useEffect(() => {
    if (!aviso.length) return;
    const original = document.title;
    let alt = false;
    const t = setInterval(() => { document.title = (alt = !alt) ? `(${aviso.length}) Novo pedido!` : original; }, 1000);
    return () => { clearInterval(t); document.title = original; };
  }, [aviso.length]);

  function bipe() {
    const ctx = audio.current;
    if (!ctx) return;
    [0, 0.3].forEach(atraso => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      const t0 = ctx.currentTime + atraso;
      g.gain.setValueAtTime(0.25, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
      o.start(t0); o.stop(t0 + 0.25);
    });
  }

  // o navegador só libera áudio depois de um clique: o botão cria o AudioContext e toca um bipe de teste
  function alternarSom() {
    const novo = !som;
    setSom(novo);
    try { localStorage.setItem(CHAVE_SOM, novo ? '1' : '0'); } catch {}
    if (novo) {
      audio.current ??= new AudioContext(); void audio.current.resume(); bipe();
      if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission().catch(() => {});
    }
  }

  // quadro aberto = tela do tablet não apaga (senão o bipe/aviso passa despercebido); volta a valer ao reabrir a aba
  useEffect(() => {
    type Trava = { release(): Promise<void> };
    const wl = (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<Trava> } }).wakeLock;
    if (!wl) return;
    let trava: Trava | null = null;
    const pedir = () => { if (document.visibilityState === 'visible') wl.request('screen').then(t => { trava = t; }).catch(() => {}); };
    pedir();
    document.addEventListener('visibilitychange', pedir);
    return () => { document.removeEventListener('visibilitychange', pedir); void trava?.release().catch(() => {}); };
  }, []);

  // som salvo como ligado: o primeiro clique em qualquer lugar da página destrava o áudio
  useEffect(() => {
    if (!som || audio.current) return;
    const destravar = () => { audio.current ??= new AudioContext(); void audio.current.resume(); };
    document.addEventListener('pointerdown', destravar, { once: true });
    return () => document.removeEventListener('pointerdown', destravar);
  }, [som]);

  return (
    <div className="loja-barra wrap">
      <button type="button" className={`btn ${som ? 'btn-p' : 'btn-o'}`} onClick={alternarSom} aria-pressed={som}>
        {som ? '🔔 Som ligado' : '🔕 Ligar som de pedido novo'}
      </button>
      <span className="nota">Pedidos novos aparecem aqui na hora.</span>
      {aviso.length > 0 && (
        <p className="loja-aviso" role="alert">
          Novo pedido {aviso.map(n => `#${n}`).join(', ')}!
          <button type="button" onClick={() => setAviso([])}>Ok, vi</button>
        </p>
      )}
    </div>
  );
}
