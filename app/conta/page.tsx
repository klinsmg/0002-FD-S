import Link from 'next/link';
import { redirect } from 'next/navigation';
import { usuarioAtual } from '@/lib/supabase/server';
import { STATUS, cep, data, reais } from '@/lib/conta';

// Resumo (só leitura): contato, endereço padrão e últimos pedidos. Tudo que se edita fica em /conta/configuracoes.
export default async function Conta() {
  const { supabase, user } = await usuarioAtual();
  if (!user) redirect('/login');

  // Filtra pelo dono: o RLS deixa o admin ler todos, e aqui é a área pessoal.
  const [{ data: perfil }, { data: padrao }, { data: pedidos }] = await Promise.all([
    supabase.from('profiles').select('full_name, phone').eq('id', user.id).maybeSingle(),
    supabase.from('addresses').select('label, street, number, complement, district, city, state, zip_code').eq('user_id', user.id).eq('is_default', true).maybeSingle(),
    supabase.from('orders').select('id, order_number, status, total_cents, has_price_pending, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
  ]);

  return (
    <main>
      <header className="pg-cab wrap">
        <p className="script">sua conta</p>
        <h1>Olá, <em>{perfil?.full_name ?? 'cliente'}</em></h1>
      </header>
      <div className="wrap conta-caixa">
        <ul className="canais">
          <li><b>E-mail</b><span>{user.email}</span></li>
          <li><b>Telefone</b><span>{perfil?.phone ?? 'Não informado'}</span></li>
          <li><b>Endereço padrão</b><span>{padrao ? `${padrao.label}: ${padrao.street}, ${padrao.number}${padrao.complement ? ` – ${padrao.complement}` : ''} · ${padrao.district} · ${padrao.city}/${padrao.state} · ${cep(padrao.zip_code)}` : 'Nenhum endereço salvo'}</span></li>
        </ul>
        <p className="nota"><Link href="/conta/configuracoes">Editar perfil, endereços e segurança</Link></p>

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
      </div>
    </main>
  );
}
