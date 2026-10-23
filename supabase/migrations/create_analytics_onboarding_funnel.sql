-- analytics_onboarding_funnel: embudo del recorrido guiado (onboarding.html).
--
-- Cuenta CORRIDAS distintas (payload->>'run_id'), no sesiones como el embudo
-- del curso: una corrida que se retoma otro día (onboarding_resume) abre otra
-- sesión del navegador pero sigue siendo el mismo intento, y contarla dos veces
-- inflaría "Empezó" y bajaría el % de los que terminan.
--
-- Etapas: onboarding_start -> onboarding_step_complete por paso (crear_item,
-- ver_items, venta, gasto, facturas, inventario) -> onboarding_complete.
-- Además, por paso: en cuál se saltaron (onboarding_skip), en cuál abrieron
-- BolBot con el botón (onboarding_bot_open) y en cuál le escribieron
-- (onboarding_bot_message). En pantallas anchas el bot arranca abierto, así
-- que "lo abrió" casi no dice nada; "le escribió" es la métrica que se muestra.
--
-- COHORTE: todo se cuenta sobre las corridas cuyo onboarding_start cae en el
-- rango. Sus eventos posteriores cuentan aunque pasen de p_to (quien empezó el
-- último día del rango y terminó al día siguiente sí terminó). Así ninguna
-- etapa pasa del 100% de "Empezó": antes, una corrida empezada antes del rango
-- aportaba a los pasos y no a "Empezó".
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
  with cohorte as (
    select distinct payload->>'run_id' as run_id
    from analytics_events
    where event_type = 'onboarding_start'
      and created_at >= p_from and created_at <= p_to
      and payload->>'run_id' is not null
  ),
  o as (
    -- Sin tope superior a propósito (ver COHORTE). El >= p_from solo acota la
    -- búsqueda: ningún evento de la corrida es anterior a su inicio.
    select e.event_type, e.payload->>'run_id' as run_id, e.payload->>'step' as step
    from analytics_events e
    join cohorte c on c.run_id = e.payload->>'run_id'
    where e.created_at >= p_from
      and e.event_type like 'onboarding\_%'
  ),
  done as (
    select step, count(distinct run_id) as n
    from o where event_type = 'onboarding_step_complete' group by step
  )
  select jsonb_build_object(
    'started',   (select count(*) from cohorte),
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
      ) b), '{}'::jsonb),
    'bot_message_by_step', coalesce((
      select jsonb_object_agg(step, n) from (
        select step, count(distinct run_id) as n
        from o where event_type = 'onboarding_bot_message' and step is not null group by step
      ) m), '{}'::jsonb)
  );
$$;

revoke execute on function public.analytics_onboarding_funnel(timestamptz, timestamptz) from public, anon;
grant  execute on function public.analytics_onboarding_funnel(timestamptz, timestamptz) to authenticated;

-- ── Verificación (como admin logueado, o en el SQL Editor) ──────────────────
-- Esperado: {"started": n, "steps": {...6 claves...}, "completed": n,
--            "skipped_by_step": {...}, "bot_by_step": {...},
--            "bot_message_by_step": {...}}
-- select public.analytics_onboarding_funnel(now() - interval '30 days', now());
