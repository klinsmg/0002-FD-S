import Link from 'next/link';
import { doisDec, exigirAdmin } from '@/lib/admin';
import { reais } from '@/lib/conta';
import { alternarProduto, excluirProduto, salvarProduto } from '@/app/admin/(painel)/actions';

export const metadata = { title: 'Produtos' };
const MSG: Record<string, string> = {
  invalido: 'Confira o nome, o preço (use vírgula: 12,50) e a imagem (começa com https:// ou /).',
  duplicado: 'Já existe um produto com esse nome nesta categoria e subgrupo.', falha: 'Não foi possível salvar. Tente novamente.',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function Produtos({ searchParams }: { searchParams: Promise<{ editar?: string; cat?: string; erro?: string; ok?: string }> }) {
  const { editar, cat, erro, ok } = await searchParams;
  const { supabase } = await exigirAdmin();
  const { data: cats } = await supabase.from('categories').select('id, name').order('sort_order');
  let q = supabase.from('products').select('*').order('sort_order').order('name').limit(300);
  if (cat && UUID.test(cat)) q = q.eq('category_id', cat);
  const { data: prods } = await q;
  const atual = editar && UUID.test(editar) ? (await supabase.from('products').select('*').eq('id', editar).maybeSingle()).data : null;
  const nomeCat = new Map(cats?.map(c => [c.id, c.name]));

  return (
    <main>
      <header className="pg-cab wrap">
        <p className="script">painel</p>
        <h1><em>Produtos</em></h1>
      </header>
      <div className="wrap adm-caixa">
        {ok && <p className="nota" role="status">Salvo.</p>}
        {erro && MSG[erro] && <p className="nota" role="alert">{MSG[erro]}</p>}
        <form className="adm-filtro" method="get">
          <label>Categoria
            <select name="cat" defaultValue={cat ?? ''}>
              <option value="">Todas</option>
              {cats?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <button className="btn btn-p" type="submit">Filtrar</button>
        </form>
        <p className="nota">Preço da variante (P/G, 500 ml/1 L) não é editado aqui: produto com variantes usa o preço de cada uma.</p>

        <div className="adm-rolagem">
          <table className="adm-tab">
            <thead><tr><th>Nome</th><th>Categoria</th><th>Preço</th><th>Ativo</th><th>Ações</th></tr></thead>
            <tbody>
              {prods?.map(p => (
                <tr key={p.id}>
                  <td>{p.name}{p.group_label ? <small className="nota"> · {p.group_label}</small> : null}</td>
                  <td>{p.category_id ? nomeCat.get(p.category_id) : '—'}</td>
                  <td>{p.price_cents == null ? 'a confirmar / variantes' : reais(p.price_cents)}</td>
                  <td>{p.active ? 'Sim' : 'Não'}</td>
                  <td className="conta-acoes">
                    <Link href={`/admin/produtos?editar=${p.id}${cat ? `&cat=${cat}` : ''}`}>Editar</Link>
                    <form action={alternarProduto}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="active" value={p.active ? '0' : '1'} /><button type="submit">{p.active ? 'Desativar' : 'Ativar'}</button></form>
                    <form action={excluirProduto}><input type="hidden" name="id" value={p.id} /><button type="submit">Excluir</button></form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="conta-tit">{atual ? 'Editar produto' : 'Novo produto'}</h2>
        <form className="form" action={salvarProduto} key={atual?.id ?? 'novo'}>
          {atual && <input type="hidden" name="id" value={atual.id} />}
          <label htmlFor="p-nome">Nome</label>
          <input id="p-nome" name="name" maxLength={120} required defaultValue={atual?.name ?? ''} />
          <label htmlFor="p-cat">Categoria</label>
          <select id="p-cat" name="category_id" defaultValue={atual?.category_id ?? cat ?? ''}>
            <option value="">Sem categoria</option>
            {cats?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label htmlFor="p-grupo">Subgrupo (opcional)</label>
          <input id="p-grupo" name="group_label" maxLength={120} defaultValue={atual?.group_label ?? ''} />
          <label htmlFor="p-desc">Descrição</label>
          <textarea id="p-desc" name="description" maxLength={500} defaultValue={atual?.description ?? ''} />
          <label htmlFor="p-preco">Preço (R$) — vazio = valor a confirmar</label>
          <input id="p-preco" name="price" inputMode="decimal" defaultValue={doisDec(atual?.price_cents ?? null)} placeholder="23,00" />
          <label htmlFor="p-img">Imagem (https://… ou /img/…)</label>
          <input id="p-img" name="image_url" maxLength={300} defaultValue={atual?.image_url ?? ''} />
          <label htmlFor="p-ord">Ordem</label>
          <input id="p-ord" name="sort_order" type="number" min={0} max={99999} defaultValue={atual?.sort_order ?? 0} />
          <label className="conta-check"><input type="checkbox" name="active" defaultChecked={atual?.active ?? true} /> Ativo (aparece para o público)</label>
          <label className="conta-check"><input type="checkbox" name="requires_doneness" defaultChecked={atual?.requires_doneness ?? true} /> Exige ponto da carne</label>
          <label className="conta-check"><input type="checkbox" name="is_informational" defaultChecked={atual?.is_informational ?? false} /> Só informativo (não vira item de pedido)</label>
          <button className="btn btn-p" type="submit">{atual ? 'Salvar alterações' : 'Criar produto'}</button>
          {atual && <Link className="nota" href="/admin/produtos">Cancelar edição</Link>}
        </form>
      </div>
    </main>
  );
}
