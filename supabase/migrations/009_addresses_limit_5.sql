-- 009: limite de endereços por cliente cai de 10 para 5 (mesmo valor de LIMITE_ENDERECOS em lib/conta.ts).
-- Quem já tem mais de 5 mantém os endereços (o gatilho só roda em INSERT); só não consegue adicionar novos.
-- O lock por usuário serializa inserções simultâneas da mesma conta: sem ele, dois INSERTs ao mesmo tempo
-- poderiam contar 4 cada um e passar juntos do limite.
create or replace function public.addresses_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 0));
  if (select count(*) from public.addresses where user_id = new.user_id) >= 5 then
    raise exception 'limite_de_enderecos' using errcode = '23514', detail = 'Máximo de 5 endereços por cliente.';
  end if;
  return new;
end;
$$;

comment on function public.addresses_limit() is 'Máximo de 5 endereços por cliente (só em INSERT).';
