-- Cierra los 40 vacíos que el barrido del 2026-11-01 probó y el bot YA responde.
--
-- Correr DESPUÉS de limpiar-rastro-del-barrido.sql: ese borra las preguntas que
-- el propio barrido metió, y este cierra lo que el barrido descubrió.
--
-- Cómo se supo: se le hizo al bot la pregunta real de cada uno de los 81
-- pendientes, con el contexto de FAQs igual que el portal. 33 respondieron,
-- 7 repreguntaron el dispositivo y después responden —eso también es estar
-- cubierto—, 37 siguen sin saber y 4 fallaron por un error de n8n.
--
-- Se cierran SIN lección ligada, a propósito. La lección correcta no se puede
-- deducir: medido el 2026-10-31, el mejor match por similitud eligió la
-- equivocada en 3 de 6 casos. Ligar una lección al azar sería peor que no
-- ligar ninguna. El panel distingue este caso por `resuelto_por` y dice "se
-- cerró porque el bot ya lo responde" en vez de inventar una lección.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

begin;

create temp table cubiertos (titulo text) on commit drop;
insert into cubiertos (titulo) values
  ('realizar la numeración para notas crédito.'),
  ('COMO HAGO PARA VER EL DETALLE DE UNA FACTURA QUE SE REALIZOO'),
  ('puse por error una factura de credito pagada como lo arreglo'),
  ('configurar el código QR para pagos.'),
  ('El usuario preguntó cómo abrir un turno y cómo eliminar una factura. El bot respondió la primera pregunta pero no tenía información para la segunda.'),
  ('El usuario preguntó cómo imprimir una factura generada con su resolución'),
  ('No recibe el código de acceso para facturar'),
  ('personalizar el recibo de turno para que muestre los detalles de los productos vendidos.'),
  ('aplicar retención en la fuente del 2.5% en facturas.'),
  ('agregar una orden de compra a un comprobante de venta o factura electrónica para un negocio de retail.'),
  ('ingresos no relacionados a ventas del turno'),
  ('ayuda para configurar la facturación electrónica en DIAN y Bold POS, encontrando un error que el bot no pudo resolver directamente.'),
  ('eliminar un comprobante y cómo obtener los permisos para realizar esta acción.'),
  ('la ubicación de facturas electrónicas para la DIAN, proceso para crear notas crédito y un problema al seleccionar ''consumidor final''.'),
  ('vincular su cuenta de ahorros para recibir pagos.'),
  ('es posible facturar con dos nombres diferentes.'),
  ('ayuda para configurar la numeración de notas crédito para anular una factura electrónica con NIT incorrecto.'),
  ('cancelar el servicio debido a un incremento de precio.'),
  ('El usuario preguntó cómo editar el logo y pie de página de los tickets impresos.'),
  ('dónde introducir la clave de acceso para el panel de Bold POS.'),
  ('configurar la hora de cierre de turno.'),
  ('generar un código de barras.'),
  ('AUNQUE YA ALGUNAS SUCURSALES TENGAN UN IDADES DISPONIBLES'),
  ('el significado y funcionamiento de la factura de compra y los ítems comprados en reportes.'),
  ('eliminar ítems y qué sucede con las unidades registradas al desactivarlos'),
  ('subir una imagen para un producto en el sistema.'),
  ('Cancelar plan'),
  ('Gracias, que debo hacer o que tipo de cuenta usar para poder usar el bold plus'),
  ('agregar un pedido para llevar en el sistema.'),
  ('El usuario preguntó cómo cambiar productos de una mesa a otra'),
  ('la función de un símbolo (cuadro con signo de pregunta) al agregar productos a la venta en Bold POS.'),
  ('corregir un servicio.'),
  ('aplicar descuentos individuales a productos en una compra, después de preguntar por promociones.'),
  ('realizar pagos en la sección de cuentas por pagar.'),
  ('hola como puuedo hacer para pagar la cuota anual'),
  ('es que no veo la opción de guardar'),
  ('COMO SE INGRESA UNA FACTURA DE COMRPA'),
  ('registrar una deuda con un proveedor a crédito'),
  ('El usuario solicitó un certificado bancario'),
  ('vincular Sono QR.');

create temp table a_cerrar on commit drop as
select v.id, v.titulo
  from cubiertos c
  join bot_vacios v on v.estado = 'pendiente' and v.titulo = c.titulo;

do $$
declare r record;
begin
  -- Mismo cerrojo de siempre: cada título tiene que identificar exactamente UN
  -- vacío pendiente. Si uno no aparece, es que ya lo cerraron o cambió, y
  -- cerrar "lo que sí se pudo" deja un estado que nadie pidió.
  for r in
    select c.titulo, count(a.id) as n
      from cubiertos c left join a_cerrar a on a.titulo = c.titulo
     group by c.titulo having count(a.id) <> 1
  loop
    raise exception 'El título % identifica % vacíos pendientes y tiene que identificar 1. No se cerró nada.', r.titulo, r.n;
  end loop;
end $$;

do $$
declare r record;
begin
  for r in select id from a_cerrar loop
    perform resolver_vacio(r.id, null, 'barrido 2026-11-01');
  end loop;
end $$;

select estado, count(*) as vacios from bot_vacios group by estado order by 1;

commit;
