# Inventario mono-sucursal + saneamiento + purgador heurístico — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar Spec 1 del split de inventario — camino mono-sucursal con plantilla
sintética, purgador heurístico de categorías/unidades (sin IA), saneador de caracteres
prohibidos, IVA general con manejo de IVA mixto, filas vacías mejoradas. Spec:
`docs/superpowers/specs/2026-11-11-inventario-monosucursal-y-saneamiento-design.md`.

**Architecture:** 3 módulos puros nuevos (`inv-saneamiento.js`, `inv-purgador.js`,
`inv-plantilla-sintetica.js`). `inv-sesion.js` gana el método `agregarPlantillaSintetica`.
`inv-chat.js` gana un paso de bifurcación (`pasoSucursales`) y adaptaciones en
`pasoPreguntas` (IVA mixto) y `pasoResultado` (lista para crear en Bold en mono).
`inv-convertir.js` aplica saneamiento sobre el output, usa `purgar` para categorías y
unidades, y maneja las nuevas estrategias de IVA. El conversor pure function no cambia su
superficie downstream: la plantilla sintética es *indistinguible* de una subida por el
cliente.

**Tech Stack:** Vanilla JS ESM (sin build step), `node:test` + `node:assert/strict` para
tests, SheetJS 0.20.x desde `vendor/xlsx.full.min.js` vía `createRequire`.

**Convenciones del repo:**
- Tests corren con `node --test tests/<nombre>.test.mjs`.
- SheetJS se carga en Node tests así:
  ```js
  import { createRequire } from 'node:module'
  const XLSX = createRequire(import.meta.url)('../vendor/xlsx.full.min.js')
  ```
- En browser, `cargarXlsx()` de `inv-sesion.js` ya se encarga del lazy load.
- Commits en español, estilo `feat(inventario): …` / `test(inventario): …`.
- Co-author en commits: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.

---

## Task 1: Commit del `warehouseId` ya aplicado al working tree

El cambio a `js/bold-context.js` (expone `warehouseId` al top-level del contexto) y sus tests
ya están en el working tree desde la sesión anterior pero sin commitear. Lo commiteamos
para no arrastrar diffs.

**Files:**
- Modify: `js/bold-context.js:88-98` (ya editado)
- Modify: `tests/bold-context.test.mjs` (ya editado)

- [ ] **Step 1: Verificar el estado del working tree**

```bash
git status --short js/bold-context.js tests/bold-context.test.mjs
```

Esperado:
```
 M js/bold-context.js
 M tests/bold-context.test.mjs
```

- [ ] **Step 2: Correr la suite completa para verificar que pasa**

```bash
node --test tests/bold-context.test.mjs
```

Esperado: `# pass 25` (todos verde).

- [ ] **Step 3: Commit**

```bash
git add js/bold-context.js tests/bold-context.test.mjs
git commit -m "$(cat <<'EOF'
feat(bold-context): exponer warehouseId al top-level del contexto

Bold manda la sucursal activa dentro de user.warehouseId (verificado el 2026-11-10
con sniffer de postMessage contra pos.bold.co). La subimos al top level del contexto
normalizado porque conceptualmente es un atributo de la sesión, no del usuario. La
herramienta de inventario (camino mono-sucursal) la va a consumir para armar la
plantilla sin pedirle al cliente que descargue nada.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Esperado: commit creado, hash impreso.

---

## Task 2: Renombrar archivos base en `vendor/` y agregar README

Dos renames limpios + borrar las "Con FE" sucias + un README que documente qué es cada
archivo y cómo rotarlos. **No** tocamos el contenido de los xlsx — el runtime va a reescribir
la hoja `Instrucciones` por nosotros (ver Task 5).

**Files:**
- Rename: `vendor/Plantilla de Ítems Inventariables Bold POS (Sin Factura Electronica).xlsx` → `vendor/bold-plantilla-base-inventariable.xlsx`
- Rename: `vendor/Plantilla de Ítems No Inventariables Bold POS (Sin Factura Electronica).xlsx` → `vendor/bold-plantilla-base-noinventariable.xlsx`
- Delete: `vendor/Plantilla de Ítems Inventariables Bold POS (1).xlsx`
- Delete: `vendor/Plantilla de Ítems No Inventariables Bold POS.xlsx`
- Create: `vendor/README.md`

- [ ] **Step 1: Renombrar los 2 archivos "Sin FE"**

```bash
git mv "vendor/Plantilla de Ítems Inventariables Bold POS (Sin Factura Electronica).xlsx" vendor/bold-plantilla-base-inventariable.xlsx
git mv "vendor/Plantilla de Ítems No Inventariables Bold POS (Sin Factura Electronica).xlsx" vendor/bold-plantilla-base-noinventariable.xlsx
```

- [ ] **Step 2: Borrar las variantes "Con FE" sucias**

```bash
git rm "vendor/Plantilla de Ítems Inventariables Bold POS (1).xlsx"
git rm "vendor/Plantilla de Ítems No Inventariables Bold POS.xlsx"
```

- [ ] **Step 3: Crear `vendor/README.md`**

```markdown
# vendor/

Librerías y assets servidos desde el portal, sin CDN.

## SheetJS

- `xlsx.full.min.js` — SheetJS 0.20.3 (lectura y escritura de xlsx). Se carga lazy desde
  `js/inv-sesion.js:cargarXlsx`. El proyecto usa esta copia (no npm) porque el CSP solo
  permite `'self'` y la versión de npm 0.18.5 tiene avisos de seguridad conocidos.

## Lucide

- `lucide.min.js` — íconos SVG. Se carga en todas las páginas.

## Plantillas base de Bold POS

Las usa el camino **mono-sucursal** del conversor de inventario para armar una plantilla
sintética sin pedirle al cliente que descargue la suya (ver
`docs/superpowers/specs/2026-11-11-inventario-monosucursal-y-saneamiento-design.md`).

- `bold-plantilla-base-inventariable.xlsx` — plantilla "Sin Factura Electrónica" de
  inventariables. Una sola columna de existencia (`Sucursal-2611 - Sucursal Principal`). El
  runtime la renombra al `warehouseId` del cliente y, si tiene FE activa, le inyecta la
  columna `Impuesto*` y reescribe la hoja `Instrucciones`.
- `bold-plantilla-base-noinventariable.xlsx` — ídem para no-inventariables. Sin columnas
  de existencia (por definición).

### Cómo rotar

Bold puede cambiar el formato en cualquier momento. Rotación manual:

1. Entrar a una cuenta Bold POS con **una sola sucursal** y **sin facturación electrónica**.
2. Ítems → Lista de ítems → Importar → Iniciar creación masiva.
3. Descargar las dos plantillas (inventariable + no inventariable).
4. Reemplazar los 2 archivos de `vendor/` por los recién bajados, conservando los nombres
   `bold-plantilla-base-inventariable.xlsx` y `bold-plantilla-base-noinventariable.xlsx`.
5. Correr `node --test tests/inv-plantilla-sintetica.test.mjs` — el smoke test valida la
   estructura.
6. Si el test falla por cambio de estructura, hay que actualizar `js/inv-plantilla-sintetica.js`
   para acompañar el cambio.

Última rotación: 2026-11-11 (cuenta demo de Jeffrey, `warehouseId=2611`).
```

Guardalo en `vendor/README.md`.

- [ ] **Step 4: Verificar el estado del working tree**

```bash
git status --short vendor/
```

Esperado:
```
R  vendor/Plantilla de Ítems Inventariables Bold POS (Sin Factura Electronica).xlsx -> vendor/bold-plantilla-base-inventariable.xlsx
R  vendor/Plantilla de Ítems No Inventariables Bold POS (Sin Factura Electronica).xlsx -> vendor/bold-plantilla-base-noinventariable.xlsx
D  vendor/Plantilla de Ítems Inventariables Bold POS (1).xlsx
D  vendor/Plantilla de Ítems No Inventariables Bold POS.xlsx
A  vendor/README.md
```

- [ ] **Step 5: Correr toda la suite — no debe romperse nada**

```bash
node --test tests/*.test.mjs 2>&1 | tail -5
```

Esperado: `pass N`, `fail 0`. Ningún test referencia los archivos renombrados (verificado en
`tests/inv-excel.test.mjs` — usa fixtures de `tests/fixtures/`, no `vendor/`).

- [ ] **Step 6: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore(inventario): renombrar las plantillas base de Bold en vendor/

Las usa el camino mono-sucursal del conversor para armar la plantilla sin pedir
que el cliente la descargue. Los nombres técnicos facilitan el fetch programático
y el README documenta la rotación.

Se borran las variantes "Con FE" porque la columna Impuesto se inyecta en runtime
sobre la base "Sin FE": una sola fuente de la verdad para la estructura.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `js/inv-saneamiento.js` — función `sanear` + tests

Módulo puro que reemplaza/borra caracteres prohibidos de Bold según la lista acordada.

**Files:**
- Create: `js/inv-saneamiento.js`
- Create: `tests/inv-saneamiento.test.mjs`

- [ ] **Step 1: Escribir el test**

Crear `tests/inv-saneamiento.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { sanear } from '../js/inv-saneamiento.js'

test('sanear: reemplaza acento grave por apóstrofe', () => {
  assert.equal(sanear('Café`especial'), "Café'especial")
})

test('sanear: reemplaza acento agudo suelto por apóstrofe', () => {
  assert.equal(sanear('Café´especial'), "Café'especial")
})

test('sanear: reemplaza grado por numeral', () => {
  assert.equal(sanear('Tasa °18'), 'Tasa #18')
})

test('sanear: elimina llaves, pipe, porcentaje, interrogaciones y signos de exclamación', () => {
  assert.equal(sanear('{Promoción}'), 'Promoción')
  assert.equal(sanear('¡Hola!'), 'Hola')
  assert.equal(sanear('A%B?C'), 'ABC')
  assert.equal(sanear('A|B'), 'AB')
})

test('sanear: colapsa espacios dejados por caracteres borrados', () => {
  assert.equal(sanear('A | B'), 'A B')
})

test('sanear: trim en los extremos', () => {
  assert.equal(sanear('   hola   '), 'hola')
})

test('sanear: queda vacío si el string era solo caracteres prohibidos', () => {
  assert.equal(sanear('¡!?%'), '')
  assert.equal(sanear('   '), '')
})

test('sanear: preserva tildes normales dentro de palabras', () => {
  assert.equal(sanear('canción'), 'canción')
  assert.equal(sanear('Panadería'), 'Panadería')
})

test('sanear: null/undefined → cadena vacía (no explota)', () => {
  assert.equal(sanear(null), '')
  assert.equal(sanear(undefined), '')
})

test('sanear: números y letras no-latinas pasan sin modificar', () => {
  assert.equal(sanear('ABC123 xyz'), 'ABC123 xyz')
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
node --test tests/inv-saneamiento.test.mjs 2>&1 | tail -10
```

Esperado: todos los tests fallan con `Cannot find module '../js/inv-saneamiento.js'`.

- [ ] **Step 3: Escribir `js/inv-saneamiento.js`**

```js
// js/inv-saneamiento.js — quita caracteres que Bold rechaza en el import.
//
// Las tildes aguda y grave aisladas se reemplazan por apóstrofe (una de las dos
// no se usa en español; la otra, como apóstrofe, se puede reemplazar sin perder
// significado). El símbolo ° se reemplaza por # cuando aparece suelto (uso
// típico: "N°5" → "N#5"). Los demás son prohibidos por seguridad de Bold y se
// borran. Las tildes normales dentro de palabras ("canción") NO se tocan: la
// regex se aplica al carácter crudo, no a tildes combinadas.

const REEMPLAZOS = [
  [/[`´]/g, "'"],   // acentos sueltos → apóstrofe
  [/°/g, '#'],      // grado → numeral
  [/[{}|%?¡!]/g, ''], // prohibidos sin reemplazo
]

export function sanear(texto) {
  if (texto === null || texto === undefined) return ''
  let s = String(texto)
  for (const [patron, reemplazo] of REEMPLAZOS) s = s.replace(patron, reemplazo)
  return s.replace(/\s+/g, ' ').trim()
}
```

- [ ] **Step 4: Correr el test — debe pasar todo**

```bash
node --test tests/inv-saneamiento.test.mjs 2>&1 | tail -10
```

Esperado: `# pass 10`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add js/inv-saneamiento.js tests/inv-saneamiento.test.mjs
git commit -m "$(cat <<'EOF'
feat(inventario): sanear caracteres prohibidos de Bold

Nuevo módulo puro inv-saneamiento. Reemplaza acentos grave/agudo sueltos por
apóstrofe, grado por numeral, y borra { } | % ? ¡ ! que Bold rechaza en el
import. Se usa en el conversor sobre los campos de texto antes de escribirlos
al xlsx de salida (Task 7) y dentro del purgador antes de normalizar (Task 4).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `js/inv-purgador.js` — función `purgar` + tests

Módulo puro de dedup heurístico. Spec 2 lo upgradea para llamar a Vertex sin cambiar su
firma.

**Files:**
- Create: `js/inv-purgador.js`
- Create: `tests/inv-purgador.test.mjs`

- [ ] **Step 1: Escribir el test**

Crear `tests/inv-purgador.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { purgar } from '../js/inv-purgador.js'

test('purgar: lista vacía', () => {
  const r = purgar([])
  assert.deepEqual(r.limpias, [])
  assert.deepEqual(r.mapeo, {})
  assert.equal(r.informe.duplicados_exactos, 0)
  assert.equal(r.informe.singulares_plurales, 0)
})

test('purgar: dedup exacto normalizado (mayúsculas, tildes, espacios)', () => {
  const r = purgar(['CAMISA', 'camisa', 'Camisa ', 'Cámisa'])
  assert.equal(r.limpias.length, 1)
  assert.equal(r.mapeo['CAMISA'], r.limpias[0])
  assert.equal(r.mapeo['camisa'], r.limpias[0])
  assert.equal(r.mapeo['Camisa '], r.limpias[0])
  assert.equal(r.mapeo['Cámisa'], r.limpias[0])
  assert.equal(r.informe.duplicados_exactos, 3) // 4 entradas, 3 merges
})

test('purgar: canónica = forma más larga', () => {
  const r = purgar(['Camisa', 'camisa HOMBRE'])
  assert.equal(r.limpias.length, 2)
  assert.ok(r.limpias.includes('camisa HOMBRE'))
  assert.ok(r.limpias.includes('Camisa'))
})

test('purgar: canónica cuando empatan es la primera en entrar (conserva orden)', () => {
  const r = purgar(['Camisa', 'camisa'])
  // Ambas normalizadas = 'camisa'. Empatan en longitud. Canónica: la primera.
  assert.equal(r.limpias[0], 'Camisa')
})

test('purgar: singular/plural en castellano (-s / -es)', () => {
  const r = purgar(['Camisa', 'Camisas', 'Pantalón', 'Pantalones'])
  assert.equal(r.limpias.length, 2)
  assert.ok(r.limpias.includes('Camisas'))   // la forma más larga
  assert.ok(r.limpias.includes('Pantalones'))
  assert.equal(r.informe.singulares_plurales, 2)
})

test('purgar: saneamiento integrado antes de normalizar', () => {
  // Café°5 → Café#5; Café#5 ya existe tal cual.
  const r = purgar(['Café°5', 'Café#5'])
  assert.equal(r.limpias.length, 1)
})

test('purgar: null/undefined/string vacío se filtran', () => {
  const r = purgar([null, undefined, '', '   ', 'Camisa'])
  assert.equal(r.limpias.length, 1)
  assert.equal(r.limpias[0], 'Camisa')
})

test('purgar: orden de la salida es alfabético por canónica', () => {
  const r = purgar(['Zapato', 'Bebida', 'Camisa'])
  assert.deepEqual(r.limpias, ['Bebida', 'Camisa', 'Zapato'])
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
node --test tests/inv-purgador.test.mjs 2>&1 | tail -10
```

Esperado: todos fallan por `Cannot find module`.

- [ ] **Step 3: Escribir `js/inv-purgador.js`**

```js
// js/inv-purgador.js — dedup heurístico de listas de categorías o unidades.
//
// Spec 1 (acá): solo heurístico — normalizar + colapsar duplicados exactos
// post-sanitización + singular/plural. Sin IA. Preserva el casing/tildes de
// la canónica elegida (la forma más larga; empate = primera en aparecer).
//
// Spec 2 (futuro): recibe una lista ya purgada por acá y le aplica agrupación
// semántica con Vertex/Gemini sobre las canónicas, con cache por cuenta en
// Supabase. Esa pasada no toca este módulo — se agrega encima.
import { sanear } from './inv-saneamiento.js'
import { normalizar } from './inv-numeros.js'

// Dos formas se consideran la misma si una es el "plural" de la otra, con -s o -es.
// Reusa la raíz que ya usa inv-convertir.js:33.
const raiz = s => normalizar(s).replace(/(es|s)$/, '')

export function purgar(lista) {
  const entradas = lista
    .map(v => ({ original: v, saneado: sanear(v) }))
    .filter(e => e.saneado.length > 0)

  // Paso 1: dedup exacto por normalización. Para cada grupo, la canónica es la
  // forma más larga; empate → primera en entrar (mantiene orden de aparición).
  const porNorm = new Map()
  let duplicadosExactos = 0
  for (const e of entradas) {
    const n = normalizar(e.saneado)
    if (!porNorm.has(n)) porNorm.set(n, e.saneado)
    else {
      duplicadosExactos++
      const actual = porNorm.get(n)
      if (e.saneado.length > actual.length) porNorm.set(n, e.saneado)
    }
  }

  // Paso 2: colapsar singular/plural. Cada raíz queda con una única canónica
  // (la más larga de las que comparten raíz).
  const porRaiz = new Map()
  let singularesPlurales = 0
  for (const canonica of porNorm.values()) {
    const r = raiz(canonica)
    if (!porRaiz.has(r)) porRaiz.set(r, canonica)
    else {
      singularesPlurales++
      const actual = porRaiz.get(r)
      if (canonica.length > actual.length) porRaiz.set(r, canonica)
    }
  }

  // Paso 3: armar mapeo original → canónica final. Para cada entrada, su
  // canónica es la del grupo de la raíz de su saneado.
  const limpiasSet = new Set(porRaiz.values())
  const mapeo = {}
  for (const e of entradas) {
    const r = raiz(e.saneado)
    mapeo[e.original] = porRaiz.get(r)
  }

  const limpias = [...limpiasSet].sort((a, b) =>
    normalizar(a).localeCompare(normalizar(b)))

  return {
    limpias,
    mapeo,
    informe: { duplicados_exactos: duplicadosExactos, singulares_plurales: singularesPlurales },
  }
}
```

- [ ] **Step 4: Correr el test — debe pasar todo**

```bash
node --test tests/inv-purgador.test.mjs 2>&1 | tail -10
```

Esperado: `# pass 8`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add js/inv-purgador.js tests/inv-purgador.test.mjs
git commit -m "$(cat <<'EOF'
feat(inventario): purgador heurístico de categorías y unidades

Módulo puro inv-purgador. Dedup por normalización + singular/plural, pasando
antes por el saneador. Preserva casing/tildes de la canónica (la forma más
larga; empate → primera en entrar). Lo usa el conversor en Task 8 para limpiar
las listas de categorías y unidades del archivo del cliente antes de escribirlas
al output.

Spec 2 (futuro) agrega agrupación semántica con Vertex/Gemini encima, sin
cambiar la firma de este módulo.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `js/inv-plantilla-sintetica.js` — `construirPlantilla` + tests

Módulo puro que levanta los xlsx base de `vendor/`, los adapta al `warehouseId` del cliente
y a la configuración de FE, y devuelve `{ wb, info }` igual que si la plantilla hubiera sido
subida por el cliente.

**Files:**
- Create: `js/inv-plantilla-sintetica.js`
- Create: `tests/inv-plantilla-sintetica.test.mjs`

- [ ] **Step 1: Escribir los tests**

Crear `tests/inv-plantilla-sintetica.test.mjs`:

```js
// Pruebas contra los xlsx reales de vendor/ — doble función:
// (1) verificar que construirPlantilla produce la info esperada;
// (2) smoke test: si alguien rota los archivos base mal, falla en CI.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { construirPlantilla } from '../js/inv-plantilla-sintetica.js'

const XLSX = createRequire(import.meta.url)('../vendor/xlsx.full.min.js')
const leerBase = nombre => fs.readFileSync(
  new URL(`../vendor/${nombre}`, import.meta.url))

const baseInv = () => leerBase('bold-plantilla-base-inventariable.xlsx')
const baseNoInv = () => leerBase('bold-plantilla-base-noinventariable.xlsx')

test('construirPlantilla: inventariable sin FE', () => {
  const { info } = construirPlantilla(XLSX, {
    baseBytes: baseInv(), warehouseId: '9999', conFE: false, tipo: 'inventariable',
  })
  assert.equal(info.tipo, 'inventariable')
  assert.equal(info.sucursal, 'Sucursal-9999')
  assert.equal(info.tieneIsv, false)
  assert.deepEqual(info.listas.categorias, ['General'])
  assert.ok(info.listas.unidades.includes('Unidades'))
  assert.equal(info.listas.unidades.length, 15)
  assert.deepEqual(info.listas.impuestos, [])
})

test('construirPlantilla: inventariable con FE', () => {
  const { info } = construirPlantilla(XLSX, {
    baseBytes: baseInv(), warehouseId: '9999', conFE: true, tipo: 'inventariable',
  })
  assert.equal(info.tieneIsv, true)
  assert.deepEqual(info.listas.impuestos, ['EXCLUIDO', 'EXENTO', 'INC-8', 'IVA-5', 'IVA-19'])
})

test('construirPlantilla: no inventariable sin FE', () => {
  const { info } = construirPlantilla(XLSX, {
    baseBytes: baseNoInv(), warehouseId: '9999', conFE: false, tipo: 'noinventariable',
  })
  assert.equal(info.tipo, 'noinventariable')
  assert.equal(info.sucursal, '')  // no-inv no tiene columna de existencia
  assert.equal(info.tieneIsv, false)
  assert.deepEqual(info.listas.categorias, ['General'])
})

test('construirPlantilla: no inventariable con FE inyecta Impuesto*', () => {
  const { info } = construirPlantilla(XLSX, {
    baseBytes: baseNoInv(), warehouseId: '9999', conFE: true, tipo: 'noinventariable',
  })
  assert.equal(info.tieneIsv, true)
})

test('construirPlantilla: bytes vacíos tiran parse_fallo', () => {
  assert.throws(
    () => construirPlantilla(XLSX, {
      baseBytes: new Uint8Array(0), warehouseId: '1', conFE: false, tipo: 'inventariable',
    }),
    /parse_fallo/,
  )
})

test('construirPlantilla: wb devuelto se puede re-serializar', () => {
  const { wb } = construirPlantilla(XLSX, {
    baseBytes: baseInv(), warehouseId: '9999', conFE: true, tipo: 'inventariable',
  })
  // Simula la ruta de descarga: write → read. No debe reventar.
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const copia = XLSX.read(bytes, { type: 'array' })
  assert.ok(copia.SheetNames.includes('Item Inventariable'))
  assert.ok(copia.SheetNames.includes('Instrucciones'))
})
```

- [ ] **Step 2: Correr tests para verificar que fallan**

```bash
node --test tests/inv-plantilla-sintetica.test.mjs 2>&1 | tail -10
```

Esperado: todos fallan por `Cannot find module '../js/inv-plantilla-sintetica.js'`.

- [ ] **Step 3: Escribir `js/inv-plantilla-sintetica.js`**

```js
// js/inv-plantilla-sintetica.js — arma la plantilla Bold que descarga el
// cliente en el camino mono-sucursal, sin que tenga que subir la suya.
//
// Toma un xlsx base de vendor/ (una plantilla "Sin FE" de una cuenta demo), le
// pone el warehouseId del cliente en la columna de existencia, inyecta la
// columna Impuesto* si la cuenta tiene FE, y reescribe la hoja Instrucciones
// para dejar solo los defaults canónicos de Bold (General + 15 unidades + 5
// impuestos). Devuelve { wb, info } igual que leerPlantilla() de inv-plantilla.
//
// XLSX se inyecta como parámetro: el módulo es puro y no toca ni DOM ni red.
// En producción lo llama inv-sesion.agregarPlantillaSintetica, que fetchea el
// base y pasa los bytes acá.
import { leerPlantilla } from './inv-plantilla.js'

export const UNIDADES_CANONICAS_BOLD = [
  'Centímetros', 'Galónes', 'Gramos', 'Kilogramos', 'Libras', 'Litros',
  'Metros', 'Metros cuadrados', 'Metros cúbicos', 'Miligramos', 'Mililitros',
  'Milímetros', 'Onzas', 'Par', 'Unidades',
]
export const IMPUESTOS_CANONICOS_BOLD = ['EXCLUIDO', 'EXENTO', 'INC-8', 'IVA-5', 'IVA-19']

const HOJAS_ITEMS = {
  inventariable: 'Item Inventariable',
  noinventariable: 'Item No Inventariable',
}

export function construirPlantilla(XLSX, { baseBytes, warehouseId, conFE, tipo }) {
  const wb = leer(XLSX, baseBytes)
  const nombreHoja = HOJAS_ITEMS[tipo]
  const hoja = wb.Sheets[nombreHoja]
  if (!hoja) throw new Error(`estructura_cambio: falta hoja "${nombreHoja}"`)
  const instrucciones = wb.Sheets['Instrucciones']
  if (!instrucciones) throw new Error('estructura_cambio: falta hoja "Instrucciones"')

  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' })
  const filaEncabezado = filas.findIndex(f =>
    f.some(c => /^codigo/i.test(String(c).trim())) &&
    f.some(c => /^nombre/i.test(String(c).trim())))
  if (filaEncabezado < 0) throw new Error('estructura_cambio: no encontré el encabezado')
  const encabezados = filas[filaEncabezado]

  if (tipo === 'inventariable') renombrarSucursal(encabezados, warehouseId)
  if (conFE) inyectarImpuesto(encabezados, filas, filaEncabezado)

  // Escribir filas modificadas de vuelta a la hoja.
  const nuevaHoja = XLSX.utils.aoa_to_sheet(filas)
  wb.Sheets[nombreHoja] = nuevaHoja

  // Reescribir Instrucciones con las listas canónicas.
  wb.Sheets['Instrucciones'] = XLSX.utils.aoa_to_sheet(construirInstrucciones(conFE))

  // Releer con leerPlantilla para devolver la misma forma que usaría
  // una plantilla subida por el cliente.
  const hojasParaLeer = {
    [nombreHoja]: XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { header: 1, defval: '' }),
    Instrucciones: XLSX.utils.sheet_to_json(wb.Sheets['Instrucciones'], { header: 1, defval: '' }),
  }
  const info = leerPlantilla(hojasParaLeer)
  if (!info) throw new Error('estructura_cambio: leerPlantilla devolvió null')

  return { wb, info }
}

function leer(XLSX, baseBytes) {
  try {
    return XLSX.read(baseBytes, { type: 'array' })
  } catch {
    throw new Error('parse_fallo: no pude leer el xlsx base')
  }
}

function renombrarSucursal(encabezados, warehouseId) {
  const cols = encabezados
    .map((c, i) => [i, String(c ?? '')])
    .filter(([, texto]) => /^existencia inicial en sucursal-/i.test(texto))
  if (cols.length === 0) {
    throw new Error('estructura_cambio: no hay columna de existencia en inventariable')
  }
  if (cols.length > 1) {
    throw new Error(`estructura_cambio: hay ${cols.length} columnas de existencia (esperaba 1)`)
  }
  encabezados[cols[0][0]] = `Existencia Inicial en Sucursal-${warehouseId}`
}

function inyectarImpuesto(encabezados, filas, filaEncabezado) {
  const idx = encabezados.findIndex(c =>
    /^precio venta total/i.test(String(c ?? '').trim()))
  if (idx < 0) throw new Error('estructura_cambio: falta Precio Venta Total* para inyectar Impuesto*')
  // Insertar celda nueva en el header row...
  encabezados.splice(idx + 1, 0, 'Impuesto*')
  // ...y en TODAS las filas de data (para que las columnas se alineen).
  for (let i = 0; i < filas.length; i++) {
    if (i === filaEncabezado) continue
    filas[i].splice(idx + 1, 0, '')
  }
}

function construirInstrucciones(conFE) {
  // Mantiene los títulos originales que trae el base, con las listas limpias.
  // Formato observado en vendor/: encabezado en fila 0, listas en columnas desde fila 1.
  const titulos = conFE
    ? ['Listado de impuestos:', 'Listado de Unidades:', 'Categorias:']
    : ['Listado de Unidades:', 'Categorias:']
  const columnas = conFE
    ? [IMPUESTOS_CANONICOS_BOLD, UNIDADES_CANONICAS_BOLD, ['General']]
    : [UNIDADES_CANONICAS_BOLD, ['General']]
  const maxFilas = Math.max(...columnas.map(c => c.length))
  const data = [titulos]
  for (let i = 0; i < maxFilas; i++) {
    data.push(columnas.map(c => c[i] ?? ''))
  }
  return data
}
```

- [ ] **Step 4: Correr los tests — deben pasar todos**

```bash
node --test tests/inv-plantilla-sintetica.test.mjs 2>&1 | tail -10
```

Esperado: `# pass 6`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add js/inv-plantilla-sintetica.js tests/inv-plantilla-sintetica.test.mjs
git commit -m "$(cat <<'EOF'
feat(inventario): plantilla sintética para el camino mono-sucursal

Nuevo módulo puro inv-plantilla-sintetica. Toma el xlsx base de vendor/,
renombra la sucursal al warehouseId del cliente, inyecta la columna Impuesto*
si hay FE, y reescribe la hoja Instrucciones con las listas canónicas de Bold
(1 categoría General + 15 unidades + 5 impuestos). Devuelve { wb, info } con
la misma forma que leerPlantilla() de una plantilla subida: downstream (el
conversor, pasoResultado, descarga) no se entera.

Los tests contra los archivos reales de vendor/ hacen de smoke test: si alguien
rota mal el archivo o Bold cambia el formato, CI falla antes de prod.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `inv-sesion.agregarPlantillaSintetica` + tests

Cablea `construirPlantilla` detrás del fetch de los bases de `vendor/` con un retry para
fallas de red, y guarda las plantillas en `estado.plantillas` igual que si las hubiera
subido el cliente.

**Files:**
- Modify: `js/inv-sesion.js` (agregar método)
- Create: `tests/inv-sesion.test.mjs`

- [ ] **Step 1: Escribir los tests**

Crear `tests/inv-sesion.test.mjs`:

```js
// Tests de inv-sesion focalizados en agregarPlantillaSintetica. Para los
// métodos existentes (agregarPlantilla, cargarOrigen, recalcular) ya están
// los tests de los módulos que usan (inv-plantilla, inv-origen, inv-convertir).
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { crearSesion } from '../js/inv-sesion.js'

const XLSX = createRequire(import.meta.url)('../vendor/xlsx.full.min.js')

// Para que inv-sesion pueda usar SheetJS en tests (donde no hay <script> para
// cargarlo), lo ponemos en globalThis.
globalThis.XLSX = XLSX

const bytesBase = nombre => fs.readFileSync(
  new URL(`../vendor/${nombre}`, import.meta.url))

function mockFetch({ falla = 0 } = {}) {
  let llamadas = 0
  globalThis.fetch = async (url) => {
    llamadas++
    if (llamadas <= falla) throw new Error('simulada')
    const nombre = url.toString().split('/').pop()
    return {
      ok: true,
      arrayBuffer: async () => bytesBase(nombre),
    }
  }
  return () => llamadas
}

test('agregarPlantillaSintetica: fetch OK, guarda ambos tipos', async () => {
  mockFetch()
  const sesion = crearSesion()
  const r = await sesion.agregarPlantillaSintetica({ warehouseId: '9999', conFE: true })
  assert.equal(r.ok, true)
  assert.ok(sesion.estado.plantillas.inventariable)
  assert.ok(sesion.estado.plantillas.noinventariable)
  assert.equal(sesion.estado.plantillas.inventariable.info.sucursal, 'Sucursal-9999')
  assert.equal(sesion.estado.plantillas.inventariable.info.tieneIsv, true)
})

test('agregarPlantillaSintetica: retry — falla 1 vez, responde al segundo intento', async () => {
  const contar = mockFetch({ falla: 1 })
  const sesion = crearSesion()
  const r = await sesion.agregarPlantillaSintetica({ warehouseId: '1', conFE: false })
  assert.equal(r.ok, true)
  assert.ok(contar() > 2)  // al menos 2 intentos en algún archivo
})

test('agregarPlantillaSintetica: falla 2 veces → devuelve error fetch_fallo', async () => {
  mockFetch({ falla: 99 })
  const sesion = crearSesion()
  const r = await sesion.agregarPlantillaSintetica({ warehouseId: '1', conFE: false })
  assert.equal(r.ok, undefined)
  assert.equal(r.codigo, 'fetch_fallo')
  assert.deepEqual(sesion.estado.plantillas, {})
})
```

- [ ] **Step 2: Correr tests para verificar que fallan**

```bash
node --test tests/inv-sesion.test.mjs 2>&1 | tail -10
```

Esperado: tests fallan porque `agregarPlantillaSintetica` no existe.

- [ ] **Step 3: Agregar el método en `js/inv-sesion.js`**

Edit `js/inv-sesion.js` — después del método `agregarPlantilla` (alrededor de línea 52) y
antes de `cargarOrigen`. También importar `construirPlantilla` arriba.

En la sección de imports, cambiar:

```js
import { leerPlantilla } from './inv-plantilla.js'
```

a:

```js
import { leerPlantilla } from './inv-plantilla.js'
import { construirPlantilla } from './inv-plantilla-sintetica.js'

const BASES = {
  inventariable: '/vendor/bold-plantilla-base-inventariable.xlsx',
  noinventariable: '/vendor/bold-plantilla-base-noinventariable.xlsx',
}
```

Y después del método `agregarPlantilla`, agregar:

```js
    // Arma la plantilla por el cliente mono-sucursal sin pedirle que la suba.
    // Fetcha los dos bases de vendor/ en paralelo (con 1 retry para fallas de
    // red), les inyecta warehouseId y, si corresponde, la columna Impuesto*.
    // En caso de fallo cae al flujo multi (el chat pide la plantilla manual).
    async agregarPlantillaSintetica({ warehouseId, conFE }) {
      const XLSX = await cargarXlsx()
      try {
        const [invBytes, noInvBytes] = await Promise.all([
          fetchConRetry(BASES.inventariable),
          fetchConRetry(BASES.noinventariable),
        ])
        const inv = construirPlantilla(XLSX, {
          baseBytes: invBytes, warehouseId, conFE, tipo: 'inventariable',
        })
        const noInv = construirPlantilla(XLSX, {
          baseBytes: noInvBytes, warehouseId, conFE, tipo: 'noinventariable',
        })
        estado.plantillas.inventariable = { info: inv.info, wb: inv.wb, nombre: '(plantilla preparada para vos)' }
        estado.plantillas.noinventariable = { info: noInv.info, wb: noInv.wb, nombre: '(plantilla preparada para vos)' }
        return { ok: true }
      } catch (e) {
        const msg = String(e?.message ?? e)
        const codigo = /^parse_fallo/.test(msg) ? 'parse_fallo'
          : /^estructura_cambio/.test(msg) ? 'estructura_cambio'
          : 'fetch_fallo'
        return { error: 'No pude preparar la plantilla por vos.', codigo }
      }
    },
```

Y arriba del `export function crearSesion`, agregar el helper de fetch con retry:

```js
// Un retry con backoff 300→800ms solo para fallos de red; errores de parse o
// estructura no se reintentan porque son determinísticos.
async function fetchConRetry(url) {
  const intentar = () => fetch(url).then(r => {
    if (!r.ok) throw new Error(`http ${r.status}`)
    return r.arrayBuffer()
  })
  try { return await intentar() }
  catch { await new Promise(r => setTimeout(r, 300))
          try { return await intentar() }
          catch { await new Promise(r => setTimeout(r, 800))
                  return await intentar() } }
}
```

- [ ] **Step 4: Correr los tests — deben pasar**

```bash
node --test tests/inv-sesion.test.mjs 2>&1 | tail -10
```

Esperado: `# pass 3`, `# fail 0`.

- [ ] **Step 5: Verificar que la suite completa sigue verde**

```bash
node --test tests/*.test.mjs 2>&1 | tail -5
```

Esperado: `pass`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add js/inv-sesion.js tests/inv-sesion.test.mjs
git commit -m "$(cat <<'EOF'
feat(inventario): inv-sesion.agregarPlantillaSintetica para mono-sucursal

Fetcha los dos archivos base de vendor/ en paralelo (con 1 retry para
fallos de red), los pasa por construirPlantilla y guarda las plantillas en
estado.plantillas como si el cliente las hubiera subido. Downstream (el
conversor, pasoResultado, la descarga) no se entera. En caso de error
devuelve un codigo estable (fetch_fallo | parse_fallo | estructura_cambio)
para que el chat caiga al flujo multi (Task 11).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `inv-convertir.js` — aplicar `sanear()` a los campos de texto del output

Primer cambio al conversor: asegurar que ningún caracter prohibido se cuele a la plantilla
Bold. Mínimo scope, tests focales.

**Files:**
- Modify: `js/inv-convertir.js` (import + aplicación en el `forEach`)
- Modify: `tests/inv-convertir.test.mjs` (tests nuevos)

- [ ] **Step 1: Escribir el test nuevo**

Append al final de `tests/inv-convertir.test.mjs`:

```js
test('convertir: aplica sanear a los campos de texto de salida', () => {
  const p = leerPlantilla(hojasInv())
  const encabezados = ['Nombre', 'Precio', 'Codigo', 'Descripcion']
  const mapeo = mapearColumnas(encabezados)
  const filas = [
    ['Café`especial {promo}', '12000', 'A°1', '¡Hola! mundo'],
  ]
  const r = convertir({ filas, mapeo, plantillas: { inventariable: p }, opciones: {} })
  const out = r.salidas.inventariable[0]
  assert.equal(out.nombre, "Café'especial promo")
  assert.equal(out.codigo, 'A#1')
  assert.equal(out.descripcion, 'Hola mundo')
})
```

- [ ] **Step 2: Correr el test — debe fallar**

```bash
node --test tests/inv-convertir.test.mjs 2>&1 | grep -A2 "sanear a los campos"
```

Esperado: FAIL (los campos salen con los caracteres originales porque no hay saneamiento).

- [ ] **Step 3: Modificar `js/inv-convertir.js`**

Agregar al tope del archivo, después del import existente:

```js
import { sanear } from './inv-saneamiento.js'
```

Dentro de la función `convertir`, en el bloque que arma `out` (alrededor de línea 157-160),
envolver los campos de texto con `sanear`. Reemplazar:

```js
    const out = {
      codigo, nombre, categoria, referencia: aTexto(get(fila, 'referencia')),
      descripcion: aTexto(get(fila, 'descripcion')), unidad, costo, precioTotal,
    }
```

por:

```js
    const out = {
      codigo: sanear(codigo),
      nombre: sanear(nombre),
      categoria: sanear(categoria),
      referencia: sanear(aTexto(get(fila, 'referencia'))),
      descripcion: sanear(aTexto(get(fila, 'descripcion'))),
      unidad: sanear(unidad),
      costo, precioTotal,
    }
```

- [ ] **Step 4: Correr tests — todos pasan**

```bash
node --test tests/inv-convertir.test.mjs 2>&1 | tail -10
```

Esperado: todos los tests existentes siguen pasando + el nuevo.

- [ ] **Step 5: Commit**

```bash
git add js/inv-convertir.js tests/inv-convertir.test.mjs
git commit -m "$(cat <<'EOF'
feat(inventario): sanear campos de texto antes de escribir a la plantilla

El conversor ya no deja pasar los caracteres que Bold rechaza en el import
(backtick, acento agudo suelto, grado, llaves, pipe, porcentaje, ¡!?) en
nombre, código, categoría, referencia, descripción y unidad. El sanitizador
corre sobre el valor que va al `out`, no sobre el header (queremos que el
mapeo opere sobre el nombre original de la columna).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `inv-convertir.js` — aplicar `purgar()` a categorías y unidades

Las listas de categorías y unidades del archivo del cliente pasan por el purgador antes de
que el conversor decida qué escribir en cada fila. Rompe duplicados exactos y singular/plural
para los dos caminos (mono y multi).

**Files:**
- Modify: `js/inv-convertir.js`
- Modify: `tests/inv-convertir.test.mjs`

- [ ] **Step 1: Escribir el test**

Append al final de `tests/inv-convertir.test.mjs`:

```js
test('convertir: aplica el purgador a las categorías del archivo', () => {
  const p = leerPlantilla(hojasInv())
  const encabezados = ['Nombre', 'Precio', 'Categoria']
  const mapeo = mapearColumnas(encabezados)
  const filas = [
    ['Camisa A', '10000', 'CAMISA'],
    ['Camisa B', '10000', 'camisa'],
    ['Camisa C', '10000', 'Camisas'],
  ]
  const r = convertir({ filas, mapeo, plantillas: { inventariable: p }, opciones: {} })
  // Las 3 filas quedan con la misma canónica (singular/plural + case).
  const cats = r.salidas.inventariable.map(x => x.categoria)
  assert.equal(new Set(cats).size, 1)
})

test('convertir: aplica el purgador a las unidades del archivo', () => {
  const p = leerPlantilla(hojasInv())
  const encabezados = ['Nombre', 'Precio', 'Unidad']
  const mapeo = mapearColumnas(encabezados)
  const filas = [
    ['Arroz 500g', '5000', 'Gramos'],
    ['Arroz 1kg',  '9000', 'GRAMOS'],
    ['Arroz 2kg', '17000', 'gramos'],
  ]
  const r = convertir({ filas, mapeo, plantillas: { inventariable: p }, opciones: {} })
  const unidades = r.salidas.inventariable.map(x => x.unidad)
  assert.equal(new Set(unidades).size, 1)
  // La unidad final es la que matchea con la lista de la plantilla.
  assert.equal(unidades[0], 'Gramos')
})
```

- [ ] **Step 2: Correr los tests — pueden pasar o fallar**

```bash
node --test tests/inv-convertir.test.mjs 2>&1 | grep -A2 "purgador"
```

Nota: los tests pueden ya pasar por el dedup implícito que hace `normalizar()` + match de
lista contra la plantilla. Si pasan, es que el mapeo accidental ya cubría el caso — igual
seguimos con la implementación explícita porque el `purgar()` deja telemetría e informe
para el UI del Spec 2.

- [ ] **Step 3: Modificar `js/inv-convertir.js`**

Al tope, agregar import:

```js
import { purgar } from './inv-purgador.js'
```

Dentro de `convertir`, **arriba** del `filas.forEach` (alrededor de línea 94), armar los
mapeos purgados una vez:

```js
  const categoriasOriginales = filas
    .map(f => get(f, 'categoria'))
    .filter(Boolean)
  const unidadesOriginales = filas
    .map(f => get(f, 'unidad'))
    .filter(Boolean)
  const purgaCategorias = purgar(categoriasOriginales)
  const purgaUnidades = purgar(unidadesOriginales)
```

Dentro del `forEach`, donde se calcula `categoria` (alrededor de línea 135), antes del
match contra la lista Bold, reemplazar `aTexto(get(fila, 'categoria'))` por la canónica
purgada:

```js
    // Categoría: debe existir en Bold antes de importar.
    const lista = plantilla.listas.categorias
    const general = lista.find(c => normalizar(c) === 'general') ?? lista[0] ?? 'General'
    const catOriginal = sinPrefijoNumerico(aTexto(get(fila, 'categoria')))
    let categoria = purgaCategorias.mapeo[get(fila, 'categoria')] ?? catOriginal
    if (!categoria) { categoria = general; sinCategoria++ }
    else {
      const existente = lista.find(c => normalizar(c) === normalizar(categoria))
      if (existente) categoria = existente
      else if (opciones.categoriasAGeneral) categoria = general
      else if (!faltanCategorias.has(normalizar(categoria))) faltanCategorias.set(normalizar(categoria), categoria)
    }
```

Idem para unidades, alrededor de línea 119-130:

```js
    // Unidad.
    const listaUnidades = plantilla.listas.unidades
    const unidadOriginalCliente = aTexto(get(fila, 'unidad'))
    const unidadPurgada = purgaUnidades.mapeo[get(fila, 'unidad')] ?? unidadOriginalCliente
    let unidad
    if (!unidadPurgada) unidad = mapearUnidad('Unidades', listaUnidades) ?? listaUnidades[0] ?? 'Unidades'
    else {
      unidad = opciones.unidades?.[unidadPurgada] ?? mapearUnidad(unidadPurgada, listaUnidades)
      if (!unidad) {
        unidadesSinMapa.add(unidadPurgada)
        unidad = mapearUnidad('Unidades', listaUnidades) ?? listaUnidades[0] ?? 'Unidades'
      }
    }
```

- [ ] **Step 4: Correr los tests — todos pasan**

```bash
node --test tests/inv-convertir.test.mjs 2>&1 | tail -10
```

Esperado: `fail 0` en todo el archivo.

- [ ] **Step 5: Commit**

```bash
git add js/inv-convertir.js tests/inv-convertir.test.mjs
git commit -m "$(cat <<'EOF'
feat(inventario): pasar categorías y unidades por el purgador antes de mapear

El conversor levanta las listas de categorías y unidades del archivo del
cliente y las pasa por purgar() antes de intentar matchearlas contra la
plantilla Bold. Rompe duplicados exactos (CAMISA = camisa = "Camisa ") y
singular/plural (Camisas = Camisa). Reduce el ruido del flujo de "categorías
faltantes" y le deja el camino preparado al purgador con IA (Spec 2).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `inv-convertir.js` — estrategias de IVA (`por_fila` / `todos_igual`)

Reemplaza la lógica actual de IVA por las dos estrategias acordadas, con `ivaGeneral`
opcional/obligatorio según corresponda.

**Files:**
- Modify: `js/inv-convertir.js`
- Modify: `tests/inv-convertir.test.mjs`

- [ ] **Step 1: Escribir los tests**

Append:

```js
test('convertir: IVA por_fila sin ivaGeneral → cada fila usa su propio valor', () => {
  const p = leerPlantilla(hojasInv([['Impuesto*']]))
  const encabezados = ['Nombre', 'Precio', 'Impuesto']
  const mapeo = mapearColumnas(encabezados)
  const filas = [
    ['A', '10000', '19'],
    ['B', '10000', '5'],
  ]
  const r = convertir({
    filas, mapeo, plantillas: { inventariable: p },
    opciones: { isv: true, ivaStrategy: 'por_fila' },
  })
  assert.equal(r.salidas.inventariable[0].isv, 'IVA-19')
  assert.equal(r.salidas.inventariable[1].isv, 'IVA-5')
})

test('convertir: IVA por_fila con ivaGeneral de fallback — Caso C respetar', () => {
  const p = leerPlantilla(hojasInv([['Impuesto*']]))
  const encabezados = ['Nombre', 'Precio', 'Impuesto']
  const mapeo = mapearColumnas(encabezados)
  const filas = [
    ['A', '10000', '5'],    // trae IVA → respeta
    ['B', '10000', ''],     // vacío → cae al general IVA-19
  ]
  const r = convertir({
    filas, mapeo, plantillas: { inventariable: p },
    opciones: { isv: true, ivaStrategy: 'por_fila', ivaGeneral: 'IVA-19' },
  })
  assert.equal(r.salidas.inventariable[0].isv, 'IVA-5')
  assert.equal(r.salidas.inventariable[1].isv, 'IVA-19')
})

test('convertir: IVA todos_igual → aplica ivaGeneral a todas, ignora el archivo', () => {
  const p = leerPlantilla(hojasInv([['Impuesto*']]))
  const encabezados = ['Nombre', 'Precio', 'Impuesto']
  const mapeo = mapearColumnas(encabezados)
  const filas = [
    ['A', '10000', '5'],
    ['B', '10000', '19'],
  ]
  const r = convertir({
    filas, mapeo, plantillas: { inventariable: p },
    opciones: { isv: true, ivaStrategy: 'todos_igual', ivaGeneral: 'IVA-19' },
  })
  assert.equal(r.salidas.inventariable[0].isv, 'IVA-19')
  assert.equal(r.salidas.inventariable[1].isv, 'IVA-19')
})

test('convertir: IVA — por_fila sin general y fila vacía → EXENTO (backward compat)', () => {
  const p = leerPlantilla(hojasInv([['Impuesto*']]))
  const encabezados = ['Nombre', 'Precio', 'Impuesto']
  const mapeo = mapearColumnas(encabezados)
  const filas = [['A', '10000', '']]
  const r = convertir({
    filas, mapeo, plantillas: { inventariable: p },
    opciones: { isv: true, ivaStrategy: 'por_fila' },
  })
  assert.equal(r.salidas.inventariable[0].isv, 'EXENTO')
})
```

**Nota:** la plantilla simulada acá agrega `Impuesto*` como extra; ajustar `hojasInv` para
tener Instrucciones con `IVA-19` e `IVA-5` (ya los tiene la fixture, verificar).

- [ ] **Step 2: Correr los tests — deben fallar (opciones nuevas no existen)**

```bash
node --test tests/inv-convertir.test.mjs 2>&1 | grep -A2 "IVA"
```

Esperado: los 3 tests nuevos fallan o pasan accidental. Si pasan accidental (porque por
coincidencia la implementación actual cumple), igual seguimos para hacerlo explícito.

- [ ] **Step 3: Modificar `js/inv-convertir.js`**

Reemplazar el bloque actual de IVA (alrededor de línea 169-174):

```js
    if (plantilla.tieneIsv && opciones.isv !== false) {
      if (pct == null) { pct = 0; sinImpuesto++ }
      const opcion = mapearImpuesto(pct, plantilla.listas.impuestos)
      if (!opcion) aviso(n, `"${nombre}": el impuesto ${pct}% no está en tu plantilla; se dejó vacío.`)
      out.isv = opcion ?? ''
    }
```

por:

```js
    if (plantilla.tieneIsv && opciones.isv !== false) {
      const strategy = opciones.ivaStrategy ?? 'por_fila'
      let elegido
      if (strategy === 'todos_igual') {
        if (!opciones.ivaGeneral) {
          throw new Error('ivaStrategy=todos_igual requiere opciones.ivaGeneral')
        }
        elegido = opciones.ivaGeneral
      } else {
        // por_fila: usa el valor del archivo; si falta, cae a ivaGeneral si está,
        // o al EXENTO default (comportamiento actual).
        if (pct == null) {
          sinImpuesto++
          if (opciones.ivaGeneral) elegido = opciones.ivaGeneral
          else {
            const exento = mapearImpuesto(0, plantilla.listas.impuestos)
            elegido = exento ?? ''
          }
        } else {
          const opcion = mapearImpuesto(pct, plantilla.listas.impuestos)
          if (!opcion) aviso(n, `"${nombre}": el impuesto ${pct}% no está en tu plantilla; se dejó vacío.`)
          elegido = opcion ?? ''
        }
      }
      out.isv = elegido
    }
```

- [ ] **Step 4: Correr los tests — todos pasan**

```bash
node --test tests/inv-convertir.test.mjs 2>&1 | tail -10
```

Esperado: `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add js/inv-convertir.js tests/inv-convertir.test.mjs
git commit -m "$(cat <<'EOF'
feat(inventario): estrategias de IVA por_fila y todos_igual

Reemplaza la lógica de IVA del conversor por dos estrategias explícitas:
- por_fila (default): usa el valor del archivo; si falta, cae a ivaGeneral
  si está seteado, si no al EXENTO default actual.
- todos_igual: ignora el archivo y aplica ivaGeneral a todas las filas
  (ivaGeneral es obligatorio).

Lo usan los flujos de IVA mixto (Task 12) donde el chat ofrece 3 salidas al
cliente según la forma en que su archivo trae los impuestos.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `inv-convertir.js` — regla nueva de filas vacías

Omitir silenciosamente las filas sin dato en ninguna columna mapeada, aunque tengan basura
en columnas no mapeadas. Las filas con nombre o precio presentes pero el otro faltante
siguen siendo error.

**Files:**
- Modify: `js/inv-convertir.js`
- Modify: `tests/inv-convertir.test.mjs`

- [ ] **Step 1: Escribir los tests**

Append:

```js
test('convertir: fila con basura solo en columna no mapeada → omitida silenciosa', () => {
  const p = leerPlantilla(hojasInv())
  // "Observaciones" no está en el mapeo del conversor → basura ignorable.
  const encabezados = ['Nombre', 'Precio', 'Observaciones']
  const mapeo = mapearColumnas(encabezados)
  const filas = [
    ['Producto 1', '10000', 'ok'],
    ['', '', '-- Separador de sección --'],  // basura solo en no-mapeada
    ['Producto 2', '20000', ''],
  ]
  const r = convertir({ filas, mapeo, plantillas: { inventariable: p }, opciones: {} })
  assert.equal(r.salidas.inventariable.length, 2)
  // No se contó como error:
  assert.equal(r.errores.length, 0)
})

test('convertir: fila con nombre pero sin precio → error (regresión)', () => {
  const p = leerPlantilla(hojasInv())
  const encabezados = ['Nombre', 'Precio']
  const mapeo = mapearColumnas(encabezados)
  const filas = [
    ['Producto completo', '10000'],
    ['Producto sin precio', ''],
  ]
  const r = convertir({ filas, mapeo, plantillas: { inventariable: p }, opciones: {} })
  assert.equal(r.salidas.inventariable.length, 1)
  assert.equal(r.errores.length, 1)
  assert.match(r.errores[0].mensaje, /precio de venta no es un número válido/)
})
```

- [ ] **Step 2: Correr el test — deben fallar (actualmente todo con contenido es tratado como fila)**

```bash
node --test tests/inv-convertir.test.mjs 2>&1 | grep -A2 "basura solo"
```

Esperado: FAIL — la fila con "-- Separador --" en Observaciones hoy entra, no tiene nombre
y se cuenta como error "No tiene nombre".

- [ ] **Step 3: Modificar `js/inv-convertir.js`**

Reemplazar la función `vacia` actual (alrededor de línea 69):

```js
const vacia = fila => fila.every(c => String(c ?? '').trim() === '')
```

por una helper que mira solo celdas mapeadas:

```js
function filaSinDatoMapeado(fila, mapeo) {
  const camposRelevantes = ['nombre', 'codigo', 'precioTotal', 'precioBase', 'costo', 'existencia']
  for (const campo of camposRelevantes) {
    const col = mapeo[campo]
    if (col === undefined) continue
    const v = String(fila[col] ?? '').trim()
    if (v !== '') return false
  }
  return true
}
```

Y dentro del `forEach`, reemplazar:

```js
    if (vacia(fila)) return
```

por:

```js
    if (filaSinDatoMapeado(fila, mapeo)) return
```

- [ ] **Step 4: Correr los tests — todos pasan**

```bash
node --test tests/inv-convertir.test.mjs 2>&1 | tail -10
```

Esperado: `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add js/inv-convertir.js tests/inv-convertir.test.mjs
git commit -m "$(cat <<'EOF'
feat(inventario): omitir filas sin dato en columnas mapeadas

Antes, cualquier fila con contenido en alguna celda era procesada — y si no
tenía nombre, contaba como error. Ahora una fila se omite silenciosamente si
todas sus columnas mapeadas (nombre, código, precio, costo, existencia) están
vacías, aunque haya basura en columnas no mapeadas (p.ej. una nota de Alegra
en una columna lateral o un separador "-- Sección --" en la columna A).

Las filas con nombre o precio presentes pero el otro faltante siguen siendo
error (regresión cubierta por el test nuevo).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: `inv-chat.js` — `pasoSucursales` + llamada a plantilla sintética

Agregar la bifurcación al inicio del conversor y cablear la plantilla sintética en el camino
mono. **Sin tests automáticos** — no hay harness de chat; la QA es manual (Task 14).

**Files:**
- Modify: `js/inv-chat.js`

- [ ] **Step 1: Agregar imports y helpers al tope de `inv-chat.js`**

Después de los imports existentes:

```js
import { getContextoBold } from './bold-context.js'
```

- [ ] **Step 2: Agregar el paso `pasoSucursales` y el cablerío del mono**

Al inicio de la función `iniciarConversacion`, antes del bloque de `pasoPlantillas`
(alrededor de línea 22, justo después de `crearSesion()` y `crearBase(…)`):

```js
  // Modo del conversor: 'mono' (plantilla sintética) o 'multi' (sube la del cliente).
  let modo = null
  let conFE = null  // se setea en el camino mono antes de armar la plantilla sintética.

  async function pasoSucursales() {
    const q = await bot(
      '<b>Antes de empezar, una pregunta importante sobre tu cuenta de Bold:</b>' +
      '<p>No te pregunto dónde querés cargar el inventario ahora. ' +
      'Te pregunto por el <b>total de sucursales activas en tu cuenta de Bold POS</b>.</p>' +
      '<p>¿Tu cuenta tiene más de una sucursal?</p>')
    const r = await chips(q, [
      { texto: 'Solo tengo esta sucursal', detalle: 'Preparo la plantilla por vos con tu sucursal lista. No hace falta descargar nada de Bold.', valor: 'una' },
      { texto: 'Tengo más de una sucursal', detalle: 'Te pido que descargues la plantilla desde Bold POS; la de tu cuenta trae los IDs de todas tus sucursales.', valor: 'mas' },
    ])
    vivo()
    modo = r === 'una' ? 'mono' : 'multi'
    telemetria.paso(modo === 'mono' ? 'sucursales_una' : 'sucursales_mas')
  }

  async function pasoPlantillaSintetica() {
    const ctx = getContextoBold()
    const warehouseId = ctx?.warehouseId
    if (!warehouseId) {
      // Sin warehouseId no podemos armar la plantilla. Caemos a multi.
      await bot('No pude identificar tu sucursal desde Bold. Vamos por el camino manual: descargá tu plantilla desde Bold POS.', { demora: 300 })
      modo = 'multi'
      telemetria.error('plantilla_sintetica', 'sin_warehouse_id')
      return pasoPlantillas()
    }
    const qFE = await bot('¿Tu cuenta de Bold tiene <b>facturación electrónica</b> activa?')
    conFE = await chips(qFE, [{ texto: 'Sí', valor: true }, { texto: 'No', valor: false }])
    vivo()

    const t0 = Date.now()
    const r = await sesion.agregarPlantillaSintetica({ warehouseId, conFE })
    if (r.ok) {
      telemetria.paso('plantilla_sintetica_lista', { ms_total: Date.now() - t0 })
      await bot('Perfecto, te preparé la plantilla para <b>tu sucursal</b>. Ahora pasamos a tu archivo de productos.', { demora: 400 })
      sesion.estado.opciones.isv = conFE  // ya respondió, no re-preguntar en pasoPreguntas.
      return
    }
    telemetria.error('plantilla_sintetica', r.codigo)
    await bot('Tuve un problema preparando tu plantilla. Vamos por el camino manual: descargala desde Bold POS y súbela aquí. Te guío paso a paso.', { demora: 500 })
    modo = 'multi'
    return pasoPlantillas()
  }
```

- [ ] **Step 3: Cambiar el bloque try/catch final de `iniciarConversacion` para usar la bifurcación**

Reemplazar el bloque final (alrededor de línea 320-332):

```js
  try {
    telemetria.inicio(via)
    await bot(INTRO_HTML)
    await pasoPlantillas(); telemetria.paso('plantillas')
    await pasoOrigen(); telemetria.paso('origen')
    await pasoColumnas(); telemetria.paso('columnas')
    await pasoPreguntas(); telemetria.paso('preguntas')
    await pasoResultado()
  } catch (e) {
    // ... (igual)
  }
```

por:

```js
  try {
    telemetria.inicio(via)
    await pasoSucursales()
    await bot(INTRO_HTML)
    if (modo === 'mono') await pasoPlantillaSintetica()
    if (modo === 'multi') await pasoPlantillas()
    telemetria.paso('plantillas')
    await pasoOrigen(); telemetria.paso('origen')
    await pasoColumnas(); telemetria.paso('columnas')
    await pasoPreguntas(); telemetria.paso('preguntas')
    await pasoResultado()
  } catch (e) {
    if (e === CANCELADO || e === FIN) return
    console.error('[inventario] conversación interrumpida:', e)
    telemetria.error('desconocido', 'excepcion')
    await bot('Algo salió mal y no pude seguir. Recarga la página e inténtalo de nuevo.')
  }
```

- [ ] **Step 4: Verificar que la suite completa sigue verde**

```bash
node --test tests/*.test.mjs 2>&1 | tail -5
```

Esperado: `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add js/inv-chat.js
git commit -m "$(cat <<'EOF'
feat(inventario): pasoSucursales + camino mono-sucursal con plantilla sintética

El conversor arranca preguntándole al cliente si su cuenta tiene más de una
sucursal (copy explícito, detalla el preámbulo para evitar confundirlo con
"¿dónde querés cargar hoy?"). Si "una", se pregunta FE, se arma la plantilla
sintética con inv-sesion.agregarPlantillaSintetica, y se salta pasoPlantillas.
Si "más", o si no vino warehouseId en bold:context, o si la plantilla sintética
falló, cae al flujo manual.

QA manual en producción: QA_INVENTARIO_MONO.md (próximo commit).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: `inv-chat.js` — IVA general + manejo de IVA mixto en `pasoPreguntas`

Agrega al chat la pregunta de IVA general cuando hay FE y el archivo no trae IVA completo,
y las 3 salidas para el caso de IVA mixto. Usa las estrategias de `inv-convertir.js` de la
Task 9.

**Files:**
- Modify: `js/inv-chat.js`

- [ ] **Step 1: Agregar un helper para detectar el estado del IVA del archivo**

Al tope de `iniciarConversacion`, debajo de los otros helpers que están ya, agregar:

```js
  // Mira la columna de IVA del archivo (si está mapeada) y devuelve:
  // 'completo' (todas las filas con IVA válido), 'vacio' (ninguna) o 'mixto'.
  // Usa parseImpuesto que ya existe en inv-numeros.
  async function detectarEstadoIva() {
    const { parseImpuesto } = await import('./inv-numeros.js')
    const { mapeo, filas } = sesion.estado.origen
    if (mapeo.impuesto === undefined) return 'vacio'
    let con = 0, sin = 0
    for (const f of filas) {
      if (vacia(f)) continue
      const v = parseImpuesto(f[mapeo.impuesto])
      if (v == null) sin++; else con++
    }
    if (con === 0) return 'vacio'
    if (sin === 0) return 'completo'
    return 'mixto'
  }

  const vacia = fila => fila.every(c => String(c ?? '').trim() === '')
```

- [ ] **Step 2: Modificar `pasoPreguntas` para integrar IVA general y mixto**

Reemplazar el bloque de FE actual (alrededor de línea 186-192) por:

```js
    // Facturación electrónica. En el camino mono ya se preguntó al armar la
    // plantilla sintética; sesion.estado.opciones.isv lo lleva seteado.
    const yaSePregunto = sesion.estado.opciones.isv !== null
    if (!yaSePregunto) {
      const trae = sesion.tieneIsv()
      const qIsv = await bot(`¿Tu cuenta tiene <b>facturación electrónica</b> habilitada? ${trae ? 'Tu plantilla trae la columna de impuesto (ISV), así que parece que sí.' : 'Tu plantilla no trae la columna de impuesto (ISV).'}`)
      const conIsv = (await chips(qIsv, [{ texto: 'Sí', valor: true }, { texto: 'No', valor: false }]))
      vivo()
      sesion.estado.opciones.isv = conIsv
      if (conIsv && !trae) await bot('Entonces descarga de nuevo tu plantilla desde Bold POS (con la facturación electrónica activa) y súbela otra vez; por ahora no puedo llenar el impuesto sin esa columna. Seguimos con lo demás.')
      if (!conIsv && trae) await bot('Entendido: dejaré la columna de impuesto vacía.')
    }

    // Preguntas de IVA general y manejo de mixto (ambos caminos).
    if (sesion.estado.opciones.isv) {
      const estado = await detectarEstadoIva()
      if (estado === 'vacio') {
        const q = await bot('Tu archivo no trae IVA por producto. ¿Qué IVA querés aplicar por defecto a tus ítems?')
        const iva = await chips(q, OPCIONES_IVA)
        vivo()
        sesion.estado.opciones.ivaStrategy = 'por_fila'
        sesion.estado.opciones.ivaGeneral = iva
        telemetria.paso('iva_general_elegido', { iva, camino: modo })
      } else if (estado === 'mixto') {
        const con = contarIva(sesion.estado.origen).con
        const sin = contarIva(sesion.estado.origen).sin
        telemetria.error('iva_mixto', 'detectado', { filas_con: con, filas_sin: sin })
        const q = await bot(`Tu archivo trae IVA en algunos productos (<b>${con}</b> filas) pero no en otros (<b>${sin}</b> filas). ¿Cómo lo resolvemos?`)
        const r = await chips(q, [
          { texto: 'Vuelvo a subir mi archivo con la columna de IVA completa', valor: 'reupload' },
          { texto: 'Elegí UN IVA para los que faltan, respetá los que ya tienen', valor: 'por_fila_fallback' },
          { texto: 'Aplicá UN IVA a TODOS, yo corrijo en Bold después', valor: 'todos_igual' },
        ])
        vivo()
        if (r === 'reupload') {
          telemetria.error('iva_mixto', 'resolucion_reupload')
          await bot('Dale, subí el archivo de nuevo con la columna de IVA completa.')
          await pasoOrigen()
          return pasoPreguntas()  // vuelve a entrar con el archivo nuevo
        }
        const strategy = r === 'todos_igual' ? 'todos_igual' : 'por_fila'
        const qIva = await bot('¿Cuál es ese IVA?')
        const iva = await chips(qIva, OPCIONES_IVA)
        vivo()
        sesion.estado.opciones.ivaStrategy = strategy
        sesion.estado.opciones.ivaGeneral = iva
        const codigoReso = r === 'todos_igual' ? 'resolucion_todos_igual' : 'resolucion_por_fila_con_fallback'
        telemetria.error('iva_mixto', codigoReso, { iva_elegido: iva })
        if (r === 'todos_igual') {
          await bot('Listo. Si querés cambiar el IVA de algunos productos después del import, podés hacerlo en Bold POS con <b>Actualización masiva</b>. La pestaña <b>Instrucciones</b> del xlsx descargado tiene la lista de IVAs válidos.', { demora: 500 })
        }
      }
      // estado === 'completo': no se pregunta, cada fila usa su valor del archivo.
    }

    // ... (resto de pasoPreguntas sigue igual: inventariable, unidades, categorías, códigos)
```

Agregar constantes al tope del archivo (debajo de las ya existentes):

```js
const OPCIONES_IVA = [
  { texto: 'IVA-19', valor: 'IVA-19' },
  { texto: 'IVA-5',  valor: 'IVA-5' },
  { texto: 'Excluido', valor: 'EXCLUIDO' },
  { texto: 'Exento',   valor: 'EXENTO' },
]

function contarIva({ mapeo, filas }) {
  // Helper pequeño que cuenta filas con / sin IVA válido. Lo usa el chat para
  // armar el mensaje "X con, Y sin" del caso mixto.
  // Se duplica con detectarEstadoIva a propósito para mantener una lectura clara.
  // Si creciera más, se factoriza.
  let con = 0, sin = 0
  if (mapeo.impuesto === undefined) return { con: 0, sin: filas.length }
  for (const f of filas) {
    if (f.every(c => String(c ?? '').trim() === '')) continue
    const v = String(f[mapeo.impuesto] ?? '').trim()
    if (v === '' || isNaN(parseFloat(v.replace(',', '.')))) sin++
    else con++
  }
  return { con, sin }
}
```

- [ ] **Step 3: Verificar que la suite completa sigue verde**

```bash
node --test tests/*.test.mjs 2>&1 | tail -5
```

Esperado: `fail 0`.

- [ ] **Step 4: Commit**

```bash
git add js/inv-chat.js
git commit -m "$(cat <<'EOF'
feat(inventario): IVA general y manejo de IVA mixto en pasoPreguntas

Cuando el cliente tiene FE y su archivo no trae IVA por fila (o lo trae
parcial), el chat le pregunta cuál IVA quiere aplicar por defecto. En el caso
mixto le ofrece 3 salidas: volver a subir con la columna completa, elegir un
IVA general respetando los que el archivo trae, o elegir un IVA general que
pisa todo (y corregir en Bold con Actualización masiva).

Las opciones las implementa el conversor vía ivaStrategy + ivaGeneral de la
Task 9. Aplica a ambos caminos (mono y multi).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: `inv-chat.js` — `pasoResultado` para mono-sucursal

En el camino mono, el cliente nunca subió una plantilla contra la cual validar categorías;
todas se asumen "faltantes" en Bold. El resultado muestra una lista para crear en Bold con
botón **Copiar**, más otra lista para las unidades que no estén en la canónica.

**Files:**
- Modify: `js/inv-chat.js`

- [ ] **Step 1: Agregar un helper que arme la "lista para crear en Bold"**

Dentro de `iniciarConversacion`, al mismo nivel que `pasoResultado`:

```js
  function construirCategoriasParaCrear() {
    const cats = new Set()
    for (const tipo of Object.keys(sesion.estado.resultado.salidas)) {
      for (const it of sesion.estado.resultado.salidas[tipo]) {
        if (it.categoria && it.categoria.toLowerCase() !== 'general') cats.add(it.categoria)
      }
    }
    return [...cats].sort()
  }

  function construirUnidadesNoCanonicas() {
    // Las unidades canónicas de Bold que sintetizamos en vendor/ — hardcoded acá
    // para no romper el aislamiento del chat con inv-plantilla-sintetica.
    const CANONICAS = new Set([
      'Centímetros', 'Galónes', 'Gramos', 'Kilogramos', 'Libras', 'Litros',
      'Metros', 'Metros cuadrados', 'Metros cúbicos', 'Miligramos', 'Mililitros',
      'Milímetros', 'Onzas', 'Par', 'Unidades',
    ])
    const uso = new Set()
    for (const tipo of Object.keys(sesion.estado.resultado.salidas)) {
      for (const it of sesion.estado.resultado.salidas[tipo]) {
        if (it.unidad && !CANONICAS.has(it.unidad)) uso.add(it.unidad)
      }
    }
    return [...uso].sort()
  }
```

- [ ] **Step 2: Modificar el inicio de `pasoResultado` para mostrar las listas en mono**

Dentro de `pasoResultado`, después del `const r = sesion.estado.resultado` y antes de
armar el `texto` (alrededor de línea 265-278), insertar:

```js
    // Camino mono: no hay plantilla Bold subida → todo lo que no sea General
    // o una unidad canónica son "faltantes" en Bold. Le damos la lista para crear.
    if (modo === 'mono') {
      const catsParaCrear = construirCategoriasParaCrear()
      const unidadesParaCrear = construirUnidadesNoCanonicas()
      if (catsParaCrear.length) {
        const b = await bot(`Estas <b>${catsParaCrear.length}</b> categorías no existen en tu Bold todavía. Creálas antes de importar (Bold POS → Ítems → Categorías → Crear). Podés pegarlas una por línea:<pre class="inv-cats">${esc(catsParaCrear.join('\n'))}</pre>`, { demora: 500 })
        const acc = await chips(b, [{ texto: 'Copiar categorías', valor: 'copiar' }, { texto: 'Continuar', valor: 'seguir' }])
        vivo()
        if (acc === 'copiar') {
          try { await navigator.clipboard.writeText(catsParaCrear.join('\n')) } catch { /* sin portapapeles */ }
          await bot('Copiadas ✅', { demora: 250 })
        }
      }
      if (unidadesParaCrear.length) {
        const b = await bot(`Estas <b>${unidadesParaCrear.length}</b> unidades que usás no están en la lista estándar de Bold. Creálas antes de importar (Bold POS → Ítems → Unidades):<pre class="inv-cats">${esc(unidadesParaCrear.join('\n'))}</pre>`, { demora: 500 })
        const acc = await chips(b, [{ texto: 'Copiar unidades', valor: 'copiar' }, { texto: 'Continuar', valor: 'seguir' }])
        vivo()
        if (acc === 'copiar') {
          try { await navigator.clipboard.writeText(unidadesParaCrear.join('\n')) } catch { /* ídem */ }
          await bot('Copiadas ✅', { demora: 250 })
        }
      }
    }
```

- [ ] **Step 3: Verificar que la suite sigue verde**

```bash
node --test tests/*.test.mjs 2>&1 | tail -5
```

Esperado: `fail 0`.

- [ ] **Step 4: Commit**

```bash
git add js/inv-chat.js
git commit -m "$(cat <<'EOF'
feat(inventario): pasoResultado mono — listas de categorías y unidades para crear en Bold

En el camino mono-sucursal, como no tenemos la plantilla de Bold del cliente
contra la cual validar, todas las categorías que no sean "General" y todas las
unidades que no estén en la lista canónica se le muestran al cliente con botón
"Copiar" para que las cree en Bold antes de importar. Idéntico patrón al que
usa hoy el camino multi para las categorías faltantes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: QA manual + merge

El flujo del chat no tiene harness automatizado. Antes de mergear a master, hace falta
una vuelta en navegador real.

**Files:**
- None (checklist)

- [ ] **Step 1: Correr `npm run dev` o abrir el `inventario.html` local**

Vercel + Vite o lo que use el repo. Si no hay dev server, abrir `inventario.html` con un
server estático:

```bash
python -m http.server 8080
```

Y entrar a `http://localhost:8080/inventario.html?simular-bold=1` si existe el param, o
inyectar el `bold:context` desde la consola.

- [ ] **Step 2: QA manual — camino mono-sucursal con FE**

- [ ] Simular `bold:context` con `warehouseId: 2611`, `businessType: 'retail'`.
- [ ] Verificar que la primera pregunta del conversor es la de sucursales.
- [ ] Responder "Solo tengo esta sucursal".
- [ ] Responder "Sí" a FE.
- [ ] Ver el mensaje "Perfecto, te preparé la plantilla para tu sucursal".
- [ ] Subir un Alegra o Siigo de prueba con 5-10 productos y categorías/unidades mixtas.
- [ ] En pasoColumnas, verificar que el mapeo detectado tiene sentido.
- [ ] En pasoPreguntas, verificar que la pregunta de IVA general aparece (o la de mixto si
      el archivo tiene IVA parcial).
- [ ] En pasoResultado, verificar la lista de categorías "para crear en Bold".
- [ ] Descargar la plantilla. Abrirla:
  - [ ] Verificar que la columna de existencia dice `Sucursal-2611`.
  - [ ] Verificar que la columna `Impuesto*` está.
  - [ ] Verificar que la hoja `Instrucciones` tiene solo `General` + 15 unidades + 5 impuestos.
  - [ ] Verificar que ningún caracter prohibido se coló al output.

- [ ] **Step 3: QA manual — camino mono-sucursal sin FE**

- [ ] Mismo flujo pero respondiendo "No" a FE.
- [ ] Verificar que la pregunta de IVA general NO aparece.
- [ ] En la plantilla descargada, verificar que la columna `Impuesto*` NO está.

- [ ] **Step 4: QA manual — camino multi (regresión)**

- [ ] Simular `bold:context` igual que antes.
- [ ] Responder "Tengo más de una sucursal".
- [ ] Subir la plantilla Bold real (una de `vendor/` o de prueba).
- [ ] Verificar que el flujo pide origen → columnas → preguntas → resultado igual que antes.
- [ ] Si el archivo tiene IVA mixto, verificar las 3 salidas del chat.
- [ ] Descargar la plantilla y verificar que sale como siempre.

- [ ] **Step 5: QA manual — fallback cuando falla la plantilla sintética**

- [ ] Simular un error de red bloqueando `/vendor/bold-plantilla-base-*.xlsx` (devtools →
      Network → Block request URL).
- [ ] Responder "Solo tengo esta sucursal", "Sí" a FE.
- [ ] Verificar que el bot avisa "Tuve un problema preparando tu plantilla" y pide la
      descarga manual.
- [ ] Completar el flujo multi con una plantilla real.

- [ ] **Step 6: QA manual — cliente sin `bold:context`**

- [ ] Abrir `inventario.html` SIN simular `bold:context` (entra sin el POS).
- [ ] Responder "Solo tengo esta sucursal".
- [ ] Verificar que el bot avisa "No pude identificar tu sucursal" y cae a flujo manual.

- [ ] **Step 7: Correr toda la suite por última vez**

```bash
node --test tests/*.test.mjs 2>&1 | tail -5
```

Esperado: `fail 0`.

- [ ] **Step 8: Push a `sandbox` y abrir PR a `master`**

```bash
git push -u origin sandbox
gh pr create --base master --head sandbox --title "feat(inventario): mono-sucursal + saneamiento + purgador heurístico" --body "$(cat <<'EOF'
## Resumen

Implementa el Spec 1 del split de inventario:

- Pregunta inicial "¿tu cuenta tiene más de una sucursal?" en el conversor.
- Camino mono-sucursal: arma la plantilla sintética con el warehouseId del bold:context,
  evita que el cliente tenga que descargar nada.
- Purgador heurístico (dedup + singular/plural) de categorías y unidades en los dos caminos.
- Saneador de caracteres prohibidos (` ´ { | } % ? ° ¡ !).
- IVA general + manejo del caso mixto (3 salidas al cliente).
- Filas vacías: omitidas silenciosas si no hay dato en columnas mapeadas.

Spec: docs/superpowers/specs/2026-11-11-inventario-monosucursal-y-saneamiento-design.md
Plan: docs/superpowers/plans/2026-11-11-inventario-monosucursal-y-saneamiento.md

Spec 2 (futuro): purgador IA con Vertex/Gemini sobre esta infra.

## Test plan

- [x] Node tests: `node --test tests/*.test.mjs`
- [x] QA manual mono-sucursal con y sin FE
- [x] QA manual multi-sucursal (regresión)
- [x] QA manual fallback del fetch
- [x] QA manual sin bold:context
EOF
)"
```

---

## Checklist de self-review del plan

Comprobé lo siguiente antes de dar por terminado el plan:

### Cobertura del spec (sección por sección)

- Mono-sucursal → Tasks 2, 5, 6, 11 ✓
- Purgador heurístico → Tasks 4, 8 ✓
- Saneamiento → Tasks 3, 7 ✓
- IVA general + mixto → Tasks 9, 12 ✓
- Columnas obligatorias → cubiertas por Task 9 (IVA) + Task 7/8 (default `General`/`Unidades` ya en el conversor existente) ✓
- Filas vacías mejoradas → Task 10 ✓
- Vendor cleanup → Task 2 ✓
- Fallbacks → Task 6 (retry) + Task 11 (fallback a multi) ✓
- Telemetría nueva → repartida en Tasks 6, 11, 12 ✓
- Smoke test runtime → en `construirPlantilla` (Task 5) ✓
- QA manual → Task 14 ✓
- `warehouseId` ya expuesto → Task 1 commit ✓

### Scan de placeholders

Ningún "TBD", "TODO", "implement later", "handle edge cases", "similar to Task N", ni
step que describa sin mostrar código.

### Consistencia de tipos y firmas

- `sanear(texto) → string` — usado en Tasks 3, 4, 7 con la misma firma.
- `purgar(lista) → { limpias, mapeo, informe }` — usado en Tasks 4, 8.
- `construirPlantilla(XLSX, { baseBytes, warehouseId, conFE, tipo }) → { wb, info }` — usado
  en Tasks 5, 6.
- `agregarPlantillaSintetica({ warehouseId, conFE }) → { ok } | { error, codigo }` —
  Tasks 6, 11.
- `opciones.ivaStrategy ∈ { 'por_fila', 'todos_igual' }` y `opciones.ivaGeneral: string` —
  consistente en Tasks 9, 12.
- Códigos de error: `fetch_fallo | parse_fallo | estructura_cambio` — consistente en Tasks
  5, 6.
