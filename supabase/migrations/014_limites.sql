-- 014: limite diário de pedidos e proteção contra sobrecarga.
--   * Até 5 pedidos por cliente por DIA (calendário de America/Sao_Paulo). Cancelados não contam.
--     Vale para qualquer caminho da API (o gatilho roda no insert do pedido).
--   * Controle de tentativas por usuário + IP + dispositivo (cookie próprio, sem fingerprinting) nos pontos sensíveis
--     (criar pedido, login do painel, código 2FA). Passou do limite: bloqueio temporário e registro da tentativa.
--   * Registros guardados por 7 dias (segurança/auditoria), depois apagados.

-- ---------- limite diário ----------
create or replace function public.orders_daily_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and new.user_id is not null
     and (select count(*) from public.orders o
           where o.user_id = new.user_id and o.status <> 'cancelled'
             and o.created_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')) >= 5 then
    raise exception 'daily_order_limit' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_daily_limit on public.orders;
create trigger orders_daily_limit
  before insert on public.orders
  for each row execute function public.orders_daily_limit();

create index if not exists orders_user_created_idx on public.orders (user_id, created_at desc);

-- ---------- tentativas ----------
create table public.access_attempts (
  id          bigserial primary key,
  action      text not null check (action in ('pedido', 'login_admin', 'codigo_2fa')),
  user_id     uuid references auth.users (id) on delete cascade,
  ip          text check (ip is null or char_length(ip) <= 64),
  device      uuid,
  blocked     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index access_attempts_user_idx   on public.access_attempts (user_id, action, created_at desc);
create index access_attempts_ip_idx     on public.access_attempts (action, ip, created_at desc);
create index access_attempts_device_idx on public.access_attempts (action, device, created_at desc);
create index access_attempts_created_idx on public.access_attempts (created_at);
comment on table public.access_attempts is 'Tentativas em pontos sensíveis (pedido, login, 2FA). blocked = barrada pelo limite (tentativa suspeita). Guardado 7 dias.';

revoke all on public.access_attempts from anon, authenticated;
grant select on public.access_attempts to authenticated;
alter table public.access_attempts enable row level security;
create policy access_attempts_admin on public.access_attempts for select to authenticated using ((select public.is_admin()));

-- Confere e registra uma tentativa. true = pode seguir; false = bloqueado agora.
-- Limites (janela / máximo por usuário, dispositivo, IP / bloqueio). O IP tem teto mais alto (IP compartilhado: Wi-Fi, 4G).
create or replace function public.access_check(p_action text, p_ip text, p_device text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ip text := nullif(left(btrim(coalesce(p_ip, '')), 64), '');
  v_dev uuid := case when p_device ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_device::uuid end;
  v_janela interval; v_bloqueio interval := interval '15 minutes';
  v_max_user int; v_max_dev int; v_max_ip int;
begin
  case p_action
    when 'pedido'      then v_janela := interval '10 minutes'; v_max_user := 6;  v_max_dev := 6;  v_max_ip := 20;
    when 'login_admin' then v_janela := interval '15 minutes'; v_max_user := 10; v_max_dev := 8;  v_max_ip := 15;
    when 'codigo_2fa'  then v_janela := interval '15 minutes'; v_max_user := 6;  v_max_dev := 6;  v_max_ip := 15;
    else raise exception 'invalid_action' using errcode = '22023';
  end case;

  -- já bloqueado (qualquer uma das três chaves): recusa sem gravar de novo
  if exists (select 1 from public.access_attempts a
              where a.action = p_action and a.blocked and a.created_at > now() - v_bloqueio
                and ((v_uid is not null and a.user_id = v_uid) or (v_dev is not null and a.device = v_dev) or (v_ip is not null and a.ip = v_ip))) then
    return false;
  end if;

  if (v_uid is not null and (select count(*) from public.access_attempts a where a.action = p_action and a.user_id = v_uid and a.created_at > now() - v_janela) >= v_max_user)
     or (v_dev is not null and (select count(*) from public.access_attempts a where a.action = p_action and a.device = v_dev and a.created_at > now() - v_janela) >= v_max_dev)
     or (v_ip is not null and (select count(*) from public.access_attempts a where a.action = p_action and a.ip = v_ip and a.created_at > now() - v_janela) >= v_max_ip) then
    insert into public.access_attempts (action, user_id, ip, device, blocked) values (p_action, v_uid, v_ip, v_dev, true);
    return false;
  end if;

  insert into public.access_attempts (action, user_id, ip, device) values (p_action, v_uid, v_ip, v_dev);
  -- faxina ocasional: retenção de 7 dias
  if random() < 0.02 then delete from public.access_attempts where created_at < now() - interval '7 days'; end if;
  return true;
end;
$$;

revoke all on function public.access_check(text, text, text) from public;
grant execute on function public.access_check(text, text, text) to anon, authenticated;
