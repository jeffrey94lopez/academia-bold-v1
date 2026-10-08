# Workflow `Bold POS Chat` — nodos Code

El workflow vive en n8n (`n8n.mplasesores.com`, id `dZGuYJbRbG6h8aqv`), **no en
este repo**. Lo que hay acá es una transcripción del `jsCode` de sus dos nodos
Code, que son donde está toda la lógica y lo único que se lee y se diffea de
verdad.

**Esto es una copia, no la fuente.** Si alguien edita el workflow desde la UI de
n8n, estos archivos quedan viejos sin avisar. Antes de razonar sobre el bot,
bajá el workflow por la API y compará.

Transcripción del **2026-10-06**, ronda 4 del cruce entre verticales, aplicada y
verificada contra el webhook en producción.

## Los dos nodos

- **`construir-prompt.js`** — arma el system prompt. Lee las lecciones de los dos
  nodos de búsqueda **por nombre** (`$('Buscar lecciones')` y
  `$('Buscar en otra vertical')`): un nodo conectado no lo alimenta solo.
  Resuelve la lección aceptada en un cruce y recalcula `docContent` con ella.
- **`formatear-respuesta.js`** — parsea lo que devolvió el modelo y **decide el
  cruce**. La decisión vive acá y no en `construir-prompt` (que es donde la puso
  el plan original): cuando se escribió el plan se creía que el cruce se ofrecía
  al no encontrar nada propio, y medirlo mostró que eso no distingue nada. Ver
  `docs/superpowers/plans/2026-10-02-cruce-vertical-bot.md`.

## La regla del cruce, en una línea

```js
soportaCruce && !aceptado && vieneDelModelo && !derivaASoporte
  && otras.length && otras[0].similarity > mejorPropia
```

Cada término está ahí por algo:

- `soportaCruce` — la puerta de versión (`supports_cross` en el body). n8n está
  en producción y el portal no: sin esta puerta el bot ofrecería "¿quieres
  verla?" a comercios reales **sin botones para contestar**.
- `!aceptado` — en el turno de la aceptación no se vuelve a ofrecer.
- `vieneDelModelo` — si el modelo no devolvió JSON parseable, el turno ya está
  degradado y el cruce no tiene nada que hacer.
- `!derivaASoporte` — un usuario frustrado al que ya mandamos a soporte no
  necesita una pregunta más.
- `otras[0].similarity > mejorPropia` — **comparación, no umbral fijo.** Se
  ofrece el cruce solo si la lección de la otra vertical le gana a la mejor
  propia. Un umbral absoluto no sirve: medido contra producción, las preguntas
  genéricas de un restaurante (impresora, factura, reportes) cruzaban con
  márgenes de +0.08 a +0.13, y el caso legítimo (mesas desde retail) daba +0.094
  — justo en medio. Ningún número los separa.

Esa medición es también lo que motivó clasificar el contenido
(`supabase/seeds/clasificar-lecciones-ambas.sql`): el cruce dispara en falso
porque a restaurantes le faltaban lecciones, no porque el umbral esté mal.

## Al editar por la API

- El campo del body de un HTTP Request es `parameters.body`, **no** `jsonBody`.
- En el `PUT` hay que filtrar `settings` a las claves que acepta la API pública.
- Un `\n` dentro de un string JS debe quedar como barra invertida + `n` literal.
- Respaldo antes de tocar nada.
- Un token mal extraído da `Unauthorized [line 4]`, que **no** es el bot roto.
