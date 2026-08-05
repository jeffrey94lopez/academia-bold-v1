# Remediación de auditoría (Tandas 1–4) — Plan de implementación

> **Para trabajadores agénticos:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendada) o superpowers:executing-plans para implementar tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Cerrar las oportunidades de mejora del informe de validación 2026-08-04 (portal + admin, excluyendo cursos), organizadas en 4 tandas de menor a mayor riesgo.

**Architecture:** JS vanilla ESM sin bundler; Supabase por CDN en el navegador; Vercel (CSP en `vercel.json`); bot vía n8n. Patrón del proyecto: la lógica pura se extrae a módulos import-safe (sin importar supabase) para testearla con `node --test` en `tests/*.test.mjs`. Los cambios de UI/DOM se verifican con `node --check` + navegador.

**Tech Stack:** JavaScript ESM, Supabase (`@supabase/supabase-js@2`), Tailwind, Quill, node:test.

## Global Constraints

- **EXCLUIR cursos**: no tocar `course.js`, `course-tab.js`, `certificate.js`, exámenes, certificados, registro de estudiantes.
- Rama de trabajo: `sandbox`. Nada se despliega a `master` sin decisión explícita del usuario.
- Tras cada tarea de código: `node --check <archivo>` y `node --test tests/*.test.mjs` deben pasar (baseline actual: 176). No romper tests existentes.
- La lógica pura nueva se extrae a un módulo import-safe con su `.test.mjs` (patrón markdown.js / category-guard.js).
- Los tokens de diseño son los "Merlin" de `css/style.css` (`--blue-100`, `--success-*`, `--warning-*`, `--error-*`). No hardcodear colores fuera de esos tokens en código nuevo.
- **Pasos [MANUAL]**: las tareas marcadas así requieren acción del usuario fuera del repo (SQL en el SQL Editor de Supabase, variables de entorno en Vercel, token en n8n). El agente entrega el archivo/código; el usuario aplica. El MCP de Supabase de la sesión apunta a otro proyecto (Money-Travel), así que no puede correr SQL contra `tczcngfhuendmldafbrc`.
- **Decisiones tomadas (2026-08-04):** #1 RLS → endurecer ahora sin auth nueva. #2 EMBED_TOKEN → crear proxy serverless ahora.

---

## TANDA 1 — Quick wins (bajo riesgo, alto valor)

### Task 1: Borrar el panel de analytics viejo (código muerto) — [código]

**Files:**
- Modify: `js/admin-analytics.js` (borrar líneas 59–424; limpiar imports)

**Contexto:** `renderAnalyticsPanel` + `renderAnalyticsBody` + `renderSearchesSection` + `renderExamsSection` (líneas 59–424, ~365 líneas) fueron reemplazadas por `analytics-shell.js`. Verificado por grep: solo `renderResultsPanel` (líneas 5–57) se importa (`admin.js:7,239`). El bloque muerto arrastra el bug de truncado silencioso a 5000 eventos.

- [ ] **Step 1:** Borrar desde la línea 59 (`export async function renderAnalyticsPanel`) hasta el final del archivo (línea 424, cierre de `renderExamsSection`). Queda solo `renderResultsPanel`.
- [ ] **Step 2:** Limpiar imports ahora sin uso. Línea 2: `import { escapeHtml, exportCSV } from './utils.js'` → `import { escapeHtml } from './utils.js'` (`escapeHtml` sí lo usa `renderResultsPanel`; `exportCSV` no). Línea 3: borrar entera `import { rangeControlsHtml, wireRangeControls } from './analytics-ui.js'` (solo la usaba el código muerto).
- [ ] **Step 3:** `node --check js/admin-analytics.js` y `grep -rn "renderAnalyticsPanel\|exportCSV\|rangeControlsHtml\|wireRangeControls" js/` para confirmar cero referencias colgantes fuera de sus propias definiciones.
- [ ] **Step 4:** `node --test tests/*.test.mjs` (176 pasan).
- [ ] **Step 5:** Commit: `refactor(admin): borrar renderAnalyticsPanel muerto (~365 líneas) + imports sin uso`.

### Task 2: Script de test en package.json — [código]

**Files:**
- Modify: `package.json`

- [ ] **Step 1:** Añadir bloque `scripts`. El `package.json` actual solo tiene `devDependencies`:

```json
{
  "scripts": {
    "test": "node --test tests/"
  },
  "devDependencies": {
    "tailwindcss": "^3.4.17"
  }
}
```

- [ ] **Step 2:** Correr `npm test` y confirmar que ejecuta la suite (176 pasan).
- [ ] **Step 3:** Commit: `chore: npm test corre la suite (node --test tests/)`.

### Task 3: Accesibilidad del chat del bot — [código]

**Files:**
- Modify: `js/assistant.js` (~200, ~209, ~230–238)

**Contexto:** el textarea solo tiene placeholder, el botón enviar es solo-icono, y el hilo de mensajes / indicador de "escribiendo" no se anuncian a lectores de pantalla.

- [ ] **Step 1:** `#chatMessages` (línea 200): añadir `aria-live="polite"` y `aria-label="Conversación con bolbot"` al div.
- [ ] **Step 2:** `#typingIndicator` (línea 209): añadir `role="status"` y dentro un `<span class="sr-only">bolbot está escribiendo…</span>` (verificar que exista la utilidad `.sr-only` en `css/style.css`; si no, añadirla: `.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}`).
- [ ] **Step 3:** `#chatInput` (textarea, línea 230): añadir `aria-label="Escribe tu pregunta sobre Bold POS"`.
- [ ] **Step 4:** `#sendBtn` (línea 236): añadir `aria-label="Enviar mensaje"`.
- [ ] **Step 5:** `node --check js/assistant.js`; verificar en navegador que el chat sigue funcionando (enviar un mensaje).
- [ ] **Step 6:** Commit: `a11y(chat): labels del input/enviar + aria-live en el hilo y estado de escritura`.

### Task 4: Fijar la versión de Supabase (quitar CDN flotante) — [código]

**Files:**
- Modify: `js/supabase.js:1`

**Contexto:** `@supabase/supabase-js@2/+esm` resuelve al último v2 en cada carga → riesgo de romperse solo, sin caché estable, bloqueante para el primer render.

- [ ] **Step 1:** Determinar la versión que el CDN resuelve HOY (para no cambiar comportamiento): `curl -sI "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm"` o inspeccionar la URL resuelta; anotar la versión exacta (p. ej. `2.x.y`).
- [ ] **Step 2:** Cambiar la línea 1 a la versión pineada, p. ej.:

```js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm'
```

(usar la versión anotada en el Step 1, no un número inventado).
- [ ] **Step 3:** Verificar en navegador que el portal y el admin cargan y autentican bien (login admin + chat + lecciones).
- [ ] **Step 4:** Commit: `chore: pinear @supabase/supabase-js a versión exacta (sin CDN flotante)`.

### Task 5: El portal no descarga el `embedding` de cada lección — [código]

**Files:**
- Modify: `js/lessons.js:41` (`renderLessons`) y el `select` equivalente en `refreshLessons` (~551)

**Contexto:** `select('*')` trae la columna `embedding` (vector ~1536 floats, decenas de KB por lección) en la carga inicial del portal (iframe en pos.bold.co) aunque solo se pinta título/categoría. Columnas reales de `lecciones` (confirmadas por REST): `active, bot_active, categoria, contenido, created_at, descripcion, dispositivo, examen, id, notas, orden, plataforma, titulo, vertical` (+ `embedding`, la que se excluye).

- [ ] **Step 1:** En `renderLessons` (línea 41) reemplazar `.select('*')` por la lista explícita sin `embedding`:

```js
supabase.from('lecciones')
  .select('id, titulo, descripcion, categoria, contenido, orden, active, bot_active, vertical, plataforma, dispositivo, notas, examen, created_at')
  .eq('active', true).order('orden'),
```

- [ ] **Step 2:** Aplicar el mismo `select` explícito en `refreshLessons` (~551, leer el archivo para el punto exacto).
- [ ] **Step 3:** Verificar en navegador: las tarjetas de lección se pintan y al abrir una lección el `contenido` sigue disponible (no se rompió el render de bloques).
- [ ] **Step 4:** Commit: `perf(portal): no bajar la columna embedding en la carga de lecciones`.

> Nota: se mantiene `contenido` en el select inicial (bajo riesgo). La versión más agresiva — cargar `contenido` en diferido al abrir la lección — se deja como mejora futura por su mayor superficie de cambio.

---

## TANDA 2 — Seguridad

### Task 6: Endurecer RLS de las conversaciones del bot — [código + MANUAL]

**Files:**
- Create: `supabase/migrations/20260804_bodi_conversations_rls_hardening.sql`

**Contexto:** la policy `anon_update USING(true)` en `bodi_conversations` deja que cualquiera con la anon key (pública) sobrescriba `messages`/`resolved`/`status`/`topic`/`sentiment` de **cualquier** conversación. El `x-student-id` es decorativo (RLS lo ignora). Decisión: endurecer sin auth nueva.

- [ ] **Step 1:** Escribir la migración (idempotente, re-ejecutable). El frontend del estudiante solo necesita agregar/actualizar `messages` de conversaciones; las columnas de analítica (`resolved`, `status`, `topic`, `sentiment`, `lifecycle`, etc.) las escribe n8n con la service-role (que salta RLS), no la anon key. La estrategia: reemplazar la policy anon de UPDATE por una que solo permita a `anon` escribir la columna `messages` (y las mínimas que el front necesite), negando las de analítica. Verificar primero en el esquema real cuáles columnas escribe el front (`assistant.js`) vs n8n.

```sql
-- Endurece el UPDATE anónimo sobre bodi_conversations: la anon key ya no puede
-- tocar las columnas de analítica (las escribe n8n con service-role). Idempotente.
alter table public.bodi_conversations enable row level security;

drop policy if exists anon_update on public.bodi_conversations;

-- El front (anon) solo actualiza el hilo de mensajes de una conversación existente.
-- Postgres RLS no restringe por columna; para eso se usa un GRANT de columna:
revoke update on public.bodi_conversations from anon;
grant update (messages, updated_at) on public.bodi_conversations to anon;

create policy anon_update_messages on public.bodi_conversations
  for update to anon using (true) with check (true);
```

- [ ] **Step 2:** Ajustar el SQL a las columnas reales que `assistant.js` escribe (leer `assistant.js` alrededor de la línea 109/157 para confirmar el payload del PATCH). Si el front escribe más columnas legítimas (p. ej. `session_id` al crear), contemplarlas en el `grant`/`insert` correspondiente sin abrir las de analítica.
- [ ] **Step 3 [MANUAL]:** El usuario corre el archivo en el SQL Editor de Supabase (`tczcngfhuendmldafbrc`) y verifica que el chat siga guardando mensajes y que un PATCH manual a `resolved`/`status` con la anon key ahora sea rechazado.
- [ ] **Step 4:** Commit del archivo: `feat(seguridad): RLS — la anon key no puede modificar columnas de analítica de las conversaciones`.

### Task 7: Sacar EMBED_TOKEN del cliente (proxy serverless) — [código + MANUAL]

**Files:**
- Create: `api/embed-lesson.js` (función serverless, patrón de `api/chat.js`)
- Modify: `js/admin.js:16` (quitar la constante `EMBED_TOKEN`), y las llamadas en `:41`, `:1353`, `:1365`

**Contexto:** el webhook de embeddings de n8n queda protegido solo por un `x-api-key` estático servido en el bundle público del admin → cualquiera puede envenenar el vector store. `api/chat.js` ya es el patrón correcto (proxy que inyecta la key desde env).

- [ ] **Step 1:** Leer `api/chat.js` para replicar el patrón (runtime, lectura de env, fetch al webhook n8n, manejo de errores/CORS).
- [ ] **Step 2:** Crear `api/embed-lesson.js`: recibe del cliente el payload de la lección, inyecta `process.env.EMBED_TOKEN` como `x-api-key`, y hace POST al webhook `embed-lesson` de n8n. No exponer ni el token ni la URL del webhook en la respuesta.
- [ ] **Step 3:** En `js/admin.js`: borrar `const EMBED_TOKEN = ...` (línea 16). Cambiar las 3 llamadas (`:41`, `:1353`, `:1365`) para que hagan `fetch('/api/embed-lesson', {...})` en vez de llamar directo al webhook con el token.
- [ ] **Step 4:** `node --check js/admin.js` y `node --check api/embed-lesson.js`.
- [ ] **Step 5 [MANUAL]:** El usuario (a) crea la variable de entorno `EMBED_TOKEN` en Vercel (Production + Preview), (b) **rota** el token actual en n8n (el viejo quedó expuesto en el bundle público y en el historial de git), (c) redeploy.
- [ ] **Step 6:** Commit: `feat(seguridad): proxy /api/embed-lesson — el token de embeddings sale del cliente`.

> Nota: el token viejo (`BoldBodi-2026-...`) queda en el historial de git aunque se borre del código; por eso el Step 5b (rotar) es obligatorio, no opcional.

---

## TANDA 3 — Datos / operaciones

### Task 8: Exponer `lecciones_vaciadas` en el admin — [código]

**Files:**
- Modify: `js/admin.js` (panel de material/lecciones o Inicio) — añadir un aviso cuando la vista devuelva filas
- (Opcional) `js/analytics-api.js` — helper `fetchLeccionesVaciadas(client)`

**Contexto:** la alarma de vaciado (`lecciones_vaciadas`) existe en la base pero nadie la lee (0 referencias en `js/`). La vista tiene policy `select` para `authenticated`, así que el admin puede consultarla.

- [ ] **Step 1:** Añadir un helper que haga `supabase.from('lecciones_vaciadas').select('*').limit(20)`.
- [ ] **Step 2:** En el arranque del admin (o en el panel de Lecciones), si hay filas, mostrar un banner de advertencia (tokens `--warning-*`/`--error-*`) con: título de la lección, cuándo se vació, y un enlace a las instrucciones de recuperación (sección 6 de `add_contenido_integridad_historial.sql`). Si no hay filas, no mostrar nada.
- [ ] **Step 3:** `node --check js/admin.js`; verificar en navegador (con la vista vacía debe no mostrar nada; probar insertando una fila de prueba en `lecciones_contenido_historial` si se quiere ver el banner).
- [ ] **Step 4:** Commit: `feat(admin): banner de alarma cuando lecciones_vaciadas tiene filas`.

### Task 9: Telemetría de lectura robusta al cerrar/cambiar pestaña — [código]

**Files:**
- Modify: `js/analytics.js` (`track`) y/o `js/reading-tracker.js` / `js/lessons.js` (flush en `visibilitychange`/`pagehide`)

**Contexto:** el flush de `lesson_read` en `unload`/`visibilitychange` usa un `fetch` normal que el navegador cancela al descargar la página → `lesson_read` se subcuenta sistemáticamente.

- [ ] **Step 1:** En la ruta de flush, usar `navigator.sendBeacon(url, blob)` contra el endpoint REST de Supabase (o `fetch(..., { keepalive: true })` como fallback). Leer `js/analytics.js` para ver cómo arma el insert hoy y adaptar solo la ruta de flush (no todos los `track`).
- [ ] **Step 2:** Si el envío se extrae como función pura (construir el body/headers del beacon), añadir `tests/analytics-beacon.test.mjs`.
- [ ] **Step 3:** Verificar en navegador (DevTools → Network, filtrar por `analytics_events`) que al cambiar de pestaña el evento sí sale.
- [ ] **Step 4:** Commit: `fix(telemetría): flush de lesson_read con sendBeacon/keepalive (no se pierde al cerrar)`.

### Task 10: `lesson_read` se re-arma al volver a la pestaña — [código]

**Files:**
- Modify: `js/reading-tracker.js` + `js/lessons.js`

**Contexto:** `flush('hidden')` pone `active=null` y no hay re-`start()` en `visibilitychange` visible → una lectura larga partida por cambios de pestaña subcuenta dwell/completes.

- [ ] **Step 1:** Al volver la pestaña a `visible` con una lección abierta, volver a llamar `start()` sobre el panel abierto. Reusar el patrón de `realtime-lifecycle.js` (idempotente).
- [ ] **Step 2:** Si hay lógica pura de "¿debe re-armar?", extraerla y testearla.
- [ ] **Step 3:** Commit: `fix(telemetría): reanudar el tracking de lectura al volver a la pestaña`.

### Task 11: Versionar el orden y registro de migraciones — [código, doc]

**Files:**
- Create: `supabase/migrations/README.md` (ledger + convención)
- (Opcional) renombrar los `.sql` con prefijo `YYYYMMDD_`

**Contexto:** los archivos se corren a mano sin quedar registrados → deriva garantizada entre archivos y base.

- [ ] **Step 1:** Crear `supabase/migrations/README.md` con: (a) la convención de nombres con prefijo ordenable `YYYYMMDD_`, (b) una tabla-ledger listando cada migración y su estado (`aplicada en prod sí/no`, fecha), (c) la regla "cada migración debe ser idempotente (drop if exists / create if not exists)".
- [ ] **Step 2 (opcional):** `git mv` de los archivos existentes al esquema con prefijo. Evaluar si algo referencia los nombres actuales antes de renombrar (probablemente nada, se corren a mano).
- [ ] **Step 3:** Commit: `docs(db): ledger y convención de migraciones en supabase/migrations/README.md`.

### Task 12: Versionar RLS de `analytics_events` — [código + MANUAL]

**Files:**
- Modify/Create: `supabase/migrations/create_analytics_events.sql` (o una migración nueva `20260804_analytics_events_rls.sql`)

**Contexto:** la migración de `analytics_events` no declara `ENABLE RLS` ni policy de INSERT; el estado real en prod es desconocido. `track()` inserta con la anon key. Riesgo: si algún día se activa RLS sin policy, la telemetría se pierde en silencio.

- [ ] **Step 1 [MANUAL, verificación]:** El usuario confirma en Supabase el estado actual de RLS/policies de `analytics_events` (Dashboard → Auth → Policies, o `select relrowsecurity from pg_class where relname='analytics_events'`).
- [ ] **Step 2:** Escribir la migración que declare explícitamente el estado deseado: `alter table ... enable row level security;` + `create policy analytics_events_insert_anon ... for insert to anon with check (true);` (acotar el `with check` si se puede, p. ej. a un conjunto de `event_type` válidos). Idempotente (`drop policy if exists`).
- [ ] **Step 3 [MANUAL]:** El usuario aplica el SQL **solo tras confirmar** que no rompe los inserts actuales (probar en preview/branch si es posible).
- [ ] **Step 4:** Commit del archivo: `feat(db): versionar RLS + policy de insert de analytics_events`.

---

## TANDA 4 — Mantenibilidad y robustez

### Task 13: Sanitizar el bloque `step` del render de lecciones — [código]

**Files:**
- Modify: `js/block-renderer.js:69`

**Contexto:** si el texto de un paso contiene una etiqueta (regex `/<[a-z]/`), se asigna con `innerHTML` directo, saltándose `sanitizeInto`/`html-policy` que sí protege al bloque `html`. Un `onerror` en contenido de lección (autoría admin vía Quill) se ejecutaría.

- [ ] **Step 1:** Pasar el raw del `step` por `sanitizeInto` igual que el bloque `html` (línea ~88), en vez de `innerHTML =`.
- [ ] **Step 2:** Añadir/extender `tests/` si hay lógica pura; si no, verificar en navegador con un paso que contenga `<b>` (debe renderizar) y `<img onerror=...>` (debe neutralizarse).
- [ ] **Step 3:** Commit: `fix(seguridad): el bloque step pasa por sanitizeInto como el bloque html`.

### Task 14: Foco/teclado en modales y drawer — [código]

**Files:**
- Modify: `admin.html` (media modal ~110), `js/admin.js` (drawer ~98, apertura/cierre de modales), `js/assistant.js` (lightbox ~594)

**Contexto:** el modal de biblioteca de medios, el `lessonFormModal`, el drawer del admin y el lightbox del chat no atrapan el foco, no cierran con Escape y/o no restauran el foco; el fondo queda navegable por teclado.

- [ ] **Step 1:** Extraer un helper reutilizable de "modal accesible" (idealmente puro en su parte de cálculo de foco, o un módulo `js/focus-trap.js`): al abrir mueve el foco al primer control, atrapa Tab dentro, cierra con Escape, restaura el foco al origen al cerrar.
- [ ] **Step 2:** Aplicarlo al media modal, `lessonFormModal`, drawer del admin y lightbox del chat. Añadir `role="dialog"`/`aria-modal="true"` a los modales y `aria-expanded`/`aria-controls` al `navToggle` (`admin.html:41`).
- [ ] **Step 3:** `tests/focus-trap.test.mjs` para la lógica pura del ciclo de Tab.
- [ ] **Step 4:** Verificar por teclado en navegador (Tab, Shift+Tab, Escape) en cada modal.
- [ ] **Step 5:** Commit: `a11y: foco atrapado + Escape + roles en modales, drawer y lightbox`.

### Task 15: Arreglar la fuga de listeners del lightbox — [código]

**Files:**
- Modify: `js/assistant.js:594-618`

**Contexto:** cada apertura de imagen agrega un `document.addEventListener('keydown')` que solo se auto-remueve con Escape; al cerrar por backdrop/botón queda vivo y se acumula durante la sesión de chat.

- [ ] **Step 1:** Registrar el `keydown` una sola vez (o removerlo en TODOS los caminos de cierre: Escape, backdrop, botón). Preferible: un único handler a nivel de documento que consulte si el lightbox está abierto.
- [ ] **Step 2:** Verificar en navegador (abrir/cerrar varias imágenes; en DevTools comprobar que no se acumulan listeners).
- [ ] **Step 3:** Commit: `fix(chat): sin fuga de listeners keydown del lightbox`.

### Task 16: Deduplicar `escapeHtml` — [código]

**Files:**
- Modify: `js/resources.js:340` (borrar copia local, importar de `utils.js`)

**Contexto:** `resources.js` define su propia `escapeHtml` que NO escapa la comilla simple (`'`), mientras la canónica de `utils.js` sí → hueco sutil en atributos + divergencia.

- [ ] **Step 1:** Borrar la definición local en `resources.js` y `import { escapeHtml } from './utils.js'` (verificar que no haya choque de nombres).
- [ ] **Step 2:** `node --test tests/*.test.mjs`; verificar en navegador que FAQ/glosario/material siguen escapando bien.
- [ ] **Step 3:** Commit: `refactor: resources.js usa el escapeHtml canónico de utils.js`.

### Task 17: Extraer lógica pura de `admin.js` a módulos testeables — [código]

**Files:**
- Create: `js/admin-format.js` (helpers puros) + `tests/admin-format.test.mjs`
- Create: `js/lesson-embed-text.js` (o similar) + test
- Modify: `js/admin.js` (importar desde los nuevos módulos)

**Contexto:** `lessonToEmbedText` (`admin.js:18`), `textoDeUsos` (`:1703`), `urlsDeFila` (`:3099`), `actionBadge` (`:2476`), `formatBytes`/`displayName`/`fileIcon` (`:2891-2911`) y el agrupado de `renderGroupedLessons` son puros pero viven en un archivo que importa supabase → intesteables en Node.

- [ ] **Step 1:** Mover cada helper puro a `js/admin-format.js` (o al módulo que corresponda), exportándolos; `admin.js` los importa.
- [ ] **Step 2:** Escribir tests unitarios de cada helper en `tests/admin-format.test.mjs` (casos concretos de entrada/salida).
- [ ] **Step 3:** `node --check js/admin.js` + `node --test tests/*.test.mjs`.
- [ ] **Step 4:** Commit: `refactor(admin): extraer helpers puros a admin-format.js con tests`.

> Nota: este es un refactor incremental de bajo riesgo (mover funciones puras). La descomposición completa de `admin.js` (3430 líneas → editor-lecciones / material-manager / recursos-admin / ui-helpers) es un proyecto aparte, con su propio spec/plan, por su tamaño y superficie.

### Task 18: Re-render puntual del panel de lecciones — [código]

**Files:**
- Modify: `js/admin.js:953-963` (y `:665`, `:767`)

**Contexto:** togglear `active`/`bot_active`, borrar/guardar una lección o CRUD de categorías llaman `renderLessonsPanel()`, que re-consulta todo y reconstruye el `innerHTML` reinstanciando Sortable/Quill/lucide, para cambiar un booleano.

- [ ] **Step 1:** Para el toggle de un booleano, actualizar en sitio solo la tarjeta/fila afectada (cambiar clases/estado del DOM existente) en vez de `renderLessonsPanel()` completo.
- [ ] **Step 2:** Verificar en navegador que toggles, borrado y reordenamiento (Sortable) siguen funcionando sin re-render total.
- [ ] **Step 3:** Commit: `perf(admin): actualización puntual de la tarjeta de lección (sin re-render total)`.

> Riesgo medio (toca el ciclo de vida de Sortable/Quill). Hacer con cuidado y verificación manual.

### Task 19: Cachear el listado de la biblioteca de medios — [código]

**Files:**
- Modify: `js/admin.js:2946` → `listAllFiles` (`js/upload.js:76`)

**Contexto:** cada apertura del selector recorre recursivamente todo el bucket, paginando de a 100 en serie.

- [ ] **Step 1:** Cachear el resultado de `listAllFiles` en memoria; invalidar el caché al subir o borrar un archivo.
- [ ] **Step 2:** Verificar que tras subir/borrar el listado se refresca; que abrir el selector repetidamente ya no re-recorre el bucket.
- [ ] **Step 3:** Commit: `perf(admin): cachear el listado de la biblioteca de medios (invalida al subir/borrar)`.

### Task 20: Baja prioridad (lote de pulido) — [código]

**Files:** varios

Agrupar en un solo commit (o saltar según tiempo):
- [ ] Validar esquema `^https?:` en el `href` de material (`js/resources.js:281`, `admin.js:3367-3371`) — bloquear `javascript:` como ya hace `block-renderer` para link/image.
- [ ] `rel="noopener noreferrer"` consistente (hoy `resources.js:281` solo tiene `noopener`).
- [ ] Acotar `lucide.createIcons()` al contenedor recién renderizado en vez de escanear todo el DOM (`admin.js:502,790,867,2025,2948`, `resources.js:214,293`).
- [ ] Reemplazar colores hardcodeados por tokens Merlin (`admin.js:894,897,935-936`: `text-orange-500`→`--warning-*`, `text-green-600`→`--success-*`).
- [ ] Deduplicar `lessonCardHtml`/`lessonCardGridHtml` extrayendo `lessonActionsHtml(l, size)` (`admin.js:871-944`).
- [ ] Import dinámico de Quill al abrir `lessonFormModal` (`admin.html:12-13`) en vez de bloquear el `<head>` de todo el admin.
- [ ] [MANUAL] Índice de expresión sobre `payload->>'lesson_id'` para los `event_type` de lección (mejora los joins de las RPCs cuando crezca el volumen) — archivo SQL + aplicar en Supabase.

- [ ] Commit: `chore: pulido (href schemes, rel, lucide scoping, tokens, dedup, quill lazy)`.

---

## Self-Review (cobertura del informe)

| Hallazgo del informe | Task |
|---|---|
| #1 RLS conversaciones | 6 |
| #2 EMBED_TOKEN | 7 |
| #3 portal baja embeddings | 5 |
| #4 a11y chat | 3, 14 |
| #5 nadie ve lecciones_vaciadas | 8 |
| #6 código muerto analytics | 1 |
| #7 sin npm test/CI | 2 |
| Re-render total | 18 |
| Supabase CDN sin pin | 4 |
| Telemetría se pierde | 9, 10 |
| RLS analytics_events | 12 |
| Versionado migraciones | 11 |
| block-renderer step | 13 |
| Modales/drawer foco | 14 |
| Fuga listeners lightbox | 15 |
| Biblioteca medios re-recorre | 19 |
| admin.js monolito | 17 (+ proyecto aparte) |
| escapeHtml duplicada | 16 |
| Baja prioridad (href, lucide, tokens, quill, índice, dedup) | 20 |

## Pasos MANUALES del usuario (resumen)

1. **Task 6:** correr `20260804_bodi_conversations_rls_hardening.sql` en el SQL Editor de Supabase.
2. **Task 7:** crear env `EMBED_TOKEN` en Vercel + **rotar** el token en n8n + redeploy.
3. **Task 12:** confirmar estado de RLS de `analytics_events` y aplicar el SQL con cautela.
4. **Task 20 (índice):** aplicar el índice de expresión si se aprueba.
5. Backups/PITR (fuera del código): confirmar el tier del proyecto y habilitar PITR o `pg_dump` programado.
