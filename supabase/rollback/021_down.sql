-- Reversão da 021: remove o controle de cota do Google (contadores, registro de chamadas e avisos).
drop function if exists public.google_consolidate();
drop function if exists public.google_reserve(text, integer, integer);
drop function if exists public.google_alert(text, date, int, int);
drop function if exists public.google_period_start(timestamptz);
drop table if exists public.google_api_alerts;
drop table if exists public.google_api_calls;
drop table if exists public.google_api_usage;
