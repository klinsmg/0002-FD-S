// Testes do banco (RLS, funções, gatilhos e fluxos completos) — roda com: npm test
// Simula o Supabase: papéis anon/authenticated, auth.uid()/auth.jwt() e o schema realtime (stub).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// migrações do projeto, aplicadas em ordem num Postgres em memória (PGlite): nada toca o banco real
const DIR = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));
const db = new PGlite(); let ok = 0, f = 0;
const check = (n, c, x = '') => { c ? (ok++, console.log('  ok ' + n)) : (f++, console.log('  FALHOU ' + n + ' ' + x)); };
const erro = async fn => { try { await fn(); return null; } catch (e) { return e.message; } };
const q = async (s, p) => (await db.query(s, p)).rows;
const su = async () => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub','',false)"); await db.query("select set_config('request.jwt.claims','',false)"); };
// sessão: o admin entra com senha + 2FA (aal2), como o painel exige; comoAal1 simula senha sem o código
const como = async (r, sub = '', anon = false, aal = null) => { await db.exec('reset role'); await db.exec(`set role ${r}`); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [sub]); await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ role: r, sub, aal: aal ?? (sub && sub === globalThis.__ADM ? 'aal2' : 'aal1'), ...(anon ? { is_anonymous: true } : {}) })]); };
const n = async (s, p) => Number((await q(s, p))[0].n);
const afet = async (s, p) => Number((await q(`with x as (${s} returning 1) select count(*) n from x`, p).catch(() => [{ n: 0 }]))[0].n);
const RLO = String.fromCharCode(0x202e);
const ped = (itens, o = {}) => q(`select * from public.create_order($1,$2,$3::jsonb,$4,$5,$6,$7::jsonb)`, [o.nome ?? 'Maria', o.tipo ?? 'pickup', JSON.stringify(itens), o.fone ?? null, o.pag ?? null, o.notes ?? null, o.addr ? JSON.stringify(o.addr) : null]);

await db.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; grant usage on schema public to anon, authenticated, service_role;
 create schema auth; create table auth.users (id uuid primary key, email text, phone text, raw_user_meta_data jsonb, is_anonymous boolean default false);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
 grant usage on schema auth to anon, authenticated;
 create schema realtime; grant usage on schema realtime to authenticated;
 create table realtime.messages (id bigserial primary key, topic text not null, extension text not null, payload jsonb, event text, private boolean default true);
 alter table realtime.messages enable row level security; grant select on realtime.messages to authenticated;
 create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$;
 create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void language sql as $$ insert into realtime.messages (topic, extension, payload, event, private) values (topic, 'broadcast', payload, event, private) $$;`);

console.log('1) Aplicar as migrações em ordem');
const files = readdirSync(DIR).filter(x => x.endsWith('.sql')).sort((a, b) => Number(a.split('_')[0]) - Number(b.split('_')[0]));
console.log('   ordem: ' + files.map(x => x.split('_')[0]).join(' > '));
for (const x of files) { const e = await erro(() => db.exec(readFileSync(DIR + x, 'utf8'))); check(x, !e, e); if (e) process.exit(1); }
const antes = await n('select count(*) n from public.products');
check('reaplicar a carga inicial é idempotente', !(await erro(() => db.exec(readFileSync(DIR + files.find(x => x.startsWith('008')), 'utf8')))) && (await n('select count(*) n from public.products')) === antes && (await n('select count(*) n from public.product_variants')) === 18);
const tabs = (await q(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1`)).map(r => r.table_name);
check('nenhuma tabela em português sobrou', !tabs.some(t => ['secoes', 'categorias', 'produtos', 'produto_variantes', 'extras_pt', 'loja', 'horarios_funcionamento', 'pedidos', 'pedido_itens', 'pedido_item_extras', 'contatos', 'perfis'].includes(t)), tabs.join(','));
check('nenhuma função antiga (criar_pedido, criar_contato, limpar_texto)', (await n(`select count(*) n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname in ('criar_pedido','criar_contato','limpar_texto','definir_atualizado_em')`)) === 0);
console.log('   tabelas (' + tabs.length + '): ' + tabs.join(', '));

console.log('2) Carga inicial');
const c = t => n(`select count(*) n from public.${t}`);
check('9 seções', (await c('sections')) === 9);
check('14 categorias, todas com seção', (await c('categories')) === 14 && (await n('select count(*) n from public.categories where section_id is null')) === 0);
check('138 produtos', (await c('products')) === 138);
check('18 variantes (P/G, 500 ml/1 L...)', (await c('product_variants')) === 18);
check('18 extras (6 molhos + 10 adicionais + 2 complementos)', (await c('extras')) === 18 && (await n(`select count(*) n from public.extras where type='sauce'`)) === 6);
check('1 loja e 7 horários', (await c('store_settings')) === 1 && (await c('business_hours')) === 7);
const xb = (await q(`select * from public.products where name='X-Burguer'`))[0];
check('X-Burguer: R$ 23,00 = 2300 centavos, exige ponto da carne', xb.price_cents === 2300 && xb.requires_doneness === true);
const agua = (await q(`select * from public.products where name='Água'`))[0];
check('Água: R$ 5,00 e NÃO exige ponto da carne', agua.price_cents === 500 && agua.requires_doneness === false);
const batata = (await q(`select p.id from public.products p where p.name='Batata frita simples'`))[0];
const bv = await q(`select id, label, price_cents from public.product_variants where product_id=$1 order by sort_order`, [batata.id]);
check('Batata frita simples tem variantes P e G e nenhum preço no produto', bv.length === 2 && (await q('select price_cents from public.products where id=$1', [batata.id]))[0].price_cents === null, JSON.stringify(bv));
const semPreco = (await q(`select p.id, p.name from public.products p where p.price_cents is null and not p.is_informational and not exists (select 1 from public.product_variants v where v.product_id=p.id) limit 1`))[0];
check('existem itens com "valor a confirmar" (sem preço e sem variantes)', !!semPreco, JSON.stringify(semPreco));
const info = (await q(`select id from public.products where is_informational limit 1`))[0];
check('existem itens só informativos (rodízio, regras)', !!info);
const cheddar = (await q(`select id, price_cents from public.extras where type='sauce' and name='Cheddar'`))[0];
const catchup = (await q(`select id, price_cents from public.extras where type='sauce' and name='Catchup'`))[0];
check('molho Cheddar R$ 10,00 e Catchup a confirmar', cheddar.price_cents === 1000 && catchup.price_cents === null);

console.log('3) Visitante anônimo: lê só o que está ativo');
await como('anon');
check('lê produtos, categorias, seções, variantes, extras, loja e horários', (await c('products')) > 100 && (await c('categories')) === 14 && (await c('sections')) === 9 && (await c('product_variants')) === 18 && (await c('extras')) === 18 && (await c('store_settings')) === 1 && (await c('business_hours')) === 7);
for (const t of ['profiles', 'addresses', 'orders', 'order_items', 'order_item_extras', 'contact_messages']) check(`NÃO lê ${t}`, !!(await erro(() => q(`select * from public.${t}`))));
for (const v of ['sales_summary', 'monthly_sales', 'best_selling_products']) check(`NÃO lê ${v}`, !!(await erro(() => q(`select * from public.${v}`))));
check('NÃO escreve no catálogo', !!(await erro(() => q(`insert into public.products (name) values ('x')`))) && (await afet(`update public.products set name='hack'`)) === 0 && (await afet(`delete from public.products`)) === 0);
check('NÃO escreve em extras, loja e horários', (await afet(`update public.extras set name='x'`)) === 0 && (await afet(`update public.store_settings set name='x'`)) === 0 && (await afet(`delete from public.business_hours`)) === 0);
check('NÃO cria pedido nem contato', !!(await erro(() => q(`insert into public.orders (customer_name, order_type) values ('x','pickup')`))) && !!(await erro(() => q(`insert into public.contact_messages (name,message) values ('x','y')`))));
check('NÃO executa create_order', !!(await erro(() => ped([{ product_id: xb.id, quantity: 1, doneness: 'medium' }]))));
check('NÃO executa create_contact', !!(await erro(() => q(`select public.create_contact('x','y')`))));

console.log('4) Pedido completo pelo create_order (cliente logado)');
const ADM = globalThis.__ADM = '00000000-0000-0000-0000-00000000000a', C1 = '00000000-0000-0000-0000-00000000000b', C2 = '00000000-0000-0000-0000-00000000000c';
await su();
await db.query(`insert into auth.users (id, raw_user_meta_data) values ($1,'{"full_name":"Admin"}'),($2,'{"full_name":"Cliente Um"}'),($3,'{"name":"Cliente Dois"}')`, [ADM, C1, C2]);
await db.query(`update public.profiles set role='admin' where id=$1`, [ADM]);
await como('authenticated', C1);
let r = (await ped([
  { product_id: xb.id, quantity: 2, doneness: 'medium', extras: [{ extra_id: cheddar.id, quantity: 1 }], notes: 'sem cebola' },
  { product_id: agua.id, quantity: 3 },
], { pag: 'pix' }))[0];
check('X-Burguer x2 (2300 + Cheddar 1000) + Água x3 (500) = 6600 + 1500 = 8100', r.r_subtotal_cents === 8100 && r.r_total_cents === 8100 && r.r_has_price_pending === false, JSON.stringify(r));
check('número do pedido sequencial', Number(r.r_order_number) >= 1);
const o1 = (await q('select * from public.orders where id=$1', [r.r_order_id]))[0];
check('pedido: dono é quem está logado, status pending', o1.user_id === C1 && o1.status === 'pending');
const it = await q('select * from public.order_items where order_id=$1 order by product_name', [r.r_order_id]);
const itxb = it.find(i => i.product_name === 'X-Burguer');
check('item X-Burguer: preço 2300, extras 1000, total (2300+1000)*2 = 6600, ponto medium', itxb.unit_price_cents === 2300 && itxb.extras_cents === 1000 && itxb.total_price_cents === 6600 && itxb.doneness === 'medium', JSON.stringify(itxb));
check('observação do item guardada', itxb.notes === 'sem cebola');
check('extra guardado com nome e preço do momento', (await q('select name, unit_price_cents, quantity from public.order_item_extras where order_item_id=$1', [itxb.id]))[0].name === 'Cheddar');
check('bebida sem ponto da carne (doneness nulo)', it.find(i => i.product_name === 'Água').doneness === null);

console.log('   regras e recusas');
const e = async (itens, o) => (await erro(() => ped(itens, o))) ?? '';
check('lanche sem ponto da carne é recusado', /doneness_required/.test(await e([{ product_id: xb.id, quantity: 1 }])));
check('produto com variantes (P/G) sem escolher variante é recusado', /variant_required/.test(await e([{ product_id: batata.id, quantity: 1, doneness: 'medium' }])) || /variant_required/.test(await e([{ product_id: batata.id, quantity: 1 }])));
r = (await ped([{ product_id: batata.id, variant_id: bv[1].id, quantity: 1, doneness: 'medium' }]))[0];
check(`variante G escolhida: preço ${bv[1].price_cents} vem do banco`, r.r_subtotal_cents === bv[1].price_cents, JSON.stringify(r));
check('variante de outro produto é recusada', /invalid_variant/.test(await e([{ product_id: xb.id, variant_id: bv[0].id, quantity: 1, doneness: 'medium' }])));
r = (await ped([{ product_id: semPreco.id, quantity: 2, doneness: 'medium' }]))[0];
check('item "valor a confirmar": total 0 e pedido marcado com preço pendente', r.r_subtotal_cents === 0 && r.r_has_price_pending === true, JSON.stringify(r));
r = (await ped([{ product_id: xb.id, quantity: 1, doneness: 'rare', extras: [{ extra_id: catchup.id, quantity: 1 }] }]))[0];
check('extra sem preço (Catchup): soma só o X-Burguer (2300) e marca pendente', r.r_subtotal_cents === 2300 && r.r_has_price_pending === true, JSON.stringify(r));
check('item informativo é recusado', /product_unavailable/.test(await e([{ product_id: info.id, quantity: 1, doneness: 'medium' }])));
check('produto inexistente é recusado', /product_unavailable/.test(await e([{ product_id: '00000000-0000-0000-0000-0000000000ff', quantity: 1 }])));
check('quantidade 0 e 100 são recusadas', !!(await e([{ product_id: agua.id, quantity: 0 }])) && !!(await e([{ product_id: agua.id, quantity: 100 }])));
check('extra inexistente é recusado', /extra_unavailable/.test(await e([{ product_id: agua.id, quantity: 1, extras: [{ extra_id: '00000000-0000-0000-0000-0000000000ff', quantity: 1 }] }])));
check('mais de 60 itens é recusado', /invalid_items/.test(await e(Array.from({ length: 61 }, () => ({ product_id: agua.id, quantity: 1 })))));
check('lista vazia é recusada', /invalid_items/.test(await e([])));
check('doneness inválido é recusado', !!(await e([{ product_id: xb.id, quantity: 1, doneness: 'carvao' }])));
const nAntes = await n('select count(*) n from public.orders');
await e([{ product_id: agua.id, quantity: 1 }, { product_id: xb.id, quantity: 1 }]);
check('ATÔMICO: se um item falha, o pedido inteiro é desfeito (nada pela metade)', (await n('select count(*) n from public.orders')) === nAntes);
const end = { street: 'Rua José Michelotti', number: '146', district: 'Cidade da Saúde', city: 'Itapevi', state: 'sp', zip_code: '06693-005', hack: 'x' };
r = (await ped([{ product_id: agua.id, quantity: 1 }], { tipo: 'delivery', addr: end, nome: 'Ana' + RLO + 'Bia' }))[0];
const od = (await q('select customer_name, delivery_address from public.orders where id=$1', [r.r_order_id]))[0];
check('entrega: CEP só dígitos, UF maiúscula, chave extra descartada, nome limpo', od.delivery_address.zip_code === '06693005' && od.delivery_address.state === 'SP' && !('hack' in od.delivery_address) && !od.customer_name.includes(RLO), JSON.stringify(od));
check('entrega sem endereço é recusada', !!(await e([{ product_id: agua.id, quantity: 1 }], { tipo: 'delivery' })));
check('forma de pagamento inválida é recusada', !!(await e([{ product_id: agua.id, quantity: 1 }], { pag: 'bitcoin' })));

console.log('5) Segurança do pedido');
await como('authenticated', C1);
check('NÃO define status/valores inserindo direto', !!(await erro(() => q(`insert into public.orders (customer_name, order_type, status) values ('x','pickup','delivered')`))) && !!(await erro(() => q(`insert into public.orders (customer_name, order_type, total_cents) values ('x','pickup',1)`))));
check('NÃO envia user_id (coluna fechada)', !!(await erro(() => q(`insert into public.orders (user_id, customer_name, order_type) values ($1,'x','pickup')`, [C1]))));
check('NÃO define preço no item', !!(await erro(() => q(`insert into public.order_items (order_id, product_id, quantity, unit_price_cents) values ($1,$2,1,1)`, [o1.id, agua.id]))));
check('NÃO atualiza pedido (0 linhas)', (await afet(`update public.orders set status='delivered' where id=$1`, [o1.id])) === 0);
check('NÃO apaga pedido nem item', (await afet(`delete from public.orders where id=$1`, [o1.id])) === 0 && (await afet(`delete from public.order_items where order_id=$1`, [o1.id])) === 0);
check('NÃO altera extras', (await afet(`update public.order_item_extras set quantity=9`)) === 0);
check('acrescentar item ao pedido recém-criado (dentro de 10 min) funciona e recalcula', await (async () => { await q(`insert into public.order_items (order_id, product_id, quantity) values ($1,$2,1)`, [o1.id, agua.id]); return (await q('select subtotal_cents from public.orders where id=$1', [o1.id]))[0].subtotal_cents === 8600; })());
await su();
await db.query(`update public.orders set created_at = now() - interval '11 minutes' where id=$1`, [o1.id]);
await como('authenticated', C1);
check('depois de 10 minutos NÃO dá para acrescentar item', !!(await erro(() => q(`insert into public.order_items (order_id, product_id, quantity) values ($1,$2,1)`, [o1.id, agua.id]))));
check('nem extra em item antigo', !!(await erro(() => q(`insert into public.order_item_extras (order_item_id, extra_id, quantity) values ($1,$2,1)`, [itxb.id, cheddar.id]))));
await como('authenticated', C2);
check('outro cliente NÃO vê pedidos, itens nem extras alheios', (await c('orders')) === 0 && (await c('order_items')) === 0 && (await c('order_item_extras')) === 0);
check('outro cliente NÃO acrescenta item em pedido alheio', !!(await erro(() => q(`insert into public.order_items (order_id, product_id, quantity) values ($1,$2,1)`, [o1.id, agua.id]))));
await como('authenticated', C1);
const hist = await q('select order_number, status, total_cents, created_at from public.orders order by created_at desc');
check('histórico: cliente lista os próprios pedidos (do mais novo ao mais antigo)', hist.length >= 5 && hist.every((h, i) => i === 0 || new Date(hist[i - 1].created_at) >= new Date(h.created_at)), String(hist.length));
check('histórico: lê itens e extras dos próprios pedidos', (await c('order_items')) >= 5 && (await c('order_item_extras')) >= 2);
check('NÃO executa admin_set_order_amounts', /forbidden/.test((await erro(() => q(`select * from public.admin_set_order_amounts($1,0,0)`, [o1.id]))) ?? ''));
check('NÃO executa anonymize_customer_data', !!(await erro(() => q(`select public.anonymize_customer_data($1)`, [C1]))));
await como('authenticated', C2, true);
check('LOGIN ANÔNIMO não faz pedido', !!(await erro(() => ped([{ product_id: agua.id, quantity: 1 }]))));
await como('authenticated', C2);
const ct = await q(`select * from public.create_order('Dois','pickup',$1::jsonb)`, [JSON.stringify([{ product_id: agua.id, quantity: 1 }])]);
for (let i = 0; i < 4; i++) await ped([{ product_id: agua.id, quantity: 1 }]);
check('limite: o 6º pedido do dia é recusado', /daily_order_limit/.test((await erro(() => ped([{ product_id: agua.id, quantity: 1 }]))) ?? ''));
await su(); await q(`update public.orders set status='cancelled' where id=(select id from public.orders where user_id=$1 order by created_at limit 1)`, [C2]); await como('authenticated', C2);
check('cancelado não conta no limite', !(await erro(() => ped([{ product_id: agua.id, quantity: 1 }]))));
check('e o próximo volta a ser recusado', /daily_order_limit/.test((await erro(() => ped([{ product_id: agua.id, quantity: 1 }]))) ?? ''));
await su(); await q(`update public.orders set created_at = now() - interval '1 day' where user_id=$1`, [C2]); await como('authenticated', C2);
check('pedidos de ontem não contam (dia de São Paulo)', !(await erro(() => ped([{ product_id: agua.id, quantity: 1 }]))));

console.log('6) Admin');
await como('authenticated', ADM);
check('admin lê todos os pedidos, itens e extras', (await c('orders')) > 10 && (await c('order_items')) > 10 && (await c('order_item_extras')) >= 2);
check('admin muda pagamento e observações (status igual)', (await q(`update public.orders set status='pending', payment_method='cash', notes='troco p/ 100' where id=$1 returning status`, [o1.id]))[0].status === 'pending');
for (const col of ['customer_name', 'total_cents', 'user_id', 'delivery_fee_cents', 'order_number', 'has_price_pending']) check(`admin NÃO altera ${col}`, !!(await erro(() => q(`update public.orders set ${col} = ${col === 'customer_name' ? "'x'" : col === 'user_id' ? 'null' : col === 'order_number' ? '999999' : col === 'has_price_pending' ? 'true' : '1'} where id=$1`, [o1.id]))));
check('admin NÃO altera item nem extra', !!(await erro(() => q(`update public.order_items set quantity=9 where order_id=$1`, [o1.id]))) && (await afet(`update public.order_item_extras set quantity=9`)) === 0);
const rf = (await q(`select * from public.admin_set_order_amounts($1, 500, 200)`, [o1.id]))[0];
check('admin define taxa R$ 5 e desconto R$ 2: total = 8600 + 500 - 200 = 8900', rf.total_cents === 8900, JSON.stringify(rf));
await su();
await db.query(`update public.orders set status='delivered' where id=$1`, [o1.id]);
await como('authenticated', ADM);
check('pedido entregue não aceita mais mudança de valores', /order_not_found_or_closed/.test((await erro(() => q(`select * from public.admin_set_order_amounts($1,0,0)`, [o1.id]))) ?? ''));

console.log('7) Relatórios (admin)');
const s = await q('select * from public.sales_summary');
const hoje = s[0];
check('sales_summary: tem linha e colunas certas', !!hoje && ['sale_date', 'total_orders', 'cancelled_orders', 'revenue_cents', 'average_ticket_cents'].every(k => k in hoje));
await su();
await db.query(`update public.orders set status='cancelled' where id=(select id from public.orders where user_id=$1 order by created_at limit 1 offset 1)`, [C1]);
await como('authenticated', ADM);
const bs = await q('select * from public.best_selling_products');
const bag = bs.find(b => b.product_name === 'Água');
check('best_selling: Água lidera por unidades', bs[0].product_name === 'Água' || Number(bag.units_sold) >= 3, JSON.stringify(bs.slice(0, 3)));
const bx = bs.find(b => b.product_name === 'X-Burguer');
check('best_selling: receita do X-Burguer NÃO inclui o Cheddar (extra)', Number(bx.revenue_cents) % 2300 === 0, JSON.stringify(bx));
check('monthly_sales funciona', (await c('monthly_sales')) >= 1);
await como('authenticated', C1);
check('cliente comum vê 0 linhas nos relatórios', (await c('sales_summary')) === 0 && (await c('monthly_sales')) === 0 && (await c('best_selling_products')) === 0);

console.log('8) Perfil, login Google/Apple e endereços');
await su();
const mk = async (id, meta, phone = null) => { await db.query(`insert into auth.users (id, raw_user_meta_data, phone) values ($1,$2::jsonb,$3)`, [id, JSON.stringify(meta), phone]); return (await q('select full_name, role from public.profiles where id=$1', [id]))[0]; };
const P = i => `00000000-0000-0000-0000-0000000001${String(i).padStart(2, '0')}`;
check('Google: full_name', (await mk(P(1), { full_name: 'Maria da Silva', name: 'Maria', picture: 'x' })).full_name === 'Maria da Silva');
check('Apple: nome em texto', (await mk(P(2), { name: 'João Pedro' })).full_name === 'João Pedro');
check('Apple: nome em objeto vira "João Pedro"', (await mk(P(3), { name: { firstName: 'João', lastName: 'Pedro' } })).full_name === 'João Pedro');
check('Apple: sem nome, cadastro funciona', (await mk(P(4), { email_verified: true })).full_name === null);
check('metadado role=admin é ignorado (customer)', (await mk(P(5), { role: 'admin', full_name: 'Hacker' })).role === 'customer');
check('nome do cadastro sai limpo (sem U+202E)', !(await mk(P(6), { full_name: 'Ana' + RLO + 'Bia' })).full_name.includes(RLO));
check('telefone inválido não derruba o cadastro', (await mk(P(7), { full_name: 'Tel' }, '!!')).full_name === 'Tel');
await como('authenticated', P(1));
check('cliente edita o próprio nome (limpo) e não vira admin', await (async () => { await q(`update public.profiles set full_name=$2 where id=$1`, [P(1), 'Zé' + RLO + 'M']); const x = (await q('select full_name from public.profiles where id=$1', [P(1)]))[0].full_name; const esc = await erro(() => q(`update public.profiles set role='admin' where id=$1`, [P(1)])); return !x.includes(RLO) && !!esc; })());
check('cliente lê só o próprio perfil', (await c('profiles')) === 1);
check('cliente gerencia só os próprios endereços', await (async () => { const a = (await q(`insert into public.addresses (user_id, street, number, district, city, state, zip_code) values ($1,'R','1','B','C','SP','06693005') returning id`, [P(1)]))[0].id; const outro = await erro(() => q(`insert into public.addresses (user_id, street, number, district, city, state, zip_code) values ($1,'R','1','B','C','SP','06693005')`, [P(2)])); return !!a && !!outro; })());
await como('authenticated', ADM);
check('admin lê todos os perfis e endereços, sem alterar', (await c('profiles')) >= 10 && (await c('addresses')) === 1 && (await afet(`update public.addresses set street='x'`)) === 0 && (await afet(`update public.profiles set full_name='x' where id=$1`, [P(1)])) === 0);

console.log('9) Contato (exige login)');
await como('authenticated', C1);
const cid = (await q(`select public.create_contact('Carlos', 'Quero reservar o rodízio') as id`))[0].id;
check('cliente logado envia mensagem', !!cid);
check('mensagem vazia é recusada', !!(await erro(() => q(`select public.create_contact('', 'x')`))));
for (let i = 0; i < 4; i++) await q(`select public.create_contact('C', 'msg ' || $1::text)`, [i]);
check('freio: a 6ª mensagem na hora é recusada', /too_many_messages/.test((await erro(() => q(`select public.create_contact('C','x')`))) ?? ''));
check('cliente NÃO lê mensagens (nem as próprias)', (await c('contact_messages')) === 0);
await como('authenticated', ADM);
check('admin lê e muda o status da mensagem', (await c('contact_messages')) === 5 && (await q(`update public.contact_messages set status='read' where id=$1 returning status`, [cid]))[0].status === 'read');
check('admin NÃO altera o texto da mensagem', !!(await erro(() => q(`update public.contact_messages set message='x' where id=$1`, [cid]))));

console.log('10) Admin edita o catálogo; cliente não');
check('admin cria categoria, produto, variante, extra e edita loja/horário', await (async () => {
  const sec = (await q(`insert into public.sections (slug, name) values ('doces','Doces') returning id`))[0].id;
  const cat = (await q(`insert into public.categories (section_id, slug, name) values ($1,'doces','Doces') returning id`, [sec]))[0].id;
  const pr = (await q(`insert into public.products (category_id, name, price_cents, requires_doneness) values ($1,'Brownie',1800,false) returning id`, [cat]))[0].id;
  await q(`insert into public.product_variants (product_id, label, price_cents) values ($1,'G',2500)`, [pr]);
  await q(`insert into public.extras (type, name, price_cents) values ('addon','Calda',300)`);
  await q(`update public.store_settings set menu_notice='novo aviso'`);
  await q(`update public.business_hours set closed=true, opens_at=null, closes_at=null where weekday=1`);
  return true; })());
check('admin: preço negativo recusado', !!(await erro(() => q(`insert into public.products (name, price_cents) values ('x', -1)`))));
await como('authenticated', C1);
check('cliente logado NÃO edita catálogo, extras, loja nem horários', (await afet(`update public.products set name='hack'`)) === 0 && (await afet(`update public.extras set name='x'`)) === 0 && (await afet(`update public.store_settings set name='x'`)) === 0 && !!(await erro(() => q(`insert into public.sections (slug,name) values ('x','x')`))));
await su();
await db.query(`update public.categories set active=false where slug='doces'`);
await como('anon');
check('categoria inativa esconde os produtos dela do público', (await n(`select count(*) n from public.products where name='Brownie'`)) === 0);
await como('authenticated', C1);
await su(); const brId = (await q(`select id from public.products where name='Brownie'`))[0].id; await como('authenticated', C1);
check('e o pedido desses produtos é recusado', /product_unavailable/.test((await erro(() => ped([{ product_id: brId, quantity: 1 }]))) ?? ''));

console.log('11) Importação de histórico e LGPD');
await su();
await db.query(`insert into public.orders (user_id, customer_name, order_type, status, created_at) values ($1,'Importado','pickup','delivered','2026-01-10T12:00:00Z')`, [C2]);
const imp = (await q(`select id, status, created_at from public.orders where customer_name='Importado'`))[0];
check('postgres/service_role preservam status e data históricos', imp.status === 'delivered' && new Date(imp.created_at).toISOString().startsWith('2026-01-10'));
await db.query(`insert into public.order_items (order_id, product_id, product_name, quantity, unit_price_cents) values ($1,null,'Produto antigo',3,1500)`, [imp.id]);
await db.query(`insert into public.order_items (order_id, product_id, product_name, quantity, unit_price_cents) values ($1,null,'Sem preço',1,null)`, [imp.id]);
const io = (await q('select subtotal_cents, total_cents, has_price_pending from public.orders where id=$1', [imp.id]))[0];
check('itens importados: total 3 x 1500 = 4500 e preço pendente marcado', io.subtotal_cents === 4500 && io.has_price_pending === true, JSON.stringify(io));
check('item importado sem nome é recusado', !!(await erro(() => db.query(`insert into public.order_items (order_id, quantity) values ($1,1)`, [imp.id]))));
await db.query(`insert into public.orders (user_id, customer_name, customer_phone, order_type, notes, delivery_address) values ($1,'Fulana','(11) 99999-0000','delivery','portão azul',$2::jsonb)`, [C2, JSON.stringify({ street: 'Rua A', number: '1', district: 'B', city: 'Itapevi', state: 'SP', zip_code: '06693005' })]);
await db.query(`insert into public.contact_messages (user_id, name, message) values ($1,'Fulana','meu telefone é 11999990000')`, [C2]);
const qtd = (await q(`select public.anonymize_customer_data($1) n`, [C2]))[0].n;
const an = (await q(`select customer_name, customer_phone, notes, delivery_address from public.orders where user_id=$1 and order_type='delivery' limit 1`, [C2]))[0];
check(`LGPD: ${qtd} pedidos anonimizados (nome, telefone, observação, endereço) e o pedido continua`, an.customer_name === 'Cliente removido' && an.customer_phone === null && an.notes === null && an.delivery_address.street === 'removido' && an.delivery_address.city === 'Itapevi');
check('LGPD: mensagens de contato anonimizadas', (await q(`select name, message from public.contact_messages where user_id=$1`, [C2]))[0].message === '(removida)');
await db.query('delete from auth.users where id=$1', [C2]);
check('apagar a conta mantém os pedidos (user_id = null)', (await n('select count(*) n from public.orders where customer_name=$1 and user_id is null', ['Cliente removido'])) >= 1);

console.log('12) Estrutura');
const rls = await q(`select c.relname, c.relrowsecurity r from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by 1`);
check(`RLS ligado nas ${rls.length} tabelas`, rls.every(t => t.r), rls.filter(t => !t.r).map(t => t.relname).join(','));
const pol = await q(`select tablename, roles from pg_policies where schemaname='public'`);
check('nenhuma política vale para PUBLIC (todos os papéis)', !pol.some(p => String(p.roles).includes('public')));
const fks = await q(`select c.conrelid::regclass::text t, (select string_agg(a.attname, ',') from unnest(c.conkey) k join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k where true) cols,
  exists (select 1 from pg_index i where i.indrelid=c.conrelid and (i.indkey::int2[])[0:array_length(c.conkey,1)-1] = c.conkey) idx
  from pg_constraint c where c.contype='f' and c.connamespace='public'::regnamespace`);
check(`toda chave estrangeira tem índice de apoio (${fks.length} FKs)`, fks.every(x => x.idx), fks.filter(x => !x.idx).map(x => `${x.t}(${x.cols})`).join('; '));
const views = await q(`select relname, reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v'`);
check(`views (${views.length}) com security_invoker = true`, views.length === 3 && views.every(v => (v.reloptions ?? []).includes('security_invoker=true')));
const fn = await q(`select p.proname, p.prosecdef d, coalesce(array_to_string(p.proconfig, ','), '') cfg, has_function_privilege('anon', p.oid, 'EXECUTE') a, has_function_privilege('authenticated', p.oid, 'EXECUTE') au from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public'`);
check('toda função SECURITY DEFINER tem search_path fixo', fn.filter(f => f.d).every(f => /search_path/.test(f.cfg)), fn.filter(f => f.d && !/search_path/.test(f.cfg)).map(f => f.proname).join());
const defAnon = fn.filter(f => f.d && f.a).map(f => f.proname);
check('funções SECURITY DEFINER que o anônimo executa: só is_admin', defAnon.join() === 'is_admin', defAnon.join());
check('create_order e create_contact: só authenticated (não anon)', fn.filter(f => ['create_order', 'create_contact'].includes(f.proname)).every(f => f.au && !f.a));
check('admin_set_order_amounts: só authenticated; anonymize_customer_data: ninguém', fn.find(f => f.proname === 'admin_set_order_amounts').au && !fn.find(f => f.proname === 'admin_set_order_amounts').a && !fn.find(f => f.proname === 'anonymize_customer_data').au);

console.log('13) Limite de endereços (009)');
await como('authenticated', P(3));
{
  const ins = () => q(`insert into public.addresses (user_id, street, number, district, city, state, zip_code) values ($1,'R','1','B','C','SP','06693005')`, [P(3)]);
  let okN = 0; for (let i = 0; i < 5; i++) { if (!(await erro(ins))) okN++; }
  const sexto = await erro(ins);
  check('cliente cadastra até 5 endereços', okN === 5, okN);
  check('o 6º endereço é recusado (limite_de_enderecos)', !!sexto && /limite_de_enderecos/.test(String(sexto.message ?? sexto)), String(sexto?.message ?? sexto));
}
await su();
check('quem já tinha mais de 5 mantém os endereços (gatilho só em INSERT)', await (async () => { await q(`alter table public.addresses disable trigger addresses_limit`); for (let i = 0; i < 2; i++) await q(`insert into public.addresses (user_id, street, number, district, city, state, zip_code) values ($1,'R','1','B','C','SP','06693005')`, [P(3)]); await q(`alter table public.addresses enable trigger addresses_limit`); const n = (await q(`select count(*)::int n from public.addresses where user_id=$1`, [P(3)]))[0].n; const upd = await afet(`update public.addresses set street='Nova' where user_id=$1`, [P(3)]); return n === 7 && upd === 7; })());

console.log('14) Status "Saiu para entrega" (010)');
{
  await su();
  const ord = (await q(`select array_agg(e.enumlabel order by e.enumsortorder)::text a from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='order_status'`))[0].a;
  check('enum na ordem: ... ready, out_for_delivery, delivered ...', ord === '{pending,confirmed,preparing,ready,out_for_delivery,delivered,cancelled}', ord);
  await como('authenticated', ADM);
  await como('authenticated', P(1));
  check('cliente NÃO muda status para out_for_delivery', (await afet(`update public.orders set status='out_for_delivery'`).catch(() => 0)) === 0);
  await su();
  check('views de relatório seguem funcionando', (await q(`select count(*)::int n from public.sales_summary`))[0].n >= 0);
}
console.log('15) Avaliações e convite (011)');
{
  await su();
  const U = P(20);
  await mk(U, { full_name: 'Avaliador' });
  await como('authenticated', U);
  const ids = [];
  for (let i = 0; i < 4; i++) ids.push((await ped([{ product_id: agua.id, quantity: 1 }], { nome: 'Avaliador' }))[0].r_order_id);
  const inv = async () => (await q('select * from public.review_invite()'));
  const entrega = async id => { await su(); await q(`update public.orders set status='delivered', updated_at=now() + (select count(*) from public.orders where status='delivered') * interval '1 second' where id=$1`, [id]); await como('authenticated', U); };
  await entrega(ids[0]); await entrega(ids[1]);
  check('2 entregues: sem convite', (await inv()).length === 0);
  await entrega(ids[2]);
  const c1 = await inv();
  check('3 entregues: convite para o último entregue', c1.length === 1 && c1[0].order_id === ids[2], JSON.stringify(c1));
  check('mesmo pedido: convite não aparece de novo', (await inv()).length === 0);
  await q('select public.review_decline($1)', [ids[2]]);
  check('recusa registrada', (await q('select outcome from public.review_prompts where order_id=$1', [ids[2]]))[0].outcome === 'declined');
  check('depois da recusa, sem pedido novo: nada', (await inv()).length === 0);
  check('não avalia pedido recusado', !!(await erro(() => q('select public.review_submit($1,5,$2)', [ids[2], 'x']))));
  await entrega(ids[3]);
  const c2 = await inv();
  check('novo pedido entregue: convida de novo', c2.length === 1 && c2[0].order_id === ids[3]);
  check('nota fora de 1..5 recusada', !!(await erro(() => q('select public.review_submit($1,6,null)', [ids[3]]))));
  check('cliente NÃO grava direto na tabela', !!(await erro(() => q(`insert into public.reviews (user_id, rating) values ($1, 5)`, [U]))));
  const rid = (await q('select public.review_submit($1,2,$2) id', [ids[3], 'Demorou, mas tava bom' + String.fromCharCode(7)]))[0].id;
  const rv = (await q('select * from public.reviews where id=$1', [rid]))[0];
  check('avaliação gravada (nota 2, comentário limpo)', rv.rating === 2 && rv.comment === 'Demorou, mas tava bom', JSON.stringify(rv));
  check('segunda avaliação recusada', !!(await erro(() => q('select public.review_submit($1,5,null)', [ids[3]]))));
  await q('select public.review_google_click()');
  check('indicação ao Google registrada', !!(await q('select google_clicked_at from public.reviews where id=$1', [rid]))[0].google_clicked_at);
  await su(); const extra = (await q(`select id from public.orders where user_id=$1 limit 1`, [U]))[0]; await como('authenticated', U);
  check('quem avaliou nunca mais é convidado', (await inv()).length === 0);
  await como('authenticated', C1);
  check('outro cliente não vê a avaliação', (await q('select count(*)::int n from public.reviews'))[0].n === 0);
  await como('authenticated', ADM);
  check('admin lê as avaliações', (await q('select count(*)::int n from public.reviews'))[0].n === 1);
  await su();
  // duas recusas = nunca mais
  const V = P(21); await mk(V, { full_name: 'Recusador' }); await como('authenticated', V);
  const vs = []; for (let i = 0; i < 5; i++) vs.push((await ped([{ product_id: agua.id, quantity: 1 }], { nome: 'R' }))[0].r_order_id);
  const ent = async id => { await su(); await q(`update public.orders set status='delivered', updated_at=now() + interval '1 hour' * (select count(*) from public.orders where status='delivered') where id=$1`, [id]); await como('authenticated', V); };
  for (const id of vs.slice(0, 3)) await ent(id);
  const a = await inv(); await q('select public.review_decline($1)', [a[0].order_id]);
  await ent(vs[3]); const b = await inv(); await q('select public.review_decline($1)', [b[0].order_id]);
  await ent(vs[4]);
  check('2 recusas: nunca mais convida', (await inv()).length === 0);
  await su();
}
console.log('16) Fluxo de status (012)');
{
  await su();
  const W = P(30); await mk(W, { full_name: 'Fluxo' }); await como('authenticated', W);
  const addr = { street: 'Rua A', number: '1', district: 'Centro', city: 'Itapevi', state: 'SP', zip_code: '06653000' };
  const ent = (await ped([{ product_id: agua.id, quantity: 1 }], { tipo: 'delivery', addr }))[0].r_order_id;
  const ret = (await ped([{ product_id: agua.id, quantity: 1 }]))[0].r_order_id;
  await como('authenticated', ADM);
  const vai = async (id, st) => !(await erro(() => q(`update public.orders set status=$2 where id=$1`, [id, st])));
  check('entrega: Novo -> Pronto (pular preparo) recusado', !(await vai(ent, 'ready')));
  check('entrega: Novo -> Entregue recusado', !(await vai(ent, 'delivered')));
  check('entrega: Novo -> Em preparo -> Pronto', (await vai(ent, 'preparing')) && (await vai(ent, 'ready')));
  check('entrega: Pronto -> Entregue pelo painel recusado', !(await vai(ent, 'delivered')));
  check('entrega: Pronto -> Saiu para entrega direto pela API recusado (só escolhendo entregador)', !(await vai(ent, 'out_for_delivery')));
  check('entrega: voltar para Em preparo recusado', !(await vai(ent, 'preparing')));
  check('retirada: Pronto -> Saiu para entrega recusado', (await vai(ret, 'preparing')) && (await vai(ret, 'ready')) && !(await vai(ret, 'out_for_delivery')));
  check('retirada: Pronto -> Entregue (Retirado)', await vai(ret, 'delivered'));
  check('entregue é final (nem cancelar)', !(await vai(ret, 'cancelled')) && !(await vai(ret, 'pending')));
  check('cancelar pedido aberto', await vai(ent, 'cancelled'));
  check('cancelado é final', !(await vai(ent, 'pending')));
  check('status inexistente recusado', !(await vai(ret, 'voando')));
  await su();
  check('postgres/definer passa (baixa do entregador)', !(await erro(() => q(`update public.orders set status='delivered' where id=$1`, [ent]))));
}
console.log('17) Tempo real (013)');
{
  await su();
  await q('delete from realtime.messages');
  const X = P(40), Y = P(41); await mk(X, { full_name: 'Xis' }); await mk(Y, { full_name: 'Ypsilon' });
  await como('authenticated', X);
  const px = (await ped([{ product_id: agua.id, quantity: 1 }]))[0].r_order_id;
  await su();
  const msgs = async () => q('select topic, event, payload from realtime.messages order by id');
  let m = await msgs();
  check('pedido novo avisa a loja (evento novo, sem dados do cliente)', m.length === 1 && m[0].topic === 'loja' && m[0].payload.evento === 'novo' && m[0].payload.id === px && !('customer_name' in m[0].payload), JSON.stringify(m));
  await como('authenticated', ADM);
  await q(`update public.orders set status='preparing' where id=$1`, [px]);
  await q(`update public.orders set notes='só obs' where id=$1`, [px]);
  await su(); m = await msgs();
  check('mudança de status publica em pedido:<id> e loja', m.length === 3 && m[1].topic === 'pedido:' + px && m[1].payload.status === 'preparing' && m[2].topic === 'loja', JSON.stringify(m));
  check('mudar só a observação não publica', m.length === 3);
  const pode = async (quem, topico) => { await como('authenticated', quem); await q("select set_config('realtime.topic',$1,false)", [topico]); const r = await n('select count(*) n from realtime.messages'); await su(); return r > 0; };
  check('dono entra no canal do próprio pedido', await pode(X, 'pedido:' + px));
  check('outro cliente NÃO entra no canal do pedido', !(await pode(Y, 'pedido:' + px)));
  check('cliente NÃO entra no canal da loja', !(await pode(X, 'loja')));
  check('admin entra na loja e no pedido', (await pode(ADM, 'loja')) && (await pode(ADM, 'pedido:' + px)));
  await como('authenticated', X);
  check('cliente NÃO publica no canal', !!(await erro(() => q(`insert into realtime.messages (topic, extension, payload) values ('loja','broadcast','{}')`))));
  check('cliente NÃO chama a função do gatilho', !!(await erro(() => q('select public.orders_broadcast()'))));
  await su();
}
console.log('18) Tentativas e bloqueio (014)');
{
  await su();
  const Z = P(50); await mk(Z, { full_name: 'Zeca' });
  const D1 = '11111111-1111-4111-8111-111111111111', D2 = '22222222-2222-4222-8222-222222222222';
  await como('authenticated', Z);
  // como o servidor chama (service_role), informando o usuário verificado (u)
  const ac = async (acao, ip, d, u = null) => { await como('service_role'); return (await q('select public.access_check($1,$2,$3,$4) ok', [acao, ip, d, u]))[0].ok; };
  let oks = 0; for (let i = 0; i < 6; i++) oks += (await ac('pedido', '10.0.0.1', D1, Z)) ? 1 : 0;
  check('6 tentativas de pedido em 10 min passam', oks === 6);
  check('a 7ª do mesmo usuário é bloqueada', (await ac('pedido', '10.0.0.9', D2, Z)) === false);
  check('segue bloqueado mesmo trocando IP e dispositivo (usuário)', (await ac('pedido', '10.0.0.8', null, Z)) === false);
  check('bloqueio é por ação (login não afetado)', (await ac('codigo_2fa', '10.0.0.1', D1, Z)) === true);
  check('dispositivo bloqueado também barra outra conta/anônimo', (await ac('pedido', '10.0.0.7', D1)) === false);
  let ipok = 0; for (let i = 0; i < 15; i++) ipok += (await ac('login_admin', '200.1.1.1', null)) ? 1 : 0;
  check('login: IP compartilhado aguenta 15 tentativas', ipok === 15);
  check('16ª do mesmo IP bloqueada', (await ac('login_admin', '200.1.1.1', null)) === false);
  check('outro IP segue livre', (await ac('login_admin', '200.1.1.2', null)) === true);
  check('ação inválida recusada', !!(await erro(() => ac('xyz', null, null))));
  check('dispositivo fora do formato é ignorado (não quebra)', (await ac('login_admin', '200.1.1.3', 'lixo<script>')) === true);
  await como('anon');
  check('anônimo NÃO lê os registros', !!(await erro(() => q('select * from public.access_attempts'))));
  await como('authenticated', Z);
  check('cliente NÃO lê os registros', (await n('select count(*) n from public.access_attempts')) === 0);
  check('cliente NÃO grava direto', !!(await erro(() => q(`insert into public.access_attempts (action) values ('pedido')`))));
  await como('authenticated', ADM);
  check('admin lê as tentativas bloqueadas', (await n('select count(*) n from public.access_attempts where blocked')) >= 3);
  await su();
  await q(`update public.access_attempts set created_at = now() - interval '16 minutes'`);
  await como('authenticated', Z);
  check('depois de 15 min o bloqueio cai', (await ac('pedido', '10.0.0.1', D1, Z)) === true);
  await su();
}
console.log('18b) Entregas com entregador, sem rastreamento (015 + 022)');
{
  await su();
  const K = P(60), K2 = P(61), CL = P(62), OUT = P(63);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,'moto@x.com','{"full_name":"Moto"}'),($2,'moto2@x.com','{"full_name":"Moto2"}')`, [K, K2]);
  await mk(CL, { full_name: 'Cliente Entrega' }); await mk(OUT, { full_name: 'Outro' });
  const addr = { street: 'Rua B', number: '2', district: 'Centro', city: 'Itapevi', state: 'SP', zip_code: '06653000' };
  const novo = async () => { await como('authenticated', CL); const id = (await ped([{ product_id: agua.id, quantity: 1 }], { tipo: 'delivery', addr }))[0].r_order_id; await como('authenticated', ADM); return id; };
  const pronto = async id => { await q(`update public.orders set status='preparing' where id=$1`, [id]); await q(`update public.orders set status='ready' where id=$1`, [id]); };
  const pid = await novo();
  await como('authenticated', K);
  check('não-admin NÃO libera entregador', !!(await erro(() => q(`select public.admin_set_courier('moto@x.com', true)`))));
  check('não-admin NÃO despacha', !!(await erro(() => q('select public.dispatch_order($1,$2)', [pid, K]))));
  await como('authenticated', ADM);
  check('admin libera entregador pelo e-mail', (await q(`select public.admin_set_courier('MOTO@x.com', true) id`))[0].id === K);
  await q(`select public.admin_set_courier('moto2@x.com', true)`);
  check('e-mail inexistente avisa', /user_not_found/.test((await erro(() => q(`select public.admin_set_courier('nada@x.com', true)`))) ?? ''));
  check('lista de entregadores', (await q('select * from public.admin_list_couriers()')).length === 2);
  check('saiu para entrega exige pedido Pronto', /order_not_ready/.test((await erro(() => q('select public.dispatch_order($1,$2)', [pid, K]))) ?? ''));
  await pronto(pid);
  check('loja NÃO pula o despacho (Pronto -> Saiu direto pela API)', !!(await erro(() => q(`update public.orders set status='out_for_delivery' where id=$1`, [pid]))));
  const did = (await q('select public.dispatch_order($1,$2) id', [pid, K]))[0].id;
  check('despacho: pedido vira "Saiu para entrega" e cria a entrega', (await q('select status from public.orders where id=$1', [pid]))[0].status === 'out_for_delivery' && !!did);
  check('não dá para despachar duas vezes', !!(await erro(() => q('select public.dispatch_order($1,$2)', [pid, K]))));
  check('loja NÃO marca Entregue pela API (a baixa é do entregador)', !!(await erro(() => q(`update public.orders set status='delivered' where id=$1`, [pid]))));
  const baixa = () => q('select public.courier_confirm_delivery($1) r', [did]).then(r => r[0].r);
  await como('authenticated', K2);
  check('outro entregador NÃO dá baixa', (await baixa()) === 'not_assigned');
  check('outro entregador NÃO devolve', (await q(`select public.courier_return_delivery($1,'outro') r`, [did]))[0].r === 'not_assigned');
  check('outro entregador NÃO vê a entrega nem o pedido', (await n('select count(*) n from public.deliveries')) === 0 && (await n('select count(*) n from public.orders')) === 0);
  await como('authenticated', CL);
  check('cliente NÃO dá baixa nem lê entregas', (await baixa()) === 'not_assigned' && (await n('select count(*) n from public.deliveries')) === 0);
  await como('authenticated', K);
  check('entregador vê a entrega e o pedido dela', (await n('select count(*) n from public.deliveries')) === 1 && (await n('select count(*) n from public.orders')) === 1);
  check('entregador NÃO muda o pedido direto', (await afet(`update public.orders set status='delivered' where id=$1`, [pid])) === 0);
  check('entregador dá baixa', (await baixa()) === 'delivered');
  check('baixa só uma vez', (await baixa()) === 'not_assigned');
  await su();
  check('pedido Entregue e entrega encerrada com hora', (await q('select status from public.orders where id=$1', [pid]))[0].status === 'delivered' && !!(await q('select finished_at from public.deliveries where id=$1', [did]))[0].finished_at);
  await como('authenticated', CL);
  check('cliente lê a linha do tempo do próprio pedido', (await n('select count(*) n from public.order_events where order_id=$1', [pid])) === 6);
  await como('authenticated', OUT);
  check('outro cliente NÃO lê', (await n('select count(*) n from public.order_events where order_id=$1', [pid])) === 0);
  // recusa e "não consegui entregar": o pedido volta para Pronto com o motivo
  const p2 = await novo(); await pronto(p2);
  const d2 = (await q('select public.dispatch_order($1,$2) id', [p2, K]))[0].id;
  await como('authenticated', K);
  check('motivo inválido recusado', (await q(`select public.courier_return_delivery($1,'preguica') r`, [d2]))[0].r === 'invalid_reason');
  check('entregador recusa', (await q(`select public.courier_return_delivery($1,'recusada') r`, [d2]))[0].r === 'ok');
  await su();
  check('recusa: pedido volta para Pronto e a entrega é cancelada', (await q('select status from public.orders where id=$1', [p2]))[0].status === 'ready' && (await q('select status from public.deliveries where id=$1', [d2]))[0].status === 'cancelled');
  await como('authenticated', ADM);
  const d3 = (await q('select public.dispatch_order($1,$2) id', [p2, K2]))[0].id;
  await como('authenticated', K2);
  check('outro entregador devolve (cliente ausente)', (await q(`select public.courier_return_delivery($1,'cliente_ausente') r`, [d3]))[0].r === 'ok');
  await su();
  const ev2 = (await q(`select data from public.order_events where order_id=$1 and type='FALHA_NA_ENTREGA'`, [p2]))[0];
  check('não entregue: motivo na linha do tempo', ev2?.data?.motivo === 'cliente_ausente' && (await q('select status from public.deliveries where id=$1', [d3]))[0].status === 'failed');
  // entregador inativo não recebe; cancelar encerra a entrega
  await como('authenticated', ADM);
  await q(`select public.admin_set_courier('moto@x.com', false)`);
  check('entregador inativo não recebe entrega', /courier_not_found/.test((await erro(() => q('select public.dispatch_order($1,$2)', [p2, K]))) ?? ''));
  await q('select public.dispatch_order($1,$2)', [p2, K2]);
  await q(`update public.orders set status='cancelled' where id=$1`, [p2]);
  await su();
  check('pedido cancelado encerra a entrega', (await n(`select count(*) n from public.deliveries where order_id=$1 and status='assigned'`, [p2])) === 0);
  await como('authenticated', K);
  check('entregador desativado perde acesso', (await n('select count(*) n from public.deliveries')) === 0);
  await su();
}
console.log('19) Fluxos ponta a ponta (cliente -> loja -> entregador dá baixa -> pagamento -> relatório)');
{
  await su();
  const K = P(80), CL = P(81);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1,'e2e-moto@x.com','{"full_name":"Moto E2E"}')`, [K]);
  await mk(CL, { full_name: 'Cliente E2E' });
  const receita = async () => { await como('authenticated', ADM); const v = Number((await q(`select coalesce(sum(revenue_cents),0)::int v from public.sales_summary`))[0].v); await su(); return v; };
  const antes = await receita();
  // 1. cliente faz pedido de entrega
  await como('authenticated', CL);
  const addr = { street: 'Rua E2E', number: '10', district: 'Centro', city: 'Itapevi', state: 'SP', zip_code: '06653000' };
  const r = (await ped([{ product_id: xb.id, quantity: 2, doneness: 'medium' }, { product_id: agua.id, quantity: 1 }], { tipo: 'delivery', addr, nome: 'Cliente E2E' }))[0];
  check('E2E 1: pedido criado como Novo com total do banco (2 X-Burguer + água = R$ 51)', r.r_total_cents === 5100, JSON.stringify(r));
  const pid = r.r_order_id;
  // 2. loja aceita, prepara, define pagamento
  await como('authenticated', ADM);
  await q(`update public.orders set status='preparing', payment_method='pix' where id=$1`, [pid]);
  check('E2E 2: taxa só enquanto aberto (em preparo já não muda)', !!(await erro(() => q('select * from public.admin_set_order_amounts($1,700,0)', [pid]))));
  await q(`update public.orders set status='ready' where id=$1`, [pid]);
  await q(`select public.admin_set_courier('e2e-moto@x.com', true)`);
  // 3. Saiu para entrega: a loja direciona ao entregador
  const did = (await q('select public.dispatch_order($1,$2) id', [pid, K]))[0].id;
  check('E2E 3: saiu para entrega com o entregador', (await q('select status from public.orders where id=$1', [pid]))[0].status === 'out_for_delivery' && !!did);
  // 4. entregador dá baixa
  await como('authenticated', K);
  check('E2E 4: entregador dá baixa', (await q('select public.courier_confirm_delivery($1) r', [did]))[0].r === 'delivered');
  await su();
  const fim = (await q('select status, payment_method, total_cents from public.orders where id=$1', [pid]))[0];
  check('E2E 5: pedido Entregue, pagamento Pix registrado', fim.status === 'delivered' && fim.payment_method === 'pix');
  const eve = (await q(`select string_agg(type, ',' order by id) t from public.order_events where order_id=$1`, [pid]))[0].t;
  check('E2E 6: linha do tempo da entrega', eve === 'PEDIDO_CRIADO,EM_PREPARO,PRONTO,SAIU_PARA_ENTREGA,ENTREGADOR_ATRIBUIDO,ENTREGUE', eve);
  const depois = await receita();
  check('E2E 7: faturamento do relatório inclui o pedido', depois - antes === fim.total_cents, `${antes} -> ${depois}`);
  // retirada ponta a ponta
  await como('authenticated', CL);
  const pr = (await ped([{ product_id: agua.id, quantity: 1 }], { nome: 'Cliente E2E' }))[0].r_order_id;
  await como('authenticated', ADM);
  for (const st of ['preparing', 'ready', 'delivered']) await q(`update public.orders set status=$2 where id=$1`, [pr, st]);
  await su();
  const evr = (await q(`select string_agg(type, ',' order by id) t from public.order_events where order_id=$1`, [pr]))[0].t;
  check('E2E 8: retirada Novo -> Em preparo -> Pronto para retirada -> Retirado', evr === 'PEDIDO_CRIADO,EM_PREPARO,PRONTO_PARA_RETIRADA,RETIRADO', evr);
}
console.log('20) Funções auxiliares diretas');
{
  await su();
  const Q = P(90); await db.query(`insert into auth.users (id, email) values ($1,'aux@x.com')`, [Q]);
  await como('authenticated', Q);
  check('is_courier: falso para quem não foi liberado', (await q('select public.is_courier() v'))[0].v === false);
  await como('authenticated', ADM); await q(`select public.admin_set_courier('aux@x.com', true)`);
  await como('authenticated', Q);
  check('is_courier: verdadeiro depois de liberado', (await q('select public.is_courier() v'))[0].v === true);
  const so = (await q(`select public.order_status_ok('ready','delivered','pickup') a, public.order_status_ok('ready','delivered','delivery') b, public.order_status_ok('ready','out_for_delivery','delivery') c, public.order_status_ok('out_for_delivery','delivered','delivery') d`))[0];
  check('order_status_ok espelha o fluxo (entrega só por despacho e baixa)', so.a === true && so.b === false && so.c === false && so.d === false, JSON.stringify(so));
  await su();
}
console.log('21) Regressão de segurança (Fase 4/5)');
{
  await su();
  // V1: admin sem 2FA concluído (aal1: só senha, ou sessão do Google) NÃO pode ter poder de admin direto na API do banco
  await como('authenticated', ADM, false, 'aal1');
  check('V1 admin em aal1 NÃO lê pedidos de todos', (await n('select count(*) n from public.orders')) === 0);
  check('V1 admin em aal1 NÃO muda status', (await afet(`update public.orders set notes='x'`)) === 0);
  check('V1 admin em aal1 NÃO libera entregador', !!(await erro(() => q(`select public.admin_set_courier('aux@x.com', true)`))));
  check('V1 admin em aal1 NÃO lê tentativas/auditoria', (await n('select count(*) n from public.access_attempts')) === 0 && (await n('select count(*) n from public.order_events')) === 0);
  await como('authenticated', ADM);
  check('V1 admin em aal2 continua com acesso', (await n('select count(*) n from public.orders')) > 10);
  // V2: o limite de tentativas não pode aceitar IP inventado por quem chama a API (travaria o login de outra pessoa)
  await como('anon');
  check('V2 anônimo NÃO chama access_check direto', !!(await erro(() => q(`select public.access_check('login_admin','200.200.200.200',null,null)`))));
  await como('authenticated', P(1));
  check('V2 cliente NÃO chama access_check direto', !!(await erro(() => q(`select public.access_check('pedido','1.2.3.4',null,null)`))));
  await como('service_role');
  check('V2 servidor (service_role) chama com o usuário verificado', (await q(`select public.access_check('pedido','9.9.9.9',null,$1) ok`, [P(1)]))[0].ok === true);
  await su();
  check('V2 o registro guarda o usuário informado pelo servidor', (await n(`select count(*) n from public.access_attempts where ip='9.9.9.9' and user_id=$1`, [P(1)])) === 1);
  // V3: limite diário sob concorrência — o gatilho serializa os pedidos do mesmo cliente
  const def = (await q(`select pg_get_functiondef('public.orders_daily_limit()'::regprocedure) d`))[0].d;
  check('V3 limite diário com trava por cliente (pg_advisory_xact_lock)', /pg_advisory_xact_lock/.test(def));
  await su();
}
console.log('22) Reversão da 019 e reaplicação');
{
  await su();
  const D19 = fileURLToPath(new URL('../../supabase/rollback/019_down.sql', import.meta.url));
  check('rollback 019 aplica', !(await erro(() => db.exec(readFileSync(D19, 'utf8')))));
  check('reaplicar 019', !(await erro(() => db.exec(readFileSync(DIR + files.find(x => x.startsWith('019')), 'utf8')))));
  await como('authenticated', ADM, false, 'aal1');
  check('depois de reaplicar, V1 continua fechado', (await n('select count(*) n from public.orders')) === 0);
  await su();
}
console.log('23) Sem rastreamento (022): GPS, rotas, Google e restaurantes removidos; entregas ficam; reaplicar é seguro');
{
  await su();
  check('reaplicar 022', !(await erro(() => db.exec(readFileSync(DIR + files.find(x => x.startsWith('022')), 'utf8')))));
  const tabelas = ['delivery_positions', 'route_cache', 'google_api_usage', 'google_api_calls', 'google_api_alerts', 'restaurants', 'restaurant_members'];
  check('tabelas do rastreamento removidas', (await n(`select count(*) n from information_schema.tables where table_schema='public' and table_name = any($1)`, [tabelas])) === 0);
  check('pedido sem colunas de destino/restaurante', (await n(`select count(*) n from information_schema.columns where table_schema='public' and table_name='orders' and column_name in ('dest_lat','dest_lng','dest_source','restaurant_id')`)) === 0);
  check('configuração sem raio/precisão de GPS', (await n(`select count(*) n from information_schema.columns where table_schema='public' and table_name='store_settings' and column_name in ('delivery_confirm_radius_m','gps_max_accuracy_m')`)) === 0);
  const fns = ['courier_report_position', 'courier_set_eta', 'order_tracking', 'order_set_destination', 'purge_delivery_positions', 'distance_m', 'log_denied', 'google_reserve', 'google_consolidate', 'default_restaurant', 'is_restaurant_member'];
  const sobrou = (await q(`select p.proname from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname = any($1)`, [fns])).map(r => r.proname);
  check('funções do rastreamento removidas', sobrou.length === 0, sobrou.join(','));
  check('entrega sem colunas de posição/rota', (await n(`select count(*) n from information_schema.columns where table_schema='public' and table_name='deliveries' and column_name in ('dest_lat','last_lat','eta_minutes','route_polyline','confirm_lat')`)) === 0);
  check('entregas e entregadores continuam', (await n('select count(*) n from public.deliveries')) > 0 && (await n('select count(*) n from public.couriers')) > 0);
  check('pedidos e linha do tempo continuam', (await n('select count(*) n from public.orders')) > 10 && (await n('select count(*) n from public.order_events')) > 0);
}
console.log(`\nResultado: ${ok} ok, ${f} falhas`); process.exit(f ? 1 : 0);
