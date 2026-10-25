# Recorrido guiado (simulador de onboarding) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página `/onboarding` de Academia con una réplica interactiva de Bold POS retail donde el cliente nuevo crea un ítem, lo ve, lo vende, registra un gasto y ve los historiales, con burbujas que lo guían, BolBot a mano, avance retomable desde Ayuda y un embudo en el admin.

**Architecture:** Lógica pura (estado, reglas de negocio, pasos, persistencia, mensajes) en módulos ES sin DOM, probados con `node --test`. Las pantallas son funciones `estado → HTML string` con anclas `data-onb` y acciones `data-action`; un controlador hace delegación de eventos, aplica reductores puros y mueve la burbuja. BolBot es el `assistant.js` existente montado en un panel lateral, con el paso actual como contexto.

**Tech Stack:** HTML + JS vanilla (módulos ES), CSS propio (`css/onboarding.css`), Supabase (`analytics_events`, `bodi_conversations`, RPCs SQL), Vercel, n8n (workflow "Bold POS Chat").

**Spec:** `docs/superpowers/specs/2026-10-22-onboarding-simulador-design.md`

## Global Constraints

- Solo retail; con `bold:context` de vertical `restaurantes` → pantalla "pronto tendremos tu recorrido" + cierre con `reason: 'no_aplica'`. Sin contexto se asume retail.
- Solo escritorio: ancho < 1024 px → pantalla "Este recorrido se ve mejor en computador" con *Continuar igual* / *Saltar recorrido*.
- Nada sale del navegador salvo telemetría y el bot. Ninguna llamada a Bold.
- Aviso permanente visible: **"Modo práctica — nada de esto se guarda en tu cuenta de Bold POS"**. Números ficticios: factura `DEMO-0001`, gasto `No. 1`.
- Montos como Bold: `$ 23,800` (signo, espacio, coma de miles, sin decimales). Español de Colombia, tuteo.
- Impuestos exactos: Exento 0, IVA - 5.00% 5, IVA - 19.00% 19, Excluido 0, INC - 8.00% 8.
- *Saltar recorrido* y "Paso N de 6" visibles siempre (pasos numerados = crear_item … inventario).
- Sin CDNs nuevos (CSP de `vercel.json`); sin clases Tailwind nuevas en la página (usar `css/onboarding.css`; `tw.css` está precompilado).
- Identidad: en `localStorage` solo el `accountId`, jamás nombre/correo (regla de `bold-context.js`).
- Cambios en base de datos o en el workflow n8n de producción: el implementador deja el SQL/JSON listo y **pide confirmación al usuario** antes de aplicarlo. Sandbox y producción comparten la base de Supabase.
- Tests: `node --test tests/<archivo>.test.mjs`, estilo de `tests/bold-open-lesson.test.mjs` (`node:test` + `node:assert/strict`).

## Review Focus

1. Storage con JSON corrupto o de otra versión → arranca de cero sin romper (test en Task 3).
2. `bold:context` llega *después* de que el cliente empezó sin cuenta → el avance anónimo se migra a la clave de la cuenta, no se pierde ni se duplica (test en Task 3).
3. Precio con texto no numérico, negativo, `"20.000"` con punto, o existencias 0 → error "Este campo es requerido"/"Ingresa un valor mayor a 0" y no avanza (tests en Task 1).
4. Vender más unidades de las que hay en existencia → la línea se topa en la existencia y la burbuja lo explica; la existencia nunca queda negativa (test en Task 1).
5. Nombre del ítem con HTML (`<img onerror>`) → se muestra escapado en todas las pantallas (test en Task 5).

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `js/onboarding-state.js` | Estado inicial, impuestos, cálculos de precio/venta, validaciones, reductores, formato COP. Puro. |
| `js/onboarding-steps.js` | Lista de pasos y subpasos (ancla, cómo avanza), numeración 1–6, función de avance. Puro. |
| `js/onboarding-progress.js` | Clave por cuenta, cargar/guardar/migrar avance. Recibe funciones de storage. |
| `js/onboarding-bridge.js` | Mensajes Academia→Bold y cierre según contexto (iframe de Bold o portal). |
| `js/onboarding-telemetry.js` | Envoltorio de `track()` con `run_id`, `step`, `vertical`, `account_id`. |
| `js/onboarding-screens.js` | Shell de Bold (menú, barra) + una función por pantalla, `estado → HTML`. |
| `js/onboarding-guide.js` | Spotlight + burbuja anclada a `[data-onb]` (DOM). |
| `js/onboarding.js` | Controlador/entrada de la página. |
| `onboarding.html`, `css/onboarding.css` | Página y look de Bold. |
| `js/bot-origin.js` | Origen/paso del bot para `assistant.js`. |
| `js/onboarding-resume.js` | Modelo de la tarjeta "Continúa tu recorrido" del portal. Puro. |
| `supabase/migrations/add_origin_bodi_conversations.sql`, `update_analytics_bot_conversations_origin.sql`, `create_analytics_onboarding_funnel.sql` | Esquema y RPCs. |
| `docs/integracion-bold/requerimiento-recorrido-guiado.md` | Requerimiento para Bold. |

---

### Task 1: Estado y reglas de negocio del simulador

**Files:**
- Create: `js/onboarding-state.js`
- Test: `tests/onboarding-state.test.mjs`

**Interfaces:**
- Produces:
  - `IMPUESTOS: Array<{id:'exento'|'iva5'|'iva19'|'excluido'|'inc8', label:string, pct:number}>` (labels exactos de Global Constraints)
  - `formatCOP(n:number): string`
  - `parseMonto(s:string|number): number|null` — acepta `"20000"`, `"20,000"`, `"20.000"` (punto = miles, como se escribe en Colombia) → 20000; vacío/no numérico/≤0 → `null`
  - `precioTotal(base:number, impuestoId:string): number` — `Math.round(base*(1+pct/100))`
  - `crearEstadoInicial(runId:string): Estado` con `{ v:1, runId, step:'bienvenida', sub:0, completed:false, item:null, ventaLineas:[], venta:null, gasto:null }`
  - `validarItem(draft): { ok:boolean, errores: Record<campo,string> }` — campos `nombre, precioBase, impuesto, existencias`; mensajes `'Este campo es requerido'` (vacío) y `'Ingresa un valor mayor a 0'` (≤0/no numérico)
  - `crearItem(estado, draft): Estado` — guarda `item = { nombre (trim, máx 80), categoria:'General', precioBase, impuesto, costo|null, existencias, codigo:'I-DEMO-0001', activo:true }`
  - `agregarLinea(estado): Estado` — añade `{cantidad:1}` (igual que Bold: cada toque es una línea nueva) salvo que la suma ya iguale `item.existencias`, en cuyo caso devuelve el estado con `topeAlcanzado:true`
  - `cambiarCantidad(estado, idx:number, cantidad:number): Estado` — topa para que la suma no pase de existencias; mínimo 1
  - `totalesVenta(estado): { totalItems, subtotal, impuesto, total }`
  - `pagarVenta(estado, recibido:number): Estado` — `venta = { numero:'DEMO-0001', metodo:'Efectivo', recibido, total, fecha:ISO }`; descuenta existencias en `item.existenciasFinal`
  - `validarGasto(draft)` / `crearGasto(estado, draft)` — campos `metodo, categoria, valor`; `gasto = { numero:1, metodo, categoria, valor, observaciones, turno:true, fecha:ISO }`
  - `CATEGORIAS_GASTO = ['Servicios públicos','Transporte','Nómina','Aseo','Mantenimiento y reparaciones','Arriendo']`, `METODOS_PAGO = ['Bold','Efectivo','Credibanco','Nequi','Sistecredito','QR']`
  - `movimientosInventario(estado): Array<{tipo:'Entrada'|'Salida', cantidad:number, existencia:number}>`
  - `EJEMPLO_ITEM`, `EJEMPLO_GASTO` (valores en Task 5)

- [ ] **Step 1: Write the failing tests**

```js
test('precioTotal y formatCOP como Bold', () => {
  assert.equal(precioTotal(20000, 'iva19'), 23800)
  assert.equal(precioTotal(20000, 'exento'), 20000)
  assert.equal(formatCOP(23800), '$ 23,800')
  assert.equal(formatCOP(1428000), '$ 1,428,000')
})
test('parseMonto', () => {
  for (const s of ['20000', '20,000', '20.000', 20000]) assert.equal(parseMonto(s), 20000)
  for (const s of ['', 'abc', '-5', '0', null]) assert.equal(parseMonto(s), null)
})
test('validarItem exige obligatorios y existencias > 0', () => {
  const r = validarItem({ nombre: '  ', precioBase: 'abc', impuesto: '', existencias: '0' })
  assert.equal(r.ok, false)
  assert.equal(r.errores.nombre, 'Este campo es requerido')
  assert.equal(r.errores.precioBase, 'Ingresa un valor mayor a 0')
  assert.equal(r.errores.impuesto, 'Este campo es requerido')
  assert.equal(r.errores.existencias, 'Ingresa un valor mayor a 0')
})
test('venta del ejemplo del spec: 2 líneas de 20.000 + IVA 19%', () => {
  let s = crearItem(crearEstadoInicial('r1'), { nombre: 'Camiseta', precioBase: '20000', impuesto: 'iva19', existencias: '10' })
  s = agregarLinea(agregarLinea(s))
  assert.equal(s.ventaLineas.length, 2)
  assert.deepEqual(totalesVenta(s), { totalItems: 2, subtotal: 40000, impuesto: 7600, total: 47600 })
  s = pagarVenta(s, 50000)
  assert.equal(s.venta.numero, 'DEMO-0001')
  assert.deepEqual(movimientosInventario(s), [
    { tipo: 'Entrada', cantidad: 10, existencia: 10 },
    { tipo: 'Salida', cantidad: -2, existencia: 8 },
  ])
})
test('no se vende más de lo que hay', () => {
  let s = crearItem(crearEstadoInicial('r1'), { nombre: 'X', precioBase: '1000', impuesto: 'exento', existencias: '1' })
  s = agregarLinea(agregarLinea(s))
  assert.equal(s.ventaLineas.length, 1)
  assert.equal(s.topeAlcanzado, true)
  assert.equal(cambiarCantidad(s, 0, 5).ventaLineas[0].cantidad, 1)
})
test('validarGasto', () => {
  assert.equal(validarGasto({ metodo: 'Efectivo', categoria: 'Servicios públicos', valor: '50000' }).ok, true)
  assert.equal(validarGasto({ metodo: '', categoria: '', valor: '' }).errores.valor, 'Este campo es requerido')
})
```

- [ ] **Step 2: Run** `node --test tests/onboarding-state.test.mjs` — Expected: FAIL (módulo no existe)
- [ ] **Step 3: Implement** `js/onboarding-state.js` con las firmas de arriba. Reductores inmutables (devuelven objeto nuevo). Impuesto de la venta = suma por línea de `round(precioBase*cantidad*pct/100)`.
- [ ] **Step 4: Run** the test — Expected: PASS
- [ ] **Step 5: Commit** `feat(onboarding): estado y reglas del simulador`

---

### Task 2: Pasos, subpasos y avance

**Files:**
- Create: `js/onboarding-steps.js`
- Test: `tests/onboarding-steps.test.mjs`

**Interfaces:**
- Consumes: `validarItem` (Task 1) no; solo nombres de anclas compartidos con Task 5.
- Produces:
  - `PASOS = ['bienvenida','crear_item','ver_items','venta','gasto','facturas','inventario','cierre']`
  - `numeroPaso(id): number|null` — `crear_item`→1 … `inventario`→6; otros → `null`. `TOTAL_PASOS = 6`
  - `SUBPASOS: Record<pasoId, Array<{ ancla:string, pantalla:string, avanza:'click'|'campo'|'info' }>>` (tabla abajo; el texto de cada burbuja lo escribe el implementador, corto y en tuteo, en un campo `texto`)
  - `avanzar(estado, evento:{tipo:'click'|'campo'|'siguiente', ancla:string, valido?:boolean}): Estado` — si el evento corresponde al subpaso actual (`click` con misma ancla; `campo` con misma ancla y `valido:true`; `siguiente` en subpasos `info`) incrementa `sub`; al pasar el último subpaso, pasa al siguiente paso con `sub:0`. Eventos que no corresponden → mismo estado (identidad).
  - `subpasoActual(estado): {ancla, pantalla, avanza, texto}|null`

Tabla `SUBPASOS` (ancla · pantalla · avanza):

| Paso | Subpasos |
|---|---|
| crear_item | `menu-items` · inicio · click → `btn-nuevo-item` · items-lista · click → `f-nombre` · item-crear · campo → `f-precio-base` · item-crear · campo → `f-impuesto` · item-crear · campo → `f-total` · item-crear · info → `f-costo` · item-crear · info → `f-existencias-toggle` · item-crear · click → `f-existencias` · item-crear · campo → `btn-crear-item` · item-crear · click |
| ver_items | `fila-item-cliente` · items-lista · info → `col-existencia` · items-lista · info → `switch-activo` · items-lista · info → `btn-editar` · items-lista · info → `buscador-items` · items-lista · info |
| venta | `btn-nueva-venta` · items-lista · click → `producto-cliente` · pos · click → `carrito-lineas` · pos · info → `btn-vender` · pos · click → `metodo-efectivo` · pago · click → `opciones-rapidas` · pago-efectivo · info → `btn-pagar` · pago-efectivo · click → `venta-completada` · venta-ok · info |
| gasto | `menu-egresos` · venta-ok · click → `btn-nuevo-gasto` · gastos-lista · click → `g-metodo` · gasto-crear · campo → `g-categoria` · gasto-crear · campo → `g-valor` · gasto-crear · campo → `g-turno` · gasto-crear · info → `btn-crear-gasto` · gasto-crear · click → `gasto-detalle` · gasto-detalle · info |
| facturas | `menu-ingresos` · gasto-detalle · click → `filtros-facturas` · facturas-lista · info → `factura-cliente` · facturas-lista · click → `factura-detalle` · factura-detalle · info |
| inventario | `menu-flujo` · factura-detalle · click → `ledger-entrada` · flujo · info → `ledger-salida` · flujo · info |

- [ ] **Step 1: Write the failing tests**

```js
test('numeroPaso', () => {
  assert.equal(numeroPaso('crear_item'), 1); assert.equal(numeroPaso('inventario'), 6)
  assert.equal(numeroPaso('bienvenida'), null); assert.equal(TOTAL_PASOS, 6)
})
test('avanzar solo con el evento esperado', () => {
  const s0 = { ...crearEstadoInicial('r'), step: 'crear_item', sub: 0 }
  assert.equal(avanzar(s0, { tipo: 'click', ancla: 'otro' }), s0)
  assert.equal(avanzar(s0, { tipo: 'click', ancla: 'menu-items' }).sub, 1)
  const sNombre = { ...s0, sub: 2 }
  assert.equal(avanzar(sNombre, { tipo: 'campo', ancla: 'f-nombre', valido: false }), sNombre)
  assert.equal(avanzar(sNombre, { tipo: 'campo', ancla: 'f-nombre', valido: true }).sub, 3)
})
test('el último subpaso pasa al siguiente paso', () => {
  const ult = SUBPASOS.crear_item.length - 1
  const s = avanzar({ ...crearEstadoInicial('r'), step: 'crear_item', sub: ult }, { tipo: 'click', ancla: 'btn-crear-item' })
  assert.equal(s.step, 'ver_items'); assert.equal(s.sub, 0)
})
test('toda ancla de SUBPASOS tiene texto', () => {
  for (const p of Object.values(SUBPASOS)) for (const sp of p) assert.ok(sp.texto?.length > 0, sp.ancla)
})
```

- [ ] **Step 2: Run** `node --test tests/onboarding-steps.test.mjs` — Expected: FAIL
- [ ] **Step 3: Implement** `js/onboarding-steps.js`. Textos: los del spec por paso (p.ej. en `f-total`: que el precio total se calcula solo; en `carrito-lineas`: que tocar otra vez el producto agrega otra línea y la cantidad se cambia en la casilla; en `g-turno`: que asociado al turno afecta el cierre de caja; en `factura-detalle`: qué significan *Aceptada*, *Contado*, *Pagada*).
- [ ] **Step 4: Run** — Expected: PASS
- [ ] **Step 5: Commit** `feat(onboarding): pasos y avance del recorrido`

---

### Task 3: Persistencia del avance por cuenta

**Files:**
- Create: `js/onboarding-progress.js`
- Test: `tests/onboarding-progress.test.mjs`

**Interfaces:**
- Consumes: `crearEstadoInicial` (Task 1)
- Produces (todas reciben `io = { get(k), set(k,v), remove(k) }`; en la app se pasa `{get:storageGet,set:storageSet,remove:storageRemove}` de `js/storage.js`):
  - `claveAvance(accountId:string|null): string` — `'onb_progress'` o `'onb_progress:'+accountId`
  - `cargarAvance(io, accountId): Estado|null` — `null` si no hay, si el JSON es inválido o si `v !== 1`
  - `guardarAvance(io, accountId, estado): void`
  - `adoptarCuenta(io, accountId, estadoActual): Estado` — al llegar `bold:context` tarde: si existe avance bajo la clave de la cuenta, gana el que tenga más avance (`completed`, luego índice de paso, luego `sub`); se guarda bajo la clave de la cuenta y se borra la anónima.

- [ ] **Step 1: Write the failing tests**

```js
const mem = () => { const m = new Map(); return { get: k => m.get(k) ?? null, set: (k, v) => m.set(k, v), remove: k => m.delete(k), m } }
test('clave por cuenta', () => {
  assert.equal(claveAvance(null), 'onb_progress'); assert.equal(claveAvance('acc1'), 'onb_progress:acc1')
})
test('JSON corrupto u otra versión → null', () => {
  const io = mem(); io.set('onb_progress', '{nope'); assert.equal(cargarAvance(io, null), null)
  io.set('onb_progress', JSON.stringify({ v: 99 })); assert.equal(cargarAvance(io, null), null)
})
test('ida y vuelta', () => {
  const io = mem(); const s = { ...crearEstadoInicial('r'), step: 'venta', sub: 2 }
  guardarAvance(io, 'a', s); assert.deepEqual(cargarAvance(io, 'a'), s)
})
test('adoptarCuenta migra el avance anónimo', () => {
  const io = mem(); const anon = { ...crearEstadoInicial('r'), step: 'gasto', sub: 1 }
  guardarAvance(io, null, anon)
  const r = adoptarCuenta(io, 'acc', anon)
  assert.equal(r.step, 'gasto'); assert.equal(io.get('onb_progress'), null)
  assert.deepEqual(cargarAvance(io, 'acc'), anon)
})
test('adoptarCuenta conserva el avance mayor de la cuenta', () => {
  const io = mem(); guardarAvance(io, 'acc', { ...crearEstadoInicial('r0'), step: 'facturas', sub: 0 })
  const r = adoptarCuenta(io, 'acc', { ...crearEstadoInicial('r1'), step: 'bienvenida' })
  assert.equal(r.step, 'facturas')
})
```

- [ ] **Step 2: Run** `node --test tests/onboarding-progress.test.mjs` — Expected: FAIL
- [ ] **Step 3: Implement** `js/onboarding-progress.js`
- [ ] **Step 4: Run** — Expected: PASS
- [ ] **Step 5: Commit** `feat(onboarding): avance retomable por cuenta`

---

### Task 4: Puente con Bold y telemetría

**Files:**
- Modify: `js/bold-context.js` (exportar el cálculo de destino que hoy hace `origenDelContenedor` + `initBoldContext`)
- Create: `js/onboarding-bridge.js`, `js/onboarding-telemetry.js`
- Test: `tests/onboarding-bridge.test.mjs`

**Interfaces:**
- Produces:
  - En `bold-context.js`: `export function destinoContenedor(win): string|null` — `null` si no estamos embebidos (`win.parent === win`) o si el contenedor conocido no es de Bold; el origen si se conoce; `'*'` si el navegador no lo expone. `initBoldContext` pasa a usarla (sin cambiar su comportamiento; `tests/bold-context.test.mjs` y `tests/bold-open-lesson.test.mjs` siguen en verde).
  - `mensajeCerrar(reason:'skip'|'complete'|'no_aplica') → { type:'academia:onboarding-close', v:1, reason }`
  - `mensajeNavegar(to:'items') → { type:'academia:navigate', v:1, to }`
  - `cerrarRecorrido(win, reason, { desdeAyuda:boolean }): 'portal'|'mensaje'|'suelto'` — `desdeAyuda` (la URL trae `?desde=ayuda`) → `win.location.href = '/'` y devuelve `'portal'`; si `destinoContenedor(win)` no es `null` → `postMessage(mensajeCerrar(reason), destino)` y `'mensaje'`; si no → `'suelto'` (la página muestra "Ya puedes cerrar esta ventana").
  - `irAMisItems(win): 'mensaje'|'suelto'` — si `destinoContenedor(win)` no es `null` → `postMessage(mensajeNavegar('items'), destino)` y `'mensaje'`; si no → `'suelto'`. Igual desde Ayuda (el portal también vive en un iframe de Bold).
  - `onboarding-telemetry.js`: `crearTelemetria({ track, getRunId, getAccountId }) → { inicio(), pasoCompleto(step), salto(step), retomo(step), fin(), botAbierto(step) }` que llaman `track('onboarding_start'|'onboarding_step_complete'|'onboarding_skip'|'onboarding_resume'|'onboarding_complete'|'onboarding_bot_open', { run_id, step?, vertical:'retail', account_id? })` (`account_id` se omite si es `null`).

- [ ] **Step 1: Write the failing tests**

```js
test('destinoContenedor', () => {
  const suelto = {}; suelto.parent = suelto
  assert.equal(destinoContenedor(suelto), null)
  const enBold = { parent: {}, document: { location: { ancestorOrigins: ['https://pos.bold.co'] } } }
  assert.equal(destinoContenedor(enBold), 'https://pos.bold.co')
  const enOtro = { parent: {}, document: { location: { ancestorOrigins: ['https://evil.example'] } } }
  assert.equal(destinoContenedor(enOtro), null)
  assert.equal(destinoContenedor({ parent: {}, document: { location: {} } }), '*')
})
test('cerrarRecorrido envía el mensaje a Bold', () => {
  const sent = []
  const win = { parent: { postMessage: (m, o) => sent.push([m, o]) }, document: { location: { ancestorOrigins: ['https://pos.stg.bold.co'] } } }
  assert.equal(cerrarRecorrido(win, 'skip', { desdeAyuda: false }), 'mensaje')
  assert.deepEqual(sent, [[{ type: 'academia:onboarding-close', v: 1, reason: 'skip' }, 'https://pos.stg.bold.co']])
})
test('desde Ayuda vuelve al portal', () => {
  const win = { location: { href: '/onboarding' }, parent: null }; win.parent = win
  assert.equal(cerrarRecorrido(win, 'complete', { desdeAyuda: true }), 'portal'); assert.equal(win.location.href, '/')
})
test('telemetría arma el payload', () => {
  const calls = []; const t = crearTelemetria({ track: (e, p) => calls.push([e, p]), getRunId: () => 'r1', getAccountId: () => null })
  t.pasoCompleto('venta')
  assert.deepEqual(calls[0], ['onboarding_step_complete', { run_id: 'r1', step: 'venta', vertical: 'retail' }])
})
```

- [ ] **Step 2: Run** `node --test tests/onboarding-bridge.test.mjs` — Expected: FAIL
- [ ] **Step 3: Implement** los tres archivos.
- [ ] **Step 4: Run** `node --test tests/onboarding-bridge.test.mjs tests/bold-context.test.mjs tests/bold-open-lesson.test.mjs` — Expected: PASS
- [ ] **Step 5: Commit** `feat(onboarding): puente de cierre con Bold y telemetría`

---

### Task 5: Réplica de las pantallas de Bold POS

**Files:**
- Create: `js/onboarding-screens.js`, `css/onboarding.css`
- Test: `tests/onboarding-screens.test.mjs`

**Interfaces:**
- Consumes: estado y helpers de Task 1, nombres de `pantalla` y `ancla` de Task 2.
- Produces: `renderPantalla(nombre:string, estado, errores?:Record<string,string>): string` para `inicio, items-lista, item-crear, pos, pago, pago-efectivo, venta-ok, gastos-lista, gasto-crear, gasto-detalle, facturas-lista, factura-detalle, flujo`. Cada pantalla va dentro del shell (barra superior con logo "bold", negocio "Mi negocio", aviso de modo práctica; menú lateral HOME, PUNTO DE VENTA, INGRESOS, EGRESOS, ÍTEMS, Clientes, Proveedores, Reportes, Ajustes, Ayuda; botón *+ Nueva venta*). Contratos:
  - Cada ancla de `SUBPASOS` existe como `data-onb="<ancla>"` en su `pantalla`.
  - Elementos clicables llevan `data-action="<ancla>"`; campos llevan `name` = ancla (`f-nombre`, `f-precio-base`, `f-impuesto` (select con `IMPUESTOS`), `f-costo`, `f-existencias`, `g-metodo`, `g-categoria`, `g-valor`, `g-observaciones`).
  - Todo texto del cliente pasa por `escapeHtml` de `js/utils.js`.
  - Errores se muestran bajo el campo con la clase `onb-error`.
  - Lista de ítems: el del cliente primero + 4 de relleno fijos (p.ej. "Cable cargador $ 14,280", "Gaseosa 400 ml $ 3,500", "Cuaderno argollado $ 8,900", "Audífonos $ 45,000").
  - Columnas y rótulos reales tomados del spec (Crear ítem, Lista de ítems, Nueva venta, Resumen de venta, Método de pago con 8 opciones, Venta Completada, Nuevo gasto, Facturas de Venta con etiquetas Aceptada/Contado/Pagada, Flujo de inventario con filas Entrada/Salida en rojo).
  - Elementos del menú que el paso no usa: `data-action="fuera-de-ruta"`.
  - Datos libres con ayuda: los campos de `item-crear` y `gasto-crear` llevan un placeholder de ejemplo, y cada formulario tiene un botón `data-action="usar-ejemplo"` que el controlador (Task 6) usa para llenar el borrador con `EJEMPLO_ITEM = { nombre:'Camiseta básica', precioBase:'20000', impuesto:'iva19', costo:'12000', existencias:'10' }` / `EJEMPLO_GASTO = { metodo:'Efectivo', categoria:'Servicios públicos', valor:'50000', observaciones:'Recibo de luz' }` (exportados desde `js/onboarding-state.js`) y avanzar los subpasos de campo ya válidos.
- `css/onboarding.css`: tokens `--bold-navy:#121e6c`, `--bold-red:#ee424e`, `--bold-bg:#f5f6fa`, fuente Montserrat (ya cargada por Google Fonts), clases `onb-*`. Referencia visual: re-explorar `pos.stg.bold.co` (sesión que abre el usuario) para colores y espaciados exactos.

- [ ] **Step 1: Write the failing tests**

```js
const base = () => crearItem(crearEstadoInicial('r'), { nombre: '<img src=x onerror=alert(1)>', precioBase: '20000', impuesto: 'iva19', existencias: '10' })
test('cada ancla de SUBPASOS existe en su pantalla', () => {
  let s = pagarVenta(agregarLinea(base()), 23800)
  s = crearGasto(s, { metodo: 'Efectivo', categoria: 'Servicios públicos', valor: '50000' })
  for (const lista of Object.values(SUBPASOS)) for (const sp of lista)
    assert.ok(renderPantalla(sp.pantalla, s).includes(`data-onb="${sp.ancla}"`), `${sp.pantalla}:${sp.ancla}`)
})
test('el nombre del cliente sale escapado', () => {
  const html = renderPantalla('items-lista', base())
  assert.ok(!html.includes('<img src=x')); assert.ok(html.includes('&lt;img'))
})
test('montos con formato Bold y aviso de práctica', () => {
  const html = renderPantalla('pos', agregarLinea(base()))
  assert.ok(html.includes('Vender $ 23,800'))
  assert.ok(html.includes('Modo práctica'))
})
test('errores bajo el campo', () => {
  assert.ok(renderPantalla('item-crear', base(), { nombre: 'Este campo es requerido' }).includes('onb-error'))
})
```

- [ ] **Step 2: Run** `node --test tests/onboarding-screens.test.mjs` — Expected: FAIL
- [ ] **Step 3: Implement** `js/onboarding-screens.js` (una función interna por pantalla + `shell(contenido, menuActivo)`) y `css/onboarding.css`.
- [ ] **Step 4: Run** — Expected: PASS
- [ ] **Step 5: Commit** `feat(onboarding): réplica de pantallas de Bold POS retail`

---

### Task 6: Página, guía y controlador

**Files:**
- Create: `onboarding.html`, `js/onboarding-guide.js`, `js/onboarding.js`
- Modify: `vercel.json` (rewrite `{ "source": "/onboarding", "destination": "/onboarding.html" }`)

**Interfaces:**
- Consumes: Tasks 1–5; `initBoldContext`, `onContextoBold`, `getContextoBold` (`js/bold-context.js`); `track` (`js/analytics.js`); `storageGet/Set/Remove` (`js/storage.js`).
- Produces:
  - `onboarding-guide.js`: `mostrarBurbuja(root:HTMLElement, ancla:string, texto:string, { conSiguiente:boolean, onSiguiente:()=>void }): void` (oscurece todo menos `[data-onb=ancla]`, burbuja posicionada al lado con flecha, reubica en `resize`/scroll, hace `scrollIntoView` del ancla) y `ocultarBurbuja(): void`.
  - `onboarding.html`: barra superior del recorrido (`Paso N de 6`, barra de progreso, *Saltar recorrido*), `#onb-stage` (pantalla), botón flotante `#onb-bot-btn` "¿Tienes una duda?" y `<aside id="onb-bot-panel" hidden><div id="section-assistant"></div></aside>` (lo usa Task 7). Carga `css/tw.css`, `css/style.css` (para el panel del bot), `css/onboarding.css`, `vendor/lucide.min.js`, `js/onboarding.js` como módulo.
  - Controlador (`onboarding.js`), en este orden: `initBoldContext()`; `runId` = el del estado cargado o `crypto.randomUUID()`; carga avance con `cargarAvance(io, getContextoBold()?.accountId ?? null)`; si hay avance sin terminar → `telemetria.retomo(step)`; pantallas especiales antes del recorrido: ancho < 1024 → "se ve mejor en computador"; contexto `restaurantes` (si llega estando en `bienvenida`) → "pronto tendremos tu recorrido" + `cerrarRecorrido(..., 'no_aplica')`; `onContextoBold(ctx => estado = adoptarCuenta(io, ctx.accountId, estado))` cuando `ctx.accountId`.
  - Delegación: `click` en `[data-action]` → reductores de Task 1 cuando aplica (`btn-crear-item` → `validarItem`; si falla, re-render con errores y no avanza; `producto-cliente` → `agregarLinea`, y si `topeAlcanzado` la burbuja dice que no hay más existencias; `btn-pagar` → `pagarVenta`; `btn-crear-gasto` → `validarGasto/crearGasto`; `fuera-de-ruta` → aviso corto "En este recorrido no vamos aquí") y luego `avanzar(estado, {tipo:'click', ancla})`. `input`/`change` en campos → guardar borrador en el estado y `avanzar(estado, {tipo:'campo', ancla:name, valido})` con la validación del campo. Precio total y totales se recalculan en vivo.
  - Tras cada cambio: `guardarAvance`, re-render de la pantalla de `subpasoActual`, `mostrarBurbuja`. Al cambiar de paso: `telemetria.pasoCompleto(pasoAnterior)`. Al llegar a `cierre`: `completed:true`, `telemetria.fin()`, pantalla de cierre con resumen, botón "Crear mi primer producto de verdad" (`irAMisItems` y luego `cerrarRecorrido(...,'complete')`) y enlaces a lecciones (`/?leccion=<slug>`; los slugs los elige el implementador de las lecciones existentes de ítems, ventas, gastos e inventario).
  - *Saltar recorrido*: `telemetria.salto(step)`, guarda avance, `cerrarRecorrido(win, 'skip', { desdeAyuda })`; si devuelve `'suelto'` muestra "Ya puedes cerrar esta ventana. Puedes retomar el recorrido desde Ayuda."
  - Bienvenida: qué aprenderá, ~5 minutos, aviso de práctica; *Empezar* (`telemetria.inicio()`) / *Saltar*.

- [ ] **Step 1: Implement** los tres archivos y el rewrite.
- [ ] **Step 2: Run** `node --test tests/` — Expected: todo PASS (nada se rompió).
- [ ] **Step 3: Verify en navegador** con un servidor local (`npx serve .` o similar) en `http://localhost:<puerto>/onboarding.html` a 1440 px: recorrer los 6 pasos con "Hamburguesa", 15.000, INC 8%, 5 unidades; comprobar total 16,200, que el flujo muestre 5 → 4 (o lo que se venda), que un nombre vacío muestre "Este campo es requerido" y no avance, que recargar a mitad retome en el mismo subpaso, que a 800 px salga "se ve mejor en computador". Con `embed-test.html` (o un `postMessage` desde la consola) enviar `bold:context` con `businessType:'restaurant'` y ver la pantalla de no aplica.
- [ ] **Step 4: Commit** `feat(onboarding): página del recorrido guiado`

---

### Task 7: BolBot dentro del recorrido

**Files:**
- Create: `js/bot-origin.js`, `supabase/migrations/add_origin_bodi_conversations.sql`
- Modify: `js/clarify.js:39` (`chatRequestBody`), `js/assistant.js:131` (`createConversation`) y `:823` (llamada a `chatRequestBody`), `js/onboarding.js`, `n8n/bold-pos-chat/construir-prompt.js`
- Test: `tests/clarify.test.mjs` (agregar casos)

**Interfaces:**
- Produces:
  - `bot-origin.js`: `setBotOrigin(origin:'onboarding'|null, step:string|null): void`, `getBotOrigin(): { origin, step }` (por defecto `{ origin:null, step:null }`).
  - `chatRequestBody({ ..., onboardingStep })` agrega `body.onboarding_step = onboardingStep` solo si viene (sin él, el body es idéntico al actual).
  - `createConversation` agrega `fila.origin = 'onboarding'` cuando `getBotOrigin().origin` lo es.
  - Migración: `alter table public.bodi_conversations add column if not exists origin text check (origin in ('onboarding'));` + consulta de verificación de `pg_policies` para `bodi_conversations` (la política de INSERT de `anon` y `authenticated` debe seguir permitiendo la fila).
  - En `onboarding.js`: `setBotOrigin('onboarding', estado.step)` en cada cambio de paso; `#onb-bot-btn` alterna `#onb-bot-panel` y llama `telemetria.botAbierto(step)`; `import './assistant.js'` (se dibuja solo en `#section-assistant`). Si `loadSettings()` trae `bot_enabled === 'false'`, el botón no aparece.

- [ ] **Step 1: Write the failing tests** en `tests/clarify.test.mjs`

```js
test('chatRequestBody incluye onboarding_step solo si viene', () => {
  const base = { message: 'hola', history: [], faqContext: [], clarifyCount: 0, seleccion: { vertical: 'retail' } }
  assert.equal(chatRequestBody(base).onboarding_step, undefined)
  assert.equal(chatRequestBody({ ...base, onboardingStep: 'crear_item' }).onboarding_step, 'crear_item')
})
```

- [ ] **Step 2: Run** `node --test tests/clarify.test.mjs` — Expected: FAIL
- [ ] **Step 3: Implement** `bot-origin.js`, los cambios en `clarify.js` y `assistant.js`, y el panel en `onboarding.js`.
- [ ] **Step 4: Run** `node --test tests/` — Expected: PASS
- [ ] **Step 5: Escribir la migración** y **pedir al usuario** que la corra en el SQL Editor de Supabase (es la base compartida). No seguir con el Step 6 de verificación de origen hasta que confirme.
- [ ] **Step 6: n8n** — en `construir-prompt.js`, si `onboarding_step` viene, agregar al prompt una línea: el usuario está en el recorrido guiado de práctica, paso `<step>`; responder sobre Bold POS real, breve. Exportar el workflow actual como respaldo, preparar el cambio y **pedir confirmación al usuario** antes de subirlo a producción (ver memoria "Workflow n8n del bot" para cómo editarlo por API). Sin el cambio, el bot responde como hoy.
- [ ] **Step 7: Verify en navegador** — abrir el bot en el paso de venta, preguntar "¿cómo cambio la cantidad?", comprobar respuesta y que la fila de `bodi_conversations` quede con `origin = 'onboarding'` (leer por REST).
- [ ] **Step 8: Commit** `feat(onboarding): BolBot dentro del recorrido con el paso como contexto`

---

### Task 8: Retomar desde Ayuda (portal)

**Files:**
- Create: `js/onboarding-resume.js`
- Modify: `index.html` (contenedor `#onboarding-resume` entre `<header>` y `<main>`), `js/main.js`
- Test: `tests/onboarding-resume.test.mjs`

**Interfaces:**
- Consumes: `cargarAvance`, `claveAvance` (Task 3); `numeroPaso`, `TOTAL_PASOS` (Task 2).
- Produces: `modeloTarjeta(estado|null): { tipo:'continuar', paso:number, total:6 } | { tipo:'empezar' } | { tipo:'repetir' }` — `null` o en `bienvenida` sin empezar → `'empezar'`; `completed` → `'repetir'`; si no, `'continuar'` con `numeroPaso(step) ?? 1`.
  - Render en `main.js`: `continuar` → banner visible "Continúa tu recorrido (paso N de 6)" con botón *Continuar*; `empezar`/`repetir` → enlace discreto "Recorrido guiado de Bold POS" (`repetir` arranca desde cero: borra el avance y crea un `runId` nuevo). Todos navegan a `/onboarding?desde=ayuda` en el mismo iframe. Se recalcula al llegar `bold:context` (`onContextoBold`) porque la clave depende de la cuenta. Estilos con clases que ya existan en `css/tw.css` o en `css/style.css`.

- [ ] **Step 1: Write the failing tests**

```js
test('modeloTarjeta', () => {
  assert.deepEqual(modeloTarjeta(null), { tipo: 'empezar' })
  assert.deepEqual(modeloTarjeta({ ...crearEstadoInicial('r'), step: 'gasto' }), { tipo: 'continuar', paso: 4, total: 6 })
  assert.deepEqual(modeloTarjeta({ ...crearEstadoInicial('r'), step: 'cierre', completed: true }), { tipo: 'repetir' })
})
```

- [ ] **Step 2: Run** `node --test tests/onboarding-resume.test.mjs` — Expected: FAIL
- [ ] **Step 3: Implement** el módulo y el render en `index.html`/`main.js`.
- [ ] **Step 4: Run** `node --test tests/` — Expected: PASS
- [ ] **Step 5: Verify en navegador** — empezar el recorrido, saltar en el paso 3, abrir `/` y ver "Continúa tu recorrido (paso 3 de 6)"; *Continuar* abre el subpaso donde iba; al terminar, *Saltar*/cerrar vuelve a `/` (`?desde=ayuda`).
- [ ] **Step 6: Commit** `feat(onboarding): retomar el recorrido desde Ayuda`

---

### Task 9: Admin — embudo del recorrido y filtro de BolBot

**Files:**
- Create: `supabase/migrations/create_analytics_onboarding_funnel.sql`, `supabase/migrations/update_analytics_bot_conversations_origin.sql`
- Modify: `js/analytics-api.js` (`fetchOnboardingFunnel`, `p_origin` en `fetchBotConversations`), `js/analytics-ui.js` (`funnelCardHtml`), `js/admin-lessons-analytics.js:102-117` (usar `funnelCardHtml` para el embudo del curso y agregar el del recorrido), `js/admin-bot-analytics.js:367-413` (filtro "Solo recorrido guiado")
- Test: `tests/analytics-ui.test.mjs`, `tests/analytics-api.test.mjs` (agregar casos)

**Interfaces:**
- Produces:
  - RPC `analytics_onboarding_funnel(p_from timestamptz, p_to timestamptz) returns jsonb` — mismo patrón que `create_analytics_course_funnel.sql` (`security definer`, `revoke ... from public, anon`, `grant ... to authenticated`), cuenta `distinct payload->>'run_id'`: `{ started, steps: { crear_item, ver_items, venta, gasto, facturas, inventario }, completed, skipped_by_step: {<step>: n}, bot_by_step: {<step>: n} }`.
  - `analytics_bot_conversations` con `p_origin text default null` al final (patrón de `update_analytics_bot_conversations_no_info.sql`: dropear la firma de 10 args, filtro `and (p_origin is null or origin = p_origin)`).
  - `fetchOnboardingFunnel(from:Date, to:Date, client?)`; `fetchBotConversations(..., { origin })` → `p_origin: filters.origin ?? null`.
  - `funnelCardHtml(titulo:string, etapas:Array<[label:string, n:number]>): string` — el HTML que hoy está inline en `admin-lessons-analytics.js` (porcentaje sobre la primera etapa).
  - Tarjeta "Recorrido guiado": etapas Empezó, Creó el ítem, Vio sus productos, Hizo la venta, Registró el gasto, Vio facturas, Vio inventario, Terminó; debajo, "Saltaron en:" y "Abrieron el bot en:" por paso.

- [ ] **Step 1: Write the failing tests**

```js
test('funnelCardHtml calcula % sobre la primera etapa', () => {
  const html = funnelCardHtml('Recorrido guiado', [['Empezó', 10], ['Terminó', 4]])
  assert.ok(html.includes('Recorrido guiado')); assert.ok(html.includes('(40%)')); assert.ok(html.includes('(100%)'))
})
test('funnelCardHtml con base 0 no divide por cero', () => {
  assert.ok(funnelCardHtml('X', [['A', 0], ['B', 0]]).includes('(0%)'))
})
test('fetchBotConversations manda p_origin', async () => {
  let params; const client = { rpc: async (n, p) => { params = p; return { data: [], error: null } } }
  await fetchBotConversations(new Date(0), new Date(1), { origin: 'onboarding' }, client)
  assert.equal(params.p_origin, 'onboarding')
})
```

- [ ] **Step 2: Run** `node --test tests/analytics-ui.test.mjs tests/analytics-api.test.mjs` — Expected: FAIL
- [ ] **Step 3: Implement** el JS y las dos migraciones.
- [ ] **Step 4: Run** `node --test tests/` — Expected: PASS
- [ ] **Step 5: Pedir al usuario** que corra las dos migraciones en el SQL Editor (después de la de Task 7). Verificar por REST que la RPC responde con la forma esperada (recordar: supabase-js no lanza en error; leer la respuesta cruda).
- [ ] **Step 6: Verify en navegador** — `/admin` → analítica de lecciones muestra el embudo del recorrido con las corridas de prueba de Tasks 6–8; el dashboard de BolBot con "Solo recorrido guiado" lista la conversación de Task 7.
- [ ] **Step 7: Commit** `feat(admin): embudo del recorrido guiado y filtro de conversaciones de onboarding`

---

### Task 10: Requerimiento para Bold

**Files:**
- Create: `docs/integracion-bold/requerimiento-recorrido-guiado.md`

Mismo formato que `docs/integracion-bold/requerimiento-abrir-leccion.md`. Contenido: cuándo abrir (al terminar la creación de cuenta self service, solo retail por ahora, escritorio), cómo (iframe en modal a pantalla completa dentro de `pos.bold.co`, URL `https://<dominio de Academia>/onboarding`), el `bold:context` existente, y los mensajes que Bold debe escuchar del iframe (`academia:onboarding-close` con `reason: 'skip'|'complete'|'no_aplica'` → cerrar el modal; `academia:navigate` con `to: 'items'` → llevar a Ítems → Lista de ítems), validando `event.origin` contra el dominio de Academia. Incluir que el avance se retoma desde Ayuda y que no hay datos del recorrido que Bold deba guardar.

- [ ] **Step 1: Escribir** el documento.
- [ ] **Step 2: Si existe `md2docx.js`** en la carpeta, generar el `.docx` como los anteriores (`node docs/integracion-bold/md2docx.js <md>`; revisar su uso en el archivo).
- [ ] **Step 3: Commit** `docs(bold): requerimiento de integración del recorrido guiado`

---

## Self-review (hecho)

- Cobertura del spec: bienvenida/6 pasos/cierre (T2, T5, T6), datos libres + ejemplo sugerido (T5 `usar-ejemplo`, T1 `EJEMPLO_*`), saltar/retomar (T3, T6, T8), móvil y restaurantes (T6), bot con contexto y origen (T7), embudo + filtro (T9), contrato con Bold (T4, T10), aviso de práctica (Global Constraints, T5).
- Tipos: `Estado`, anclas y pantallas definidas en T1/T2 y consumidas igual en T5–T8.
