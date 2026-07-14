# Verticales Retail/Restaurantes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar las lecciones del Centro de Ayuda por vertical (Retail/Restaurantes) y plataforma (Web/Mobile), con selector en el portal, rediseño del admin de lecciones, y metadatos para el bot.

**Architecture:** Sitio estático (HTML + ES modules sin bundler) sobre Supabase. Se agregan columnas `vertical` y `plataforma` a `lecciones`, un módulo compartido `js/vertical.js` (metadatos, persistencia de selección, filtrado puro), selector de tarjetas+chips en `js/lessons.js`, filtro+badges+formulario nuevo en `js/admin.js`, y el payload del webhook del bot en `js/assistant.js` gana `vertical`/`plataforma`.

**Tech Stack:** JavaScript vanilla (ES modules), Tailwind con CSS vars (`--blue-100` etc.), lucide (global `lucide.createIcons()`, cargado en `index.html` y `admin.html`), Supabase JS v2, `node --test` para tests.

## Global Constraints

- Spec aprobado: `docs/superpowers/specs/2026-07-13-verticales-retail-restaurantes-design.md`.
- Copy de UI en español; código y commits siguen el estilo del repo (mensajes `feat(...)`/`fix(...)` en español).
- Sin dependencias nuevas ni bundler; los módulos se importan por ruta relativa.
- Valores exactos: `vertical ∈ {'retail','restaurantes'}` (default `'retail'`), `plataforma ∈ {'web','mobile'}` (default `'web'`). Claves de storage: `bold_vertical`, `bold_plataforma`.
- Iconos: lucide `store` (Retail) y `utensils` (Restaurantes), monocromos (heredan color).
- La columna `lecciones.dispositivo` deja de leerse/escribirse pero NO se elimina.
- **Orden de despliegue:** la migración SQL (Task 1) debe ejecutarse en Supabase ANTES de desplegar el frontend a producción. Las columnas nuevas no rompen el código viejo.
- Tests: `node --test tests/<archivo>.test.mjs` (patrón de `tests/storage.test.mjs`: importar el módulo con `?caso=N` para invalidar el caché de import).

---

### Task 1: Migración SQL — columnas `vertical` y `plataforma`

**Files:**
- Create: `supabase/migrations/add_vertical_plataforma_lecciones.sql`

**Interfaces:**
- Produces: columnas `lecciones.vertical text` y `lecciones.plataforma text` que todas las tareas posteriores leen/escriben.

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- Verticales de producto: cada lección pertenece a una vertical
-- (retail / restaurantes) y una plataforma (web / mobile).
-- Reemplaza en el código a la columna "dispositivo", que queda deprecada
-- (no se borra hasta que el equipo termine de reclasificar).
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase,
-- ANTES de desplegar el frontend que usa estas columnas.
alter table public.lecciones
  add column if not exists vertical text not null default 'retail'
    check (vertical in ('retail', 'restaurantes')),
  add column if not exists plataforma text not null default 'web'
    check (plataforma in ('web', 'mobile'));

-- Backfill desde dispositivo: web→web; app y datafono→mobile.
-- Vertical: todo el contenido existente es de Retail.
update public.lecciones
  set plataforma = case dispositivo when 'web' then 'web' else 'mobile' end;

-- Control: debe devolver 0 filas
select id, titulo from public.lecciones
  where vertical is null or plataforma is null;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/add_vertical_plataforma_lecciones.sql
git commit -m "feat(db): columnas vertical y plataforma en lecciones con backfill desde dispositivo"
```

- [ ] **Step 3: Pedir al usuario que ejecute la migración**

Pausa manual: pedir al usuario que corra el SQL en el SQL Editor de Supabase y confirme que la query de control devuelve 0 filas. No continuar con Tasks 4–6 hasta que confirme (Tasks 2–3 pueden avanzar en paralelo porque no escriben en la BD).

---

### Task 2: Módulo compartido `js/vertical.js` (TDD)

**Files:**
- Create: `js/vertical.js`
- Test: `tests/vertical.test.mjs`

**Interfaces:**
- Consumes: `storageGet`, `storageSet` de `js/storage.js` (ya existen; fallback a Map en Node).
- Produces (usado por Tasks 3, 5 y 6):
  - `VERTICALES: [{ key:'retail', label:'Retail', icon:'store' }, { key:'restaurantes', label:'Restaurantes', icon:'utensils' }]`
  - `PLATAFORMAS: [{ key:'web', label:'Web' }, { key:'mobile', label:'Mobile' }]`
  - `getSeleccion(): { vertical, plataforma }` — lee storage, valores inválidos/ausentes caen al default retail/web.
  - `setSeleccion({ vertical?, plataforma? })` — persiste solo claves válidas; ignora valores inválidos.
  - `filtrarPorSeleccion(lecciones, { vertical, plataforma })` — filtro puro; lecciones sin campos cuentan como retail/web.
  - `etiqueta(l): { icon, texto }` — p. ej. `{ icon:'store', texto:'Retail · Mobile' }` para badges.

- [ ] **Step 1: Escribir los tests que fallan**

```js
// tests/vertical.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'

// Cada test importa con ?caso=N para obtener módulo (y storage) frescos.

test('getSeleccion: defaults retail + web', async () => {
  const v = await import('../js/vertical.js?caso=1')
  assert.deepEqual(v.getSeleccion(), { vertical: 'retail', plataforma: 'web' })
})

test('setSeleccion persiste valores válidos', async () => {
  const v = await import('../js/vertical.js?caso=2')
  v.setSeleccion({ vertical: 'restaurantes', plataforma: 'mobile' })
  assert.deepEqual(v.getSeleccion(), { vertical: 'restaurantes', plataforma: 'mobile' })
})

test('setSeleccion ignora valores inválidos', async () => {
  const v = await import('../js/vertical.js?caso=3')
  v.setSeleccion({ vertical: 'restaurantes' })
  v.setSeleccion({ vertical: 'xxx', plataforma: 'yyy' })
  assert.deepEqual(v.getSeleccion(), { vertical: 'restaurantes', plataforma: 'web' })
})

test('filtrarPorSeleccion filtra y aplica defaults a lecciones viejas', async () => {
  const v = await import('../js/vertical.js?caso=4')
  const L = [
    { id: 1, vertical: 'retail', plataforma: 'web' },
    { id: 2, vertical: 'retail', plataforma: 'mobile' },
    { id: 3, vertical: 'restaurantes', plataforma: 'web' },
    { id: 4 }, // sin campos → retail/web
  ]
  assert.deepEqual(
    v.filtrarPorSeleccion(L, { vertical: 'retail', plataforma: 'web' }).map(l => l.id),
    [1, 4])
  assert.deepEqual(
    v.filtrarPorSeleccion(L, { vertical: 'restaurantes', plataforma: 'mobile' }).map(l => l.id),
    [])
})

test('etiqueta arma icono y texto del badge', async () => {
  const v = await import('../js/vertical.js?caso=5')
  assert.deepEqual(v.etiqueta({ vertical: 'restaurantes', plataforma: 'mobile' }),
    { icon: 'utensils', texto: 'Restaurantes · Mobile' })
  assert.deepEqual(v.etiqueta({}), { icon: 'store', texto: 'Retail · Web' })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `node --test tests/vertical.test.mjs`
Expected: FAIL (Cannot find module '../js/vertical.js')

- [ ] **Step 3: Implementar `js/vertical.js`**

```js
// Verticales de producto y plataforma: metadatos, selección persistida y
// filtrado. Compartido por portal (lessons.js), admin y bot (assistant.js).
import { storageGet, storageSet } from './storage.js'

export const VERTICALES = [
  { key: 'retail',       label: 'Retail',       icon: 'store' },
  { key: 'restaurantes', label: 'Restaurantes', icon: 'utensils' },
]

export const PLATAFORMAS = [
  { key: 'web',    label: 'Web' },
  { key: 'mobile', label: 'Mobile' },
]

const V_KEYS = VERTICALES.map(v => v.key)
const P_KEYS = PLATAFORMAS.map(p => p.key)

export function getSeleccion() {
  const v = storageGet('bold_vertical')
  const p = storageGet('bold_plataforma')
  return {
    vertical:   V_KEYS.includes(v) ? v : 'retail',
    plataforma: P_KEYS.includes(p) ? p : 'web',
  }
}

export function setSeleccion({ vertical, plataforma } = {}) {
  if (V_KEYS.includes(vertical))   storageSet('bold_vertical', vertical)
  if (P_KEYS.includes(plataforma)) storageSet('bold_plataforma', plataforma)
}

export function filtrarPorSeleccion(lecciones, { vertical, plataforma }) {
  return (lecciones || []).filter(l =>
    (l.vertical || 'retail') === vertical &&
    (l.plataforma || 'web') === plataforma)
}

export function etiqueta(l) {
  const v = VERTICALES.find(x => x.key === (l.vertical || 'retail')) || VERTICALES[0]
  const p = PLATAFORMAS.find(x => x.key === (l.plataforma || 'web')) || PLATAFORMAS[0]
  return { icon: v.icon, texto: `${v.label} · ${p.label}` }
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `node --test tests/vertical.test.mjs`
Expected: PASS (5 tests)

- [ ] **Step 5: Correr la suite completa para no romper nada**

Run: `node --test tests/`
Expected: PASS (los tests de storage existentes siguen verdes)

- [ ] **Step 6: Commit**

```bash
git add js/vertical.js tests/vertical.test.mjs
git commit -m "feat(verticales): módulo compartido de selección y filtrado retail/restaurantes"
```

---

### Task 3: Portal del estudiante — selector y filtrado en `js/lessons.js`

**Files:**
- Modify: `js/lessons.js` (función `renderLessons`, ~líneas 22–60, 425–450)

**Interfaces:**
- Consumes: `VERTICALES`, `PLATAFORMAS`, `getSeleccion`, `setSeleccion`, `filtrarPorSeleccion` de `js/vertical.js` (Task 2).
- Produces: nada consumido por otras tareas (UI final).

- [ ] **Step 1: Importar el módulo y separar lecciones crudas de filtradas**

En el encabezado de `js/lessons.js` agregar:

```js
import { VERTICALES, PLATAFORMAS, getSeleccion, setSeleccion, filtrarPorSeleccion } from './vertical.js'
```

Dentro de `renderLessons()`, reemplazar:

```js
  let lessons = lessonsRes.data || []
  const error = lessonsRes.error
```

por:

```js
  let allLessons = lessonsRes.data || []
  let sel = getSeleccion()
  let lessons = filtrarPorSeleccion(allLessons, sel)
  const error = lessonsRes.error
```

y reemplazar el early-return de vacío (que hoy usa `lessons`):

```js
  if (error || !lessons?.length) {
```

por (solo aborta si no hay NINGUNA lección; el vacío por combinación se maneja en Step 4):

```js
  if (error || !allLessons.length) {
```

- [ ] **Step 2: Extraer `rebuildGrouped()` y usarla en carga y refresh**

Reemplazar el bloque "Group by category" (líneas ~43–49):

```js
  const grouped = {}
  for (const cat of CATEGORIES) grouped[cat.key] = []
  for (const l of lessons) {
    const cat = l.categoria || CATEGORIES[0]?.key || 'General'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(l)
  }
```

por:

```js
  const grouped = {}
  function rebuildGrouped() {
    for (const key of Object.keys(grouped)) delete grouped[key]
    for (const cat of CATEGORIES) grouped[cat.key] = []
    for (const l of lessons) {
      const cat = l.categoria || CATEGORIES[0]?.key || 'General'
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(l)
    }
  }
  rebuildGrouped()
```

En `refreshLessons()` (realtime), reemplazar:

```js
    lessons = freshLessons

    // Rebuild grouped in-place (keeps CATEGORIES reference intact)
    for (const key of Object.keys(grouped)) delete grouped[key]
    for (const cat of CATEGORIES) grouped[cat.key] = []
    for (const l of lessons) {
      const cat = l.categoria || CATEGORIES[0]?.key || 'General'
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(l)
    }
```

por:

```js
    allLessons = freshLessons
    lessons = filtrarPorSeleccion(allLessons, sel)
    rebuildGrouped()
```

- [ ] **Step 3: Insertar el selector (tarjetas + chips) en ambos layouts**

Agregar dentro de `renderLessons()`, después de `rebuildGrouped()`, el generador de markup:

```js
  // Selector de vertical (tarjetas con icono) + plataforma (chips).
  // Mismo markup en móvil y desktop; se regenera al cambiar la selección.
  function selectorHtml() {
    return `
      <div class="px-3 pt-3 pb-2 border-b border-[var(--blue-10)] bg-white">
        <div class="flex gap-2">
          ${VERTICALES.map(v => `
            <button data-vertical="${v.key}"
              class="sel-vertical flex-1 rounded-xl border-[1.5px] px-2 py-2 text-center transition-colors ${v.key === sel.vertical
                ? 'border-[var(--blue-100)] bg-[var(--blue-10)] text-[var(--blue-100)]'
                : 'border-[var(--blue-20)] text-[var(--black-60)] hover:border-[var(--blue-100)]'}">
              <i data-lucide="${v.icon}" class="w-4 h-4 mx-auto mb-0.5"></i>
              <span class="block text-[11px] font-black">${v.label}</span>
            </button>`).join('')}
        </div>
        <div class="flex gap-2 mt-2">
          ${PLATAFORMAS.map(p => `
            <button data-plataforma="${p.key}"
              class="sel-plataforma px-4 py-1 rounded-full text-[11px] font-bold border transition-colors ${p.key === sel.plataforma
                ? 'bg-[var(--blue-100)] border-[var(--blue-100)] text-white'
                : 'border-[var(--blue-20)] text-[var(--black-60)] hover:border-[var(--blue-100)]'}">${p.label}</button>`).join('')}
        </div>
      </div>`
  }
```

En el template de `container.innerHTML`, agregar contenedores vacíos:

- **Móvil**: dentro de `#ls-screen-categories`, entre el header ("Centro de Ayuda") y la búsqueda global, insertar `<div id="ls-selector-mob"></div>`.
- **Desktop**: dentro del sidebar (`.w-48`), ANTES del div de búsqueda (`.p-2.5`), insertar `<div id="ls-selector-desk"></div>`.

- [ ] **Step 4: Cablear el selector y el re-render completo**

Agregar después de la definición de `renderMobileCatList` (para que todas las funciones ya existan):

```js
  // Estado vacío por combinación: mensaje + salto a la otra plataforma.
  function emptyStateHtml() {
    const otra = PLATAFORMAS.find(p => p.key !== sel.plataforma)
    const vLabel = VERTICALES.find(v => v.key === sel.vertical)?.label || ''
    return `
      <div class="flex flex-col items-center justify-center py-14 px-4 text-center">
        <p class="font-bold text-sm text-[var(--black-100)] mb-1">Aún no hay lecciones aquí</p>
        <p class="text-xs text-[var(--black-60)] mb-4">Estamos preparando el contenido de ${escapeHtml(vLabel)} para ${escapeHtml(sel.plataforma === 'web' ? 'Web' : 'la app móvil')}.</p>
        <button data-goto-plataforma="${otra.key}" class="px-4 py-2 rounded-full bg-[var(--blue-100)] text-white text-xs font-bold">Ver lecciones de ${otra.label}</button>
      </div>`
  }

  function renderSelectors() {
    for (const id of ['ls-selector-mob', 'ls-selector-desk']) {
      const el = document.getElementById(id)
      if (!el) continue
      el.innerHTML = selectorHtml()
      el.querySelectorAll('.sel-vertical').forEach(b =>
        b.addEventListener('click', () => applySeleccion({ vertical: b.dataset.vertical })))
      el.querySelectorAll('.sel-plataforma').forEach(b =>
        b.addEventListener('click', () => applySeleccion({ plataforma: b.dataset.plataforma })))
    }
    if (window.lucide) lucide.createIcons()
  }

  function applySeleccion(cambio) {
    setSeleccion(cambio)
    sel = getSeleccion()
    lessons = filtrarPorSeleccion(allLessons, sel)
    rebuildGrouped()
    activeLesson = null
    activeCategory = CATEGORIES.find(c => grouped[c.key]?.length > 0)?.key || CATEGORIES[0]?.key
    openCats.clear()
    if (activeCategory) openCats.add(activeCategory)
    renderSelectors()
    renderAccordion()
    renderMobileCatList()
    renderDeskContent()
    showScreen('categories')
    track('vertical_change', { vertical: sel.vertical, plataforma: sel.plataforma })
  }
```

En `renderAccordion()`, al inicio, agregar el manejo de vacío:

```js
    if (!lessons.length) {
      accordion.innerHTML = emptyStateHtml()
      accordion.querySelector('[data-goto-plataforma]')?.addEventListener('click', e =>
        applySeleccion({ plataforma: e.currentTarget.dataset.gotoPlataforma }))
      return
    }
```

En `renderMobileCatList()`, después de `list.innerHTML = ''`, agregar lo mismo:

```js
    if (!lessons.length) {
      list.innerHTML = emptyStateHtml()
      list.querySelector('[data-goto-plataforma]')?.addEventListener('click', e =>
        applySeleccion({ plataforma: e.currentTarget.dataset.gotoPlataforma }))
      return
    }
```

Al final de la inicialización (donde hoy se llama `renderAccordion()` / `renderMobileCatList()` por primera vez), agregar `renderSelectors()` antes de esas llamadas. Si el `activeLesson` inicial se calculó sobre la lista sin filtrar, ahora sale de `grouped` ya filtrado (no requiere cambio adicional: `grouped[firstCat]?.[0]` ya usa la lista filtrada).

- [ ] **Step 5: Analytics con vertical/plataforma**

- `track('page_view', { page: 'lessons' })` → `track('page_view', { page: 'lessons', ...sel })`
- En `renderLessonContent`, `track('lesson_open', { lesson_id: ..., lesson_title: ..., category: ... })` → agregar `, ...sel` al payload.

- [ ] **Step 6: Verificación manual en el navegador**

Servir el sitio (p. ej. `npx serve .` o Live Server) y comprobar:
- Desktop: selector visible sobre la búsqueda del sidebar; cambiar vertical/plataforma refiltra categorías y lecciones; recargar conserva la selección.
- Móvil (viewport estrecho): selector en la pantalla de categorías; navegación 3 pantallas intacta.
- Combinación sin lecciones (p. ej. Restaurantes·Mobile antes de reclasificar): estado vacío con botón que salta a la otra plataforma.
- Búsqueda (global móvil y desktop) solo devuelve lecciones de la combinación activa.
- Consola sin errores.

- [ ] **Step 7: Commit**

```bash
git add js/lessons.js
git commit -m "feat(portal): selector Retail/Restaurantes × Web/Mobile en Centro de Ayuda"
```

---

### Task 4: Admin — formulario con toggle de vertical y chips de plataforma

**Files:**
- Modify: `js/admin.js` (markup del modal ~líneas 332–340, `openLessonForm` ~línea 814, payload de guardado ~línea 533)

**Interfaces:**
- Consumes: nada de otros módulos (admin.js maneja su propio estado DOM).
- Produces: helpers `setChoice(containerId, value)` y `getChoice(containerId)` reutilizados en este mismo archivo; escribe `vertical`/`plataforma` en la BD (leídos por Tasks 3 y 6).

- [ ] **Step 1: Reemplazar el select «Dispositivo» en el markup del modal**

Reemplazar el bloque:

```html
              <div>
                <label class="block text-[9px] font-black uppercase tracking-widest text-[var(--black-40)] mb-1">Dispositivo</label>
                <select id="lessonDispositivo"
                  class="w-full px-3 py-2.5 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)] bg-white">
                  <option value="web">Web</option>
                  <option value="app">App</option>
                  <option value="datafono">Datáfono</option>
                </select>
              </div>
```

por:

```html
              <div>
                <label class="block text-[9px] font-black uppercase tracking-widest text-[var(--black-40)] mb-1">Vertical</label>
                <div id="lessonVertical" class="flex gap-2">
                  <button type="button" data-value="retail" class="choice-opt flex-1 rounded-xl border-[1.5px] border-[var(--blue-20)] px-2 py-2 text-center text-[var(--black-60)] transition-colors">
                    <i data-lucide="store" class="w-4 h-4 mx-auto mb-0.5"></i>
                    <span class="block text-[11px] font-black">Retail</span>
                  </button>
                  <button type="button" data-value="restaurantes" class="choice-opt flex-1 rounded-xl border-[1.5px] border-[var(--blue-20)] px-2 py-2 text-center text-[var(--black-60)] transition-colors">
                    <i data-lucide="utensils" class="w-4 h-4 mx-auto mb-0.5"></i>
                    <span class="block text-[11px] font-black">Restaurantes</span>
                  </button>
                </div>
              </div>
              <div>
                <label class="block text-[9px] font-black uppercase tracking-widest text-[var(--black-40)] mb-1">Plataforma</label>
                <div id="lessonPlataforma" class="flex gap-2">
                  <button type="button" data-value="web" class="choice-opt px-4 py-1.5 rounded-full text-xs font-bold border border-[var(--blue-20)] text-[var(--black-60)] transition-colors">Web</button>
                  <button type="button" data-value="mobile" class="choice-opt px-4 py-1.5 rounded-full text-xs font-bold border border-[var(--blue-20)] text-[var(--black-60)] transition-colors">Mobile</button>
                </div>
              </div>
```

- [ ] **Step 2: Agregar helpers de grupo de opciones**

Agregar junto a los demás helpers de admin.js (p. ej. antes de `openLessonForm`):

```js
// Grupo de botones tipo radio: marca data-selected y estilos activos.
function setChoice(containerId, value) {
  const cont = document.getElementById(containerId)
  if (!cont) return
  cont.querySelectorAll('button').forEach(b => {
    const on = b.dataset.value === value
    b.dataset.selected = on ? 'true' : 'false'
    b.classList.toggle('border-[var(--blue-100)]', on)
    b.classList.toggle('bg-[var(--blue-10)]', on)
    b.classList.toggle('text-[var(--blue-100)]', on)
    b.classList.toggle('border-[var(--blue-20)]', !on)
    b.classList.toggle('text-[var(--black-60)]', !on)
  })
}

function getChoice(containerId) {
  return document.getElementById(containerId)
    ?.querySelector('button[data-selected="true"]')?.dataset.value
}
```

En el bloque donde se cablean los botones del modal (mismo lugar donde se registra `saveLessonBtn`, dentro de `renderLessonsPanel`), agregar:

```js
  document.querySelectorAll('#lessonVertical button, #lessonPlataforma button').forEach(b => {
    b.addEventListener('click', () => setChoice(b.parentElement.id, b.dataset.value))
  })
```

- [ ] **Step 3: Poblar y guardar los campos nuevos**

En `openLessonForm`, reemplazar:

```js
  document.getElementById('lessonDispositivo').value = lesson?.dispositivo || 'web'
```

por:

```js
  setChoice('lessonVertical', lesson?.vertical || 'retail')
  setChoice('lessonPlataforma', lesson?.plataforma || 'web')
```

En el payload de guardado (`saveLessonBtn`), reemplazar:

```js
      dispositivo: document.getElementById('lessonDispositivo').value || 'web',
```

por:

```js
      vertical: getChoice('lessonVertical') || 'retail',
      plataforma: getChoice('lessonPlataforma') || 'web',
```

- [ ] **Step 4: Verificación manual**

En `/admin` (requiere la migración de Task 1 ya ejecutada):
- Crear una lección de prueba con Restaurantes + Mobile; verificar en Supabase (Table Editor) que `vertical='restaurantes'`, `plataforma='mobile'` y que `dispositivo` quedó con su default sin errores.
- Editar una lección existente: el toggle refleja sus valores; guardar sin tocar nada no los cambia.
- Los iconos `store`/`utensils` se ven (lucide.createIcons se llama tras render del panel).
- Borrar la lección de prueba.

- [ ] **Step 5: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): toggle de vertical y selector de plataforma en formulario de lección"
```

---

### Task 5: Admin — barra de filtro y badges en tarjetas

**Files:**
- Modify: `js/admin.js` (`renderLessonsPanel` markup ~líneas 235–262, `renderGroupedLessons` ~línea 555, `lessonCardHtml` ~línea 641, `lessonCardGridHtml` ~línea 673)

**Interfaces:**
- Consumes: helpers `setChoice`/`getChoice` NO se usan aquí (estado propio); columnas `vertical`/`plataforma` (Task 1).
- Produces: variables de módulo `adminVertical` (`'retail'|'restaurantes'`) y `adminPlataforma` (`'all'|'web'|'mobile'`).

- [ ] **Step 1: Estado de filtro y barra de filtros**

Junto a la declaración existente de `lessonListView` (variable de módulo), agregar:

```js
let adminVertical = 'retail'      // filtro de vertical del panel de lecciones
let adminPlataforma = 'all'       // 'all' | 'web' | 'mobile'
```

En el template de `renderLessonsPanel`, después del div de búsqueda + toggle lista/cuadrícula (el `<div class="flex items-center gap-3 mb-4">`), insertar:

```html
    <div class="flex items-center gap-2 mb-4 flex-wrap">
      <div class="flex gap-1.5">
        <button data-adm-vertical="retail" class="adm-vertical flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-[1.5px] text-xs font-bold transition-colors">
          <i data-lucide="store" class="w-3.5 h-3.5"></i> Retail
        </button>
        <button data-adm-vertical="restaurantes" class="adm-vertical flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-[1.5px] text-xs font-bold transition-colors">
          <i data-lucide="utensils" class="w-3.5 h-3.5"></i> Restaurantes
        </button>
      </div>
      <div class="w-px h-5 bg-[var(--blue-20)]"></div>
      <div class="flex gap-1.5">
        <button data-adm-plataforma="all" class="adm-plataforma px-3 py-1.5 rounded-full border text-xs font-bold transition-colors">Todas</button>
        <button data-adm-plataforma="web" class="adm-plataforma px-3 py-1.5 rounded-full border text-xs font-bold transition-colors">Web</button>
        <button data-adm-plataforma="mobile" class="adm-plataforma px-3 py-1.5 rounded-full border text-xs font-bold transition-colors">Mobile</button>
      </div>
    </div>
```

Y en el cableado de `renderLessonsPanel` (junto a los listeners de búsqueda), agregar:

```js
  function paintAdminFilters() {
    el.querySelectorAll('.adm-vertical').forEach(b => {
      const on = b.dataset.admVertical === adminVertical
      b.classList.toggle('border-[var(--blue-100)]', on)
      b.classList.toggle('bg-[var(--blue-10)]', on)
      b.classList.toggle('text-[var(--blue-100)]', on)
      b.classList.toggle('border-[var(--blue-20)]', !on)
      b.classList.toggle('text-[var(--black-60)]', !on)
    })
    el.querySelectorAll('.adm-plataforma').forEach(b => {
      const on = b.dataset.admPlataforma === adminPlataforma
      b.classList.toggle('bg-[var(--blue-100)]', on)
      b.classList.toggle('border-[var(--blue-100)]', on)
      b.classList.toggle('text-white', on)
      b.classList.toggle('border-[var(--blue-20)]', !on)
      b.classList.toggle('text-[var(--black-60)]', !on)
    })
  }
  paintAdminFilters()
  el.querySelectorAll('.adm-vertical').forEach(b => b.addEventListener('click', () => {
    adminVertical = b.dataset.admVertical
    paintAdminFilters()
    renderGroupedLessons(allLessons, document.getElementById('lessonSearch')?.value || '')
  }))
  el.querySelectorAll('.adm-plataforma').forEach(b => b.addEventListener('click', () => {
    adminPlataforma = b.dataset.admPlataforma
    paintAdminFilters()
    renderGroupedLessons(allLessons, document.getElementById('lessonSearch')?.value || '')
  }))
```

(`allLessons` ya existe en el scope de `renderLessonsPanel`; verificar cómo se invoca hoy `renderGroupedLessons` desde la búsqueda y usar la misma forma.)

- [ ] **Step 2: Aplicar el filtro en `renderGroupedLessons`**

Al inicio de `renderGroupedLessons(allLessons, searchQuery)`, antes del filtro de búsqueda, agregar:

```js
  const porVertical = allLessons.filter(l =>
    (l.vertical || 'retail') === adminVertical &&
    (adminPlataforma === 'all' || (l.plataforma || 'web') === adminPlataforma))
```

y usar `porVertical` en lugar de `allLessons` en el resto de la función (el filtro de búsqueda pasa a filtrar `porVertical`). Ajustar el estado vacío existente para el caso "hay lecciones pero no en este filtro":

```js
  if (!filtered.length && !q) {
    list.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <i data-lucide="filter-x" class="w-10 h-10 text-[var(--black-40)] mb-3"></i>
        <p class="font-bold text-[var(--black-60)] mb-1">Sin lecciones en este filtro</p>
        <p class="text-xs text-[var(--black-40)]">Cambia de vertical o plataforma, o crea una lección nueva.</p>
      </div>`
    lucide.createIcons()
    return
  }
```

(Colocarlo junto al early-return de "Sin resultados" de búsqueda que ya existe; el empty state global de "Aún no hay lecciones" solo debe aparecer cuando `allLessons` está vacío de verdad.)

- [ ] **Step 3: Badges de vertical·plataforma en las tarjetas**

En `lessonCardHtml(l)`, después del span `#${l.orden}`, agregar:

```html
          <span class="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold text-[var(--black-40)] bg-[var(--background-page)] px-1.5 py-0.5 rounded-full">
            <i data-lucide="${(l.vertical || 'retail') === 'retail' ? 'store' : 'utensils'}" class="w-3 h-3"></i>
            ${(l.vertical || 'retail') === 'retail' ? 'Retail' : 'Restaurantes'} · ${(l.plataforma || 'web') === 'web' ? 'Web' : 'Mobile'}
          </span>
```

En `lessonCardGridHtml(l)`, junto al chip de categoría (`${cat ? ... : ''}`), agregar el mismo span (idéntico markup).

- [ ] **Step 4: Verificación manual**

En `/admin`:
- Por defecto se ve Retail + Todas; los contadores de categorías reflejan el filtro.
- Cambiar a Restaurantes muestra el estado vacío del filtro (antes de reclasificar lecciones).
- Buscar con filtro activo combina ambos.
- Badges visibles en vista lista y cuadrícula; drag & drop de orden sigue funcionando dentro del filtro.

- [ ] **Step 5: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): filtro por vertical/plataforma y badges en lecciones"
```

---

### Task 6: Bot — payload del webhook y RPC `match_lessons`

**Files:**
- Modify: `js/assistant.js` (import + línea ~614)
- Create: `supabase/migrations/update_match_lessons_vertical.sql`

**Interfaces:**
- Consumes: `getSeleccion` de `js/vertical.js` (Task 2); columnas de Task 1.
- Produces: el webhook de n8n recibe `vertical` y `plataforma`; `match_lessons` acepta `p_vertical`/`p_plataforma` y devuelve ambas columnas.

- [ ] **Step 1: Enviar la selección del estudiante al webhook**

En `js/assistant.js` agregar el import:

```js
import { getSeleccion } from './vertical.js'
```

y reemplazar:

```js
      body: JSON.stringify({ message: text, history, faq_context: cachedFaqs })
```

por:

```js
      body: JSON.stringify({ message: text, history, faq_context: cachedFaqs, ...getSeleccion() })
```

- [ ] **Step 2: Obtener la definición actual de `match_lessons`**

La función vive solo en la BD (no está en el repo). Pedir al usuario que corra en el SQL Editor y pegue el resultado:

```sql
select pg_get_functiondef(oid) from pg_proc where proname = 'match_lessons';
```

- [ ] **Step 3: Crear la migración con la función actualizada**

Crear `supabase/migrations/update_match_lessons_vertical.sql` partiendo de la definición real obtenida en Step 2 y aplicando exactamente estos cambios (sin tocar el resto del cuerpo):

1. Agregar al final de la lista de parámetros: `p_vertical text default null, p_plataforma text default null`.
2. Agregar a la cláusula `returns table (...)`: `vertical text, plataforma text`.
3. Agregar al `select` interno las columnas correspondientes de la tabla `lecciones` (con el alias que use la función, p. ej. `l.vertical, l.plataforma`).
4. Agregar al `where` existente (con `and`): `(p_vertical is null or l.vertical = p_vertical) and (p_plataforma is null or l.plataforma = p_plataforma)`.
5. Agregar `set search_path = public` en la cabecera de la función (resuelve de paso el aviso `function_search_path_mutable` del linter).

Encabezar el archivo con el comentario estándar del repo:

```sql
-- match_lessons con vertical/plataforma: devuelve ambas columnas y acepta
-- filtros opcionales p_vertical / p_plataforma (null = sin filtro), para que
-- el bot no mezcle lecciones de verticales o plataformas distintas.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
```

Los defaults `null` garantizan que el workflow actual de n8n (que no manda estos parámetros) siga funcionando igual.

- [ ] **Step 4: Pedir al usuario que ejecute la migración y probar**

Tras ejecutarla, probar en el SQL Editor que la firma vieja sigue viva (el workflow n8n llama sin los parámetros nuevos):

```sql
-- Debe devolver filas con las columnas nuevas vertical y plataforma
select * from match_lessons((select embedding from lecciones where embedding is not null limit 1), 3);
```

(Ajustar los argumentos posicionales a la firma real vista en Step 2.)

- [ ] **Step 5: Nota de coordinación n8n (fuera del repo)**

Registrar como pendiente para el workflow «Bold POS Chat» en n8n.mplasesores.com (tarea manual, no bloquea este plan):
- Leer `vertical`/`plataforma` del body del webhook.
- Pasarlos a la llamada de `match_lessons` (`p_vertical`, `p_plataforma`).
- Mencionar en el prompt del agente la vertical activa del cliente.

- [ ] **Step 6: Commit**

```bash
git add js/assistant.js supabase/migrations/update_match_lessons_vertical.sql
git commit -m "feat(bot): selección vertical/plataforma en webhook y filtros en match_lessons"
```

---

### Task 7: Verificación end-to-end y cierre

**Files:**
- Ninguno nuevo (verificación + push)

- [ ] **Step 1: Suite de tests completa**

Run: `node --test tests/`
Expected: PASS (storage + vertical)

- [ ] **Step 2: Verificación manual completa**

Con la migración ejecutada y sirviendo el sitio local:
1. Portal: cambiar vertical y plataforma, recargar (persistencia), estado vacío, búsqueda filtrada, abrir lección y completar el flujo móvil de 3 pantallas.
2. Admin: filtrar, crear/editar/borrar lección con los controles nuevos, badges correctos en ambas vistas, reordenar con drag & drop.
3. Bot: abrir el chat, mandar un mensaje y verificar en la pestaña Network que el POST al webhook incluye `vertical` y `plataforma`.
4. Analytics: en Supabase, `select payload from analytics_events order by created_at desc limit 5` muestra `vertical`/`plataforma` en `page_view`/`lesson_open`.

- [ ] **Step 3: Push y deploy**

```bash
git push origin sandbox
```

Confirmar con el usuario antes de desplegar a producción (requiere la migración de Task 1 ya ejecutada):

```bash
git push origin sandbox:master
```

El push a `master` dispara el deploy de producción vía la integración GitHub→Vercel. Verificar el estado del deployment y hacer un smoke test en https://academia.localizadoc.com.

---

### Task 8: Visibilidad configurable — helpers en `js/vertical.js` (TDD) [ampliación]

**Files:**
- Modify: `js/vertical.js`
- Test: `tests/vertical.test.mjs` (agregar tests)

**Interfaces:**
- Consumes: `VERTICALES`, `PLATAFORMAS` existentes.
- Produces (funciones puras; `settings` es un objeto `{key: value}` con strings de app_settings; convención: ausente = habilitado, `'false'` = deshabilitado):
  - `plataformasHabilitadas(settings, vertical)` → array de keys de plataformas habilitadas para esa vertical (`plataforma_<v>_<p>_enabled`).
  - `verticalesVisibles(lecciones, settings)` → array de keys de verticales con `vertical_<v>_enabled !== 'false'` Y ≥1 lección en alguna plataforma habilitada.
  - `resolverSeleccion(lecciones, settings, seleccion)` → `{vertical, plataforma}` válida: si la guardada es visible/habilitada se respeta; si no, primera vertical visible + primera plataforma habilitada con lecciones (o la primera habilitada si ninguna tiene). Si no hay verticales visibles devuelve la selección con defaults (el portal mostrará "sin lecciones").

Steps: tests primero (casos: todo habilitado; vertical sin lecciones oculta; vertical deshabilitada por switch; plataforma deshabilitada excluida de chips y del cálculo de visibilidad; fallback de selección inválida), verificar fallo, implementar, 18+N/18+N verde, commit `feat(verticales): helpers de visibilidad configurable por app_settings`.

### Task 9: Portal — selector condicionado por visibilidad [ampliación]

**Files:**
- Modify: `js/lessons.js`

**Interfaces:**
- Consumes: helpers de Task 8; tabla `app_settings` (select key,value, igual que `js/main.js:11`).

Comportamiento: cargar `app_settings` en el `Promise.all` inicial y construir `settings`; `sel = resolverSeleccion(allLessons, settings, getSeleccion())`; `selectorHtml()` renderiza la fila de tarjetas solo si `verticalesVisibles(...).length >= 2` y la fila de chips solo si `plataformasHabilitadas(settings, sel.vertical).length >= 2` (chips = solo plataformas habilitadas); `applySeleccion` re-resuelve con los helpers; `refreshLessons` re-aplica `resolverSeleccion`. Si `live-updates.js` expone la suscripción a `app_settings` con un hook reutilizable, refrescar settings en vivo; si no, documentar que aplica al recargar. Verificación: portal actual (Restaurantes vacía) se ve SIN selector; commit `feat(portal): selector visible solo con verticales/plataformas disponibles`.

### Task 10: Admin — switches de habilitación en la barra de filtro [ampliación]

**Files:**
- Modify: `js/admin.js`

**Interfaces:**
- Consumes: patrón upsert existente `supabase.from('app_settings').upsert({ key, value: String(valor) })` (js/admin.js:2123); claves del spec §6.

Comportamiento: en la barra de filtro del panel Lecciones, cada tarjeta de vertical lleva un switch (estado desde app_settings; ausente = ON) que upsertea `vertical_<v>_enabled`; los chips Web/Mobile llevan switch que upsertea `plataforma_<vertical seleccionada>_<p>_enabled` (el chip "Todas" no lleva). Los switches NO afectan el filtro ni la lista del admin (solo el portal); indicar visualmente OFF (p. ej. opacidad + tooltip "Oculta para estudiantes"). Registrar en logActivity con etiqueta legible. Cargar los settings al render del panel. Commit `feat(admin): switches para habilitar verticales y plataformas del portal`.
