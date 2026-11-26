// Regras puras do negócio (sem Next, sem Supabase): usadas pelo servidor, pelo navegador e pelos testes (tests/unit).
// O banco confere as mesmas regras de novo (migrações 012 e 022); aqui elas decidem só o que mostrar e validam cedo.

export type Status = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'out_for_delivery' | 'delivered' | 'cancelled';
export const STATUS_LISTA: Status[] = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];

// Fluxo da loja (o banco confere o mesmo: função order_status_ok):
//   Novo -> Em preparo -> Pronto -> entrega: Saiu para entrega -> Entregue
//                                   retirada: Entregue ("Retirado").
// Cancelar vale em qualquer etapa antes de Entregue.
export function proximos(de: Status, tipo: string): Status[] {
  switch (de) {
    case 'pending': case 'confirmed': return ['preparing', 'cancelled'];
    case 'preparing': return ['ready', 'cancelled'];
    case 'ready': return [tipo === 'delivery' ? 'out_for_delivery' : 'delivered', 'cancelled'];
    case 'out_for_delivery': return ['delivered', 'cancelled'];
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

// Horários do banco (business_hours) -> linhas para o site, juntando dias seguidos iguais:
// [['Segunda a sexta', '11h às 01h'], ['Sábado e domingo', '18h às 01h']]. Semana começa na segunda.
export type Horario = { weekday: number; opens_at: string | null; closes_at: string | null; closed: boolean };
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const hhmm = (t: string | null) => { if (!t) return ''; const [h, m] = t.split(':'); return `${h}h${m && m !== '00' ? m : ''}`; };
export function agruparHorarios(linhas: Horario[]): [string, string][] {
  const ordem = [1, 2, 3, 4, 5, 6, 0].map(d => linhas.find(l => l.weekday === d)).filter(Boolean) as Horario[];
  const texto = (l: Horario) => (l.closed || !l.opens_at || !l.closes_at ? 'Fechado' : `${hhmm(l.opens_at)} às ${hhmm(l.closes_at)}`);
  const grupos: { de: number; ate: number; t: string }[] = [];
  for (const l of ordem) {
    const g = grupos.at(-1), t = texto(l);
    if (g && g.t === t && (g.ate + 1) % 7 === l.weekday) g.ate = l.weekday; else grupos.push({ de: l.weekday, ate: l.weekday, t });
  }
  return grupos.map(g => {
    const n = (g.ate - g.de + 7) % 7;
    const rot = n === 0 ? DIAS[g.de] : n === 1 ? `${DIAS[g.de]} e ${DIAS[g.ate].toLowerCase()}` : `${DIAS[g.de]} a ${DIAS[g.ate].toLowerCase()}`;
    return [rot, g.t];
  });
}

// Área Dev do painel (auditoria): só os e-mails de ADMIN_DEV_EMAILS
// (separados por vírgula). Sem a variável, todo admin é Dev — assim ninguém fica trancado fora antes de configurar.
export function ehDev(email: string | null | undefined, lista = process.env.ADMIN_DEV_EMAILS ?? '') {
  const devs = lista.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return !devs.length || (!!email && devs.includes(email.trim().toLowerCase()));
}

// ---------- SEO: horário do banco no formato schema.org (OpeningHoursSpecification) ----------
// Dias com o mesmo horário viram uma linha; fechado não entra (schema.org: ausência = fechado).
const DIAS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function horariosSchema(linhas: Horario[]) {
  const grupos = new Map<string, string[]>();
  for (const l of [...linhas].sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7))) {
    if (l.closed || !l.opens_at || !l.closes_at) continue;
    const k = `${l.opens_at.slice(0, 5)}|${l.closes_at.slice(0, 5)}`;
    grupos.set(k, [...(grupos.get(k) ?? []), DIAS_EN[l.weekday]]);
  }
  return [...grupos].map(([k, dias]) => { const [opens, closes] = k.split('|'); return { '@type': 'OpeningHoursSpecification', dayOfWeek: dias, opens, closes }; });
}
