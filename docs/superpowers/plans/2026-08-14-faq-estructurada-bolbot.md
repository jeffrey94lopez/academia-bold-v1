# FAQ estructurada del bot (Pregunta base · Variaciones · Respuesta) — Plan

**Goal:** Convertir el bloque "Pregunta frecuente" (bot_faq) en uno estructurado: **Pregunta base**, **Variaciones** (oculto, solo recuperación, con sugerencias desde preguntas reales), **Respuesta**, y un toggle **"Mostrar en la lección (acordeón)"**.

**Arquitectura:** el bloque se guarda en `contenido` (JSON) como `{type:'bot_faq', pregunta, variaciones, respuesta, mostrar_acordeon}`. Compatibilidad hacia atrás con el formato viejo `{type:'bot_faq', content}`.

## Global Constraints
- Rama `sandbox`; deploy a `master` al final con visto bueno.
- Tras cada tanda de código: `node --check` + `node --test tests/*.test.mjs` (baseline 183).
- Lógica pura → módulo import-safe + test (patrón del repo).
- Compatibilidad: los bot_faq viejos (con `content`) siguen funcionando en embedding, n8n y render.
- Las **Variaciones nunca** se muestran al estudiante ni entran a la respuesta del bot; solo al embedding.

## Modelo de datos (bot_faq v2)
`{ type:'bot_faq', pregunta:'', variaciones:'', respuesta:'', mostrar_acordeon:false }`
Helper de lectura (fallback): si no hay `pregunta`/`respuesta` pero hay `content`, usar `content` como texto combinado.

---

### TANDA 1 — Pipeline: embedding + n8n (backend, con compat)
- **`js/lesson-embed-text.js`**: para `bot_faq`, embeber `pregunta + variaciones + respuesta` (si faltan, fallback a `content`). Resto de bloques bot_* igual.
- **`tests/lesson-embed-text.test.mjs`**: bot_faq estructurado embebe los 3 campos; bot_faq viejo (content) sigue embebiendo.
- **n8n "Construir prompt"** (workflow Bold POS Chat): `bot_faq` → `[FAQ: P: {pregunta} R: {respuesta}]`; fallback `[FAQ: {content}]`. Las variaciones NO van al prompt. (Aplicar por API, con el cuidado de escapar `\n` como backslash+n y filtrar `settings`.)
- Verificar `node --test` (nuevos tests verdes).

### TANDA 2 — Editor del bloque en el admin
- **`js/admin.js` `blockItemHtml`**: para `bot_faq`, reemplazar el textarea único por: input **Pregunta base** (`data-field="pregunta"`), textarea **Variaciones** (`data-field="variaciones"`) con nota "no se muestra al estudiante", textarea **Respuesta** (`data-field="respuesta"`), y un checkbox **"Mostrar en la lección (acordeón)"** (`data-field="mostrar_acordeon"`). Precargar valores; si el bloque viejo trae `content`, mostrarlo en Respuesta como migración suave.
- **defaults** (`bot_faq`): `{ type, pregunta:'', variaciones:'', respuesta:'', mostrar_acordeon:false }`.
- **Wiring** (`renderBlockList`): el listener genérico usa `input.value`; agregar manejo de checkbox → `currentBlocks[idx][field] = input.checked` cuando `input.type==='checkbox'`.
- Verificar en navegador: crear/editar un bot_faq, los 3 campos + toggle persisten al guardar.

### TANDA 3 — "Sugerir desde preguntas reales"
- **`js/faq-suggest.js`** (o helper): dado un `category`, traer de `bodi_conversations` las preguntas que fallaron (`bot_no_info` o `knowledge_gap`) de esa categoría — `first_user_msg`/`summary`, recientes, dedup. Lógica pura de dedup/normalización → testeable.
- **`js/admin.js`**: botón "Sugerir desde preguntas reales" en el bloque bot_faq → consulta por la categoría de la lección, muestra las preguntas como chips; al hacer clic en una, se agrega al textarea de Variaciones.
- Verificar en navegador con una categoría real.

### TANDA 4 — Acordeón en el portal
- **`js/block-renderer.js`**: `renderBlocks` hoy salta todo bot_*. Excepción: `bot_faq` con `mostrar_acordeon` truthy → renderizar un acordeón nativo `<details><summary>{pregunta}</summary>{respuesta}</details>` (respuesta con saltos → párrafos; sin variaciones). Los demás bot_* y los bot_faq sin toggle siguen ocultos.
- Estilo con los tokens Merlin (borde `--blue-10`, etc.), accesible (details nativo).
- Verificar en el portal (una lección con un bot_faq acordeón ON y otro OFF).

### TANDA 5 — Verificación e2e + deploy
- Crear un bot_faq estructurado en una lección real, re-embeber, y probar por el webhook que el bot engancha una variación y responde con la respuesta.
- Confirmar acordeón visible/oculto según toggle.
- Deploy a `master` (FF).

## Pasos MANUALES del usuario
- Ninguno de base/datos (no hay migración SQL nueva). El n8n lo aplico yo.
- Tras crear/editar FAQs: **Re-embeber** (guardar la lección o "Re-embeber todo").
