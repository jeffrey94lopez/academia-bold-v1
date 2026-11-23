-- Indicador de topes de la IA del conversor (pestaña Herramientas del admin).
-- Requiere create_inventario_ia.sql y update_inventario_ia_reserva.sql aplicadas antes.
--
-- APLICAR A MANO en el SQL Editor del proyecto Supabase (es idempotente).
-- Solo LEE: no escribe nada ni toca inventario_ia_uso ni app_settings.
--
-- analytics_herramientas_ia_topes(p_env) devuelve cuánto de los topes de las últimas 24 h
-- (ventana móvil, no depende del selector de período) se ha usado:
--   usadas_24h   filas de inventario_ia_uso del env con cache_hit = false y creado > now() - 24 h
--                (los hits de caché y los null no cuentan, igual que el trigger de reserva).
--   tope_diario  app_settings inventario_ia_tope_diario (mezcla prod + env: la fila del env
--                pisa, como mergeSettings en js/env.js). Entero de 1 a 9 dígitos; si falta o
--                no es válido, 500.
--   ip_max_24h   el mayor conteo de una sola ip_hash no nula en esa misma ventana (0 si no hay).
--   tope_ip      app_settings inventario_ia_tope_ip, misma mezcla y validación; fallback 30.
--   ia_activa    true solo si inventario_ia_activa (mezclada) es el texto 'true'; ausente = false.
-- Un p_env distinto de 'prod'/'sandbox' no tiene filas de uso: devuelve ceros.
--
-- security definer + grants solo a authenticated (igual que analytics_herramientas_ia);
-- anon no puede llamarla. Devuelve solo agregados, nunca ip_hash.

create or replace function public.analytics_herramientas_ia_topes(
  p_env text default 'prod'
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  cfg as (
    select
      btrim(coalesce(
        (select value from app_settings where key = 'inventario_ia_tope_diario' and env = p_env),
        (select value from app_settings where key = 'inventario_ia_tope_diario' and env = 'prod'),
        '')) as diario,
      btrim(coalesce(
        (select value from app_settings where key = 'inventario_ia_tope_ip' and env = p_env),
        (select value from app_settings where key = 'inventario_ia_tope_ip' and env = 'prod'),
        '')) as ip,
      btrim(coalesce(
        (select value from app_settings where key = 'inventario_ia_activa' and env = p_env),
        (select value from app_settings where key = 'inventario_ia_activa' and env = 'prod'),
        '')) as activa
  ),
  ventana as (
    select ip_hash
      from inventario_ia_uso
     where env = p_env
       and cache_hit = false
       and creado > now() - interval '24 hours'
  ),
  por_ip as (
    select count(*) as n from ventana where ip_hash is not null group by ip_hash
  )
  select jsonb_build_object(
    'usadas_24h',  (select count(*) from ventana),
    'tope_diario', case when c.diario ~ '^[0-9]{1,9}$' then c.diario::int else 500 end,
    'ip_max_24h',  coalesce((select max(n) from por_ip), 0),
    'tope_ip',     case when c.ip ~ '^[0-9]{1,9}$' then c.ip::int else 30 end,
    'ia_activa',   c.activa = 'true'
  )
  from cfg c;
$$;

revoke execute on function public.analytics_herramientas_ia_topes(text) from public, anon;
grant  execute on function public.analytics_herramientas_ia_topes(text) to authenticated;

-- ── Verificación ───────────────────────────────────────────────────────────
-- select public.analytics_herramientas_ia_topes('sandbox');
-- Sin uso: usadas_24h 0, ip_max_24h 0, topes 500 / 30 (o los configurados).
