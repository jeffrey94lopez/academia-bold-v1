-- Sub-proyecto B — ciclo de vida de las conversaciones del BolBot.
-- Agrega la marca de última actividad, el índice del barrido, la función que
-- cierra las conversaciones inactivas y su agendado con pg_cron.
--
-- PRERREQUISITO MANUAL: prender la extensión pg_cron en el dashboard de
-- Supabase (Database → Extensions). Si no está prendida, la primera línea
-- falla ruidosamente y NO hay que continuar: sin el agendado, el barrido
-- nunca corre y las conversaciones vuelven a quedar 'active' para siempre.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

create extension if not exists pg_cron;

-- 1. Marca de última actividad. Backfill: las filas viejas no tienen mejor
--    dato que su ended_at (si cerraron) o su started_at — los mensajes en
--    messages no guardan timestamp.
alter table public.bodi_conversations
  add column if not exists last_activity_at timestamptz;

update public.bodi_conversations
   set last_activity_at = coalesce(ended_at, started_at)
 where last_activity_at is null;

alter table public.bodi_conversations
  alter column last_activity_at set default now();

-- 2. Índice del barrido: solo indexa lo vivo, calza exacto con el predicado.
create index if not exists idx_bodi_conv_stale
  on public.bodi_conversations (last_activity_at)
  where status = 'active';

-- 3. El barrido. Devuelve cuántas cerró para poder verificar a mano sin
--    esperar al agendado. ended_at = last_activity_at (la hora honesta en que
--    el usuario dejó de escribir), NO now(), que inflaría toda duración.
create or replace function public.close_stale_conversations() returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min   int;
  v_count int;
begin
  -- Dos muros de protección contra un 0 destructivo en inactividad_cierre_min:
  -- (1) El frontend lo rechaza (min ≥ 1 en el handler de admin.js).
  -- (2) Aquí también se requiere > 0: un 0 haría last_activity_at < now() - 0 min,
  --     cierto para TODA conversación activa, marcándolas todas como abandonadas.
  -- El guard del regex es deliberado: si alguien escribe "treinta" en el admin,
  -- cae al default en vez de reventar y dejar de correr para siempre.
  select coalesce(
    (select value::int from app_settings
      where key = 'inactividad_cierre_min'
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

-- 4. Agendado cada 10 min. El unschedule previo hace el archivo re-ejecutable
--    sin dejar dos jobs con el mismo nombre.
select cron.unschedule('cerrar-conversaciones-inactivas')
 where exists (select 1 from cron.job where jobname = 'cerrar-conversaciones-inactivas');

select cron.schedule('cerrar-conversaciones-inactivas', '*/10 * * * *',
  $$select public.close_stale_conversations()$$);
