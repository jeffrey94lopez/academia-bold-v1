-- Verticales de producto: cada lección pertenece a una vertical
-- (retail / restaurantes) y una plataforma (web / mobile).
-- Reemplaza en el código a la columna "dispositivo", que queda deprecada
-- (no se borra hasta que el equipo termine de reclasificar).
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase,
-- ANTES de desplegar el frontend que usa estas columnas.
alter table public.lecciones
  add column if not exists vertical text not null default 'retail'
    check (vertical in ('retail', 'restaurantes')),
  add column if not exists plataforma text not null default 'web'
    check (plataforma in ('web', 'mobile'));

-- Backfill desde dispositivo: web→web; app y datafono→mobile.
-- Vertical: todo el contenido existente es de Retail.
update public.lecciones
  set plataforma = case dispositivo when 'web' then 'web' else 'mobile' end;

-- Control: debe devolver 0 filas
select id, titulo from public.lecciones
  where vertical is null or plataforma is null;
