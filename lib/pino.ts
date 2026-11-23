// Pino do endereço no checkout (carregado só quando o cliente abre o mapa). Mapa base próprio (PMTiles), nunca Google.
import { criarMapa, icone, type BaseMapa } from '@/lib/mapa-leaflet';

let aberto: { remove(): void } | null = null;
export async function abrirPino(el: HTMLElement, base: BaseMapa, inicio: { lat: number; lng: number }, aoMover: (p: { lat: number; lng: number }) => void) {
  aberto?.remove();
  const { L, m } = await criarMapa(el, base, inicio, 17);
  const mk = L.marker([inicio.lat, inicio.lng], { draggable: true, autoPan: true, icon: icone(L, '🏠', 'mk-casa'), title: 'Entrada da casa' }).addTo(m);
  const fim = () => { const p = mk.getLatLng(); aoMover({ lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 }); };
  mk.on('dragend', fim);
  m.on('click', (e: { latlng: { lat: number; lng: number } }) => { mk.setLatLng(e.latlng); fim(); });
  setTimeout(() => m.invalidateSize(), 60); // a gaveta abre com animação
  aberto = m;
}
