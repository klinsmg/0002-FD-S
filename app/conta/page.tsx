import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ERROS, STATUS, data, reais } from '@/lib/conta';
import { salvarPerfil, sair } from './actions';

export default async function Conta({ searchParams }: { searchParams: Promise<{ erro?: string }> }) {
  const { erro } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // RLS: cada cliente só enxerga o próprio perfil e os próprios pedidos.
  const [{ data: perfil }, { data: pedidos }] = await Promise.all([
    supabase.from('profiles').select('full_name, phone').eq('id', user.id).maybeSingle(),
    supabase.from('orders').select('id, order_number, status, total_cents, has_price_pending, created_at').order('created_at', { ascending: false }).limit(5),
  ]);

  return (
    <main>
      <header className="pg-cab wrap">
        <p className="script">sua conta</p>
        <h1>Olá, <em>{perfil?.full_name ?? 'cliente'}</em></h1>
      </header>
      <div className="wrap conta-caixa">
        <form className="form" action={salvarPerfil}>
          <label htmlFor="p-nome">Nome</label>
          <input id="p-nome" name="full_name" autoComplete="name" maxLength={120} required defaultValue={perfil?.full_name ?? ''} />
          <label htmlFor="p-fone">Telefone</label>
          <input id="p-fone" name="phone" type="tel" autoComplete="tel" maxLength={20} defaultValue={perfil?.phone ?? ''} placeholder="(11) 90000-0000" />
          <p className="nota">E-mail: {user.email}</p>
          {erro && ERROS[erro] && <p className="nota" role="alert">{ERROS[erro]}</p>}
          <button className="btn btn-p" type="submit">Salvar</button>
        </form>

        <h2 className="conta-tit">Últimos pedidos</h2>
        {pedidos?.length ? (
          <ul className="canais">
            {pedidos.map(p => (
              <li key={p.id}>
                <b>Pedido #{p.order_number} · {data(p.created_at)}</b>
                <span>{STATUS[p.status] ?? p.status} · {p.has_price_pending ? `${reais(p.total_cents)} + itens a confirmar` : reais(p.total_cents)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="nota">Você ainda não fez pedidos.</p>
        )}
        <p className="nota"><Link href="/conta/pedidos">Ver histórico completo</Link></p>

        <form action={sair}><button type="submit" className="btn btn-o">Sair</button></form>
      </div>
    </main>
  );
}
