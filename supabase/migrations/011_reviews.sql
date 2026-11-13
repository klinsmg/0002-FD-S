-- 011: avaliações dos clientes e convite para avaliar (pop-up).
-- Regras (todas aqui no banco, o site só chama as funções):
--   * o convite só aparece para quem tem 3 ou mais pedidos ENTREGUES;
--   * no máximo uma vez por pedido elegível (o último entregue): mostrar = registrar em review_prompts;
--   * quem já avaliou nunca mais é convidado;
--   * "Agora não" / fechar conta como recusa; com 2 recusas, nunca mais. Depois de uma recusa, só volta com um NOVO pedido entregue.
--   * a avaliação (1 a 5 estrelas + comentário) fica no nosso banco; o clique em "Publicar no Google" é só registrado.

create table public.reviews (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  order_id           uuid references public.orders (id) on delete set null,
  rating             smallint not null check (rating between 1 and 5),
  comment            text check (comment is null or char_length(comment) <= 1000),
  google_clicked_at  timestamptz,
  created_at         timestamptz not null default now(),
  constraint reviews_um_por_cliente unique (user_id)
);
create index reviews_order_id_idx on public.reviews (order_id);
create index reviews_created_at_idx on public.reviews (created_at desc);
comment on table public.reviews is 'Avaliação do cliente (uma por conta). Gravada só pela função review_submit.';
comment on column public.reviews.google_clicked_at is 'Quando o cliente clicou em "Publicar no Google" (indicação; não confirma que publicou).';

create table public.review_prompts (
  user_id     uuid not null references auth.users (id) on delete cascade,
  order_id    uuid not null references public.orders (id) on delete cascade,
  outcome     text not null default 'shown' check (outcome in ('shown', 'declined', 'reviewed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, order_id)
);
create index review_prompts_order_id_idx on public.review_prompts (order_id);
comment on table public.review_prompts is 'Cada convite exibido (um por pedido elegível) e o que o cliente fez com ele.';

-- Acesso: ninguém grava direto pela API; leitura: o próprio cliente e o admin.
revoke all on public.reviews, public.review_prompts from anon, authenticated;
grant select on public.reviews, public.review_prompts to authenticated;
alter table public.reviews        enable row level security;
alter table public.review_prompts enable row level security;
create policy reviews_select_own   on public.reviews        for select to authenticated using (user_id = (select auth.uid()));
create policy reviews_select_admin on public.reviews        for select to authenticated using ((select public.is_admin()));
create policy prompts_select_own   on public.review_prompts for select to authenticated using (user_id = (select auth.uid()));
create policy prompts_select_admin on public.review_prompts for select to authenticated using ((select public.is_admin()));

-- Abre o convite se o cliente for elegível agora. Devolve o pedido (id e número) ou nada.
create or replace function public.review_invite()
returns table (order_id uuid, order_number bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ultimo public.orders;
begin
  if v_uid is null then return; end if;
  if exists (select 1 from public.reviews r where r.user_id = v_uid) then return; end if;
  if (select count(*) from public.review_prompts p where p.user_id = v_uid and p.outcome = 'declined') >= 2 then return; end if;
  if (select count(*) from public.orders o where o.user_id = v_uid and o.status = 'delivered') < 3 then return; end if;
  select o.* into v_ultimo from public.orders o
   where o.user_id = v_uid and o.status = 'delivered'
   order by o.updated_at desc, o.created_at desc limit 1;
  -- um convite por pedido elegível: se este pedido já teve convite (qualquer resultado), não mostra de novo
  insert into public.review_prompts (user_id, order_id) values (v_uid, v_ultimo.id)
  on conflict do nothing;
  if not found then return; end if;
  return query select v_ultimo.id, v_ultimo.order_number::bigint;
end;
$$;

-- "Agora não" / fechar: registra a recusa do convite em aberto.
create or replace function public.review_decline(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.review_prompts p
     set outcome = 'declined', updated_at = now()
   where p.user_id = (select auth.uid()) and p.order_id = p_order_id and p.outcome = 'shown';
end;
$$;

-- Grava a avaliação. Só vale com um convite aberto deste cliente para este pedido; uma avaliação por conta.
create or replace function public.review_submit(p_order_id uuid, p_rating integer, p_comment text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id uuid;
  v_txt text := nullif(btrim(regexp_replace(coalesce(p_comment, ''), '[[:cntrl:]]+', ' ', 'g')), '');
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'invalid_rating' using errcode = '22023'; end if;
  if v_txt is not null and char_length(v_txt) > 1000 then v_txt := left(v_txt, 1000); end if;
  update public.review_prompts p
     set outcome = 'reviewed', updated_at = now()
   where p.user_id = v_uid and p.order_id = p_order_id and p.outcome = 'shown';
  if not found then raise exception 'no_open_invite' using errcode = 'P0002'; end if;
  insert into public.reviews (user_id, order_id, rating, comment) values (v_uid, p_order_id, p_rating, v_txt)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'already_reviewed' using errcode = '23505';
end;
$$;

-- Registra a indicação ao Google (o clique em "Publicar no Google").
create or replace function public.review_google_click()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reviews r set google_clicked_at = coalesce(r.google_clicked_at, now()) where r.user_id = (select auth.uid());
end;
$$;

revoke all on function public.review_invite(), public.review_decline(uuid), public.review_submit(uuid, integer, text), public.review_google_click() from public, anon;
grant execute on function public.review_invite(), public.review_decline(uuid), public.review_submit(uuid, integer, text), public.review_google_click() to authenticated;
