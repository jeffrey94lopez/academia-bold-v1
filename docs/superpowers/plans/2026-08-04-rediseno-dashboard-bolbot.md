# Rediseño del dashboard BolBot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar la pestaña BolBot (`js/admin-bot-analytics.js`): header con dos barras que cierran a 100 + resolución con ambiguas explícitas + sentimiento con caritas, "Qué atender ahora" como lista priorizada, y drill-down desde cada métrica al explorador. Renombrar la pestaña a "BoldBot POS".

**Architecture:** Solo frontend. La lógica de ranking de "qué atender" se extrae a `js/bot-attention.js` (pura, testeable). La vista se reescribe consumiendo datos que ya trae `analytics_bot_summary`. El explorador gana un filtro `category` (la RPC ya lo soporta) y un mecanismo para recibir filtros por drill-down (reemplazando los activos, con chips removibles y auto-scroll).

**Tech Stack:** JS vanilla ESM, `node:test` (`.mjs`), tema Merlin (tokens `css/style.css`).

## Global Constraints

- **Solo frontend.** Sin RPCs nuevas ni cambios de esquema. Todos los datos vienen de `analytics_bot_summary` (`kpis.{total,support,lifecycle,resolved,unresolved,ambiguous,resolved_pct,sentiment}`, `by_category`) y `analytics_content_gaps` (`gaps`). El filtro por categoría del explorador usa `fetchBotConversations(..., {category})` (ya existe `p_category`).
- **Tema Merlin:** solo tokens (`--blue-100`, `--success-150`, `--warning-150`, `--error-100`, `--black-*`, `--background-page`). No inventar colores.
- **Un porcentaje = un denominador claro.** Parte-de-un-todo va en barra apilada que cierra a 100; el faltante de resolución (ambiguas) se muestra explícito.
- **Drill-down reemplaza** los filtros activos, hace auto-scroll al explorador y muestra chips removibles. El heatmap es informativo (no drillable).
- **La barra 1 (bot/soporte) es informativa** (no clicable): "bot" = no-escaló no mapea a un filtro único. Los drills van por la barra 2 y las demás métricas.
- **Tests:** `node --test tests/<archivo>.test.mjs`.

## Mapa métrica → filtro del explorador (estado interno `{estado, sent, life, category, search}`)

| Métrica (clic) | data-drill (JSON) |
|---|---|
| Barra 2 · cerró | `{"life":"cerrada_cliente"}` |
| Barra 2 · abandonó | `{"life":"abandonada"}` |
| Barra 2 · escaló | `{"life":"escalada"}` |
| Resolución · resueltas / no resueltas / ambiguas | `{"estado":"resuelta"}` / `{"estado":"no_resuelta"}` / `{"estado":"ambigua"}` |
| Sentimiento · 🙂 / 😐 / 🙁 | `{"sent":"positivo"}` / `{"sent":"neutro"}` / `{"sent":"negativo"}` |
| Qué atender · fila | `{"category":"X"}` (+ `"estado":"no_resuelta"` si el problema es baja-resolución) |
| Dudas por categoría · fila | `{"category":"X"}` |

---

### Task 1: `rankAttention` en `js/bot-attention.js` (+ tests)

Lista priorizada de categorías con problema. Reemplaza el uso disperso (`pickContentToReinforce` + `negCat`) por un solo ranking.

**Files:**
- Modify: `js/bot-attention.js` (añadir `rankAttention`)
- Test: `tests/bot-attention.test.mjs` (añadir casos)

**Interfaces:**
- Produces: `rankAttention(byCategory, gaps, opts?) → Array<{category, problem, action, detail, score, extraStatus?}>` ordenado por severidad, top `limit`.
  - `problem ∈ 'contenido-faltante'|'baja-resolucion'|'negativo'|'escala'`; `action ∈ 'crear'|'revisar'|'reforzar'`.

- [ ] **Step 1: Escribir el test que falla**

Añade a `tests/bot-attention.test.mjs` (importa `rankAttention` junto a lo existente):

```javascript
import { rankAttention } from '../js/bot-attention.js'

test('rankAttention: prioriza contenido faltante, luego baja resolución, ordena por volumen', () => {
  const byCat = [
    { category: 'Facturación/Cuenta', total: 20, resolved_pct: 40, negative_pct: 10, support_pct: 20 },
    { category: 'Inventario', total: 15, resolved_pct: 80, negative_pct: 35, support_pct: 20 },
    { category: 'Ventas', total: 12, resolved_pct: 90, negative_pct: 5, support_pct: 50 },
    { category: 'Reportes', total: 2, resolved_pct: 10, negative_pct: 90, support_pct: 90 }, // bajo volumen → fuera
    { category: 'Contactos', total: 30, resolved_pct: 95, negative_pct: 5, support_pct: 5 }, // sin problema → fuera
  ]
  const gaps = [{ category: 'Facturación/Cuenta', total: 8, has_lesson: false }]
  const r = rankAttention(byCat, gaps, { limit: 4 })
  assert.deepEqual(r.map(x => [x.category, x.problem, x.action]), [
    ['Facturación/Cuenta', 'contenido-faltante', 'crear'],
    ['Inventario', 'negativo', 'revisar'],
    ['Ventas', 'escala', 'reforzar'],
  ])
  assert.equal(r[0].detail, '8 sin lección')
})

test('rankAttention: baja resolución marca extraStatus no_resuelta', () => {
  const r = rankAttention([{ category: 'X', total: 10, resolved_pct: 30, negative_pct: 0, support_pct: 0 }], [])
  assert.equal(r[0].problem, 'baja-resolucion')
  assert.equal(r[0].extraStatus, 'no_resuelta')
})

test('rankAttention: sin categorías con problema devuelve []', () => {
  assert.deepEqual(rankAttention([{ category: 'X', total: 50, resolved_pct: 99, negative_pct: 0, support_pct: 0 }], []), [])
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test tests/bot-attention.test.mjs` → FAIL (`rankAttention` no existe).

- [ ] **Step 3: Implementar**

Añade a `js/bot-attention.js`:

```javascript
export function rankAttention(byCategory, gaps, {
  minVolume = 3, maxResolvedPct = 50, minNegativePct = 30, minSupportPct = 40, limit = 4,
} = {}) {
  const gapByCat = new Map((gaps || []).filter(g => g.has_lesson === false).map(g => [g.category, g]))
  const items = []
  for (const c of byCategory || []) {
    if ((c.total ?? 0) < minVolume) continue
    let it = null
    if (gapByCat.has(c.category)) {
      it = { problem: 'contenido-faltante', action: 'crear', detail: `${gapByCat.get(c.category).total} sin lección`, score: (c.total ?? 0) * 2 }
    } else if (c.resolved_pct != null && c.resolved_pct < maxResolvedPct) {
      it = { problem: 'baja-resolucion', action: 'revisar', detail: `${c.resolved_pct}% resolución`, score: c.total, extraStatus: 'no_resuelta' }
    } else if ((c.negative_pct ?? 0) >= minNegativePct) {
      it = { problem: 'negativo', action: 'revisar', detail: `${c.negative_pct}% negativo`, score: c.total }
    } else if ((c.support_pct ?? 0) >= minSupportPct) {
      it = { problem: 'escala', action: 'reforzar', detail: `${c.support_pct}% a soporte`, score: c.total }
    }
    if (it) items.push({ category: c.category, ...it })
  }
  return items.sort((a, b) => b.score - a.score).slice(0, limit)
}
```

- [ ] **Step 4: Correr y verificar que pasa** — `node --test tests/bot-attention.test.mjs` → PASS.

- [ ] **Step 5: Commit**

```bash
git add js/bot-attention.js tests/bot-attention.test.mjs
git commit -m "feat: rankAttention — lista priorizada de qué atender (+tests)"
```

---

### Task 2: Header nuevo + "Qué atender ahora" en la vista

Reescribe en `js/admin-bot-analytics.js` el bloque `kpis` + `lifecyclePanel` + `attention` (capa ① y ②). Conserva intactos: `catRows`/tabla de categorías, `buildHeatmap`, `renderExplorer`. Los elementos clicables llevan `data-drill` (JSON); el wiring del drill es la Task 3.

**Files:**
- Modify: `js/admin-bot-analytics.js`

**Interfaces:**
- Consumes: `rankAttention` (Task 1); `kpis.{total,support,lifecycle,resolved,unresolved,ambiguous,resolved_pct,sentiment}`.

- [ ] **Step 1: Importar rankAttention**

En el import desde `./bot-attention.js`, añade `rankAttention`.

- [ ] **Step 2: Construir el header**

Reemplaza la constante `kpis` (y elimina `lifecyclePanel` como panel separado — su contenido pasa a la barra 2 del header) por:

```javascript
  const total = k.total || 0
  const support = k.support || 0
  const botN = total - support
  const pct = n => total ? Math.round(100 * n / total) : 0
  const lc = k.lifecycle || {}
  const drill = obj => `data-drill='${JSON.stringify(obj)}'`
  const seg = (w, bg, tx, label) => `<div class="flex items-center justify-center overflow-hidden whitespace-nowrap text-[11px] font-bold" style="width:${w}%;background:${bg};color:${tx}">${label}</div>`

  const header = `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-5">
      <p class="mb-3"><span class="text-4xl font-black text-[var(--blue-100)]">${total}</span> <span class="text-sm text-[var(--black-60)]">conversaciones · así terminaron</span></p>

      <div class="flex h-6 rounded-md overflow-hidden gap-0.5">
        ${seg(pct(botN), 'var(--success-10)', 'var(--success-150)', `bot ${pct(botN)}%`)}
        ${seg(pct(support), 'var(--warning-10)', 'var(--warning-150)', `soporte ${pct(support)}%`)}
      </div>

      <div class="flex h-5 rounded-md overflow-hidden gap-0.5 mt-1 cursor-pointer">
        <div ${drill({ life: 'cerrada_cliente' })} class="bot-drill flex items-center justify-center text-[10px] font-bold" style="width:${pct(lc.cerrada_cliente || 0)}%;background:var(--success-10);color:var(--success-150)">cerró ${lc.cerrada_cliente || 0}</div>
        <div ${drill({ life: 'abandonada' })} class="bot-drill flex items-center justify-center text-[10px] font-bold" style="width:${pct(lc.abandonada || 0)}%;background:var(--black-10);color:var(--black-60)">abandonó ${lc.abandonada || 0}</div>
        <div ${drill({ life: 'escalada' })} class="bot-drill flex items-center justify-center text-[10px] font-bold" style="width:${pct(lc.escalada || 0)}%;background:var(--warning-10);color:var(--warning-150)">escaló ${lc.escalada || 0}</div>
      </div>
      <p class="text-[10px] text-[var(--black-40)] mt-1">cerró el cliente · abandonó · escaló a soporte</p>

      <div class="border-t border-[var(--blue-10)] mt-4 pt-3 flex flex-wrap gap-x-8 gap-y-3 items-center">
        <div>
          <p class="text-[11px] text-[var(--black-60)]">Resolución real <span class="text-[var(--black-40)]">· sin ambiguas</span></p>
          <p class="text-xl font-black text-[var(--black-100)]">${k.resolved_pct ?? 0}%
            <span class="text-[11px] font-normal text-[var(--black-60)]">
              <button ${drill({ estado: 'resuelta' })} class="bot-drill underline">${k.resolved ?? 0} resueltas</button> ·
              <button ${drill({ estado: 'no_resuelta' })} class="bot-drill underline">${k.unresolved ?? 0} no resueltas</button> ·
              <button ${drill({ estado: 'ambigua' })} class="bot-drill underline">${k.ambiguous ?? 0} ambiguas</button>
            </span>
          </p>
        </div>
        <div>
          <p class="text-[11px] text-[var(--black-60)] mb-1">Sentimiento</p>
          <div class="flex gap-3 text-sm font-bold">
            <button ${drill({ sent: 'positivo' })} class="bot-drill flex items-center gap-1" style="color:var(--success-150)"><i data-lucide="smile" class="w-4 h-4"></i>${pct((k.sentiment || {}).positivo || 0)}%</button>
            <button ${drill({ sent: 'neutro' })} class="bot-drill flex items-center gap-1 text-[var(--black-60)]"><i data-lucide="meh" class="w-4 h-4"></i>${pct((k.sentiment || {}).neutro || 0)}%</button>
            <button ${drill({ sent: 'negativo' })} class="bot-drill flex items-center gap-1" style="color:var(--error-100)"><i data-lucide="frown" class="w-4 h-4"></i>${pct((k.sentiment || {}).negativo || 0)}%</button>
          </div>
        </div>
      </div>
    </div>`
```

(Nota: `--success-10`/`--warning-10` son los tints suaves; si no existen en `css/style.css`, usar `--success-100`/`--warning-100` o el tint disponible — verificar y ajustar al token real del tema Merlin.)

- [ ] **Step 3: Construir "Qué atender ahora"**

Reemplaza la constante `attention` (las 3 `attentionCard`) por la lista priorizada:

```javascript
  const attnItems = rankAttention(summary.by_category, gaps)
  const ACT = { crear: ['Crear lección', 'var(--error-100)'], revisar: ['Revisar lección', 'var(--warning-150)'], reforzar: ['Reforzar contenido', 'var(--blue-100)'] }
  const attention = attnItems.length ? `
    <div class="flex flex-col gap-2 mt-4">
      ${attnItems.map(it => {
        const [label, color] = ACT[it.action]
        const f = { category: it.category, ...(it.extraStatus ? { estado: it.extraStatus } : {}) }
        const act = it.action === 'crear' ? `data-gap-cat="${escapeHtml(it.category)}"` : `data-edit-cat="${escapeHtml(it.category)}"`
        return `<div class="bot-drill flex items-center gap-2 p-3 rounded-xl border border-[var(--blue-10)] cursor-pointer" ${drill(f)}>
          <span class="flex-1 text-sm text-[var(--black-100)]"><span class="font-bold">${escapeHtml(it.category)}</span> — ${it.detail}</span>
          <button ${act} class="text-xs font-bold px-2 py-1 rounded border" style="color:${color};border-color:${color}">${label}</button>
        </div>`
      }).join('')}
    </div>` : '<p class="text-xs text-[var(--black-40)] mt-4">Sin señales de atención en el rango.</p>'
```

- [ ] **Step 3b: Hacer clicables las filas de "Dudas por categoría"**

En `catRows` (la tabla de categorías), añade a cada `<tr>` la clase `bot-drill` + `cursor-pointer` y `data-drill='{"category":"<cat>"}'` (con `escapeHtml` en el valor del atributo y `JSON.stringify`), para que también drilleen al explorador por categoría.

- [ ] **Step 4: Actualizar el ensamblado y quitar dependencias muertas**

En `el.innerHTML`, usa `${header}` en lugar de `${kpis}${lifecyclePanel}` y deja `${attention}` con el nuevo contenido (el subtítulo "Requiere tu atención" se conserva o se cambia a "Qué atender ahora"). Elimina la función `attentionCard` y la lógica `negCat`/`reinforce`/`pickContentToReinforce` si quedan sin uso (verificar con grep antes de borrar; si `pickContentToReinforce` tiene test propio y se elimina, quitar también su test). El botón acción reutiliza los listeners `[data-gap-cat]`/`[data-edit-cat]` ya cableados (líneas ~117-124), que **no** deben dispararse cuando el clic es en la fila (drill) — usar `stopPropagation` en el botón (se ajusta en Task 3).

- [ ] **Step 5: Verificar sintaxis + suite**

Run: `node --check js/admin-bot-analytics.js && node --test tests/*.test.mjs` → OK y verde. (El `lucide.createIcons()` del admin pinta los iconos smile/meh/frown.)

- [ ] **Step 6: Commit**

```bash
git add js/admin-bot-analytics.js
git commit -m "feat(bolbot): header con 2 barras + resolución con ambiguas + sentimiento; qué atender priorizado"
```

---

### Task 3: Drill-down + filtro de categoría en el explorador

Añade `category` al estado del explorador y el mecanismo de drill: clic en cualquier `.bot-drill` → fija los filtros (reemplazando), re-renderiza el explorador, muestra chips removibles y hace auto-scroll a `#bot-explorer`.

**Files:**
- Modify: `js/admin-bot-analytics.js` (dentro de `wireExplorer` y `renderExplorer`)

**Interfaces:**
- Consumes: `fetchBotConversations(from, to, {status, sentiment, lifecycle, category, search, limit})` (ya soporta `category`).

- [ ] **Step 1: Estado con `category` + resumen como chips removibles**

En `wireExplorer`, cambia `const state = { estado:'', sent:'', life:'', search:'' }` por `{ estado:'', sent:'', life:'', category:'', search:'' }`. En `refresh`, añade `if (state.category) filters.category = state.category`. Reemplaza el texto plano de `summaryEl` por chips removibles: por cada entrada activa de `state`, un chip `<button class="bot-active-chip" data-clear="<key>">valor ✕</button>`; clic en un chip limpia esa clave y `refresh()`. Muéstralos en `#bot-filter-summary` (o un contenedor nuevo dentro del head del explorador).

- [ ] **Step 2: Aplicar drill y re-sincronizar los chips de filtro**

Extrae la lógica de fijar estado a una función local `applyFilters(partial, { replace })`: si `replace`, resetea `state` a `{estado:'',sent:'',life:'',category:'',search:''}` y luego aplica `partial`; re-sincroniza el resaltado de los `.bot-fchip` (para estado/sent/life) según el nuevo estado; llama `refresh()`. La función existente de clic en chips pasa a llamar `applyFilters({ [group]: val }, { replace:false })`.

- [ ] **Step 3: Cablear los `.bot-drill`**

En `wireExplorer` (o en `renderBotAnalytics` tras `wireExplorer`), añade:

```javascript
  el.querySelectorAll('.bot-drill').forEach(node => {
    node.addEventListener('click', ev => {
      if (ev.target.closest('[data-gap-cat],[data-edit-cat]')) return
      let partial
      try { partial = JSON.parse(node.getAttribute('data-drill') || '{}') } catch { partial = {} }
      applyFilters(partial, { replace: true })
      if (body.classList.contains('hidden')) { body.classList.remove('hidden'); toggle.textContent = 'Filtros ▴' }
      el.querySelector('#bot-explorer')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  })
```

Y en los botones de acción (`[data-gap-cat]`/`[data-edit-cat]`) añade `ev.stopPropagation()` para que la acción no dispare también el drill de la fila.

(Nota de scope: `applyFilters` y los `.bot-drill` viven en el closure de `wireExplorer` donde están `state`, `refresh`, `body`, `toggle`. Si el header/atención se montan fuera de ese scope, exponer `applyFilters`+scroll vía una referencia en `el` o reordenar para que `wireExplorer` cablee todo el `el`.)

- [ ] **Step 4: Verificar sintaxis + suite + navegador**

Run: `node --check js/admin-bot-analytics.js && node --test tests/*.test.mjs` → OK y verde.
Navegador (preview + login admin): Analytics → BoldBot POS. Clic en "escaló" del header → el explorador se abre, filtra por Cierre=Escaló, aparece el chip removible, y hace scroll. Clic en una carita → filtra sentimiento. Clic en una fila de "qué atender" → filtra por categoría; el botón de acción (Crear/Revisar) abre la lección sin disparar el drill. El chip ✕ limpia el filtro.

- [ ] **Step 5: Commit**

```bash
git add js/admin-bot-analytics.js
git commit -m "feat(bolbot): drill-down de métricas al explorador (reemplaza filtros, scroll, chips) + filtro categoría"
```

---

### Task 4: Renombrar la pestaña a "BoldBot POS"

**Files:**
- Modify: `js/analytics-shell.js`

**Interfaces:**
- Consumes: `LABELS` en `analytics-shell.js`.

- [ ] **Step 1: Cambiar la etiqueta**

En `js/analytics-shell.js`, en `const LABELS = { resumen: 'Resumen', lecciones: 'Lecciones', bolbot: 'BolBot' }`, cambia `bolbot: 'BolBot'` por `bolbot: 'BoldBot POS'`. No cambies la clave `'bolbot'` ni el orden de `ANALYTICS_TABS`.

- [ ] **Step 2: Verificar + commit**

Run: `node --check js/analytics-shell.js && node --test tests/*.test.mjs` → OK.

```bash
git add js/analytics-shell.js
git commit -m "feat(analytics): la pestaña del bot se llama 'BoldBot POS'"
```

---

## Cierre del sub-proyecto

La pestaña BoldBot POS queda con el header claro (2 barras que cierran a 100, resolución con ambiguas explícitas, sentimiento con caritas), una lista priorizada de "qué atender", y drill-down desde cada métrica al explorador (que gana filtro de categoría y chips removibles). Se conservan dudas por categoría, heatmap (informativo) y explorador. Sin tocar backend.

## Self-review (cobertura del spec)

- Header 2 barras que cierran a 100 (bot/soporte + cerró/abandonó/escaló) → Task 2.
- Resolución real con ambiguas explícitas y clicables → Task 2 (render) + Task 3 (drill).
- Sentimiento con caritas + % clicables → Task 2 + Task 3.
- "Qué atender ahora" lista priorizada con acción → Task 1 (rankAttention) + Task 2 (render) + botones acción reutilizando el puente existente.
- Drill-down reemplaza filtros, auto-scroll, chips removibles → Task 3; barra 1 informativa (documentado).
- Filtro de categoría en el explorador (la RPC ya lo soporta) → Task 3.
- Heatmap informativo, dudas por categoría y explorador conservados → sin cambios (salvo que las filas de categoría reciben `data-drill`, Task 2/3).
- Pestaña "BoldBot POS" → Task 4.
- Todo respeta el picker de fechas existente → sin cambios (ya scopea la vista).
