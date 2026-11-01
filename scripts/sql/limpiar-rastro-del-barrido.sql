-- Borra el rastro que deja en la bandeja un barrido de vacíos contra el bot.
--
-- ⚠ ANTES DE CORRERLO: pon abajo la hora de inicio de TU barrido.
--
-- Qué pasa: para saber qué vacíos pendientes ya responde el bot hay que
-- preguntárselo — es la única prueba que discrimina (ver
-- scripts/sql/calibrar-vacios-cubiertos.sql). Pero cada pregunta que el bot
-- falla la registra n8n, y el agrupamiento por similitud NO la mete en el
-- vacío original: el umbral de 0.80 la deja afuera y nacen vacíos NUEVOS. Un
-- barrido de 81 preguntas duplica la bandeja si no se limpia después.
--
-- Cómo se identifica lo del barrido sin tocar nada de clientes reales: sus
-- preguntas son COPIA EXACTA del título de un vacío, y esos títulos son
-- resúmenes del LLM ("El usuario preguntó cómo…") que nadie escribe
-- espontáneamente. Se acota además a la ventana del barrido.
--
-- Corrido el 2026-11-01 sobre el barrido de 81 preguntas: dejó la bandeja en
-- 82 pendientes, los mismos que había antes menos los 2 que habían ensuciado
-- las pruebas manuales del día anterior (esos se borraron a mano en esa
-- corrida; el bloque ya no está acá porque era de una sola vez).
--
-- Ejecutar UNA vez por barrido, en el SQL Editor del proyecto Supabase.

begin;

-- ══ PONE ACÁ LA HORA DE INICIO DE TU BARRIDO ═══════════════════════════════
create temp table ventana on commit drop as
  select '2026-11-01T05:20:42Z'::timestamptz as inicio;
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare v timestamptz;
begin
  select inicio into v from ventana;
  -- Una ventana vieja es EL error de este script, no un detalle: "creado
  -- después de" incluiría todo el tráfico real desde entonces, y borraría
  -- preguntas de clientes cuyo texto coincida con el título de algún vacío.
  -- Mejor que se niegue a correr y moleste, a que se lleve datos en silencio.
  if now() - v > interval '6 hours' then
    raise exception 'La ventana (%) tiene más de 6 horas. Si es un barrido nuevo, pon su hora de inicio arriba; si es el de antes, ya se corrió. No se borró nada.', v;
  end if;
  if v > now() then
    raise exception 'La ventana (%) está en el futuro. No se borró nada.', v;
  end if;
end $$;

-- Las preguntas que metió el barrido: creadas dentro de la ventana y con un
-- texto que es, letra por letra, el título de algún vacío.
create temp table basura on commit drop as
select p.id, p.vacio_id
  from bot_vacios_preguntas p, ventana w
 where p.created_at >= w.inicio
   and exists (select 1 from bot_vacios v where v.titulo = p.texto);

select count(*) as preguntas_a_borrar from basura;

delete from bot_vacios_preguntas where id in (select id from basura);

-- Los vacíos que quedaron sin ninguna pregunta son los que CREÓ el barrido:
-- uno de cliente real conserva las suyas.
delete from bot_vacios v
 where v.estado = 'pendiente'
   and not exists (select 1 from bot_vacios_preguntas p where p.vacio_id = v.id);

-- Contadores recalculados desde las filas, nunca restados. Solo los que
-- perdieron preguntas y siguen existiendo.
update bot_vacios v set
       preguntas_total = s.total,
       primera_vez     = s.primera,
       ultima_vez      = s.ultima
  from (select p.vacio_id, count(*) total, min(p.created_at) primera, max(p.created_at) ultima
          from bot_vacios_preguntas p
         where p.vacio_id in (select distinct vacio_id from basura)
         group by p.vacio_id) s
 where v.id = s.vacio_id;

select estado, count(*) as vacios, sum(preguntas_total) as preguntas
  from bot_vacios group by estado order by 1;

commit;
