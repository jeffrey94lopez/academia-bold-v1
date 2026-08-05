# Telemetría de lectura de lecciones (①b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar scroll/tiempo de lectura por lección (evento `lesson_read`, `completed = scroll ≥90% + ≥5s`), agregarlo en la RPC, y llenar las dos piezas *próximamente* del Dashboard Lecciones (`% leída` + tarjeta "se abren pero no terminan").

**Architecture:** Un tracker inyectable (`reading-tracker.js`) engancha un listener de scroll al contenedor de contenido y emite un único `lesson_read` al abandonar la lección; su lógica de umbrales vive en un módulo puro (`reading-helpers.js`). La RPC `analytics_lessons_summary` se extiende con un array `reading[]`. La vista y el módulo de derivaciones existentes se amplían para consumirlo.

**Tech Stack:** JS vanilla ESM, `node:test` (`.mjs`), PostgreSQL (Supabase, SQL aplicado a mano).

## Global Constraints

- **JS vanilla, sin bundler.** Lógica pura y testeable en módulos import-safe (sin `supabase`/DOM); tests `.mjs` con `node --test`.
- **No romper el realtime de lecciones (#7).** La captura se engancha al contenedor de contenido; el listener de scroll se QUITA al hacer flush (no acumular listeners).
- **No bajar miles de filas al cliente.** La agregación de lectura ocurre en la RPC.
- **Migraciones a mano.** SQL en `supabase/migrations/`, idempotente (`create or replace`), cabecera en español + `-- Ejecutar UNA sola vez en el SQL Editor`. El usuario lo aplica.
- **Tema Merlin** en la UI: solo tokens de `css/style.css`.
- **Payload de `lesson_read`:** `{ lesson_id, lesson_title, category, max_scroll_pct, dwell_ms, completed, vertical, plataforma }`.
- **Regla de completado:** `max_scroll_pct >= 90 && dwell_ms >= 5000`. Si el contenido cabe sin scroll, `max_scroll_pct = 100`.
- **Métrica:** `% leída completa` por lección = `completes ÷ reads`. Tarjeta "se abren pero no terminan" = `reads ≥ 5 && completion_pct ≤ 40`, peor primero.

---

### Task 1: `js/reading-helpers.js` (puro) + tests

Lógica de umbrales sin DOM: cálculo de profundidad de scroll y regla de completado.

**Files:**
- Create: `js/reading-helpers.js`
- Test: `tests/reading-helpers.test.mjs`

**Interfaces:**
- Produces:
  - `scrollPct(scrollTop: number, clientHeight: number, scrollHeight: number) → number` (0–100; 100 si no hay scroll posible).
  - `isRead({ maxScrollPct, dwellMs }, opts?: {minScrollPct, minDwellMs}) → boolean`.

- [ ] **Step 1: Escribir el test que falla**

```javascript
// tests/reading-helpers.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { scrollPct, isRead } from '../js/reading-helpers.js'

test('scrollPct: contenido que cabe sin scroll cuenta como 100', () => {
  assert.equal(scrollPct(0, 500, 500), 100)
  assert.equal(scrollPct(0, 500, 400), 100) // scrollHeight < clientHeight
  assert.equal(scrollPct(0, 0, 0), 100)     // sin dimensiones
})

test('scrollPct: a media altura', () => {
  assert.equal(scrollPct(0, 400, 1000), 40)     // (0+400)/1000
  assert.equal(scrollPct(300, 400, 1000), 70)   // (300+400)/1000
})

test('scrollPct: al fondo llega a 100 y no se pasa', () => {
  assert.equal(scrollPct(600, 400, 1000), 100)
  assert.equal(scrollPct(9999, 400, 1000), 100) // clamp
})

test('isRead: ≥90% y ≥5s es lectura completa', () => {
  assert.equal(isRead({ maxScrollPct: 90, dwellMs: 5000 }), true)
  assert.equal(isRead({ maxScrollPct: 100, dwellMs: 10000 }), true)
})

test('isRead: falla si falta scroll o tiempo', () => {
  assert.equal(isRead({ maxScrollPct: 89, dwellMs: 5000 }), false)
  assert.equal(isRead({ maxScrollPct: 100, dwellMs: 4999 }), false)
  assert.equal(isRead({ maxScrollPct: 0, dwellMs: 0 }), false)
})

test('isRead: umbrales configurables', () => {
  assert.equal(isRead({ maxScrollPct: 50, dwellMs: 1000 }, { minScrollPct: 50, minDwellMs: 1000 }), true)
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test tests/reading-helpers.test.mjs`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Escribir la implementación**

```javascript
// js/reading-helpers.js
// Lógica pura de la telemetría de lectura: profundidad de scroll y regla de
// "lectura completa". Sin DOM ni supabase → testeable en Node.

export function scrollPct(scrollTop, clientHeight, scrollHeight) {
  // Si el contenido cabe sin scroll, se considera visto por completo.
  if (!scrollHeight || scrollHeight <= clientHeight) return 100
  const pct = Math.round((scrollTop + clientHeight) / scrollHeight * 100)
  return Math.max(0, Math.min(100, pct))
}

export function isRead({ maxScrollPct, dwellMs } = {}, { minScrollPct = 90, minDwellMs = 5000 } = {}) {
  return (maxScrollPct ?? 0) >= minScrollPct && (dwellMs ?? 0) >= minDwellMs
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test tests/reading-helpers.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add js/reading-helpers.js tests/reading-helpers.test.mjs
git commit -m "feat: reading-helpers — scrollPct + isRead (puro, +tests)"
```

---

### Task 2: `js/reading-tracker.js` (inyectable) + tests

Rastrea la lección activa: engancha scroll, acumula `maxScrollPct`, y al abandonar emite `lesson_read`. `track` y `now` se inyectan → testeable con dobles y un contenedor falso.

**Files:**
- Create: `js/reading-tracker.js`
- Test: `tests/reading-tracker.test.mjs`

**Interfaces:**
- Consumes: `scrollPct`, `isRead` de `reading-helpers.js`.
- Produces: `createReadingTracker({ track, now }) → { start(container, meta), flush(reason), isActive() }`.
  - `container` debe exponer `scrollTop`, `clientHeight`, `scrollHeight`, `addEventListener('scroll', fn)`, `removeEventListener('scroll', fn)`.
  - `flush` emite `track('lesson_read', { ...meta, max_scroll_pct, dwell_ms, completed })` y quita el listener.

- [ ] **Step 1: Escribir el test que falla**

```javascript
// tests/reading-tracker.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { createReadingTracker } from '../js/reading-tracker.js'

function fakeContainer({ scrollTop = 0, clientHeight = 400, scrollHeight = 1000 } = {}) {
  const c = {
    scrollTop, clientHeight, scrollHeight,
    _handlers: {},
    addEventListener(ev, fn) { c._handlers[ev] = fn },
    removeEventListener(ev, fn) { if (c._handlers[ev] === fn) delete c._handlers[ev] },
    _fireScroll() { c._handlers.scroll && c._handlers.scroll() },
    _hasScrollListener() { return !!c._handlers.scroll },
  }
  return c
}

// now inyectable: devuelve valores de una lista en orden.
function fakeNow(values) {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

test('start→flush emite un lesson_read con el payload correcto', () => {
  const emitted = []
  const track = (type, payload) => emitted.push({ type, payload })
  const tr = createReadingTracker({ track, now: fakeNow([1000, 7000]) })
  const c = fakeContainer({ scrollTop: 0, clientHeight: 500, scrollHeight: 500 }) // cabe → 100%
  tr.start(c, { lesson_id: 'L1', lesson_title: 'Uno', category: 'Cat', vertical: 'retail', plataforma: 'web' })
  tr.flush('tab')
  assert.equal(emitted.length, 1)
  assert.equal(emitted[0].type, 'lesson_read')
  assert.deepEqual(emitted[0].payload, {
    lesson_id: 'L1', lesson_title: 'Uno', category: 'Cat', vertical: 'retail', plataforma: 'web',
    max_scroll_pct: 100, dwell_ms: 6000, completed: true,
  })
})

test('el scroll actualiza max_scroll_pct', () => {
  const emitted = []
  const track = (type, payload) => emitted.push({ type, payload })
  const tr = createReadingTracker({ track, now: fakeNow([0, 6000]) })
  const c = fakeContainer({ scrollTop: 0, clientHeight: 400, scrollHeight: 1000 }) // arranca 40%
  tr.start(c, { lesson_id: 'L2' })
  c.scrollTop = 300; c._fireScroll() // 70%
  c.scrollTop = 100; c._fireScroll() // 50% (no baja el max)
  tr.flush('switch')
  assert.equal(emitted[0].payload.max_scroll_pct, 70)
})

test('completed=false si el tiempo es corto aunque el scroll llegue al final', () => {
  const emitted = []
  const track = (type, payload) => emitted.push({ type, payload })
  const tr = createReadingTracker({ track, now: fakeNow([1000, 3000]) }) // dwell 2000
  const c = fakeContainer({ scrollTop: 0, clientHeight: 500, scrollHeight: 500 })
  tr.start(c, { lesson_id: 'L3' })
  tr.flush('tab')
  assert.equal(emitted[0].payload.completed, false)
})

test('start dos veces emite el lesson_read de la primera lección', () => {
  const emitted = []
  const track = (type, payload) => emitted.push({ type, payload })
  const tr = createReadingTracker({ track, now: fakeNow([1000, 8000, 8000, 9000]) })
  const c1 = fakeContainer({ scrollTop: 0, clientHeight: 500, scrollHeight: 500 })
  const c2 = fakeContainer()
  tr.start(c1, { lesson_id: 'A' })
  tr.start(c2, { lesson_id: 'B' }) // flush implícito de A
  assert.equal(emitted.length, 1)
  assert.equal(emitted[0].payload.lesson_id, 'A')
})

test('flush sin start no emite nada; flush doble tampoco duplica', () => {
  const emitted = []
  const track = (type, payload) => emitted.push({ type, payload })
  const tr = createReadingTracker({ track, now: fakeNow([1000, 7000]) })
  tr.flush('tab')
  assert.equal(emitted.length, 0)
  const c = fakeContainer()
  tr.start(c, { lesson_id: 'X' })
  tr.flush('tab')
  tr.flush('tab')
  assert.equal(emitted.length, 1)
})

test('flush quita el listener de scroll (no se acumulan)', () => {
  const tr = createReadingTracker({ track: () => {}, now: fakeNow([1000, 7000]) })
  const c = fakeContainer()
  tr.start(c, { lesson_id: 'Y' })
  assert.equal(c._hasScrollListener(), true)
  tr.flush('tab')
  assert.equal(c._hasScrollListener(), false)
  assert.equal(tr.isActive(), false)
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test tests/reading-tracker.test.mjs`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Escribir la implementación**

```javascript
// js/reading-tracker.js
// Rastrea la lectura de la lección activa (scroll + tiempo) y emite un único
// evento 'lesson_read' al abandonarla. track y now se inyectan → testeable sin
// DOM real ni supabase. El listener de scroll se QUITA al hacer flush para no
// acumularlos al cambiar de lección (misma clase de bug que el realtime #7).
import { scrollPct, isRead } from './reading-helpers.js'

export function createReadingTracker({ track, now }) {
  let active = null // { container, meta, openedAt, maxScrollPct, onScroll }

  function readPct(container) {
    return scrollPct(container.scrollTop, container.clientHeight, container.scrollHeight)
  }

  const api = {
    start(container, meta) {
      if (active) api.flush('switch')
      const state = { container, meta, openedAt: now(), maxScrollPct: readPct(container), onScroll: null }
      state.onScroll = () => {
        const p = readPct(container)
        if (p > state.maxScrollPct) state.maxScrollPct = p
      }
      container.addEventListener('scroll', state.onScroll)
      active = state
    },
    flush(reason) {
      if (!active) return
      const dwellMs = now() - active.openedAt
      const completed = isRead({ maxScrollPct: active.maxScrollPct, dwellMs })
      active.container.removeEventListener('scroll', active.onScroll)
      track('lesson_read', {
        ...active.meta,
        max_scroll_pct: active.maxScrollPct,
        dwell_ms: dwellMs,
        completed,
      })
      active = null
    },
    isActive() { return active !== null },
  }
  return api
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test tests/reading-tracker.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add js/reading-tracker.js tests/reading-tracker.test.mjs
git commit -m "feat: reading-tracker — emite lesson_read al abandonar la lección (+tests)"
```

---

### Task 3: Extender `js/lessons-analytics.js` (tabla con % leída + tarjeta "no terminan")

`mergeLessonTable` gana el `% leída` por lección; se añade `selectNotFinished` para la tarjeta. Backward-compatible: `reading` es opcional.

**Files:**
- Modify: `js/lessons-analytics.js`
- Test: `tests/lessons-analytics.test.mjs` (actualizar el test de `mergeLessonTable` + añadir casos)

**Interfaces:**
- Produces:
  - `mergeLessonTable(topLessons, exams, reading?, opts?) → Array<{lesson, visits, pass_pct, read_pct}>` (`read_pct` = `completion_pct` de `reading` cruzado por título; `null` si no hay).
  - `selectNotFinished(reading, opts?: {minReads, maxPct, limit}) → Array` (reads ≥ minReads y completion_pct ≤ maxPct, peor primero).

- [ ] **Step 1: Actualizar/añadir tests (que fallan)**

En `tests/lessons-analytics.test.mjs`, REEMPLAZA el test existente `mergeLessonTable: cruza visitas con % aprueban por título` por estos, y añade el import de `selectNotFinished`:

```javascript
// Añadir selectNotFinished al import existente desde '../js/lessons-analytics.js'

test('mergeLessonTable: cruza visitas, % aprueban y % leída por título', () => {
  const top = [{ lesson: 'A', count: 30 }, { lesson: 'B', count: 10 }]
  const exams = [{ lesson: 'A', pass_pct: 80 }]
  const reading = [{ lesson: 'A', reads: 20, completes: 15, completion_pct: 75 }]
  assert.deepEqual(mergeLessonTable(top, exams, reading), [
    { lesson: 'A', visits: 30, pass_pct: 80, read_pct: 75 },
    { lesson: 'B', visits: 10, pass_pct: null, read_pct: null },
  ])
})

test('mergeLessonTable: sin reading, read_pct es null (retrocompatible)', () => {
  const top = [{ lesson: 'A', count: 5 }]
  assert.deepEqual(mergeLessonTable(top, []), [
    { lesson: 'A', visits: 5, pass_pct: null, read_pct: null },
  ])
})

test('selectNotFinished: baja tasa de completado con muestra suficiente, peor primero', () => {
  const reading = [
    { lesson: 'A', reads: 10, completion_pct: 20 },
    { lesson: 'B', reads: 3,  completion_pct: 10 }, // muestra chica → fuera
    { lesson: 'C', reads: 8,  completion_pct: 90 }, // se termina → fuera
    { lesson: 'D', reads: 6,  completion_pct: 35 },
  ]
  const r = selectNotFinished(reading, { minReads: 5, maxPct: 40 })
  assert.deepEqual(r.map(x => x.lesson), ['A', 'D'])
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test tests/lessons-analytics.test.mjs`
Expected: FAIL — `selectNotFinished` no existe y `mergeLessonTable` no devuelve `read_pct`.

- [ ] **Step 3: Escribir la implementación**

En `js/lessons-analytics.js`, REEMPLAZA `mergeLessonTable` por esta versión y AÑADE `selectNotFinished`:

```javascript
export function mergeLessonTable(topLessons, exams, reading = [], { limit = 10 } = {}) {
  const passByLesson = new Map((exams || []).map(e => [e.lesson, e.pass_pct]))
  const readByLesson = new Map((reading || []).map(r => [r.lesson, r.completion_pct]))
  return (topLessons || [])
    .slice(0, limit)
    .map(l => ({
      lesson: l.lesson,
      visits: l.count,
      pass_pct: passByLesson.has(l.lesson) ? passByLesson.get(l.lesson) : null,
      read_pct: readByLesson.has(l.lesson) ? readByLesson.get(l.lesson) : null,
    }))
}

export function selectNotFinished(reading, { minReads = 5, maxPct = 40, limit = 6 } = {}) {
  return (reading || [])
    .filter(r => (r.reads ?? 0) >= minReads && r.completion_pct != null && r.completion_pct <= maxPct)
    .sort((a, b) => a.completion_pct - b.completion_pct)
    .slice(0, limit)
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test tests/lessons-analytics.test.mjs`
Expected: PASS (todos los tests del archivo, incluidos los actualizados).

- [ ] **Step 5: Commit**

```bash
git add js/lessons-analytics.js tests/lessons-analytics.test.mjs
git commit -m "feat: lessons-analytics — % leída en la tabla + selectNotFinished (+tests)"
```

---

### Task 4: RPC `analytics_lessons_summary` — clave `reading`

Se re-define la función (idempotente) agregando un array `reading` desde los eventos `lesson_read`. No rompe consumidores: solo añade una clave.

**Files:**
- Create: `supabase/migrations/update_analytics_lessons_summary_reading.sql`

**Interfaces:**
- Consumes: `public.analytics_events` (evento `lesson_read`, `payload.completed` booleano).
- Produces: la función existente `public.analytics_lessons_summary(...)` ahora incluye en su `jsonb` la clave `reading: [{lesson, reads, completes, completion_pct}]`.

- [ ] **Step 1: Escribir la migración**

```sql
-- Re-define analytics_lessons_summary añadiendo la clave 'reading' (telemetría
-- de lectura, evento lesson_read: reads, completes y % de completado por
-- lección). Idempotente (create or replace); las demás claves quedan igual, así
-- que no rompe a los consumidores (② y el Resumen ejecutivo).
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
create or replace function public.analytics_lessons_summary(
  p_from      timestamptz,
  p_to        timestamptz,
  p_prev_from timestamptz,
  p_prev_to   timestamptz
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with cur as (
    select event_type, payload, session_id, created_at
    from analytics_events
    where created_at >= p_from and created_at <= p_to
  ),
  prev as (
    select event_type, payload
    from analytics_events
    where created_at >= p_prev_from and created_at <= p_prev_to
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'visits',            (select count(*) from cur  where event_type = 'page_view'),
      'prev_visits',       (select count(*) from prev where event_type = 'page_view'),
      'new_students',      (select count(*) from cur  where event_type = 'mode_selected' and payload->>'mode' = 'course'),
      'prev_new_students', (select count(*) from prev where event_type = 'mode_selected' and payload->>'mode' = 'course'),
      'passes',            (select count(*) from cur  where event_type = 'exam_pass'),
      'avg_score',         (select round(avg((payload->>'score')::numeric)) from cur where event_type = 'exam_pass'),
      'cert_views',        (select count(*) from cur  where event_type = 'certificate_view'),
      'cert_prints',       (select count(*) from cur  where event_type = 'certificate_print')
    ),
    'visits_by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d, 'count', c) order by d), '[]'::jsonb)
      from (
        select date_trunc('day', created_at)::date as d, count(*) as c
        from cur where event_type = 'page_view' group by 1
      ) t
    ),
    'entry_mode', jsonb_build_object(
      'course',  (select count(*) from cur where event_type = 'mode_selected' and payload->>'mode' = 'course'),
      'explore', (select count(*) from cur where event_type = 'mode_selected' and payload->>'mode' = 'explore')
    ),
    'top_lessons', (
      select coalesce(jsonb_agg(jsonb_build_object('lesson', lesson, 'count', c) order by c desc), '[]'::jsonb)
      from (
        select coalesce(payload->>'lesson_title', payload->>'lesson_id') as lesson, count(*) as c
        from cur where event_type = 'lesson_open'
        group by 1 order by c desc limit 10
      ) t
    ),
    'searches', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'term', term, 'count', c, 'avg_results', avg_r, 'zero_count', zc, 'last_at', last_at) order by c desc), '[]'::jsonb)
      from (
        select lower(trim(payload->>'term')) as term,
               count(*) as c,
               round(avg((payload->>'results_count')::numeric), 1) as avg_r,
               count(*) filter (where (payload->>'results_count')::int = 0) as zc,
               max(created_at) as last_at
        from cur
        where event_type = 'lesson_search' and coalesce(trim(payload->>'term'), '') <> ''
        group by 1
      ) t
    ),
    'exams', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'lesson', lesson, 'passes', passes, 'fails', fails, 'total', passes + fails,
        'pass_pct', round(100.0 * passes / nullif(passes + fails, 0)),
        'avg_score', avg_score) order by (passes + fails) desc), '[]'::jsonb)
      from (
        select coalesce(payload->>'lesson_title', payload->>'lesson_id') as lesson,
               count(*) filter (where event_type = 'exam_pass') as passes,
               count(*) filter (where event_type = 'exam_fail') as fails,
               round(avg((payload->>'score')::numeric) filter (where event_type = 'exam_pass')) as avg_score
        from cur where event_type in ('exam_pass', 'exam_fail')
        group by 1
      ) t
    ),
    'reading', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'lesson', lesson, 'reads', reads, 'completes', completes,
        'completion_pct', round(100.0 * completes / nullif(reads, 0))) order by reads desc), '[]'::jsonb)
      from (
        select coalesce(payload->>'lesson_title', payload->>'lesson_id') as lesson,
               count(*) as reads,
               count(*) filter (where (payload->>'completed')::boolean) as completes
        from cur where event_type = 'lesson_read'
        group by 1
      ) t
    )
  );
$$;

revoke execute on function public.analytics_lessons_summary(timestamptz, timestamptz, timestamptz, timestamptz) from public, anon;
grant  execute on function public.analytics_lessons_summary(timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;
```

- [ ] **Step 2: Aplicar en el SQL Editor**

Ejecuta el archivo en el SQL Editor de Supabase. Esperado: `Success. No rows returned`.

- [ ] **Step 3: Verificar (query de control)**

```sql
select public.analytics_lessons_summary(
  now() - interval '30 days', now(),
  now() - interval '60 days', now() - interval '30 days') -> 'reading';
```
Esperado: un array (`[]` si aún no hay eventos `lesson_read`) de objetos `{lesson, reads, completes, completion_pct}`. Sin errores de tipo.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/update_analytics_lessons_summary_reading.sql
git commit -m "feat(db): analytics_lessons_summary devuelve reading[] (telemetría de lectura)"
```

---

### Task 5: Cablear el tracker en `lessons.js` + `main.js`

Instancia el tracker, lo arranca al abrir cada lección, lo vacía al cambiar de pestaña / ocultar la página. Glue/DOM → se verifica en navegador.

**Files:**
- Modify: `js/lessons.js`
- Modify: `js/main.js`

**Interfaces:**
- Consumes: `createReadingTracker` (Task 2); `track` de `./analytics.js` (ya importado en lessons.js); `getSeleccion` (ya importado).
- Produces: `window.lessonsFlushReading` (llamado por `main.js`).

- [ ] **Step 1: Importar y crear el tracker (module scope)**

En `js/lessons.js`, añade el import junto a los demás:
```javascript
import { createReadingTracker } from './reading-tracker.js'
```
Y a nivel de módulo (fuera de `renderLessons`), tras los imports, crea el tracker singleton y los disparadores globales:
```javascript
// Telemetría de lectura: un tracker por sesión de portal. Se arranca al abrir
// una lección y se vacía al salir de la pestaña u ocultar la página.
const readingTracker = createReadingTracker({ track, now: () => Date.now() })
window.lessonsFlushReading = () => readingTracker.flush('tab')
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') readingTracker.flush('hidden')
})
window.addEventListener('pagehide', () => readingTracker.flush('pagehide'))
```

- [ ] **Step 2: Arrancar el tracker al pintar una lección**

En `renderLessonContent(panel, lesson)` de `js/lessons.js`, DESPUÉS de que se pinta el contenido en `panel` (al final de la función), añade:
```javascript
    const selRead = getSeleccion()
    readingTracker.start(panel, {
      lesson_id: lesson.id,
      lesson_title: lesson.titulo || '',
      category: lesson.categoria || '',
      vertical: selRead.vertical,
      plataforma: selRead.plataforma,
    })
```
(`getSeleccion` ya se usa en este archivo para el `...sel` de `lesson_open`; reutiliza el mismo origen de datos.)

- [ ] **Step 3: Vaciar al salir de la pestaña (main.js)**

En `js/main.js`, en `switchTab`, junto al `lessonsCleanup` existente:
```javascript
  if (tab !== 'lessons') { window.lessonsCleanup?.(); window.lessonsFlushReading?.() }
  else window.lessonsResume?.()
```
(Reemplaza la línea `if (tab !== 'lessons') window.lessonsCleanup?.()`; conserva la rama `else window.lessonsResume?.()`.)

- [ ] **Step 4: Verificar sintaxis + suite completa**

Run: `node --check js/lessons.js && node --check js/main.js && node --test tests/*.test.mjs`
Expected: sintaxis OK; todos los tests pasan (los módulos nuevos no rompen nada).

- [ ] **Step 5: Commit**

```bash
git add js/lessons.js js/main.js
git commit -m "feat: emitir telemetría de lectura al abrir/abandonar una lección"
```

---

### Task 6: Vista — llenar `% leída` y la tarjeta real "se abren pero no terminan"

`admin-lessons-analytics.js` consume `summary.reading`: llena la columna de la tabla y reemplaza el `soonCard` "próximamente" por la tarjeta real. Glue/DOM → se verifica en navegador.

**Files:**
- Modify: `js/admin-lessons-analytics.js`

**Interfaces:**
- Consumes: `mergeLessonTable` (ahora con `reading`), `selectNotFinished` (Task 3); `summary.reading` de la RPC (Task 4).

- [ ] **Step 1: Importar `selectNotFinished`**

En `js/admin-lessons-analytics.js`, añade `selectNotFinished` al import desde `./lessons-analytics.js`:
```javascript
import {
  computeLessonKpis, selectTrapLessons, zeroResultSearches, mergeLessonTable, selectNotFinished,
} from './lessons-analytics.js'
```

- [ ] **Step 2: Pasar `reading` a la tabla y calcular la tarjeta**

Reemplaza la línea que arma `table`:
```javascript
  const table = mergeLessonTable(summary.top_lessons, summary.exams)
```
por:
```javascript
  const table = mergeLessonTable(summary.top_lessons, summary.exams, summary.reading || [])
  const notFinished = selectNotFinished(summary.reading || [])
```

- [ ] **Step 3: Reemplazar el `soonCard` por la tarjeta real**

Reemplaza la definición completa de `soonCard`:
```javascript
  const soonCard = `
    <div class="bg-white rounded-2xl border border-dashed border-[var(--blue-20)] p-4 opacity-70">
      <p class="text-sm font-bold text-[var(--black-60)]">📉 Se abren pero no se terminan</p>
      <p class="text-[11px] text-[var(--black-40)] mt-1">Requiere telemetría de lectura (scroll/tiempo) — próximamente.</p>
    </div>`
```
por:
```javascript
  const soonCard = notFinished.length ? `
    <div class="bg-white rounded-2xl border-l-4 border-[var(--warning-150)] border border-[var(--blue-10)] p-4">
      <p class="text-sm font-bold text-[var(--black-100)]">📉 Se abren pero no se terminan <span class="text-[11px] font-normal text-[var(--black-60)]">— baja lectura completa → acortar/mejorar el inicio</span></p>
      ${notFinished.map(r => `<div class="flex justify-between items-center mt-2 text-xs">
        <span class="text-[var(--black-100)] font-semibold truncate mr-2">${escapeHtml(r.lesson)}</span>
        <span class="shrink-0 text-[var(--warning-150)] font-bold">${r.completion_pct}% leída · ${r.reads} lecturas</span></div>`).join('')}
    </div>` : ''
```

- [ ] **Step 4: Llenar la columna `% leída` de la tabla**

En el `<tbody>` de la tabla, reemplaza la celda fija:
```javascript
            <td class="py-1.5 text-right text-[var(--black-40)]">—</td>
```
por:
```javascript
            <td class="py-1.5 text-right ${r.read_pct == null ? 'text-[var(--black-40)]' : ''}">${r.read_pct == null ? '—' : r.read_pct + '%'}</td>
```
Y en el `<thead>`, cambia el encabezado de esa columna de `% leída <span class="normal-case font-normal">(pronto)</span>` a solo `% leída`.

- [ ] **Step 5: (Atención) manejar el caso sin tarjetas**

`atencionCards` ya filtra `[trapCard, zombieCard, zeroCard].filter(Boolean)`; el `soonCard` se renderiza aparte tras ellas. Como ahora `soonCard` puede ser `''`, verifica que el bloque de atención siga válido: en el HTML de `atencion`, la línea `${soonCard}` queda vacía si no hay lecciones sin terminar (correcto, no muestra placeholder). No se requiere cambio adicional salvo confirmar que `atencionCards || '<p...>Sin señales…</p>'` sigue cubriendo el caso de que TODO esté vacío.

- [ ] **Step 6: Verificar sintaxis**

Run: `node --check js/admin-lessons-analytics.js && node --test tests/*.test.mjs`
Expected: sintaxis OK; suite completa pasa.

- [ ] **Step 7: Verificar en navegador**

Con el SQL de Task 4 aplicado y login admin: Analytics → Lecciones. La columna `% leída` muestra `%` real (o `—` si una lección no tiene lecturas medidas aún) y, si hay lecciones con ≥5 lecturas y ≤40% completado, aparece la tarjeta "se abren pero no se terminan". (Al inicio, sin eventos `lesson_read`, la columna será `—` y la tarjeta no aparecerá — es correcto; se pobla conforme entren lecturas.)

- [ ] **Step 8: Commit**

```bash
git add js/admin-lessons-analytics.js
git commit -m "feat: Dashboard Lecciones muestra % leída y la tarjeta 'no se terminan'"
```

---

## Cierre del sub-proyecto

El portal captura la lectura (`lesson_read`), la RPC la agrega (`reading[]`), y el dashboard muestra `% leída` real + la tarjeta "se abren pero no terminan". Las piezas *próximamente* del Dashboard Lecciones quedan completas. Pendiente de despliegue/verificación: aplicar el SQL de Task 4 en Supabase y comprobar en navegador con login admin.

## Self-review (cobertura del spec)

- Evento `lesson_read` con el payload exacto → Task 2 (emisión) + Task 5 (cableado y disparadores visibilitychange/pagehide/switchTab).
- Regla `scroll ≥90% + ≥5s`, cabe-sin-scroll=100 → Task 1 (helpers) usados por Task 2.
- Listener de scroll que se quita al flush (no romper como #7) → Task 2 (implementación + test dedicado).
- Métrica `% leída = completes/reads`; tarjeta reads≥5 y ≤40% → Task 3 (RPC completion_pct + selectNotFinished) + Task 6 (UI).
- RPC agrega `reading[]` sin romper consumidores → Task 4 (create or replace, solo añade clave).
- Tema Merlin en la UI nueva → Task 6 (solo tokens `--warning-150`, `--black-*`, `--blue-10`).
- Matiz denominador (lecturas medidas ≤ visitas) → documentado en el spec; la tabla mantiene Visitas de `lesson_open` y `% leída` de `lesson_read`.
