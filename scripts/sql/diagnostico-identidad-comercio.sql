-- ¿Cuánta identidad de comercio tenemos realmente? Solo lee.
--
-- `account_id` solo se escribe cuando Bold manda el contexto por postMessage
-- (js/assistant.js, dentro del if de contextoBold). Si el embed no lo manda,
-- la columna está vacía y la pestaña de Incidentes no va a poder decir de quién
-- es cada uno. Conviene saberlo antes de confiar en ella.

select
  count(*)                                         as conversaciones_30d,
  count(account_id)                                as con_account_id,
  count(distinct account_id)                       as comercios_distintos,
  count(*) filter (where account_id is not null
                     and knowledge_gap is true)    as con_cuenta_y_gap
from bodi_conversations
where started_at >= now() - interval '30 days';

-- Y lo mismo acotado a lo que hoy vive en la bandeja.
select v.estado,
       count(*)                                    as preguntas,
       count(c.account_id)                         as con_account_id,
       count(distinct c.account_id)                as comercios_distintos
  from bot_vacios v
  join bot_vacios_preguntas p on p.vacio_id = v.id
  left join bodi_conversations c on c.id = p.conversation_id
 group by v.estado
 order by 1;
