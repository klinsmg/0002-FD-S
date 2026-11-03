import type React from 'react';
import Image from 'next/image';
import { cats, pais, variantes, molhos, PONTOS, SEM } from '@/lib/menu';
import { info } from '@/lib/info';
import { ALT } from '@/lib/alt';
import { A } from '@/lib/alp';

export const metadata = {
  title: 'Cardápio da Lanchonete em Itapevi',
  description: 'Cardápio do MDogão Itapevi: monte o seu pedido e envie pelo WhatsApp. Hambúrgueres, hot dog, pastéis, porções, combos e bebidas.',
};

// Cardápio + carrinho (lib/carrinho.ts, Alpine). O carrinho só dá noção de valores e monta a mensagem do pedido;
// o pagamento é combinado pelo WhatsApp. Esquema do template: banner, faixa de categorias (ícones), busca/filtro lateral, cartões.
const porId = Object.fromEntries(cats.map(c => [c.id, c]));
const destaque = porId['burguers-classicos'].grupos[0].itens.find(i => i.n === 'Clássico Insano')!; // é o lanche da foto do banner
// após filtrar, sobe até o início da lista
const sobe = "$nextTick(()=>$root.querySelector('.lista').scrollIntoView({behavior:'smooth'}))";

const ic = {
  hamburgueres: <><path d="M6 20c0-6 8-9 18-9s18 3 18 9z" /><path d="M6 25h36M8 25c3 3 5-3 8 0s5-3 8 0 5-3 8 0 5-3 8 0" /><path d="M6 31h36v3c0 4-4 6-8 6H14c-4 0-8-2-8-6z" /></>,
  'hot-dog': <><path d="M5 30c0-6 8-10 19-10s19 4 19 10-8 10-19 10S5 36 5 30z" /><path d="M10 29c4-4 7 3 11 0s7 3 11 0 7 3 9 0" /></>,
  pasteis: <><path d="M6 36a18 18 0 0 1 36 0z" /><path d="M12 36a12 12 0 0 1 24 0M14 30l2 2M22 26l2 2M30 30l2 2" /></>,
  porcoes: <><path d="M12 20l3 22h18l3-22z" /><path d="M16 20V8M22 20V6M28 20V9M33 20V12" /></>,
  refeicoes: <><circle cx="24" cy="24" r="17" /><circle cx="24" cy="24" r="10" /></>,
  combos: <><path d="M10 16h28l-2 26H12z" /><path d="M18 16a6 6 0 0 1 12 0" /></>,
  rodizio: <path d="M24 24c-4-6-14-6-14 0s10 6 14 0 14-6 14 0-10 6-14 0z" />,
  adicionais: <path d="M24 10v28M10 24h28" />,
  bebidas: <><path d="M14 14h20l-3 28H17z" /><path d="M12 14h24M24 14V5l7-2" /><circle cx="24" cy="29" r="5" /></>,
} satisfies Record<string, React.ReactNode>;

const paiDaSub = Object.fromEntries(pais.flatMap(p => (p.subs.length > 1 ? p.subs.map(([s]) => [s, p.id]) : [])));
const ids = pais.map(p => p.id);
const q = (v: unknown) => JSON.stringify(v);
// linha do pedido (renderizada pelo Alpine, uma por item do carrinho)
const LINHA = `<li x-data="{det:false}">
  <div class="linha-topo">
    <span class="linha-nome"><b x-text="i.n"></b> <small x-show="i.v" x-text="i.v"></small></span>
    <span class="linha-preco" x-text="linha(i)"></span>
  </div>
  <small class="linha-opc" x-show="resumo(i)" x-text="resumo(i)"></small>
  <div class="linha-acoes">
    <span class="stepper">
      <button type="button" aria-label="Remover uma unidade" x-on:click="dec(i.k)">−</button>
      <output x-text="i.q"></output>
      <button type="button" aria-label="Adicionar uma unidade" x-on:click="add(i.k,i.n,i.v,i.p)">+</button>
    </span>
    <button type="button" class="det" x-show="!det && !i.obs" x-on:click="det=true; $nextTick(()=>$el.closest('li').querySelector('input').focus())">+ detalhe</button>
    <button type="button" class="remover" aria-label="Remover item do pedido" x-on:click="del(i.k)">×</button>
  </div>
  <label class="linha-obs" x-show="det || i.obs">
    <span class="sr-only">Detalhes do item</span>
    <input type="text" placeholder="Detalhes (ex.: sem cebola)" maxlength="240" x-model="i.obs">
  </label>
</li>`;


const MOLHO_LI = `<li><span class="m-nome" x-text="m.n"></span><span class="m-preco" x-text="m.t || 'valor a confirmar'"></span><span class="stepper mini"><button type="button" x-bind:aria-label="'Menos ' + m.n" x-on:click="molho(m.n,-1)">−</button><output x-text="opc?.ex?.[m.n] ?? 0"></output><button type="button" x-bind:aria-label="'Mais ' + m.n" x-on:click="molho(m.n,1)">+</button></span></li>`;

/* campos de endereço (usados no pop-up e no pedido); CEP preenche rua/bairro/cidade/UF */
const campoEnd = (foco?: string) => (
  <>
    <label>CEP<input type="text" inputMode="numeric" autoComplete="postal-code" maxLength={9} placeholder="00000-000" data-foco={foco} {...A({ 'x-model': 'a.cep', 'x-on:input': 'mascCep()' })} /></label>
    <p className="cep-msg" aria-live="polite" x-show="cepMsg" x-text="cepMsg" x-cloak="" />
    <label>Rua<input type="text" autoComplete="address-line1" maxLength={100} {...A({ 'x-model': 'a.rua' })} /></label>
    <div className="duas">
      <label>Número<input type="text" autoComplete="off" maxLength={10} data-num="" {...A({ 'x-model': 'a.num' })} /></label>
      <label>Complemento<input type="text" autoComplete="address-line2" maxLength={60} {...A({ 'x-model': 'a.comp' })} /></label>
    </div>
    <label>Bairro<input type="text" maxLength={100} {...A({ 'x-model': 'a.bairro' })} /></label>
    <div className="duas uf">
      <label>Cidade<input type="text" autoComplete="address-level2" maxLength={100} {...A({ 'x-model': 'a.cidade' })} /></label>
      <label>UF<input type="text" autoComplete="address-level1" maxLength={2} {...A({ 'x-model': 'a.uf' })} /></label>
    </div>
  </>
);

export default function Cardapio() {
  return (
    <main
      x-data={`carrinho(${q({ ids, paiDaSub, wa: info.wa, molhos: molhos.map(m => ({ n: m.n, p: variantes(m)[0].p, t: variantes(m)[0].t })) })})`}
      {...A({ 'x-on:hashchange.window': 'hash()', 'x-on:keydown.escape.window': "open=false; passo=''; opc=null" })}
    >
      <h1 className="sr-only">Cardápio</h1>

      {/* Banner: destaque da casa. O texto descreve o lanche da foto (Clássico Insano). */}
      <section className="sdd" aria-label="Destaque da casa">
        <div className="txt">
          <p className="script">destaque da casa</p>
          <h2 className="tit">Clássico <em>Insano</em></h2>
          <p className="chip">Burguers clássicos</p>
          <p className="desc">{destaque.d}.</p>
          <p className="preco-dia">{destaque.p}</p>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-2">
            <button type="button" className="btn btn-p" {...A({ 'x-on:click': `pedir(${q('burguers-classicos|Clássico Insano|')},${q(destaque.n)},'',${variantes(destaque)[0].p},$el)` })}>Adicionar ao pedido</button>
            <a className="mais" href="#categorias">Ver o cardápio completo <i aria-hidden="true">↓</i></a>
          </div>
        </div>
        <div className="f1"><Image src="/img/hero-burger.webp" alt={ALT.heroBurger} width={1080} height={1350} sizes="(min-width:900px) 50vw, 100vw" quality={92} priority /></div>
      </section>

      <nav className="faixa-cats" id="categorias" aria-label="Categorias do cardápio">
        <ul>
          {pais.map(p => (
            <li key={p.id}>
              <button type="button" {...A({ 'x-on:click': `cat='${p.id}'; sub='all'; ${sobe}`, 'x-bind:class': `cat==='${p.id}'?'on':''`, 'x-bind:aria-pressed': `cat==='${p.id}'` })}>
                <svg viewBox="0 0 48 48" width={44} height={44} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ic[p.id as keyof typeof ic]}</svg>
                <span>{p.nome}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="corpo">
        <nav className="lateral" aria-label="Filtrar categorias">
          <label className="busca">
            <span className="sr-only">Buscar no cardápio</span>
            <input type="search" placeholder="Buscar no cardápio" {...A({ 'x-model': 'q', 'x-on:input': "cat='all'; sub='all'" })} />
          </label>
          <button type="button" {...A({ 'x-on:click': `cat='all'; sub='all'; ${sobe}`, 'x-bind:class': "cat==='all'?'on':''" })}>Ver todas</button>
          {pais.map(p => (
            <div key={p.id} className="lat-grupo">
              <button type="button" {...A({ 'x-on:click': `cat='${p.id}'; sub='all'; ${sobe}`, 'x-bind:class': `cat==='${p.id}'?'on':''` })}>{p.nome}</button>
              {p.subs.length > 1 && (
                <div className="lat-subs" {...A({ 'x-show': `cat==='${p.id}'` })} style={{ display: 'none' }}>
                  {p.subs.map(([s, rotulo]) => (
                    <button key={s} type="button" {...A({ 'x-on:click': `sub='${s}'; ${sobe}`, 'x-bind:class': `sub==='${s}'?'on':''` })}>{rotulo}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <div className="lista">
          <p className="vazio" x-show="achados===0" x-cloak="">Nenhum item encontrado para &quot;<span x-text="q" />&quot;. Tente outro nome.</p>
          {pais.map(p => {
            const subs = p.subs.map(([s, rotulo]) => ({ c: porId[s], rotulo }));
            const multi = subs.length > 1;
            const qtd = subs.reduce((t, { c }) => t + c.grupos.filter(g => !g.info).reduce((u, g) => u + g.itens.length, 0), 0);
            return (
              <section key={p.id} className="sec" id={p.id} {...A({ 'x-transition:enter': 'ent', 'x-transition:enter-start': 'ent-ini', 'x-transition:enter-end': 'ent-fim', 'x-show': `(cat==='all'||cat==='${p.id}') && secOk($el)` })}>
                <h2 data-reveal><span className="tt">{p.nome}</span>{qtd > 0 && <span className="qtd">{qtd} {qtd === 1 ? 'item' : 'itens'}</span>}</h2>

                {/* subcategorias: abas dentro da categoria (aparecem quando a categoria está aberta) */}
                {multi && (
                  <div className="subs" role="group" aria-label={`Subcategorias de ${p.nome}`} {...A({ 'x-show': `cat==='${p.id}'` })} style={{ display: 'none' }}>
                    <button type="button" {...A({ 'x-on:click': "sub='all'", 'x-bind:class': "sub==='all'?'on':''", 'x-bind:aria-pressed': "sub==='all'" })}>Todos</button>
                    {subs.map(({ c, rotulo }) => (
                      <button key={c.id} type="button" {...A({ 'x-on:click': `sub='${c.id}'`, 'x-bind:class': `sub==='${c.id}'?'on':''`, 'x-bind:aria-pressed': `sub==='${c.id}'` })}>{rotulo}</button>
                    ))}
                  </div>
                )}

                {subs.map(({ c }) => (
                  <div key={c.id} className="subsec" {...A({ 'x-transition:enter': 'ent', 'x-transition:enter-start': 'ent-ini', 'x-transition:enter-end': 'ent-fim', 'x-show': `(${multi ? `cat!=='${p.id}'||sub==='all'||sub==='${c.id}'` : 'true'}) && secOk($el)` })}>
                    {multi && <h3 className="sub-tit">{c.nome}</h3>}
                    {c.nota && <p className="nota-sec">{c.nota}</p>}
                    {c.grupos.map((g, k) => (
                      <div key={k} className="grupo">
                        {g.t && (multi ? <h4>{g.t}</h4> : <h3>{g.t}</h3>)}
                        {g.info ? (
                          <ul className="info-lista">
                            {g.itens.map(i => <li key={i.n} data-t={`${p.nome} ${c.nome} ${g.t ?? ''} ${i.n} ${i.d ?? ''}`}><b>{i.n}</b>{i.d && <> · {i.d}</>}</li>)}
                          </ul>
                        ) : (
                          <div className="grade">
                            {g.itens.map(i => { const livre = c.id === 'bebidas' || c.id === 'adicionais'; return (
                              <div
                                key={i.n} data-reveal className="item" data-t={`${p.nome} ${c.nome} ${g.t ?? ''} ${i.n} ${i.d ?? ''}`}
                                {...A({ 'x-show': 'ok($el.dataset.t)' })}
                              >
                                <div className="item-info">
                                  <p className="nome">{i.n}</p>
                                  {i.d && <p>{i.d}</p>}
                                  <div className="vars">
                                    {variantes(i).map(v => {
                                      const k2 = q(`${c.id}|${i.n}|${v.l}`);
                                      return (
                                        <div key={v.l} className="var">
                                          <span className="var-txt">
                                            {v.l && <small>{v.l}</small>}
                                            <span className="preco">{v.t || 'Valor a confirmar'}</span>
                                          </span>
                                          {livre ? (
                                            <>
                                              <button type="button" className="add" aria-label={`Adicionar ${i.n}${v.l ? ` (${v.l})` : ''} ao pedido`} {...A({ 'x-show': `qtd(${k2})===0`, 'x-on:click': `add(${k2},${q(i.n)},${q(v.l)},${v.p ?? 'null'})` })}>Adicionar +</button>
                                              <span className="stepper" {...A({ 'x-show': `qtd(${k2})>0` })} style={{ display: 'none' }}>
                                                <button type="button" aria-label={`Remover uma unidade de ${i.n}`} {...A({ 'x-on:click': `dec(${k2})` })}>−</button>
                                                <output aria-live="polite" x-text={`qtd(${k2})`}>0</output>
                                                <button type="button" aria-label={`Adicionar mais uma unidade de ${i.n}`} {...A({ 'x-on:click': `add(${k2},${q(i.n)},${q(v.l)},${v.p ?? 'null'})` })}>+</button>
                                              </span>
                                            </>
                                          ) : (
                                            <>
                                              <small className="no-pedido" x-show={`qtdItem(${k2})>0`} x-text={`qtdItem(${k2})+' no pedido'`} style={{ display: 'none' }} />
                                              <button type="button" className="add" aria-label={`Personalizar e adicionar ${i.n}${v.l ? ` (${v.l})` : ''} ao pedido`} {...A({ 'x-on:click': `pedir(${k2},${q(i.n)},${q(v.l)},${v.p ?? 'null'},$el)` })}>Adicionar +</button>
                                            </>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            ); })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      </div>
      <p className="aviso-menu wrap">Cardápio de janeiro/2025. Valores sujeitos a alteração: o pedido é confirmado, e o pagamento combinado, pelo WhatsApp.</p>

      {/* barra do pedido (aparece com itens no carrinho) */}
      <button type="button" className="barra-pedido" x-show="qtdTotal>0 && !open" x-cloak="" {...A({ 'x-on:click': 'abrir($el)' })}>
        <span><b x-text="qtdTotal" /> <span x-text="qtdTotal===1?'item':'itens'" /> no pedido</span>
        <span className="barra-total" x-text="totalTxt" />
        <span className="barra-cta">Ver pedido →</span>
      </button>

      {/* personalização ao adicionar (tudo, exceto bebidas e adicionais): ponto da carne, condimentos/molhos a mais e observações */}
      <div className="gaveta-fundo nome-fundo" x-show="opc" x-cloak="" {...A({ 'x-on:click': 'fecharOpc()' })} />
      <div className="nome-modal opc-modal" role="dialog" aria-modal="true" aria-labelledby="opc-tit" x-show="opc" x-cloak="" {...A({ 'x-on:keydown.tab': 'trap($event)' })}>
        <h2 id="opc-tit">Personalize o seu pedido</h2>
        <p className="opc-nome" x-text="opc ? opc.n + (opc.v ? ' (' + opc.v + ')' : '') : ''" />
        <fieldset className="opc-sec">
          <legend>Ponto da carne <small className="obrig">(obrigatório)</small></legend>
          <div className="chips">
            {PONTOS.map((p, n) => (
              <button key={p} type="button" className="chip" data-foco={n === 0 ? 'opc' : undefined} {...A({ 'x-on:click': `opc.ponto = ${q(p)}; opcErro = ''`, 'x-bind:class': `opc?.ponto===${q(p)} ? 'on' : ''`, 'x-bind:aria-pressed': `opc?.ponto===${q(p)}` })}>{p}</button>
            ))}
          </div>
          <p className="erro" role="alert" x-show="opcErro" x-text="opcErro" x-cloak="" />
        </fieldset>
        <fieldset className="opc-sec">
          <legend>Condimentos e molhos <small>(a mais)</small></legend>
          <ul className="molhos">
            <template x-for="m in molhos" {...A({ 'x-bind:key': 'm.n' })} dangerouslySetInnerHTML={{ __html: MOLHO_LI }} />
          </ul>
        </fieldset>
        <fieldset className="opc-sec">
          <legend>Observações</legend>
          <div className="chips">
            {SEM.map(t => (
              <button key={t} type="button" className="chip" {...A({ 'x-on:click': `alternaSem(${q(t)})`, 'x-bind:class': `opc?.sem?.includes(${q(t)}) ? 'on' : ''`, 'x-bind:aria-pressed': `!!opc?.sem?.includes(${q(t)})` })}>{t}</button>
            ))}
          </div>
          <label className="sr-only" htmlFor="opc-outro">Outras observações</label>
          <input id="opc-outro" type="text" maxLength={120} placeholder="Outras observações (ex.: sem pimenta, bem crocante)" {...A({ 'x-bind:value': "opc?.outro ?? ''", 'x-on:input': 'opc && (opc.outro = $event.target.value)' })} />
        </fieldset>
        <button type="button" className="btn btn-p" {...A({ 'x-on:click': 'confirmarOpc()' })}>Adicionar · <span x-text="opcTotalTxt" /></button>
        <button type="button" className="limpar" {...A({ 'x-on:click': 'fecharOpc()' })}>Cancelar</button>
      </div>

      {/* sequência de pop-ups: nome > retirar ou entregar > endereço (só entrega) */}
      <div className="gaveta-fundo nome-fundo" x-show="passo!==''" x-cloak="" {...A({ 'x-on:click': 'fecharPasso()' })} />
      <div className="nome-modal" role="dialog" aria-modal="true" aria-label="Dados do pedido" x-show="passo!==''" x-cloak="" {...A({ 'x-on:keydown.tab': 'trap($event)' })}>
        <div className="passo" x-show="passo==='nome'" x-cloak="">
          <h2>Qual é o seu nome?</h2>
          <p>Ele identifica o seu pedido para a loja.</p>
          <label>Seu nome
            <input type="text" autoComplete="name" maxLength={60} data-foco="nome" {...A({ 'x-model': 'nomeTmp', 'x-on:keydown.enter.prevent': 'confirmarNome()' })} />
          </label>
          <p className="erro" role="alert" x-show="nomeErro" x-text="nomeErro" x-cloak="" />
          <button type="button" className="btn btn-p" {...A({ 'x-on:click': 'confirmarNome()' })}>Continuar</button>
        </div>

        <div className="passo" x-show="passo==='tipo'" x-cloak="">
          <h2>Como prefere receber?</h2>
          <p>Escolha retirar na loja ou receber em casa.</p>
          <div className="opcoes">
            <button type="button" className="opcao" data-foco="tipo" {...A({ 'x-on:click': "escolher('retirada')" })}><b>Retirar na loja</b><span>Você busca o pedido</span></button>
            <button type="button" className="opcao" {...A({ 'x-on:click': "escolher('entrega')" })}><b>Entrega</b><span>Levamos até você</span></button>
          </div>
        </div>

        <div className="passo" x-show="passo==='end'" x-cloak="">
          <h2>Endereço de entrega</h2>
          <p>Digite o CEP e preenchemos o resto para você.</p>
          {campoEnd('end')}
          <p className="erro" role="alert" x-show="endErro" x-text="endErro" x-cloak="" />
          <button type="button" className="btn btn-p" {...A({ 'x-on:click': 'confirmarEnd()' })}>Continuar</button>
          <button type="button" className="limpar" {...A({ 'x-on:click': 'voltarTipo()' })}>Voltar</button>
        </div>
      </div>

      {/* gaveta do pedido */}
      <div className="gaveta-fundo" x-show="open" x-cloak="" {...A({ 'x-on:click': 'open=false' })} />
      <aside className="gaveta" role="dialog" aria-modal="true" aria-labelledby="gaveta-tit" x-show="open" x-cloak="" {...A({ 'x-on:keydown.tab': 'trap($event)' })}>
        <header>
          <h2 id="gaveta-tit">Seu pedido</h2>
          <button type="button" className="limpar limpar-top" x-show="itens.length>0" x-cloak="" {...A({ 'x-on:click': 'limpar()' })}>Limpar</button>
          <button type="button" className="fechar" aria-label="Fechar pedido" x-ref="fechar" {...A({ 'x-on:click': 'open=false' })}>×</button>
        </header>

        <div className="gaveta-corpo">
          <p className="vazio-pedido" x-show="itens.length===0">Seu pedido está vazio. Toque em &quot;Adicionar +&quot; nos itens do cardápio.</p>

          {/* resumo dos dados (abre para editar nome, retirada/entrega, endereço e observações) */}
          <details className="dados-res" x-show="itens.length>0">
            <summary>
              <span className="res-txt" x-text="(nome.trim()||'Seu nome') + ' · ' + (tipo==='entrega' ? 'Entrega' + (a.rua ? ' · ' + a.rua + (a.num ? ', ' + a.num : '') : '') : 'Retirar na loja')" />
              <span className="res-alt">Alterar</span>
            </summary>
            <div className="dados">
              <label>Seu nome<input type="text" autoComplete="name" maxLength={60} {...A({ 'x-model': 'nome' })} /></label>
              <fieldset>
                <legend>Como prefere receber?</legend>
                <label className="radio"><input type="radio" value="retirada" {...A({ 'x-model': 'tipo', 'x-on:change': 'tipoOk=true' })} /> Retirar na loja</label>
                <label className="radio"><input type="radio" value="entrega" {...A({ 'x-model': 'tipo', 'x-on:change': 'tipoOk=true' })} /> Entrega</label>
              </fieldset>
              <div className="end-campos" x-show="tipo==='entrega'" x-cloak="">{campoEnd()}</div>
              <label>Observações do pedido (opcional)<textarea rows={2} maxLength={300} {...A({ 'x-model': 'obs' })} /></label>
            </div>
          </details>

          <ul className="linhas">
            {/* conteúdo do template em HTML bruto: JSX dentro de <template> quebra a hidratação do React */}
            <template x-for="i in itens" {...A({ 'x-bind:key': 'i.k' })} dangerouslySetInnerHTML={{ __html: LINHA }} />
          </ul>

          <details className="previa" x-show="itens.length>0">
            <summary>Ver a mensagem que será enviada</summary>
            <pre x-text="mensagem" />
          </details>
        </div>

        <footer x-show="itens.length>0">
          <p className="total"><span>Total estimado</span><b x-text="totalTxt" /></p>
          <p className="nota">Valores de referência. Taxa de entrega e pagamento são combinados pelo WhatsApp.</p>
          <p className="erro" role="alert" x-show="erro" x-text="erro" x-cloak="" />
          <p className="ok-envio" x-show="feito" x-cloak="">Abrimos o WhatsApp com o seu pedido. É só enviar a mensagem por lá.</p>
          <button type="button" className="btn btn-p enviar" {...A({ 'x-on:click': 'enviar()' })}>Enviar pedido pelo WhatsApp</button>
        </footer>
      </aside>
    </main>
  );
}
