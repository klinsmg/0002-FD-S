-- 019 (Fase 5, segurança). Ver RELATORIO.md, Fase 4.
--  V1 (alta): is_admin() exige 2FA concluído (aal2 no JWT). Antes, uma sessão só com senha (aal1), obtida direto na
--     API do Supabase Auth, tinha poder de admin na API do banco — o 2FA só era conferido nas telas do painel.
--  V2 (média): access_check só pelo servidor (service_role), que informa o usuário verificado. Antes era executável por
--     anon e aceitava qualquer IP: dava para travar o login do admin forjando o IP da loja.
--  V3 (baixa): limite de 5 pedidos/dia com trava por cliente (corrida entre pedidos simultâneos).
--  V4 (baixa): log_denied só pelo servidor.
-- Reversão: supabase/rollback/019_down.sql

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and p.role = 'admin'
  ) and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
$$;

drop function if exists public.access_check(text, text, text);
create or replace function public.access_check(p_action text, p_ip text, p_device text, p_user uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := p_user;  -- informado pelo servidor (JWT já verificado); ninguém chama isto pela API
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

revoke all on function public.access_check(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.access_check(text, text, text, uuid) to service_role;

create or replace function public.orders_daily_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') and new.user_id is not null then
    -- serializa os pedidos do MESMO cliente: dois pedidos simultâneos não passam juntos pelo limite
    perform pg_advisory_xact_lock(hashtextextended('pedido-dia:' || new.user_id::text, 0));
  end if;
  if current_user in ('anon', 'authenticated') and new.user_id is not null
     and (select count(*) from public.orders o
           where o.user_id = new.user_id and o.status <> 'cancelled'
             and o.created_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')) >= 5 then
    raise exception 'daily_order_limit' using errcode = '23514';
  end if;
  return new;
end;
$$;


drop function if exists public.log_denied(text, text);
create or replace function public.log_denied(p_ip text, p_device text, p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.access_attempts (action, user_id, ip, device, blocked)
  values ('rastreio_negado', p_user, nullif(left(btrim(coalesce(p_ip, '')), 64), ''),
          case when p_device ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_device::uuid end, true);
$$;

revoke all on function public.log_denied(text, text, uuid) from public, anon, authenticated;
grant execute on function public.log_denied(text, text, uuid) to service_role;
