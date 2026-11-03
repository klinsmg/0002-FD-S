import { info } from '@/lib/info';

// Mapa incorporado, só carrega ao rolar até ele (loading=lazy).
export default function Mapa() {
  return (
    <iframe
      className="mapa"
      title="Mapa: MDogão Itapevi"
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      src={`https://www.google.com/maps?q=${encodeURIComponent(`${info.rua}, ${info.bairro}`)}&output=embed`}
    />
  );
}
