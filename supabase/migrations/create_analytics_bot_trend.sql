-- analytics_bot_trend: serie mensual de los últimos p_months meses para el
-- Resumen ejecutivo. Por mes: conversaciones, % de resolución real y
-- sentimiento neto. Buckets de mes en zona de negocio (America/Tegucigalpa).
-- Ejecutar UNA sola vez en el SQL Editor.
drop function if exists public.analytics_bot_trend(int);
create or replace function public.analytics_bot_trend(
  p_months int default 6
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'month', to_char(m, 'YYYY-MM'),
    'conversations', c,
    'resolved_pct', rp,
    'sentiment_net', sn) order by m), '[]'::jsonb)
  from (
    select date_trunc('month', started_at at time zone 'America/Tegucigalpa') as m,
           count(*) as c,
           round(100.0 * count(*) filter (where eff = 'resuelta')
                 / nullif(count(*) filter (where eff in ('resuelta','no_resuelta')), 0)) as rp,
           round(100.0 * (count(*) filter (where sentiment = 'positivo')
                         - count(*) filter (where sentiment = 'negativo'))
                 / nullif(count(*), 0)) as sn
    from (
      select started_at, sentiment,
             coalesce(resolution_status,
               case when resolved is true then 'resuelta'
                    when resolved is false then 'no_resuelta' end) as eff
      from bodi_conversations
      where (started_at at time zone 'America/Tegucigalpa') >= date_trunc('month', now() at time zone 'America/Tegucigalpa') - make_interval(months => p_months - 1)
    ) s
    group by 1
  ) t;
$$;

revoke execute on function public.analytics_bot_trend(int) from public, anon;
grant  execute on function public.analytics_bot_trend(int) to authenticated;
