# Dashboard Lecciones (②) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescribir la pestaña **Lecciones** del analytics con la estructura de 3 capas (Impacto → Requiere tu atención → Exploración) consumiendo RPCs pre-agregadas, más una RPC nueva para detectar lecciones "zombie".

**Architecture:** Se añade una RPC `analytics_zombie_lessons` (SQL aplicado a mano en Supabase). La lógica de derivación de métricas se extrae a un módulo puro testeable `js/lessons-analytics.js`; la vista `js/admin-lessons-analytics.js` la pinta con los helpers de UI compartidos (`analytics-ui.js`) y las funciones de datos (`analytics-api.js`). El shell deja de montar el `admin-analytics.js` viejo (con `.limit(5000)`) en la pestaña Lecciones.

**Tech Stack:** PostgreSQL (Supabase, PL/pgSQL/SQL), JS vanilla ESM, runner `node:test` (`.mjs`).

## Global Constraints

- **JS vanilla, sin bundler.** El cliente Supabase se importa por ESM desde CDN vía `analytics-api.js` (import dinámico perezoso). NO convertir a import estático — rompe el runner de tests de Node.
- **Nada de bajar miles de filas al cliente.** Toda agregación ocurre en RPC; el cliente recibe el `jsonb`. No reintroducir `.limit(5000)`/`.limit(2000)`.
- **Tema Merlin.** Usar solo tokens de `css/style.css`: `--blue-100`, `--coral-100`, `--success-*`, `--warning-*`, `--error-*`, `--black-*`, `--background-page`, `--font-family`. No inventar colores.
- **Selector de fechas con picker de calendario** en la pestaña (presets Hoy/7d/30d/mes/año + rango), vía `rangeControlsHtml`/`wireRangeControls` de `analytics-ui.js`.
- **Tests:** `node --test tests/<archivo>.test.mjs` (no hay script `test` en package.json).
- **Migraciones a mano.** Cada `.sql` va en `supabase/migrations/`, idempotente (`create or replace`), cabecera-comentario en español + `-- Ejecutar UNA sola vez en el SQL Editor`. El usuario las aplica.
- **Diferido a ①b (telemetría FRONT), fuera de este plan:** "% leída completa" y "se abren pero no se terminan" (scroll/tiempo). Se muestran como columnas/tarjetas marcadas *próximamente*, no se calculan.

---

### Task 1: RPC `analytics_zombie_lessons`

Lecciones activas con casi cero aperturas en el rango. La RPC `analytics_lessons_summary` solo devuelve el *top* de lecciones; para el fondo (zombies) hace falta cruzar `lecciones` (activas) contra los `lesson_open`. El evento `lesson_open` lleva `payload.lesson_id = lecciones.id` (ver `js/lessons.js:169`), así que el join es por `lesson_id`.

**Files:**
- Create: `supabase/migrations/create_analytics_zombie_lessons.sql`

**Interfaces:**
- Consumes: `public.lecciones` (col `active`), `public.analytics_events` (event `lesson_open`, `payload.lesson_id`).
- Produces: función `public.analytics_zombie_lessons(p_from timestamptz, p_to timestamptz, p_max_visits int default 2) returns jsonb` = array de `{lesson_id, titulo, categoria, visits}` ordenado por `visits` asc, solo lecciones activas con `visits <= p_max_visits`.

- [ ] **Step 1: Escribir la migración**

```sql
-- analytics_zombie_lessons: lecciones ACTIVAS con casi cero aperturas en el
-- rango [p_from, p_to] (candidatas a despublicar/refundir/promocionar). Cuenta
-- eventos 'lesson_open' por lesson_id (payload->>'lesson_id' = lecciones.id).
-- Left join para que una lección con 0 aperturas cuente 0 (no desaparezca).
-- security definer: corre con privilegios del owner y solo expone agregados.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
create or replace function public.analytics_zombie_lessons(
  p_from       timestamptz,
  p_to         timestamptz,
  p_max_visits int default 2
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'lesson_id', id, 'titulo', titulo, 'categoria', categoria, 'visits', visits
  ) order by visits asc, titulo), '[]'::jsonb)
  from (
    select l.id, l.titulo, l.categoria,
           count(e.id) as visits
    from lecciones l
    left join analytics_events e
      on e.event_type = 'lesson_open'
     and e.payload->>'lesson_id' = l.id::text
     and e.created_at >= p_from and e.created_at <= p_to
    where l.active = true
    group by l.id, l.titulo, l.categoria
  ) t
  where visits <= p_max_visits;
$$;

revoke execute on function public.analytics_zombie_lessons(timestamptz, timestamptz, int) from public, anon;
grant  execute on function public.analytics_zombie_lessons(timestamptz, timestamptz, int) to authenticated;
```

- [ ] **Step 2: Aplicar en el SQL Editor**

Pega el archivo en el SQL Editor de Supabase y ejecútalo. Esperado: `Success. No rows returned`.

- [ ] **Step 3: Verificar (query de control)**

```sql
select jsonb_pretty(public.analytics_zombie_lessons(now() - interval '30 days', now(), 2));
```
Esperado: array (`[]` si no hay) de objetos `{lesson_id, titulo, categoria, visits}` con `visits <= 2`, ordenado por `visits` ascendente. Sin errores de tipo.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/create_analytics_zombie_lessons.sql
git commit -m "feat(db): RPC analytics_zombie_lessons (lecciones activas sin visitas)"
```

---

### Task 2: `fetchZombieLessons` en `analytics-api.js`

Expone la RPC de Task 1 como función tipada, siguiendo el patrón de las demás (async, resuelve el cliente Supabase perezosamente, `client` inyectable para tests).

**Files:**
- Modify: `js/analytics-api.js` (añadir función al final)
- Test: `tests/analytics-api.test.mjs` (añadir casos)

**Interfaces:**
- Consumes: `getSupabaseClient`, `callRpc` (privados del módulo).
- Produces: `fetchZombieLessons(from: Date, to: Date, maxVisits?: number, client?) → Promise<Array<{lesson_id,titulo,categoria,visits}>>`.

- [ ] **Step 1: Escribir el test que falla**

Añade a `tests/analytics-api.test.mjs` (usa los helpers `fakeClient`/`errorClient` ya existentes en ese archivo; añade el import de `fetchZombieLessons`):

```javascript
import { fetchZombieLessons } from '../js/analytics-api.js'

test('fetchZombieLessons llama la RPC con fechas ISO y p_max_visits', async () => {
  const cap = {}
  const from = new Date('2026-07-01T00:00:00Z')
  const to = new Date('2026-07-31T23:59:59Z')
  await fetchZombieLessons(from, to, 3, fakeClient(cap))
  assert.equal(cap.name, 'analytics_zombie_lessons')
  assert.equal(cap.params.p_from, from.toISOString())
  assert.equal(cap.params.p_to, to.toISOString())
  assert.equal(cap.params.p_max_visits, 3)
})

test('fetchZombieLessons usa p_max_visits=2 por defecto', async () => {
  const cap = {}
  await fetchZombieLessons(new Date('2026-07-01T00:00:00Z'), new Date('2026-07-31T00:00:00Z'), undefined, fakeClient(cap))
  assert.equal(cap.params.p_max_visits, 2)
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test tests/analytics-api.test.mjs`
Expected: FAIL — `fetchZombieLessons` no está exportada.

- [ ] **Step 3: Escribir la implementación**

Añade al final de `js/analytics-api.js`:

```javascript
export async function fetchZombieLessons(from, to, maxVisits = 2, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'analytics_zombie_lessons', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_max_visits: maxVisits,
  })
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test tests/analytics-api.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/analytics-api.js tests/analytics-api.test.mjs
git commit -m "feat: fetchZombieLessons en analytics-api (+ tests)"
```

---

### Task 3: Módulo puro `js/lessons-analytics.js` (derivaciones + señales)

Toda la lógica de derivación de la pestaña Lecciones, sin DOM ni supabase → testeable en Node. La vista (Task 4) solo pinta lo que estas funciones devuelven.

**Files:**
- Create: `js/lessons-analytics.js`
- Test: `tests/lessons-analytics.test.mjs`

**Interfaces:**
- Consumes: `summary` (forma de `analytics_lessons_summary`), `funnel` (forma de `analytics_course_funnel`).
- Produces:
  - `pctDelta(cur: number, prev: number|null) → number|null`
  - `completionPct(funnel: {entered,certificate}) → number|null`
  - `computeLessonKpis(summary, funnel) → {visits, visitsDelta, newStudents, newStudentsDelta, completionPct, certificates}`
  - `selectTrapLessons(exams: Array, opts?: {minTotal,maxPassPct,limit}) → Array` (lecciones "trampa")
  - `zeroResultSearches(searches: Array, opts?: {limit}) → Array`
  - `mergeLessonTable(topLessons: Array, exams: Array, opts?: {limit}) → Array<{lesson,visits,pass_pct}>`

- [ ] **Step 1: Escribir el test que falla**

```javascript
// tests/lessons-analytics.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  pctDelta, completionPct, computeLessonKpis,
  selectTrapLessons, zeroResultSearches, mergeLessonTable,
} from '../js/lessons-analytics.js'

test('pctDelta: variación porcentual redondeada', () => {
  assert.equal(pctDelta(120, 100), 20)
  assert.equal(pctDelta(80, 100), -20)
})

test('pctDelta: prev 0 o null devuelve null (no % contra cero)', () => {
  assert.equal(pctDelta(50, 0), null)
  assert.equal(pctDelta(50, null), null)
})

test('completionPct: certificados / entraron al curso', () => {
  assert.equal(completionPct({ entered: 40, certificate: 10 }), 25)
  assert.equal(completionPct({ entered: 0, certificate: 0 }), null)
})

test('computeLessonKpis: arma KPIs con deltas', () => {
  const summary = { kpis: { visits: 300, prev_visits: 250, new_students: 40, prev_new_students: 50, cert_views: 12 } }
  const funnel = { entered: 40, certificate: 10 }
  assert.deepEqual(computeLessonKpis(summary, funnel), {
    visits: 300, visitsDelta: 20,
    newStudents: 40, newStudentsDelta: -20,
    completionPct: 25, certificates: 12,
  })
})

test('selectTrapLessons: baja aprobación con muestra suficiente, peor primero', () => {
  const exams = [
    { lesson: 'A', total: 10, pass_pct: 40 },
    { lesson: 'B', total: 3,  pass_pct: 20 },   // muestra chica → fuera
    { lesson: 'C', total: 20, pass_pct: 90 },   // aprueban → fuera
    { lesson: 'D', total: 8,  pass_pct: 55 },
  ]
  const r = selectTrapLessons(exams, { minTotal: 5, maxPassPct: 60 })
  assert.deepEqual(r.map(x => x.lesson), ['A', 'D'])
})

test('zeroResultSearches: solo con zero_count>0, más frecuentes primero', () => {
  const searches = [
    { term: 'x', count: 5, zero_count: 0 },
    { term: 'y', count: 9, zero_count: 9 },
    { term: 'z', count: 4, zero_count: 2 },
  ]
  assert.deepEqual(zeroResultSearches(searches).map(s => s.term), ['y', 'z'])
})

test('mergeLessonTable: cruza visitas con % aprueban por título', () => {
  const top = [{ lesson: 'A', count: 30 }, { lesson: 'B', count: 10 }]
  const exams = [{ lesson: 'A', pass_pct: 80 }]
  assert.deepEqual(mergeLessonTable(top, exams), [
    { lesson: 'A', visits: 30, pass_pct: 80 },
    { lesson: 'B', visits: 10, pass_pct: null },
  ])
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test tests/lessons-analytics.test.mjs`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Escribir la implementación**

```javascript
// js/lessons-analytics.js
// Derivaciones puras de la pestaña Lecciones del analytics. Sin DOM ni supabase
// → testeable en Node. La vista (admin-lessons-analytics.js) solo pinta lo que
// estas funciones devuelven a partir de los jsonb de las RPCs.

export function pctDelta(cur, prev) {
  if (prev == null || prev === 0) return null
  return Math.round(100 * (cur - prev) / prev)
}

export function completionPct(funnel) {
  const entered = funnel?.entered || 0
  const cert = funnel?.certificate || 0
  if (entered === 0) return null
  return Math.round(100 * cert / entered)
}

export function computeLessonKpis(summary, funnel) {
  const k = summary?.kpis || {}
  return {
    visits: k.visits ?? 0,
    visitsDelta: pctDelta(k.visits ?? 0, k.prev_visits),
    newStudents: k.new_students ?? 0,
    newStudentsDelta: pctDelta(k.new_students ?? 0, k.prev_new_students),
    completionPct: completionPct(funnel),
    certificates: k.cert_views ?? 0,
  }
}

export function selectTrapLessons(exams, { minTotal = 5, maxPassPct = 60, limit = 5 } = {}) {
  return (exams || [])
    .filter(e => (e.total ?? 0) >= minTotal && e.pass_pct != null && e.pass_pct <= maxPassPct)
    .sort((a, b) => a.pass_pct - b.pass_pct)
    .slice(0, limit)
}

export function zeroResultSearches(searches, { limit = 8 } = {}) {
  return (searches || [])
    .filter(s => (s.zero_count ?? 0) > 0)
    .sort((a, b) => (b.zero_count ?? 0) - (a.zero_count ?? 0))
    .slice(0, limit)
}

export function mergeLessonTable(topLessons, exams, { limit = 10 } = {}) {
  const passByLesson = new Map((exams || []).map(e => [e.lesson, e.pass_pct]))
  return (topLessons || [])
    .slice(0, limit)
    .map(l => ({
      lesson: l.lesson,
      visits: l.count,
      pass_pct: passByLesson.has(l.lesson) ? passByLesson.get(l.lesson) : null,
    }))
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test tests/lessons-analytics.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add js/lessons-analytics.js tests/lessons-analytics.test.mjs
git commit -m "feat: lessons-analytics — derivaciones puras de la pestaña Lecciones (+ tests)"
```

---

### Task 4: Vista `js/admin-lessons-analytics.js`

Pinta las 3 capas usando `analytics-api.js` (datos), `lessons-analytics.js` (derivaciones) y `analytics-ui.js` (helpers). Espeja `admin-exec-analytics.js`. Es glue/DOM → se verifica en navegador, no con unit test.

**Files:**
- Create: `js/admin-lessons-analytics.js`

**Interfaces:**
- Consumes: `fetchLessonsSummary`, `fetchCourseFunnel`, `fetchZombieLessons` (analytics-api); `computeLessonKpis`, `selectTrapLessons`, `zeroResultSearches`, `mergeLessonTable` (lessons-analytics); `rangeControlsHtml`, `wireRangeControls`, `computeRange`, `kpiCard`, `llmNote` (analytics-ui); `escapeHtml`, `exportCSV` (utils).
- Produces: `renderLessonsAnalytics(from?: Date, to?: Date)` — monta en `#analytics-content`.

- [ ] **Step 1: Escribir la vista**

```javascript
// js/admin-lessons-analytics.js
// Pestaña Lecciones del analytics (3 capas: Impacto / Requiere tu atención /
// Exploración). Consume RPCs pre-agregadas; nada de bajar filas crudas. Las
// piezas FRONT (% leída completa, abandono de lectura) dependen de ①b y se
// muestran como 'próximamente'.
import {
  fetchLessonsSummary, fetchCourseFunnel, fetchZombieLessons,
} from './analytics-api.js'
import {
  computeLessonKpis, selectTrapLessons, zeroResultSearches, mergeLessonTable,
} from './lessons-analytics.js'
import {
  rangeControlsHtml, wireRangeControls, computeRange, kpiCard,
} from './analytics-ui.js'
import { escapeHtml, exportCSV } from './utils.js'

const deltaHtml = (d) => {
  if (d == null) return `<span class="text-[11px] text-[var(--black-40)]">— vs previo</span>`
  const up = d >= 0
  const color = up ? 'var(--success-150)' : 'var(--error-100)'
  return `<span class="text-[11px] font-bold" style="color:${color}">${up ? '▲' : '▼'} ${Math.abs(d)}% vs previo</span>`
}

export async function renderLessonsAnalytics(from = null, to = null) {
  const el = document.getElementById('analytics-content')
  if (!el) return
  if (!from || !to) { const r = computeRange('30d', new Date()); from = r.from; to = r.to }
  const prevFrom = new Date(from); const prevTo = new Date(to)
  const span = to - from
  prevFrom.setTime(from.getTime() - span); prevTo.setTime(from.getTime())
  el.innerHTML = `<p class="text-[var(--black-40)] text-sm p-4">Cargando…</p>`

  let summary, funnel, zombies
  try {
    [summary, funnel, zombies] = await Promise.all([
      fetchLessonsSummary(from, to, prevFrom, prevTo),
      fetchCourseFunnel(from, to),
      fetchZombieLessons(from, to, 2),
    ])
  } catch (e) {
    el.innerHTML = `<p class="text-[var(--error-100)] text-sm p-4">Error: ${escapeHtml(e.message)}</p>`
    return
  }

  const kpi = computeLessonKpis(summary, funnel)
  const traps = selectTrapLessons(summary.exams)
  const zeroSearches = zeroResultSearches(summary.searches)
  const table = mergeLessonTable(summary.top_lessons, summary.exams)

  // ── ① Impacto ──────────────────────────────────────────────────────────────
  const kcard = (label, value, delta) => `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
      <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mb-1">${label}</p>
      <p class="text-2xl font-black text-[var(--black-100)]">${value}</p>
      <div class="mt-1">${delta}</div>
    </div>`
  const impacto = `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      ${kcard('Visitas', kpi.visits, deltaHtml(kpi.visitsDelta))}
      ${kcard('Estudiantes en curso', kpi.newStudents, deltaHtml(kpi.newStudentsDelta))}
      ${kpiCard('% que termina el curso', kpi.completionPct == null ? '—' : kpi.completionPct + '%', 'certificados ÷ entraron al curso')}
      ${kpiCard('Certificados', kpi.certificates)}
    </div>`

  // ── ② Requiere tu atención ──────────────────────────────────────────────────
  const trapCard = traps.length ? `
    <div class="bg-white rounded-2xl border-l-4 border-[var(--error-100)] border border-[var(--blue-10)] p-4">
      <p class="text-sm font-bold text-[var(--black-100)]">🔴 Lecciones "trampa" <span class="text-[11px] font-normal text-[var(--black-60)]">— alta reprobación → reescribir</span></p>
      ${traps.map(t => `<div class="flex justify-between items-center mt-2 text-xs">
        <span class="text-[var(--black-100)] font-semibold truncate mr-2">${escapeHtml(t.lesson)}</span>
        <span class="shrink-0 text-[var(--error-100)] font-bold">${t.pass_pct}% aprueba · ${t.total} exámenes</span></div>`).join('')}
    </div>` : ''
  const zombieCard = zombies.length ? `
    <div class="bg-white rounded-2xl border-l-4 border-[var(--warning-150)] border border-[var(--blue-10)] p-4">
      <p class="text-sm font-bold text-[var(--black-100)]">👻 Lecciones "zombie" <span class="text-[11px] font-normal text-[var(--black-60)]">— activas casi sin visitas → despublicar/promocionar</span></p>
      ${zombies.slice(0, 6).map(z => `<div class="flex justify-between items-center mt-2 text-xs">
        <span class="text-[var(--black-100)] font-semibold truncate mr-2">${escapeHtml(z.titulo)}</span>
        <span class="shrink-0 text-[var(--black-60)]">${z.visits} visita(s)</span></div>`).join('')}
    </div>` : ''
  const zeroCard = zeroSearches.length ? `
    <div class="bg-white rounded-2xl border-l-4 border-[var(--warning-150)] border border-[var(--blue-10)] p-4">
      <p class="text-sm font-bold text-[var(--black-100)]">🔎 Búsquedas sin resultado <span class="text-[11px] font-normal text-[var(--black-60)]">— demanda de contenido inexistente → crear lección</span></p>
      ${zeroSearches.map(s => `<div class="flex justify-between items-center mt-2 text-xs">
        <span class="text-[var(--black-100)] font-semibold truncate mr-2">"${escapeHtml(s.term)}"</span>
        <span class="shrink-0 text-[var(--warning-150)] font-bold">${s.zero_count} sin resultado</span></div>`).join('')}
    </div>` : ''
  const soonCard = `
    <div class="bg-white rounded-2xl border border-dashed border-[var(--blue-20)] p-4 opacity-70">
      <p class="text-sm font-bold text-[var(--black-60)]">📉 Se abren pero no se terminan</p>
      <p class="text-[11px] text-[var(--black-40)] mt-1">Requiere telemetría de lectura (scroll/tiempo) — próximamente.</p>
    </div>`
  const atencionCards = [trapCard, zombieCard, zeroCard].filter(Boolean).join('')
  const atencion = `
    <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mt-6 mb-2">Requiere tu atención</p>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
      ${atencionCards || '<p class="text-xs text-[var(--black-40)]">Sin señales en el rango.</p>'}
      ${soonCard}
    </div>`

  // ── ③ Exploración ───────────────────────────────────────────────────────────
  const stages = [
    ['Entró al curso', funnel.entered], ['Abrió lección', funnel.opened_lesson],
    ['Presentó examen', funnel.took_exam], ['Aprobó', funnel.approved], ['Certificado', funnel.certificate],
  ]
  const base = funnel.entered || 0
  const funnelHtml = `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
      <p class="text-sm font-bold text-[var(--black-100)] mb-3">Embudo del curso</p>
      ${stages.map(([label, n]) => {
        const pct = base ? Math.round(100 * (n || 0) / base) : 0
        return `<div class="mb-2">
          <div class="flex justify-between text-xs mb-0.5"><span class="text-[var(--black-60)]">${label}</span><span class="font-bold text-[var(--black-100)]">${n || 0} <span class="text-[var(--black-40)]">(${pct}%)</span></span></div>
          <div class="h-2 rounded-full bg-[var(--black-10)]"><div class="h-2 rounded-full bg-[var(--blue-100)]" style="width:${pct}%"></div></div>
        </div>`
      }).join('')}
    </div>`

  const maxV = Math.max(1, ...(summary.visits_by_day || []).map(d => d.count))
  const trendHtml = `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
      <p class="text-sm font-bold text-[var(--black-100)] mb-3">Visitas por día</p>
      <div class="flex items-end gap-1" style="height:120px">
        ${(summary.visits_by_day || []).map(d => `<div class="flex-1 bg-[var(--blue-100)] rounded-t" style="height:${Math.round(120 * d.count / maxV)}px" title="${d.day}: ${d.count}"></div>`).join('') || '<span class="text-xs text-[var(--black-40)]">Sin datos</span>'}
      </div>
    </div>`

  const tableHtml = `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
      <div class="flex justify-between items-center mb-3">
        <p class="text-sm font-bold text-[var(--black-100)]">Lecciones</p>
        <button id="lessons-export" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--coral-100)] text-white">⬇ Exportar</button>
      </div>
      <table class="w-full text-xs">
        <thead><tr class="text-left text-[var(--black-40)] uppercase text-[10px]">
          <th class="pb-2">Lección</th><th class="pb-2 text-right">Visitas</th><th class="pb-2 text-right">% aprueban</th>
          <th class="pb-2 text-right">% leída <span class="normal-case font-normal">(pronto)</span></th>
        </tr></thead>
        <tbody>
          ${table.map(r => `<tr class="border-t border-[var(--blue-10)]">
            <td class="py-1.5 text-[var(--black-100)] font-semibold">${escapeHtml(r.lesson)}</td>
            <td class="py-1.5 text-right">${r.visits}</td>
            <td class="py-1.5 text-right">${r.pass_pct == null ? '—' : r.pass_pct + '%'}</td>
            <td class="py-1.5 text-right text-[var(--black-40)]">—</td>
          </tr>`).join('') || '<tr><td colspan="4" class="py-2 text-[var(--black-40)]">Sin datos</td></tr>'}
        </tbody>
      </table>
    </div>`

  el.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      ${rangeControlsHtml('lessons', from, to)}
    </div>
    <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mb-2">Impacto</p>
    ${impacto}
    ${atencion}
    <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mt-6 mb-2">Exploración</p>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
      ${funnelHtml}
      ${trendHtml}
    </div>
    <div class="mt-3">${tableHtml}</div>`

  wireRangeControls(el, 'lessons', (f, t) => renderLessonsAnalytics(f, t))
  el.querySelector('#lessons-export')?.addEventListener('click', () => {
    exportCSV(table, 'lecciones.csv', [
      { label: 'Lección', getValue: r => r.lesson },
      { label: 'Visitas', getValue: r => r.visits },
      { label: '% aprueban', getValue: r => r.pass_pct ?? '' },
    ])
  })
}
```

- [ ] **Step 2: Verificar sintaxis**

Run: `node --check js/admin-lessons-analytics.js`
Expected: sin salida (OK).

- [ ] **Step 3: Commit**

```bash
git add js/admin-lessons-analytics.js
git commit -m "feat: vista Dashboard Lecciones (3 capas, RPCs pre-agregadas)"
```

---

### Task 5: Cablear el shell a la vista nueva

El shell (`analytics-shell.js`) monta la vista vieja `renderAnalyticsPanel` (de `admin-analytics.js`, con `.limit(5000)`) en la pestaña Lecciones. Se apunta a `renderLessonsAnalytics`. `admin-analytics.js` NO se borra: sigue exportando `renderResultsPanel`, que usa `admin.js`.

**Files:**
- Modify: `js/analytics-shell.js:5` (import) y `:34` (llamada)

**Interfaces:**
- Consumes: `renderLessonsAnalytics` (Task 4).

- [ ] **Step 1: Cambiar el import**

En `js/analytics-shell.js`, reemplaza:
```javascript
import { renderAnalyticsPanel } from './admin-analytics.js'
```
por:
```javascript
import { renderLessonsAnalytics } from './admin-lessons-analytics.js'
```

- [ ] **Step 2: Cambiar la llamada**

En la misma función, reemplaza:
```javascript
  else if (active === 'lecciones') renderAnalyticsPanel()
```
por:
```javascript
  else if (active === 'lecciones') renderLessonsAnalytics()
```

- [ ] **Step 3: Verificar sintaxis + suite completa**

Run: `node --check js/analytics-shell.js && node --test tests/*.test.mjs`
Expected: sintaxis OK; todos los tests pasan.

- [ ] **Step 4: Verificar en navegador**

Servidor no-cache + login admin → pestaña Analytics → sub-pestaña **Lecciones**. Esperado: 3 capas pintadas con datos reales; presets/calendario re-renderizan; export descarga CSV; sin errores en consola. (Requiere login Supabase.)

- [ ] **Step 5: Commit**

```bash
git add js/analytics-shell.js
git commit -m "feat: la pestaña Lecciones usa el dashboard rediseñado"
```

---

## Cierre del sub-proyecto

La pestaña Lecciones queda rediseñada con datos pre-agregados (sin `.limit(5000)`), señales accionables (trampa/zombie/búsquedas sin resultado) y exploración (embudo, tabla, tendencia). Pendiente de ①b: "% leída completa" y "se abren pero no se terminan" (marcadas *próximamente*). El puente bot→lección y el Resumen ejecutivo ya viven en ③.

## Self-review (cobertura del spec, sección "Pestaña Lecciones")

- ① KPIs: Visitas ✓, Estudiantes en curso ✓, % que termina ✓ (embudo), Certificados ✓ — Task 4.
- ② Atención: trampa ✓ (Task 3/4), zombie ✓ (Task 1-4), búsquedas sin resultado ✓, "se abren pero no terminan" → *próximamente* (FRONT ①b, fuera de alcance por decisión).
- ③ Exploración: embudo ✓, tabla lecciones (vistas + % aprueban ✓, % leída *próximamente*), búsquedas 0 resultados ✓ (dentro de la tarjeta de atención + tabla exportable), tendencia visitas ✓. "Estudiantes nuevos por día" no está en la RPC → se muestra solo visitas/día.
- Requisitos globales: picker de calendario ✓ (Task 4), tema Merlin ✓ (solo tokens), no bajar miles de filas ✓ (RPCs).
