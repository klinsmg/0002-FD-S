'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { PAGAMENTO, STATUS_LISTA, exigirAdmin, paraCentavos, type Status } from '@/lib/admin';
import { limpa } from '@/lib/conta';

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
  const { error } = await supabase.from('orders').update({ status, payment_method: pg || null, notes: limpa(f.get('notes'), 300) || null }).eq('id', id);
  if (error) redirect(`/admin/pedidos/${id}?erro=falha`);
  atualizar('/admin', '/admin/pedidos', `/admin/pedidos/${id}`, '/admin/relatorios', '/conta', '/conta/pedidos', `/pedido/${id}`);
  redirect(`/admin/pedidos/${id}?ok=1`);
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
