-- Campos nuevos en bodi_conversations para la calidad real del bot (auto-eval
-- con LLM en n8n) y filtros del explorador:
--   resolution_status  estado de 3 valores que reemplaza al booleano 'resolved'
--   category           taxonomía estable de la duda (reemplaza el 'topic' libre)
--   knowledge_gap      true si la duda no está cubierta por ninguna lección
--   summary            resumen de una línea de la conversación
--   vertical/plataforma contexto que el bot ya recibe pero no se persistía
--   lessons_used       lecciones que usó el bot (ya lo escribe assistant.js)
-- Todas quedan null hasta que la telemetría (①b) y el LLM (①c) las llenen.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
alter table public.bodi_conversations
  add column if not exists resolution_status text
    check (resolution_status in ('resuelta','no_resuelta','ambigua')),
  add column if not exists category text,
  add column if not exists knowledge_gap boolean,
  add column if not exists summary text,
  add column if not exists vertical text,
  add column if not exists plataforma text,
  add column if not exists lessons_used jsonb default '[]'::jsonb;

create index if not exists idx_bodi_conv_category
  on public.bodi_conversations (category, started_at desc);
create index if not exists idx_bodi_conv_resolution
  on public.bodi_conversations (resolution_status, started_at desc);
