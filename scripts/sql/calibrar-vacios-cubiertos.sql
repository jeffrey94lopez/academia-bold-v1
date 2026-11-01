-- Calibración: ¿qué similitud tiene un vacío que YA está cubierto?
--
-- Solo lee. No cambia nada.
--
-- Antes de ponerle un umbral a "este vacío ya tiene contenido" hay que medirlo,
-- no inventarlo. El 0.80 del agrupamiento salió de calibrar con resúmenes del
-- LLM en vez de preguntas reales y quedó marcado como provisional desde
-- entonces; no repitamos eso.
--
-- El material de calibración existe y es real:
--   · Los 6 vacíos de Hardware que se cerraron el 2026-10-31 son casos
--     CONFIRMADOS de "sí está cubierto": cada uno se probó contra el bot en
--     vivo antes de cerrarlo.
--   · Los pendientes son el contraste.
--
-- Se usa match_lessons —la MISMA función con la que el bot recupera— para que
-- el número signifique lo mismo en los dos lados. El umbral se pasa en 0.05
-- para que no filtre nada: acá queremos ver la distribución completa.

with mejor as (
  select
    v.id,
    v.estado,
    v.titulo,
    v.preguntas_total,
    m.titulo     as leccion,
    round(m.similarity::numeric, 3) as similitud
  from bot_vacios v
  cross join lateral (
    select *
      from match_lessons(v.embedding, 1, 0.05, v.vertical, v.plataforma)
  ) m
  where v.embedding is not null
    and v.estado in ('pendiente', 'resuelto')
)
select
  case
    when estado = 'resuelto' then 'CONFIRMADO cubierto'
    else 'pendiente'
  end as grupo,
  count(*)                       as vacios,
  min(similitud)                 as minima,
  round(avg(similitud), 3)       as promedio,
  max(similitud)                 as maxima,
  count(*) filter (where similitud >= 0.70) as "con >= 0.70",
  count(*) filter (where similitud >= 0.60) as "con >= 0.60",
  count(*) filter (where similitud >= 0.50) as "con >= 0.50"
from mejor
group by 1
order by 1;

-- Y el detalle de los confirmados, que es lo que de verdad fija el piso:
-- si el más bajo de estos seis da 0.62, un umbral de 0.70 los dejaría afuera.
select titulo, leccion, similitud
  from mejor
 where estado = 'resuelto'
 order by similitud;
