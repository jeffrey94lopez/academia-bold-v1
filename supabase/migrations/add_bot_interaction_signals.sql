-- Sub-proyecto A — señales deterministas de interacción del bot.
-- Las escribe el frontend (assistant.js) en cada turno, a partir de la
-- respuesta estructurada de n8n:
--   bot_no_info              true si el bot dio el mensaje sin-info (R2 / knowledge_gap de la respuesta)
--   bot_asked_clarification  true si el turno fue una pregunta de aclaración (R1 / asked_clarification)
-- Son deterministas y baratas (a diferencia de las de ①c). NO se reusa la
-- columna knowledge_gap de ①a: esa queda reservada al texto/juicio del LLM.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
alter table public.bodi_conversations
  add column if not exists bot_no_info boolean not null default false,
  add column if not exists bot_asked_clarification boolean not null default false;
