-- Integridad del contenido de las lecciones: formato garantizado + historial.
--
-- Cierra la clase de bug documentada en las tres "puertas" de 2026-07-25/27:
-- código que leía `lecciones.contenido` asumiendo un formato, no lo encontraba,
-- y escribía un default vacío encima. El código ya está arreglado; esto pone la
-- garantía en la base, donde ningún bug futuro la puede saltear.
--
-- Se descartó migrar la columna a jsonb: al 2026-07-27 las 32 lecciones ya
-- están en JSON válido de array (0 legacy), así que el ALTER no arreglaría
-- ningún dato — solo obligaría a reescribir los helpers que operan sobre el
-- string crudo. Ver docs/superpowers/specs/2026-07-27-integridad-contenido-lecciones-design.md
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
-- El archivo es re-ejecutable: un segundo intento no falla a mitad.

-- ---------------------------------------------------------------------------
-- 1. El predicado del CHECK.
--
-- Con `check (jsonb_typeof(contenido::jsonb) = 'array')` a secas, escribir HTML
-- crudo revienta el cast con "invalid input syntax for type json": rechaza, sí,
-- pero con un error que no dice qué regla se rompió. Esta función atrapa el
-- error y devuelve false, así el rechazo llega siempre como violación del
-- constraint, con su nombre.
--
-- IMMUTABLE porque un CHECK lo exige. NULL se acepta: una lección sin contenido
-- es legítima (hoy no hay ninguna).
-- ---------------------------------------------------------------------------
create or replace function public.es_array_json(t text) returns boolean
language plpgsql
immutable
as $$
begin
  if t is null then
    return true;
  end if;
  return jsonb_typeof(t::jsonb) = 'array';
exception when others then
  return false;
end $$;

-- ---------------------------------------------------------------------------
-- 2. El constraint. Valida las filas actuales al crearse: si alguna no pasa,
--    el ALTER falla ruidosamente y hay que revisar ESA fila antes de seguir.
--
--    OJO con lo que este CHECK no previene: '[]' es un array válido, y '[]' es
--    exactamente lo que escribía el bug de la puerta 2. Acá se cierra la puerta
--    del FORMATO; la del VACIADO la cubre el historial de más abajo.
-- ---------------------------------------------------------------------------
alter table public.lecciones
  drop constraint if exists lecciones_contenido_es_array;

alter table public.lecciones
  add constraint lecciones_contenido_es_array
  check (public.es_array_json(contenido));

-- ---------------------------------------------------------------------------
-- 3. Historial del contenido. No bloquea nada: hace recuperable cualquier
--    pérdida, venga de un bug, de un guardado en falso o de un borrado a mano.
--
--    Se eligió historial en vez de un trigger que prohíba vaciar porque ese
--    trigger también impediría vaciar una lección a propósito (desde SQL no hay
--    forma de distinguir intención) y convertiría un bug futuro en un error
--    opaco al guardar.
-- ---------------------------------------------------------------------------
create table if not exists public.lecciones_contenido_historial (
  id                  bigserial primary key,
  leccion_id          uuid        not null,
  operacion           text        not null,
  contenido_anterior  text,
  contenido_nuevo     text,
  chars_anterior      int,
  chars_nuevo         int,
  cambiado_en         timestamptz not null default now(),
  cambiado_por        uuid
);

-- Sin FK a lecciones a propósito: el historial tiene que sobrevivir al borrado
-- de la lección, que es justo el caso en que sirve.
create index if not exists idx_lecciones_contenido_historial_leccion
  on public.lecciones_contenido_historial (leccion_id, cambiado_en desc);

alter table public.lecciones_contenido_historial enable row level security;

-- El contenido no es secreto (se publica en el portal), pero no hay razón para
-- exponer el historial a la anon key.
drop policy if exists lecciones_contenido_historial_select_auth
  on public.lecciones_contenido_historial;

create policy lecciones_contenido_historial_select_auth
  on public.lecciones_contenido_historial
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 4. El trigger. SECURITY DEFINER para poder insertar sin depender de una
--    policy de escritura sobre el historial.
--
--    Solo registra cuando `contenido` cambió de verdad: editar el título no
--    deja filas.
-- ---------------------------------------------------------------------------
create or replace function public.registrar_cambio_contenido() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into lecciones_contenido_historial
      (leccion_id, operacion, contenido_anterior, contenido_nuevo,
       chars_anterior, chars_nuevo, cambiado_por)
    values
      (old.id, 'delete', old.contenido, null,
       length(coalesce(old.contenido, '')), 0, auth.uid());
    return old;
  end if;

  if new.contenido is distinct from old.contenido then
    insert into lecciones_contenido_historial
      (leccion_id, operacion, contenido_anterior, contenido_nuevo,
       chars_anterior, chars_nuevo, cambiado_por)
    values
      (new.id, 'update', old.contenido, new.contenido,
       length(coalesce(old.contenido, '')), length(coalesce(new.contenido, '')),
       auth.uid());
  end if;

  return new;
end $$;

drop trigger if exists trg_lecciones_historial_contenido on public.lecciones;

create trigger trg_lecciones_historial_contenido
  after update or delete on public.lecciones
  for each row execute function public.registrar_cambio_contenido();

-- ---------------------------------------------------------------------------
-- 5. La alarma: cambios donde el contenido pasó de tener bloques a estar vacío.
--    2 es el largo de '[]'.
--
--    security_invoker = on para que la vista respete la RLS de la tabla base en
--    vez de correr con los permisos del owner.
-- ---------------------------------------------------------------------------
drop view if exists public.lecciones_vaciadas;

create view public.lecciones_vaciadas
with (security_invoker = on) as
select h.id,
       h.leccion_id,
       l.titulo,
       h.operacion,
       h.chars_anterior,
       h.chars_nuevo,
       h.cambiado_en,
       h.cambiado_por
  from public.lecciones_contenido_historial h
  left join public.lecciones l on l.id = h.leccion_id
 where coalesce(h.chars_anterior, 0) > 2
   and coalesce(h.chars_nuevo, 0) <= 2
 order by h.cambiado_en desc;

-- ---------------------------------------------------------------------------
-- 6. CÓMO RECUPERAR una lección vaciada (copiar, cambiar el UUID y ejecutar).
--
--    Primero mirar qué hay guardado:
--
--      select id, operacion, chars_anterior, chars_nuevo, cambiado_en
--        from lecciones_contenido_historial
--       where leccion_id = '00000000-0000-0000-0000-000000000000'
--       order by cambiado_en desc;
--
--    Restaurar la última versión NO vacía:
--
--      update lecciones l
--         set contenido = h.contenido_anterior
--        from (select contenido_anterior
--                from lecciones_contenido_historial
--               where leccion_id = '00000000-0000-0000-0000-000000000000'
--                 and coalesce(chars_anterior, 0) > 2
--               order by cambiado_en desc
--               limit 1) h
--       where l.id = '00000000-0000-0000-0000-000000000000';
--
--    Si la lección fue BORRADA, el contenido sigue en el historial con
--    operacion = 'delete' y hay que insertar la fila de nuevo a mano.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 7. Verificación (correr después; las tres primeras deben devolver 0 filas
--    problemáticas y la última, el constraint creado).
-- ---------------------------------------------------------------------------
--   select count(*) as filas_que_violarian
--     from lecciones where not public.es_array_json(contenido);
--
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint where conname = 'lecciones_contenido_es_array';
--
--   select tgname from pg_trigger
--    where tgname = 'trg_lecciones_historial_contenido';
