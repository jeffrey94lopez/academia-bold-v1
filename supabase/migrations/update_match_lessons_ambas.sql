-- match_lessons deja de esconderle al bot las lecciones marcadas 'ambas'.
--
-- La condición replica exactamente la de aplicaA() en js/vertical.js. Si
-- cambias una, cambia la otra: son la misma regla escrita dos veces porque
-- viven en dos runtimes.
--
-- Base: update_match_lessons_activas.sql (la vigente: trae notas, active y
-- bot_active). El tipo de retorno no cambia, así que CREATE OR REPLACE basta
-- sin DROP previo y ningún llamador se entera.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

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
      AND l.active IS NOT FALSE          -- oculta en el portal ⇒ oculta en el bot
      AND l.bot_active IS NOT FALSE      -- el interruptor del robot, ahora sí
      AND 1 - (l.embedding <=> query_embedding) > match_threshold
      AND (p_vertical IS NULL OR l.vertical = p_vertical OR l.vertical = 'ambas')
      AND (p_plataforma IS NULL OR l.plataforma = p_plataforma)
    ORDER BY l.embedding <=> query_embedding
    LIMIT match_count;
  END;
  $function$;

-- ---------------------------------------------------------------------------
-- Control 1: la firma no se movió (debe seguir apareciendo `notas text`).
select pg_get_function_arguments(p.oid) as argumentos,
       pg_get_function_result(p.oid)    as retorno
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'match_lessons';

-- Control 2: el cuerpo de verdad contiene la cláusula de 'ambas'. El Control 1
-- solo mira la firma, que esta migración no cambia: sin esto, un CREATE OR
-- REPLACE que no hubiera surtido efecto pasaría inadvertido. Debe devolver
-- UNA fila con ambas = true; dos filas significan que hay una sobrecarga
-- duplicada de match_lessons y PostgREST no sabrá cuál llamar.
select p.oid::regprocedure as funcion,
       p.prosrc ilike '%l.vertical = ''ambas''%' as tiene_clausula_ambas
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'match_lessons';
