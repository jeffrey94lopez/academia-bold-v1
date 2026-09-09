-- Horario de negocio: zona América/Bogotá (UTC-5) y atención Lun–Vie 8am–5pm,
-- Sáb 8am–12m, Dom cerrado. Antes el heatmap agrupaba en America/Tegucigalpa
-- (UTC-6, una hora menos) y "fuera de horario" era [8,17) todos los días,
-- así que sábado tarde y domingo entero contaban como horario laboral.
--
-- Reemplaza las cuatro funciones que agrupan por tiempo local:
--   · analytics_bot_summary      (zona del heatmap)
--   · analytics_off_hours        (zona + horario por día)
--   · analytics_bot_trend        (zona de los buckets de mes)
--   · analytics_lessons_summary  (zona de visits_by_day, que había quedado en UTC)
-- Salvo esos cambios de zona/horario, cada cuerpo es idéntico a su última
-- versión (lifecycle / reading).
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

-- ---------------------------------------------------------------- bot_summary
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
      bot_no_info,
      coalesce(category, topic, 'Sin categoría') as cat,
      coalesce(
        resolution_status,
        case when resolved is true then 'resuelta'
             when resolved is false then 'no_resuelta' end
      ) as eff_status,
      case when support_redirected   then 'escalada'
           when status = 'completed' then 'cerrada_cliente'
           when status = 'abandoned' then 'abandonada'
           else 'en_curso' end as lifecycle,
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
      'resolved_without_support_pct', (
        select round(100.0 * count(*) filter (where not coalesce(support_redirected, false))
                      / nullif(count(*), 0))
        from res
      ),
      'lifecycle', jsonb_build_object(
        'cerrada_cliente', (select count(*) from res where lifecycle = 'cerrada_cliente'),
        'abandonada',      (select count(*) from res where lifecycle = 'abandonada'),
        'escalada',        (select count(*) from res where lifecycle = 'escalada'),
        'en_curso',        (select count(*) from res where lifecycle = 'en_curso')
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
        'no_info', ni, 'dominant_sentiment', dom) order by c desc), '[]'::jsonb)
      from (
        select cat,
               count(*) as c,
               round(100.0 * count(*) filter (where eff_status = 'resuelta')
                     / nullif(count(*) filter (where eff_status in ('resuelta','no_resuelta')), 0)) as rp,
               round(100.0 * count(*) filter (where sentiment = 'negativo') / nullif(count(*), 0)) as np,
               round(100.0 * count(*) filter (where support_redirected) / nullif(count(*), 0)) as sp,
               count(*) filter (where bot_no_info) as ni,
               mode() within group (order by coalesce(sentiment, 'neutro')) as dom
        from res group by cat
      ) t
    ),
    'heatmap', (
      select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'hour', hr, 'count', c) order by dow, hr), '[]'::jsonb)
      from (
        select extract(dow from started_at at time zone 'America/Bogota')::int as dow,
               extract(hour from started_at at time zone 'America/Bogota')::int as hr,
               count(*) as c
        from res group by 1, 2
      ) t
    )
  );
$$;

revoke execute on function public.analytics_bot_summary(timestamptz, timestamptz) from public, anon;
grant  execute on function public.analytics_bot_summary(timestamptz, timestamptz) to authenticated;

-- ----------------------------------------------------------------- off_hours
-- "Fuera de horario" = domingo entero, o una hora fuera de la ventana del día
-- (Lun–Vie [8,17), Sáb [8,12)) en hora de Bogotá.
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
      extract(dow  from started_at at time zone 'America/Bogota')::int as d,
      extract(hour from started_at at time zone 'America/Bogota')::int as h,
      coalesce(resolution_status,
        case when resolved is true then 'resuelta'
             when resolved is false then 'no_resuelta' end) as eff
    from bodi_conversations
    where started_at >= p_from and started_at <= p_to
  ),
  flagged as (
    select eff,
           case when d between 1 and 5 then (h < 8 or h >= 17)
                when d = 6            then (h < 8 or h >= 12)
                else true end as off
    from res
  )
  select jsonb_build_object(
    'total', (select count(*) from flagged),
    'off',   (select count(*) from flagged where off),
    'off_pct', (
      select round(100.0 * count(*) filter (where off) / nullif(count(*), 0))
      from flagged
    ),
    'off_resolved',   (select count(*) from flagged where off and eff = 'resuelta'),
    'off_unresolved', (select count(*) from flagged where off and eff = 'no_resuelta'),
    'off_resolved_pct', (
      select round(100.0 * count(*) filter (where off and eff = 'resuelta')
             / nullif(count(*) filter (where off and eff in ('resuelta','no_resuelta')), 0))
      from flagged
    )
  );
$$;
revoke execute on function public.analytics_off_hours(timestamptz, timestamptz) from public, anon;
grant  execute on function public.analytics_off_hours(timestamptz, timestamptz) to authenticated;

-- ----------------------------------------------------------------- bot_trend
-- Buckets de mes en hora de Bogotá (antes Tegucigalpa: una conversación de las
-- 11pm del último día del mes caía en el mes siguiente).
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
    select date_trunc('month', started_at at time zone 'America/Bogota') as m,
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
      where (started_at at time zone 'America/Bogota') >= date_trunc('month', now() at time zone 'America/Bogota') - make_interval(months => p_months - 1)
    ) s
    group by 1
  ) t;
$$;

revoke execute on function public.analytics_bot_trend(int) from public, anon;
grant  execute on function public.analytics_bot_trend(int) to authenticated;

-- ----------------------------------------------------------- lessons_summary
-- Igual que update_analytics_lessons_summary_reading.sql salvo visits_by_day:
-- esa versión perdió el 'at time zone', así que los días se estaban cortando en
-- UTC (una visita de las 7pm de Bogotá contaba en el día siguiente). Vuelve a
-- cortar en hora de negocio, ahora Bogotá.
create or replace function public.analytics_lessons_summary(
  p_from      timestamptz,
  p_to        timestamptz,
  p_prev_from timestamptz,
  p_prev_to   timestamptz
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with cur as (
    select event_type, payload, session_id, created_at
    from analytics_events
    where created_at >= p_from and created_at <= p_to
  ),
  prev as (
    select event_type, payload
    from analytics_events
    where created_at >= p_prev_from and created_at <= p_prev_to
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'visits',            (select count(*) from cur  where event_type = 'page_view'),
      'prev_visits',       (select count(*) from prev where event_type = 'page_view'),
      'new_students',      (select count(*) from cur  where event_type = 'mode_selected' and payload->>'mode' = 'course'),
      'prev_new_students', (select count(*) from prev where event_type = 'mode_selected' and payload->>'mode' = 'course'),
      'passes',            (select count(*) from cur  where event_type = 'exam_pass'),
      'avg_score',         (select round(avg((payload->>'score')::numeric)) from cur where event_type = 'exam_pass'),
      'cert_views',        (select count(*) from cur  where event_type = 'certificate_view'),
      'cert_prints',       (select count(*) from cur  where event_type = 'certificate_print')
    ),
    'visits_by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d, 'count', c) order by d), '[]'::jsonb)
      from (
        select date_trunc('day', created_at at time zone 'America/Bogota')::date as d, count(*) as c
        from cur where event_type = 'page_view' group by 1
      ) t
    ),
    'entry_mode', jsonb_build_object(
      'course',  (select count(*) from cur where event_type = 'mode_selected' and payload->>'mode' = 'course'),
      'explore', (select count(*) from cur where event_type = 'mode_selected' and payload->>'mode' = 'explore')
    ),
    'top_lessons', (
      select coalesce(jsonb_agg(jsonb_build_object('lesson', lesson, 'count', c) order by c desc), '[]'::jsonb)
      from (
        select coalesce(payload->>'lesson_title', payload->>'lesson_id') as lesson, count(*) as c
        from cur where event_type = 'lesson_open'
        group by 1 order by c desc limit 10
      ) t
    ),
    'searches', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'term', term, 'count', c, 'avg_results', avg_r, 'zero_count', zc, 'last_at', last_at) order by c desc), '[]'::jsonb)
      from (
        select lower(trim(payload->>'term')) as term,
               count(*) as c,
               round(avg((payload->>'results_count')::numeric), 1) as avg_r,
               count(*) filter (where (payload->>'results_count')::int = 0) as zc,
               max(created_at) as last_at
        from cur
        where event_type = 'lesson_search' and coalesce(trim(payload->>'term'), '') <> ''
        group by 1
      ) t
    ),
    'exams', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'lesson', lesson, 'passes', passes, 'fails', fails, 'total', passes + fails,
        'pass_pct', round(100.0 * passes / nullif(passes + fails, 0)),
        'avg_score', avg_score) order by (passes + fails) desc), '[]'::jsonb)
      from (
        select coalesce(payload->>'lesson_title', payload->>'lesson_id') as lesson,
               count(*) filter (where event_type = 'exam_pass') as passes,
               count(*) filter (where event_type = 'exam_fail') as fails,
               round(avg((payload->>'score')::numeric) filter (where event_type = 'exam_pass')) as avg_score
        from cur where event_type in ('exam_pass', 'exam_fail')
        group by 1
      ) t
    ),
    'reading', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'lesson', lesson, 'reads', reads, 'completes', completes,
        'completion_pct', round(100.0 * completes / nullif(reads, 0))) order by reads desc), '[]'::jsonb)
      from (
        select coalesce(payload->>'lesson_title', payload->>'lesson_id') as lesson,
               count(*) as reads,
               count(*) filter (where (payload->>'completed')::boolean) as completes
        from cur where event_type = 'lesson_read'
        group by 1
      ) t
    )
  );
$$;

revoke execute on function public.analytics_lessons_summary(timestamptz, timestamptz, timestamptz, timestamptz) from public, anon;
grant  execute on function public.analytics_lessons_summary(timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;
