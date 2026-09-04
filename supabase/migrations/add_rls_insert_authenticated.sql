-- Falta la política de INSERT para el rol `authenticated` en dos tablas.
--
-- Síntoma: con sesión de admin abierta en el mismo navegador, el portal tiraba
-- 403 / 42501 "new row violates row-level security policy" al registrar un
-- estudiante y en CADA evento de telemetría. En ventana privada funcionaba.
--
-- Causa: el cliente manda el JWT del admin, así que PostgREST corre como
-- `authenticated` y no como `anon`. Las dos tablas solo tienen política de
-- INSERT para `anon` (`anon_insert`), y sin política aplicable RLS rechaza la
-- fila. `analytics_events` acumulaba 3781 filas de visitantes anónimos mientras
-- descartaba en silencio todo lo del equipo logueado.

drop policy if exists "auth_insert" on public.analytics_events;
create policy "auth_insert"
  on public.analytics_events
  for insert
  to authenticated
  with check (true);

drop policy if exists "auth_registra_estudiante" on public.progreso_estudiantes;
create policy "auth_registra_estudiante"
  on public.progreso_estudiantes
  for insert
  to authenticated
  with check (true);

-- ── Verificación ───────────────────────────────────────────────────────────
-- Cada tabla debe tener ahora INSERT para {anon} y para {authenticated}.
select tablename, policyname, cmd, roles
  from pg_policies
  where schemaname = 'public'
    and tablename in ('analytics_events', 'progreso_estudiantes')
  order by tablename, cmd, policyname;

-- ── OPCIONAL, leer antes de decidir ────────────────────────────────────────
-- Con lo de arriba, un admin logueado ya puede registrarse como estudiante,
-- pero su progreso NO se va a guardar: `anon_update_own` es solo para {anon} y
-- no hay UPDATE para {authenticated}. Y ese fallo es SILENCIOSO — un UPDATE sin
-- política aplicable no da error, simplemente afecta 0 filas, así que el aviso
-- de "no se guardó" que muestra js/course.js tampoco salta.
--
-- Descomentar SOLO si querés que el equipo pueda tomar el curso con la sesión
-- de admin abierta. Da permiso de modificar cualquier fila de progreso, en
-- línea con `auth_select_all`, que ya permite leerlas todas.
--
-- drop policy if exists "auth_update_estudiante" on public.progreso_estudiantes;
-- create policy "auth_update_estudiante"
--   on public.progreso_estudiantes
--   for update
--   to authenticated
--   using (true)
--   with check (true);
