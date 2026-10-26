-- Diagnóstico: ¿cuántos de los vacíos del backfill son falsos positivos?
--
-- El backfill tomó conversaciones por `bodi_conversations.knowledge_gap`, que
-- es el JUICIO DEL LLM de auto-evaluación ("esto no lo cubre ninguna lección").
-- La señal de que el bot REALMENTE falló es otra: `bot_no_info`, determinista,
-- escrita por el frontend desde la respuesta estructurada del bot en cada turno
-- (ver supabase/migrations/add_bot_interaction_signals.sql).
--
-- Un vacío es falso positivo si NINGUNA de sus preguntas viene de una
-- conversación donde el bot dijo "no tengo información". Se mira a nivel de
-- VACÍO y con bool_or a propósito: si una sola de sus preguntas es un fallo
-- real, el vacío es real y no se toca.
--
-- Solo lee. No cambia nada.

with por_vacio as (
  select v.id, v.estado,
         bool_or(coalesce(c.bot_no_info, false))        as fallo_real,
         bool_or(coalesce(c.support_redirected, false)) as derivo_soporte,
         count(*)                                        as preguntas,
         count(c.id)                                     as con_conversacion
    from bot_vacios v
    join bot_vacios_preguntas p on p.vacio_id = v.id
    left join bodi_conversations c on c.id = p.conversation_id
   group by v.id, v.estado
)
select estado,
       fallo_real      as "el bot sí falló",
       derivo_soporte  as "derivó a soporte",
       count(*)        as vacios,
       sum(preguntas)  as preguntas,
       sum(preguntas - con_conversacion) as "preguntas sin conversación"
  from por_vacio
 group by 1, 2, 3
 order by 1, 2, 3;
