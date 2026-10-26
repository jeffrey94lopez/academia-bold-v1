-- Limpieza de los falsos positivos del backfill. ESTO SÍ ESCRIBE.
--
-- Correr preview-falsos-positivos-vacios.sql ANTES: el CTE `por_vacio` de acá
-- es idéntico al de ese archivo, así que la lista que viste es exactamente lo
-- que esto toca. Si cambias uno, cambia el otro.
--
-- Por qué existen estos falsos positivos: el backfill tomó conversaciones por
-- `knowledge_gap`, que es el juicio del LLM de auto-evaluación ("esto no lo
-- cubre ninguna lección"), no la señal de que el bot haya fallado.
--
-- Las dos escrituras imitan a marcar_solicitud y a descartar_vacio para que la
-- bandeja las pinte igual que si alguien hubiera hecho clic.
-- Idempotente: al correrla dos veces, la segunda no encuentra nada pendiente.
--
-- CORRIDA EL 2026-10-25 sobre los 107 vacíos del backfill de 30 días:
--   104 pendientes → 68. 23 pasaron a solicitud, 13 a descartado/ruido.
-- El preview devolvió 36 y no 41: la búsqueda de la copia de "no tengo
-- información" en todos los mensajes rescató 5 vacíos que `bot_no_info` sola
-- (que solo refleja el último turno) habría enterrado.
--
-- Queda acá para el próximo backfill, no porque falte correrla.

begin;

create temp table limpieza on commit drop as
with por_vacio as (
  select v.id, v.titulo, v.categoria, v.preguntas_total,
         bool_or(coalesce(c.bot_no_info, false)
                 or c.messages::text ilike '%no tengo información sobre eso%') as fallo_real,
         bool_or(coalesce(c.support_redirected, false)) as derivo_soporte,
         count(c.id) as con_conversacion
    from bot_vacios v
    join bot_vacios_preguntas p on p.vacio_id = v.id
    left join bodi_conversations c on c.id = p.conversation_id
   where v.estado = 'pendiente'
   group by v.id, v.titulo, v.categoria, v.preguntas_total
)
select id, derivo_soporte
  from por_vacio
 where not fallo_real and con_conversacion > 0;

-- El bot respondió Y derivó a Soporte: no falta contenido, pero es señal de
-- producto. No se esconde: queda contado en su propia pestaña.
update bot_vacios v
   set estado = 'solicitud',
       motivo_descarte = null,
       leccion_id = null,
       nota_descarte = 'Del backfill: el bot respondió y derivó a Soporte. Revisar si es un pedido de producto.',
       resuelto_at = now(),
       resuelto_por = 'limpieza del backfill'
  from limpieza l
 where v.id = l.id and l.derivo_soporte;

-- El bot respondió normal y nadie derivó nada: el detector se equivocó. El
-- motivo `ruido` no es burocracia — a los dos meses dice cuánta basura genera
-- el criterio del backfill y de qué tipo.
update bot_vacios v
   set estado = 'descartado',
       motivo_descarte = 'ruido',
       leccion_id = null,
       nota_descarte = 'Falso positivo del backfill: el bot sí respondió (bot_no_info = false y sin la copia de "no tengo información" en ningún turno). El backfill usó knowledge_gap, que es el juicio del LLM.',
       resuelto_at = now(),
       resuelto_por = 'limpieza del backfill'
  from limpieza l
 where v.id = l.id and not l.derivo_soporte;

-- Cómo quedó la bandeja. Revisá esto ANTES de confirmar.
select estado, count(*) as vacios, sum(preguntas_total) as preguntas
  from bot_vacios group by estado order by 1;

commit;
