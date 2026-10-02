-- Cruce entre verticales: cuando el bot no encuentra la respuesta en la
-- vertical del comercio pero sí en la otra, lo ofrece y registra el hecho.
--
-- Se guarda `account_id` en las conversaciones porque sin él no se puede
-- responder "¿este comercio está mal clasificado?". Matiza la decisión previa
-- de no persistir identidad, que era sobre localStorage (se filtraba entre
-- comercios en un equipo compartido); esto es del lado servidor, el account_id
-- ya queda en los logs de n8n desde el 2026-09-30, y es el número de cuenta de
-- un comercio, no de una persona. El nombre y el correo del usuario siguen sin
-- salir del navegador.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

alter table public.bodi_conversations
  add column if not exists account_id text;

create table if not exists public.bot_cruces_vertical (
  id                 uuid primary key default gen_random_uuid(),
  conversation_id    uuid references public.bodi_conversations(id) on delete cascade,
  account_id         text,
  vertical_comercio  text not null,
  vertical_contenido text not null,
  leccion_id         uuid,
  leccion_titulo     text,
  -- null = se ofreció y no contestó; true/false = qué contestó.
  -- Distingue "le ofrecimos" de "le interesó", que son preguntas distintas.
  acepto             boolean,
  created_at         timestamptz not null default now()
);

create index if not exists idx_cruces_leccion on public.bot_cruces_vertical (leccion_id);
create index if not exists idx_cruces_cuenta  on public.bot_cruces_vertical (account_id);
create index if not exists idx_cruces_fecha   on public.bot_cruces_vertical (created_at desc);

alter table public.bot_cruces_vertical enable row level security;

-- El portal escribe como `anon`, igual que bodi_conversations. Sin estas dos
-- policies el INSERT se bloquea EN SILENCIO (supabase-js no lanza) y la tabla
-- queda vacía sin que nadie se entere.
drop policy if exists cruces_insert_anon on public.bot_cruces_vertical;
create policy cruces_insert_anon on public.bot_cruces_vertical
  for insert to anon with check (true);

drop policy if exists cruces_update_anon on public.bot_cruces_vertical;
create policy cruces_update_anon on public.bot_cruces_vertical
  for update to anon using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Control 1: la columna y la tabla existen. Debe devolver 2 filas.
select 'bodi_conversations.account_id' as objeto, count(*) as existe
from information_schema.columns
where table_schema='public' and table_name='bodi_conversations' and column_name='account_id'
union all
select 'tabla bot_cruces_vertical', count(*)
from information_schema.tables
where table_schema='public' and table_name='bot_cruces_vertical';

-- Control 2: las dos policies quedaron. Debe listar cruces_insert_anon y
-- cruces_update_anon. Si falta alguna, el portal escribirá en silencio y sin
-- efecto.
select policyname, cmd from pg_policies
where schemaname='public' and tablename='bot_cruces_vertical'
order by policyname;
