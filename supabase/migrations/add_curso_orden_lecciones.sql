-- Orden propio de la pestaña Curso.
-- La columna `orden` es relativa a la categoría (hay varias lecciones con
-- orden = 1 en categorías distintas), así que el curso quedaba en un orden
-- arbitrario. `curso_orden` le da al curso su propia secuencia sin mover el
-- listado del portal, que sigue usando `orden`.
--
-- Nullable a propósito: una lección sin curso_orden va al final del curso
-- (ver js/course-order.js). Esto también hace que el frontend se pueda
-- desplegar ANTES de correr esta migración sin cambiar de comportamiento.
alter table public.lecciones
  add column if not exists curso_orden smallint;

comment on column public.lecciones.curso_orden is
  'Posición de la lección en la pestaña Curso. NULL = va al final. Independiente de "orden", que ordena el listado del portal dentro de cada categoría.';

-- Control: la columna debe existir y ser nullable
select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'lecciones' and column_name = 'curso_orden';
