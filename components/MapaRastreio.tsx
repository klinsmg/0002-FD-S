'use client';
import { useEffect, useRef, useState } from 'react';

export type Rastreio = {
  status: string; lat: number | null; lng: number | null; destLat: number; destLng: number;
  eta: number | null; km: number | null; rota: string | null; atualizadoEm: string | null;
};
// ponytail: sem @types/google.maps (dependência só para tipos); a API usada aqui é pequena e está toda neste arquivo
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GMaps = any;
const gWin = () => (window as unknown as { google?: { maps?: GMaps } }).google;

const CHAVE = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ?? '';
const RECENTE_MS = 120_000;
const ETAPA: Record<string, string> = { assigned: 'Saindo da loja', en_route: 'A caminho', arriving: 'Chegando', arrived: 'O entregador chegou', delivered: 'Entregue', cancelled: 'Entrega cancelada' };

// carrega a Maps JavaScript API uma vez (chave de FRONTEND, restrita por domínio)
let carregando: Promise<GMaps> | null = null;
function carregarMaps(): Promise<GMaps> {
  if (typeof window !== 'undefined' && gWin()?.maps?.geometry) return Promise.resolve(gWin()!.maps);
  carregando ??= new Promise((ok, falha) => {
    const cb = `__mapaPronto${Date.now()}`;
    (window as unknown as Record<string, () => void>)[cb] = () => ok(gWin()!.maps);
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(CHAVE)}&libraries=geometry&loading=async&language=pt-BR&region=BR&callback=${cb}`;
    s.async = true;
    s.onerror = () => { carregando = null; falha(new Error('maps')); };
    document.head.appendChild(s);
  });
  return carregando;
}

// Rastreio do pedido para o cliente: status, ETA e mapa com a rota e a posição APROXIMADA do entregador.
// Atualiza pelo canal privado do pedido (evento 'rastreio', repassado pelo AoVivo) sem recarregar a página.
export default function MapaRastreio({ pedido, inicial }: { pedido: string; inicial: Rastreio }) {
  const [d, setD] = useState(inicial);
  const [agora, setAgora] = useState(() => Date.now());
  const [semMapa, setSemMapa] = useState(!CHAVE);
  const caixa = useRef<HTMLDivElement>(null);
  const mapa = useRef<{ g: GMaps; m: GMaps; moto: GMaps; linha: GMaps; enquadrado: boolean } | null>(null);

  // novas posições pelo WebSocket
  useEffect(() => {
    const ouvir = (e: Event) => {
      const { topico, event, payload } = (e as CustomEvent).detail ?? {};
      if (topico !== `pedido:${pedido}` || event !== 'rastreio' || !payload) return;
      setD(v => ({
        ...v,
        status: typeof payload.status === 'string' ? payload.status : v.status,
        lat: Number.isFinite(Number(payload.lat)) ? Number(payload.lat) : v.lat,
        lng: Number.isFinite(Number(payload.lng)) ? Number(payload.lng) : v.lng,
        eta: Number.isFinite(Number(payload.etaMinutos)) ? Number(payload.etaMinutos) : v.eta,
        km: Number.isFinite(Number(payload.distanciaKm)) ? Number(payload.distanciaKm) : v.km,
        rota: typeof payload.rota === 'string' ? payload.rota : v.rota,
        atualizadoEm: typeof payload.atualizadoEm === 'string' ? payload.atualizadoEm : v.atualizadoEm,
      }));
    };
    window.addEventListener('aovivo', ouvir);
    const t = setInterval(() => setAgora(Date.now()), 15_000);
    return () => { window.removeEventListener('aovivo', ouvir); clearInterval(t); };
  }, [pedido]);

  const temPosicao = d.lat !== null && d.lng !== null && !!d.atualizadoEm && agora - new Date(d.atualizadoEm).getTime() < RECENTE_MS;

  // cria o mapa
  useEffect(() => {
    if (!CHAVE || !caixa.current) return;
    let vivo = true;
    carregarMaps().then(g => {
      if (!vivo || !caixa.current) return;
      const destino = { lat: inicial.destLat, lng: inicial.destLng };
      const m = new g.Map(caixa.current, { center: destino, zoom: 15, disableDefaultUI: true, zoomControl: true, gestureHandling: 'cooperative', clickableIcons: false });
      new g.Marker({ map: m, position: destino, title: 'Seu endereço', label: { text: '🏠', fontSize: '18px' } });
      const moto = new g.Marker({ map: m, title: 'Entregador (posição aproximada)', zIndex: 2,
        icon: { path: g.SymbolPath.CIRCLE, scale: 11, fillColor: '#f2a541', fillOpacity: 1, strokeColor: '#130907', strokeWeight: 3 } });
      const linha = new g.Polyline({ map: m, strokeColor: '#f2a541', strokeOpacity: 0.85, strokeWeight: 5 });
      mapa.current = { g, m, moto, linha, enquadrado: false };
      setD(v => ({ ...v })); // redesenha com o mapa pronto
    }).catch(() => setSemMapa(true));
    return () => { vivo = false; };
  }, [inicial.destLat, inicial.destLng]);

  // atualiza marcador e rota
  useEffect(() => {
    const x = mapa.current;
    if (!x) return;
    x.moto.setVisible(temPosicao);
    if (temPosicao) x.moto.setPosition({ lat: d.lat!, lng: d.lng! });
    if (d.rota) x.linha.setPath(x.g.geometry.encoding.decodePath(d.rota));
    if (temPosicao && !x.enquadrado) {
      const b = new x.g.LatLngBounds();
      b.extend({ lat: d.lat!, lng: d.lng! }); b.extend({ lat: d.destLat, lng: d.destLng });
      x.m.fitBounds(b, 48); x.enquadrado = true;
    }
  }, [d, temPosicao]);

  const encerrada = d.status === 'delivered' || d.status === 'cancelled';
  return (
    <section className="rastreio" aria-labelledby="rastreio-t">
      <div className="rastreio-topo">
        <h2 id="rastreio-t">{ETAPA[d.status] ?? 'Saiu para entrega'}</h2>
        {!encerrada && d.eta !== null && <p className="rastreio-eta"><b>~{d.eta} min</b>{d.km !== null && <span> · {String(d.km).replace('.', ',')} km</span>}</p>}
      </div>
      {!encerrada && !temPosicao && <p className="nota" role="status">Localização temporariamente indisponível. Assim que o sinal do entregador voltar, ela aparece aqui.</p>}
      {semMapa ? <p className="nota">Mapa indisponível no momento.</p> : <div ref={caixa} className="rastreio-mapa" role="img" aria-label="Mapa com a rota até o seu endereço e a posição aproximada do entregador" />}
      {!encerrada && <p className="nota">A posição do entregador é aproximada (cerca de 100 m) e a previsão considera o trânsito.</p>}
    </section>
  );
}
