import Link from 'next/link';
import { ehDev, exigirAdmin } from '@/lib/admin';
import { info } from '@/lib/info';
import { configurarEntrega, salvarEnderecoLoja, salvarEntregador, salvarHorarios } from '@/app/admin/(painel)/actions';
import BotaoEnviar from '@/components/BotaoEnviar';

const MSG: Record<string, string> = {
  email: 'Digite um e-mail válido.', naoachou: 'Não há conta com esse e-mail. Peça para a pessoa entrar uma vez no site com o Google (em /entregador) e tente de novo.',
  raio: 'Use um raio entre 20 e 300 m e uma precisão entre 10 e 100 m.', lojaend: 'Endereço não encontrado no mapa. Inclua rua, número, cidade e o CEP — ou cole as coordenadas (ex.: -23.5367, -46.9342).', lojacoords: 'Coordenadas inválidas. Use o formato -23.5367, -46.9342.', horario: 'Confira os horários: use o formato 18:00 e horários de abrir e fechar diferentes (ou marque Fechado).', falha: 'Não foi possível salvar. Tente novamente.',
};
const OK: Record<string, string> = { liberado: 'Entregador liberado.', removido: 'Entregador desativado.', entrega: 'Regras da entrega salvas.', horarios: 'Horários salvos. O site já mostra o novo horário.',
  loja: 'Endereço da loja salvo. Confira o ponto no mapa.', lojaaprox: 'Salvo, mas o ponto é aproximado (a rua não está no mapa; usei o CEP ou a rua mais próxima). Confira no mapa e, se ficar longe da porta, cole as coordenadas.' };
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const hm = (t: string | null) => (t ?? '').slice(0, 5);

export const metadata = { title: 'Configurações' };

// Configurações do administrador: conta, segurança (2FA) e senha. Só abre com admin + AAL2 (exigirAdmin).
// A ativação do 2FA continua em /admin/seguranca, porque precisa abrir antes do AAL2.
export default async function ConfiguracoesAdmin({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { ok, erro } = await searchParams;
  const { supabase, user } = await exigirAdmin();
  const dev = ehDev(user.email);
  const [{ data: fatores }, { data: entregadores }, { data: loja }, { data: horas }, { data: ponto }] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.rpc('admin_list_couriers'),
    supabase.from('store_settings').select('delivery_confirm_radius_m, gps_max_accuracy_m').maybeSingle(),
    supabase.from('business_hours').select('weekday, opens_at, closes_at, closed').order('weekday'),
    supabase.from('restaurants').select('id, lat, lng').order('created_at').limit(1).maybeSingle(),
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
          <a href="#conta">Conta</a><a href="#seguranca">Segurança</a><a href="#horarios">Horários</a><a href="#endereco">Endereço da loja</a><a href="#entregadores">Entregadores</a>{dev && <a href="#entrega">Regras da entrega (Dev)</a>}
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

        {ponto && (
          <section id="endereco" aria-labelledby="t-end">
            <h2 className="conta-tit" id="t-end">Endereço da loja</h2>
            <p className="nota">É de onde sai a rota da entrega e o 🌭 no mapa do cliente. Digite o endereço e o sistema acha o ponto.</p>
            {ponto.lat != null && ponto.lng != null ? (
              <p className="nota">📍 Ponto salvo · <a href={`https://www.openstreetmap.org/?mlat=${ponto.lat}&mlon=${ponto.lng}#map=18/${ponto.lat}/${ponto.lng}`} target="_blank" rel="noopener noreferrer">ver no mapa</a></p>
            ) : <p className="nota" role="note">⚠️ Ainda sem ponto. Confira o endereço abaixo e clique em Salvar.</p>}
            <form className="form" action={salvarEnderecoLoja}>
              <input type="hidden" name="id" value={ponto.id} />
              <label htmlFor="loja-end">Endereço (ou coordenadas)</label>
              <input id="loja-end" name="endereco" required maxLength={200} autoComplete="street-address"
                defaultValue={ponto.lat == null ? `${info.rua}, ${info.bairro}` : ''}
                placeholder="Rua, número, bairro, cidade - UF, CEP" />
              <p className="nota">Ficou longe da porta? No Google Maps, clique com o botão direito na porta da loja, clique nos números que aparecem (copia) e cole aqui.</p>
              <BotaoEnviar pendente="Procurando no mapa…">Salvar endereço</BotaoEnviar>
            </form>
          </section>
        )}

        <section id="entregadores" aria-labelledby="t-ent">
          <h2 className="conta-tit" id="t-ent">Entregadores</h2>
          <p className="nota">O entregador entra em <b>/entregador</b> com a conta Google dele. Depois disso, digite o e-mail aqui para liberar.</p>
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

        {dev && <section id="entrega" aria-labelledby="t-regras">
          <h2 className="conta-tit" id="t-regras">Regras da entrega <small>(Dev)</small></h2>
          <p className="nota">O botão &quot;Entregue&quot; do entregador só libera perto do endereço e com o GPS preciso. A loja não marca entrega como entregue.</p>
          <form className="form" action={configurarEntrega}>
            <label htmlFor="raio">Distância máxima do endereço (metros)</label>
            <input id="raio" name="raio" type="number" min={20} max={300} step={1} required defaultValue={loja?.delivery_confirm_radius_m ?? 50} />
            <label htmlFor="precisao">Precisão mínima do GPS (metros)</label>
            <input id="precisao" name="precisao" type="number" min={10} max={100} step={1} required defaultValue={loja?.gps_max_accuracy_m ?? 30} />
            <BotaoEnviar pendente="Salvando…">Salvar regras</BotaoEnviar>
          </form>
        </section>}
      </div>
    </main>
  );
}
