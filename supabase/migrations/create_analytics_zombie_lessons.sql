-- analytics_zombie_lessons: lecciones ACTIVAS con casi cero aperturas en el
-- rango [p_from, p_to] (candidatas a despublicar/refundir/promocionar). Cuenta
-- eventos 'lesson_open' por lesson_id (payload->>'lesson_id' = lecciones.id).
-- Left join para que una lección con 0 aperturas cuente 0 (no desaparezca).
-- security definer: corre con privilegios del owner y solo expone agregados.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
create or replace function public.analytics_zombie_lessons(
  p_from       timestamptz,
  p_to         timestamptz,
  p_max_visits int default 2
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'lesson_id', id, 'titulo', titulo, 'categoria', categoria, 'visits', visits
  ) order by visits asc, titulo), '[]'::jsonb)
  from (
    select l.id, l.titulo, l.categoria,
           count(e.id) as visits
    from lecciones l
    left join analytics_events e
      on e.event_type = 'lesson_open'
     and e.payload->>'lesson_id' = l.id::text
     and e.created_at >= p_from and e.created_at <= p_to
    where l.active = true
    group by l.id, l.titulo, l.categoria
  ) t
  where visits <= p_max_visits;
$$;

revoke execute on function public.analytics_zombie_lessons(timestamptz, timestamptz, int) from public, anon;
grant  execute on function public.analytics_zombie_lessons(timestamptz, timestamptz, int) to authenticated;
