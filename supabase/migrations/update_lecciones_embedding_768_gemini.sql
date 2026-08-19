-- Migración de embeddings OpenAI (1536) → Gemini text-embedding-004 (768).
--
-- Solo cambia la DIMENSIÓN de la columna. No hace falta tocar:
--   - update_lesson_embedding: recibe double precision[] y hace ::vector, así que
--     acepta cualquier dimensión.
--   - match_lessons: su parámetro query_embedding es `vector` sin dimensión fija.
--
-- Los embeddings viejos (1536) se descartan porque hay que re-embeber igual con
-- el botón "Re-embeber todo" del admin (que ya usa Gemini).
-- Ejecutar UNA vez en el SQL Editor del proyecto Supabase.

begin;
  alter table public.lecciones drop column if exists embedding;
  alter table public.lecciones add  column embedding vector(768);
commit;

-- Después de correr esto: en el admin → Lecciones → "Re-embeber todo".
-- (No se crea índice: con ~32 lecciones la búsqueda exacta es instantánea.)
