-- Cierra los vacíos de Hardware/Periféricos que el contenido ya resolvió.
--
-- Por qué existen: se registraron el 25-26 de octubre, cuando el bot todavía
-- derivaba las preguntas de impresoras a Soporte por una FAQ vieja (arreglada
-- el 2026-10-31). Las seis lecciones de periféricos se publicaron el 25, así
-- que el contenido llegó DESPUÉS de que la gente preguntara. La bandeja no
-- tiene forma de enterarse sola de eso.
--
-- NO se inventa nada: cada uno de estos seis se probó contra el bot en vivo el
-- 2026-10-31 y hoy responde. Los que siguen fallando NO están acá y quedan
-- pendientes a propósito.
--
-- "Agrandar la letra para imprimir" es el ÚNICO que queda pendiente, y con
-- razón: el bot sigue sin saber, porque las lecciones cubren tamaño de papel,
-- márgenes, corte y cajón, pero no el tamaño de la letra. Ahí sí falta
-- contenido de verdad.
--
-- Los otros dos se DESCARTAN abajo con su motivo, no se cierran como resueltos:
-- "pedir un datáfono" lo atiende Bold Payments (es_soporte) y conectar el
-- Wi-Fi está fuera de alcance (no_aplica).
--
-- `resolver_vacio` liga el vacío a la lección que lo cubre SIN escribir una FAQ
-- nueva. Eso es a propósito: el contenido ya existe, y duplicarlo en un bloque
-- bot_faq ensuciaría la lección y el contexto del bot.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

begin;

create temp table cierre (fragmento text, leccion uuid) on commit drop;
insert into cierre (fragmento, leccion) values
  -- Impresoras térmicas: cómo funcionan con Bold POS
  ('%impresora de tickets en su restaurante%', '4722f1f2-689f-4df1-a306-5841731ae882'),
  ('%configuración de impresión%',             '4722f1f2-689f-4df1-a306-5841731ae882'),
  ('%imprimir una tirilla%',                   '4722f1f2-689f-4df1-a306-5841731ae882'),
  -- Configurar papel, corte y cajón monedero en Windows
  ('%apertura de la caja registradora%',       '8f4e09f2-ad8c-4055-bef4-ee2ff6a1a98c'),
  -- Conectar un lector de código de barras
  ('%escáner no funciona a la primera%',       '3f54a886-28cb-4cd0-92e8-6c5bbe8d5874'),
  -- Integración datafono Smart Pro
  ('%integrar el datáfono con Bold POS%',      'e2d3f50f-ba9d-4cd9-b150-98025b96abf4');

create temp table a_cerrar on commit drop as
select c.fragmento, c.leccion, v.id, v.titulo
  from cierre c
  join bot_vacios v on v.estado = 'pendiente' and v.titulo ilike c.fragmento;

do $$
declare r record;
begin
  -- Mismo cerrojo que el triage de solicitudes: un patrón que no identifica
  -- exactamente UN vacío significa que copié mal el título o que es demasiado
  -- corto. Las dos cosas cierran el vacío equivocado, así que se corta acá.
  for r in
    select c.fragmento, count(a.id) as n
      from cierre c left join a_cerrar a on a.fragmento = c.fragmento
     group by c.fragmento having count(a.id) <> 1
  loop
    raise exception 'El patrón % identifica % vacíos y tiene que identificar exactamente 1. No se cerró nada.', r.fragmento, r.n;
  end loop;

  -- Y que la lección exista de verdad: un id mal copiado dejaría el vacío
  -- resuelto apuntando a la nada, que es peor que dejarlo pendiente.
  for r in select distinct leccion from cierre loop
    if not exists (select 1 from lecciones where id = r.leccion) then
      raise exception 'La lección % no existe. No se cerró nada.', r.leccion;
    end if;
  end loop;
end $$;

-- resolver_vacio hace el trabajo: estado = resuelto, leccion_id, resuelto_at.
-- Se llama una vez por vacío en vez de un UPDATE masivo para no duplicar su
-- lógica, que es la misma que usa el botón del panel.
do $$
declare r record;
begin
  for r in select id, leccion from a_cerrar loop
    perform resolver_vacio(r.id, r.leccion, 'cierre de vacíos obsoletos');
  end loop;
end $$;

-- ── Los que no son falta de contenido ───────────────────────────────────────
-- `es_soporte` significa literalmente "es soporte, no academia", que es
-- exactamente lo que son: desde el 2026-10-31 hay una FAQ que enruta compra de
-- datáfono, QR, sonido y transacciones al equipo de Bold Payments, así que el
-- bot ya tiene qué contestar. No falta contenido nuestro.
update bot_vacios
   set estado = 'descartado', motivo_descarte = 'es_soporte',
       nota_descarte = 'Lo atiende Bold Payments; el bot ya enruta por la FAQ de datáfonos/QR/transacciones.',
       leccion_id = null, resuelto_at = now(), resuelto_por = 'cierre de vacíos obsoletos'
 where estado = 'pendiente' and titulo ilike '%pedir un datafono%';

-- Fuera de alcance: el bot mismo contesta "solo puedo ayudarte con temas de
-- Bold POS", que es la respuesta correcta. Configurar el Wi-Fi de un equipo no
-- es algo que la academia deba enseñar.
update bot_vacios
   set estado = 'descartado', motivo_descarte = 'no_aplica',
       nota_descarte = 'Fuera de alcance: el bot ya responde que solo cubre temas de Bold POS.',
       leccion_id = null, resuelto_at = now(), resuelto_por = 'cierre de vacíos obsoletos'
 where estado = 'pendiente' and titulo ilike '%a la red Wi-Fi%';

select titulo, leccion from a_cerrar order by titulo;

commit;
