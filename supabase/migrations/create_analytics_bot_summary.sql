-- analytics_bot_summary: agrega en el servidor los KPIs y cortes de la vista
-- BolBot para un rango [p_from, p_to]. La resolución usa resolution_status
-- (3 estados) con fallback al booleano legacy 'resolved'; la categoría usa
-- 'category' con fallback al 'topic' libre. Devuelve un único jsonb.
-- El heatmap agrupa hora/día-de-semana en zona de negocio (America/Tegucigalpa)
-- para coincidir con el dashboard actual (hora local, no UTC).
-- grant a 'authenticated': hoy solo el admin se autentica vía Supabase Auth; si
-- en el futuro los estudiantes pasan a auth real (Anon Auth+RLS), revisar estos
-- grants para que estas RPCs de agregación no queden expuestas a cualquier logueado.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
drop function if exists public.analytics_bot_summary(timestamptz, timestamptz);
create or replace function public.analytics_bot_summary(
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
      support_redirected,
      sentiment,
      status,
      coalesce(category, topic, 'Sin categoría') as cat,
      coalesce(
        resolution_status,
        case when resolved is true then 'resuelta'
             when resolved is false then 'no_resuelta' end
      ) as eff_status,
      started_at
    from bodi_conversations
    where started_at >= p_from and started_at <= p_to
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'total',       (select count(*) from res),
      'resolved',    (select count(*) from res where eff_status = 'resuelta'),
      'unresolved',  (select count(*) from res where eff_status = 'no_resuelta'),
      'ambiguous',   (select count(*) from res where eff_status = 'ambigua'),
      'resolved_pct', (
        select round(100.0 * count(*) filter (where eff_status = 'resuelta')
                      / nullif(count(*) filter (where eff_status in ('resuelta','no_resuelta')), 0))
        from res
      ),
      'abandoned',   (select count(*) from res where status = 'abandoned'),
      'support',     (select count(*) from res where support_redirected),
      -- % de conversaciones que NO escalaron a soporte (resueltas por el bot
      -- sin intervención humana), sobre el total. Es el reverso de support/total.
      'resolved_without_support_pct', (
        select round(100.0 * count(*) filter (where not coalesce(support_redirected, false))
                      / nullif(count(*), 0))
        from res
      ),
      'sentiment_net', (
        select round(100.0 * (count(*) filter (where sentiment = 'positivo')
                              - count(*) filter (where sentiment = 'negativo'))
                      / nullif(count(*), 0))
        from res
      ),
      'sentiment', jsonb_build_object(
        'positivo', (select count(*) from res where sentiment = 'positivo'),
        'neutro',   (select count(*) from res where sentiment = 'neutro' or sentiment is null),
        'negativo', (select count(*) from res where sentiment = 'negativo')
      )
    ),
    'by_category', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'category', cat, 'total', c,
        'resolved_pct', rp, 'negative_pct', np, 'support_pct', sp,
        'dominant_sentiment', dom) order by c desc), '[]'::jsonb)
      from (
        select cat,
               count(*) as c,
               round(100.0 * count(*) filter (where eff_status = 'resuelta')
                     / nullif(count(*) filter (where eff_status in ('resuelta','no_resuelta')), 0)) as rp,
               round(100.0 * count(*) filter (where sentiment = 'negativo') / nullif(count(*), 0)) as np,
               round(100.0 * count(*) filter (where support_redirected) / nullif(count(*), 0)) as sp,
               mode() within group (order by coalesce(sentiment, 'neutro')) as dom
        from res group by cat
      ) t
    ),
    'heatmap', (
      select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'hour', hr, 'count', c) order by dow, hr), '[]'::jsonb)
      from (
        select extract(dow from started_at at time zone 'America/Tegucigalpa')::int as dow,
               extract(hour from started_at at time zone 'America/Tegucigalpa')::int as hr,
               count(*) as c
        from res group by 1, 2
      ) t
    )
  );
$$;

revoke execute on function public.analytics_bot_summary(timestamptz, timestamptz) from public, anon;
grant  execute on function public.analytics_bot_summary(timestamptz, timestamptz) to authenticated;
