// Regras puras do negócio (sem Next, sem Supabase): usadas pelo servidor, pelo navegador e pelos testes (tests/unit).
// O banco confere as mesmas regras de novo (migrations 012 e 015); aqui elas decidem só o que mostrar e validam cedo.

export type Status = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled';
export const STATUS_LISTA: Status[] = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];

// Fluxo da loja (o banco confere o mesmo: função order_status_ok):
//   Novo -> Em preparo -> Pronto -> entrega: "Saiu para entrega" (só pelo despacho, escolhendo o entregador)
//                                   retirada: Entregue ("Retirado").
// "Entregue" de pedido de ENTREGA nunca sai do painel: só o entregador confirma, no endereço.
export function proximos(de: Status, tipo: string): Status[] {
  switch (de) {
    case 'pending': case 'confirmed': return ['preparing', 'cancelled'];
    case 'preparing': return ['ready', 'cancelled'];
    case 'ready': return tipo === 'delivery' ? ['cancelled'] : ['delivered', 'cancelled'];
    case 'out_for_delivery': return ['cancelled'];
    default: return [];
  }
}
export const podeIr = (de: Status, para: Status, tipo: string) => proximos(de, tipo).includes(para);

// Endereço de entrega (jsonb do pedido) em uma linha
export const enderecoTexto = (e: unknown) => {
  if (!e || typeof e !== 'object') return '';
  const a = e as Record<string, string | undefined>;
  return [`${a.street ?? ''}, ${a.number ?? ''}${a.complement ? ` – ${a.complement}` : ''}`, a.district, a.city && `${a.city}/${a.state ?? ''}`, a.reference && `Ref.: ${a.reference}`].filter(Boolean).join(' · ');
};

// "12,50" / "1.234,50" / "12.5" -> centavos. Vazio -> null (valor a confirmar). Inválido -> undefined.
export function paraCentavos(v: unknown, max = 999999): number | null | undefined {
  const s = String(v ?? '').replace(/R\$|\s/g, '');
  if (!s) return null;
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  const c = Math.round(n * 100);
  return Number.isFinite(n) && c >= 0 && c <= max ? c : undefined;
}
export const doisDec = (c: number | null) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));

// Distância em metros entre dois pontos (haversine; a mesma fórmula da função distance_m do banco)
export function distanciaM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// ETA de reserva (sem Routes API): linha reta x1,4 pelo traçado das ruas, a 25 km/h de média urbana
export function etaEstimada(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const km = (distanciaM(a, b) / 1000) * 1.4;
  return { minutos: Math.max(1, Math.round((km / 25) * 60)), km: Math.round(km * 10) / 10 };
}

// Arredonda a posição exibida ao cliente (~100 m): ele nunca vê a posição exata do entregador
export const aproximar = (x: number) => Math.round(x * 1000) / 1000;
