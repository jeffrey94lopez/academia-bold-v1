-- match_lessons con vertical/plataforma: devuelve ambas columnas y acepta
-- filtros opcionales p_vertical / p_plataforma (null = sin filtro), para que
-- el bot no mezcle lecciones de verticales o plataformas distintas.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

-- Cambian tanto los parámetros como las columnas de retorno respecto a la
-- función existente, así que un simple CREATE OR REPLACE fallaría con
-- "cannot change return type of existing function". Además, como la firma
-- de parámetros también cambia, un CREATE sin el DROP previo crearía una
-- segunda función sobrecargada (mismo nombre, distinta firma) y PostgREST
-- no podría resolver de forma inequívoca la llamada RPC "match_lessons".
-- Por eso se hace DROP explícito de la firma actual antes de crear la nueva.
drop function if exists public.match_lessons(vector, integer, double precision);

CREATE OR REPLACE FUNCTION public.match_lessons(query_embedding vector, match_count integer DEFAULT 5, match_threshold double precision DEFAULT 0.15, p_vertical text default null, p_plataforma text default null)
 RETURNS TABLE(id uuid, titulo text, categoria text, contenido text, similarity double precision, vertical text, plataforma text)
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
  BEGIN
    RETURN QUERY
    SELECT l.id, l.titulo, l.categoria, l.contenido,
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
