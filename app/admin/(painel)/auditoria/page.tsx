import Link from 'next/link';
import { exigirAdmin } from '@/lib/admin';
import { limparGpsAntigo } from '@/app/admin/(painel)/actions';
import Confirmar from '@/components/Confirmar';

export const metadata = { title: 'Auditoria' };

const EVENTO: Record<string, string> = {
  PEDIDO_CRIADO: 'Pedido recebido', PEDIDO_CONFIRMADO: 'Confirmado', EM_PREPARO: 'Em preparo', PRONTO: 'Pronto', PRONTO_PARA_RETIRADA: 'Pronto para retirada',
  ENTREGADOR_ATRIBUIDO: 'Entregador escolhido', SAIU_PARA_ENTREGA: 'Saiu para entrega', EM_ROTA: 'A caminho', CHEGANDO: 'Chegando', CHEGOU_NO_LOCAL: 'Entregador no local',
  ENTREGUE: 'Entregue (confirmado no endereço)', RETIRADO: 'Retirado', CANCELADO: 'Cancelado', FALHA_NA_ENTREGA: 'Entrega não concluída', ENTREGA_RECUSADA: 'Entregador recusou',
};
const ACAO: Record<string, string> = { pedido: 'Criar pedido', login_admin: 'Login do painel', codigo_2fa: 'Código 2FA', rastreio_negado: 'GPS de entrega não atribuída' };
const quando = (d: string) => new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
// IP pela metade na tela (o registro completo fica no banco por 7 dias)
const ipCurto = (ip: string | null) => (ip ? ip.replace(/(\d+\.\d+)\.\d+\.\d+$/, '$1.x.x').replace(/^([0-9a-f]+:[0-9a-f]+):.*$/i, '$1:…') : '—');
const detalhe = (d: unknown) => {
  const x = d as Record<string, unknown> | null;
  if (!x) return '';
  if (x.distancia_m != null) return `a ${x.distancia_m} m do endereço, GPS ±${x.precisao_m} m${x.destino_aproximado ? ' (endereço aproximado)' : ''}`;
  if (x.motivo) return String(x.motivo).replace(/_/g, ' ');
  return '';
};

// Auditoria: o que aconteceu com cada pedido (linha do tempo gravada pelo banco) e as tentativas barradas pelos limites.
export default async function Auditoria({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const { ok } = await searchParams;
  const { supabase } = await exigirAdmin();
  const [{ data: eventos }, { data: barradas }] = await Promise.all([
    supabase.from('order_events').select('id, type, data, created_at, orders(id, order_number)').order('created_at', { ascending: false }).limit(80),
    supabase.from('access_attempts').select('id, action, ip, device, user_id, created_at').eq('blocked', true).order('created_at', { ascending: false }).limit(50),
  ]);

  return (
    <main>
      <header className="pg-cab wrap"><p className="script">painel</p><h1><em>Auditoria</em></h1></header>
      <div className="wrap conta-caixa">
        <nav className="conta-ancoras" aria-label="Seções"><a href="#pedidos">Pedidos</a><a href="#seguranca">Segurança</a><a href="#privacidade">Privacidade</a></nav>
        {ok && /^\d+$/.test(ok) && <p className="nota" role="status">{ok === '0' ? 'Nenhuma posição antiga para apagar.' : `${ok} posições de GPS antigas apagadas.`}</p>}

        <section id="pedidos" aria-labelledby="t-ped">
          <h2 className="conta-tit" id="t-ped">Linha do tempo dos pedidos</h2>
          {!eventos?.length ? <p className="nota">Nada registrado ainda.</p> : (
            <ol className="aud-lista">
              {eventos.map(e => (
                <li key={e.id}>
                  <time dateTime={e.created_at}>{quando(e.created_at)}</time>
                  {e.orders ? <Link href={`/admin/pedidos/${e.orders.id}`}>#{e.orders.order_number}</Link> : <span>—</span>}
                  <span>{EVENTO[e.type] ?? e.type}{detalhe(e.data) && <small> · {detalhe(e.data)}</small>}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section id="seguranca" aria-labelledby="t-seg">
          <h2 className="conta-tit" id="t-seg">Tentativas barradas (últimos 7 dias)</h2>
          <p className="nota">Excesso de tentativas bloqueia por 15 minutos. Muitas linhas do mesmo IP ou aparelho podem indicar ataque.</p>
          {!barradas?.length ? <p className="nota">Nenhuma tentativa barrada.</p> : (
            <ol className="aud-lista">
              {barradas.map(b => (
                <li key={b.id}>
                  <time dateTime={b.created_at}>{quando(b.created_at)}</time>
                  <span>{ACAO[b.action] ?? b.action}</span>
                  <small>IP {ipCurto(b.ip)}{b.device ? ` · aparelho ${b.device.slice(0, 8)}` : ''}{b.user_id ? ' · conta logada' : ''}</small>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section id="privacidade" aria-labelledby="t-priv">
          <h2 className="conta-tit" id="t-priv">Retenção de dados (LGPD)</h2>
          <p className="nota">O histórico de GPS dos entregadores deve ser apagado 30 dias depois de cada entrega, como diz a política de privacidade. Os dados da confirmação da entrega continuam no pedido.</p>
          <Confirmar action={limparGpsAntigo} mensagem="Apagar o GPS de entregas encerradas há mais de 30 dias?" detalhe="Apaga o trajeto detalhado. Não pode ser desfeito; os dados da confirmação de entrega ficam." rotulo="Apagar">
            <button type="submit" className="btn btn-o">Apagar GPS com mais de 30 dias</button>
          </Confirmar>
        </section>
      </div>
    </main>
  );
}
