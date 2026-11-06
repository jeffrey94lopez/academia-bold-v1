-- ¿Tenemos el nombre del usuario en las conversaciones?
--
-- Solo lee. No cambia nada.
--
-- Por qué hay que medirlo y no deducirlo: la columna `user_name` existe y
-- js/assistant.js la escribe desde `contextoBold.user?.name`, pero ese campo se
-- le pidió a Bold como **Opcional** (fila 6 del requerimiento v2, contra
-- accountId/businessType que eran obligatorios). Que el código lo soporte no
-- prueba que Bold lo mande.
--
-- `count(account_id)` es la base correcta, no `count(*)`: sin contexto de Bold
-- la fila no lleva NI cuenta NI nombre, así que comparar contra el total
-- mezclaría "Bold no manda el nombre" con "la visita no vino del POS" — dos
-- causas distintas con arreglos distintos.
--
-- Ejecutar en el SQL Editor de Supabase. El editor muestra solo el resultado de
-- la ÚLTIMA sentencia, así que esto es UNA sola.

select
  count(*)                                              as conversaciones,
  count(account_id)                                     as con_contexto_de_bold,
  count(user_name)                                      as con_nombre_de_usuario,
  count(distinct user_name)                             as nombres_distintos,
  round(100.0 * count(user_name)
        / nullif(count(account_id), 0))                 as pct_de_las_que_traen_contexto,
  min(started_at) filter (where user_name is not null)  as primer_nombre_visto,
  max(started_at) filter (where user_name is not null)  as ultimo_nombre_visto,
  -- Una muestra, para ver si lo que llega son nombres de persona de verdad y
  -- no el nombre del comercio repetido o un marcador de ejemplo.
  (select string_agg(x, ' | ')
     from (select distinct user_name as x
             from bodi_conversations
            where user_name is not null
            order by 1 limit 10) m)                     as muestra
from bodi_conversations;
