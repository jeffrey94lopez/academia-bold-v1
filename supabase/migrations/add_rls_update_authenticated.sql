-- Falta la política de UPDATE para `authenticated` en progreso_estudiantes.
--
-- Esto ya causó pérdida de datos: un estudiante aprobó 4 lecciones con la
-- sesión de admin abierta en el mismo navegador y no se guardó ninguna. En el
-- admin las dos filas de ese estudiante quedaron con `progreso: {}`.
--
-- Causa: con sesión de admin el cliente manda el JWT, así que PostgREST corre
-- como `authenticated`. `anon_update_own` es solo para {anon} y no existe
-- ninguna política de UPDATE para {authenticated}, así que Postgres no ve la
-- fila, el UPDATE afecta CERO filas y —esto es lo grave— NO devuelve error.
-- El código no tenía forma de notarlo y la pantalla felicitaba al estudiante.
--
-- El lado de código ya está arreglado: los UPDATE piden las filas de vuelta con
-- .select() y tratan la ausencia como fallo (js/course.js, sinFilasEsFallo), así
-- que de ahora en más el estudiante vería "Aprobaste, pero no se guardó
-- (rls_0_filas)" en lugar de perder el trabajo en silencio. Esta política es la
-- otra mitad: que el guardado efectivamente ocurra.
--
-- `using (true)` da permiso de modificar cualquier fila de progreso a cualquier
-- usuario autenticado. Es coherente con `auth_select_all`, que ya permite
-- leerlas todas, y los únicos usuarios autenticados son el equipo del admin.
--
-- Ejecutar en el SQL Editor del proyecto Supabase.

drop policy if exists "auth_update_estudiante" on public.progreso_estudiantes;
create policy "auth_update_estudiante"
  on public.progreso_estudiantes
  for update
  to authenticated
  using (true)
  with check (true);

-- ── Verificación ───────────────────────────────────────────────────────────
-- progreso_estudiantes debe quedar con: INSERT para {anon} y {authenticated},
-- SELECT para {anon} (propia) y {authenticated} (todas), UPDATE para {anon}
-- (propia) y {authenticated} (todas).
select policyname, permissive, cmd, roles
  from pg_policies
  where schemaname = 'public' and tablename = 'progreso_estudiantes'
  order by cmd, policyname;
