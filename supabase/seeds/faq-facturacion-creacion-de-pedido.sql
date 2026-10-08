-- Bloque «pregunta frecuente» para el bot en «Creación de pedido». 2026-10-08.
--
-- Problema: un restaurante que pregunta "cómo hago una factura electrónica" no
-- encontraba respuesta y el bot le ofrecía cruzar a la lección de retail, cuyo
-- procedimiento es distinto. Pero la respuesta SÍ existe: está en esta lección,
-- en el paso del cobro ("Confirmar pago ... para registrar el cobro y generar
-- el comprobante o factura electrónica").
--
-- Por qué no la encontraba: el embedding se arma con título + categoría + los
-- pasos + los bloques bot_* + notas (js/lesson-embed-text.js). La descripción
-- NO entra. Y en los pasos la facturación es una sola cláusula dentro de un
-- texto dominado por abrir mesa y agregar productos, así que el vector no
-- engancha con la pregunta. Un bloque bot_faq existe justo para esto: sus
-- variaciones son frases alternativas que alimentan la recuperación.
--
-- El `contenido` de abajo lo generó js/gap-faq-block.js (contenidoConFaq), que
-- se niega a devolver menos bloques de los que había. Verificado: 10 bloques
-- antes, 11 después, el nuevo al final.
--
-- IMPORTANTE: después de correr esto hay que REGENERAR EL EMBEDDING de la
-- lección, o no sirve de nada. El texto nuevo no llega al vector solo.
--
-- Correr UNA vez. Si ya se corrió, el WHERE lo deja sin efecto.

update public.lecciones
set contenido = '[{"type":"step","text":"<p><strong>Abrir la mesa e iniciar el pedido</strong></p><ol><li>En el menú lateral izquierdo, ingresa a <strong>Punto de venta</strong> &gt; <strong>Mesas</strong>.</li><li>En la parte superior, selecciona la <strong>Zona</strong> correspondiente y haz clic en la <strong>Mesa</strong> asignada.</li><li>Haz clic en el botón <strong>Iniciar pedido</strong> (ubicado a la derecha de la pantalla).</li><li>Ingresa la cantidad de personas y haz clic en <strong>Abrir mesa</strong> (la mesa cambiará a color rojo marcándose como ocupada).</li></ol>"},{"type":"image","url":"https://tczcngfhuendmldafbrc.supabase.co/storage/v1/object/public/material/image-1790039226589.png","caption":""},{"type":"step","text":"<p><strong>Agregar productos al pedido</strong></p><ol><li>Haz clic en <strong>Agregar productos</strong>.</li><li>Selecciona los ítems usando el buscador (por nombre, código o referencia) o navegando por las <strong>categorías</strong> en la parte superior.</li><li>Al hacer clic en los productos, se irán sumando al listado de la derecha.</li><li><em>(Opcional)</em> Ajusta las cantidades o añade notas personalizadas a los productos si el cliente lo requiere.</li><li>Haz clic en <strong>Guardar cambios del pedido</strong>.</li></ol>"},{"type":"image","url":"https://tczcngfhuendmldafbrc.supabase.co/storage/v1/object/public/material/image-1790039576754.png","caption":""},{"type":"image","url":"https://tczcngfhuendmldafbrc.supabase.co/storage/v1/object/public/material/image-1790039792749.png","caption":""},{"type":"step","text":"<p><strong>Imprimir comanda</strong></p><ol><li>Haz clic en <strong>Imprimir comanda</strong> (esquina inferior derecha).</li><li>Selecciona si deseas imprimir la comanda completa o únicamente los nuevos cambios guardados.</li><li>Procede a la pantalla de impresión del sistema.</li></ol>"},{"type":"image","url":"https://tczcngfhuendmldafbrc.supabase.co/storage/v1/object/public/material/image-1790040116592.png","caption":""},{"type":"step","text":"<p><strong>Procesar el pago y cerrar la cuenta</strong></p><ol><li>Cuando el cliente pida la cuenta, haz clic en <strong>Solicitar cuenta</strong> (esquina inferior derecha) para pasar a la pantalla de <em>checkout</em>.</li><li>Asigna o verifica los siguientes datos:</li></ol><ul><li class=\"ql-indent-1\"><strong>Mesero</strong> y <strong>Cliente</strong> (consumidor final o registro nuevo).</li><li class=\"ql-indent-1\"><strong>Propina:</strong> activa/inactiva la opción o ajusta el porcentaje si aplica.</li><li class=\"ql-indent-1\"><strong>Método de pago:</strong> selecciona la forma de pago, ingresa el monto recibido y añade observaciones si es necesario.</li></ul><p><em>       3.(Opcional)</em> Si el cliente solicita la <strong>Precuenta</strong>, haz clic en el botón correspondiente en la parte superior derecha para imprimirla.</p><p>       4.Haz clic en el botón rojo <strong>Confirmar pago</strong> (esquina inferior derecha) para registrar el cobro y generar el comprobante o factura electrónica.</p><p><br></p>"},{"type":"image","url":"https://tczcngfhuendmldafbrc.supabase.co/storage/v1/object/public/material/image-1790040582371.png","caption":""},{"type":"image","url":"","caption":""},{"type":"bot_faq","pregunta":"¿Cómo genero una factura electrónica o un comprobante?","variaciones":"cómo facturo\ncómo hago una factura\ndónde saco el comprobante\nfacturación electrónica en restaurantes","respuesta":"Al cerrar la cuenta de la mesa, en Confirmar pago se genera el comprobante o la factura electrónica.","mostrar_acordeon":false}]'
where id = 'c14e2aa5-0be5-47f4-8c7a-9f96c81301af'
  and contenido not like '%bot_faq%';

select jsonb_array_length(contenido::jsonb) as bloques,
       contenido like '%bot_faq%'           as tiene_faq
from public.lecciones
where id = 'c14e2aa5-0be5-47f4-8c7a-9f96c81301af';
