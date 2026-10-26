-- PREVIEW de la limpieza de falsos positivos del backfill. Solo lee.
--
-- El CTE `por_vacio` es IDÉNTICO al de aplicar-limpieza-falsos-positivos.sql.
-- Si cambias uno, cambia el otro: es lo que hace que esto sea una preview de
-- verdad y no una lista parecida.
--
-- Criterio de "el bot sí falló", con DOS señales porque ninguna basta sola:
--   1. bodi_conversations.bot_no_info — determinista, pero la escribe el
--      frontend en CADA turno (js/assistant.js), así que refleja el ÚLTIMO.
--      Una conversación donde el bot falló y después acertó queda en false.
--   2. La copia fija que n8n sustituye cuando knowledgeGap es true
--      ("Todavía no tengo información sobre eso…") buscada en TODOS los
--      mensajes. Esta sí responde "¿falló alguna vez?".
-- Se combinan con OR: la segunda solo puede RESCATAR vacíos de la limpieza.

with por_vacio as (
  select v.id, v.titulo, v.categoria, v.preguntas_total,
         bool_or(coalesce(c.bot_no_info, false)
                 or c.messages::text ilike '%no tengo información sobre eso%') as fallo_real,
         bool_or(coalesce(c.support_redirected, false)) as derivo_soporte,
         count(c.id) as con_conversacion
    from bot_vacios v
    join bot_vacios_preguntas p on p.vacio_id = v.id
    left join bodi_conversations c on c.id = p.conversation_id
   where v.estado = 'pendiente'   -- resueltos y solicitudes ya tuvieron una decisión humana
   group by v.id, v.titulo, v.categoria, v.preguntas_total
)
select case when derivo_soporte then 'solicitud' else 'descartar (ruido)' end as destino,
       titulo, categoria, preguntas_total
  from por_vacio
 where not fallo_real
   -- Sin una sola conversación legible no hay evidencia de nada. Un vacío así
   -- se queda pendiente: no se entierra por ausencia de datos.
   and con_conversacion > 0
 order by 1, preguntas_total desc, 2;
