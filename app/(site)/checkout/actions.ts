'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type Estado = { erro: string } | null;

// Mensagens para os erros que o banco (create_order) pode devolver
const ERROS: Record<string, string> = {
  doneness_required: 'Escolha o ponto da carne dos lanches.',
  product_unavailable: 'Algum item não está mais disponível. Atualize o pedido.',
  variant_required: 'Escolha o tamanho/opção de algum item.',
  invalid_variant: 'Opção inválida em algum item.',
  extra_unavailable: 'Algum molho/adicional não está mais disponível.',
  invalid_delivery_address: 'Confira o endereço de entrega (CEP, rua, número, bairro, cidade e UF).',
  too_many_orders: 'Muitos pedidos em pouco tempo. Aguarde alguns minutos e tente de novo.',
  invalid_items: 'O pedido está vazio ou grande demais.',
};
const GENERICO = 'Não foi possível enviar o pedido agora. Tente novamente.';

const PONTO: Record<string, string> = { 'Mal passado': 'rare', 'Ao ponto': 'medium', 'Bem passado': 'well_done' };
const txt = (v: unknown, max: number) =>
  typeof v === 'string' ? v.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
const qtd = (v: unknown, max: number) => (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= max ? (v as number) : 0);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

// Recebe o carrinho (JSON montado pelo Alpine) e grava o pedido pelo create_order, que insere orders + order_items
// + extras numa transação só. Preços, nomes, totais e a regra do ponto da carne vêm SEMPRE do banco, nunca do navegador.
// Taxa de entrega e desconto não têm como o cliente definir: entram 0 e o admin ajusta depois (admin_set_order_amounts).
export async function createOrder(_: Estado, f: FormData): Promise<Estado> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    // volta para o cardápio depois do login (o carrinho fica salvo no navegador)
    (await cookies()).set('voltar', 'cardapio', { maxAge: 600, path: '/', httpOnly: true, sameSite: 'lax' });
    redirect('/login');
  }

  const bruto = String(f.get('payload') ?? '');
  let p: Record<string, unknown>;
  try { if (bruto.length > 30000) throw new Error(); p = obj(JSON.parse(bruto)); } catch { return { erro: GENERICO }; }

  const entrega = p.tipo === 'delivery';
  const nome = txt(p.nome, 60);
  if (!nome) return { erro: 'Informe o seu nome.' };
  const a = obj(p.addr);
  const endereco = entrega
    ? { street: txt(a.street, 120), number: txt(a.number, 10), complement: txt(a.complement, 60) || null, district: txt(a.district, 100), city: txt(a.city, 100), state: txt(a.state, 2).toUpperCase(), zip_code: txt(a.zip_code, 9).replace(/\D/g, '') }
    : null;

  // itens do carrinho -> { cat, nome, variante, qtd, ponto, extras, obs }
  const lista = Array.isArray(p.itens) ? p.itens.slice(0, 60).map(obj) : [];
  const itens = lista.map(i => ({
    cat: txt(i.cat, 60), nome: txt(i.nome, 120), variante: txt(i.variante, 40), q: qtd(i.qtd, 99),
    ponto: PONTO[txt(i.ponto, 20)] ?? null, obs: txt(i.obs, 240),
    extras: (Array.isArray(i.extras) ? i.extras.slice(0, 12).map(obj) : []).map(e => ({ nome: txt(e.nome, 40), q: qtd(e.qtd, 9) })),
  }));
  if (!itens.length || itens.some(i => !i.cat || !i.nome || !i.q)) return { erro: ERROS.invalid_items };

  // resolve nomes -> ids do banco (só itens ativos são visíveis ao cliente)
  const slugs = [...new Set(itens.map(i => i.cat))];
  const { data: cats } = await supabase.from('categories').select('id, slug').in('slug', slugs);
  const catId = new Map((cats ?? []).map(c => [c.slug, c.id]));
  const { data: prods } = await supabase
    .from('products')
    .select('id, name, category_id, product_variants(id, label)')
    .in('category_id', [...catId.values()])
    .in('name', [...new Set(itens.map(i => i.nome))]);
  const nomesExtras = [...new Set(itens.flatMap(i => i.extras.map(e => e.nome)))];
  const { data: exs } = nomesExtras.length ? await supabase.from('extras').select('id, name').eq('type', 'sauce').in('name', nomesExtras) : { data: [] };
  const extraId = new Map((exs ?? []).map(e => [e.name, e.id]));

  const items = [];
  for (const i of itens) {
    const prod = prods?.find(x => x.category_id === catId.get(i.cat) && x.name === i.nome);
    if (!prod) return { erro: ERROS.product_unavailable };
    const variante = prod.product_variants.length ? prod.product_variants.find(v => v.label === i.variante) : null;
    if (prod.product_variants.length && !variante) return { erro: ERROS.invalid_variant };
    const extras = [];
    for (const e of i.extras) {
      const id = extraId.get(e.nome);
      if (!id || !e.q) return { erro: ERROS.extra_unavailable };
      extras.push({ extra_id: id, quantity: e.q });
    }
    items.push({ product_id: prod.id, variant_id: variante?.id ?? null, quantity: i.q, doneness: i.ponto, notes: i.obs || null, extras });
  }

  const { data, error } = await supabase.rpc('create_order', {
    p_customer_name: nome,
    p_order_type: entrega ? 'delivery' : 'pickup',
    p_items: items,
    p_notes: txt(p.obs, 300) || undefined,
    p_delivery_address: endereco ?? undefined,
  });
  const pedido = data?.[0];
  if (error || !pedido) {
    const codigo = Object.keys(ERROS).find(c => error?.message.includes(c));
    return { erro: codigo ? ERROS[codigo] : GENERICO };
  }

  revalidatePath('/conta');
  revalidatePath('/conta/pedidos');
  revalidatePath('/admin/pedidos');
  revalidatePath('/admin/relatorios');
  redirect(`/pedido/${pedido.r_order_id}`);
}
