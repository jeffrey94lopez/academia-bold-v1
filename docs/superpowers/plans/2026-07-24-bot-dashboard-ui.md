# Sub-proyecto D — UI dashboard · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mejorar la legibilidad de los dashboards: mostrar los conteos pos/neu/neg dentro de la barra de satisfacción (builder puro reusado por exec y bot) y partir el panel "Insights bot ↔ lecciones" en dos bloques rotulados.

**Architecture:** Un builder puro nuevo `sentimentBar(sentiment)` en `js/analytics-ui.js` (import-safe, testeable con `node:test`) que reemplaza la barra apilada duplicada en dos dashboards. El split de insights es lógica de presentación local a `renderExecAnalytics` (dos `filter`). Solo frontend.

**Tech Stack:** JS ES-modules vanilla (sin build), `node:test`, Tailwind (clases existentes).

## Global Constraints

- Rama de trabajo: `sandbox`. Solo frontend; no tocar RPCs ni datos.
- Estilo de los archivos: indentación 2 espacios, **sin punto y coma**, sin clases Tailwind nuevas (reusar las existentes).
- `sentimentBar(sentiment)` es **puro** (sin DOM), vive en `js/analytics-ui.js` junto a `kpiCard`/`llmNote`. Entrada `{ positivo, neutro, negativo }` (el objeto `k.sentiment`); salida string HTML de la barra **sin margen** (el margen lo pone cada consumidor al envolverla).
- Colores exactos (reusar): pos `bg-[var(--success-150)]`, neutro `bg-[var(--black-10)]`, neg `bg-[var(--error-100)]`.
- Tests: `node --test tests/*.test.mjs`. El warning `MODULE_TYPELESS_PACKAGE_JSON` es esperado en todo el repo y NO es hallazgo.
- Tasks 2 y 3 ambas modifican `js/admin-exec-analytics.js` (regiones distintas) → ejecutar en orden, no en paralelo.

## File Structure

- `js/analytics-ui.js` — **Modify:** agregar `export function sentimentBar(sentiment)`.
- `tests/analytics-ui.test.mjs` — **Create:** unit tests de `sentimentBar`.
- `js/admin-exec-analytics.js` — **Modify:** import; `satPanel` usa `sentimentBar`; `insightsPanel` partido en dos bloques.
- `js/admin-bot-analytics.js` — **Modify:** import; card "Sentimiento neto" (Capa ①) usa `sentimentBar`.

---

### Task 1: Builder puro `sentimentBar` + tests

**Files:**
- Modify: `js/analytics-ui.js`
- Test: `tests/analytics-ui.test.mjs`

**Interfaces:**
- Produces: `sentimentBar(sentiment) => string`. `sentiment = { positivo:number, neutro:number, negativo:number }` (campos opcionales; faltantes → 0). Devuelve el HTML de la barra apilada (un `<div class="flex h-5 …">` con 3 segmentos, cada uno con su conteo centrado dentro y `title`), sin margen externo. Consumido por Tasks 2.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/analytics-ui.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { sentimentBar } from '../js/analytics-ui.js'

test('muestra los tres conteos dentro de la barra', () => {
  const html = sentimentBar({ positivo: 12, neutro: 5, negativo: 3 })
  assert.match(html, />12</)
  assert.match(html, />5</)
  assert.match(html, />3</)
})

test('calcula los anchos sobre el total', () => {
  const html = sentimentBar({ positivo: 2, neutro: 1, negativo: 1 })
  assert.match(html, /width:50%/)
  assert.match(html, /width:25%/)
})

test('base cero: no lanza y produce anchos 0%', () => {
  let html
  assert.doesNotThrow(() => { html = sentimentBar({ positivo: 0, neutro: 0, negativo: 0 }) })
  assert.match(html, /width:0%/)
})

test('entrada indefinida no lanza', () => {
  assert.doesNotThrow(() => sentimentBar(undefined))
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/analytics-ui.test.mjs`
Expected: FAIL — `sentimentBar` no es una función exportada / import error.

- [ ] **Step 3: Escribir la implementación mínima**

En `js/analytics-ui.js`, agregar al final del archivo (después de `llmNote`):

```js

// Barra apilada de sentimiento con los conteos DENTRO de cada segmento.
// Pura (sin DOM), reusada por el Resumen ejecutivo y el dashboard BolBot.
// Devuelve solo la barra (sin margen); el consumidor la envuelve con su spacing.
export function sentimentBar(sentiment) {
  const s = sentiment || {}
  const pos = s.positivo || 0
  const neu = s.neutro || 0
  const neg = s.negativo || 0
  const total = (pos + neu + neg) || 1
  const seg = (count, label, colorClass, textClass) => `
      <div class="flex items-center justify-center ${colorClass} ${textClass} text-[10px] font-bold overflow-hidden whitespace-nowrap" style="width:${Math.round(100 * count / total)}%" title="${count} ${label}">${count > 0 ? count : ''}</div>`
  return `
    <div class="flex h-5 rounded-full overflow-hidden">${seg(pos, 'positivas', 'bg-[var(--success-150)]', 'text-white')}${seg(neu, 'neutras', 'bg-[var(--black-10)]', 'text-[var(--black-60)]')}${seg(neg, 'negativas', 'bg-[var(--error-100)]', 'text-white')}
    </div>`
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/analytics-ui.test.mjs`
Expected: PASS — 4 tests.

- [ ] **Step 5: Correr la suite completa**

Run: `node --test tests/*.test.mjs`
Expected: PASS — todos los archivos verdes.

- [ ] **Step 6: Commit**

```bash
git add js/analytics-ui.js tests/analytics-ui.test.mjs
git commit -m "feat: builder puro sentimentBar (conteos dentro de la barra) + tests (sub-proyecto D)"
```

---

### Task 2: Cablear `sentimentBar` en exec y bot (Parte 1)

Reemplazar la barra apilada + la línea de conteos de abajo por `sentimentBar` en los dos dashboards, y borrar la variable `sentTotal` que queda sin uso.

**Files:**
- Modify: `js/admin-exec-analytics.js` — import (~L4-6); `satPanel` (~L70-84); borrar `sentTotal` (~L72).
- Modify: `js/admin-bot-analytics.js` — import (~L4-7); card "Sentimiento neto" (~L40-49); borrar `sentTotal` (~L31).

**Interfaces:**
- Consumes: `sentimentBar` de `js/analytics-ui.js` (Task 1).

> **Nota:** ambos archivos usan `document`/`localStorage`/`location` y no son import-safe en Node → esta tarea no lleva unit test propio (la lógica testeable vive en Task 1). Verificación = `node --check` + suite verde + navegador.

- [ ] **Step 1: Importar `sentimentBar` en exec**

En `js/admin-exec-analytics.js`, agregar `sentimentBar` al import existente de `./analytics-ui.js`:

```js
import {
  rangeControlsHtml, wireRangeControls, computeRange, kpiCard, llmNote, sentimentBar,
} from './analytics-ui.js'
```

- [ ] **Step 2: Reemplazar `satPanel` y borrar `sentTotal` en exec**

En `js/admin-exec-analytics.js`, el bloque actual (~L70-84) es:

```js
  // Satisfacción — con barra y base explícita.
  const s = k.sentiment
  const sentTotal = (s.positivo + s.neutro + s.negativo) || 1
  const satPanel = `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
      <p class="text-sm font-bold text-[var(--black-100)]">Satisfacción</p>
      <p class="text-[11px] text-[var(--black-40)] mb-2">sentimiento neto = % positivas − % negativas</p>
      <p class="text-3xl font-black text-[var(--black-100)] leading-none">${k.sentiment_net > 0 ? '+' : ''}${k.sentiment_net ?? 0}</p>
      <div class="flex h-4 rounded-full overflow-hidden mt-3">
        <div style="width:${Math.round(100 * s.positivo / sentTotal)}%" class="bg-[var(--success-150)]"></div>
        <div style="width:${Math.round(100 * s.neutro / sentTotal)}%" class="bg-[var(--black-10)]"></div>
        <div style="width:${Math.round(100 * s.negativo / sentTotal)}%" class="bg-[var(--error-100)]"></div>
      </div>
      <p class="text-[10px] text-[var(--black-60)] mt-2">${s.positivo} positivas · ${s.neutro} neutras · ${s.negativo} negativas</p>
    </div>`
```

Reemplazarlo por (se borra `sentTotal`, la barra manual y la línea de abajo):

```js
  // Satisfacción — con barra (conteos dentro) y base explícita.
  const s = k.sentiment
  const satPanel = `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
      <p class="text-sm font-bold text-[var(--black-100)]">Satisfacción</p>
      <p class="text-[11px] text-[var(--black-40)] mb-2">sentimiento neto = % positivas − % negativas</p>
      <p class="text-3xl font-black text-[var(--black-100)] leading-none">${k.sentiment_net > 0 ? '+' : ''}${k.sentiment_net ?? 0}</p>
      <div class="mt-3">${sentimentBar(s)}</div>
    </div>`
```

- [ ] **Step 3: Importar `sentimentBar` en bot**

En `js/admin-bot-analytics.js`, agregar `sentimentBar` al import existente de `./analytics-ui.js`:

```js
import {
  rangeControlsHtml, wireRangeControls, computeRange, kpiCard, llmNote, sentimentBar,
} from './analytics-ui.js'
```

- [ ] **Step 4: Reemplazar la card "Sentimiento neto" y borrar `sentTotal` en bot**

En `js/admin-bot-analytics.js`, borrar la línea (~L31):

```js
  const sentTotal = (s.positivo + s.neutro + s.negativo) || 1
```

(dejar intactas `const k = summary.kpis` y `const s = k.sentiment`).

Luego, dentro de la grilla de KPIs (Capa ①), el bloque actual (~L39-48) es:

```js
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
```

Reemplazarlo por:

```js
      <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
        <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mb-1">Sentimiento neto</p>
        <p class="text-2xl font-black text-[var(--black-100)]">${k.sentiment_net > 0 ? '+' : ''}${k.sentiment_net ?? 0}</p>
        <div class="mt-2">${sentimentBar(s)}</div>
      </div>
```

- [ ] **Step 5: Verificar sintaxis y suite**

Run: `node --check js/admin-exec-analytics.js && node --check js/admin-bot-analytics.js && node --test tests/*.test.mjs`
Expected: sin error de sintaxis; suite verde.

- [ ] **Step 6: Commit**

```bash
git add js/admin-exec-analytics.js js/admin-bot-analytics.js
git commit -m "feat: conteos dentro de la barra de satisfacción en exec y bot (sub-proyecto D)"
```

---

### Task 3: Partir "Insights bot ↔ lecciones" en dos bloques (Parte 2)

Dentro del mismo panel, separar las categorías sin lección (🔗 huecos) de las que sí tienen (🔴 revisar).

**Files:**
- Modify: `js/admin-exec-analytics.js` — bloque `gapItems` + `insightsPanel` (~L86-97).

**Interfaces:**
- Consumes: `gaps` (de `fetchContentGaps`, con `category`/`total`/`has_lesson`/`resolved_pct`) — ya disponible en `renderExecAnalytics`.

> **Nota:** archivo no import-safe en Node → verificación = `node --check` + suite verde + navegador.

- [ ] **Step 1: Reemplazar `gapItems` + `insightsPanel`**

En `js/admin-exec-analytics.js`, el bloque actual (~L86-97) es:

```js
  // Insights bot↔lecciones — exclusivo del Resumen.
  const gapItems = gaps.slice(0, 4).map(g => `
    <div class="flex gap-2 p-2 rounded-lg bg-[var(--background-page)] border-l-2 border-[var(--warning-150)] mb-2">
      <span>${g.has_lesson ? '🔴' : '🔗'}</span>
      <div><p class="text-xs font-bold text-[var(--black-100)]">${escapeHtml(g.category)} (${g.total})</p>
        <p class="text-[11px] text-[var(--black-60)]">${g.has_lesson ? `resuelve ${g.resolved_pct ?? '—'}% — revisar lección` : 'sin lección — oportunidad de contenido'}</p></div>
    </div>`).join('') || '<p class="text-xs text-[var(--black-40)]">Sin huecos en el rango.</p>'
  const insightsPanel = `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
      <p class="text-sm font-bold text-[var(--black-100)] mb-2">Insights bot ↔ lecciones ${llmNote()}</p>
      ${gapItems}
    </div>`
```

Reemplazarlo por (mismo estilo de ítem, ahora en dos bloques rotulados):

```js
  // Insights bot↔lecciones — exclusivo del Resumen, partido en dos bloques.
  const gapItem = g => `
    <div class="flex gap-2 p-2 rounded-lg bg-[var(--background-page)] border-l-2 border-[var(--warning-150)] mb-2">
      <span>${g.has_lesson ? '🔴' : '🔗'}</span>
      <div><p class="text-xs font-bold text-[var(--black-100)]">${escapeHtml(g.category)} (${g.total})</p>
        <p class="text-[11px] text-[var(--black-60)]">${g.has_lesson ? `resuelve ${g.resolved_pct ?? '—'}% — revisar lección` : 'sin lección — oportunidad de contenido'}</p></div>
    </div>`
  const sinLeccion = gaps.filter(g => !g.has_lesson).slice(0, 4)
  const conLeccion = gaps.filter(g => g.has_lesson).slice(0, 4)
  const insightsBlock = (title, items, empty) => `
    <p class="text-[11px] font-bold text-[var(--black-40)] uppercase tracking-wide mb-1 mt-2">${title}</p>
    ${items.length ? items.map(gapItem).join('') : `<p class="text-xs text-[var(--black-40)]">${empty}</p>`}`
  const insightsPanel = `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
      <p class="text-sm font-bold text-[var(--black-100)] mb-2">Insights bot ↔ lecciones ${llmNote()}</p>
      ${insightsBlock('🔗 Huecos de contenido', sinLeccion, 'Sin huecos en el rango.')}
      ${insightsBlock('🔴 Lecciones a revisar', conLeccion, 'Sin lecciones que revisar.')}
    </div>`
```

(El botón "Exportar resumen" del final sigue usando `gaps` sin cambios.)

- [ ] **Step 2: Verificar sintaxis y suite**

Run: `node --check js/admin-exec-analytics.js && node --test tests/*.test.mjs`
Expected: sin error de sintaxis; suite verde.

- [ ] **Step 3: Commit**

```bash
git add js/admin-exec-analytics.js
git commit -m "feat: Insights bot<->lecciones partido en dos bloques (sub-proyecto D)"
```

---

## Notas de verificación final

- **Navegador:** /admin → analytics.
  - **Resumen ejecutivo:** la barra de "Satisfacción" muestra los conteos dentro de cada segmento (número en hover si el segmento es angosto) y ya no hay línea de texto debajo; el panel "Insights bot ↔ lecciones" tiene dos sub-secciones ("🔗 Huecos de contenido" y "🔴 Lecciones a revisar").
  - **BolBot:** la card "Sentimiento neto" (grilla de KPIs) muestra los conteos dentro de la barra, sin línea debajo.
- **Fuera de alcance:** RPCs/datos, heatmap, resto de cards de KPIs, estados de ciclo de vida (B).
