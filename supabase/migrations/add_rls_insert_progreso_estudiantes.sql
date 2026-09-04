-- Limpieza: quita la política de INSERT que este archivo creaba de más.
--
-- HISTORIA (queda escrita para que nadie repita el diagnóstico equivocado):
--
-- Síntoma: al pulsar "Comenzar el curso" el POST a progreso_estudiantes
-- devolvía 403 y el registro nunca se creaba:
--   42501 — new row violates row-level security policy for table "progreso_estudiantes"
--
-- Primera hipótesis, EQUIVOCADA: que faltara la política de INSERT para anon.
-- El mensaje apunta a eso, pero `anon_insert` (PERMISSIVE, INSERT, anon,
-- with check true) ya existía. Este archivo creaba una segunda política
-- idéntica, `anon_registra_estudiante`, que no arreglaba nada.
--
-- CAUSA REAL: la política de SELECT, no la de INSERT. PostgREST inserta con
-- RETURNING, y al devolver la fila Postgres aplica también las políticas de
-- SELECT. `anon_select_own` compara el id con el header x-student-id, y
-- registerStudent usaba el cliente pelado, que no lo mandaba. La fila entraba
-- pero no se podía devolver, y Postgres respondía 42501 hablando de "new row",
-- lo que hace pensar en el INSERT.
--
-- Se comprobó con dos transacciones revertidas, como rol anon:
--   insert ... ;                  -> pasa
--   insert ... returning id;      -> 42501
--   con set_config('request.headers', '{"x-student-id":"<id>"}') -> pasa
--
-- ARREGLO: va en el cliente, no en la base. js/course.js manda el header desde
-- el registro con el UUID que acaba de generar (studentClient(id) en
-- js/supabase.js). No hace falta ninguna política nueva.
--
-- Ejecutar en el SQL Editor del proyecto Supabase.

drop policy if exists "anon_registra_estudiante" on public.progreso_estudiantes;

-- ── Verificación ───────────────────────────────────────────────────────────
-- Deben quedar 4 políticas: anon_insert (INSERT), anon_select_own (SELECT),
-- auth_select_all (SELECT) y anon_update_own (UPDATE).
select policyname, permissive, cmd, roles
  from pg_policies
  where schemaname = 'public' and tablename = 'progreso_estudiantes'
  order by cmd, policyname;
