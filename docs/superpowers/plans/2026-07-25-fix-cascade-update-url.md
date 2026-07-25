# Hotfix `cascadeUpdateUrl` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que mover un archivo a una carpeta en el panel de Material deje de vaciar el contenido de las lecciones que referenciaban ese archivo.

**Architecture:** Un módulo puro nuevo `js/content-url.js` decide qué escribir; `cascadeUpdateUrl` queda como orquestador de I/O sin lógica de formato. El helper opera sobre el **string crudo** en vez de sobre la estructura parseada, así un solo camino sirve para los dos formatos que guarda la columna (JSON de bloques y HTML legacy) y ninguna rama puede producir contenido vacío.

**Tech Stack:** JS ES-modules vanilla (sin build), `node:test`.

## Global Constraints

- Rama de trabajo: `sandbox`. Spec: `docs/superpowers/specs/2026-07-25-fix-cascade-update-url-design.md`.
- Estilo del repo: indentación 2 espacios, **sin punto y coma**, comentarios en español.
- `null` es el único valor de "no escribir". El helper **nunca** devuelve `''` ni `'[]'`: o devuelve un string que contiene todo lo que había con la URL cambiada, o `null`.
- El helper es **puro e import-safe en Node**: sin `document`, sin `supabase`, sin efectos en top-level. Es lo que lo hace testeable.
- `js/admin.js` usa `document` y **no** es import-safe en Node → no lleva unit test propio; se verifica con `node --check` más la suite verde.
- Tests: `node --test tests/*.test.mjs`. La suite está en **73** antes de este trabajo. El warning `MODULE_TYPELESS_PACKAGE_JSON` es esperado en todo el repo y **NO** es hallazgo.
- **Sin migraciones.** Se descartó la red de seguridad en base a propósito (ver el spec).

## File Structure

- `js/content-url.js` — **Create:** `remapContentUrl(raw, oldUrl, newUrl)`, la única pieza con lógica de decisión.
- `tests/content-url.test.mjs` — **Create:** unit tests del helper.
- `js/admin.js` — **Modify:** import nuevo (~L1-9) y reescritura de `cascadeUpdateUrl` (L1616-1628).

**Orden obligatorio:** Task 1 → Task 2 (Task 2 importa lo que Task 1 crea).

---

### Task 1: Módulo puro `js/content-url.js` + tests

**Files:**
- Create: `js/content-url.js`
- Test: `tests/content-url.test.mjs`

**Interfaces:**
- Produces: `remapContentUrl(raw, oldUrl, newUrl) => string | null`. `raw` es el `contenido` tal como viene de la base (un **string**; puede ser JSON de un array de bloques o HTML legacy). Devuelve el string a escribir, o `null` para **no escribir la fila**. Consumido por Task 2.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/content-url.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { remapContentUrl } from '../js/content-url.js'

const OLD = 'https://x.supabase.co/storage/v1/object/public/material/foto.png'
const NEW = 'https://x.supabase.co/storage/v1/object/public/material/carpeta/foto.png'

test('formato moderno: cambia la URL y el resultado sigue siendo JSON válido', () => {
  const raw = JSON.stringify([
    { type: 'text', content: 'hola' },
    { type: 'image', url: OLD, caption: 'pie' },
  ])
  const next = remapContentUrl(raw, OLD, NEW)
  const blocks = JSON.parse(next)
  assert.equal(blocks.length, 2)
  assert.equal(blocks[0].content, 'hola')
  assert.equal(blocks[1].url, NEW)
  assert.equal(blocks[1].caption, 'pie')
})

test('reemplaza TODAS las ocurrencias de la URL', () => {
  const raw = JSON.stringify([
    { type: 'image', url: OLD },
    { type: 'image', url: OLD },
  ])
  const blocks = JSON.parse(remapContentUrl(raw, OLD, NEW))
  assert.equal(blocks[0].url, NEW)
  assert.equal(blocks[1].url, NEW)
})

test('formato legacy: arregla la URL dentro del HTML crudo sin perder el resto', () => {
  const raw = `<p>Mirá la foto</p><img src="${OLD}"><p>fin</p>`
  const next = remapContentUrl(raw, OLD, NEW)
  assert.equal(next, `<p>Mirá la foto</p><img src="${NEW}"><p>fin</p>`)
})

test('sin coincidencia: devuelve null y no se toca la fila', () => {
  const raw = JSON.stringify([{ type: 'text', content: 'sin imágenes' }])
  assert.equal(remapContentUrl(raw, OLD, NEW), null)
})

test('entradas degeneradas devuelven null y no lanzan', () => {
  assert.equal(remapContentUrl(null, OLD, NEW), null)
  assert.equal(remapContentUrl(undefined, OLD, NEW), null)
  assert.equal(remapContentUrl('', OLD, NEW), null)
  assert.equal(remapContentUrl(42, OLD, NEW), null)
  assert.equal(remapContentUrl([{ url: OLD }], OLD, NEW), null)
})

test('URLs inválidas devuelven null (no escribe "undefined" en el contenido)', () => {
  const raw = JSON.stringify([{ type: 'image', url: OLD }])
  assert.equal(remapContentUrl(raw, OLD, undefined), null)
  assert.equal(remapContentUrl(raw, OLD, ''), null)
  assert.equal(remapContentUrl(raw, '', NEW), null)
})

test('fail-closed: si el reemplazo invalidaría el JSON, no escribe', () => {
  const raw = JSON.stringify([{ type: 'image', url: OLD }])
  const roto = 'https://x/"; drop--.png'
  assert.equal(remapContentUrl(raw, OLD, roto), null)
})

test('legacy que no es JSON ni antes ni después: sí se escribe', () => {
  const raw = `<img src="${OLD}">`
  const roto = 'https://x/"raro".png'
  assert.equal(remapContentUrl(raw, OLD, roto), `<img src="${roto}">`)
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/content-url.test.mjs`
Expected: FAIL — no existe `js/content-url.js` (error de import, `ERR_MODULE_NOT_FOUND`).

- [ ] **Step 3: Escribir la implementación mínima**

Crear `js/content-url.js`:

```js
// Reemplaza una URL por otra dentro del `contenido` de una lección.
// Import-safe (sin DOM, sin supabase): la I/O vive en admin.js.
//
// La columna `contenido` guarda DOS formatos: un string JSON con el array de
// bloques (el moderno) y HTML crudo escrito a mano (el legacy; ver
// js/lessons.js:178-183). Por eso este helper trabaja sobre el TEXTO CRUDO y no
// sobre la estructura parseada: un solo camino sirve para los dos, y ninguna
// rama puede producir contenido vacío.

function parseaComoJson(s) {
  try {
    JSON.parse(s)
    return true
  } catch (_) {
    return false
  }
}

// Devuelve el contenido nuevo, o null para NO escribir la fila. Nunca devuelve
// vacío: o preserva todo lo que había con la URL cambiada, o null.
export function remapContentUrl(raw, oldUrl, newUrl) {
  if (typeof raw !== 'string' || !raw) return null
  if (typeof oldUrl !== 'string' || !oldUrl) return null
  if (typeof newUrl !== 'string' || !newUrl) return null
  if (!raw.includes(oldUrl)) return null
  const next = raw.split(oldUrl).join(newUrl)
  // Fail-closed: si el original era JSON válido, el resultado también tiene que
  // serlo. Cubre una URL nueva con comillas o backslashes que lo invalidarían.
  if (parseaComoJson(raw) && !parseaComoJson(next)) return null
  return next
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/content-url.test.mjs`
Expected: PASS — 8 tests.

- [ ] **Step 5: Correr la suite completa**

Run: `node --test tests/*.test.mjs`
Expected: PASS — 81 tests (73 previos + 8 nuevos). Si alguno de los 73 cambia, algo se rompió fuera de alcance: parar y reportar.

- [ ] **Step 6: Commit**

```bash
git add js/content-url.js tests/content-url.test.mjs
git commit -m "feat: helper puro remapContentUrl (no puede vaciar contenido) + tests"
```

---

### Task 2: Cablear `cascadeUpdateUrl`

Reemplazar la lógica que vacía el contenido por una llamada al helper, y borrar el filtro `affected` que doble-codificaba.

**Files:**
- Modify: `js/admin.js` — import nuevo (después de la línea 9); `cascadeUpdateUrl` (L1616-1628).

**Interfaces:**
- Consumes: `remapContentUrl(raw, oldUrl, newUrl) => string | null` de `js/content-url.js` (Task 1). `null` significa **saltar esa lección sin escribirle**.

> **Nota:** `js/admin.js` usa `document` y no es import-safe en Node → esta tarea no lleva unit test propio. Verificación = `node --check` + suite verde.

- [ ] **Step 1: Agregar el import**

En `js/admin.js`, después del import de `logActivity` (línea 9), agregar:

```js
import { remapContentUrl } from './content-url.js'
```

- [ ] **Step 2: Reescribir `cascadeUpdateUrl`**

En `js/admin.js`, el bloque actual (L1616-1628) es:

```js
async function cascadeUpdateUrl(oldUrl, newUrl) {
  const { data: lessons } = await supabase.from('lecciones').select('id, contenido')
  const affected = (lessons || []).filter(l =>
    l.contenido && JSON.stringify(l.contenido).includes(oldUrl)
  )
  for (const l of affected) {
    const updated = (Array.isArray(l.contenido) ? l.contenido : []).map(b =>
      b.url === oldUrl ? { ...b, url: newUrl } : b
    )
    await supabase.from('lecciones').update({ contenido: updated }).eq('id', l.id)
  }
  await supabase.from('material_apoyo').update({ url: newUrl }).eq('url', oldUrl)
}
```

Reemplazarlo por:

```js
// El `contenido` de las lecciones es un STRING (se guarda con JSON.stringify,
// ver el update de guardarLeccion) y puede ser JSON de bloques o HTML legacy.
// remapContentUrl decide qué escribir y devuelve null cuando no hay que tocar
// la fila; esta función no interpreta el formato.
async function cascadeUpdateUrl(oldUrl, newUrl) {
  const { data: lessons } = await supabase.from('lecciones').select('id, contenido')
  for (const l of (lessons || [])) {
    const next = remapContentUrl(l.contenido, oldUrl, newUrl)
    if (next === null) continue
    await supabase.from('lecciones').update({ contenido: next }).eq('id', l.id)
  }
  await supabase.from('material_apoyo').update({ url: newUrl }).eq('url', oldUrl)
}
```

Se borra el `filter` de `affected`: doble-codificaba (`JSON.stringify` de un string lo envuelve en comillas y escapa) y su trabajo lo hace ahora la primera regla del helper. El `select` ya bajaba todas las lecciones sin filtro, así que el costo de lectura no cambia.

- [ ] **Step 3: Verificar que no quedó nada de la lógica vieja**

Run: `grep -n "Array.isArray(l.contenido)\|const affected" js/admin.js`
Expected: **sin resultados**. Si aparece alguna, el reemplazo del Step 2 quedó incompleto.

- [ ] **Step 4: Verificar sintaxis y suite**

Run: `node --check js/admin.js && node --check js/content-url.js && node --test tests/*.test.mjs`
Expected: sin error de sintaxis; suite verde en 81.

- [ ] **Step 5: Commit**

```bash
git add js/admin.js
git commit -m "fix: cascadeUpdateUrl ya no vacía el contenido de las lecciones al mover un archivo"
```

---

## Notas de verificación final

**Lectura del diff:** confirmar que en el camino nuevo no existe ninguna expresión que pueda producir `[]`, `''` ni `undefined` como `contenido`. Es la propiedad central del fix.

**Verificación manual (para el usuario, en el navegador).** Hacerla con material de descarte, **no** con contenido bueno — la prueba mueve un archivo de verdad en Storage:

1. Subir una imagen al panel de Material.
2. Crear una lección de prueba que la use en un bloque, y guardarla.
3. Crear una carpeta y arrastrar la imagen adentro.
4. Abrir la lección: el contenido debe seguir completo y la imagen debe cargar desde la ruta nueva.

Antes del fix, el paso 4 mostraba la lección vacía.

**Fuera de alcance (no implementar):**

- Reparar lecciones ya vaciadas. El fix detiene la pérdida futura, no restaura. Queda pendiente correr `select count(*) as lecciones_vacias from lecciones where contenido is null or length(contenido::text) <= 2` — el dashboard de Supabase devolvió "Failed to fetch" dos veces al intentarlo.
- Los items #2 (escapar el cuerpo en `renderMarkdown` + el `onclick` del lightbox roto por la CSP), #7 (realtime de lecciones) y #10 (borrar categoría sin chequear `error`) de la auditoría: lote aparte.
- El XSS del contenido legacy (`js/lessons.js:204`).
- Migrar `contenido` a `jsonb` y unificar el doble formato.
