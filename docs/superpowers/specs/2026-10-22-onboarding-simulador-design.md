# Recorrido guiado de Bold POS (simulador de onboarding) — diseño

Fecha: 2026-10-22 · Estado: borrador para aprobación · Alcance: MVP, solo retail

## Por qué

Bold POS abrió un self service: el comercio crea su cuenta y compra la plataforma
sin pasar por un agente de ventas. Antes el agente hacía la inducción; ahora no
hay ninguna. El cliente nuevo aprende a prueba y error, escribe a soporte por chat
o le pregunta a BolBot.

Academia Bold vive embebida en un iframe dentro del POS (MFE de Ayuda) y no toca
la cuenta del cliente. Eso permite enseñar **haciendo** sin ensuciar la cuenta: un
simulador donde el cliente hace los clics y llena datos ficticios, en vez de crear
ventas de prueba reales (que además generan facturas electrónicas ante la DIAN).

## Qué es

Un recorrido paso a paso, estilo "ventanitas que te guían" de las apps modernas,
sobre una **réplica interactiva** de las pantallas de Bold POS retail. Burbujas
señalan cada control ("toca aquí", "esto hace tal cosa") y el cliente hace los
clics y escribe de verdad, pero nada sale del navegador salvo la telemetría.

## Metas

1. El cliente recién registrado aprende a: crear un ítem, encontrarlo en su lista
   de productos, hacer una venta, registrar un gasto, y ver el historial de ventas
   y de inventario.
2. Medir **cuántos terminan el recorrido** (métrica de éxito elegida por el
   usuario) y dónde abandonan.
3. Que el cliente pueda preguntarle a BolBot lo que el recorrido no cubre, sin
   salirse del paso en que va.

## No‑metas (MVP)

- Restaurantes (mesas, comandas). Va después; el diseño no debe impedirlo.
- Móvil / tablet. Los clientes usan Bold POS mayormente en computador (dicho por
  el usuario). En pantallas angostas el recorrido muestra "Este recorrido se ve
  mejor en computador" con dos opciones: continuar igual o saltarlo (queda para
  retomar desde Ayuda). No se adapta la réplica a pantallas chicas en el MVP.
- Tocar la cuenta real del cliente o hablar con la API de Bold.
- Editor en el admin para armar recorridos. Los pasos van en código.
- Fidelidad pixel‑perfect. Debe *reconocerse* como Bold POS, no ser idéntico.

## Anti‑metas (falla aunque "funcione")

- Que el cliente crea que hizo una venta real o que su producto quedó creado en su
  cuenta. Debe quedar claro todo el tiempo que es una práctica.
- Que el simulador enseñe un flujo distinto del real (botones en otro lugar, pasos
  que no existen). Si Bold cambia su UI, el recorrido tiene que ser fácil de
  ajustar.
- Que sea un trámite largo que el cliente no puede saltar.

## Arranque y retomar

- **Lanzamiento:** Bold lo abre solo al terminar la creación de la cuenta, cargando
  la página del recorrido **como iframe dentro de pos.bold.co** (en un modal de
  pantalla completa), igual que hoy embebe Academia en Ayuda. *Decisión mía:* tiene
  que ser iframe bajo el mismo sitio para que el recorrido y Ayuda compartan el
  `localStorage` particionado (si se abriera como pestaña propia en nuestro dominio,
  la tarjeta de "retomar" en Ayuda nunca vería el avance). La integración del lado
  de Bold es trabajo de Bold.
- **Contrato con Bold (parte del alcance):** escribir el requerimiento para Bold en
  `docs/integracion-bold/`, como se hizo con `bold:open-lesson`. Mensajes:
  - Bold → Academia: la URL del recorrido + el `bold:context` existente.
  - Academia → Bold: `academia:onboarding-close` con `{ reason: 'skip' | 'complete' }`
    para que Bold cierre el modal, y `academia:navigate` con `{ to: 'items' }` para
    el botón final "Crear mi primer producto de verdad". Sin esto los botones de
    salida no hacen nada dentro del iframe; mientras Bold no lo implemente, el
    recorrido muestra "ya puedes cerrar esta ventana".
- **Filtro por vertical (decisión mía):** si `bold:context` llega con vertical
  restaurantes, el recorrido muestra una pantalla corta "pronto tendremos tu
  recorrido" y manda `academia:onboarding-close {reason:'no_aplica'}`. Si no llega
  contexto, se asume retail.
- **Saltar:** botón "Saltar recorrido" visible en todo momento. Saltar no borra el
  avance.
- **Retomar desde Ayuda:** en el portal de Academia (lo que Bold muestra en Ayuda)
  aparece una tarjeta "Continúa tu recorrido (paso N de 6)" si hay avance sin
  terminar, que abre el recorrido donde iba. Si ya lo terminó, una entrada
  permanente "Recorrido guiado" permite repetirlo desde cero.

## El recorrido (6 pasos, una sola historia)

El cliente escribe **sus propios datos** (no siempre vende camisetas) y esos datos
viajan por todo el recorrido: lo que crea en el paso 1 es lo que ve en la lista, lo
que vende, y lo que aparece en los historiales. Cada campo trae un ejemplo
sugerido (placeholder + botón "usar ejemplo") para quien no sabe qué poner.

Referencia: pantallas reales de `pos.stg.bold.co` (cuenta demo), exploradas el
2026-10-22. Capturas de referencia guardadas fuera del repo; el builder debe
re‑explorar la demo si necesita detalle (ver "Referencia visual").

0. **Bienvenida.** Qué va a aprender, ~5 minutos, aviso claro de que es una
   práctica y nada se guarda en su cuenta. Botones: Empezar / Saltar.

1. **Crear un ítem** — Menú lateral ÍTEMS → *Lista de ítems* → botón rojo
   *+ Nuevo ítem* → formulario *Crear ítem*.
   - Obligatorios a enseñar: *Nombre del ítem*, *Categoría* (por defecto
     "General"), *Precio base*, *Impuesto* (opciones reales: Exento, IVA 5%,
     IVA 19%, Excluido, INC 8%). *Precio total de venta* se calcula solo
     (precio base + impuesto; 20.000 + IVA 19% = 23.800) — la burbuja lo señala.
   - *Costo* (opcional, se recomienda: alimenta la utilidad).
   - Panel derecho *Disponibilidad*: activar *Ítem con existencias (Unidades)*,
     marcar la sucursal y escribir las existencias. En el simulador hay una sola
     sucursal ficticia.
   - Campos que existen pero no se exigen (se muestran, sin burbuja o con una
     mención): descripción, código (Bold lo autogenera al guardar, p.ej.
     I‑17927283390), unidad, referencia, imagen, listas de precios, variantes.
   - *Crear ítem* → toast "El ítem fue creado exitosamente".

2. **Ver tus productos** — *Lista de ítems* con el ítem del cliente arriba
   (columnas reales: Código, Nombre/Descripción, Referencia, Precio, Existencia,
   Tipo, Activo, editar). Burbujas: dónde ver precio y existencia, el switch
   *Activo*, el lápiz para editar, el buscador. La lista lleva 3–4 ítems de
   relleno para que se vea realista.

3. **Hacer una venta** — botón *+ Nueva venta* → pantalla POS: cuadrícula de
   productos con precio, buscador, carrito a la derecha (resolución, lista de
   precios, cliente), totales (subtotal, descuento, IVA) y botón *Vender $X*.
   - Tocar el producto lo agrega al carrito. Enseñar que tocarlo de nuevo agrega
     **otra línea** (así se comporta el real) y que la cantidad se cambia en la
     casilla de la línea.
   - *Vender* → panel *Resumen de venta* + *Método de pago* (Bold, Efectivo,
     Credibanco, Nequi, Sistecredito, QR, Mixto, Crédito). El recorrido guía por
     **Efectivo**: monto recibido y *Opciones rápidas*; *Pagar*.
   - Pantalla *Venta completada* con el total, opciones de enviar por correo /
     WhatsApp, *Imprimir factura*, *Nueva venta*. En el simulador esos botones no
     envían nada; la burbuja explica para qué sirven.
   - Se descuentan las existencias del ítem en el estado del simulador.

4. **Registrar un gasto** — EGRESOS → *Gastos* (lista) → *+ Nuevo gasto*.
   Campos: Proveedor (opcional), *Método de pago*, *Categoría* (p.ej. Servicios
   públicos, Transporte, Nómina, Aseo, Mantenimiento y reparaciones), *Valor del
   gasto*, *Fecha del gasto*, *Asociar al turno* (switch, encendido), Observaciones
   y Nota interna. *Crear gasto* → detalle *Gasto No. N*. La burbuja explica que
   al ir asociado al turno afecta el cierre de caja.

5. **Ver el historial de ventas** — INGRESOS → *Facturas de venta*: lista con la
   venta del cliente arriba (número, cliente, fechas, estado DIAN *Aceptada*,
   *Contado*, *Pagada*, total). Abrir el detalle: ítems, totales, CUFE, método de
   pago, recibo. Burbujas: filtros (fecha, forma de pago, estado de pago), qué
   significa cada etiqueta.

6. **Ver el historial de inventario** — ÍTEMS → *Flujo de inventario*: la fila de
   **Entrada** (existencias iniciales del paso 1) y la de **Salida** en rojo por
   la venta, con la *Existencia* resultante (p.ej. 10 → 8). Cierre: así se audita
   por qué cambió el inventario.

**Cierre:** pantalla de felicitación con resumen de lo aprendido, botón para ir a
su cuenta real ("Crear mi primer producto de verdad") que cierra el recorrido, y
enlaces a lecciones de Academia relacionadas.

## La réplica de Bold POS

- Pantallas dibujadas en HTML/CSS (no capturas), para que los campos se puedan
  escribir y los botones clicar. Look de Bold: azul marino de marca, botones
  primarios rojos/rosados redondeados, menú lateral con las secciones reales
  (HOME, PUNTO DE VENTA, INGRESOS, EGRESOS, ÍTEMS, Clientes, Proveedores,
  Reportes, Ajustes, Ayuda), barra superior con logo y nombre del negocio.
- Solo es interactivo lo que el paso pide; el resto del menú y botones se ven pero
  no hacen nada (o muestran "en este recorrido no vamos aquí").
- Cada pantalla debe ser un componente aislado y los textos/rótulos centralizados,
  para que cuando Bold cambie su UI se ajuste en un solo lugar.
- Todo vive en memoria del navegador; ninguna llamada a Bold.

## Guía (burbujas)

- Burbuja anclada al elemento, con oscurecido del resto y el elemento resaltado.
- El paso avanza cuando el cliente hace la acción (no con "Siguiente"), salvo en
  burbujas puramente explicativas.
- Validación amable: si deja un obligatorio vacío, la burbuja lo dice, igual que
  el formulario real marca "Este campo es requerido".
- Barra de progreso "Paso N de 6" + *Saltar recorrido* siempre visibles.
- Español de Colombia, montos en pesos con separador de miles como en Bold
  (`$ 23,800`).

## BolBot dentro del recorrido

- Botón flotante "¿Tienes una duda?" en todos los pasos; abre el BolBot existente
  de Academia en un panel lateral sin perder el paso.
- Reutiliza el chat actual (`js/assistant.js`, proxy `api/chat.js`, workflow n8n
  "Bold POS Chat"); no es un bot nuevo.
- El mensaje al webhook incluye el paso actual (p.ej. `onboarding_step:
  "crear_item"`) para que la respuesta tenga contexto, y las conversaciones
  quedan marcadas con origen `onboarding` para filtrarlas en el dashboard.
- El ajuste del prompt en n8n para usar ese contexto es parte del alcance, pero
  mínimo: si el campo no se usa, el bot igual responde como hoy.
- *Decisión mía sobre el alcance:* marcar el origen requiere una columna nueva
  (p.ej. `origin`) en la tabla de conversaciones del bot, con migración en
  sandbox primero. En el dashboard de BolBot basta un filtro "solo onboarding".
  Cualquier cambio al workflow n8n de producción o a la base de producción se
  confirma con el usuario antes de aplicarlo.

## Medición

Eventos con el `track()` existente (`js/analytics.js` → `analytics_events`):
`onboarding_start`, `onboarding_step_complete` {step}, `onboarding_skip` {step},
`onboarding_resume` {step}, `onboarding_complete`, `onboarding_bot_open` {step}.
Payload con `vertical: 'retail'`, un `run_id` (uuid generado al empezar o al
repetir desde cero) y la cuenta de Bold (`accountId`) si llegó `bold:context`.

*Decisión mía:* la unidad del embudo es **una corrida** (`run_id`); cuando hay
`accountId` el embudo puede deduplicar por cuenta. El avance en `localStorage` se
guarda bajo una clave que incluye el `accountId` cuando existe, para que dos
comercios en el mismo navegador no mezclen avance (solo el id, nunca nombre ni
correo — `bold-context.js` evita persistir identidad a propósito).

En el admin: una tarjeta de **embudo** en la analítica existente — cuántos
empezaron, cuántos completaron cada paso, cuántos terminaron, dónde saltaron, y
cuántos abrieron el bot por paso. No un dashboard nuevo.

## Cómo se construye (decisiones mías, sobre el stack existente)

- Página nueva de Academia (p.ej. `/onboarding`), mismo stack: HTML + JS vanilla
  en módulos ES, Tailwind precompilado (`css/tw.css` — ojo, clases nuevas exigen
  regenerarlo), Supabase, Vercel. Sin frameworks nuevos.
- Avance guardado en `localStorage` (paso actual + datos ficticios escritos). Es
  suficiente para el MVP; el iframe vive bajo `pos.bold.co`, así que el almacenamiento
  queda particionado a ese sitio y persiste entre sesiones en el mismo navegador.
  Retomar en otro navegador/equipo queda fuera del MVP.
- Respeta las reglas existentes de embebido: `bold-context.js` (orígenes
  permitidos), CSP de `vercel.json`, `academia:ready`.

## Lo que queda al builder

- Estructura de archivos, motor de pasos, librería o no para las burbujas (sin CDN
  fuera de los permitidos por el CSP).
- Cómo se ven exactamente las pantallas, dentro del look de Bold.
- Textos de las burbujas (cortos, segunda persona, tuteo).
- Si el portal de Academia muestra la tarjeta de "retomar" en la pestaña inicial o
  como banner.

## Referencia visual

Cuenta demo de Bold POS en `https://pos.stg.bold.co` (retail). Rutas vistas:
`#/retail/inventory/item`, `#/retail/inventory/item/create`, `#/retail/pos/sale`,
`#/retail/expenses/expense`, `#/retail/expenses/expense/create`,
`#/retail/income/e-invoices`, `#/retail/inventory/ledger`. En la demo quedaron
datos de la exploración: ítem "Prueba Claude Camiseta", factura SETT 3409603,
gasto No. 443.

## Pendientes conocidos

- Integración del lado de Bold (cuándo y cómo cargan la URL al terminar el
  registro): hay que escribirles el requerimiento.
- Restaurantes: segunda versión.
