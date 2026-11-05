-- 004: relatórios de vendas (views sobre orders e order_items).
--
-- REGRAS DE TODAS AS MÉTRICAS:
--   * Fuso horário: America/Sao_Paulo. Um pedido feito às 23h30 de Brasília conta no dia/mês de Brasília,
--     mesmo que em UTC já seja "amanhã" (created_at é guardado em UTC).
--   * Pedido CANCELADO (status = 'cancelled') nunca entra em faturamento, em contagem de vendas nem em ticket médio.
--     Ele aparece só na coluna cancelled_orders de sales_summary.
--   * Qualquer outro status (pending, confirmed, preparing, ready, delivered) conta como venda. Quer contar só
--     os entregues? Troque o filtro "status <> 'cancelled'" por "status = 'delivered'" nas três views.
--   * Valores em CENTAVOS (inteiros). Divida por 100 na hora de exibir.
--   * Todas as views são security_invoker = true: elas rodam com as permissões de QUEM CONSULTA (e não do dono),
--     então respeitam o RLS de orders/order_items. Além disso, só o admin vê linhas (public.is_admin());
--     visitante anônimo nem tem permissão de leitura.

-- ---------------------------------------------------------------------------
-- sales_summary: um resumo por dia
-- ---------------------------------------------------------------------------
create view public.sales_summary
with (security_invoker = true) as
select
  (o.created_at at time zone 'America/Sao_Paulo')::date                                   as sale_date,
  count(*) filter (where o.status <> 'cancelled')                                          as total_orders,
  count(*) filter (where o.status =  'cancelled')                                          as cancelled_orders,
  coalesce(sum(o.total_cents) filter (where o.status <> 'cancelled'), 0)::bigint           as revenue_cents,
  case
    when count(*) filter (where o.status <> 'cancelled') = 0 then 0
    else round(
           (sum(o.total_cents) filter (where o.status <> 'cancelled'))::numeric
           / (count(*) filter (where o.status <> 'cancelled'))
         )::bigint
  end                                                                                      as average_ticket_cents
from public.orders o
where (select public.is_admin())
group by 1
order by 1 desc;

comment on view public.sales_summary is 'Resumo de vendas por dia (fuso America/Sao_Paulo). Só admin. Cancelados não entram em faturamento.';
comment on column public.sales_summary.sale_date            is 'Dia do pedido no fuso America/Sao_Paulo (não UTC).';
comment on column public.sales_summary.total_orders         is 'Pedidos do dia que contam como venda: todos, EXCETO cancelados.';
comment on column public.sales_summary.cancelled_orders     is 'Pedidos do dia com status cancelled. Total recebido no dia = total_orders + cancelled_orders.';
comment on column public.sales_summary.revenue_cents        is 'Faturamento do dia em centavos: soma de orders.total_cents (já inclui taxa de entrega e desconta cupom) dos pedidos não cancelados.';
comment on column public.sales_summary.average_ticket_cents is 'Ticket médio do dia em centavos: revenue_cents / total_orders, arredondado. 0 se não houve venda.';

-- ---------------------------------------------------------------------------
-- monthly_sales: um resumo por mês
-- ---------------------------------------------------------------------------
create view public.monthly_sales
with (security_invoker = true) as
select
  date_trunc('month', o.created_at at time zone 'America/Sao_Paulo')::date                 as month,
  count(*) filter (where o.status <> 'cancelled')                                          as total_orders,
  coalesce(sum(o.total_cents) filter (where o.status <> 'cancelled'), 0)::bigint           as revenue_cents
from public.orders o
where (select public.is_admin())
group by 1
order by 1 desc;

comment on view public.monthly_sales is 'Vendas por mês (fuso America/Sao_Paulo). Só admin. Cancelados não entram.';
comment on column public.monthly_sales.month         is 'Primeiro dia do mês no fuso America/Sao_Paulo (ex.: 2026-11-01 = novembro de 2026).';
comment on column public.monthly_sales.total_orders  is 'Pedidos do mês que contam como venda: todos, EXCETO cancelados (mesma regra de sales_summary.total_orders).';
comment on column public.monthly_sales.revenue_cents is 'Faturamento do mês em centavos: soma de orders.total_cents dos pedidos não cancelados.';

-- ---------------------------------------------------------------------------
-- best_selling_products: ranking de produtos
-- ---------------------------------------------------------------------------
-- Conta as vendas pelo histórico (order_items): unidades e valores são os do momento da compra. O nome exibido é o ATUAL
-- do catálogo; se o produto foi apagado (product_id nulo), as vendas continuam contadas, agrupadas pelo nome que ficou
-- gravado no item (o da venda mais recente).
create view public.best_selling_products
with (security_invoker = true) as
select
  i.product_id                                                              as product_id,
  coalesce(max(p.name), (array_agg(i.product_name order by o.created_at desc))[1]) as product_name,
  sum(i.quantity)::bigint                                                   as units_sold,
  sum(i.total_price_cents)::bigint                                          as revenue_cents,
  count(distinct i.order_id)                                                as orders_count
from public.order_items i
join public.orders o on o.id = i.order_id
left join public.products p on p.id = i.product_id
where o.status <> 'cancelled'
  and (select public.is_admin())
group by i.product_id, case when i.product_id is null then i.product_name end
order by units_sold desc, revenue_cents desc;

comment on view public.best_selling_products is 'Ranking de produtos mais vendidos (pedidos não cancelados), do mais para o menos vendido. Só admin.';
comment on column public.best_selling_products.product_id    is 'Produto do catálogo. Nulo = produto que foi apagado depois da venda (agrupado pelo nome gravado no item).';
comment on column public.best_selling_products.product_name  is 'Nome atual do produto no catálogo. Se o produto foi apagado, o nome gravado na venda mais recente.';
comment on column public.best_selling_products.units_sold    is 'Unidades vendidas: soma de order_items.quantity.';
comment on column public.best_selling_products.revenue_cents is 'Faturamento do produto em centavos: soma de order_items.total_price_cents (preço do item, sem taxa de entrega nem desconto do pedido).';
comment on column public.best_selling_products.orders_count  is 'Em quantos pedidos diferentes o produto apareceu.';

-- ---------------------------------------------------------------------------
-- Permissões: só usuário autenticado consulta (e o filtro is_admin() das views deixa passar apenas admin).
-- ---------------------------------------------------------------------------
revoke all on public.sales_summary, public.monthly_sales, public.best_selling_products from anon, authenticated;
grant select on public.sales_summary, public.monthly_sales, public.best_selling_products to authenticated;
