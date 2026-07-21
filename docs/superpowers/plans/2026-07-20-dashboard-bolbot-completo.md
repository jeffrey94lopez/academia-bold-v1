# Dashboard BolBot completo (③) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el sub-proyecto ③ completo: dashboard operativo del BolBot rediseñado, Resumen ejecutivo (pestaña nueva) y el puente bot→lección, consumiendo las RPCs de ①a con fallback a los datos actuales.

**Architecture:** Se introduce un **shell de 3 pestañas** (`js/analytics-shell.js`) que renderiza la barra `Resumen | Lecciones | BolBot` sobre `#panel-analytics` y monta cada vista en un sub-contenedor `#analytics-content`. Cada vista es un módulo propio (`admin-exec-analytics.js`, `admin-bot-analytics.js`; la de lecciones se adapta mínimamente). Esto rompe el patrón actual donde `renderAnalyticsPanel`/`renderBodiAnalytics` se llaman mutuamente. Dos RPCs nuevas alimentan el explorador filtrado y el puente. Todo dato de resolución/categoría usa el fallback legacy (botón `resolved`, `topic`) con una nota "se afina con LLM".

**Tech Stack:** JS vanilla ESM (sin bundler), Supabase (`supabase.rpc`), Tailwind (utilidades arbitrarias) + tokens Merlin de `css/style.css`, runner de tests `node:test` (`.mjs`). Sin librerías de gráficos (HTML/CSS a mano).

## Global Constraints

- **JS vanilla, sin bundler.** Importa por ESM. Reutiliza `js/analytics-api.js` (de ①a) para todo acceso a datos; ninguna vista consulta `bodi_conversations`/`analytics_events` crudo ni usa `.limit(N)` de miles de filas.
- **Tema Merlin.** No inventar colores. Usar tokens de `css/style.css` vía Tailwind arbitrario: azul `[var(--blue-100)]` (#121e6c), `[var(--blue-10)]`, coral/CTA `[var(--coral-100)]` cuando sea acción destacada, neutrales `[var(--black-100)]/[var(--black-60)]/[var(--black-40)]/[var(--black-10)]`, fondo `[var(--background-page)]`, feedback `--error-*`/`--warning-*`/`--success-*`. Fuente Montserrat (ya cargada en `admin.html`). Copiar los patrones existentes: tarjeta KPI `bg-white rounded-2xl border border-[var(--blue-10)] p-4`; tabla en contenedor `bg-white rounded-2xl border border-[var(--blue-10)] overflow-hidden`; barra track `h-1.5 bg-[var(--black-10)] rounded-full` + fill `bg-[var(--blue-100)]`.
- **Picker de calendario en las 3 pestañas.** Reutilizar el control de rango con presets + `<input type=date>` (hoy solo lo tiene la vista Lecciones), extraído a un helper compartido.
- **Resolución de 3 estados con fallback.** `resuelta`/`no_resuelta`/`ambigua`; "resolución real" = resuelta ÷ (resuelta+no_resuelta). Hoy viene del fallback legacy (`resolved`); las tarjetas dependientes del LLM llevan una nota discreta "se afina con LLM".
- **Escapar SIEMPRE contenido dinámico** con `escapeHtml` de `js/utils.js` antes de meterlo por `innerHTML` (mensajes del chat, topic, términos). No usar `onclick` inline (la CSP lo bloquea) — enganchar listeners por id/clase tras render.
- **Tests:** `node:test` + `node:assert/strict`, `.mjs`, correr por archivo (`node --test tests/x.test.mjs`). Las vistas con DOM no llevan test unitario (el proyecto no tiene arnés DOM); su verificación es manual en navegador. Sí llevan test las funciones puras (rango de fechas, neutralización CSV, helpers de la api).

**Migraciones SQL:** se ejecutan a mano en el SQL Editor de Supabase (idempotentes, `drop function if exists` antes de `create or replace`, cabecera en español con `-- Ejecutar UNA sola vez…`). El controller escribe el archivo y el usuario lo aplica + corre la query de verificación.

---

## FASE 1 — Datos (RPCs nuevas + api)

### Task 1: RPC `analytics_bot_conversations` (explorador filtrado)

Alimenta el explorador de conversaciones con filtros server-side, devolviendo solo una página acotada (reemplaza el `.limit(2000)` crudo).

**Files:**
- Create: `supabase/migrations/create_analytics_bot_conversations.sql`

**Interfaces:**
- Consumes: `public.bodi_conversations`.
- Produces: `public.analytics_bot_conversations(p_from timestamptz, p_to timestamptz, p_status text default null, p_sentiment text default null, p_support boolean default null, p_category text default null, p_search text default null, p_limit int default 100) returns jsonb` = array de objetos `{ id, started_at, ended_at, status, sentiment, support_redirected, messages, lessons_used, summary, cat, eff_status, first_user_msg }`, orden `started_at desc`, cap `p_limit`.

- [ ] **Step 1: Escribir la migración**

```sql
-- analytics_bot_conversations: filas del explorador de conversaciones, filtradas
-- en el servidor (estado/sentimiento/soporte/categoría/búsqueda de texto) y
-- acotadas por p_limit. Reemplaza el pull crudo .limit(2000) del cliente.
-- eff_status y cat usan el fallback legacy (resolved/topic) hasta que entre ①c.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
drop function if exists public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int);
create or replace function public.analytics_bot_conversations(
  p_from      timestamptz,
  p_to        timestamptz,
  p_status    text default null,
  p_sentiment text default null,
  p_support   boolean default null,
  p_category  text default null,
  p_search    text default null,
  p_limit     int default 100
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with res as (
    select
      id, started_at, ended_at, status, sentiment, support_redirected,
      messages, lessons_used, summary,
      coalesce(category, topic, 'Sin categoría') as cat,
      coalesce(resolution_status,
        case when resolved is true then 'resuelta'
             when resolved is false then 'no_resuelta' end) as eff_status,
      (select m->>'content'
         from jsonb_array_elements(messages) m
        where m->>'role' = 'user'
        limit 1) as first_user_msg
    from bodi_conversations
    where started_at >= p_from and started_at <= p_to
      and (p_sentiment is null or sentiment = p_sentiment)
      and (p_support  is null or coalesce(support_redirected, false) = p_support)
      and (p_category is null or coalesce(category, topic, 'Sin categoría') = p_category)
      and (p_search   is null or messages::text ilike '%' || p_search || '%')
      and (p_status   is null or coalesce(resolution_status,
             case when resolved is true then 'resuelta'
                  when resolved is false then 'no_resuelta' end) = p_status)
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at desc), '[]'::jsonb)
  from (select * from res order by started_at desc limit p_limit) r;
$$;
revoke execute on function public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int) from public, anon;
grant  execute on function public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int) to authenticated;
```

- [ ] **Step 2: Aplicar en el SQL Editor.** Esperado: `Success. No rows returned`.

- [ ] **Step 3: Verificar (query de control)**

```sql
select jsonb_array_length(public.analytics_bot_conversations(now() - interval '90 days', now())) as n,
       public.analytics_bot_conversations(now() - interval '90 days', now(), 'no_resuelta') as no_resueltas_sample;
```
Esperado: `n` entero ≥ 0; el segundo devuelve solo conversaciones con `eff_status='no_resuelta'` (o `[]`). Sin errores.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/create_analytics_bot_conversations.sql
git commit -m "feat(db): RPC analytics_bot_conversations (explorador filtrado)"
```

---

### Task 2: RPC `analytics_content_gaps` (puente bot→lección)

Detecta temas del bot con volumen que no tienen lección, resuelven mal, o el LLM marcó como gap.

**Files:**
- Create: `supabase/migrations/create_analytics_content_gaps.sql`

**Interfaces:**
- Consumes: `public.bodi_conversations`, `public.lecciones`.
- Produces: `public.analytics_content_gaps(p_from timestamptz, p_to timestamptz) returns jsonb` = array `{ category, total, resolved_pct, support_pct, has_lesson (bool), llm_gap (bool) }`, orden `total desc`, solo categorías con `total>=3` que además: no tienen lección, o `resolved_pct<50`/null, o `llm_gap`.

- [ ] **Step 1: Escribir la migración**

```sql
-- analytics_content_gaps: temas del bot candidatos a "contenido faltante".
-- Agrupa por categoría (category con fallback a topic), y marca los de volumen
-- que (a) no tienen lección en 'lecciones.categoria', (b) resuelven mal, o
-- (c) el LLM marcó knowledge_gap. Base del puente bot→lección.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
drop function if exists public.analytics_content_gaps(timestamptz, timestamptz);
create or replace function public.analytics_content_gaps(
  p_from timestamptz,
  p_to   timestamptz
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with res as (
    select
      coalesce(category, topic, 'Sin categoría') as cat,
      coalesce(resolution_status,
        case when resolved is true then 'resuelta'
             when resolved is false then 'no_resuelta' end) as eff_status,
      knowledge_gap, support_redirected
    from bodi_conversations
    where started_at >= p_from and started_at <= p_to
      and coalesce(category, topic) is not null
  ),
  agg as (
    select cat,
           count(*) as total,
           round(100.0 * count(*) filter (where eff_status = 'resuelta')
                 / nullif(count(*) filter (where eff_status in ('resuelta','no_resuelta')), 0)) as resolved_pct,
           round(100.0 * count(*) filter (where support_redirected) / nullif(count(*), 0)) as support_pct,
           bool_or(coalesce(knowledge_gap, false)) as llm_gap
    from res group by cat
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'category', cat, 'total', total, 'resolved_pct', resolved_pct,
    'support_pct', support_pct,
    'has_lesson', exists (select 1 from lecciones l where l.categoria = agg.cat),
    'llm_gap', llm_gap) order by total desc), '[]'::jsonb)
  from agg
  where total >= 3
    and (not exists (select 1 from lecciones l where l.categoria = agg.cat)
         or resolved_pct is null or resolved_pct < 50
         or llm_gap);
$$;
revoke execute on function public.analytics_content_gaps(timestamptz, timestamptz) from public, anon;
grant  execute on function public.analytics_content_gaps(timestamptz, timestamptz) to authenticated;
```

- [ ] **Step 2: Aplicar en el SQL Editor.** Esperado: `Success. No rows returned`.

- [ ] **Step 3: Verificar (query de control)**

```sql
select jsonb_pretty(public.analytics_content_gaps(now() - interval '90 days', now()));
```
Esperado: array (`[]` si nada) de objetos con `category, total, resolved_pct, support_pct, has_lesson, llm_gap`. `has_lesson` refleja si existe una lección con esa `categoria`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/create_analytics_content_gaps.sql
git commit -m "feat(db): RPC analytics_content_gaps (puente bot->leccion)"
```

---

### Task 3: Extender `js/analytics-api.js` (+ tests)

Agrega los accesos a las dos RPCs nuevas, siguiendo el patrón existente del módulo (async, `client` inyectable, `callRpc`).

**Files:**
- Modify: `js/analytics-api.js`
- Modify: `tests/analytics-api.test.mjs`

**Interfaces:**
- Consumes: `callRpc`, `getSupabaseClient` (ya en el módulo).
- Produces:
  - `fetchBotConversations(from: Date, to: Date, filters = {}, client?) → Promise<Array>` — `filters` = `{ status, sentiment, support, category, search, limit }`, mapea a `p_status/p_sentiment/p_support/p_category/p_search/p_limit` (undefined → null).
  - `fetchContentGaps(from: Date, to: Date, client?) → Promise<Array>`.

- [ ] **Step 1: Escribir los tests que fallan** (añadir al final de `tests/analytics-api.test.mjs`; e importar los dos nombres nuevos en el bloque `import`)

```javascript
import {
  fetchLessonsSummary, fetchBotSummary, fetchCourseFunnel, fetchBotTrend,
  getSupabaseClient, _resetAnalyticsClientCache,
  fetchBotConversations, fetchContentGaps,
} from '../js/analytics-api.js'
```

```javascript
test('fetchBotConversations mapea filtros a params (undefined -> null)', async () => {
  const cap = {}
  const from = new Date('2026-06-01T00:00:00Z')
  const to = new Date('2026-06-30T00:00:00Z')
  await fetchBotConversations(from, to, { status: 'no_resuelta', support: true }, fakeClient(cap))
  assert.equal(cap.name, 'analytics_bot_conversations')
  assert.equal(cap.params.p_from, from.toISOString())
  assert.equal(cap.params.p_status, 'no_resuelta')
  assert.equal(cap.params.p_support, true)
  assert.equal(cap.params.p_sentiment, null)
  assert.equal(cap.params.p_category, null)
  assert.equal(cap.params.p_search, null)
})

test('fetchBotConversations sin filtros manda todos null y limit por defecto', async () => {
  const cap = {}
  await fetchBotConversations(new Date('2026-06-01T00:00:00Z'), new Date('2026-06-30T00:00:00Z'), {}, fakeClient(cap))
  assert.equal(cap.params.p_status, null)
  assert.equal(cap.params.p_limit, null)
})

test('fetchContentGaps usa analytics_content_gaps', async () => {
  const cap = {}
  await fetchContentGaps(new Date('2026-06-01T00:00:00Z'), new Date('2026-06-30T00:00:00Z'), fakeClient(cap))
  assert.equal(cap.name, 'analytics_content_gaps')
  assert.equal(cap.params.p_from, new Date('2026-06-01T00:00:00Z').toISOString())
})
```

- [ ] **Step 2: Correr y ver fallar.** `node --test tests/analytics-api.test.mjs` → FAIL (`fetchBotConversations is not a function` / import error).

- [ ] **Step 3: Implementar** (añadir al final de `js/analytics-api.js`)

```javascript
export async function fetchBotConversations(from, to, filters = {}, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'analytics_bot_conversations', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_status: filters.status ?? null,
    p_sentiment: filters.sentiment ?? null,
    p_support: filters.support ?? null,
    p_category: filters.category ?? null,
    p_search: filters.search ?? null,
    p_limit: filters.limit ?? null,
  })
}

export async function fetchContentGaps(from, to, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'analytics_content_gaps', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  })
}
```

- [ ] **Step 4: Correr y ver pasar.** `node --test tests/analytics-api.test.mjs` → PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add js/analytics-api.js tests/analytics-api.test.mjs
git commit -m "feat: analytics-api fetchBotConversations + fetchContentGaps (+ tests)"
```

---

## FASE 2 — Utilidades compartidas

### Task 4: Centralizar `exportCSV` en `utils.js` + fix CSV injection (+ tests)

Mueve `exportCSV` (hoy local a `admin-analytics.js`) a `js/utils.js`, exportado, y neutraliza fórmulas (audit #9). Las vistas nuevas lo importan.

**Files:**
- Modify: `js/utils.js`
- Modify: `js/admin-analytics.js` (importar `exportCSV` de utils; borrar la copia local `:823-839`)
- Create: `tests/csv.test.mjs`

**Interfaces:**
- Produces: `export function exportCSV(rows, filename, columns)` en `js/utils.js`. `columns` = `[{label, getValue(row)}]`. Escapa comas/comillas/saltos **y** antepone `'` a celdas que empiecen con `= + - @` (o tab/CR) para evitar ejecución de fórmulas en Excel/Sheets. Descarga con BOM UTF-8.
- Produces (helper interno testeable): `export function csvCell(value)` → string ya escapado y neutralizado (para poder testear la lógica sin DOM/Blob).

- [ ] **Step 1: Escribir el test que falla** (`tests/csv.test.mjs`)

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import { csvCell } from '../js/utils.js'

test('csvCell deja valores simples intactos', () => {
  assert.equal(csvCell('hola'), 'hola')
  assert.equal(csvCell(42), '42')
  assert.equal(csvCell(null), '')
})

test('csvCell entrecomilla comas, comillas y saltos', () => {
  assert.equal(csvCell('a,b'), '"a,b"')
  assert.equal(csvCell('di "hola"'), '"di ""hola"""')
  assert.equal(csvCell('línea1\nlínea2'), '"línea1\nlínea2"')
})

test('csvCell neutraliza fórmulas anteponiendo apóstrofo', () => {
  assert.equal(csvCell('=1+1'), "'=1+1")
  assert.equal(csvCell('+49'), "'+49")
  assert.equal(csvCell('-2'), "'-2")
  assert.equal(csvCell('@cmd'), "'@cmd")
})

test('csvCell neutraliza Y entrecomilla si además hay coma', () => {
  assert.equal(csvCell('=a,b'), '"\'=a,b"')
})
```

- [ ] **Step 2: Correr y ver fallar.** `node --test tests/csv.test.mjs` → FAIL (`csvCell is not a function`).

- [ ] **Step 3: Implementar en `js/utils.js`** (añadir; no tocar `escapeHtml`/`getYouTubeId` existentes)

```javascript
// Escapa y neutraliza una celda para CSV. Antepone ' a fórmulas (= + - @)
// para que Excel/Sheets no las ejecute (CSV injection), y entrecomilla si hay
// comas, comillas o saltos de línea (RFC 4180).
export function csvCell(value) {
  let s = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function exportCSV(rows, filename, columns) {
  const header = columns.map(c => csvCell(c.label)).join(',')
  const body = rows
    .map(row => columns.map(c => csvCell(c.getValue(row))).join(','))
    .join('\n')
  const blob = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
```

- [ ] **Step 4: Correr y ver pasar.** `node --test tests/csv.test.mjs` → PASS (4 tests).

- [ ] **Step 5: Migrar `admin-analytics.js` a la versión compartida.** En `js/admin-analytics.js`: (a) añadir `exportCSV` al import de utils (línea 2 aprox: `import { escapeHtml, exportCSV } from './utils.js'`); (b) borrar la función local `exportCSV` (`:823-839`). Verifica que la vista Lecciones siga usando `exportCSV(...)` sin cambios de firma.

- [ ] **Step 6: Correr toda la suite y commitear.** `node --test tests/*.test.mjs` → todos PASS.

```bash
git add js/utils.js js/admin-analytics.js tests/csv.test.mjs
git commit -m "feat: exportCSV compartido en utils + fix CSV injection (audit #9)"
```

---

### Task 5: Helper de UI compartido `js/analytics-ui.js` (+ tests de rango)

Control de rango de fechas reutilizable (presets + calendario) y átomos de UI comunes. Centraliza el cálculo de rangos (hoy duplicado dos veces).

**Files:**
- Create: `js/analytics-ui.js`
- Create: `tests/analytics-ui.test.mjs`

**Interfaces:**
- Produces:
  - `computeRange(preset: string, now: Date) → { from: Date, to: Date }` — presets: `'today' | '7d' | '30d' | 'month' | 'year'`. (Función pura, testeable.)
  - `rangeControlsHtml(idPrefix: string, from: Date, to: Date) → string` — HTML de los presets + botón calendario + dropdown con dos `<input type=date>` + botón Aplicar, con ids prefijados (`${idPrefix}-preset`, `${idPrefix}-cal-btn`, `${idPrefix}-cal-dropdown`, `${idPrefix}-from-input`, `${idPrefix}-to-input`, `${idPrefix}-apply-btn`).
  - `wireRangeControls(container: Element, idPrefix: string, onRange: (from,to)=>void) → void` — engancha listeners; presets llaman `onRange(new Date(from), new Date(to))`; Aplicar valida `isNaN`/`from>to` y fuerza `to` a fin de día.
  - `kpiCard(label, value, sub = '') → string` — HTML de tarjeta KPI Merlin.
  - `llmNote() → string` — insignia discreta "se afina con LLM" (`text-[10px] text-[var(--blue-40)]` con ícono ✨). Para tarjetas dependientes del LLM.
  - `escapeHtml` NO se redefine — las vistas lo importan de `utils.js`.

- [ ] **Step 1: Escribir el test que falla** (`tests/analytics-ui.test.mjs`)

```javascript
import test from 'node:test'
import assert from 'node:assert/strict'
import { computeRange } from '../js/analytics-ui.js'

const now = new Date('2026-07-20T15:30:00') // hora local

test('computeRange today: medianoche a fin de día de hoy', () => {
  const { from, to } = computeRange('today', now)
  assert.equal(from.getHours(), 0)
  assert.equal(from.getDate(), 20)
  assert.equal(to.getHours(), 23)
  assert.equal(to.getDate(), 20)
})

test('computeRange 7d: desde hace 6 días 00:00 hasta hoy fin de día', () => {
  const { from, to } = computeRange('7d', now)
  assert.equal(from.getDate(), 14)
  assert.equal(from.getHours(), 0)
  assert.equal(to.getDate(), 20)
})

test('computeRange 30d: desde hace 29 días', () => {
  const { from } = computeRange('30d', now)
  assert.equal(from.getMonth(), 5) // junio (0-based)
  assert.equal(from.getDate(), 21)
})

test('computeRange month: primer día del mes actual', () => {
  const { from } = computeRange('month', now)
  assert.equal(from.getDate(), 1)
  assert.equal(from.getMonth(), 6) // julio
})

test('computeRange year: 1 de enero del año actual', () => {
  const { from } = computeRange('year', now)
  assert.equal(from.getMonth(), 0)
  assert.equal(from.getDate(), 1)
})
```

- [ ] **Step 2: Correr y ver fallar.** `node --test tests/analytics-ui.test.mjs` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar `js/analytics-ui.js`**

```javascript
// Helpers de UI compartidos por las vistas de analytics (shell, bot, exec, lecciones).
// Rango de fechas (presets + calendario), tarjeta KPI y nota "se afina con LLM".

export function computeRange(preset, now) {
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999)
  const daysAgo = n => { const d = new Date(todayStart); d.setDate(d.getDate() - n); return d }
  switch (preset) {
    case 'today': return { from: todayStart, to: todayEnd }
    case '7d':    return { from: daysAgo(6), to: todayEnd }
    case '30d':   return { from: daysAgo(29), to: todayEnd }
    case 'month': return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: todayEnd }
    case 'year':  return { from: new Date(now.getFullYear(), 0, 1), to: todayEnd }
    default:      return { from: daysAgo(29), to: todayEnd }
  }
}

const PRESETS = [['today', 'Hoy'], ['7d', '7 días'], ['30d', '30 días'], ['month', 'Este mes'], ['year', 'Este año']]
const fmtDate = d => d.toISOString().split('T')[0]

export function rangeControlsHtml(idPrefix, from, to) {
  const presetBtns = PRESETS.map(([key, label]) => `
    <button class="${idPrefix}-preset px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--black-10)] text-[var(--black-60)] hover:bg-[var(--blue-10)]" data-preset="${key}">${label}</button>`).join('')
  return `
  <div class="flex flex-wrap items-center gap-2">
    ${presetBtns}
    <div class="relative">
      <button id="${idPrefix}-cal-btn" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--black-10)] text-[var(--black-60)] hover:bg-[var(--blue-10)]">📅 Rango</button>
      <div id="${idPrefix}-cal-dropdown" class="hidden absolute z-20 mt-1 p-3 bg-white rounded-xl border border-[var(--blue-10)] shadow-lg flex flex-col gap-2">
        <label class="text-[10px] font-bold text-[var(--black-40)] uppercase">Desde
          <input id="${idPrefix}-from-input" type="date" value="${fmtDate(from)}" class="block mt-1 px-2 py-1 rounded border border-[var(--blue-20)] text-xs"></label>
        <label class="text-[10px] font-bold text-[var(--black-40)] uppercase">Hasta
          <input id="${idPrefix}-to-input" type="date" value="${fmtDate(to)}" class="block mt-1 px-2 py-1 rounded border border-[var(--blue-20)] text-xs"></label>
        <button id="${idPrefix}-apply-btn" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--blue-100)] text-white">Aplicar</button>
      </div>
    </div>
  </div>`
}

export function wireRangeControls(container, idPrefix, onRange) {
  const now = new Date()
  container.querySelectorAll(`.${idPrefix}-preset`).forEach(btn => {
    btn.addEventListener('click', () => {
      const { from, to } = computeRange(btn.dataset.preset, now)
      onRange(from, to)
    })
  })
  const calBtn = container.querySelector(`#${idPrefix}-cal-btn`)
  const calDrop = container.querySelector(`#${idPrefix}-cal-dropdown`)
  if (calBtn && calDrop) {
    calBtn.addEventListener('click', e => { e.stopPropagation(); calDrop.classList.toggle('hidden') })
    document.addEventListener('click', () => calDrop.classList.add('hidden'), { once: true })
  }
  container.querySelector(`#${idPrefix}-apply-btn`)?.addEventListener('click', () => {
    const f = new Date(container.querySelector(`#${idPrefix}-from-input`).value)
    const t = new Date(container.querySelector(`#${idPrefix}-to-input`).value)
    t.setHours(23, 59, 59, 999)
    if (isNaN(f) || isNaN(t) || f > t) return
    onRange(f, t)
  })
}

export function kpiCard(label, value, sub = '') {
  return `
  <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
    <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mb-1">${label}</p>
    <p class="text-2xl font-black text-[var(--black-100)]">${value}</p>
    ${sub ? `<p class="text-[11px] text-[var(--black-60)] mt-1">${sub}</p>` : ''}
  </div>`
}

export function llmNote() {
  return `<span class="text-[10px] text-[var(--blue-40)] font-semibold">✨ se afina con LLM</span>`
}
```

- [ ] **Step 4: Correr y ver pasar.** `node --test tests/analytics-ui.test.mjs` → PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add js/analytics-ui.js tests/analytics-ui.test.mjs
git commit -m "feat: analytics-ui (rango de fechas compartido + átomos + nota LLM)"
```

---

## FASE 3 — Shell de 3 pestañas

### Task 6: Shell `js/analytics-shell.js` + adaptar vista Lecciones + wire admin.js

Introduce las 3 pestañas y el sub-contenedor. Rompe el patrón de llamadas mutuas.

**Files:**
- Create: `js/analytics-shell.js`
- Modify: `js/admin.js` (import + llamada en `switchPanel`)
- Modify: `js/admin-analytics.js` (`renderAnalyticsPanel`: renderizar en `#analytics-content`, quitar su barra de tabs y sus listeners de tabs)

**Interfaces:**
- Consumes: `renderAnalyticsPanel` (lecciones), `renderBotAnalytics` (Task 7), `renderExecAnalytics` (Task 8).
- Produces: `export function renderAnalytics(tab = null)` — pinta la barra de 3 tabs en `#panel-analytics`, crea `#analytics-content`, guarda/lee la tab activa en `localStorage('analytics_tab')` (default `'resumen'`), y delega el render de la tab activa. `export const ANALYTICS_TABS = ['resumen','lecciones','bolbot']`.
- **Contrato de las vistas:** cada `render*Analytics(from?, to?)` inyecta su HTML en `#analytics-content` (NO en `#panel-analytics`) y NO dibuja barra de tabs.

- [ ] **Step 1: Escribir `js/analytics-shell.js`**

```javascript
// Shell de las 3 pestañas de analytics (Resumen | Lecciones | BolBot).
// Pinta la barra de tabs en #panel-analytics + un sub-contenedor #analytics-content
// donde cada vista se monta. Reemplaza el patrón anterior de renders que se
// llamaban mutuamente.
import { renderAnalyticsPanel } from './admin-analytics.js'
import { renderBotAnalytics } from './admin-bot-analytics.js'
import { renderExecAnalytics } from './admin-exec-analytics.js'

export const ANALYTICS_TABS = ['resumen', 'lecciones', 'bolbot']
const LABELS = { resumen: 'Resumen', lecciones: 'Lecciones', bolbot: 'BolBot' }

export function renderAnalytics(tab = null) {
  const active = tab || localStorage.getItem('analytics_tab') || 'resumen'
  localStorage.setItem('analytics_tab', active)
  const panel = document.getElementById('panel-analytics')
  if (!panel) return

  const tabsHtml = ANALYTICS_TABS.map(t => {
    const on = t === active
    return `<button class="analytics-shell-tab px-4 py-2 rounded-lg text-sm font-bold ${on
      ? 'bg-[var(--blue-100)] text-white'
      : 'text-[var(--black-60)] hover:bg-[var(--background-page)]'}" data-tab="${t}">${LABELS[t]}</button>`
  }).join('')

  panel.innerHTML = `
    <div class="flex items-center gap-2 mb-4 border-b border-[var(--blue-10)] pb-3">${tabsHtml}</div>
    <div id="analytics-content"></div>`

  panel.querySelectorAll('.analytics-shell-tab').forEach(btn => {
    btn.addEventListener('click', () => renderAnalytics(btn.dataset.tab))
  })

  if (active === 'resumen') renderExecAnalytics()
  else if (active === 'lecciones') renderAnalyticsPanel()
  else renderBotAnalytics()
}
```

- [ ] **Step 2: Adaptar `renderAnalyticsPanel` (lecciones) al contrato del shell.** En `js/admin-analytics.js`:
  - Cambiar el contenedor destino de `document.getElementById('panel-analytics')` a `document.getElementById('analytics-content')` (línea ~63).
  - Eliminar la barra de tabs interna (`:119-123`) y sus listeners (`:216-222`).
  - Reemplazar el header/date-picker propio por `rangeControlsHtml('analytics', from, to)` + `wireRangeControls(el, 'analytics', (f,t)=>renderAnalyticsPanel(f,t))` importados de `analytics-ui.js` (borra los helpers de fecha duplicados `:104-113` y los listeners de picker `:180-199`). Mantén el botón CSV y el resto de bloques igual.

- [ ] **Step 3: Wire `admin.js`.** Cambiar el import (`admin.js:7`) para traer `renderAnalytics` de `./analytics-shell.js` (mantener `renderResultsPanel` de admin-analytics). En `switchPanel` (`admin.js:221`) cambiar `renderAnalyticsPanel()` por `renderAnalytics()`.

- [ ] **Step 4: Verificar carga sin errores de import.** Como no hay test DOM, corre un chequeo de sintaxis/imports:

Run: `node --check js/analytics-shell.js && node --check js/admin-bot-analytics.js && node --check js/admin-exec-analytics.js && node --check js/admin-analytics.js`
Expected: sin salida (exit 0). *(Nota: `admin-bot-analytics.js` y `admin-exec-analytics.js` deben existir ya — este task depende de Tasks 7 y 8; si se ejecuta antes, crear stubs mínimos que exporten `renderBotAnalytics`/`renderExecAnalytics` vacíos y completarlos en 7/8.)*

- [ ] **Step 5: Commit**

```bash
git add js/analytics-shell.js js/admin.js js/admin-analytics.js
git commit -m "feat: shell de 3 pestañas de analytics (Resumen/Lecciones/BolBot)"
```

> **Dependencia de orden:** Tasks 7 y 8 crean `admin-bot-analytics.js` y `admin-exec-analytics.js`. Ejecuta 7 y 8 antes del Step 4 de este task, o crea stubs. Recomendado: implementar 7 → 8 → luego el wire final del shell (Steps 3-4).

---

## FASE 4 — Vistas

### Task 7: Vista operativa BolBot `js/admin-bot-analytics.js`

Reemplaza `renderBodiAnalytics`. Consume `fetchBotSummary` + `fetchBotConversations` + `fetchContentGaps`. Estructura en 3 capas del diseño.

**Files:**
- Create: `js/admin-bot-analytics.js`
- Modify: `js/admin-analytics.js` (borrar `renderBodiAnalytics` `:488-821` y cualquier referencia interna)

**Interfaces:**
- Consumes: `fetchBotSummary`, `fetchBotConversations`, `fetchContentGaps` (analytics-api); `rangeControlsHtml`, `wireRangeControls`, `computeRange`, `kpiCard`, `llmNote` (analytics-ui); `escapeHtml`, `exportCSV` (utils).
- Produces: `export async function renderBotAnalytics(from = null, to = null)` — monta en `#analytics-content`.

- [ ] **Step 1: Escribir el módulo.** El render sigue el contrato del shell (monta en `#analytics-content`). Estructura:

```javascript
import {
  fetchBotSummary, fetchBotConversations, fetchContentGaps,
} from './analytics-api.js'
import {
  rangeControlsHtml, wireRangeControls, computeRange, kpiCard, llmNote,
} from './analytics-ui.js'
import { escapeHtml, exportCSV } from './utils.js'

const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export async function renderBotAnalytics(from = null, to = null) {
  const el = document.getElementById('analytics-content')
  if (!el) return
  if (!from || !to) { const r = computeRange('30d', new Date()); from = r.from; to = r.to }
  el.innerHTML = `<p class="text-[var(--black-40)] text-sm p-4">Cargando…</p>`

  let summary, convs, gaps
  try {
    [summary, convs, gaps] = await Promise.all([
      fetchBotSummary(from, to),
      fetchBotConversations(from, to, { limit: 100 }),
      fetchContentGaps(from, to),
    ])
  } catch (e) {
    el.innerHTML = `<p class="text-[var(--error-100)] text-sm p-4">Error cargando analytics del bot: ${escapeHtml(e.message)}</p>`
    return
  }

  const k = summary.kpis
  const s = k.sentiment
  const sentTotal = (s.positivo + s.neutro + s.negativo) || 1

  // Capa ① — KPIs
  const kpis = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      ${kpiCard('Conversaciones', k.total)}
      ${kpiCard('Resolución real ' + llmNote(), (k.resolved_pct ?? 0) + '%', 'resueltas de las evaluadas')}
      ${kpiCard('Resuelto sin soporte', (k.resolved_without_support_pct ?? 0) + '%', k.support + ' escalaron')}
      <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
        <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mb-1">Sentimiento neto</p>
        <p class="text-2xl font-black text-[var(--black-100)]">${k.sentiment_net > 0 ? '+' : ''}${k.sentiment_net ?? 0}</p>
        <div class="flex h-3 rounded-full overflow-hidden mt-2">
          <div style="width:${Math.round(100 * s.positivo / sentTotal)}%" class="bg-[var(--success-150)]"></div>
          <div style="width:${Math.round(100 * s.neutro / sentTotal)}%" class="bg-[var(--black-10)]"></div>
          <div style="width:${Math.round(100 * s.negativo / sentTotal)}%" class="bg-[var(--error-100)]"></div>
        </div>
        <p class="text-[10px] text-[var(--black-40)] mt-1">${s.positivo} pos · ${s.neutro} neu · ${s.negativo} neg</p>
      </div>
    </div>`

  // Capa ② — Requiere atención (señales accionables)
  const negCat = summary.by_category.filter(c => c.negative_pct >= 30).sort((a, b) => b.negative_pct - a.negative_pct)[0]
  const supCat = summary.by_category.filter(c => c.support_pct >= 40).sort((a, b) => b.support_pct - a.support_pct)[0]
  const gapNoLesson = gaps.find(g => !g.has_lesson)
  const attention = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
      ${attentionCard('🔗', 'Contenido faltante ' + llmNote(),
        gapNoLesson ? `"${escapeHtml(gapNoLesson.category)}" (${gapNoLesson.total} consultas) no tiene lección.` : 'Sin huecos detectados en el rango.',
        gapNoLesson ? '→ Crear lección' : '', 'warning',
        gapNoLesson ? `data-gap-cat="${escapeHtml(gapNoLesson.category)}"` : '')}
      ${attentionCard('😟', 'Tema con sentimiento negativo',
        negCat ? `"${escapeHtml(negCat.category)}" — ${negCat.negative_pct}% negativo.` : 'Nada crítico.',
        negCat ? '→ Revisar respuesta / lección' : '', 'error', '')}
      ${attentionCard('↗', 'Escala mucho a soporte',
        supCat ? `"${escapeHtml(supCat.category)}" escala en ${supCat.support_pct}%.` : 'Bajo escalamiento.',
        supCat ? '→ Reforzar contenido' : '', 'blue', '')}
      ${attentionCard('🔴', 'Dudas recurrentes no resueltas ' + llmNote(),
        'Se prioriza con clustering del LLM (①c). Hoy: ver explorador filtrado por "No resuelta".',
        '', 'error', '')}
    </div>`

  // Capa ③ — Exploración: categorías + heatmap + explorador
  const maxCat = Math.max(1, ...summary.by_category.map(c => c.total))
  const catRows = summary.by_category.map(c => `
    <tr class="border-b border-[var(--blue-10)]">
      <td class="p-2 text-xs text-[var(--black-100)]">${escapeHtml(c.category)}</td>
      <td class="p-2 w-1/3"><div class="h-1.5 bg-[var(--black-10)] rounded-full"><div class="h-1.5 bg-[var(--blue-100)] rounded-full" style="width:${Math.round(100 * c.total / maxCat)}%"></div></div></td>
      <td class="p-2 text-xs text-right text-[var(--black-60)]">${c.total}</td>
      <td class="p-2 text-xs text-right text-[var(--black-60)]">${c.resolved_pct ?? '—'}%</td>
    </tr>`).join('')

  const heat = buildHeatmap(summary.heatmap)

  const explorer = renderExplorer(convs)

  el.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      ${rangeControlsHtml('bot', from, to)}
      <button id="bot-export-csv" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--black-10)] text-[var(--black-60)] hover:bg-[var(--blue-10)]">⬇ CSV</button>
    </div>
    ${kpis}
    <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mt-6 mb-2">Requiere tu atención</p>
    ${attention}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-6">
      <div class="bg-white rounded-2xl border border-[var(--blue-10)] overflow-hidden">
        <p class="p-3 text-sm font-bold text-[var(--black-100)]">Dudas por categoría ${llmNote()}</p>
        <table class="w-full"><tbody>${catRows || '<tr><td class="p-3 text-xs text-[var(--black-40)]">Sin datos</td></tr>'}</tbody></table>
      </div>
      <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-3">
        <p class="text-sm font-bold text-[var(--black-100)] mb-2">Cuándo escriben</p>
        ${heat}
      </div>
    </div>
    ${explorer}`

  // Listeners
  wireRangeControls(el, 'bot', (f, t) => renderBotAnalytics(f, t))
  el.querySelector('#bot-export-csv')?.addEventListener('click', () => exportBotCsv(convs))
  wireExplorer(el, convs, from, to)
  el.querySelector('[data-gap-cat]')?.addEventListener('click', ev => {
    goToCreateLesson(ev.currentTarget.getAttribute('data-gap-cat'))
  })
}

function attentionCard(icon, title, desc, action, tone, dataAttr) {
  const border = tone === 'error' ? 'var(--error-100)' : tone === 'warning' ? 'var(--warning-150)' : 'var(--blue-100)'
  return `
  <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-3" style="box-shadow: inset 3px 0 0 ${border}">
    <p class="text-sm font-bold text-[var(--black-100)] flex items-center gap-1">${icon} ${title}</p>
    <p class="text-xs text-[var(--black-60)] mt-1">${desc}</p>
    ${action ? `<button ${dataAttr} class="text-xs font-bold mt-2" style="color:${border}">${action}</button>` : ''}
  </div>`
}

function buildHeatmap(cells) {
  const grid = {}
  let max = 1
  cells.forEach(c => { grid[`${c.dow}-${c.hour}`] = c.count; if (c.count > max) max = c.count })
  let html = '<div class="grid gap-0.5" style="grid-template-columns:28px repeat(24,1fr);min-width:340px">'
  html += '<div></div>' + Array.from({ length: 24 }, (_, h) => `<div class="text-[7px] text-center text-[var(--black-40)]">${h}</div>`).join('')
  for (let d = 0; d < 7; d++) {
    html += `<div class="text-[9px] text-[var(--black-40)] flex items-center">${DOW[d]}</div>`
    for (let h = 0; h < 24; h++) {
      const n = grid[`${d}-${h}`] || 0
      const op = n ? (0.15 + 0.85 * n / max).toFixed(2) : 0
      html += `<div title="${DOW[d]} ${h}:00 — ${n}" style="height:12px;border-radius:2px;background:rgba(18,30,108,${op})"></div>`
    }
  }
  return html + '</div>'
}

// -------- Explorador con filtros colapsables --------
function renderExplorer(convs) {
  return `
  <div class="bg-white rounded-2xl border border-[var(--blue-10)] mt-6" id="bot-explorer">
    <div class="flex items-center gap-2 p-3 cursor-pointer" id="bot-filters-head">
      <span class="text-sm font-bold text-[var(--black-100)]">Explorador de conversaciones</span>
      <span class="text-[10px] text-[var(--black-40)]" id="bot-filter-summary"></span>
      <span class="ml-auto text-xs text-[var(--blue-100)]" id="bot-filters-toggle">Filtros ▾</span>
    </div>
    <div class="px-3 pb-3 hidden" id="bot-filters-body">
      <div class="flex flex-wrap gap-2 items-center">
        <input id="bot-search" placeholder="🔎 buscar en mensajes…" class="px-2 py-1 rounded border border-[var(--blue-20)] text-xs flex-1 min-w-[160px]">
        ${filterChips('estado', 'Estado', [['', 'Todas'], ['no_resuelta', 'No resuelta'], ['resuelta', 'Resuelta'], ['ambigua', 'Ambigua']])}
        ${filterChips('sent', 'Sentimiento', [['', 'Todos'], ['positivo', 'Positivo'], ['neutro', 'Neutro'], ['negativo', 'Negativo']])}
        ${filterChips('sup', 'Soporte', [['', 'Todas'], ['true', 'Escaló'], ['false', 'No escaló']])}
      </div>
    </div>
    <div id="bot-conv-list" class="border-t border-[var(--blue-10)]">${convRows(convs)}</div>
  </div>`
}

function filterChips(group, label, opts) {
  const chips = opts.map((o, i) => `<button class="bot-fchip px-2 py-1 rounded-full text-[11px] border ${i === 0 ? 'bg-[var(--blue-100)] text-white border-[var(--blue-100)]' : 'text-[var(--black-60)] border-[var(--blue-20)]'}" data-group="${group}" data-val="${o[0]}">${o[1]}</button>`).join('')
  return `<div class="flex items-center gap-1"><span class="text-[10px] font-bold text-[var(--black-40)] uppercase">${label}</span>${chips}</div>`
}

function convRows(convs) {
  if (!convs.length) return '<p class="p-3 text-xs text-[var(--black-40)]">Sin conversaciones en el rango/filtros.</p>'
  return convs.map((c, i) => `
    <div class="bot-conv-row px-3 py-2 border-b border-[var(--blue-10)] cursor-pointer text-xs flex items-center gap-2" data-idx="${i}">
      <span class="flex-1 text-[var(--black-100)]">${escapeHtml((c.first_user_msg || '(sin mensaje)').slice(0, 90))}</span>
      ${c.sentiment === 'negativo' ? '<span class="text-[10px] px-2 rounded-full border border-[var(--error-100)] text-[var(--error-100)]">Neg</span>' : ''}
      ${c.support_redirected ? '<span class="text-[10px] px-2 rounded-full border border-[var(--warning-150)] text-[var(--warning-150)]">Escaló</span>' : ''}
      <span class="text-[var(--black-40)]">${escapeHtml(c.cat)}</span>
    </div>
    <div class="bot-conv-detail hidden px-3 py-2 bg-[var(--background-page)] text-xs" data-detail="${i}"></div>`).join('')
}

function wireExplorer(el, convs, from, to) {
  const head = el.querySelector('#bot-filters-head')
  const body = el.querySelector('#bot-filters-body')
  const toggle = el.querySelector('#bot-filters-toggle')
  head?.addEventListener('click', () => {
    const hidden = body.classList.toggle('hidden')
    toggle.textContent = hidden ? 'Filtros ▾' : 'Filtros ▴'
  })

  const state = { estado: '', sent: '', sup: '', search: '' }
  const summaryEl = el.querySelector('#bot-filter-summary')
  const refresh = async () => {
    const filters = { limit: 100 }
    if (state.estado) filters.status = state.estado
    if (state.sent) filters.sentiment = state.sent
    if (state.sup) filters.support = state.sup === 'true'
    if (state.search) filters.search = state.search
    const rows = await fetchBotConversations(from, to, filters)
    el.querySelector('#bot-conv-list').innerHTML = convRows(rows)
    bindRows(el, rows)
    const active = Object.entries(state).filter(([, v]) => v).map(([k, v]) => `${k}:${v}`).join(' · ')
    summaryEl.textContent = active ? `(${active})` : ''
  }

  el.querySelectorAll('.bot-fchip').forEach(chip => {
    chip.addEventListener('click', () => {
      const g = chip.dataset.group
      state[g] = chip.dataset.val
      el.querySelectorAll(`.bot-fchip[data-group="${g}"]`).forEach(c => {
        const on = c === chip
        c.className = `bot-fchip px-2 py-1 rounded-full text-[11px] border ${on ? 'bg-[var(--blue-100)] text-white border-[var(--blue-100)]' : 'text-[var(--black-60)] border-[var(--blue-20)]'}`
      })
      refresh()
    })
  })
  let t
  el.querySelector('#bot-search')?.addEventListener('input', e => {
    clearTimeout(t); t = setTimeout(() => { state.search = e.target.value.trim(); refresh() }, 400)
  })
  bindRows(el, convs)
}

function bindRows(el, rows) {
  el.querySelectorAll('.bot-conv-row').forEach(row => {
    row.addEventListener('click', () => {
      const i = row.dataset.idx
      const detail = el.querySelector(`.bot-conv-detail[data-detail="${i}"]`)
      if (!detail) return
      if (!detail.classList.contains('hidden')) { detail.classList.add('hidden'); return }
      const c = rows[i]
      const msgs = (c.messages || []).map(m =>
        `<p class="mb-1"><b class="text-[var(--blue-100)]">${m.role === 'user' ? 'Usuario' : 'Bot'}:</b> ${escapeHtml(m.content || '')}</p>`).join('')
      const lessons = (c.lessons_used || []).map(l => `<span class="text-[10px] px-2 rounded-full bg-[var(--blue-10)] text-[var(--blue-100)] mr-1">${escapeHtml(l)}</span>`).join('')
      detail.innerHTML = `${c.summary ? `<p class="italic text-[var(--black-60)] mb-2">✨ ${escapeHtml(c.summary)}</p>` : ''}${lessons ? `<div class="mb-2">${lessons}</div>` : ''}${msgs || '<span class="text-[var(--black-40)]">Sin mensajes</span>'}`
      detail.classList.remove('hidden')
    })
  })
}

function exportBotCsv(convs) {
  exportCSV(convs, `bolbot-conversaciones.csv`, [
    { label: 'ID', getValue: r => r.id },
    { label: 'Fecha', getValue: r => r.started_at },
    { label: 'Categoría', getValue: r => r.cat },
    { label: 'Estado', getValue: r => r.eff_status || '' },
    { label: 'Sentimiento', getValue: r => r.sentiment || '' },
    { label: 'Escaló', getValue: r => r.support_redirected ? 'Sí' : 'No' },
    { label: 'Primera pregunta', getValue: r => r.first_user_msg || '' },
    { label: 'Mensajes (JSON)', getValue: r => JSON.stringify(r.messages || []) },
  ])
}

function goToCreateLesson(categoria) {
  // Puente bot→lección: guarda la categoría sugerida y abre el panel de lecciones.
  localStorage.setItem('prefill_lesson_categoria', categoria || '')
  localStorage.setItem('admin_panel', 'lessons')
  location.reload()
}
```

- [ ] **Step 2: Borrar `renderBodiAnalytics` de `admin-analytics.js`** (`:488-821`) y cualquier import/listener que lo referenciara (ya no lo llama nadie tras el shell).

- [ ] **Step 3: Chequeo de sintaxis.** Run: `node --check js/admin-bot-analytics.js` → exit 0.

- [ ] **Step 4: Commit**

```bash
git add js/admin-bot-analytics.js js/admin-analytics.js
git commit -m "feat: vista operativa BolBot (KPIs, atención, categorías, heatmap, explorador)"
```

- [ ] **Step 5: Verificación manual (usuario, en navegador):** abrir /admin → Analytics → pestaña BolBot. Confirmar: KPIs con datos reales, sentimiento con barra, tarjetas de atención, tabla de categorías, heatmap, explorador con filtros colapsables que refiltran server-side, expandir conversación muestra transcripción, CSV descarga y no ejecuta fórmulas, botón "Crear lección" del hueco lleva al panel de lecciones. Consola sin errores.

---

### Task 8: Vista Resumen ejecutivo `js/admin-exec-analytics.js`

Hero del bot + lecciones compacto + tendencia + insights cruzados. Export del resumen.

**Files:**
- Create: `js/admin-exec-analytics.js`

**Interfaces:**
- Consumes: `fetchBotSummary`, `fetchBotTrend`, `fetchLessonsSummary`, `fetchContentGaps` (analytics-api); `rangeControlsHtml`, `wireRangeControls`, `computeRange`, `kpiCard`, `llmNote` (analytics-ui); `escapeHtml`, `exportCSV` (utils).
- Produces: `export async function renderExecAnalytics(from = null, to = null)` — monta en `#analytics-content`.

- [ ] **Step 1: Escribir el módulo**

```javascript
import {
  fetchBotSummary, fetchBotTrend, fetchLessonsSummary, fetchContentGaps,
} from './analytics-api.js'
import {
  rangeControlsHtml, wireRangeControls, computeRange, kpiCard, llmNote,
} from './analytics-ui.js'
import { escapeHtml, exportCSV } from './utils.js'

export async function renderExecAnalytics(from = null, to = null) {
  const el = document.getElementById('analytics-content')
  if (!el) return
  if (!from || !to) { const r = computeRange('30d', new Date()); from = r.from; to = r.to }
  const prevFrom = new Date(from); const prevTo = new Date(to)
  const span = to - from
  prevFrom.setTime(from.getTime() - span); prevTo.setTime(from.getTime())
  el.innerHTML = `<p class="text-[var(--black-40)] text-sm p-4">Cargando…</p>`

  let bot, trend, lessons, gaps
  try {
    [bot, trend, lessons, gaps] = await Promise.all([
      fetchBotSummary(from, to),
      fetchBotTrend(6),
      fetchLessonsSummary(from, to, prevFrom, prevTo),
      fetchContentGaps(from, to),
    ])
  } catch (e) {
    el.innerHTML = `<p class="text-[var(--error-100)] text-sm p-4">Error: ${escapeHtml(e.message)}</p>`
    return
  }

  const k = bot.kpis
  const lk = lessons.kpis
  const hero = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      ${kpiCard('Conversaciones', k.total)}
      ${kpiCard('Resolución real ' + llmNote(), (k.resolved_pct ?? 0) + '%')}
      ${kpiCard('Resuelto sin soporte', (k.resolved_without_support_pct ?? 0) + '%', `${k.total - k.support} sin humano`)}
      ${kpiCard('Sentimiento neto', (k.sentiment_net > 0 ? '+' : '') + (k.sentiment_net ?? 0))}
    </div>`

  const lessonsMini = `
    <div class="grid grid-cols-3 gap-3 mt-3">
      ${kpiCard('Estudiantes en curso', lk.new_students)}
      ${kpiCard('Visitas', lk.visits)}
      ${kpiCard('Certificados', lk.cert_views)}
    </div>`

  const maxConv = Math.max(1, ...trend.map(t => t.conversations))
  const trendBars = trend.map(t => `
    <div class="flex flex-col items-center gap-1 flex-1">
      <div class="w-full flex items-end justify-center" style="height:80px">
        <div class="w-6 bg-[var(--blue-100)] rounded-t" style="height:${Math.round(80 * t.conversations / maxConv)}px" title="${t.conversations} conv · ${t.resolved_pct ?? '—'}% resuelto"></div>
      </div>
      <span class="text-[9px] text-[var(--black-40)]">${t.month.slice(5)}</span>
    </div>`).join('')

  const gapItems = gaps.slice(0, 3).map(g => `
    <div class="flex gap-2 p-2 rounded-lg bg-[var(--background-page)] border-l-2 border-[var(--warning-150)] mb-2">
      <span>${g.has_lesson ? '🔴' : '🔗'}</span>
      <div><p class="text-xs font-bold text-[var(--black-100)]">${escapeHtml(g.category)} (${g.total})</p>
        <p class="text-[11px] text-[var(--black-60)]">${g.has_lesson ? `resuelve ${g.resolved_pct ?? '—'}% — revisar lección` : 'sin lección — oportunidad de contenido'}</p></div>
    </div>`).join('') || '<p class="text-xs text-[var(--black-40)]">Sin huecos en el rango.</p>'

  el.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      ${rangeControlsHtml('exec', from, to)}
      <button id="exec-export" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--coral-100)] text-white">⬇ Exportar resumen</button>
    </div>
    <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mb-2">El BolBot</p>
    ${hero}
    <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mt-6 mb-2">Formación / lecciones</p>
    ${lessonsMini}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-6">
      <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-3">
        <p class="text-sm font-bold text-[var(--black-100)] mb-2">Volumen del bot (6 meses)</p>
        <div class="flex items-end gap-1">${trendBars || '<span class="text-xs text-[var(--black-40)]">Sin datos</span>'}</div>
      </div>
      <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-3">
        <p class="text-sm font-bold text-[var(--black-100)] mb-2">Insights bot ↔ lecciones ${llmNote()}</p>
        ${gapItems}
      </div>
    </div>`

  wireRangeControls(el, 'exec', (f, t) => renderExecAnalytics(f, t))
  el.querySelector('#exec-export')?.addEventListener('click', () => {
    exportCSV(gaps, 'resumen-gaps.csv', [
      { label: 'Categoría', getValue: r => r.category },
      { label: 'Consultas', getValue: r => r.total },
      { label: 'Resolución %', getValue: r => r.resolved_pct ?? '' },
      { label: 'Tiene lección', getValue: r => r.has_lesson ? 'Sí' : 'No' },
    ])
  })
}
```

- [ ] **Step 2: Chequeo de sintaxis.** Run: `node --check js/admin-exec-analytics.js` → exit 0.

- [ ] **Step 3: Commit**

```bash
git add js/admin-exec-analytics.js
git commit -m "feat: vista Resumen ejecutivo (hero bot + lecciones + tendencia + insights)"
```

- [ ] **Step 4: Verificación manual (usuario):** /admin → Analytics → pestaña Resumen. Hero del bot, mini-KPIs de lecciones, barras de tendencia 6 meses, insights de huecos, export descarga. Consola limpia.

---

### Task 9: Cerrar el puente bot→lección en el panel de Lecciones

`goToCreateLesson` (Task 7) guarda `prefill_lesson_categoria` y abre el panel de lecciones; aquí se consume ese prefill al abrir el editor de lección nueva.

**Files:**
- Modify: `js/admin.js` (donde se abre el formulario de "nueva lección" en `renderLessonsPanel`)

**Interfaces:**
- Consumes: `localStorage('prefill_lesson_categoria')` (lo escribe `goToCreateLesson`).
- Produces: al entrar al panel de lecciones con ese flag, se abre el editor de lección nueva con la categoría pre-seleccionada y se limpia el flag.

- [ ] **Step 1: Localizar en `admin.js` la función que abre el editor de lección nueva** (el handler del botón "Nueva lección" en `renderLessonsPanel`, ~`admin.js:231+`). Leer cómo crea el formulario y setea la categoría.

- [ ] **Step 2: Al final de `renderLessonsPanel`, consumir el prefill:**

```javascript
const prefillCat = localStorage.getItem('prefill_lesson_categoria')
if (prefillCat) {
  localStorage.removeItem('prefill_lesson_categoria')
  // abrir editor de lección nueva con la categoría preseleccionada
  openNewLessonEditor(prefillCat) // usar la función real que abre el editor; pasar/!setear la categoría
}
```

(Reemplazar `openNewLessonEditor(prefillCat)` por la llamada real encontrada en Step 1; si el editor no acepta categoría como argumento, setear el `<select>` de categoría tras abrirlo con `.value = prefillCat`.)

- [ ] **Step 3: Chequeo de sintaxis.** Run: `node --check js/admin.js` → exit 0.

- [ ] **Step 4: Commit**

```bash
git add js/admin.js
git commit -m "feat: puente bot->leccion — prefill de categoría al crear lección"
```

- [ ] **Step 5: Verificación manual (usuario):** desde BolBot, clic en "Crear lección" de un hueco → abre el editor de lección nueva con la categoría del tema pre-cargada.

---

## Cierre

Al terminar: el analytics tiene 3 pestañas (Resumen/Lecciones/BolBot); el BolBot muestra calidad (con fallback legacy + nota "se afina con LLM"), categorías, heatmap y explorador filtrado server-side; el Resumen ejecutivo resume impacto para dirección; el puente convierte un hueco de contenido en una lección nueva. Cuando entre ①c (LLM en n8n), resolución/categoría/gap/summary se llenan y las notas "se afina con LLM" pasan a datos reales sin tocar estas vistas. Verificación end-to-end en navegador la hace el usuario (no hay arnés DOM). Follow-up de ②: reescribir la vista Lecciones con el mismo patrón y agrupar por `lesson_id`.
