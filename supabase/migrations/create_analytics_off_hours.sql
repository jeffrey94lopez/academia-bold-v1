-- Métricas de "fuera de horario" (8am–5pm = horario laboral; fuera = hora local
-- < 8 o >= 17, en America/Tegucigalpa). Devuelve el % de conversaciones que
-- entran fuera de horario Y, de ESAS, cuántas se resolvieron.
-- La resolución usa resolution_status con fallback al booleano 'resolved'.
-- Ejecutar UNA vez en el SQL Editor del proyecto Supabase.
drop function if exists public.analytics_off_hours(timestamptz, timestamptz);
create or replace function public.analytics_off_hours(
  p_from timestamptz,
  p_to   timestamptz
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with res as (
    select
      extract(hour from started_at at time zone 'America/Tegucigalpa')::int as h,
      coalesce(resolution_status,
        case when resolved is true then 'resuelta'
             when resolved is false then 'no_resuelta' end) as eff
    from bodi_conversations
    where started_at >= p_from and started_at <= p_to
  )
  select jsonb_build_object(
    'total', (select count(*) from res),
    'off',   (select count(*) from res where h < 8 or h >= 17),
    'off_pct', (
      select round(100.0 * count(*) filter (where h < 8 or h >= 17) / nullif(count(*), 0))
      from res
    ),
    'off_resolved',   (select count(*) from res where (h < 8 or h >= 17) and eff = 'resuelta'),
    'off_unresolved', (select count(*) from res where (h < 8 or h >= 17) and eff = 'no_resuelta'),
    'off_resolved_pct', (
      select round(100.0 * count(*) filter (where (h < 8 or h >= 17) and eff = 'resuelta')
             / nullif(count(*) filter (where (h < 8 or h >= 17) and eff in ('resuelta','no_resuelta')), 0))
      from res
    )
  );
$$;
revoke execute on function public.analytics_off_hours(timestamptz, timestamptz) from public, anon;
grant  execute on function public.analytics_off_hours(timestamptz, timestamptz) to authenticated;
