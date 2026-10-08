-- Clasificación de contenido compartido entre verticales. 2026-10-06.
--
-- Motivo: restaurantes tiene 8 lecciones y retail 35, pero solo DOS de las de
-- restaurantes son contenido propio (Gestión de mesas, Creación de pedido);
-- las otras seis son copias idénticas de retail. El desbalance hace que el
-- cruce entre verticales del bot dispare en falso: midiendo
-- restaurantes→retail, 4 de 4 preguntas genéricas (impresora, factura,
-- reportes, usuario) cruzan y descartan la respuesta correcta. Ningún umbral
-- separa esos falsos del caso legítimo (mesas desde retail, +0.094, que cae
-- justo en medio). Se arregla clasificando el contenido, no moviendo el umbral.
--
-- Revisado con el equipo el 2026-10-06. Fuera de esta lista quedan, a
-- propósito:
--   · Las 4 de Ventas (factura electrónica y comprobante, web y app): el flujo
--     es distinto en restaurantes. Se copian apagadas más abajo (ver el
--     segundo bloque): restaurantes no tiene NADA sobre facturación.
--   · Variantes, Órdenes, Devoluciones, Lista de precios, Cotizaciones: retail.
--   · Las 6 duplicadas (ajuste de inventario, apertura/cierre de turno, ítems
--     individual y masivo, registro de gastos): marcar la copia de retail como
--     'ambas' las mostraría DOS VECES al restaurante.
--
-- `vertical = 'ambas'` ya lo entienden el portal (aplicaA en js/vertical.js) y
-- el bot (match_lessons). No hay que re-embeber nada: el embedding no cambia.
--
-- Idempotente. Correr en el SQL Editor de Supabase.

-- ── 17 lecciones a «Ambas» ───────────────────────────────────────────────────
update public.lecciones
set vertical = 'ambas'
where id in (
  -- Configuración (6) — se configura igual en los dos tipos de negocio
  'e23bd175-915e-4fe0-b3ad-b81cdecc7fb8',  -- Actualización de nueva resolucion
  '652ba0e1-e760-4d91-9fcb-627f7d991539',  -- Asociar facturación electrónica: Set de Pruebas
  '3d71c848-3d83-4277-a2e8-abc5b1e1c721',  -- Asociar la resolución de facturación
  '8f4e09f2-ad8c-4055-bef4-ee2ff6a1a98c',  -- Configuración de impresora térmica y cajón monedero
  '7b96e765-0a39-4917-b312-aca6a5132170',  -- Formato de impresión
  'e2d3f50f-ba9d-4cd9-b150-98025b96abf4',  -- Integración datafono Smart Pro
  -- Ingresos (4)
  'ad324f49-2de8-4a1b-9c76-3118293fd75b',  -- Creación de notas crédito
  '1f9e98d2-6bb5-4f74-80cc-965e24227e17',  -- Creación de notas debito
  'd4b37d86-1a37-469b-b532-9730fed3d588',  -- Creación de recibos
  'b0abf82f-656e-4cb6-be1f-be93f962a094',  -- Creación de recibos desde la App
  -- Egresos (3)
  'ecfaf9af-9553-4da4-a1ca-e99c305a91ac',  -- Anulación de gastos
  'fee1154e-0b59-4a15-bbf8-628e7bc5d62e',  -- Creación de documento soporte
  '04aadf5a-2107-454f-a198-fcc23f3d0f54',  -- Crear y gestionar gastos en la app
  -- Contactos (1)
  '4ffa465e-3e96-48d9-8a63-a092cedb0ca3',  -- Creación de clientes y proveedores
  -- Reportes (1)
  '0611b5e8-b8f7-47b0-8592-3be1780e5fb5',  -- Reportes de Bold Pos
  -- Ventas, solo app (2) — restaurantes no tiene versión móvil de estas
  '97f19756-7fa1-4f68-ab78-efad3912fd00',  -- Apertura y cierre de turno desde la App
  '08cf5e47-2884-4544-8f58-0f0ecbbe7e2d'   -- Creación de clientes y proveedores desde la App
);

-- ── Copias para restaurantes, APAGADAS ───────────────────────────────────────
-- Cinco lecciones de retail cuyo procedimiento NO sirve tal cual a un
-- restaurante, pero cuya pregunta un restaurante sí hace. No se marcan 'ambas':
-- se copian para que alguien las adapte.
--
--   · Créditos y apartados      — el flujo funciona distinto.
--   · Factura electrónica y comprobante (web y app) — restaurantes no tiene
--     NADA sobre facturación. Sin estas copias, "¿cómo facturo?" se queda sin
--     respuesta, y con el cruce activo el bot ofrecería el procedimiento de
--     retail, que es el equivocado: justo el falso positivo que este trabajo
--     busca eliminar.
--
-- Nacen invisibles por partida doble, y las dos hacen falta:
--   · active/bot_active = false  → no salen en el portal.
--   · embedding = null           → el bot NO las ve. match_lessons no mira
--                                  `active` ni `bot_active` (ver memoria
--                                  "Visibilidad en el bot = embedding"), así
--                                  que sin esto el bot las citaría igual.
--
-- Al re-embeberlas (botón del admin) se vuelven visibles para el bot: ese es el
-- gatillo de "ya está adaptada". Hacerlo SOLO entonces.
insert into public.lecciones
  (id, titulo, descripcion, contenido, orden, categoria, notas, examen,
   active, bot_active, dispositivo, vertical, plataforma, embedding,
   curso_orden, slug)
select
  gen_random_uuid(),
  l.titulo,
  l.descripcion,
  l.contenido,
  l.orden,
  l.categoria,
  l.notas,
  l.examen,
  false,                 -- active
  false,                 -- bot_active
  l.dispositivo,
  'restaurantes',
  l.plataforma,
  null,                  -- embedding
  l.curso_orden,
  l.slug || '-restaurantes'
from public.lecciones l
where l.id in (
  'c991c719-4257-4d6d-93d6-3e71f5ee521e',  -- Cómo gestionar créditos y apartados
  'fc5790c7-db32-43bd-aa08-0e547c45d3ce',  -- Venta por medio de factura electrónica
  'f3e1a5c7-22e8-4268-9801-8dda52a044ad',  -- Venta por medio de factura electrónica (App)
  '2a896917-83c3-4b19-8c38-1aff5e027896',  -- Venta por medio de comprobante
  '138bdb23-bc84-452d-aed4-b609f4c08214'   -- Venta por medio de comprobante (App)
)
  -- Idempotencia: el slug es unique, y re-correr el script no debe duplicar.
  and not exists (
    select 1 from public.lecciones x where x.slug = l.slug || '-restaurantes'
  );
