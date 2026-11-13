import { mapaEmbed } from '@/lib/info';

// Mapa incorporado (Maps Embed API quando há GOOGLE_MAPS_API_KEY), só carrega ao rolar até ele.
export default function Mapa() {
  return (
    <iframe
      className="mapa"
      title="Mapa: MDogão Itapevi"
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      src={mapaEmbed}
    />
  );
}
