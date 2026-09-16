-- Separa los toggles de módulos por entorno de deploy.
--
-- Hasta ahora sandbox y producción compartían fila: los switches del admin
-- (bot_enabled, lessons_enabled, curso_enabled, vertical_*_enabled…) son filas
-- de app_settings, no código, y todos los deploys apuntan al mismo proyecto de
-- Supabase. Prender "Curso" en el sandbox lo prendía en el portal real — y con
-- app_settings en la publicación de realtime, en vivo y sin recargar.
--
-- Modelo: 'prod' es la base y cada otro entorno guarda SOLO las claves que
-- cambió. El merge lo hace el cliente (mergeSettings en js/env.js), así el
-- sandbox hereda producción y no hay que sembrarlo ni mantenerlo sincronizado.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

-- 1. La columna. El default 'prod' deja las filas existentes como producción,
--    así que hasta acá el comportamiento no cambia para nadie.
alter table public.app_settings
  add column if not exists env text not null default 'prod';

-- 2. La unicidad vieja es sobre `key` sola: con dos entornos, insertar la fila
--    del sandbox la violaría. Se busca por su lista de columnas y no por
--    nombre porque la tabla se creó a mano, fuera de migraciones, y el nombre
--    del constraint no consta en el repo.
do $$
declare c record;
begin
  for c in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.app_settings'::regclass
       and con.contype in ('p', 'u')
       and (select array_agg(a.attname::text)
              from unnest(con.conkey) k
              join pg_attribute a
                on a.attrelid = con.conrelid and a.attnum = k) = array['key']
  loop
    execute format('alter table public.app_settings drop constraint %I', c.conname);
  end loop;
end $$;

-- 3. PK compuesta, no un índice único suelto: app_settings está en la
--    publicación supabase_realtime y una tabla sin PK con REPLICA IDENTITY
--    DEFAULT no emite UPDATE/DELETE útiles. Dejarla sin PK apagaría en
--    silencio los toggles en vivo.
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.app_settings'::regclass and contype = 'p') then
    alter table public.app_settings add primary key (key, env);
  end if;
end $$;

-- 4. El barrido de conversaciones inactivas lee app_settings con un subquery
--    escalar. Sin este pin, la primera fila de sandbox con esa misma key hace
--    que devuelva dos filas, el subquery revienta y el cron deja de cerrar
--    conversaciones en producción. El cuerpo es idéntico al de
--    add_conversation_lifecycle.sql salvo por `and env = 'prod'`.
create or replace function public.close_stale_conversations() returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min   int;
  v_count int;
begin
  select coalesce(
    (select value::int from app_settings
      where key = 'inactividad_cierre_min'
        and env = 'prod'
        and value ~ '^[0-9]+$'
        and value::int > 0),
    30) into v_min;

  update bodi_conversations
     set status   = 'abandoned',
         ended_at = last_activity_at
   where status = 'active'
     and last_activity_at < now() - make_interval(mins => v_min);

  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.close_stale_conversations() from public, anon;
