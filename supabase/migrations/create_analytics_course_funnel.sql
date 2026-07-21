-- analytics_course_funnel: embudo del curso por sesiones distintas.
-- Etapas: entró al curso -> abrió una lección -> presentó examen -> aprobó ->
-- vio certificado. Todas cuentan session_id distintos dentro del rango, para
-- que las etapas sean comparables. Ejecutar UNA sola vez en el SQL Editor.
create or replace function public.analytics_course_funnel(
  p_from timestamptz,
  p_to   timestamptz
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select event_type, session_id, payload
    from analytics_events
    where created_at >= p_from and created_at <= p_to and session_id is not null
  )
  select jsonb_build_object(
    'entered',       (select count(distinct session_id) from c where event_type = 'mode_selected' and payload->>'mode' = 'course'),
    'opened_lesson', (select count(distinct session_id) from c where event_type = 'lesson_open'),
    'took_exam',     (select count(distinct session_id) from c where event_type in ('exam_pass','exam_fail')),
    'approved',      (select count(distinct session_id) from c where event_type = 'exam_pass'),
    'certificate',   (select count(distinct session_id) from c where event_type = 'certificate_view')
  );
$$;

revoke execute on function public.analytics_course_funnel(timestamptz, timestamptz) from public, anon;
grant  execute on function public.analytics_course_funnel(timestamptz, timestamptz) to authenticated;
