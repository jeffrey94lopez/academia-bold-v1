# Analytics — Bold POS Academy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar eventos de comportamiento de estudiantes en Supabase y mostrar un dashboard de analytics con filtros de fecha en el panel admin.

**Architecture:** Un módulo `js/analytics.js` exporta `track(eventType, payload)` — fire-and-forget, nunca bloquea la UI. Los eventos se guardan en la tabla `analytics_events` de Supabase. El admin lee todos los eventos del período seleccionado y los agrega en JavaScript del lado del cliente.

**Tech Stack:** Vanilla JS ES modules, Supabase JS v2 (CDN), Tailwind CSS (CDN), sin librerías de analytics externas.

---

## File map

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `js/analytics.js` | Crear | Función `track()`, fire-and-forget |
| `js/lessons.js` | Modificar | Llamadas track: page_view, lesson_open, lesson_search, lesson_complete |
| `js/course.js` | Modificar | Llamadas track: mode_selected, exam_pass, exam_fail |
| `js/certificate.js` | Modificar | Llamadas track: certificate_view, certificate_print |
| `js/admin.js` | Modificar | `renderAnalyticsPanel(from, to)`, date filter, todas las secciones |
| `admin.html` | Modificar | Botón nav Analytics + div panel |

---

## Task 1: Supabase schema — tabla analytics_events

**Files:**
- No files — SQL ejecutado en el SQL Editor de Supabase

- [ ] **Step 1: Correr SQL en el SQL Editor de Supabase**

```sql
-- Tabla de eventos
CREATE TABLE analytics_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  text NOT NULL,
  payload     jsonb DEFAULT '{}',
  session_id  text,
  mode        text CHECK (mode IN ('course', 'explore')),
  created_at  timestamptz DEFAULT now()
);

-- Índices para queries por fecha y tipo
CREATE INDEX idx_analytics_type_date ON analytics_events (event_type, created_at DESC);
CREATE INDEX idx_analytics_date ON analytics_events (created_at DESC);

-- RLS
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert" ON analytics_events
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "auth_select" ON analytics_events
  FOR SELECT TO authenticated USING (true);
```

- [ ] **Step 2: Verificar en Table Editor de Supabase**

Abrir Supabase → Table Editor → `analytics_events`. Confirmar que la tabla existe con las columnas: `id`, `event_type`, `payload`, `session_id`, `mode`, `created_at`.

---

## Task 2: Crear js/analytics.js

**Files:**
- Create: `js/analytics.js`

- [ ] **Step 1: Crear el archivo**

```javascript
// js/analytics.js
import { supabase } from './supabase.js'

export function track(eventType, payload = {}) {
  const session_id = localStorage.getItem('bold_session_id') || null
  const mode = localStorage.getItem('bold_mode') || (session_id ? 'course' : null)

  supabase
    .from('analytics_events')
    .insert({ event_type: eventType, payload, session_id, mode })
    .then(({ error }) => {
      if (error) console.error('[analytics] track error:', error)
    })
}
```

- [ ] **Step 2: Verificar en consola del navegador**

Abrir `index.html` en el navegador. Abrir DevTools → Console. Ejecutar en consola:

```javascript
import('./js/analytics.js').then(m => m.track('test', { x: 1 }))
```

Esperar 1 segundo. Verificar en Supabase → Table Editor → `analytics_events` que apareció una fila con `event_type = 'test'`.

- [ ] **Step 3: Commit**

```bash
git add js/analytics.js
git commit -m "feat: add analytics.js track() module"
```

---

## Task 3: Instrumentar js/lessons.js

**Files:**
- Modify: `js/lessons.js`

Los puntos de tracking:
- `page_view` — cuando la sección de lecciones carga (después de resolver sesión/modo)
- `lesson_open` — cuando se abre una lección
- `lesson_search` — cuando el usuario escribe en el buscador (debounced 600ms)
- `lesson_complete` — en el path sin examen, después de marcar completa

- [ ] **Step 1: Agregar import de track al inicio del archivo**

En `js/lessons.js` línea 4 (después de `import { renderCertificate }`), agregar:

```javascript
import { track } from './analytics.js'
```

- [ ] **Step 2: Agregar page_view después del render del skeleton**

En `js/lessons.js`, después de la línea `container.innerHTML = \`...\`` (línea ~125, donde termina el skeleton de HTML), antes del comentario `// ── Shared: render lesson content`, agregar:

```javascript
  track('page_view', { page: 'lessons' })
```

- [ ] **Step 3: Agregar lesson_open en renderLessonContent**

En `js/lessons.js`, dentro de `function renderLessonContent(panel, lesson)`, justo después de `panel.innerHTML = ''` (primera línea de la función), agregar:

```javascript
    track('lesson_open', { lesson_id: lesson.id, lesson_title: lesson.titulo, category: lesson.categoria || 'Ventas' })
```

- [ ] **Step 4: Agregar lesson_search con debounce en el buscador desktop**

En `js/lessons.js`, reemplazar el listener del buscador desktop (líneas ~324-328):

```javascript
  // Desktop search
  let searchDebounce = null
  document.getElementById('ls-desk-search')?.addEventListener('input', e => {
    searchQuery = e.target.value
    renderAccordion()
    clearTimeout(searchDebounce)
    if (searchQuery.trim()) {
      searchDebounce = setTimeout(() => {
        const filtered = Object.values(grouped).flat().filter(l =>
          l.titulo.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (l.descripcion || '').toLowerCase().includes(searchQuery.toLowerCase()))
        track('lesson_search', { term: searchQuery.trim(), results_count: filtered.length })
      }, 600)
    }
  })
```

- [ ] **Step 5: Agregar lesson_search con debounce en el buscador mobile**

En `js/lessons.js`, reemplazar el listener del buscador mobile (línea ~415):

```javascript
  // Mobile search
  let mobSearchDebounce = null
  document.getElementById('ls-mob-search')?.addEventListener('input', e => {
    renderMobileLessonList()
    clearTimeout(mobSearchDebounce)
    const q = e.target.value.trim()
    if (q) {
      mobSearchDebounce = setTimeout(() => {
        const filtered = (grouped[activeCategory] || []).filter(l =>
          l.titulo.toLowerCase().includes(q.toLowerCase()) ||
          (l.descripcion || '').toLowerCase().includes(q.toLowerCase()))
        track('lesson_search', { term: q, results_count: filtered.length })
      }, 600)
    }
  })
```

- [ ] **Step 6: Agregar lesson_complete en el path sin examen**

En `js/lessons.js`, en el bloque `else` del path sin examen (líneas ~204-213), agregar `track('lesson_complete', ...)` justo antes de `.catch(...)`:

```javascript
          } else {
            track('lesson_complete', { lesson_id: lesson.id, lesson_title: lesson.titulo })
            markLessonComplete(courseStudent, String(lesson.id), 100).then(() =>
              checkAndMarkCourseComplete(courseStudent, allIds).then(done => {
                renderAccordion()
                renderDeskContent()
                renderMobileLessonList()
                if (done) setTimeout(() => renderCertificate(courseStudent), 500)
              })
            ).catch(err => console.error('[lessons] markLessonComplete error:', err))
          }
```

- [ ] **Step 7: Verificar en navegador**

1. Abrir la app → Lecciones. Verificar en Supabase que aparece un evento `page_view`.
2. Hacer clic en una lección. Verificar evento `lesson_open` con `lesson_id` y `lesson_title`.
3. Escribir algo en el buscador. Esperar 600ms. Verificar evento `lesson_search` con `term` y `results_count`.

- [ ] **Step 8: Commit**

```bash
git add js/lessons.js
git commit -m "feat: track page_view, lesson_open, lesson_search, lesson_complete in lessons.js"
```

---

## Task 4: Instrumentar js/course.js y js/certificate.js

**Files:**
- Modify: `js/course.js`
- Modify: `js/certificate.js`

- [ ] **Step 1: Agregar import en course.js**

En `js/course.js` línea 1 (después de `import { supabase }`), agregar:

```javascript
import { track } from './analytics.js'
```

- [ ] **Step 2: Agregar mode_selected en renderModeSelection**

En `js/course.js`, en el handler de `#cm-start` (dentro de `renderModeSelection`), agregar `track` justo antes de `onCourse(student)`:

```javascript
      const student = { id, nombre, apellido, progreso: {}, completado: false }
      track('mode_selected', { mode: 'course' })
      onCourse(student)
```

En el handler de `#cm-explore`, agregar `track` justo antes de `onExplore()`:

```javascript
  container.querySelector('#cm-explore').addEventListener('click', () => {
    setExploreMode()
    track('mode_selected', { mode: 'explore' })
    onExplore()
  })
```

- [ ] **Step 3: Agregar exam_pass y exam_fail en showExamModal**

En `js/course.js`, dentro de `renderSuccess(state)`, agregar `track` antes del `overlay.appendChild(card)` al final de la función:

```javascript
  function renderSuccess(state) {
    const { puntaje, courseComplete } = state
    track('exam_pass', { lesson_id: String(lesson.id), lesson_title: lesson.titulo, score: puntaje })
    // ... resto del código existente sin cambios
```

En `renderFailure(state)`, agregar `track` al inicio:

```javascript
  function renderFailure(state) {
    const { puntaje, wrongTexts } = state
    track('exam_fail', { lesson_id: String(lesson.id), lesson_title: lesson.titulo, score: puntaje })
    // ... resto del código existente sin cambios
```

- [ ] **Step 4: Agregar import en certificate.js**

En `js/certificate.js`, agregar después de los helpers privados (antes de `export function renderCertificate`):

```javascript
import { track } from './analytics.js'
```

Nota: `certificate.js` no tiene imports actualmente. Agregar en la primera línea del archivo.

- [ ] **Step 5: Agregar certificate_view en renderCertificate**

En `js/certificate.js`, dentro de `export function renderCertificate(student)`, justo después de `document.body.appendChild(overlay)`:

```javascript
  document.body.appendChild(overlay)
  track('certificate_view', {})
```

- [ ] **Step 6: Agregar certificate_print en printCertificate**

En `js/certificate.js`, dentro de `export function printCertificate(student)`, justo después de `const win = window.open('', '_blank')` y antes de `if (!win) return`:

```javascript
  const win = window.open('', '_blank')
  track('certificate_print', {})
  if (!win) return
```

- [ ] **Step 7: Verificar en navegador**

1. En la pantalla de selección de modo, elegir "Hacer el curso". Verificar evento `mode_selected` con `mode: 'course'` en Supabase.
2. Completar un examen y aprobar. Verificar evento `exam_pass` con `score` y `lesson_id`.
3. Reprobar un examen. Verificar evento `exam_fail`.

- [ ] **Step 8: Commit**

```bash
git add js/course.js js/certificate.js
git commit -m "feat: track mode_selected, exam_pass, exam_fail, certificate_view, certificate_print"
```

---

## Task 5: admin.html — nav Analytics + panel div

**Files:**
- Modify: `admin.html`
- Modify: `js/admin.js` (solo switchPanel y el import)

- [ ] **Step 1: Agregar botón nav en admin.html**

En `admin.html`, dentro del `<nav>`, después del botón de `results` (línea ~64), agregar:

```html
        <button data-panel="analytics" class="admin-nav w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50">
          <i data-lucide="trending-up" class="w-4 h-4"></i> Analytics
        </button>
```

- [ ] **Step 2: Agregar panel div en admin.html**

En `admin.html`, después de `<div id="panel-results" class="hidden"></div>` (línea ~74), agregar:

```html
        <div id="panel-analytics" class="hidden"></div>
```

- [ ] **Step 3: Agregar wiring en switchPanel de admin.js**

En `js/admin.js`, en la función `switchPanel` (líneas ~39-43), agregar al final del bloque de ifs:

```javascript
  if (panel === 'analytics') renderAnalyticsPanel()
```

- [ ] **Step 4: Verificar que el botón aparece y no rompe nada**

Abrir `admin.html`. Verificar que el botón "Analytics" aparece en el nav lateral. Hacer clic — el panel debe aparecer vacío (sin error en consola).

- [ ] **Step 5: Commit**

```bash
git add admin.html js/admin.js
git commit -m "feat: add Analytics nav button and panel div in admin"
```

---

## Task 6: renderAnalyticsPanel — date filter + summary cards

**Files:**
- Modify: `js/admin.js`

La función `renderAnalyticsPanel(from, to)` va al final de `admin.js` (después de `renderResultsPanel`).

- [ ] **Step 1: Agregar la función base con date filter y summary cards**

En `js/admin.js`, al final del archivo (después de la llave de cierre de `renderResultsPanel`), agregar:

```javascript
async function renderAnalyticsPanel(from = null, to = null) {
  const now = new Date()
  if (!from) { from = new Date(now); from.setHours(0, 0, 0, 0) }
  if (!to)   { to   = new Date(now); to.setHours(23, 59, 59, 999) }

  const el = document.getElementById('panel-analytics')
  if (!el) return
  el.innerHTML = '<p class="text-slate-400 text-sm">Cargando analytics...</p>'

  // Calcular período anterior del mismo largo
  const duration = to - from
  const prevFrom = new Date(from - duration)
  const prevTo   = new Date(from - 1)

  const [{ data: events, error }, { data: prevEvents }] = await Promise.all([
    supabase.from('analytics_events').select('*')
      .gte('created_at', from.toISOString()).lte('created_at', to.toISOString()),
    supabase.from('analytics_events').select('event_type,created_at')
      .gte('created_at', prevFrom.toISOString()).lte('created_at', prevTo.toISOString()),
  ])

  if (error) { el.innerHTML = '<p class="text-red-400 text-sm">Error al cargar analytics.</p>'; return }

  const ev = events || []
  const prev = prevEvents || []

  // Helpers
  function count(arr, type) { return arr.filter(e => e.event_type === type).length }
  function pct(n, d) { return d ? Math.round(n / d * 100) : 0 }
  function delta(cur, prv) {
    if (!prv) return ''
    const d = cur - prv
    if (d === 0) return '<span class="text-slate-400">sin cambio</span>'
    const sign = d > 0 ? '↑' : '↓'
    const color = d > 0 ? 'text-green-600' : 'text-red-500'
    return `<span class="${color} font-bold">${sign} ${Math.abs(d)}</span>`
  }

  const visits       = count(ev, 'page_view')
  const prevVisits   = count(prev, 'page_view')
  const newStudents  = count(ev, 'mode_selected')
  const prevStudents = count(prev, 'mode_selected')
  const passes       = ev.filter(e => e.event_type === 'exam_pass')
  const avgScore     = passes.length
    ? Math.round(passes.reduce((s, e) => s + (e.payload?.score || 0), 0) / passes.length)
    : 0
  const certViews  = count(ev, 'certificate_view')
  const certPrints = count(ev, 'certificate_print')

  // Preset helpers
  function preset(label, f, t) {
    return `<button class="analytics-preset px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
      data-from="${f.toISOString()}" data-to="${t.toISOString()}">${label}</button>`
  }
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999)
  function daysAgo(n) { const d = new Date(todayStart); d.setDate(d.getDate() - n); return d }
  function monthStart() { return new Date(now.getFullYear(), now.getMonth(), 1) }
  function yearStart()  { return new Date(now.getFullYear(), 0, 1) }

  const fmtDate = d => d.toISOString().split('T')[0]

  el.innerHTML = `
    <!-- Filter bar -->
    <div class="flex items-center justify-between mb-5 flex-wrap gap-3">
      <h2 class="text-lg font-black">Analytics</h2>
      <div class="flex items-center gap-2 flex-wrap">
        ${preset('Hoy', todayStart, todayEnd)}
        ${preset('7 días', daysAgo(6), todayEnd)}
        ${preset('30 días', daysAgo(29), todayEnd)}
        ${preset('Este mes', monthStart(), todayEnd)}
        ${preset('Este año', yearStart(), todayEnd)}
        <div class="relative">
          <button id="analytics-cal-btn" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 hover:border-slate-300">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Personalizado
          </button>
          <div id="analytics-cal-dropdown" class="hidden absolute right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-4 z-20 flex gap-3 items-end" style="min-width:280px">
            <div class="flex flex-col gap-2 flex-1">
              <label class="text-xs font-bold text-slate-500">Desde</label>
              <input id="analytics-from-input" type="date" value="${fmtDate(from)}"
                class="px-2 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#E92129]">
              <label class="text-xs font-bold text-slate-500">Hasta</label>
              <input id="analytics-to-input" type="date" value="${fmtDate(to)}"
                class="px-2 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#E92129]">
            </div>
            <button id="analytics-apply-btn" class="px-3 py-1.5 bg-[#E92129] text-white text-xs font-bold rounded-lg">Aplicar</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Summary cards -->
    <div class="grid grid-cols-4 gap-4 mb-5">
      <div class="bg-white rounded-2xl border border-slate-100 p-4">
        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Visitas</p>
        <p class="text-2xl font-black text-slate-900">${visits}</p>
        <p class="text-xs mt-1">${delta(visits, prevVisits)}</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-100 p-4">
        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Nuevos estudiantes</p>
        <p class="text-2xl font-black text-slate-900">${newStudents}</p>
        <p class="text-xs mt-1">${delta(newStudents, prevStudents)}</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-100 p-4">
        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Puntaje promedio</p>
        <p class="text-2xl font-black text-slate-900">${passes.length ? avgScore + '%' : '—'}</p>
        <p class="text-xs text-slate-400 mt-1">En exámenes</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-100 p-4">
        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Certificados</p>
        <p class="text-2xl font-black text-slate-900">${certViews}</p>
        <p class="text-xs text-slate-400 mt-1">${certPrints} impresos</p>
      </div>
    </div>

    <div id="analytics-body"></div>
  `

  // Wire preset buttons
  el.querySelectorAll('.analytics-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      renderAnalyticsPanel(new Date(btn.dataset.from), new Date(btn.dataset.to))
    })
  })

  // Wire calendar dropdown
  const calBtn = el.querySelector('#analytics-cal-btn')
  const calDrop = el.querySelector('#analytics-cal-dropdown')
  calBtn.addEventListener('click', e => {
    e.stopPropagation()
    calDrop.classList.toggle('hidden')
  })
  document.addEventListener('click', () => calDrop.classList.add('hidden'), { once: false })
  el.querySelector('#analytics-apply-btn').addEventListener('click', () => {
    const f = new Date(el.querySelector('#analytics-from-input').value)
    const t = new Date(el.querySelector('#analytics-to-input').value)
    t.setHours(23, 59, 59, 999)
    if (isNaN(f) || isNaN(t) || f > t) return
    renderAnalyticsPanel(f, t)
  })

  // Render body sections (added in next tasks)
  renderAnalyticsBody(el.querySelector('#analytics-body'), ev, from, to)
}

function renderAnalyticsBody(container, ev, from, to) {
  container.innerHTML = '<p class="text-slate-400 text-sm">Secciones próximamente...</p>'
}
```

- [ ] **Step 2: Verificar en navegador**

1. Abrir `admin.html` → clic en "Analytics".
2. Verificar que aparecen las 4 tarjetas de resumen.
3. Hacer clic en preset "7 días" → el panel recarga.
4. Hacer clic en el ícono de calendario → aparece dropdown con dos inputs de fecha. Elegir rango y clic "Aplicar" → panel recarga.

- [ ] **Step 3: Commit**

```bash
git add js/admin.js
git commit -m "feat: analytics panel — date filter and summary cards"
```

---

## Task 7: Analytics panel — gráfica de visitas, modo split, lecciones más vistas

**Files:**
- Modify: `js/admin.js` — reemplazar `renderAnalyticsBody`

- [ ] **Step 1: Reemplazar renderAnalyticsBody con las tres secciones**

En `js/admin.js`, reemplazar la función `renderAnalyticsBody` completa:

```javascript
function renderAnalyticsBody(container, ev, from, to) {
  // ── Visit chart ────────────────────────────────────────────────────────────
  // Build day buckets between from and to
  const days = []
  const cursor = new Date(from); cursor.setHours(0, 0, 0, 0)
  const end = new Date(to); end.setHours(23, 59, 59, 999)
  while (cursor <= end) {
    days.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  const pageViews = ev.filter(e => e.event_type === 'page_view')
  const dayCounts = days.map(d => {
    const next = new Date(d); next.setDate(next.getDate() + 1)
    return pageViews.filter(e => {
      const t = new Date(e.created_at)
      return t >= d && t < next
    }).length
  })
  const maxCount = Math.max(...dayCounts, 1)

  const barWidth = Math.max(8, Math.min(32, Math.floor(480 / days.length) - 4))
  const dayLabels = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
  const fmtDay = d => days.length <= 14
    ? dayLabels[d.getDay()]
    : d.getDate() === 1 || d.getDate() % 5 === 0 ? d.getDate() : ''

  const barsHtml = dayCounts.map((c, i) => {
    const h = Math.round((c / maxCount) * 64)
    return `<div class="flex flex-col items-center gap-1" title="${days[i].toLocaleDateString('es-HN')}: ${c} visitas">
      <div style="height:${h}px;width:${barWidth}px;background:${c === maxCount ? '#E92129' : '#fca5a5'};border-radius:3px 3px 0 0;min-height:2px"></div>
      <span class="text-[9px] text-slate-400">${fmtDay(days[i])}</span>
    </div>`
  }).join('')

  // ── Mode split ─────────────────────────────────────────────────────────────
  const modeEvents = ev.filter(e => e.event_type === 'mode_selected')
  const courseCount = modeEvents.filter(e => e.payload?.mode === 'course').length
  const exploreCount = modeEvents.filter(e => e.payload?.mode === 'explore').length
  const modeTotal = courseCount + exploreCount || 1
  const coursePct = Math.round(courseCount / modeTotal * 100)
  const explorePct = 100 - coursePct

  // ── Top lessons ────────────────────────────────────────────────────────────
  const lessonOpens = ev.filter(e => e.event_type === 'lesson_open')
  const lessonCounts = {}
  lessonOpens.forEach(e => {
    const key = e.payload?.lesson_title || e.payload?.lesson_id || 'Sin título'
    lessonCounts[key] = (lessonCounts[key] || 0) + 1
  })
  const topLessons = Object.entries(lessonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  container.innerHTML = `
    <!-- Visit chart + mode split -->
    <div class="grid gap-4 mb-5" style="grid-template-columns:2fr 1fr">
      <div class="bg-white rounded-2xl border border-slate-100 p-4">
        <p class="text-xs font-bold text-slate-800 mb-3">Visitas por día</p>
        ${days.length === 0 ? '<p class="text-slate-400 text-xs">Sin datos en el período</p>' : `
        <div class="flex items-flex-end gap-1 overflow-x-auto" style="height:80px;align-items:flex-end">
          ${barsHtml}
        </div>`}
      </div>
      <div class="bg-white rounded-2xl border border-slate-100 p-4">
        <p class="text-xs font-bold text-slate-800 mb-3">Modo de entrada</p>
        <div class="space-y-2.5">
          <div>
            <div class="flex justify-between mb-1">
              <span class="text-xs font-bold text-slate-700">Curso</span>
              <span class="text-xs font-bold text-[#E92129]">${coursePct}%</span>
            </div>
            <div class="h-1.5 bg-slate-100 rounded-full">
              <div class="h-1.5 bg-[#E92129] rounded-full" style="width:${coursePct}%"></div>
            </div>
          </div>
          <div>
            <div class="flex justify-between mb-1">
              <span class="text-xs font-bold text-slate-700">Solo explorar</span>
              <span class="text-xs font-bold text-slate-400">${explorePct}%</span>
            </div>
            <div class="h-1.5 bg-slate-100 rounded-full">
              <div class="h-1.5 bg-slate-300 rounded-full" style="width:${explorePct}%"></div>
            </div>
          </div>
        </div>
        ${modeTotal === 1 ? '<p class="text-[10px] text-slate-400 mt-3">Sin datos en el período</p>' : ''}
      </div>
    </div>

    <!-- Top lessons -->
    <div class="bg-white rounded-2xl border border-slate-100 overflow-hidden mb-5">
      <div class="px-4 py-3 border-b border-slate-100">
        <p class="text-xs font-bold text-slate-800">Lecciones más vistas</p>
      </div>
      ${topLessons.length === 0
        ? '<p class="text-slate-400 text-xs p-4">Sin datos en el período</p>'
        : topLessons.map(([title, cnt]) => `
          <div class="flex items-center justify-between px-4 py-2.5 border-b border-slate-50 last:border-0">
            <span class="text-xs text-slate-700">${escapeHtml(title)}</span>
            <span class="text-xs font-bold text-[#E92129]">${cnt}</span>
          </div>`).join('')}
    </div>

    <div id="analytics-searches"></div>
    <div id="analytics-exams" class="mt-5"></div>
  `

  renderSearchesSection(container.querySelector('#analytics-searches'), ev)
  renderExamsSection(container.querySelector('#analytics-exams'), ev)
}

function renderSearchesSection(container, ev) {
  container.innerHTML = '<p class="text-slate-400 text-xs">Cargando búsquedas...</p>'
}

function renderExamsSection(container, ev) {
  container.innerHTML = '<p class="text-slate-400 text-xs">Cargando exámenes...</p>'
}
```

- [ ] **Step 2: Verificar en navegador**

1. Abrir Analytics en admin. Verificar que aparece la gráfica de barras de visitas por día.
2. Verificar la sección de modo de entrada con las dos barras de porcentaje.
3. Verificar la tabla de lecciones más vistas (si hay datos; si no, muestra "Sin datos en el período").

- [ ] **Step 3: Commit**

```bash
git add js/admin.js
git commit -m "feat: analytics panel — visit chart, mode split, top lessons"
```

---

## Task 8: Analytics panel — tabla de búsquedas

**Files:**
- Modify: `js/admin.js` — reemplazar `renderSearchesSection`

- [ ] **Step 1: Reemplazar renderSearchesSection**

En `js/admin.js`, reemplazar la función `renderSearchesSection` completa:

```javascript
function renderSearchesSection(container, ev) {
  // Aggregate searches: group by term, track total searches and whether any had 0 results
  const searches = ev.filter(e => e.event_type === 'lesson_search')
  const byTerm = {}
  searches.forEach(e => {
    const term = (e.payload?.term || '').toLowerCase().trim()
    if (!term) return
    if (!byTerm[term]) byTerm[term] = { count: 0, zeroCount: 0, lastAt: e.created_at, avgResults: 0, totalResults: 0 }
    byTerm[term].count++
    byTerm[term].totalResults += (e.payload?.results_count || 0)
    if ((e.payload?.results_count || 0) === 0) byTerm[term].zeroCount++
    if (e.created_at > byTerm[term].lastAt) byTerm[term].lastAt = e.created_at
  })

  let allTerms = Object.entries(byTerm)
    .map(([term, d]) => ({ term, ...d, avgResults: Math.round(d.totalResults / d.count), noResults: d.zeroCount === d.count }))
    .sort((a, b) => b.count - a.count)

  const PAGE = 20
  let page = 0
  let filterText = ''
  let filterNoResults = false

  function fmtRelTime(iso) {
    if (!iso) return '—'
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'ahora'
    if (m < 60) return `hace ${m}m`
    const h = Math.floor(m / 60)
    if (h < 24) return `hace ${h}h`
    return `hace ${Math.floor(h / 24)}d`
  }

  function renderTable() {
    let filtered = allTerms
    if (filterNoResults) filtered = filtered.filter(t => t.noResults)
    if (filterText) filtered = filtered.filter(t => t.term.includes(filterText.toLowerCase()))

    const total = filtered.length
    const noResultsCount = allTerms.filter(t => t.noResults).length
    const paged = filtered.slice(page * PAGE, (page + 1) * PAGE)

    container.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b border-slate-100 flex-wrap gap-2">
          <p class="text-xs font-bold text-slate-800">Todas las búsquedas</p>
          <div class="flex items-center gap-2">
            <label class="flex items-center gap-1.5 text-[10px] font-bold text-[#E92129] bg-red-50 px-2.5 py-1 rounded-lg cursor-pointer">
              <input id="srch-no-results" type="checkbox" class="accent-[#E92129]" ${filterNoResults ? 'checked' : ''}> Solo sin resultados
            </label>
            <input id="srch-filter" type="text" placeholder="🔍 Filtrar término..."
              value="${escapeHtml(filterText)}"
              class="px-2.5 py-1 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#E92129] w-40">
          </div>
        </div>
        ${paged.length === 0 ? `<p class="text-slate-400 text-xs p-4">Sin búsquedas en este período</p>` : `
        <table class="w-full border-collapse text-xs">
          <thead>
            <tr class="bg-slate-50">
              <th class="text-left px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Término</th>
              <th class="text-center px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Búsquedas</th>
              <th class="text-center px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Resultados prom.</th>
              <th class="text-center px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Última vez</th>
              <th class="text-center px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${paged.map(t => `
              <tr class="border-t border-slate-50 ${t.noResults ? 'bg-red-50/40' : ''}">
                <td class="px-4 py-2.5 font-semibold ${t.noResults ? 'text-[#E92129]' : 'text-slate-700'}">${escapeHtml(t.term)}</td>
                <td class="px-4 py-2.5 text-center text-slate-600">${t.count}</td>
                <td class="px-4 py-2.5 text-center font-bold ${t.noResults ? 'text-[#E92129]' : 'text-slate-700'}">${t.avgResults}</td>
                <td class="px-4 py-2.5 text-center text-slate-400">${fmtRelTime(t.lastAt)}</td>
                <td class="px-4 py-2.5 text-center">
                  ${t.noResults
                    ? '<span class="bg-red-100 text-[#E92129] text-[10px] font-bold px-2 py-0.5 rounded-full">⚠ Sin resultados</span>'
                    : '<span class="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">Con resultados</span>'}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
        <div class="flex items-center justify-between px-4 py-2.5 border-t border-slate-100">
          <span class="text-[10px] text-slate-400">${total} términos · <span class="text-[#E92129] font-bold">${noResultsCount} sin resultados</span></span>
          <div class="flex gap-1">
            <button class="srch-prev px-2.5 py-1 border border-slate-200 rounded-lg text-[10px] text-slate-500 ${page === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-50'}">‹ Anterior</button>
            <button class="srch-next px-2.5 py-1 border border-slate-200 rounded-lg text-[10px] text-slate-500 ${(page + 1) * PAGE >= total ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-50'}">Siguiente ›</button>
          </div>
        </div>`}
      </div>
    `

    container.querySelector('#srch-no-results')?.addEventListener('change', e => {
      filterNoResults = e.target.checked; page = 0; renderTable()
    })
    container.querySelector('#srch-filter')?.addEventListener('input', e => {
      filterText = e.target.value; page = 0; renderTable()
    })
    container.querySelector('.srch-prev')?.addEventListener('click', () => {
      if (page > 0) { page--; renderTable() }
    })
    container.querySelector('.srch-next')?.addEventListener('click', () => {
      if ((page + 1) * PAGE < total) { page++; renderTable() }
    })
  }

  renderTable()
}
```

- [ ] **Step 2: Verificar en navegador**

1. Abrir Analytics → verificar tabla de búsquedas.
2. Escribir algo en la búsqueda de lecciones → esperar 600ms → verificar que aparece en la tabla.
3. Activar checkbox "Solo sin resultados" → tabla filtra correctamente.
4. Escribir en el input de filtro → tabla filtra por término.
5. Si hay más de 20 términos, los botones de paginación funcionan.

- [ ] **Step 3: Commit**

```bash
git add js/admin.js
git commit -m "feat: analytics panel — searches table with filter, no-results badge, pagination"
```

---

## Task 9: Analytics panel — tabla de exámenes por lección

**Files:**
- Modify: `js/admin.js` — reemplazar `renderExamsSection`

- [ ] **Step 1: Reemplazar renderExamsSection**

En `js/admin.js`, reemplazar la función `renderExamsSection` completa:

```javascript
function renderExamsSection(container, ev) {
  const examEvents = ev.filter(e => e.event_type === 'exam_pass' || e.event_type === 'exam_fail')
  if (examEvents.length === 0) {
    container.innerHTML = ''
    return
  }

  const byLesson = {}
  examEvents.forEach(e => {
    const key = e.payload?.lesson_title || e.payload?.lesson_id || 'Sin título'
    if (!byLesson[key]) byLesson[key] = { passes: 0, fails: 0, totalScore: 0, scoreCount: 0 }
    if (e.event_type === 'exam_pass') {
      byLesson[key].passes++
      byLesson[key].totalScore += (e.payload?.score || 0)
      byLesson[key].scoreCount++
    } else {
      byLesson[key].fails++
    }
  })

  const rows = Object.entries(byLesson)
    .map(([title, d]) => {
      const total = d.passes + d.fails
      const passPct = Math.round(d.passes / total * 100)
      const avgScore = d.scoreCount ? Math.round(d.totalScore / d.scoreCount) : 0
      const pctColor = passPct >= 80 ? 'text-green-600' : passPct >= 60 ? 'text-amber-500' : 'text-[#E92129]'
      return { title, total, passPct, avgScore, pctColor }
    })
    .sort((a, b) => b.total - a.total)

  container.innerHTML = `
    <div class="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-100">
        <p class="text-xs font-bold text-slate-800">Resultados de exámenes por lección</p>
      </div>
      <table class="w-full border-collapse text-xs">
        <thead>
          <tr class="bg-slate-50">
            <th class="text-left px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Lección</th>
            <th class="text-center px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Intentos</th>
            <th class="text-center px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Aprobaron</th>
            <th class="text-center px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wide">Puntaje prom.</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr class="border-t border-slate-50">
              <td class="px-4 py-2.5 text-slate-700">${escapeHtml(r.title)}</td>
              <td class="px-4 py-2.5 text-center text-slate-600">${r.total}</td>
              <td class="px-4 py-2.5 text-center font-bold ${r.pctColor}">${r.passPct}%</td>
              <td class="px-4 py-2.5 text-center font-bold text-slate-800">${r.avgScore}%</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `
}
```

- [ ] **Step 2: Verificar en navegador**

1. Completar un examen (aprobar y reprobar al menos uno de cada uno).
2. Abrir Analytics → verificar que la tabla de exámenes aparece con la lección, intentos, % aprobaron (en verde/amarillo/rojo según el valor) y puntaje promedio.
3. Si no hay exámenes en el período, la sección no aparece (container queda vacío).

- [ ] **Step 3: Commit final**

```bash
git add js/admin.js
git commit -m "feat: analytics panel — exams table by lesson with pass rate coloring"
```

---

## Verificación end-to-end

Después de completar todos los tasks, verificar el flujo completo:

1. Abrir `index.html` → ir a Lecciones → registrarse → evento `page_view` y `mode_selected` en Supabase.
2. Abrir 3 lecciones distintas → 3 eventos `lesson_open`.
3. Buscar "factura" → evento `lesson_search` con `results_count`.
4. Completar una lección sin examen → evento `lesson_complete`.
5. Completar un examen → eventos `exam_pass` o `exam_fail`.
6. Ver certificado → evento `certificate_view`. Imprimir → `certificate_print`.
7. Abrir `admin.html` → Analytics → verificar que todos los eventos aparecen en el dashboard.
8. Cambiar período a "7 días" y "Este mes" → datos se actualizan.
9. Usar el selector personalizado de fechas → dropdown aparece, rango se aplica.
10. En tabla de búsquedas → filtrar por término y checkbox "sin resultados" funcionan.
