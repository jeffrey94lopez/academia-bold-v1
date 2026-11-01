-- Borra el rastro que dejó el barrido del 2026-11-01 en la bandeja.
--
-- Qué pasó: para saber qué vacíos pendientes ya responde el bot, hay que
-- preguntárselo — es la única prueba que discrimina (ver
-- scripts/sql/calibrar-vacios-cubiertos.sql). Pero cada pregunta que el bot
-- falla la registra n8n, y el agrupamiento por similitud NO las mete en el
-- vacío original: el umbral de 0.80 las deja afuera y nacen vacíos nuevos.
-- Comprobado en chico el 2026-10-31: probar "como agrando la letra para
-- imprimir" creó un vacío aparte del que ya existía con ese tema.
--
-- Cómo se identifica lo que hay que borrar, sin tocar nada de clientes reales:
-- las preguntas del barrido son COPIA EXACTA del título de un vacío, y esos
-- títulos son resúmenes del LLM ("El usuario preguntó cómo…") que nadie
-- escribe espontáneamente. Se acota además a la ventana del barrido.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

begin;

-- La ventana del barrido. Si vuelves a correr un barrido, cambia esta fecha.
create temp table ventana on commit drop as
  select '2026-11-01T05:20:42Z'::timestamptz as inicio;

-- 1. Las preguntas que metió el barrido: creadas dentro de la ventana y con un
--    texto que es, letra por letra, el título de algún vacío.
create temp table basura on commit drop as
select p.id, p.vacio_id
  from bot_vacios_preguntas p, ventana w
 where p.created_at >= w.inicio
   and exists (select 1 from bot_vacios v where v.titulo = p.texto);

-- 2. Los dos vacíos que las pruebas manuales del 2026-10-31 ya habían
--    ensuciado, antes de la ventana. Se nombran uno por uno a propósito: son
--    textos que escribí yo, no resúmenes del LLM, así que no los agarra la
--    regla de arriba.
insert into basura (id, vacio_id)
select p.id, p.vacio_id
  from bot_vacios_preguntas p
  join bot_vacios v on v.id = p.vacio_id
 where v.estado = 'pendiente'
   and v.titulo in ('como agrando la letra para imprimir', 'uso un iPad');

select count(*) as preguntas_a_borrar from basura;

delete from bot_vacios_preguntas where id in (select id from basura);

-- 3. Los vacíos que quedaron sin ninguna pregunta son los que CREÓ el barrido:
--    un vacío de cliente real conserva las suyas.
delete from bot_vacios v
 where v.estado = 'pendiente'
   and not exists (select 1 from bot_vacios_preguntas p where p.vacio_id = v.id);

-- 4. Contadores recalculados desde las filas, nunca restados. Solo los que
--    perdieron preguntas y siguen existiendo.
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
