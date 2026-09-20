-- Bandeja de vacíos del bot: un "vacío" es un grupo de preguntas reales que el
-- bot no supo responder, agrupadas por similitud de embedding.
--
-- Ver docs/superpowers/specs/2026-09-19-bandeja-vacios-bot-design.md
--
-- No se toca bodi_conversations ni lecciones: la bandeja se para sobre tablas
-- nuevas para que no pueda romper nada que ya esté en producción.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

create table if not exists public.bot_vacios (
  id                uuid primary key default gen_random_uuid(),
  titulo            text not null,
  -- El ANCLA. No se recalcula nunca: ver decisión 3 de la spec. Un centroide
  -- móvil hace que el vacío cambie de significado mientras alguien lo atiende.
  embedding         vector(768),
  categoria         text,
  vertical          text,
  plataforma        text,
  estado            text not null default 'pendiente'
                      check (estado in ('pendiente','resuelto','descartado')),
  motivo_descarte   text
                      check (motivo_descarte is null or motivo_descarte in
                        ('no_aplica','es_soporte','duplicado','ruido')),
  nota_descarte     text,
  leccion_id        uuid references public.lecciones(id) on delete set null,
  preguntas_total   int not null default 0,
  primera_vez       timestamptz,
  ultima_vez        timestamptz,
  resuelto_at       timestamptz,
  resuelto_por      text,
  created_at        timestamptz not null default now()
);

create table if not exists public.bot_vacios_preguntas (
  id               uuid primary key default gen_random_uuid(),
  -- NULL = sin clasificar (llegó sin embedding porque Vertex topó cuota).
  -- Perder la pregunta sería perder un dato irrecuperable; no agruparla es
  -- reversible.
  vacio_id         uuid references public.bot_vacios(id) on delete cascade,
  texto            text not null,
  embedding        vector(768),
  conversation_id  uuid references public.bodi_conversations(id) on delete set null,
  categoria        text,
  vertical         text,
  plataforma       text,
  created_at       timestamptz not null default now()
);

-- Sin índice vectorial, a propósito y siguiendo el precedente de
-- update_lecciones_embedding_768_gemini.sql: con unos cientos de filas la
-- búsqueda exacta es instantánea, y `hnsw` exige pgvector >= 0.5.0, que este
-- proyecto nunca ha usado. Cuando la tabla pase de unos miles de vacíos:
--   create index ... using hnsw (embedding vector_cosine_ops);
--   -- requiere: select extversion from pg_extension where extname = 'vector';
create index if not exists idx_bot_vacios_bandeja
  on public.bot_vacios (estado, ultima_vez desc);
create index if not exists idx_bot_vacios_preguntas_vacio
  on public.bot_vacios_preguntas (vacio_id, created_at desc);
-- Para el cubo de "sin clasificar" y para el detector de silencio.
create index if not exists idx_bot_vacios_preguntas_creadas
  on public.bot_vacios_preguntas (created_at desc);

alter table public.bot_vacios            enable row level security;
alter table public.bot_vacios_preguntas  enable row level security;
-- Sin policies a propósito: con RLS activa y cero policies, nadie llega por
-- PostgREST. Todo el acceso pasa por las RPCs security definer.
