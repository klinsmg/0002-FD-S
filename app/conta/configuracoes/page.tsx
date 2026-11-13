import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ERROS, LIMITE_ENDERECOS, cep } from '@/lib/conta';
import CamposEndereco from '@/components/CamposEndereco';
import { salvarPerfil, sair } from '../actions';
import { createAddress, deleteAddress, setDefaultAddress, updateAddress } from '../enderecos/actions';
import Confirmar from '@/components/Confirmar';

export const metadata = { title: 'Configurações' };

// Tudo o que o cliente ajusta numa página só: perfil, endereços e segurança. Leitura aqui; gravação nas Server Actions.
export default async function Configuracoes({ searchParams }: { searchParams: Promise<{ erro?: string; editar?: string; secao?: string }> }) {
  const { erro, editar, secao } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Filtra pelo dono: o RLS deixa o admin ler todos, e aqui é a área pessoal.
  const [{ data: perfil }, { data: lista }] = await Promise.all([
    supabase.from('profiles').select('full_name, phone').eq('id', user.id).maybeSingle(),
    supabase.from('addresses').select('*').eq('user_id', user.id).order('is_default', { ascending: false }).order('created_at'),
  ]);
  const atual = lista?.find(a => a.id === editar);
  const cheio = !atual && (lista?.length ?? 0) >= LIMITE_ENDERECOS; // editar continua liberado no limite
  const provedor = user.app_metadata?.provider === 'google' ? 'Google' : String(user.app_metadata?.provider ?? 'e-mail');
  const msg = (s: string) => (secao === s && erro && ERROS[erro] ? <p className="nota" role="alert">{ERROS[erro]}</p> : null);

  return (
    <main>
      <header className="pg-cab wrap">
        <p className="script">sua conta</p>
        <h1><em>Configurações</em></h1>
      </header>
      <div className="wrap conta-caixa">
        <nav className="conta-ancoras" aria-label="Seções">
          <a href="#perfil">Perfil</a><a href="#enderecos">Endereços</a><a href="#seguranca">Segurança</a>
        </nav>

        <section id="perfil" aria-labelledby="t-perfil">
          <h2 className="conta-tit" id="t-perfil">Perfil</h2>
          <form className="form" action={salvarPerfil}>
            <label htmlFor="p-nome">Nome</label>
            <input id="p-nome" name="full_name" autoComplete="name" maxLength={120} required defaultValue={perfil?.full_name ?? ''} />
            <label htmlFor="p-fone">Telefone</label>
            <input id="p-fone" name="phone" type="tel" autoComplete="tel" maxLength={20} defaultValue={perfil?.phone ?? ''} placeholder="(11) 90000-0000" />
            {msg('perfil')}
            <button className="btn btn-p" type="submit">Salvar perfil</button>
          </form>
        </section>

        <section id="enderecos" aria-labelledby="t-end">
          <h2 className="conta-tit" id="t-end">Endereços</h2>
          <p className="nota">Até {LIMITE_ENDERECOS} endereços ({lista?.length ?? 0} de {LIMITE_ENDERECOS} usados). O padrão é o que usamos primeiro nas entregas.</p>
          {lista?.length ? (
            <ul className="canais">
              {lista.map(a => (
                <li key={a.id}>
                  <b>{a.label}{a.is_default ? ' · padrão' : ''}</b>
                  <span>
                    {a.street}, {a.number}{a.complement ? ` – ${a.complement}` : ''} · {a.district} · {a.city}/{a.state} · {cep(a.zip_code)}
                    {a.reference ? ` (${a.reference})` : ''}
                  </span>
                  <span className="conta-acoes">
                    <Link href={`/conta/configuracoes?editar=${a.id}#enderecos`}>Editar</Link>
                    {!a.is_default && <form action={setDefaultAddress}><input type="hidden" name="id" value={a.id} /><button type="submit">Tornar padrão</button></form>}
                    <Confirmar action={deleteAddress} mensagem={`Remover o endereço ${a.street}, ${a.number}?`} detalhe={`"${a.label}" sai da sua lista de endereços.`} rotulo="Remover"><input type="hidden" name="id" value={a.id} /><button type="submit">Remover</button></Confirmar>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="nota">Nenhum endereço salvo ainda.</p>
          )}

          <h3 className="conta-sub">{atual ? 'Editar endereço' : 'Novo endereço'}</h3>
          {msg('enderecos')}
          {/* key: ao trocar de endereço o formulário recomeça com os valores certos */}
          <form className="form" action={atual ? updateAddress : createAddress} key={atual?.id ?? 'novo'}>
            {atual && <input type="hidden" name="id" value={atual.id} />}
            {cheio && <p className="nota" role="status">Você chegou ao limite de {LIMITE_ENDERECOS} endereços. Remova um para adicionar outro.</p>}
            {/* fieldset desabilitado: no limite, nenhum campo nem o botão de adicionar funcionam (o servidor e o banco também recusam) */}
            <fieldset className="form-grupo" disabled={cheio}>
              <CamposEndereco v={{
                label: atual?.label ?? 'Casa', zip_code: atual ? cep(atual.zip_code) : '', street: atual?.street ?? '', number: atual?.number ?? '',
                complement: atual?.complement ?? '', district: atual?.district ?? '', city: atual?.city ?? 'Itapevi', state: atual?.state ?? 'SP', reference: atual?.reference ?? '',
              }} />
              <label className="conta-check"><input type="checkbox" name="is_default" defaultChecked={atual?.is_default ?? !lista?.length} /> Usar como endereço padrão</label>
              <button className="btn btn-p" type="submit">{atual ? 'Salvar alterações' : 'Adicionar endereço'}</button>
            </fieldset>
            {atual && <Link className="nota" href="/conta/configuracoes#enderecos">Cancelar edição</Link>}
          </form>
        </section>

        <section id="seguranca" aria-labelledby="t-seg">
          <h2 className="conta-tit" id="t-seg">Segurança</h2>
          <ul className="canais">
            <li><b>Forma de entrada</b><span>{provedor}</span></li>
            <li><b>E-mail</b><span>{user.email}</span></li>
            <li><b>Verificação em duas etapas</b><span>Em breve (opcional)</span></li>
          </ul>
          <p className="nota">Você entra com a sua conta {provedor}; a senha fica com eles e nunca passa por aqui.</p>
          <form action={sair}><button type="submit" className="btn btn-o">Sair da conta</button></form>
        </section>
      </div>
    </main>
  );
}
