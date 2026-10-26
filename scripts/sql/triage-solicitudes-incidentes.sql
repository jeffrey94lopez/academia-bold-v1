-- Separa las 24 solicitudes en tres destinos. ESTO ESCRIBE.
--
-- Correr DESPUÉS de add_estado_incidente_vacios.sql, o el check de estado
-- rechaza 'incidente'.
--
-- Los tres destinos, y por qué:
--   incidente  → algo no está funcionando. Lo lee Soporte y no se arregla
--                escribiendo contenido.
--   pendiente  → son preguntas de cómo-se-hace sobre impresoras y tirillas, y
--                las seis lecciones de periféricos se publicaron el 2026-10-25,
--                después de que se preguntaran. Vuelven a la bandeja LIMPIAS
--                para resolverse contra ese contenido.
--   (se queda) → pedidos de producto de verdad: borrar el historial, vaciar el
--                inventario, reiniciar de cero, dar de baja la cuenta, renovar
--                la suscripción. Todos son lo mismo de fondo: autogestión que
--                hoy pasa por Soporte. No se listan acá porque no se tocan.
--
-- La clasificación la hizo un modelo leyendo los títulos, no una señal medida.
-- Por eso el script se planta si un patrón no identifica exactamente UNA
-- solicitud: prefiere no mover nada antes que mover algo aproximado.

begin;

create temp table triage (fragmento text, destino text) on commit drop;
insert into triage (fragmento, destino) values
  -- Incidentes de soporte
  ('%buscar una factura existente%',      'incidente'),
  ('%lateral izquierdo%',                 'incidente'),
  ('%cambiar el IVA%',                    'incidente'),
  ('%espacios en blanco extensos%',       'incidente'),
  ('%turno abierto%',                     'incidente'),
  ('%prefijos para el token%',            'incidente'),
  ('%a pesar de seguir las instrucciones%','incidente'),
  ('%no reconoce la clave%',              'incidente'),
  ('%recuperada incluye letras%',         'incidente'),
  ('%anterior aparecen con la fecha%',    'incidente'),
  ('%resoluciones guardadas%',            'incidente'),
  ('%no puede ver nada%',                 'incidente'),
  ('%mensaje de error para asociar%',     'incidente'),
  ('%editar un contacto%',                'incidente'),
  -- De vuelta a pendientes: ya hay contenido que las responde
  ('%impresora de tickets%',              'pendiente'),
  ('%imprimir una tirilla%',              'pendiente'),
  ('%configuraci%n de impresi%n%',        'pendiente'),
  ('%notas cr%dito%',                     'pendiente');

create temp table movidas on commit drop as
select t.destino, t.fragmento, v.id, v.titulo
  from triage t
  join bot_vacios v on v.estado = 'solicitud' and v.titulo ilike t.fragmento;

do $$
declare r record;
begin
  -- Un patrón que no matchea nada significa que el título cambió o que lo
  -- copié mal; uno que matchea dos, que es demasiado corto. Las dos cosas
  -- terminan moviendo el vacío equivocado, así que se cortan acá.
  for r in
    select t.fragmento, count(m.id) as n
      from triage t left join movidas m on m.fragmento = t.fragmento
     group by t.fragmento having count(m.id) <> 1
  loop
    raise exception 'El patrón % identifica % solicitudes y tiene que identificar exactamente 1. No se movió nada.', r.fragmento, r.n;
  end loop;

  if exists (select 1 from movidas group by id having count(*) > 1) then
    raise exception 'Un mismo vacío cae en dos patrones. No se movió nada.';
  end if;
end $$;

update bot_vacios v
   set estado = 'incidente',
       nota_descarte = 'Reclasificado desde Solicitudes: es un incidente de soporte, no un pedido de producto.',
       motivo_descarte = null,
       leccion_id = null,
       resuelto_at = now(),
       resuelto_por = 'triage de solicitudes'
  from movidas m
 where v.id = m.id and m.destino = 'incidente';

-- Limpias de verdad: sin nota, sin motivo y sin resuelto_at. Dejar resuelto_at
-- puesto haría que sus preguntas contaran como "llegadas después del cierre".
update bot_vacios v
   set estado = 'pendiente',
       nota_descarte = null,
       motivo_descarte = null,
       leccion_id = null,
       resuelto_at = null,
       resuelto_por = null
  from movidas m
 where v.id = m.id and m.destino = 'pendiente';

-- Lo que se movió. Si el editor solo muestra el último resultado, este es.
select destino,
       count(*) over (partition by destino) as en_este_grupo,
       titulo
  from movidas
 order by destino, titulo;

commit;
