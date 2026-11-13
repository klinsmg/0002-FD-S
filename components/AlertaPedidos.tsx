'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const INTERVALO = 15000; // o quadro se atualiza a cada 15 s
const CHAVE_SOM = 'loja-som';

// Alerta de pedido novo no quadro da loja: atualiza o quadro sozinho e, quando chega um pedido "Novo" que ainda não
// estava na tela, toca um bipe (se o som estiver ligado), vibra no celular, pisca o título da aba e mostra um aviso.
export default function AlertaPedidos({ novos }: { novos: { id: string; n: number }[] }) {
  const router = useRouter();
  const vistos = useRef<Set<string> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const [som, setSom] = useState(false);
  const [aviso, setAviso] = useState<number[]>([]);

  useEffect(() => {
    try { setSom(localStorage.getItem(CHAVE_SOM) === '1'); } catch {}
    const t = setInterval(() => router.refresh(), INTERVALO);
    return () => clearInterval(t);
  }, [router]);

  useEffect(() => {
    if (!vistos.current) { vistos.current = new Set(novos.map(p => p.id)); return; } // primeira carga: nada é "novo"
    const chegaram = novos.filter(p => !vistos.current!.has(p.id));
    novos.forEach(p => vistos.current!.add(p.id));
    if (!chegaram.length) return;
    setAviso(a => [...a, ...chegaram.map(p => p.n)]);
    navigator.vibrate?.([200, 100, 200]);
    if (som) bipe();
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
    if (novo) { audio.current ??= new AudioContext(); void audio.current.resume(); bipe(); }
  }

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
      <span className="nota">Atualiza sozinho a cada 15 s.</span>
      {aviso.length > 0 && (
        <p className="loja-aviso" role="alert">
          Novo pedido {aviso.map(n => `#${n}`).join(', ')}!
          <button type="button" onClick={() => setAviso([])}>Ok, vi</button>
        </p>
      )}
    </div>
  );
}
