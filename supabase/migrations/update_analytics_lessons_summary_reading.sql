-- Re-define analytics_lessons_summary añadiendo la clave 'reading' (telemetría
-- de lectura, evento lesson_read: reads, completes y % de completado por
-- lección). Idempotente (create or replace); las demás claves quedan igual, así
-- que no rompe a los consumidores (② y el Resumen ejecutivo).
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
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
        select date_trunc('day', created_at)::date as d, count(*) as c
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
