-- match_lessons ahora devuelve también 'notas', para que el bot bolbot POS pueda
-- citar el campo Notas de la lección al responder (el prompt de n8n lo agrega al
-- contexto). Cambia el tipo de retorno → hay que DROP explícito antes del CREATE
-- (un CREATE OR REPLACE fallaría con "cannot change return type").
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
drop function if exists public.match_lessons(vector, integer, double precision, text, text);

CREATE OR REPLACE FUNCTION public.match_lessons(query_embedding vector, match_count integer DEFAULT 5, match_threshold double precision DEFAULT 0.15, p_vertical text default null, p_plataforma text default null)
 RETURNS TABLE(id uuid, titulo text, categoria text, contenido text, notas text, similarity double precision, vertical text, plataforma text)
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
  BEGIN
    RETURN QUERY
    SELECT l.id, l.titulo, l.categoria, l.contenido, l.notas,
      1 - (l.embedding <=> query_embedding) AS similarity,
      l.vertical, l.plataforma
    FROM lecciones l
    WHERE l.embedding IS NOT NULL
      AND 1 - (l.embedding <=> query_embedding) > match_threshold
      AND (p_vertical IS NULL OR l.vertical = p_vertical)
      AND (p_plataforma IS NULL OR l.plataforma = p_plataforma)
    ORDER BY l.embedding <=> query_embedding
    LIMIT match_count;
  END;
  $function$
