import Link from 'next/link';
import { exigirAdmin } from '@/lib/admin';
import { salvarEntregador, salvarHorarios } from '@/app/admin/(painel)/actions';
import BotaoEnviar from '@/components/BotaoEnviar';

const MSG: Record<string, string> = {
  email: 'Digite um e-mail válido.', naoachou: 'Não há conta com esse e-mail. Peça para a pessoa entrar uma vez no site com o Google (em /entregador) e tente de novo.',
  horario: 'Confira os horários: use o formato 18:00 e horários de abrir e fechar diferentes (ou marque Fechado).', falha: 'Não foi possível salvar. Tente novamente.',
};
const OK: Record<string, string> = { liberado: 'Entregador liberado.', removido: 'Entregador desativado.', horarios: 'Horários salvos. O site já mostra o novo horário.' };
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const hm = (t: string | null) => (t ?? '').slice(0, 5);

export const metadata = { title: 'Configurações' };

// Configurações do administrador: conta, segurança (2FA) e senha. Só abre com admin + AAL2 (exigirAdmin).
// A ativação do 2FA continua em /admin/seguranca, porque precisa abrir antes do AAL2.
export default async function ConfiguracoesAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { ok, erro } = await searchParams;
  const { supabase, user } = await exigirAdmin();
  const [{ data: fatores }, { data: horas }, { data: entregadores }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.from('business_hours').select('weekday, opens_at, closes_at, closed').order('weekday'),
    supabase.rpc('admin_list_couriers'),
  ]);
  const totp = fatores?.totp.find(t => t.status === 'verified');

  return (
    <main>
      <header className="pg-cab wrap">
        <p className="script">painel</p>
        <h1><em>Configurações</em></h1>
      </header>
      <div className="wrap conta-caixa">
        <nav className="conta-ancoras" aria-label="Seções">
          <a href="#conta">Conta</a><a href="#seguranca">Segurança</a><a href="#horarios">Horários</a><a href="#entregadores">Entregadores</a>
        </nav>

        <section id="conta" aria-labelledby="t-conta">
          <h2 className="conta-tit" id="t-conta">Conta</h2>
          <ul className="canais">
            <li><b>E-mail</b><span>{user.email}</span></li>
            <li><b>Forma de entrada</b><span>E-mail e senha + código do autenticador</span></li>
          </ul>
        </section>

        <section id="seguranca" aria-labelledby="t-seg">
          <h2 className="conta-tit" id="t-seg">Segurança</h2>
          <ul className="canais">
            <li><b>Verificação em duas etapas</b><span>{totp ? 'Ativa (obrigatória)' : 'Não ativada'}</span></li>
            {totp && <li><b>Ativada em</b><span>{new Date(totp.created_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span></li>}
          </ul>
          <p className="nota"><Link href="/admin/senha">Trocar a senha</Link> (enviamos um link para o seu e-mail).</p>
          <form action="/admin/logout" method="post"><button type="submit" className="btn btn-o">Sair do painel</button></form>
        </section>

        {ok && OK[ok] && <p className="nota" role="status">{OK[ok]}</p>}
        {erro && MSG[erro] && <p className="nota" role="alert">{MSG[erro]}</p>}

        <section id="horarios" aria-labelledby="t-hor">
          <h2 className="conta-tit" id="t-hor">Horário de funcionamento</h2>
          <p className="nota">Aparece no site (início, contato e rodapé). Fechar depois da meia-noite funciona: ex. 18:00 às 01:00.</p>
          <form className="form hor-form" action={salvarHorarios}>
            {[1, 2, 3, 4, 5, 6, 0].map(d => { const h = horas?.find(x => x.weekday === d); return (
              <fieldset key={d} className="hor-dia">
                <legend>{DIAS[d]}</legend>
                <label><span className="sr">Abre ({DIAS[d]})</span><input type="time" name={`abre-${d}`} defaultValue={hm(h?.opens_at ?? '18:00')} aria-label={`${DIAS[d]}: abre às`} /></label>
                <span aria-hidden="true">às</span>
                <label><span className="sr">Fecha ({DIAS[d]})</span><input type="time" name={`fecha-${d}`} defaultValue={hm(h?.closes_at ?? '01:00')} aria-label={`${DIAS[d]}: fecha às`} /></label>
                <label className="conta-check"><input type="checkbox" name={`fechado-${d}`} defaultChecked={!!h?.closed} /> Fechado</label>
              </fieldset>
            ); })}
            <BotaoEnviar pendente="Salvando…">Salvar horários</BotaoEnviar>
          </form>
        </section>
        <section id="entregadores" aria-labelledby="t-ent">
          <h2 className="conta-tit" id="t-ent">Entregadores</h2>
          <p className="nota">O entregador entra em <b>/entregador</b> com a conta Google dele. Depois disso, digite o e-mail aqui para liberar. No quadro da loja, &quot;Saiu para entrega&quot; manda o pedido para ele, e ele dá baixa quando entregar.</p>
          {entregadores?.length ? (
            <ul className="canais">
              {entregadores.map(c => (
                <li key={c.user_id}>
                  <b>{c.name || 'Sem nome'}{c.active ? '' : ' (desativado)'}</b>
                  <span>{c.email}{Number(c.open_deliveries) ? ` · ${c.open_deliveries} em rota` : ''}</span>
                  <form action={salvarEntregador}>
                    <input type="hidden" name="email" value={c.email ?? ''} /><input type="hidden" name="ativo" value={c.active ? '0' : '1'} />
                    <BotaoEnviar pendente="…" className="btn btn-o">{c.active ? 'Desativar' : 'Reativar'}</BotaoEnviar>
                  </form>
                </li>
              ))}
            </ul>
          ) : <p className="nota">Nenhum entregador ainda.</p>}
          <form className="form" action={salvarEntregador}>
            <label htmlFor="ent-email">E-mail da conta Google do entregador</label>
            <input id="ent-email" name="email" type="email" required maxLength={254} autoComplete="off" placeholder="nome@gmail.com" />
            <BotaoEnviar pendente="Liberando…">Liberar entregador</BotaoEnviar>
          </form>
        </section>
      </div>
    </main>
  );
}
