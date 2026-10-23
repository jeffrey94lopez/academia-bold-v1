-- analytics_onboarding_funnel: embudo del recorrido guiado (onboarding.html).
--
-- Cuenta CORRIDAS distintas (payload->>'run_id'), no sesiones como el embudo
-- del curso: una corrida que se retoma otro día (onboarding_resume) abre otra
-- sesión del navegador pero sigue siendo el mismo intento, y contarla dos veces
-- inflaría "Empezó" y bajaría el % de los que terminan.
--
-- Etapas: onboarding_start -> onboarding_step_complete por paso (crear_item,
-- ver_items, venta, gasto, facturas, inventario) -> onboarding_complete.
-- Además, por paso: en cuál se saltaron (onboarding_skip) y en cuál abrieron
-- BolBot (onboarding_bot_open). Todo filtrado por created_at dentro del rango,
-- así que una corrida empezada antes del rango aporta a los pasos pero no a
-- "Empezó" (mismo criterio que analytics_course_funnel).
--
-- payload.step lo escribe el navegador del cliente: los desgloses por paso se
-- agrupan por el valor tal cual y el admin lo escapa al mostrarlo.
--
-- ORDEN: después de add_origin_bodi_conversations.sql (no depende de ella,
-- pero así quedan juntas las del recorrido). Ejecutar UNA sola vez en el SQL
-- Editor del proyecto Supabase (base compartida por sandbox y producción).
drop function if exists public.analytics_onboarding_funnel(timestamptz, timestamptz);
create or replace function public.analytics_onboarding_funnel(
  p_from timestamptz,
  p_to   timestamptz
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with o as (
    select event_type, payload->>'run_id' as run_id, payload->>'step' as step
    from analytics_events
    where created_at >= p_from and created_at <= p_to
      and event_type like 'onboarding\_%'
      and payload->>'run_id' is not null
  ),
  done as (
    select step, count(distinct run_id) as n
    from o where event_type = 'onboarding_step_complete' group by step
  )
  select jsonb_build_object(
    'started',   (select count(distinct run_id) from o where event_type = 'onboarding_start'),
    'steps',     jsonb_build_object(
      'crear_item', coalesce((select n from done where step = 'crear_item'), 0),
      'ver_items',  coalesce((select n from done where step = 'ver_items'),  0),
      'venta',      coalesce((select n from done where step = 'venta'),      0),
      'gasto',      coalesce((select n from done where step = 'gasto'),      0),
      'facturas',   coalesce((select n from done where step = 'facturas'),   0),
      'inventario', coalesce((select n from done where step = 'inventario'), 0)
    ),
    'completed', (select count(distinct run_id) from o where event_type = 'onboarding_complete'),
    'skipped_by_step', coalesce((
      select jsonb_object_agg(step, n) from (
        select step, count(distinct run_id) as n
        from o where event_type = 'onboarding_skip' and step is not null group by step
      ) s), '{}'::jsonb),
    'bot_by_step', coalesce((
      select jsonb_object_agg(step, n) from (
        select step, count(distinct run_id) as n
        from o where event_type = 'onboarding_bot_open' and step is not null group by step
      ) b), '{}'::jsonb)
  );
$$;

revoke execute on function public.analytics_onboarding_funnel(timestamptz, timestamptz) from public, anon;
grant  execute on function public.analytics_onboarding_funnel(timestamptz, timestamptz) to authenticated;

-- ── Verificación (como admin logueado, o en el SQL Editor) ──────────────────
-- Esperado: {"started": n, "steps": {...6 claves...}, "completed": n,
--            "skipped_by_step": {...}, "bot_by_step": {...}}
-- select public.analytics_onboarding_funnel(now() - interval '30 days', now());
