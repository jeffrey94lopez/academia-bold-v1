-- Tercer valor de `vertical`: 'ambas', para el contenido que sirve a las dos
-- verticales (ej. "cómo proceso un pago"), y la columna `vertical` en las dos
-- tablas del centro de ayuda que no la tenían.
--
-- El DEFAULT 'ambas' es lo que hace esta migración segura: las FAQ y términos
-- que ya existen siguen visibles para todos los comercios. Nadie tiene que
-- reclasificar contenido antes del deploy; se marca después, ítem por ítem.
--
-- Las lecciones NO se tocan: siguen en retail/restaurantes y 'ambas' queda
-- disponible de aquí en adelante.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase, ANTES de
-- desplegar el frontend que usa estos valores.

-- Borra la CHECK que hoy limita `vertical` a dos valores, se llame como se
-- llame. Se busca por su definición y no por su nombre porque el nombre lo
-- puso Postgres: si adivináramos mal, el `drop ... if exists` no haría nada
-- y el `add constraint` de abajo tendría éxito con un nombre nuevo, dejando
-- viva la CHECK vieja. Esa falla es silenciosa: no hay error, solo que la
-- vieja CHECK rechazaría en silencio todo intento de insertar 'ambas'. Por
-- eso buscamos por definición y no por nombre. Avisa cuál borró.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'lecciones'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%vertical%'
  loop
    raise notice 'Borrando constraint %', c.conname;
    execute format('alter table public.lecciones drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.lecciones add constraint lecciones_vertical_check
  check (vertical in ('retail', 'restaurantes', 'ambas'));

alter table public.preguntas_frecuentes
  add column if not exists vertical text not null default 'ambas'
    check (vertical in ('retail', 'restaurantes', 'ambas'));

alter table public.glosario
  add column if not exists vertical text not null default 'ambas'
    check (vertical in ('retail', 'restaurantes', 'ambas'));

-- Supabase suele refrescar solo el caché de esquema de PostgREST tras un DDL,
-- pero si no lo hiciera, el frontend pediría la columna `vertical` y recibiría
-- un 404 confuso. Esta línea lo fuerza y no cuesta nada.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Control 1: las 3 columnas aceptan vertical. Debe listar exactamente 3 filas,
-- todas con 'ambas' en la definición. Una cuarta fila, o una fila sin 'ambas',
-- significa que quedó una constraint vieja de dos valores.
select rel.relname, pg_get_constraintdef(con.oid)
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname in ('lecciones', 'preguntas_frecuentes', 'glosario')
  and pg_get_constraintdef(con.oid) ilike '%vertical%';

-- Control 2 (informativo): conteo de filas y valores de `vertical` en las dos
-- nuevas columnas. La garantía de que no hay nulls viene del NOT NULL DEFAULT,
-- no de esta consulta. Útil para confirmar de un vistazo cuántos ítems hay.
select 'preguntas_frecuentes' as tabla, count(*) filter (where vertical is null) as nulos,
       count(*) filter (where vertical = 'ambas') as ambas, count(*) as total
from public.preguntas_frecuentes
union all
select 'glosario', count(*) filter (where vertical is null),
       count(*) filter (where vertical = 'ambas'), count(*)
from public.glosario;
