// Mapa no navegador (Leaflet), carregado sob demanda (import dinâmico): o cardápio e as outras páginas não pagam o custo.
// Base conforme a configuração segura que o backend entrega (lib/mapas/provedores.ts: MapaConfig):
//   pmtiles -> vetores do VPS próprio, desenhados no canvas (protomaps-leaflet)
//   raster  -> tiles do Google pelo NOSSO proxy (/api/maps/tiles, link assinado; a chave fica no servidor)
//   simples -> sem tiles: só marcadores e rota sobre fundo neutro (nunca mostra "erro de mapa")
import 'leaflet/dist/leaflet.css';
import type * as Leaflet from 'leaflet';

export type BaseMapa = { tipo: 'pmtiles' | 'raster' | null; tiles: string | null; atribuicao: string; maxZoom: number };

export async function criarMapa(el: HTMLElement, base: BaseMapa, centro: { lat: number; lng: number }, zoom = 15) {
  const L = (await import('leaflet')).default as typeof Leaflet;
  const m = L.map(el, { center: [centro.lat, centro.lng], zoom, maxZoom: base.maxZoom, zoomControl: true, attributionControl: true, scrollWheelZoom: false });
  m.attributionControl.setPrefix(false);
  let camada: Leaflet.Layer | null = null;
  try {
    if (base.tipo === 'pmtiles' && base.tiles) {
      (window as unknown as { L: typeof Leaflet }).L = L; // o protomaps-leaflet estende L.GridLayer global
      const { leafletLayer } = await import('protomaps-leaflet');
      camada = leafletLayer({ url: base.tiles, flavor: 'light', lang: 'pt', attribution: base.atribuicao, maxDataZoom: 15 }) as unknown as Leaflet.Layer;
    } else if (base.tipo === 'raster' && base.tiles) {
      camada = L.tileLayer(base.tiles, { maxZoom: base.maxZoom, attribution: base.atribuicao, crossOrigin: false });
    }
  } catch { camada = null; }
  if (camada) camada.addTo(m);
  else el.classList.add('mapa-simples');
  return { L, m, temBase: !!camada };
}

// marcador com emoji (divIcon: sem imagens externas)
export const icone = (L: typeof Leaflet, txt: string, classe: string) =>
  L.divIcon({ className: `mk ${classe}`, html: `<span aria-hidden="true">${txt}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] });
