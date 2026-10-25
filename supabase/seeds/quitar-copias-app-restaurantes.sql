-- Quita de restaurantes las dos copias de la App. 2026-10-08.
--
-- clasificar-lecciones-ambas.sql creó cinco copias apagadas en restaurantes.
-- Dos no aplican por ahora: las versiones móviles de factura electrónica y
-- comprobante. Se borran.
--
-- Las otras TRES se quedan, apagadas, a propósito:
--   · Venta por medio de factura electrónica (web)
--   · Venta por medio de comprobante (web)
--   · Cómo gestionar créditos y apartados
--
-- No son residuo: son el pendiente. Alguien del equipo tiene que escribir el
-- detalle real de la facturación en restaurantes, y estas filas son el lugar
-- donde va. Mientras tanto, la respuesta corta ya vive en «Creación de pedido»
-- (paso del cobro + el bloque bot_faq que se agregó el 2026-10-08), y el bot
-- responde desde ahí a las preguntas genéricas ("cómo facturo").
--
-- Lo que NO resuelve: una pregunta que repita el título de la lección de retail
-- ("cómo hago una factura electrónica") sigue ganándole a «Creación de pedido»,
-- porque esa lección trata de eso y nada más, mientras que la de pedido reparte
-- su vector entre abrir mesa, agregar productos, imprimir y cobrar. El bot
-- ofrece entonces cruzar a retail, rotulado como contenido de otra vertical.
-- Eso se cierra cuando estas lecciones tengan contenido propio y embedding.
--
-- Seguro de correr dos veces.

delete from public.lecciones
where vertical = 'restaurantes'
  and active = false
  and slug in (
    'venta-por-medio-de-factura-electronica-desde-la-app-bold-pos-restaurantes',
    'venta-por-medio-de-comprobante-desde-la-app-bold-pos-restaurantes'
  );

-- Deben quedar 3, todas sin embedding (invisibles para el portal y para el bot).
select titulo, plataforma, embedding is null as sin_embedding
from public.lecciones
where vertical = 'restaurantes' and active = false
order by titulo;
