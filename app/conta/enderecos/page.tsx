import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ERROS, cep } from '@/lib/conta';
import { definirPadrao, excluirEndereco, salvarEndereco } from '../actions';

export const metadata = { title: 'Meus endereços' };

export default async function Enderecos({ searchParams }: { searchParams: Promise<{ erro?: string; editar?: string }> }) {
  const { erro, editar } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // RLS: só os endereços do próprio cliente voltam aqui.
  const { data: lista } = await supabase.from('addresses').select('*').order('is_default', { ascending: false }).order('created_at');
  const atual = lista?.find(a => a.id === editar);

  return (
    <main>
      <header className="pg-cab wrap">
        <p className="script">sua conta</p>
        <h1>Meus <em>endereços</em></h1>
        <p>Até 10 endereços. O padrão é o que usamos primeiro nas entregas.</p>
      </header>
      <div className="wrap conta-caixa">
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
                  <Link href={`/conta/enderecos?editar=${a.id}`}>Editar</Link>
                  {!a.is_default && <form action={definirPadrao}><input type="hidden" name="id" value={a.id} /><button type="submit">Tornar padrão</button></form>}
                  <form action={excluirEndereco}><input type="hidden" name="id" value={a.id} /><button type="submit">Remover</button></form>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="nota">Nenhum endereço salvo ainda.</p>
        )}

        <h2 className="conta-tit">{atual ? 'Editar endereço' : 'Novo endereço'}</h2>
        {erro && ERROS[erro] && <p className="nota" role="alert">{ERROS[erro]}</p>}
        {/* key: ao trocar de endereço o formulário recomeça com os valores certos */}
        <form className="form" action={salvarEndereco} key={atual?.id ?? 'novo'}>
          {atual && <input type="hidden" name="id" value={atual.id} />}
          <label htmlFor="e-label">Nome do endereço</label>
          <input id="e-label" name="label" maxLength={40} defaultValue={atual?.label ?? 'Casa'} />
          <label htmlFor="e-cep">CEP</label>
          <input id="e-cep" name="zip_code" inputMode="numeric" autoComplete="postal-code" maxLength={9} required defaultValue={atual ? cep(atual.zip_code) : ''} placeholder="00000-000" />
          <label htmlFor="e-rua">Rua</label>
          <input id="e-rua" name="street" autoComplete="address-line1" maxLength={120} required defaultValue={atual?.street ?? ''} />
          <label htmlFor="e-num">Número</label>
          <input id="e-num" name="number" maxLength={10} required defaultValue={atual?.number ?? ''} />
          <label htmlFor="e-comp">Complemento</label>
          <input id="e-comp" name="complement" maxLength={60} defaultValue={atual?.complement ?? ''} />
          <label htmlFor="e-bairro">Bairro</label>
          <input id="e-bairro" name="district" maxLength={100} required defaultValue={atual?.district ?? ''} />
          <label htmlFor="e-cidade">Cidade</label>
          <input id="e-cidade" name="city" maxLength={100} required defaultValue={atual?.city ?? 'Itapevi'} />
          <label htmlFor="e-uf">UF</label>
          <input id="e-uf" name="state" maxLength={2} required defaultValue={atual?.state ?? 'SP'} />
          <label htmlFor="e-ref">Ponto de referência</label>
          <input id="e-ref" name="reference" maxLength={150} defaultValue={atual?.reference ?? ''} />
          <label className="conta-check"><input type="checkbox" name="is_default" defaultChecked={atual?.is_default ?? !lista?.length} /> Usar como endereço padrão</label>
          <button className="btn btn-p" type="submit">{atual ? 'Salvar alterações' : 'Adicionar endereço'}</button>
          {atual && <Link className="nota" href="/conta/enderecos">Cancelar edição</Link>}
        </form>
      </div>
    </main>
  );
}
