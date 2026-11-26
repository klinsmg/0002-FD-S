'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { PAGAMENTO, STATUS_LISTA, exigirAdmin, paraCentavos, podeIr, type Status } from '@/lib/admin';
import { limpa } from '@/lib/conta';
import { PAGINAS_COM_HORARIO } from '@/lib/horarios';

// Mutações do painel. Todas começam por exigirAdmin() e usam o cliente do USUÁRIO (RLS), nunca a service role.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const idDe = (f: FormData, k = 'id') => { const v = String(f.get(k) ?? ''); return UUID.test(v) ? v : null; };
const int = (v: FormDataEntryValue | null) => { const n = Number(v); return Number.isInteger(n) && n >= 0 && n < 100000 ? n : 0; };

function atualizar(...rotas: string[]) { rotas.forEach(r => revalidatePath(r)); }

// ---------- pedidos ----------
export async function atualizarPedido(f: FormData) {
  const { supabase } = await exigirAdmin();
  const id = idDe(f);
  if (!id) redirect('/admin/pedidos');
  const status = String(f.get('status') ?? '') as Status;
  const pg = String(f.get('payment_method') ?? '');
  if (!STATUS_LISTA.includes(status) || (pg && !(pg in PAGAMENTO))) redirect(`/admin/pedidos/${id}?erro=invalido`);
  const { data: atual } = await supabase.from('orders').select('status, order_type').eq('id', id).maybeSingle();
  if (!atual || (atual.status !== status && !podeIr(atual.status, status, atual.order_type))) redirect(`/admin/pedidos/${id}?erro=fluxo`);
  // .eq('status', atual.status): se outro aparelho mudou no meio, não sobrescreve
  const { data: salvo, error } = await supabase.from('orders').update({ status, payment_method: pg || null, notes: limpa(f.get('notes'), 300) || null }).eq('id', id).eq('status', atual.status).select('id');
  if (error) redirect(`/admin/pedidos/${id}?erro=${error.message.includes('invalid_status_transition') ? 'fluxo' : 'falha'}`);
  if (!salvo?.length) redirect(`/admin/pedidos/${id}?erro=fluxo`);
  atualizar('/admin', '/admin/pedidos', `/admin/pedidos/${id}`, '/admin/relatorios', '/conta', '/conta/pedidos', `/pedido/${id}`);
  redirect(`/admin/pedidos/${id}?ok=1`);
}

// Quadro da loja: avança o pedido um passo. Regra do fluxo (PROXIMOS) conferida aqui, com o status atual lido do banco;
// o update só vale se o status ainda for o lido (dois aparelhos clicando ao mesmo tempo não pulam etapas).
export async function moverPedido(f: FormData) {
  const { supabase } = await exigirAdmin();
  const id = idDe(f);
  const para = String(f.get('para') ?? '') as Status;
  if (!id || !STATUS_LISTA.includes(para)) redirect('/admin/loja?erro=invalido');
  const { data: p } = await supabase.from('orders').select('status, order_type').eq('id', id).maybeSingle();
  if (!p || !podeIr(p.status, para, p.order_type)) redirect('/admin/loja?erro=fluxo');
  const { data: ok } = await supabase.from('orders').update({ status: para }).eq('id', id).eq('status', p.status).select('id');
  if (!ok?.length) redirect('/admin/loja?erro=fluxo');
  atualizar('/admin', '/admin/loja', '/admin/pedidos', `/admin/pedidos/${id}`, '/admin/relatorios', '/conta', '/conta/pedidos', `/pedido/${id}`);
  redirect('/admin/loja');
}

// taxa de entrega e desconto: único caminho é a função admin_set_order_amounts (só pedido aberto); o total é recalculado no banco
export async function definirValores(f: FormData) {
  const { supabase } = await exigirAdmin();
  const id = idDe(f);
  if (!id) redirect('/admin/pedidos');
  const taxa = paraCentavos(f.get('fee'), 100000) ?? undefined;
  const desc = paraCentavos(f.get('discount'), 100000) ?? undefined;
  if (taxa === undefined || desc === undefined) redirect(`/admin/pedidos/${id}?erro=valor`);
  const { error } = await supabase.rpc('admin_set_order_amounts', { p_order_id: id, p_delivery_fee_cents: taxa, p_discount_cents: desc });
  if (error) redirect(`/admin/pedidos/${id}?erro=${error.message.includes('closed') ? 'fechado' : 'falha'}`);
  atualizar('/admin', '/admin/pedidos', `/admin/pedidos/${id}`, '/admin/relatorios', '/conta/pedidos', `/pedido/${id}`);
  redirect(`/admin/pedidos/${id}?ok=1`);
}

// ---------- categorias ----------
export async function salvarCategoria(f: FormData) {
  const { supabase } = await exigirAdmin();
  const id = idDe(f);
  const t = (k: string, max: number) => limpa(f.get(k), max);
  const sec = idDe(f, 'section_id');
  const c = {
    name: t('name', 80), slug: t('slug', 60).toLowerCase(), short_label: t('short_label', 40) || null,
    description: t('description', 300) || null, note: t('note', 300) || null,
    section_id: sec, sort_order: int(f.get('sort_order')), active: f.get('active') === 'on',
  };
  const volta = id ? `/admin/categorias?editar=${id}` : '/admin/categorias';
  if (!c.name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.slug)) redirect(`${volta}${id ? '&' : '?'}erro=invalido`);
  const { error } = id ? await supabase.from('categories').update(c).eq('id', id) : await supabase.from('categories').insert(c);
  if (error) redirect(`${volta}${id ? '&' : '?'}erro=${error.code === '23505' ? 'duplicado' : 'falha'}`);
  atualizar('/admin/categorias', '/admin/produtos');
  redirect('/admin/categorias?ok=1');
}

export async function alternarCategoria(f: FormData) {
  const { supabase } = await exigirAdmin();
  const id = idDe(f);
  if (id) await supabase.from('categories').update({ active: f.get('active') === '1' }).eq('id', id);
  atualizar('/admin/categorias', '/admin/produtos');
  redirect('/admin/categorias');
}

// Excluir categoria só se estiver vazia: o banco soltaria os produtos (category_id nulo) e eles continuariam visíveis ao público.
export async function excluirCategoria(f: FormData) {
  const { supabase } = await exigirAdmin();
  const id = idDe(f);
  if (!id) redirect('/admin/categorias');
  const { count } = await supabase.from('products').select('id', { count: 'exact', head: true }).eq('category_id', id);
  if (count) redirect('/admin/categorias?erro=vazia');
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) redirect('/admin/categorias?erro=falha');
  atualizar('/admin/categorias');
  redirect('/admin/categorias?ok=1');
}

// ---------- produtos ----------
export async function salvarProduto(f: FormData) {
  const { supabase } = await exigirAdmin();
  const id = idDe(f);
  const t = (k: string, max: number) => limpa(f.get(k), max);
  const preco = paraCentavos(f.get('price'));
  const img = t('image_url', 300);
  const p = {
    name: t('name', 120), description: t('description', 500) || null, group_label: t('group_label', 120),
    category_id: idDe(f, 'category_id'), price_cents: preco ?? null, sort_order: int(f.get('sort_order')),
    image_url: img || null, active: f.get('active') === 'on',
    is_informational: f.get('is_informational') === 'on', requires_doneness: f.get('requires_doneness') === 'on',
  };
  const volta = id ? `/admin/produtos?editar=${id}` : '/admin/produtos';
  const sep = id ? '&' : '?';
  if (!p.name || preco === undefined || (img && !/^(https:\/\/|\/)/.test(img))) redirect(`${volta}${sep}erro=invalido`);
  const { error } = id ? await supabase.from('products').update(p).eq('id', id) : await supabase.from('products').insert(p);
  if (error) redirect(`${volta}${sep}erro=${error.code === '23505' ? 'duplicado' : 'falha'}`);
  atualizar('/admin/produtos');
  redirect('/admin/produtos?ok=1');
}

export async function alternarProduto(f: FormData) {
  const { supabase } = await exigirAdmin();
  const id = idDe(f);
  if (id) await supabase.from('products').update({ active: f.get('active') === '1' }).eq('id', id);
  atualizar('/admin/produtos');
  redirect('/admin/produtos');
}

export async function excluirProduto(f: FormData) {
  const { supabase } = await exigirAdmin();
  const id = idDe(f);
  if (id) {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) redirect('/admin/produtos?erro=falha');
  }
  atualizar('/admin/produtos');
  redirect('/admin/produtos?ok=1');
}

// ---------- entregas ----------
// "Saiu para entrega": a loja escolhe o entregador; o banco (dispatch_order) confere pedido Pronto de entrega e entregador ativo.
export async function despacharPedido(f: FormData) {
  const { supabase } = await exigirAdmin();
  const id = idDe(f), entregador = idDe(f, 'entregador');
  if (!id || !entregador) redirect('/admin/loja?erro=entregador');
  const { error } = await supabase.rpc('dispatch_order', { p_order_id: id, p_courier_id: entregador });
  if (error) redirect(`/admin/loja?erro=${error.message.includes('courier_not_found') ? 'entregador' : 'fluxo'}`);
  atualizar('/admin', '/admin/loja', '/admin/pedidos', `/admin/pedidos/${id}`, `/pedido/${id}`, '/entregador');
  redirect('/admin/loja');
}

// Liberar / tirar entregador pelo e-mail da conta Google
export async function salvarEntregador(f: FormData) {
  const { supabase } = await exigirAdmin();
  const email = limpa(f.get('email'), 254).toLowerCase();
  const ativo = f.get('ativo') !== '0';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) redirect('/admin/configuracoes?erro=email#entregadores');
  const { error } = await supabase.rpc('admin_set_courier', { p_email: email, p_active: ativo });
  if (error) redirect(`/admin/configuracoes?erro=${error.message.includes('user_not_found') ? 'naoachou' : 'falha'}#entregadores`);
  atualizar('/admin/configuracoes', '/admin/loja');
  redirect(`/admin/configuracoes?ok=${ativo ? 'liberado' : 'removido'}#entregadores`);
}

// ---------- horário de funcionamento ----------
// 7 dias de uma vez. Fecha depois da meia-noite (ex.: 18:00 às 01:00) é detectado sozinho.
// Depois de salvar, regera as páginas públicas que mostram o horário (são estáticas).
export async function salvarHorarios(f: FormData) {
  const { supabase } = await exigirAdmin();
  const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
  const linhas = [];
  for (let d = 0; d < 7; d++) {
    const fechado = f.get(`fechado-${d}`) === 'on';
    const abre = String(f.get(`abre-${d}`) ?? ''), fecha = String(f.get(`fecha-${d}`) ?? '');
    if (!fechado && (!HORA.test(abre) || !HORA.test(fecha) || abre === fecha)) redirect(`/admin/configuracoes?erro=horario&dia=${d}#horarios`);
    linhas.push({ weekday: d, closed: fechado, opens_at: fechado ? null : abre, closes_at: fechado ? null : fecha, closes_next_day: !fechado && fecha < abre });
  }
  for (const l of linhas) {
    const { error } = await supabase.from('business_hours').update(l).eq('weekday', l.weekday);
    if (error) redirect('/admin/configuracoes?erro=falha#horarios');
  }
  PAGINAS_COM_HORARIO.forEach(p => revalidatePath(p));
  revalidatePath('/', 'layout'); // o rodapé de todas as páginas
  atualizar('/admin/configuracoes');
  redirect('/admin/configuracoes?ok=horarios#horarios');
}
