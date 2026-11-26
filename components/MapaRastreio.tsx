'use client';
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { decodificarPolyline, distanciaM, etaLocal } from '@/lib/regras';
import type { MapaConfig } from '@/lib/mapas/provedores';

export type Rastreio = {
  status: string; lat: number | null; lng: number | null; destLat: number; destLng: number;
  eta: number | null; km: number | null; rota: string | null; atualizadoEm: string | null;
  lojaLat: number | null; lojaLng: number | null; provedor: string | null; etaEm: string | null; velocidade: number | null;
};
const RECENTE_MS = 120_000;
const MANUAL_MS = 120_000; // "Atualizar previsão": no máximo a cada 2 min (o servidor também segura)
const ETAPA: Record<string, string> = { assigned: 'Saindo da loja', en_route: 'A caminho', arriving: 'Chegando', arrived: 'O entregador chegou', delivered: 'Entregue', cancelled: 'Entrega cancelada' };
const PROVEDOR: Record<string, string> = { google: 'rota do Google', osrm: 'rota própria', estimativa: 'estimativa pela distância' };

// Configuração do mapa: 1 pedido ao backend por sessão de rastreamento (sessionStorage até "expira")
async function configMapa(pedido: string): Promise<MapaConfig | null> {
  const k = `mapa-cfg-${pedido}`;
  try { const c = JSON.parse(sessionStorage.getItem(k) ?? 'null'); if (c && c.expira > Date.now()) return c; } catch { /* sem storage */ }
  try {
    const r = await fetch('/api/maps/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pedido }), signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const c = (await r.json()) as MapaConfig;
    try { sessionStorage.setItem(k, JSON.stringify(c)); } catch { /* ignora */ }
    return c;
  } catch { return null; }
}

// Rastreio do pedido para o cliente: status, ETA, mapa com loja, endereço, entregador (posição APROXIMADA) e rota.
// Posição chega pelo canal privado do pedido (WebSocket; evento 'rastreio' repassado pelo AoVivo) e move o marcador
// sem recarregar o mapa. Entre recálculos, a ETA é estimada aqui (distância restante x velocidade recente).
export default function MapaRastreio({ pedido, inicial }: { pedido: string; inicial: Rastreio }) {
  const [d, setD] = useState(inicial);
  const [agora, setAgora] = useState(() => Date.now());
  const [cfg, setCfg] = useState<MapaConfig | null>(null);
  const [manualEm, setManualEm] = useState(0);
  const [pedindo, setPedindo] = useState(false);
  const vels = useRef<number[]>(inicial.velocidade ? [inicial.velocidade] : []);
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<{ L: typeof Leaflet; m: Leaflet.Map; moto: Leaflet.Marker; linha: Leaflet.Polyline; enquadrado: boolean } | null>(null);

  useEffect(() => {
    const ouvir = (e: Event) => {
      const { topico, event, payload } = (e as CustomEvent).detail ?? {};
      if (topico !== `pedido:${pedido}` || event !== 'rastreio' || !payload) return;
      const n = (v: unknown) => (v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : null);
      if (n(payload.velocidadeKmh) !== null) vels.current = [...vels.current, n(payload.velocidadeKmh)!].slice(-8);
      setD(v => ({
        ...v,
        status: typeof payload.status === 'string' ? payload.status : v.status,
        lat: n(payload.lat) ?? v.lat, lng: n(payload.lng) ?? v.lng,
        eta: n(payload.etaMinutos) ?? v.eta, km: n(payload.distanciaKm) ?? v.km,
        rota: typeof payload.rota === 'string' ? payload.rota : v.rota,
        provedor: typeof payload.provedor === 'string' ? payload.provedor : v.provedor,
        etaEm: typeof payload.etaEm === 'string' ? payload.etaEm : v.etaEm,
        atualizadoEm: typeof payload.atualizadoEm === 'string' ? payload.atualizadoEm : v.atualizadoEm,
      }));
    };
    window.addEventListener('aovivo', ouvir);
    const t = setInterval(() => setAgora(Date.now()), 15_000);
    return () => { window.removeEventListener('aovivo', ouvir); clearInterval(t); };
  }, [pedido]);

  // sem o canal ao vivo, a página se atualiza a cada 30 s (AoVivo): aceita o dado do servidor se for mais novo
  useEffect(() => {
    const t = (s: string | null) => (s ? Date.parse(s) : 0);
    setD(v => (t(inicial.atualizadoEm) > t(v.atualizadoEm) || t(inicial.etaEm) > t(v.etaEm) ? { ...v, ...inicial } : v));
  }, [inicial.atualizadoEm, inicial.etaEm]); // eslint-disable-line react-hooks/exhaustive-deps

  const temPosicao = d.lat !== null && d.lng !== null && !!d.atualizadoEm && agora - new Date(d.atualizadoEm).getTime() < RECENTE_MS;

  // cria o mapa uma vez (configuração do backend; sem ela, mapa simples: marcadores + rota)
  useEffect(() => {
    let vivo = true, desfazer: (() => void) | undefined;
    (async () => {
      const c = (await configMapa(pedido)) ?? { provedor: 'simples', tipo: null, tiles: null, atribuicao: '', maxZoom: 18, fallback: true, expira: 0 };
      if (!vivo || !caixa.current) return;
      setCfg(c);
      const { criarMapa, icone } = await import('@/lib/mapa-leaflet');
      if (!vivo || !caixa.current) return;
      const destino = { lat: inicial.destLat, lng: inicial.destLng };
      const { L, m } = await criarMapa(caixa.current, c, destino);
      L.marker([destino.lat, destino.lng], { icon: icone(L, '🏠', 'mk-casa'), title: 'Seu endereço', keyboard: false }).addTo(m);
      if (inicial.lojaLat !== null && inicial.lojaLng !== null) L.marker([inicial.lojaLat, inicial.lojaLng], { icon: icone(L, '🌭', 'mk-loja'), title: 'MDogão', keyboard: false }).addTo(m);
      const moto = L.marker([destino.lat, destino.lng], { icon: icone(L, '🛵', 'mk-moto'), title: 'Entregador (posição aproximada)', keyboard: false, zIndexOffset: 500, opacity: 0 }).addTo(m);
      const linha = L.polyline([], { color: '#c8331e', weight: 5, opacity: 0.85 }).addTo(m);
      mapa.current = { L, m, moto, linha, enquadrado: false };
      desfazer = () => m.remove();
      setD(v => ({ ...v })); // redesenha com o mapa pronto
    })().catch(() => setCfg(x => x ?? { provedor: 'simples', tipo: null, tiles: null, atribuicao: '', maxZoom: 18, fallback: true, expira: 0 }));
    return () => { vivo = false; desfazer?.(); mapa.current = null; };
  }, [pedido, inicial.destLat, inicial.destLng, inicial.lojaLat, inicial.lojaLng]);

  // atualiza marcador e rota (sem recarregar o mapa)
  useEffect(() => {
    const x = mapa.current;
    if (!x) return;
    x.moto.setOpacity(temPosicao ? 1 : 0);
    if (temPosicao) x.moto.setLatLng([d.lat!, d.lng!]);
    const pts = d.rota ? decodificarPolyline(d.rota) : [];
    x.linha.setLatLngs(pts.map(p => [p.lat, p.lng] as [number, number]));
    if (!x.enquadrado && (temPosicao || pts.length)) {
      const b = x.L.latLngBounds([[d.destLat, d.destLng]]);
      if (temPosicao) b.extend([d.lat!, d.lng!]);
      pts.forEach(p => b.extend([p.lat, p.lng]));
      x.m.fitBounds(b, { padding: [36, 36], maxZoom: 16 }); x.enquadrado = true;
    }
  }, [d, temPosicao]);

  async function atualizarPrevisao() {
    setPedindo(true); setManualEm(Date.now());
    try {
      const r = await fetch('/api/maps/eta', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pedido, manual: true }), signal: AbortSignal.timeout(10000) });
      if (r.ok) {
        const j = await r.json();
        setD(v => ({ ...v, eta: j.etaMinutos ?? v.eta, km: j.distanciaKm ?? v.km, provedor: j.provedor ?? v.provedor, etaEm: j.calculadoEm ?? v.etaEm }));
      }
    } catch { /* segue com a estimativa local */ } finally { setPedindo(false); }
  }

  const encerrada = d.status === 'delivered' || d.status === 'cancelled';
  const restante = temPosicao ? distanciaM({ lat: d.lat!, lng: d.lng! }, { lat: d.destLat, lng: d.destLng }) : null;
  const eta = etaLocal({ etaRotaMin: d.eta, calculadoEm: d.etaEm ? new Date(d.etaEm).getTime() : null, agora, restanteM: restante, velocidades: vels.current });
  const podeManual = !encerrada && agora - manualEm >= MANUAL_MS && !pedindo;
  return (
    <section className="rastreio" aria-labelledby="rastreio-t">
      <div className="rastreio-topo">
        <h2 id="rastreio-t">{ETAPA[d.status] ?? 'Saiu para entrega'}</h2>
        {!encerrada && eta !== null && <p className="rastreio-eta"><b>~{eta} min</b>{d.km !== null && <span> · {String(d.km).replace('.', ',')} km</span>}</p>}
      </div>
      {!encerrada && !temPosicao && <p className="nota" role="status">Localização temporariamente indisponível. Assim que o sinal do entregador voltar, ela aparece aqui.</p>}
      <div ref={caixa} className="rastreio-mapa" role="img" aria-label="Mapa com a loja, a rota até o seu endereço e a posição aproximada do entregador" />
      {cfg?.fallback && <p className="nota rastreio-reserva">Mapa simplificado no momento. A posição e a previsão continuam sendo atualizadas.</p>}
      {!encerrada && (
        <p className="nota">
          A posição do entregador é aproximada (cerca de 100 m). Previsão por {PROVEDOR[d.provedor ?? ''] ?? 'estimativa'}, ajustada pelo deslocamento.{' '}
          <button type="button" className="link-btn" onClick={atualizarPrevisao} disabled={!podeManual}>{pedindo ? 'Atualizando…' : 'Atualizar previsão'}</button>
        </p>
      )}
    </section>
  );
}
