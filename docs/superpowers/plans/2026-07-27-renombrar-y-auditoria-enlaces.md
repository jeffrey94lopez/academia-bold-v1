# Renombrar sin romper enlaces + auditoría · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que renombrar un archivo deje de romper las lecciones que lo usan, que borrar uno avise a quién afecta, y que el admin pueda ver y reparar los enlaces ya rotos.

**Architecture:** Un módulo puro nuevo `js/bucket-urls.js` concentra el razonamiento sobre URLs del bucket dentro de texto crudo (extraer, contar, comparar). El fix del renombrado no escribe lógica de contenido nueva: alinea la firma de `renameFile` con la de `moveFile` y reusa `cascadeUpdateUrl`, que ya está en producción desde la puerta 1. La auditoría es un consumidor más de esas piezas, con un inventario paginado del bucket y confirmación por HEAD.

**Tech Stack:** JS ES-modules vanilla (sin build), `node:test`.

## Global Constraints

- Rama de trabajo: `sandbox`. Spec: `docs/superpowers/specs/2026-07-27-renombrar-y-auditoria-enlaces-design.md`.
- Estilo del repo: indentación 2 espacios, **sin punto y coma**, comentarios en español.
- **Fail-closed en todo lo que pueda llevar a reescribir contenido:** si el inventario del bucket falla, no se reporta nada roto; si un HEAD no concluye, la URL es "no verificable" y **no** ofrece reemplazo; si el conteo de referencias falla, el borrado sigue funcionando sin el detalle.
- El escaneo **no escribe nada** en la base. La única escritura del flujo de auditoría es el reemplazo, disparado por el admin.
- Los módulos puros son **import-safe en Node**: sin `document`, sin `supabase`, sin efectos en top-level.
- `js/admin.js` y `js/upload.js` usan `document`/`supabase` y **no** son import-safe en Node → no llevan unit test propio; se verifican con `node --check` más la suite verde más la prueba manual del final.
- Tests: `node --test tests/*.test.mjs`. La suite está en **88** antes de este trabajo. El warning `MODULE_TYPELESS_PACKAGE_JSON` es esperado en todo el repo y **NO** es hallazgo.
- **Sin migraciones.** Solo frontend.

## File Structure

- `js/bucket-urls.js` — **Create:** `extractBucketUrls`, `countReferences`, `diffBrokenUrls`. Las tres puras.
- `tests/bucket-urls.test.mjs` — **Create:** unit tests de las tres.
- `js/upload.js` — **Modify:** `publicUrlPrefix()` y `publicUrlFor(path)` nuevos; `listAllFiles()` nuevo; `renameFile` cambia de firma (L67-82).
- `js/admin.js` — **Modify:** imports; `confirmRename` (L2957-2974) y el aviso del modal de renombrar (L2930-2933); el handler `.delete-file` (L1978-1992); botón nuevo en el header del panel de Material (L1678-1683); modal de enlaces rotos + escaneo + reemplazo (código nuevo, junto a `initRenameModal`).

**Orden obligatorio:** Task 1 → Task 2 → Task 3 → Task 4 → Task 5.

### Desviaciones respecto de la spec (deliberadas, verificadas contra el código)

1. **El modal se crea en JS, no en `admin.html`.** El spec dice "`#brokenLinksModal` en `admin.html`, mismo patrón que el de renombrar", pero el modal de renombrar **no** está en el HTML: lo crea `initRenameModal()` (`js/admin.js:2920-2941`). Se sigue el patrón real.
2. **Se agrega `publicUrlFor(path)` además de `publicUrlPrefix()`.** Las URLs guardadas en la base las generó `getPublicUrl`, que url-encodea; `createFolder` no sanea el nombre de la carpeta, así que una carpeta con espacios o acentos produciría URLs con `%20` que una concatenación a mano no reproduce. El inventario se convierte a URL con el mismo mecanismo que las generó. `publicUrlPrefix()` se sigue usando, pero solo para el regex de extracción — el prefijo llega hasta `/material/` y esa parte nunca lleva encoding.
3. **El modal de enlaces usa `z-40`, no `z-[200]`.** El selector de biblioteca (`#mediaLibraryModal`, `admin.html:106`) es `z-50`: si el modal de enlaces quedara por encima, el selector aparecería debajo y no se podría usar. Con `z-40` el modal se ve sobre el panel y el selector se dibuja encima de él.

### Limitación conocida que no se arregla acá

`openMediaLibrary` (`js/admin.js:2843-2874`) lista **solo la raíz** del bucket (`listFiles('')`), así que el reemplazo no puede elegir un archivo que esté dentro de una carpeta. Es preexistente y afecta también al editor de bloques. Queda fuera de alcance; si molesta en la prueba manual, es un trabajo aparte.

---

### Task 1: Módulo puro `js/bucket-urls.js` + tests

**Files:**
- Create: `js/bucket-urls.js`
- Test: `tests/bucket-urls.test.mjs`

**Interfaces:**
- Produces: `extractBucketUrls(raw, publicPrefix) => string[]` — URLs del bucket presentes en un string crudo, únicas, en orden de aparición, sin query ni hash.
- Produces: `countReferences(rows, campo, url) => number` — cuántas **filas** mencionan la URL.
- Produces: `diffBrokenUrls(referenced, existing) => string[]` — las referencias ausentes del inventario, únicas y en orden.
- Las tres son consumidas por Tasks 3, 4 y 5.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/bucket-urls.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { extractBucketUrls, countReferences, diffBrokenUrls } from '../js/bucket-urls.js'

const P = 'https://x.supabase.co/storage/v1/object/public/material/'
const A = P + 'foto-1700000000000.png'
const B = P + 'carpeta/otra-1700000000001.png'

test('extractBucketUrls: JSON de bloques con dos imágenes devuelve las dos', () => {
  const raw = JSON.stringify([
    { type: 'text', content: 'hola' },
    { type: 'image', url: A, caption: 'pie' },
    { type: 'image', url: B },
  ])
  assert.deepEqual(extractBucketUrls(raw, P), [A, B])
})

test('extractBucketUrls: HTML legacy con img src', () => {
  const raw = `<p>mirá</p><img src="${A}"><p>fin</p>`
  assert.deepEqual(extractBucketUrls(raw, P), [A])
})

test('extractBucketUrls: la misma URL repetida aparece una sola vez', () => {
  const raw = JSON.stringify([{ url: A }, { url: A }])
  assert.deepEqual(extractBucketUrls(raw, P), [A])
})

test('extractBucketUrls: query y hash se recortan', () => {
  const raw = `<img src="${A}?t=123"><img src="${B}#x">`
  assert.deepEqual(extractBucketUrls(raw, P), [A, B])
})

test('extractBucketUrls: texto sin URLs del bucket devuelve []', () => {
  assert.deepEqual(extractBucketUrls('<p>sin imágenes</p>', P), [])
  assert.deepEqual(extractBucketUrls('https://otro-host.com/x.png', P), [])
})

test('extractBucketUrls: entradas degeneradas devuelven [] y no lanzan', () => {
  assert.deepEqual(extractBucketUrls(null, P), [])
  assert.deepEqual(extractBucketUrls(undefined, P), [])
  assert.deepEqual(extractBucketUrls('', P), [])
  assert.deepEqual(extractBucketUrls(42, P), [])
  assert.deepEqual(extractBucketUrls([A], P), [])
})

test('extractBucketUrls: prefijo inválido devuelve []', () => {
  assert.deepEqual(extractBucketUrls(`<img src="${A}">`, ''), [])
  assert.deepEqual(extractBucketUrls(`<img src="${A}">`, null), [])
})

test('extractBucketUrls: el prefijo pelado no cuenta como URL', () => {
  assert.deepEqual(extractBucketUrls(`<img src="${P}">`, P), [])
})

test('countReferences: cuenta filas, no ocurrencias', () => {
  const rows = [
    { contenido: `${A} y otra vez ${A}` },
    { contenido: 'nada' },
    { contenido: A },
  ]
  assert.equal(countReferences(rows, 'contenido', A), 2)
})

test('countReferences: respeta el campo pedido', () => {
  const rows = [{ url: A, contenido: 'nada' }]
  assert.equal(countReferences(rows, 'url', A), 1)
  assert.equal(countReferences(rows, 'contenido', A), 0)
})

test('countReferences: filas sin el campo o con valor no-string no cuentan', () => {
  const rows = [{}, { contenido: null }, { contenido: 42 }, { contenido: A }]
  assert.equal(countReferences(rows, 'contenido', A), 1)
})

test('countReferences: argumentos degenerados devuelven 0', () => {
  assert.equal(countReferences([], 'contenido', A), 0)
  assert.equal(countReferences(null, 'contenido', A), 0)
  assert.equal(countReferences([{ contenido: A }], 'contenido', ''), 0)
})

test('diffBrokenUrls: devuelve solo las ausentes, en orden y sin duplicados', () => {
  assert.deepEqual(diffBrokenUrls([A, B, A], [B]), [A])
})

test('diffBrokenUrls: si están todas devuelve []; si el inventario está vacío devuelve todas', () => {
  assert.deepEqual(diffBrokenUrls([A, B], [A, B]), [])
  assert.deepEqual(diffBrokenUrls([A, B], []), [A, B])
  assert.deepEqual(diffBrokenUrls(null, [A]), [])
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/bucket-urls.test.mjs`
Expected: FAIL — no existe `js/bucket-urls.js` (`ERR_MODULE_NOT_FOUND`).

- [ ] **Step 3: Escribir la implementación mínima**

Crear `js/bucket-urls.js`:

```js
// Razona sobre las URLs del bucket que viven dentro de texto crudo.
// Import-safe (sin DOM, sin supabase): la I/O y la UI viven en los consumidores.
//
// Trabaja sobre el TEXTO CRUDO y no sobre la estructura parseada: el `contenido`
// de las lecciones guarda dos formatos (JSON de bloques y HTML legacy, ver
// js/lesson-blocks.js) y un solo camino sirve para los dos.

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Todas las URLs del bucket presentes en `raw`, únicas y en orden de aparición.
// El corte es por caracteres que no pueden formar parte de la URL en este
// contexto: sirve tanto para "url":"…" del JSON como para src="…" del HTML.
export function extractBucketUrls(raw, publicPrefix) {
  if (typeof raw !== 'string' || !raw) return []
  if (typeof publicPrefix !== 'string' || !publicPrefix) return []
  const re = new RegExp(escapeRegex(publicPrefix) + '[^\\s"\'<>)\\\\]+', 'g')
  const out = []
  for (const m of raw.matchAll(re)) {
    const url = m[0].split('?')[0].split('#')[0]
    if (url === publicPrefix) continue
    if (!out.includes(url)) out.push(url)
  }
  return out
}

// Cuántas FILAS mencionan la URL (no cuántas veces aparece).
export function countReferences(rows, campo, url) {
  if (!Array.isArray(rows)) return 0
  if (typeof campo !== 'string' || !campo) return 0
  if (typeof url !== 'string' || !url) return 0
  let n = 0
  for (const row of rows) {
    const valor = row?.[campo]
    if (typeof valor === 'string' && valor.includes(url)) n++
  }
  return n
}

// Las referencias que no están en el inventario. Son CANDIDATAS a estar rotas:
// la confirmación la hace el HEAD en admin.js, porque un inventario incompleto
// produciría falsos positivos.
export function diffBrokenUrls(referenced, existing) {
  if (!Array.isArray(referenced)) return []
  const set = new Set(Array.isArray(existing) ? existing : [])
  const out = []
  for (const url of referenced) {
    if (typeof url !== 'string' || !url) continue
    if (set.has(url) || out.includes(url)) continue
    out.push(url)
  }
  return out
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/bucket-urls.test.mjs`
Expected: PASS — 14 tests.

- [ ] **Step 5: Correr la suite completa**

Run: `node --test tests/*.test.mjs`
Expected: PASS — 102 tests (88 previos + 14 nuevos). Si alguno de los 88 cambia, algo se rompió fuera de alcance: parar y reportar.

- [ ] **Step 6: Commit**

```bash
git add js/bucket-urls.js tests/bucket-urls.test.mjs
git commit -m "feat: helpers puros de URLs del bucket (extraer, contar, comparar) + tests"
```

---

### Task 2: Renombrar propaga la URL nueva

El fix de la puerta 3. `renameFile` pasa a devolver lo mismo que `moveFile`, y el handler hace la cascada.

**Files:**
- Modify: `js/upload.js` — `renameFile` (L67-82); helpers `publicUrlPrefix`/`publicUrlFor` nuevos.
- Modify: `js/admin.js` — `confirmRename` (L2963-2968) y el aviso del modal (L2930-2933).

**Interfaces:**
- Produces: `renameFile(oldPath, newDisplayName) => Promise<{ newPath, newUrl, oldUrl }>` — **cambio de firma**; antes devolvía `{ path, url }`.
- Produces: `publicUrlPrefix() => string` — `https://…/storage/v1/object/public/material/`. Consumido por Tasks 3 y 4.
- Produces: `publicUrlFor(path) => string` — la URL pública de una ruta, por el mismo mecanismo que generó las guardadas. Consumido por Tasks 3 y 4.
- Consumes: `cascadeUpdateUrl(oldUrl, newUrl)` (`js/admin.js:1630`), ya en producción.

> **Nota:** ninguno de los dos archivos es import-safe en Node → esta tarea no lleva unit test propio. Verificación = `node --check` + suite verde + prueba manual.

- [ ] **Step 1: Exponer el prefijo y la URL pública en `js/upload.js`**

Cambiar el import de la línea 1:

```js
import { supabase } from './supabase.js'
```

por:

```js
import { supabase, SUPABASE_URL } from './supabase.js'
```

Y agregar, justo después de `const MAX_BYTES = 50 * 1024 * 1024` (L4):

```js
// El prefijo público del bucket, armado en un solo lugar. Llega hasta el
// nombre del bucket: la parte del path va aparte y puede llevar url-encoding.
export function publicUrlPrefix() {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`
}

// La URL pública de una ruta, por el MISMO mecanismo que generó las URLs ya
// guardadas en la base (getPublicUrl url-encodea; createFolder no sanea el
// nombre de la carpeta, así que una con espacios o acentos no se reproduce
// concatenando a mano).
export function publicUrlFor(path) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
```

- [ ] **Step 2: Cambiar la firma de `renameFile`**

En `js/upload.js`, el final de `renameFile` (L78-81) es:

```js
  const { error } = await supabase.storage.from(BUCKET).move(oldPath, newPath)
  if (error) throw error
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(newPath)
  return { path: newPath, url: data.publicUrl }
```

Reemplazarlo por:

```js
  // La URL vieja se calcula ANTES de mover, y se devuelve junto con la nueva:
  // misma forma que moveFile, para que el llamador pueda hacer la cascada.
  const oldUrl = publicUrlFor(oldPath)
  const { error } = await supabase.storage.from(BUCKET).move(oldPath, newPath)
  if (error) throw error
  return { newPath, newUrl: publicUrlFor(newPath), oldUrl }
```

- [ ] **Step 3: Hacer la cascada en `confirmRename`**

En `js/admin.js`, el `try` de `confirmRename` (L2963-2968) es:

```js
    try {
      await renameFile(_renameCurrentPath, newName)
      modal.classList.add('hidden')
      showToast('Archivo renombrado correctamente')
      logActivity('update', 'image', newName, { from: displayName(_renameCurrentPath.split('/').pop()) })
      if (_renameReloadCallback) await _renameReloadCallback()
```

Reemplazarlo por:

```js
    try {
      // ACÁ vivía la puerta 3: se renombraba el objeto en Storage y se
      // descartaba el retorno, así que las lecciones quedaban apuntando a una
      // URL que ya no existía. Misma cascada que handleFileMoveToFolder.
      const { oldUrl, newUrl } = await renameFile(_renameCurrentPath, newName)
      await cascadeUpdateUrl(oldUrl, newUrl)
      modal.classList.add('hidden')
      showToast('Archivo renombrado correctamente')
      logActivity('update', 'image', newName, { from: displayName(_renameCurrentPath.split('/').pop()) })
      if (_renameReloadCallback) await _renameReloadCallback()
```

- [ ] **Step 4: Corregir el aviso del modal, que pasa a ser falso**

En `js/admin.js`, el modal de renombrar (L2930-2933) dice hoy:

```js
      <p class="text-xs text-amber-600 mb-4 flex items-start gap-1.5">
        <i data-lucide="triangle-alert" class="w-3.5 h-3.5 shrink-0 mt-0.5"></i>
        Las lecciones que referencien este archivo deberán actualizarse manualmente.
      </p>
```

Reemplazarlo por:

```js
      <p class="text-xs text-[var(--black-60)] mb-4 flex items-start gap-1.5">
        <i data-lucide="info" class="w-3.5 h-3.5 shrink-0 mt-0.5"></i>
        Las lecciones y materiales que usen este archivo se actualizan solos.
      </p>
```

- [ ] **Step 5: Verificar que no quedó el llamado viejo**

Run: `grep -n "await renameFile" js/admin.js`
Expected: una sola línea, la del Step 3, con desestructuración `const { oldUrl, newUrl } =`.

Run: `grep -rn "\.path\b.*renameFile\|renameFile(.*)\.url" js/`
Expected: **sin resultados** — nadie consume la firma vieja.

- [ ] **Step 6: Verificar sintaxis y suite**

Run: `node --check js/upload.js && node --check js/admin.js && node --test tests/*.test.mjs`
Expected: sin error de sintaxis; suite verde en 102.

- [ ] **Step 7: Commit**

```bash
git add js/upload.js js/admin.js
git commit -m "fix: renombrar un archivo propaga la URL nueva a lecciones y materiales"
```

---

### Task 3: El borrado avisa a quién afecta

**Files:**
- Modify: `js/admin.js` — imports; helper `contarUsosDeUrl` nuevo (junto a `cascadeUpdateUrl`, después de L1638); handler `.delete-file` (L1978-1992).

**Interfaces:**
- Consumes: `countReferences(rows, campo, url)` (Task 1), `publicUrlFor(path)` (Task 2).
- Produces: `contarUsosDeUrl(url) => Promise<{ lecciones, materiales } | null>` — `null` significa "no se pudo contar", y el borrado sigue igual.

- [ ] **Step 1: Agregar los imports**

En `js/admin.js`, la línea 3 es:

```js
import { uploadFile, listFiles, deleteFile, renameFile, createFolder, moveFile } from './upload.js'
```

Reemplazarla por:

```js
import { uploadFile, listFiles, deleteFile, renameFile, createFolder, moveFile, publicUrlPrefix, publicUrlFor } from './upload.js'
```

Y después del import de `parseLessonBlocks` (L11), agregar:

```js
import { extractBucketUrls, countReferences, diffBrokenUrls } from './bucket-urls.js'
```

- [ ] **Step 2: Agregar el helper de conteo**

En `js/admin.js`, justo después del cierre de `cascadeUpdateUrl` (L1638), agregar:

```js
// Cuenta dónde se usa una URL antes de una acción destructiva. Devuelve null si
// no se pudo leer: el borrado nunca se bloquea por un error de consulta, solo
// pierde el detalle del aviso.
async function contarUsosDeUrl(url) {
  try {
    const [lecciones, materiales] = await Promise.all([
      supabase.from('lecciones').select('id, contenido'),
      supabase.from('material_apoyo').select('id, url'),
    ])
    if (lecciones.error || materiales.error) return null
    return {
      lecciones: countReferences(lecciones.data || [], 'contenido', url),
      materiales: countReferences(materiales.data || [], 'url', url),
    }
  } catch (_) {
    return null
  }
}

// "3 lecciones y 1 material de apoyo" — con singular/plural y sin mencionar lo
// que da cero.
function textoDeUsos({ lecciones, materiales }) {
  const partes = []
  if (lecciones) partes.push(`${lecciones} ${lecciones === 1 ? 'lección' : 'lecciones'}`)
  if (materiales) partes.push(`${materiales} ${materiales === 1 ? 'material de apoyo' : 'materiales de apoyo'}`)
  return partes.join(' y ')
}
```

- [ ] **Step 3: Usar el conteo en el confirm de borrado**

En `js/admin.js`, el handler `.delete-file` (L1978-1991) es:

```js
  grid.querySelectorAll('.delete-file').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation()
      const displayN = displayName(btn.dataset.path.split('/').pop())
      if (!confirm(`¿Eliminar "${displayN}"?\nEsta acción no se puede deshacer.`)) return
      try {
        await deleteFile(btn.dataset.path)
```

Reemplazar hasta el `if (!confirm(...))` por:

```js
  grid.querySelectorAll('.delete-file').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation()
      const displayN = displayName(btn.dataset.path.split('/').pop())
      const usos = await contarUsosDeUrl(publicUrlFor(btn.dataset.path))
      const aviso = usos && (usos.lecciones || usos.materiales)
        ? `\nLo usan ${textoDeUsos(usos)}. Van a quedar con el enlace roto.`
        : ''
      if (!confirm(`¿Eliminar "${displayN}"?${aviso}\nEsta acción no se puede deshacer.`)) return
      try {
        await deleteFile(btn.dataset.path)
```

El resto del handler (el `try` con `deleteFile`, el toast y el `renderMaterialPanel`) queda igual.

- [ ] **Step 4: Verificar sintaxis y suite**

Run: `node --check js/admin.js && node --test tests/*.test.mjs`
Expected: sin error de sintaxis; suite verde en 102.

- [ ] **Step 5: Commit**

```bash
git add js/admin.js
git commit -m "feat: el borrado de un archivo avisa cuántas lecciones lo usan"
```

---

### Task 4: Escaneo y modal de enlaces rotos (solo lectura)

**Files:**
- Modify: `js/upload.js` — `listAllFiles()` nuevo (después de `listFiles`, L54).
- Modify: `js/admin.js` — botón en el header del panel de Material (L1678-1683) y su listener; `initBrokenLinksModal`, `escanearEnlaces`, `verificarUrl` y `abrirRevisionEnlaces` nuevos (junto a `initRenameModal`, después de L2980).

**Interfaces:**
- Consumes: `extractBucketUrls`, `diffBrokenUrls` (Task 1); `publicUrlPrefix`, `publicUrlFor` (Task 2).
- Produces: `listAllFiles() => Promise<string[]>` — todas las rutas del bucket, recursivo y paginado. Lanza si el listado falla.
- Produces: `abrirRevisionEnlaces()` — abre el modal y escanea. Consumido por Task 5 para re-escanear.

- [ ] **Step 1: Inventario paginado en `js/upload.js`**

Agregar después de `listFiles` (que termina en L54):

```js
// Todas las rutas del bucket, recorriendo carpetas y paginando de a 100.
// listFiles corta en 200 por carpeta y sin paginar inventaría de menos, lo que
// haría marcar como rotos archivos que existen. Si el listado falla, lanza: el
// llamador tiene que fallar cerrado y no reportar nada roto.
export async function listAllFiles() {
  const PAGE = 100
  const rutas = []
  const pendientes = ['']
  while (pendientes.length) {
    const carpeta = pendientes.shift()
    let offset = 0
    for (;;) {
      const { data, error } = await supabase.storage.from(BUCKET).list(carpeta, {
        limit: PAGE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) throw error
      const items = data || []
      for (const item of items) {
        const full = carpeta ? `${carpeta}/${item.name}` : item.name
        if (item.id === null) pendientes.push(full)
        else if (item.name !== '.emptyFolderPlaceholder') rutas.push(full)
      }
      if (items.length < PAGE) break
      offset += PAGE
    }
  }
  return rutas
}
```

- [ ] **Step 2: Agregar el botón al panel de Material**

En `js/admin.js`, el header del panel (L1678-1683) es:

```js
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-black">Biblioteca de archivos</h2>
        <button id="newFolderBtn" class="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--blue-20)] text-xs font-bold text-[var(--black-60)] hover:bg-[var(--background-page)]">
          <i data-lucide="folder-plus" class="w-3.5 h-3.5"></i> Nueva carpeta
        </button>
      </div>
```

Reemplazarlo por:

```js
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-black">Biblioteca de archivos</h2>
        <div class="flex items-center gap-2">
          <button id="checkLinksBtn" class="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--blue-20)] text-xs font-bold text-[var(--black-60)] hover:bg-[var(--background-page)]">
            <i data-lucide="unlink" class="w-3.5 h-3.5"></i> Revisar enlaces
          </button>
          <button id="newFolderBtn" class="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--blue-20)] text-xs font-bold text-[var(--black-60)] hover:bg-[var(--background-page)]">
            <i data-lucide="folder-plus" class="w-3.5 h-3.5"></i> Nueva carpeta
          </button>
        </div>
      </div>
```

Y en el mismo `renderMaterialPanel`, justo después de `await loadFiles()` (L1748), agregar:

```js
  document.getElementById('checkLinksBtn').addEventListener('click', abrirRevisionEnlaces)
```

- [ ] **Step 3: Escribir el escaneo**

En `js/admin.js`, después del cierre de `initRenameModal` (L2980), agregar:

```js
// Verifica una URL candidata. Tres estados, no dos: solo un 404 cuenta como
// rota. Cualquier otra cosa (timeout, red, 5xx) es "desconocido" y NO habilita
// el reemplazo: reescribir contenido por una lectura dudosa es peor que no
// reportar nada.
async function verificarUrl(url) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 8000)
  try {
    const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal })
    if (res.status === 404) return { url, estado: 'rota' }
    if (res.ok) return { url, estado: 'sana' }
    return { url, estado: 'desconocido' }
  } catch (_) {
    return { url, estado: 'desconocido' }
  } finally {
    clearTimeout(t)
  }
}

// Devuelve { rotas, noVerificables, usos }. NO escribe nada.
// Si el inventario del bucket falla, lanza: sin inventario completo no se puede
// afirmar que algo esté roto.
async function escanearEnlaces() {
  const prefijo = publicUrlPrefix()
  const rutas = await listAllFiles()
  const existentes = new Set(rutas.map(publicUrlFor))

  const [lecciones, materiales] = await Promise.all([
    supabase.from('lecciones').select('id, titulo, contenido'),
    supabase.from('material_apoyo').select('id, titulo, url'),
  ])
  if (lecciones.error || materiales.error) throw new Error('No se pudieron leer las lecciones')

  const usos = new Map()
  const anotar = (url, uso) => {
    if (!usos.has(url)) usos.set(url, [])
    usos.get(url).push(uso)
  }
  for (const l of lecciones.data || []) {
    for (const url of extractBucketUrls(l.contenido, prefijo)) {
      anotar(url, { tipo: 'Lección', titulo: l.titulo || '(sin título)' })
    }
  }
  for (const m of materiales.data || []) {
    for (const url of extractBucketUrls(m.url, prefijo)) {
      anotar(url, { tipo: 'Material de apoyo', titulo: m.titulo || '(sin título)' })
    }
  }

  const candidatas = diffBrokenUrls([...usos.keys()], [...existentes])
  const rotas = []
  const noVerificables = []
  for (let i = 0; i < candidatas.length; i += 5) {
    const tanda = await Promise.all(candidatas.slice(i, i + 5).map(verificarUrl))
    for (const { url, estado } of tanda) {
      if (estado === 'rota') rotas.push(url)
      else if (estado === 'desconocido') noVerificables.push(url)
    }
  }
  return { rotas, noVerificables, usos }
}
```

- [ ] **Step 4: Escribir el modal**

En `js/admin.js`, a continuación de lo del Step 3, agregar:

```js
// z-40 a propósito: el selector de biblioteca (#mediaLibraryModal) es z-50 y
// tiene que poder dibujarse ENCIMA de este modal cuando se pide un reemplazo.
function initBrokenLinksModal() {
  if (document.getElementById('brokenLinksModal')) return
  const modal = document.createElement('div')
  modal.id = 'brokenLinksModal'
  modal.className = 'hidden fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4'
  modal.innerHTML = `
    <div class="bg-white rounded-2xl w-full max-w-lg shadow-xl flex flex-col" style="max-height:80vh">
      <div class="flex items-center gap-3 p-4 border-b border-[var(--blue-10)]">
        <h3 class="font-black text-base flex-1">Revisión de enlaces</h3>
        <button id="closeBrokenLinks" class="text-[var(--black-40)] hover:text-[var(--black-100)] text-lg px-1" aria-label="Cerrar">✕</button>
      </div>
      <div id="brokenLinksBody" class="p-4 overflow-y-auto text-sm"></div>
    </div>
  `
  document.body.appendChild(modal)

  document.getElementById('closeBrokenLinks').addEventListener('click', () => modal.classList.add('hidden'))
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden') })
}

async function abrirRevisionEnlaces() {
  initBrokenLinksModal()
  const modal = document.getElementById('brokenLinksModal')
  const body = document.getElementById('brokenLinksBody')
  modal.classList.remove('hidden')
  body.innerHTML = '<p class="text-[var(--black-40)] py-6 text-center">Revisando enlaces...</p>'

  let resultado
  try {
    resultado = await escanearEnlaces()
  } catch (e) {
    // Fail-closed: sin inventario confiable no se afirma que nada esté roto.
    body.innerHTML = `<p class="text-red-500 py-6 text-center">No se pudo revisar: ${escapeHtml(e.message)}</p>`
    return
  }
  renderRevisionEnlaces(resultado)
}

function renderRevisionEnlaces({ rotas, noVerificables, usos }) {
  const body = document.getElementById('brokenLinksBody')
  if (!body) return

  if (!rotas.length && !noVerificables.length) {
    body.innerHTML = '<p class="text-[var(--black-60)] py-6 text-center">✅ Todos los enlaces apuntan a archivos que existen.</p>'
    return
  }

  const listaDeUsos = url => (usos.get(url) || [])
    .map(u => `<li class="text-xs text-[var(--black-60)]">${escapeHtml(u.tipo)}: ${escapeHtml(u.titulo)}</li>`)
    .join('')

  const bloqueRotas = rotas.length ? `
    <p class="font-bold text-red-500 mb-2">${rotas.length} ${rotas.length === 1 ? 'enlace roto' : 'enlaces rotos'}</p>
    <div class="space-y-3 mb-4">
      ${rotas.map(url => `
        <div class="border border-red-200 rounded-xl p-3">
          <p class="font-bold text-xs mb-1">${escapeHtml(displayName(url.split('/').pop()))}</p>
          <p class="text-[10px] text-[var(--black-40)] break-all mb-2">${escapeHtml(url)}</p>
          <ul class="list-disc pl-4 mb-2">${listaDeUsos(url)}</ul>
        </div>
      `).join('')}
    </div>` : ''

  const bloqueDudosas = noVerificables.length ? `
    <p class="font-bold text-amber-600 mb-2">${noVerificables.length} sin verificar</p>
    <p class="text-xs text-[var(--black-60)] mb-2">No se pudo confirmar si existen. No se ofrece reemplazo para evitar pisar contenido bueno.</p>
    <div class="space-y-2">
      ${noVerificables.map(url => `
        <div class="border border-amber-200 rounded-xl p-3">
          <p class="font-bold text-xs mb-1">${escapeHtml(displayName(url.split('/').pop()))}</p>
          <ul class="list-disc pl-4">${listaDeUsos(url)}</ul>
        </div>
      `).join('')}
    </div>` : ''

  body.innerHTML = bloqueRotas + bloqueDudosas
}
```

- [ ] **Step 5: Verificar sintaxis y suite**

Run: `node --check js/upload.js && node --check js/admin.js && node --test tests/*.test.mjs`
Expected: sin error de sintaxis; suite verde en 102.

- [ ] **Step 6: Verificar que el escaneo no escribe**

Run: `grep -n "escanearEnlaces" -A 40 js/admin.js | grep -n "\.update(\|\.insert(\|\.delete("`
Expected: **sin resultados**. Si aparece alguna, el escaneo dejó de ser de solo lectura.

- [ ] **Step 7: Commit**

```bash
git add js/upload.js js/admin.js
git commit -m "feat: revisión de enlaces rotos en el panel de Material (solo lectura)"
```

---

### Task 5: Reemplazar un enlace roto

**Files:**
- Modify: `js/admin.js` — botón en `renderRevisionEnlaces` y su listener.

**Interfaces:**
- Consumes: `openMediaLibrary(onSelect)` (`js/admin.js:2843`), `cascadeUpdateUrl(oldUrl, newUrl)` (`js/admin.js:1630`), `abrirRevisionEnlaces()` (Task 4).

- [ ] **Step 1: Agregar el botón a las entradas rotas**

En `renderRevisionEnlaces`, dentro de `bloqueRotas`, la línea:

```js
          <ul class="list-disc pl-4 mb-2">${listaDeUsos(url)}</ul>
```

pasa a ser:

```js
          <ul class="list-disc pl-4 mb-2">${listaDeUsos(url)}</ul>
          <button class="fix-link px-3 py-1.5 rounded-lg bg-[var(--blue-100)] text-white text-xs font-bold" data-url="${escapeHtml(url)}">Reemplazar…</button>
```

El bloque de "sin verificar" **no** lleva botón: es el fail-closed del diseño.

- [ ] **Step 2: Cablear el reemplazo**

Al final de `renderRevisionEnlaces`, después de `body.innerHTML = bloqueRotas + bloqueDudosas`, agregar:

```js
  body.querySelectorAll('.fix-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const rota = btn.dataset.url
      openMediaLibrary(async nueva => {
        if (!nueva || nueva === rota) return
        btn.disabled = true
        btn.textContent = 'Reemplazando...'
        try {
          await cascadeUpdateUrl(rota, nueva)
          showToast('Enlace reemplazado')
          await abrirRevisionEnlaces()
        } catch (e) {
          showToast('Error al reemplazar: ' + e.message, 'error')
          btn.disabled = false
          btn.textContent = 'Reemplazar…'
        }
      })
    })
  })
```

- [ ] **Step 3: Verificar sintaxis y suite**

Run: `node --check js/admin.js && node --test tests/*.test.mjs`
Expected: sin error de sintaxis; suite verde en 102.

- [ ] **Step 4: Verificar que las "sin verificar" no tienen botón**

Run: `grep -n "fix-link" js/admin.js`
Expected: exactamente **dos** líneas — la del botón en `bloqueRotas` y la del `querySelectorAll`. Si aparece una tercera dentro de `bloqueDudosas`, se rompió el fail-closed.

- [ ] **Step 5: Commit**

```bash
git add js/admin.js
git commit -m "feat: reemplazar un enlace roto eligiendo otro archivo de la biblioteca"
```

---

## Notas de verificación final

**Lectura del diff:** confirmar que (a) el único camino que escribe `contenido` es `cascadeUpdateUrl`, (b) el escaneo no tiene ningún `.update(`, y (c) una URL "no verificable" nunca llega a tener botón de reemplazo.

**Verificación manual (en el navegador), con material de descarte:**

1. Subir una imagen al panel de Material, usarla en un bloque de una lección de prueba y guardar.
2. Renombrarla desde el panel. El modal ya no debe decir "deberán actualizarse manualmente".
3. Abrir la lección en el portal: **la imagen tiene que seguir cargando**. Antes del fix quedaba rota.
4. Intentar borrar la imagen: el confirm tiene que decir "Lo usan 1 lección…". **Cancelar**.
5. Borrarla de verdad. Abrir `Revisar enlaces`: la lección tiene que aparecer bajo "1 enlace roto".
6. Tocar `Reemplazar…`: el selector de biblioteca tiene que verse **por encima** del modal (si queda debajo, revisar el z-index del Step 4 de la Task 4). Elegir otra imagen.
7. Volver a abrir la lección: tiene que mostrar la imagen nueva.
8. Volver a `Revisar enlaces`: "Todos los enlaces apuntan a archivos que existen".
9. Borrar la lección y el material de prueba.

**Fuera de alcance (no implementar):**

- Que `openMediaLibrary` liste archivos dentro de carpetas (limitación preexistente, ver arriba).
- Hacer `cascadeUpdateUrl` transaccional.
- Reparar automáticamente sin que el admin elija el reemplazo, o quitar de la lección el bloque roto.
- Escanear al abrir el panel: el escaneo es bajo demanda.
- Migrar `contenido` a `jsonb`.
- Los items #2, #7 y #10 de la auditoría del 2026-07-20 y el XSS del contenido legacy.
