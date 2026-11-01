-- Calibración: ¿qué similitud tiene un vacío que YA está cubierto?
--
-- Solo lee. No cambia nada.
--
-- ══ RESULTADO (2026-10-31): NO DISCRIMINA. La idea se descartó. ══
--
--   grupo                 vacíos  mín    prom   máx    0.70+   0.60+
--   CONFIRMADO cubierto      10   0.667  0.764  0.849   9/10   10/10
--   pendiente                83   0.594  0.731  0.843  57/83   82/83
--
-- Los rangos se superponen casi enteros y los promedios se diferencian en
-- 0.033. Con umbral 0.70 la "lista corta" eran 57 de 83 pendientes: la bandeja
-- otra vez, con un adorno.
--
-- Causa: el espacio de embeddings está comprimido. Casi todo se parece ~0.73 a
-- la lección más cercana, esté cubierto o no — "conectar una impresora de
-- tickets" da 0.732 contra "Creación de pedido". Por lo mismo, el mejor match
-- eligió la lección EQUIVOCADA en 3 de 6 casos confirmados, así que tampoco
-- sirve para atribuir.
--
-- Lo que quedó en su lugar: un botón "Probar en el bot" en el detalle del
-- vacío (js/gap-probar-bot.js). Preguntarle al bot es la única prueba que
-- discrimina.
--
-- El archivo se conserva porque la medición es reusable: si algún día cambia
-- el modelo de embeddings, esto dice si la idea pasó a ser viable.
--
-- Antes de ponerle un umbral a "este vacío ya tiene contenido" hay que medirlo,
-- no inventarlo. El 0.80 del agrupamiento salió de calibrar con resúmenes del
-- LLM en vez de preguntas reales y quedó marcado como provisional desde
-- entonces; no repitamos eso.
--
-- El material de calibración existe y es real:
--   · Los 7 vacíos de Hardware que se cerraron el 2026-10-31 son casos
--     CONFIRMADOS de "sí está cubierto": cada uno se probó contra el bot en
--     vivo antes de cerrarlo.
--   · Los pendientes son el contraste.
--
-- Se usa match_lessons —la MISMA función con la que el bot recupera— para que
-- el número signifique lo mismo en los dos lados. El umbral va en 0.05 para
-- que no filtre nada: acá queremos ver la distribución completa.
--
-- SON DOS CONSULTAS INDEPENDIENTES. El editor de Supabase muestra el resultado
-- de la última, así que **córrelas por separado** (selecciona una y ejecuta).
-- El CTE está repetido a propósito: un CTE no sobrevive al punto y coma, que es
-- justo lo que rompió la primera versión de este archivo.

-- ── 1. La distribución ──────────────────────────────────────────────────────
with mejor as (
  select v.estado, v.titulo, m.titulo as leccion,
         round(m.similarity::numeric, 3) as similitud
    from bot_vacios v
    cross join lateral (
      select * from match_lessons(v.embedding, 1, 0.05, v.vertical, v.plataforma)
    ) m
   where v.embedding is not null
     and v.estado in ('pendiente', 'resuelto')
)
select
  case when estado = 'resuelto' then 'CONFIRMADO cubierto' else 'pendiente' end as grupo,
  count(*)                 as vacios,
  min(similitud)           as minima,
  round(avg(similitud), 3) as promedio,
  max(similitud)           as maxima,
  count(*) filter (where similitud >= 0.70) as "con >= 0.70",
  count(*) filter (where similitud >= 0.60) as "con >= 0.60",
  count(*) filter (where similitud >= 0.50) as "con >= 0.50"
from mejor
group by 1
order by 1;

-- ── 2. El detalle de los confirmados ────────────────────────────────────────
-- Esta es la que fija el piso: si el más bajo de los confirmados da 0.62, un
-- umbral de 0.70 los habría dejado afuera a todos.
with mejor as (
  select v.estado, v.titulo, m.titulo as leccion,
         round(m.similarity::numeric, 3) as similitud
    from bot_vacios v
    cross join lateral (
      select * from match_lessons(v.embedding, 1, 0.05, v.vertical, v.plataforma)
    ) m
   where v.embedding is not null
     and v.estado = 'resuelto'
)
select titulo, leccion, similitud
  from mejor
 order by similitud;
