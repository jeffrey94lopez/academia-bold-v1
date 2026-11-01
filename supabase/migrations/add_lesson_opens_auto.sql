-- Separa las aperturas de leccion AUTOMATICAS de las voluntarias.
--
-- Hasta el 2026-11-01 el portal abria una leccion sola al entrar (la primera
-- del primer grupo), y eso disparaba un `lesson_open` por visita. El historico
-- de 30 dias mezcla esas con las que alguien abrio a proposito, y el Inicio
-- del admin las contaba todas juntas: decia 1091 donde lo voluntario era una
-- fraccion.
--
-- Como se separan sin adivinar: el `lesson_open` automatico salia en el MISMO
-- punto del codigo que el `page_view` (js/lessons.js), uno por visita. Asi que
-- las automaticas que quedan en la ventana son, exactamente, las visitas
-- anteriores al despliegue del arreglo.
--
-- La correccion se expira sola: pasados 30 dias del 2026-11-01 no quedan
-- visitas anteriores en la ventana, el conteo da 0 y la resta deja de hacer
-- nada.
--
-- Idempotente (create or replace). Las demas claves quedan igual.
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
      'cert_prints',       (select count(*) from cur  where event_type = 'certificate_print'),
      -- Total de aperturas, sin tope. `top_lessons` corta en 10, asi que
      -- sumarlo para saber cuantas lecciones se abrieron deja afuera la cola.
      'lesson_opens',      (select count(*) from cur  where event_type = 'lesson_open'),
      -- Aperturas AUTOMATICAS que quedaron en el historico. Hasta el
      -- 2026-11-01 el portal abria una leccion sola al entrar, y el
      -- `lesson_open` salia en el mismo punto del codigo que el `page_view`:
      -- una por visita, exactamente. Entonces las automaticas dentro de la
      -- ventana son las visitas anteriores al despliegue.
      --
      -- Esto se expira SOLO: cuando la ventana deje atras el 2026-11-01 el
      -- conteo da 0 y la resta deja de hacer nada. No hay que acordarse de
      -- quitarlo, pero tampoco molesta si queda.
      'lesson_opens_auto', (
        select count(*) from cur
         where event_type = 'page_view'
           and created_at < '2026-11-01T07:30:00Z'::timestamptz)
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
