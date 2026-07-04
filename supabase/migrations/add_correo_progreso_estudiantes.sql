-- Agrega el correo al registro de estudiantes del Curso (pestaña nueva).
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
alter table public.progreso_estudiantes
  add column if not exists correo text;
