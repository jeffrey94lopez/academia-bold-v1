-- Agrega el campo "dispositivo" a las lecciones para las futuras pestañas
-- Web / App / Datáfono del portal. Todas las lecciones existentes quedan en
-- 'web' por defecto; el equipo las reclasifica después desde el admin.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
alter table public.lecciones
  add column if not exists dispositivo text not null default 'web'
  check (dispositivo in ('web', 'app', 'datafono'));
