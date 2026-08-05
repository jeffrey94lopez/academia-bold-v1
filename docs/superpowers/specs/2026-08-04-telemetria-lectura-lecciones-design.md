# Telemetría de lectura de lecciones (①b) — Diseño

**Fecha:** 2026-08-04
**Estado:** Diseño aprobado. Siguiente: plan de implementación.
**Relacionado:** sub-proyecto ①b del [rediseño de analytics](2026-07-20-rediseno-analytics-lecciones-bolbot-design.md). Llena las dos piezas marcadas *próximamente* en el [Dashboard Lecciones ②](../plans/2026-08-04-dashboard-lecciones.md).

## Contexto y problema

El Dashboard Lecciones (②, ya en `sandbox`) dejó dos señales como *próximamente* porque dependían de telemetría que no se capturaba:

- La columna **`% leída completa`** de la tabla de lecciones (hoy muestra "—").
- La tarjeta **"se abren pero no se terminan"** (hoy un placeholder punteado).

Hoy el portal emite `lesson_open` (al abrir una lección) pero **no mide si el estudiante realmente la leyó**: ni profundidad de scroll ni tiempo. Este sub-proyecto añade esa captura y la conecta al dashboard.

Alcance decidido: **solo telemetría de lectura**. Las otras capturas FRONT del spec de ①b (abandono de examen, modo "explore" real, clics en chips) quedan fuera: el curso no está habilitado en producción, así que no aportarían datos visibles todavía.

## Restricciones heredadas

- **JS vanilla, sin bundler.** Los módulos se importan por ESM; los que tocan `supabase` (por CDN) no son import-safe en Node. La lógica pura va en módulos separados con tests `.mjs` (patrón `vertical.js`/`category-guard.js`).
- **No romper el realtime de lecciones** (bug #7, ya arreglado): la captura se engancha al contenedor de contenido, no al ciclo de vida de la suscripción realtime.
- **No bajar miles de filas al cliente.** La agregación de lectura ocurre en la RPC; el cliente recibe el `jsonb`.
- **Migraciones a mano.** El SQL va en `supabase/migrations/`, idempotente (`create or replace`), y lo aplica el usuario en el SQL Editor.
- **Tema Merlin** en cualquier cambio de UI: solo tokens de `css/style.css`.

## Diseño

### 1. Captura — evento `lesson_read`

Cuando el usuario **abandona** una lección que tenía abierta, se emite **un solo** evento resumen (para no inflar `analytics_events`):

```
event_type: 'lesson_read'
payload: {
  lesson_id, lesson_title, category,
  max_scroll_pct,   // entero 0–100: profundidad máxima de scroll alcanzada
  dwell_ms,         // entero: milisegundos con la lección abierta
  completed,        // booleano (ver regla abajo)
  vertical, plataforma   // el ...sel que ya se adjunta a lesson_open
}
```

`lesson_open` se mantiene sin cambios (sigue alimentando Visitas, zombies y top de lecciones).

**Disparadores de "abandono"** (cada uno emite el `lesson_read` de la lección que estaba activa, si había una):
- Abrir **otra** lección (se llama `renderLessonContent` para una lección distinta).
- **Cambiar de pestaña** fuera de Lecciones (`switchTab` en `main.js`).
- **Ocultar/cerrar** la página: `document.visibilitychange` → `hidden`, y `pagehide` (best-effort en cierres bruscos).

### 2. Regla de completado

```
completed = (max_scroll_pct >= 90) && (dwell_ms >= 5000)
```

- Si el contenido **cabe sin scroll** (`scrollHeight <= clientHeight`), `max_scroll_pct = 100` — pero sigue exigiendo el piso de 5 s (evita rebotes de 1 s).
- `max_scroll_pct` se calcula como `(scrollTop + clientHeight) / scrollHeight * 100`, tope 100.

### 3. Métrica (aprobada)

- **`% leída completa`** por lección = `lecturas completas ÷ lecturas medidas` — *"de quienes abrieron esta lección, qué % la leyó hasta el final"*.
- **Tarjeta "se abren pero no terminan"** = lecciones con **≥5 lecturas medidas** y **`% leída ≤ 40%`**, ordenadas por `% leída` ascendente (peor primero).

**Matiz documentado:** `lesson_read` se emite al salir (best-effort en cierres bruscos), así que el denominador son **lecturas medidas**, que pueden ser ≤ Visitas (`lesson_open`). No ensucia la métrica: el porcentaje se calcula sobre lo medido. La columna "Visitas" de la tabla sigue viniendo de `lesson_open`; el "% leída" de `lesson_read`. Se acepta esa leve diferencia de denominador entre columnas.

### 4. Componentes

**`js/reading-helpers.js` (puro, con tests):**
- `scrollPct(scrollTop, clientHeight, scrollHeight) → int` (0–100; 100 si no hay scroll posible).
- `isRead({ maxScrollPct, dwellMs }, opts?) → bool` — aplica la regla ≥90% + ≥5000 ms (umbrales con default, override por `opts`).

**`js/reading-tracker.js` (glue, verificado en navegador):**
- `createReadingTracker({ track, now })` → objeto con:
  - `start(container, meta)` — registra la lección activa, `openedAt = now()`, y engancha un listener de `scroll` al `container` que actualiza `maxScrollPct`. Si ya había una activa, primero hace `flush('switch')`.
  - `flush(reason)` — si hay lección activa, calcula `dwell_ms` y `completed`, emite `track('lesson_read', payload)`, **quita el listener de `scroll` que había añadido** (para no acumularlos al cambiar de lección — la misma clase de bug que #7) y limpia el estado (idempotente: un segundo `flush` sin `start` no emite nada).
- `track` y `now` se inyectan → el tracker es testeable con dobles; en producción usa `track` de `analytics.js` y `() => Date.now()`.

**`lessons.js`:**
- Crea un tracker singleton del módulo.
- En `renderLessonContent(panel, lesson)`: tras pintar, llama `tracker.start(panel, { lesson_id, lesson_title, category, ...sel })`. (Como `start` hace `flush('switch')` de la anterior, cambiar de lección emite el `lesson_read` de la previa.)
- Registra una vez los listeners globales `visibilitychange`/`pagehide` → `tracker.flush(...)`.
- Expone `window.lessonsFlushReading = () => tracker.flush('tab')` para que `main.js` lo llame al salir de la pestaña (mismo patrón que `lessonsCleanup`/`lessonsResume`).

**`main.js`:** en `switchTab`, cuando `tab !== 'lessons'`, además de `lessonsCleanup?.()`, llama `window.lessonsFlushReading?.()`.

**RPC `analytics_lessons_summary` (extensión):** se añade una clave `reading` al `jsonb`:
```
reading: [{ lesson, reads, completes, completion_pct }]
```
agregada desde `lesson_read` por `coalesce(payload->>'lesson_title', payload->>'lesson_id')` (misma llave que `top_lessons`/`exams`, para que el merge en la vista cuadre). `completion_pct = round(100 * completes / nullif(reads,0))`. Es `create or replace`: no rompe a los consumidores actuales (solo agrega una clave).

**Vista `admin-lessons-analytics.js`:**
- La columna `% leída` de la tabla se llena cruzando `reading` por título (extiende `mergeLessonTable`, que ya cruza exams).
- La tarjeta `soonCard` "próximamente" se reemplaza por la real: selecciona de `reading` las lecciones con `reads ≥ 5` y `completion_pct ≤ 40`, peor primero (helper puro nuevo, con test).

### 5. Pruebas

- `reading-helpers.js` → `tests/reading-helpers.test.mjs` (scrollPct en casos borde: sin scroll, a medias, al fondo; isRead con las 4 combinaciones de umbral).
- `reading-tracker.js` → `tests/reading-tracker.test.mjs` con `track`/`now` dobles: start→flush emite un `lesson_read` con el payload correcto; start dos veces emite el de la primera; flush sin start no emite; el `completed` sale de los umbrales.
- La selección de "se abren pero no terminan" → test junto a `lessons-analytics.js` (o su propio helper) con umbral reads≥5 y ≤40%.
- El tracker enganchado al DOM y la RPC se verifican en navegador (con login admin, tras aplicar el SQL) y con una query de control en el SQL Editor.

## Fuera de alcance

- Abandono de examen, modo "explore" real, clics en chips (otras capturas FRONT de ①b) — el curso no está en producción.
- ①c (auto-evaluación LLM del bot) — sub-proyecto aparte.
- Heatmaps de lectura, scroll continuo o mapas de calor por sección — YAGNI; una sola métrica de completado cubre las dos señales del dashboard.

## Criterios de éxito

- Abrir una lección, leerla hasta el final y esperar ≥5 s produce un `lesson_read` con `completed=true`; abrir y salir enseguida produce `completed=false`.
- La columna `% leída` de la tabla de lecciones muestra un porcentaje real (ya no "—") para lecciones con lecturas medidas.
- La tarjeta "se abren pero no terminan" lista lecciones reales con baja tasa de completado (o queda vacía si no hay ninguna con ≥5 lecturas).
- No se rompe el realtime de lecciones (#7) ni el rendimiento del portal (un solo listener de scroll por lección activa; un solo evento por lectura).
