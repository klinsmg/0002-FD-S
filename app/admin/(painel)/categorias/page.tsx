import Link from 'next/link';
import { exigirAdmin } from '@/lib/admin';
import { alternarCategoria, excluirCategoria, salvarCategoria } from '@/app/admin/(painel)/actions';

export const metadata = { title: 'Categorias' };
const MSG: Record<string, string> = {
  invalido: 'Confira o nome e o endereço (slug): só minúsculas, números e hífens.', duplicado: 'Já existe uma categoria com esse slug.',
  falha: 'Não foi possível salvar. Tente novamente.', vazia: 'Só dá para excluir categoria sem produtos. Mova os produtos ou desative a categoria.',
};

export default async function Categorias({ searchParams }: { searchParams: Promise<{ editar?: string; erro?: string; ok?: string }> }) {
  const { editar, erro, ok } = await searchParams;
  const { supabase } = await exigirAdmin();
  const [{ data: cats }, { data: secoes }] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('sections').select('id, name').order('sort_order'),
  ]);
  const atual = cats?.find(c => c.id === editar);

  return (
    <main>
      <header className="pg-cab wrap">
        <p className="script">painel</p>
        <h1><em>Categorias</em></h1>
      </header>
      <div className="wrap adm-caixa">
        {ok && <p className="nota" role="status">Salvo.</p>}
        {erro && MSG[erro] && <p className="nota" role="alert">{MSG[erro]}</p>}
        <div className="adm-rolagem">
          <table className="adm-tab">
            <thead><tr><th>Ordem</th><th>Nome</th><th>Slug</th><th>Ativa</th><th>Ações</th></tr></thead>
            <tbody>
              {cats?.map(c => (
                <tr key={c.id}>
                  <td>{c.sort_order}</td><td>{c.name}</td><td>{c.slug}</td><td>{c.active ? 'Sim' : 'Não'}</td>
                  <td className="conta-acoes">
                    <Link href={`/admin/categorias?editar=${c.id}`}>Editar</Link>
                    <form action={alternarCategoria}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="active" value={c.active ? '0' : '1'} /><button type="submit">{c.active ? 'Desativar' : 'Ativar'}</button></form>
                    <form action={excluirCategoria}><input type="hidden" name="id" value={c.id} /><button type="submit">Excluir</button></form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="conta-tit">{atual ? 'Editar categoria' : 'Nova categoria'}</h2>
        <form className="form" action={salvarCategoria} key={atual?.id ?? 'nova'}>
          {atual && <input type="hidden" name="id" value={atual.id} />}
          <label htmlFor="c-nome">Nome</label>
          <input id="c-nome" name="name" maxLength={80} required defaultValue={atual?.name ?? ''} />
          <label htmlFor="c-slug">Slug (endereço)</label>
          <input id="c-slug" name="slug" maxLength={60} required pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={atual?.slug ?? ''} />
          <label htmlFor="c-sec">Seção</label>
          <select id="c-sec" name="section_id" defaultValue={atual?.section_id ?? ''}>
            <option value="">Sem seção</option>
            {secoes?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label htmlFor="c-curto">Rótulo curto da aba</label>
          <input id="c-curto" name="short_label" maxLength={40} defaultValue={atual?.short_label ?? ''} />
          <label htmlFor="c-desc">Descrição</label>
          <input id="c-desc" name="description" maxLength={300} defaultValue={atual?.description ?? ''} />
          <label htmlFor="c-nota">Nota</label>
          <input id="c-nota" name="note" maxLength={300} defaultValue={atual?.note ?? ''} />
          <label htmlFor="c-ord">Ordem</label>
          <input id="c-ord" name="sort_order" type="number" min={0} max={99999} defaultValue={atual?.sort_order ?? 0} />
          <label className="conta-check"><input type="checkbox" name="active" defaultChecked={atual?.active ?? true} /> Ativa (aparece para o público)</label>
          <button className="btn btn-p" type="submit">{atual ? 'Salvar alterações' : 'Criar categoria'}</button>
          {atual && <Link className="nota" href="/admin/categorias">Cancelar edição</Link>}
        </form>
      </div>
    </main>
  );
}
