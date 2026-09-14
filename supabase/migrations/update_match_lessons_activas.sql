-- match_lessons deja de servir lecciones apagadas.
--
-- El problema: la función filtraba por `embedding is not null`, vertical y
-- plataforma, pero NUNCA miró `active` ni `bot_active`. Consecuencias:
--
--   1. `bot_active` era un interruptor muerto. El botón del robot en el panel
--      admin escribía la columna y ahí moría: nadie la leía. "Desactivar en
--      bolbot POS" no desactivaba nada. (Al 2026-09-14 ninguna lección lo
--      tiene en false, así que esto es prevención: el interruptor empieza a
--      funcionar de aquí en adelante.)
--   2. Una lección oculta a los estudiantes (`active = false`) seguía al
--      alcance del bot, que la podía citar en una respuesta. Esa fuga sí es
--      real hoy: 1 lección con embedding y active=false.
--
-- Se usa IS NOT FALSE y no `= true` a propósito: NULL cuenta como habilitado,
-- igual que en el frontend (`l.active === false`) y que el filtro
-- .not('active','is',false) del panel admin. Así una fila vieja sin el valor
-- seteado no desaparece del bot sin querer.
--
-- Base: la versión de update_match_lessons_notas.sql, que es la VIGENTE en el
-- proyecto (verificado llamando al RPC: devuelve `notas`). El tipo de retorno
-- no cambia respecto a esa, así que CREATE OR REPLACE basta sin DROP previo, y
-- ningún llamador se entera: el nodo "Buscar lecciones" del workflow de n8n
-- manda solo query_embedding / match_count / match_threshold.
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
      AND (p_vertical IS NULL OR l.vertical = p_vertical)
      AND (p_plataforma IS NULL OR l.plataforma = p_plataforma)
    ORDER BY l.embedding <=> query_embedding
    LIMIT match_count;
  END;
  $function$;

-- ---------------------------------------------------------------------------
-- Control 1: la firma no se movió. Debe seguir apareciendo `notas text` en el
-- retorno; si no, el prompt de n8n pierde el campo Notas de la lección.
select pg_get_function_arguments(p.oid) as argumentos,
       pg_get_function_result(p.oid)    as retorno
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'match_lessons';

-- Control 2: las lecciones que quedan FUERA del alcance del bot por estar
-- apagadas. Al 2026-09-14 debe listar 1: "Gestión de estados en facturación
-- electrónica" (oculta a los estudiantes, con embedding).
select id, titulo, vertical, plataforma, active, bot_active
from public.lecciones
where embedding is not null
  and (active is false or bot_active is false)
order by titulo;
