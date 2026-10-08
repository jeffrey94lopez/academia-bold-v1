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
-- Es idempotente: se puede volver a ejecutar sin riesgo.
--
-- El control de que esto QUEDÓ BIEN vive aparte, en
-- supabase/seeds/control-cruce-vertical.sql. No puede ir acá: el SQL Editor de
-- Supabase envuelve el script entero en una transacción, así que un `rollback`
-- de prueba se llevaría por delante la migración (ya pasó el 2026-10-06).

alter table public.bodi_conversations
  add column if not exists account_id text;

create table if not exists public.bot_cruces_vertical (
  -- El id lo genera el CLIENTE (crypto.randomUUID, como en createConversation).
  -- Así el INSERT no necesita RETURNING, que exigiría abrirle SELECT a `anon`.
  id                 uuid primary key,
  -- `set null` y no `cascade`: todo el valor analítico vive en las columnas de
  -- esta tabla, y `conversation_id` es solo el vínculo de vuelta. Si algún día
  -- se purgan conversaciones, los cruces tienen que sobrevivir. Mismo criterio
  -- que bot_vacios_preguntas.
  conversation_id    uuid references public.bodi_conversations(id) on delete set null,
  account_id         text,
  -- CHECK porque un tipeo del cliente rompería en silencio los GROUP BY de la
  -- analítica, que es el único motivo por el que esta tabla existe.
  vertical_comercio  text not null check (vertical_comercio  in ('retail','restaurantes')),
  vertical_contenido text not null check (vertical_contenido in ('retail','restaurantes','ambas')),
  leccion_id         uuid,
  -- Desnormalizado a propósito: el registro debe seguir siendo legible aunque
  -- la lección se renombre o se borre.
  leccion_titulo     text,
  -- null = se ofreció y no contestó; true/false = qué contestó.
  -- Distingue "le ofrecimos" de "le interesó", que son preguntas distintas.
  acepto             boolean,
  created_at         timestamptz not null default now()
);

create index if not exists idx_cruces_leccion      on public.bot_cruces_vertical (leccion_id);
create index if not exists idx_cruces_cuenta       on public.bot_cruces_vertical (account_id);
create index if not exists idx_cruces_fecha        on public.bot_cruces_vertical (created_at desc);
create index if not exists idx_cruces_conversacion on public.bot_cruces_vertical (conversation_id);

alter table public.bot_cruces_vertical enable row level security;

-- INSERT para los dos roles: el portal escribe como `anon`, pero con una sesión
-- de admin abierta PostgREST corre como `authenticated`. Olvidar el segundo es
-- el fallo que add_rls_insert_authenticated.sql documenta haber costado 3781
-- eventos: sin policy aplicable el INSERT se rechaza y supabase-js NO lanza.
drop policy if exists cruces_insert on public.bot_cruces_vertical;
create policy cruces_insert on public.bot_cruces_vertical
  for insert to anon, authenticated with check (true);

-- SELECT solo para `authenticated` (el dashboard). A `anon` NO se le abre
-- lectura: este proyecto ya tiene una auditoría abierta porque anon lee todas
-- las conversaciones del bot, y esta tabla lleva account_id.
drop policy if exists cruces_select_auth on public.bot_cruces_vertical;
create policy cruces_select_auth on public.bot_cruces_vertical
  for select to authenticated using (true);

-- El portal marca la respuesta del usuario por esta función y no por un UPDATE
-- directo. Motivo: en Postgres un `UPDATE ... WHERE id = x` necesita TAMBIÉN
-- una policy de SELECT para poder encontrar la fila, y abrírsela a `anon`
-- expondría account_id. `security definer` salta RLS por dentro y acota lo que
-- anon puede hacer a exactamente esto: poner `acepto` en una fila que ya existe.
create or replace function public.responder_cruce(p_id uuid, p_acepto boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update public.bot_cruces_vertical set acepto = p_acepto where id = p_id;
$$;

revoke all on function public.responder_cruce(uuid, boolean) from public;
grant execute on function public.responder_cruce(uuid, boolean) to anon, authenticated;
