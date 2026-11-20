# Inventario: corrección por fases, categorías con copiar y fin de unidades por crear — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El conversor de inventario deja de descartar filas o poner 0 por su cuenta: devuelve pendientes que el cliente corrige en ventanas por fases (nombre → precio → costo → existencia); las categorías por crear salen una por fila con botón Copiar; se elimina el bloque "unidades por crear".

**Architecture:** `convertir()` (puro) deja de decidir: no exporta las filas con un dato inválido y las reporta en `r.pendientes` / `r.columnasSinDato`; las decisiones del cliente vuelven como `opciones.correcciones`, `opciones.omitidas` y `opciones.valorPorColumna`. Un módulo puro nuevo (`inv-correcciones.js`) concentra validación y aplicación de decisiones; un módulo de UI (`inv-correcciones-ui.js`) pinta las ventanas; `inv-chat.js` solo las orquesta.

**Tech Stack:** JS vanilla (módulos ES), `node --test`, Playwright (`scripts/qa-inventario.mjs`), CSS de `css/inventario.css`.

**Spec:** `docs/superpowers/specs/2026-11-20-inventario-correccion-por-fases-design.md`

## Global Constraints

- **Rama:** todo en `sandbox` (nunca push a `master`). Las migraciones no aplican: no hay cambios de base de datos.
- **Tests:** `node --test tests/*.test.mjs` (no `node --test tests/`). La suite hoy tiene 710 tests verdes.
- **Commits:** en español, `tipo(alcance): descripcion` en minúsculas, cuerpo con el *por qué*, y al final la línea `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **Orden de las fases:** Nombre → Precio de venta → Costo → Existencia. Una fase sin pendientes no aparece; tras cada fase se recalcula.
- **Salidas del cliente por campo:** nombre y precio: escribir valor u **omitir**; costo y existencia: escribir valor o **dejar en 0**; cada línea tiene su propio control (**Omitir** / **En 0**) además del atajo de fase (aplica a todos). Columna completa sin dato: una sola pregunta (*Dejar todas en 0* / *Poner el mismo valor a todas* / *Subir otro archivo*); para nombre y precio solo *Subir otro archivo* / *Corregirlos aquí* (no se ofrece omitir: dejaría 0 productos).
- **Decisiones de la revisión:** tras cada ronda se recalcula y se toman los primeros 50 de lo que queda; `valorPorColumna` solo llena celdas vacías; `0` es válido y una celda vacía nunca es 0; `r.total` sigue siendo "filas exportadas"; "Subir otro archivo" conserva facturación electrónica e IVA y reinicia el resto.
- **Páginas de 50** pendientes por ronda dentro de la fase; el atajo aplica a **todos** los pendientes del campo.
- **Precio 0 sigue siendo válido.** Costo y existencia 0 también. Inválido = faltante, no numérico o negativo.
- Las filas totalmente vacías o con datos solo en columnas no mapeadas se siguen omitiendo en silencio (`filaSinDatoMapeado`, sin cambios). Solo existencia aplica a inventariables.
- **Nunca** poner en 0 ni omitir un dato sin que el cliente lo haya elegido. Telemetría solo con conteos, sin nombres ni valores.
- Texto de UI en español con tuteo (sin voseo). HTML dinámico siempre con `esc` (`chat-base.js`) / `escapeHtml`.
- Las 15 unidades de Bold son fijas: no se pueden crear. No se ofrece crear unidades en ningún lugar.

## Review Focus

Entradas que el spec implica pero que ninguna tarea prueba "de rutina"; cada una tiene su test en la tarea indicada.

1. Una fila con **dos campos pendientes** (costo y existencia): aparece en cada fase una vez, y al resolver una no reaparece la otra resuelta. → Task 2.
2. Una fila **omitida en la fase de nombre/precio** no genera pendientes de costo ni existencia después. → Task 1.
3. Un **0 escrito a propósito** (o un 0 que ya venía en el archivo) es válido y no vuelve a ser pendiente. → Task 1 y Task 3.
4. Más de **50 pendientes**: tras resolver los primeros 50 aparecen los siguientes, y el atajo cubre los que no se ven. → Task 3 y Task 6 (QA).
5. **Re-subir otro archivo** limpia correcciones/omitidas/valores/decisiones (las filas son otras) y el número escrito respeta `formatoNumero` (`1.500`, `1,5`). → Task 4 y Task 3.
6. Un nombre de producto con HTML (`<img onerror>`) en la lista de pendientes o de categorías se muestra escapado. → Task 6 y Task 7 (QA).

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `js/inv-convertir.js` (modificar) | Detectar pendientes y columnas sin dato; aplicar correcciones, omitidas y valor por columna. Sin DOM. |
| `js/inv-correcciones.js` (nuevo, puro) | Validar lo que escribe el cliente y construir las nuevas `opciones`; listas por fase. |
| `js/inv-correcciones-ui.js` (nuevo) | Ventanas de cada fase (lista de filas / pregunta de columna). |
| `js/inv-lista-copiable.js` (nuevo) | Lista de textos, una fila con botón Copiar cada uno (categorías). |
| `js/inv-sesion.js` (modificar) | Estado nuevo (`opciones` + `decisiones`) y su reinicio al cargar archivo. |
| `js/inv-chat.js` (modificar) | Orquestar `pasoCorrecciones`, usar la lista copiable, quitar unidades por crear, resumen final. |
| `js/herramientas-telemetria.js` (modificar) | Códigos de error nuevos con su etiqueta. |
| `css/inventario.css` (modificar) | Estilos del editor de correcciones y de la lista copiable. |
| `tests/inv-convertir.test.mjs`, `tests/inv-correcciones.test.mjs` (nuevo), `tests/inv-sesion.test.mjs`, `tests/herramientas.test.mjs` | Pruebas. |
| `scripts/qa-inventario.mjs` | Escenarios de navegador. |

---

### Task 0: Preparar la rama

**Files:**
- Commit: `docs/superpowers/specs/2026-11-20-inventario-correccion-por-fases-design.md`, este plan.

- [ ] **Step 1: Crear `sandbox` local desde el remoto y confirmar que la suite está verde**

Run: `git fetch origin && git switch -c sandbox --track origin/sandbox && node --test tests/*.test.mjs`
Expected: rama `sandbox` activa (los archivos sin seguir del spec y del plan se conservan), `ℹ pass 710`, `ℹ fail 0` (o más tests si `eae29b0` agregó alguno; ninguno en rojo).

- [ ] **Step 2: Commit de spec y plan**

```bash
git add docs/superpowers/specs/2026-11-20-inventario-correccion-por-fases-design.md docs/superpowers/plans/2026-11-20-inventario-correccion-por-fases.md
git commit -m "docs(inventario): diseño y plan de la correccion de datos por fases"
```

---

### Task 1: Motor — detectar pendientes en lugar de descartar o poner 0

**Files:**
- Modify: `js/inv-convertir.js` (bloque de precio/costo/existencia, `errores`/`avisos` y el `return`)
- Test: `tests/inv-convertir.test.mjs` (nuevos + actualizar los que esperaban ceros o errores automáticos)

**Interfaces:**
- Consumes: `convertir({ filas, mapeo, plantillas, opciones })` existente.
- Produces: `convertir()` devuelve además
  - `pendientes: Pendiente[]` con `Pendiente = { fila: number, nombre: string, campo: 'nombre'|'precioTotal'|'costo'|'existencia', motivo: 'vacio'|'invalido'|'negativo', original: string }`. `fila` es `fila.__fila ?? índice+1` (el mismo `n` de los avisos); `nombre` es el nombre de la fila o `'(sin nombre)'`; `original` es `String(valor crudo ?? '')`.
  - `columnasSinDato: Campo[]` (mismo tipo de `campo`): un campo está aquí si **todas** las filas candidatas lo tienen con motivo `vacio` (candidatas = no omitidas en silencio; para `existencia`, solo las inventariables; mínimo 1 candidata).
- Una fila con **cualquier** pendiente **no** entra en `salidas` y **no** cuenta en `errores`. Una fila pendiente en nombre/precio sigue reportando sus pendientes de costo/existencia **solo si** la fila no fue omitida (la omisión llega en Task 2).
- Desaparecen: `sinCosto`/`sinExistencia` y sus avisos ("quedaron en 0"), el aviso de existencia negativa, y los `error(...)` de `filas_nombre` y `filas_precio` (pasan a pendientes).

- [ ] **Step 1: Escribir los tests que fallan** (en `tests/inv-convertir.test.mjs`, con los helpers `hojasInv`, `leerPlantilla`, `mapearColumnas` ya presentes)

Tests (nombre → aserciones clave):
- `convertir: precio inválido es pendiente, no error ni fila exportada` → filas `[['Camisa','abc'],['Pan',1000]]` con encabezados `['Nombre','Precio']`, `opciones.inventariable:'no'` y plantilla no inventariable: `r.pendientes` deepEqual `[{fila:1, nombre:'Camisa', campo:'precioTotal', motivo:'invalido', original:'abc'}]`; `r.errores.length === 0`; `r.salidas.noinventariable.length === 1`.
- `convertir: motivos vacio / invalido / negativo en precio, costo y existencia` → una fila por caso con encabezados `['Nombre','Precio','Costo','Existencia']`: `['A','',5,1]`→precio `vacio`; `['B',-3,5,1]`→precio `negativo`; `['C',9,'x',1]`→costo `invalido`; `['D',9,-1,1]`→costo `negativo`; `['E',9,5,-4]`→existencia `negativo`; `['F',9,5,'']`→existencia `vacio` (`inventariable:'si'`).
- `convertir: nada se pone en 0 por su cuenta` → fila `['G',9,'',''] ` inventariable: `salidas.inventariable.length === 0` y `avisos` no contiene `/quedaron en 0/`.
- `convertir: un 0 que viene en el archivo es válido` → `['H',0,0,0]` inventariable: `pendientes.length === 0` y la salida tiene `costo:0, precioTotal:0, existencia:0`. *(Review Focus 3)*
- `convertir: nombre vacío con otros datos es pendiente nombre` → `['  ',500]` → `{campo:'nombre', motivo:'vacio', nombre:'(sin nombre)'}`.
- `convertir: una fila con dos campos pendientes los reporta ambos` → `['I',9,'',-2]` inventariable: `pendientes.map(p=>p.campo)` deepEqual `['costo','existencia']`.
- `convertir: columnasSinDato` → archivo con encabezados `['Nombre','Precio']` y 3 filas inventariables (`opciones.inventariable:'si'`): `columnasSinDato` incluye `'costo'` y `'existencia'`; con una fila que sí trae costo, `'costo'` ya no está.
- `convertir: existencia solo cuenta para inventariables` → con `opciones.inventariable:'no'`, sin existencia, `pendientes` no tiene campo `existencia` y `columnasSinDato` no la incluye.
- Actualizar `Alegra → plantilla inventariable (sin ISV)`: ahora `r.salidas.inventariable.length === 0`, `r.pendientes.map(p=>p.campo)` deepEqual `['existencia']` y `r.columnasSinDato` deepEqual `['existencia']` (la comprobación del objeto exportado y del aviso `sin existencia` pasa a Task 2). Actualizar `errores por fila…` (dos pendientes `nombre` y `precioTotal`, `errores.length === 0`, `total === 0`) y `fila con nombre pero sin precio → error (regresión)` (ahora pendiente `precioTotal`, `salidas.inventariable.length === 1`, `errores.length === 0`).

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test tests/inv-convertir.test.mjs`
Expected: FAIL en los tests nuevos y en los tres actualizados (`pendientes` es `undefined`).

- [ ] **Step 3: Implementar en `js/inv-convertir.js`**

Dentro de `convertir`, por cada fila no vacía calcular los cuatro campos y acumular `pendientes` sin salir de la fila hasta haberlos evaluado todos; si hay alguno, `return` sin exportar (después de contar candidatas para `columnasSinDato`). Un helper local `motivoDe(crudo, valor)` devuelve `'vacio'` si el crudo es vacío tras `trim`, `'negativo'` si el número es `< 0`, `'invalido'` si no parsea. `esInventariable === null` sigue marcando `pendienteInventariable` (la fila se trata como no inventariable, como hoy). El precio mantiene el cálculo desde `precioBase`. Mantener `filas_plantilla_tipo` como error. `columnasSinDato` se calcula al final con los contadores `candidatas` y `vacios` por campo.

- [ ] **Step 4: Correr y ver que pasan**

Run: `node --test tests/inv-convertir.test.mjs`
Expected: PASS todo el archivo.

- [ ] **Step 5: Commit**

```bash
git add js/inv-convertir.js tests/inv-convertir.test.mjs
git commit -m "feat(inventario): el motor reporta pendientes en vez de descartar filas o poner ceros"
```

---

### Task 2: Motor — aplicar correcciones, omitidas y valor por columna

**Files:**
- Modify: `js/inv-convertir.js`
- Test: `tests/inv-convertir.test.mjs`

**Interfaces:**
- Consumes: `pendientes` y `columnasSinDato` de Task 1.
- Produces: `opciones` acepta
  - `correcciones: { [fila: number]: { nombre?: string, precioTotal?: number, costo?: number, existencia?: number } }` — el valor corregido **sustituye** al crudo del archivo para ese campo y esa fila (se asume ya validado, ≥ 0).
  - `omitidas: number[]` — números de fila que no se exportan; no generan pendientes; cada una aparece en `errores` con `{ fila, mensaje: '"<nombre>": la omitiste (<motivo legible>).', codigo: 'filas_nombre' | 'filas_precio' }` según el pendiente de nombre/precio que tenía (si no tenía, no genera error).
  - `valorPorColumna: { costo?: number, existencia?: number }` — se usa solo en filas cuyo campo tiene motivo `vacio` (los `negativo`/`invalido` siguen pendientes).
- Orden de resolución de un campo: `correcciones` → `valorPorColumna` (solo si estaba vacío) → valor del archivo.

- [ ] **Step 1: Escribir los tests que fallan**

- `convertir: la corrección sustituye al dato del archivo` → `['Camisa','abc']` con `correcciones:{1:{precioTotal:25000}}`: `pendientes.length === 0`, `salidas.noinventariable[0].precioTotal === 25000`.
- `convertir: corregir nombre` → `['',500]` con `correcciones:{1:{nombre:'Lápiz'}}` → sale `nombre:'Lápiz'`.
- `convertir: omitir fila de precio la saca sin pendientes y la lista como error` → `omitidas:[1]`: `pendientes.length === 0`, `salidas…length === 0`, `errores` deepEqual de longitud 1 con `codigo:'filas_precio'` y mensaje que contiene `omitiste`.
- `convertir: una fila omitida no genera pendientes de costo ni existencia` → `['J','abc','', '']` inventariable con `omitidas:[1]`: `pendientes.length === 0`. *(Review Focus 2)*
- `convertir: valorPorColumna llena solo los vacíos` → filas `['A',9,'',5]`, `['B',9,-1,5]` con `valorPorColumna:{costo:0}`: la salida de A trae `costo:0`; B sigue como pendiente `costo` `negativo`.
- `convertir: valorPorColumna existencia deja 0 a propósito sin avisos de "quedaron en 0"` → el Alegra del test actualizado con `valorPorColumna:{existencia:0}` devuelve el objeto completo `{codigo:'', nombre:'Coca Cola 600ml', categoria:'General', referencia:'', descripcion:'', unidad:'Unidades', costo:350050, precioTotal:5950, existencia:0}` y `avisos` sin `/quedaron en 0/`.
- `convertir: una fila con costo y existencia pendientes se resuelve por campo` → `['I',9,'',-2]` con `correcciones:{1:{costo:7}}` deja un único pendiente `existencia`; con ambas correcciones, ninguno y una fila exportada. *(Review Focus 1)*

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test tests/inv-convertir.test.mjs`
Expected: FAIL en los tests nuevos.

- [ ] **Step 3: Implementar**

En `convertir`, antes de evaluar cada campo, consultar `opciones.correcciones?.[n]?.[campo]` (con `Object.hasOwn` para claves seguras) y `opciones.omitidas` como `Set`. Para filas omitidas: `return error(n, …, codigo)` si tenían pendiente de nombre/precio, si no `return` silencioso, sin evaluar costo/existencia. `valorPorColumna` solo reemplaza cuando `motivoDe(...) === 'vacio'`.

- [ ] **Step 4: Correr y ver que pasan**

Run: `node --test tests/inv-convertir.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/inv-convertir.js tests/inv-convertir.test.mjs
git commit -m "feat(inventario): el motor acepta correcciones, filas omitidas y un valor por columna"
```

---

### Task 3: Módulo puro de correcciones

**Files:**
- Create: `js/inv-correcciones.js`
- Test: `tests/inv-correcciones.test.mjs`

**Interfaces:**
- Consumes: `parseNumero(v, formato)` de `./inv-numeros.js`, `sanear` de `./inv-saneamiento.js`.
- Produces (todas exportadas):
  - `FASES = ['nombre', 'precioTotal', 'costo', 'existencia']`
  - `ETIQUETA_CAMPO = { nombre: 'Nombre', precioTotal: 'Precio de venta', costo: 'Costo', existencia: 'Existencia' }`
  - `TAMANO_PAGINA = 50`
  - `validarValor(campo, texto, formato = 'auto') -> { ok: true, valor: string|number } | { ok: false }` — nombre: `sanear(texto)` no vacío; resto: `parseNumero` no nulo y `>= 0`.
  - `pendientesDeFase(r, campo) -> Pendiente[]` (filtra `r.pendientes`).
  - `esColumnaCompleta(r, campo) -> boolean` (`r.columnasSinDato.includes(campo)`).
  - `siguienteFase(r) -> campo | null` (primera de `FASES` con pendientes, en orden).
  - `pagina(lista) -> Pendiente[]` (primeros `TAMANO_PAGINA`).
  - `conCorreccion(opciones, fila, campo, valor) -> opciones` y `conCeros(opciones, pendientes) -> opciones` y `conOmitidas(opciones, filas) -> opciones` y `conValorColumna(opciones, campo, valor) -> opciones` — devuelven **una copia** de `opciones` (no mutan).
  - `descripcionMotivo(p) -> string` — ej. `Existencia es negativa (−4)`, `Costo está vacío`, `Precio de venta no es un número (abc)`.

- [ ] **Step 1: Escribir los tests que fallan** (`tests/inv-correcciones.test.mjs`)

- `validarValor: nombre`: `' Lápiz  {x} '` → `{ok:true, valor:'Lápiz x'}`; `'   '` → `{ok:false}`.
- `validarValor: números`: `'25000'`→25000; `'0'` → `{ok:true, valor:0}` (Review Focus 3); `'-1'` y `'abc'` y `''` → `{ok:false}`; con formato `'coma'`, `'1,5'`→1.5; con `'auto'`, `'1.500'`→1500. *(Review Focus 5)*
- `siguienteFase` respeta el orden: pendientes de `existencia` y `precioTotal` → `'precioTotal'`; sin pendientes → `null`.
- `pagina` corta a 50: lista de 120 → 50; los 50 primeros son los primeros.
- Tras `conCeros(opciones, 120 pendientes de costo)` las 120 filas tienen `correcciones[fila].costo === 0` aunque `pagina` solo muestre 50 *(Review Focus 4)*; `opciones` original sin cambios.
- `conOmitidas` agrega sin duplicar; `conValorColumna(op,'existencia',0)` fija `valorPorColumna.existencia === 0`.
- `descripcionMotivo` para los tres motivos.

- [ ] **Step 2: Correr y ver que fallan**

Run: `node --test tests/inv-correcciones.test.mjs`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar `js/inv-correcciones.js`** con las firmas de Interfaces. `correcciones` y `valorPorColumna` se copian con `{ ...opciones.correcciones }` y `Object.hasOwn` al leer (las claves son números de fila, no texto del cliente).

- [ ] **Step 4: Correr y ver que pasan**

Run: `node --test tests/inv-correcciones.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/inv-correcciones.js tests/inv-correcciones.test.mjs
git commit -m "feat(inventario): modulo puro para validar y aplicar las correcciones del cliente"
```

---

### Task 4: Sesión — estado nuevo y reinicio al cargar archivo

**Files:**
- Modify: `js/inv-sesion.js` (`estado.opciones`, nuevo `estado.decisiones`, `cargarOrigen`)
- Test: `tests/inv-sesion.test.mjs`

**Interfaces:**
- Consumes: `convertir` con las opciones de Task 2.
- Produces: `estado.opciones` incluye `correcciones: {}`, `omitidas: []`, `valorPorColumna: {}`; `estado.decisiones = { ceros: { costo: 0, existencia: 0 }, omitidas: 0, corregidos: 0, valorComun: null }` (contadores que usa el resumen final; `valorComun` será `{ campo, valor, filas }` cuando el cliente elija "el mismo valor a todas"; `ceros` cuenta celdas puestas en 0 por línea, atajo o "todas en 0"). `cargarOrigen` los reinicia a esos valores; `recalcular` ya pasa `{ ...estado.opciones }` al motor.

- [ ] **Step 1: Escribir el test que falla** (`cargarOrigen: reinicia correcciones, omitidas, valorPorColumna y decisiones`, junto al test existente de `categoriasIA`)

Dejar valores sucios en las cuatro estructuras, llamar `cargarOrigen` con un archivo válido y comprobar que quedan en su valor inicial (`{}`, `[]`, `{}`, contadores en 0), y que `estado.ia` se conserva como en el test vecino. *(Review Focus 5)*

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test tests/inv-sesion.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implementar** — agregar los campos al objeto `estado` y reiniciarlos junto a `estado.opciones.categoriasIA = null` en `cargarOrigen`.

- [ ] **Step 4: Correr y ver que pasa**

Run: `node --test tests/inv-sesion.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/inv-sesion.js tests/inv-sesion.test.mjs
git commit -m "feat(inventario): la sesion guarda las correcciones y las reinicia al cambiar de archivo"
```

---

### Task 5: Telemetría — códigos de las correcciones

**Files:**
- Modify: `js/herramientas-telemetria.js` (`ERRORES`)
- Test: `tests/herramientas.test.mjs` (el que ya valida que los códigos tengan etiqueta)

**Interfaces:**
- Produces: nuevos códigos en `ERRORES` (paso `'correcciones'`): `correccion_pendientes` ("Se encontraron datos inválidos que el cliente debía corregir"), `correccion_corrigio` ("Escribió los valores correctos"), `correccion_ceros` ("Eligió dejar costos o existencias en 0"), `correccion_omitio` ("Eligió omitir filas sin nombre o precio"), `correccion_reupload` ("Prefirió subir otro archivo"). Uso: `telemetria.error('correcciones', <codigo>, { campo, filas })` — **solo conteos**.

- [ ] **Step 1: Test que falla** — ampliar el test existente de `ERRORES`/etiquetas para exigir los cinco códigos con etiqueta no vacía; y que `telemetria.error('correcciones','correccion_ceros',{campo:'costo',filas:3})` envía `tool_error` con `codigo:'correccion_ceros'` (no `'otro'`).
- [ ] **Step 2: Correr y ver que falla** — `node --test tests/herramientas.test.mjs` → FAIL.
- [ ] **Step 3: Implementar** — agregar las cinco entradas a `ERRORES`.
- [ ] **Step 4: Correr y ver que pasa** — `node --test tests/herramientas.test.mjs` → PASS.
- [ ] **Step 5: Commit**

```bash
git add js/herramientas-telemetria.js tests/herramientas.test.mjs
git commit -m "feat(inventario): codigos de telemetria para las correcciones por fases"
```

---

### Task 6: Chat — ventanas de corrección por fases

**Files:**
- Create: `js/inv-correcciones-ui.js`
- Modify: `js/inv-chat.js` (`pasoPreguntas`, `pasoResultado`), `css/inventario.css`
- Test: `scripts/qa-inventario.mjs` (+ `tests/` no aplica: es DOM; ver Task 9 para los escenarios)

**Interfaces:**
- Consumes: `FASES`, `ETIQUETA_CAMPO`, `validarValor`, `pendientesDeFase`, `esColumnaCompleta`, `pagina`, `conCorreccion`, `conCeros`, `conOmitidas`, `conValorColumna`, `descripcionMotivo` (Task 3); `sesion.estado.opciones` / `.decisiones` / `.recalcular()` (Task 4); `bot`, `chips`, `usuario`, `vivo`, `alDesplazar`, `esc`, `telemetria`.
- Produces: `export function crearVentanasCorreccion({ sesion, bot, chips, usuario, vivo, alDesplazar, esc, telemetria }) -> { correr(): Promise<'ok' | 'reupload'> }`. `correr()` recorre `FASES` en orden: `recalcular()`, y mientras la fase tenga pendientes muestra su ventana (columna completa → una pregunta con `chips`; filas sueltas → editor), aplica la decisión a `sesion.estado.opciones` y actualiza `sesion.estado.decisiones`. Devuelve `'reupload'` si el cliente elige *Subir otro archivo*; si no, `'ok'`.

- [ ] **Step 1: Implementar `js/inv-correcciones-ui.js`**

Comportamiento exacto:
- **Columna completa** (`esColumnaCompleta`): mensaje `Tu archivo no trae <etiqueta en minúscula>.` Botones: costo/existencia → **Dejar todas en 0** (`conValorColumna(…, 0)`, suma a `decisiones.ceros`), **Poner el mismo valor a todas** (pide el número con campo y valida con `validarValor`; error en línea si no es válido) y **Subir otro archivo**; nombre/precio → **Subir otro archivo** y **Corregirlos aquí** (cae a la lista de filas sueltas; no se ofrece omitir todo). "Poner el mismo valor a todas" registra `decisiones.valorComun`.
- **Filas sueltas**: mensaje `Encontré N <dato(s)> que no puedo usar tal cual. Escribe el valor correcto o elige qué hacer.`; hasta 50 líneas (`pagina`), cada una `Fila N · <nombre> — <descripcionMotivo>` con `<input>` (`data-fila`, `data-campo`, `aria-label`) y un control propio (**En 0** para costo/existencia; **Omitir** para nombre/precio; alterna y desactiva el campo de esa línea), todo escapado. Botones: **Listo**, y el atajo (**Dejar todos en 0** para costo/existencia, **Omitir todas estas filas** para nombre/precio) que aplica a **todos** los pendientes del campo, no solo a los visibles.
- **Listo** valida cada línea con `validarValor` usando `opciones.formatoNumero` (una línea con "En 0" u "Omitir" activo cuenta como resuelta); si falta o hay inválidos, muestra el error en línea ("Falta resolver N. Escribe un número de 0 en adelante.") y no avanza. Si valida, aplica `conCorreccion` (valor o 0) o `conOmitidas` por línea, actualiza `decisiones`, recalcula y la ronda se repite con los primeros 50 que queden hasta vaciar la fase.
- Telemetría por fase: `correccion_pendientes` al abrir (con `{campo, filas}`), y `correccion_corrigio | correccion_ceros | correccion_omitio | correccion_reupload` según la decisión.
- Tras cada ronda: `sesion.recalcular()`; una fila omitida en una fase anterior no vuelve a aparecer (lo garantiza el motor).

- [ ] **Step 2: Estilos en `css/inventario.css`** — clases `.inv-corr-editor`, `.inv-corr-linea`, `.inv-corr-error`, siguiendo las del editor de columnas (`.inv-editor`, `.inv-campo`) y los tokens ya usados; la lista con `max-height` y scroll interno; campos con ancho completo en móvil (400 px).

- [ ] **Step 3: Integrar en `inv-chat.js`**

En `pasoPreguntas`, justo después del bloque de `pendienteInventariable` y antes de `if (await pasoIA(r))`: crear las ventanas (una vez por conversación) y `const fin = await ventanas.correr()`; si `fin === 'reupload'` → `await pasoOrigen(); await pasoColumnas(); return pasoPreguntas()` (mismo patrón del IVA mixto, `inv-chat.js:321-326`, pero repasando columnas porque el problema puede ser de mapeo); si `'ok'`, `r = sesion.recalcular()`. Verificar que `!r.pendienteInventariable` antes de abrir las ventanas (la pregunta de inventariable ya se respondió) y que `r.pendientes.length === 0` antes de seguir (si no, `console.error` y `telemetria.error('desconocido','excepcion')` y detener la conversación: es un error de programación). `r.total` conserva su significado (filas exportadas).

En `pasoResultado`, agregar al texto un resumen cuando corresponda, en tuteo: `Dejaste en 0 N costo(s) y M existencia(s) a propósito.` y `Omitiste K fila(s).` (de `sesion.estado.decisiones`); las omitidas ya salen en el desplegable de errores del motor.

- [ ] **Step 4: Verificar en el navegador**

Run: `node scripts/qa-inventario.mjs mono-fe` (los escenarios existentes deben seguir llegando a la descarga; el arnés se actualiza en Task 9, mientras tanto puede detenerse en la pregunta de existencia).
Expected: sin errores de JavaScript; la pregunta *"Tu archivo no trae existencia"* aparece donde antes caía en 0.

- [ ] **Step 5: Commit**

```bash
git add js/inv-correcciones-ui.js js/inv-chat.js css/inventario.css
git commit -m "feat(inventario): ventanas por fases para corregir nombre, precio, costo y existencia"
```

---

### Task 7: Categorías por crear, una fila con Copiar cada una

**Files:**
- Create: `js/inv-lista-copiable.js`
- Modify: `js/inv-chat.js` (bloque `if (r.categoriasFaltantes.length)` de `pasoPreguntas`), `css/inventario.css`
- Test: `scripts/qa-inventario.mjs` (Task 9)

**Interfaces:**
- Produces: `export function listaCopiable(items: string[], { esc, copiar = texto => navigator.clipboard.writeText(texto), alCopiar = () => {} }) -> HTMLElement`. Una fila por ítem con el texto (escapado) y un botón **Copiar** que llama a `copiar(item)`; al terminar la fila muestra un check y el botón dice **Copiada** (se puede volver a copiar); un contador `N de M copiadas` (`aria-live="polite"`); si `copiar` falla, la fila conserva el texto visible y no se marca como copiada. Con más de 15 ítems, `max-height` con scroll interno.

- [ ] **Step 1: Implementar `js/inv-lista-copiable.js`** y estilos `.inv-copia`, `.inv-copia-fila`, `.inv-copia-contador` en `css/inventario.css`.

- [ ] **Step 2: Cambiar el chat** — el mensaje pasa a `Estas <b>N</b> categoría(s) no existen todavía en tu Bold POS, y Bold no importa ítems de una categoría que no exista. Copia cada una y pégala al crearla:` seguido de `listaCopiable(r.categoriasFaltantes, …)`. Botones: **Ya las creé, continuar** y **Enviar todo a “General”** (se elimina **Copiar categorías** y su rama `acc === 'copiar'`). El resto del flujo (`categoriasAGeneral`, `recalcular`) no cambia.

- [ ] **Step 3: Verificar en el navegador**

Run: `node scripts/qa-inventario.mjs mono-fe mono-celular`
Expected: la lista aparece con una fila por categoría (4 en el archivo de QA: Camisa, Pantalones, Abarrotes, Ferretería varios) y botones Copiar individuales; la conversación llega a la descarga.

- [ ] **Step 4: Commit**

```bash
git add js/inv-lista-copiable.js js/inv-chat.js css/inventario.css
git commit -m "feat(inventario): categorias por crear en filas con boton copiar individual"
```

---

### Task 8: Quitar el bloque de unidades por crear

**Files:**
- Modify: `js/inv-chat.js` (borrar `construirUnidadesNoCanonicas` y el `if (modo === 'mono') { … }` de `pasoResultado`; el import de `UNIDADES_CANONICAS_BOLD` se conserva porque lo usa `pasoIA`)
- Test: `scripts/qa-inventario.mjs` (Task 9)

**Interfaces:** Ninguna nueva. Una unidad sin equivalente sigue resolviéndose con la pregunta de `r.unidadesSinMapa` en `pasoPreguntas`; nunca llega a la plantilla fuera de la lista de Bold.

- [ ] **Step 1: Borrar el bloque** y confirmar con `Grep` que no quedan referencias a `construirUnidadesNoCanonicas`, `unidades que usás` ni a "Ítems → Unidades".
- [ ] **Step 2: Correr la suite**

Run: `node --test tests/*.test.mjs`
Expected: todo en verde.

- [ ] **Step 3: Commit**

```bash
git add js/inv-chat.js
git commit -m "fix(inventario): ya no se manda a crear unidades en Bold, que no lo permite"
```

---

### Task 9: Escenarios de QA en navegador real y cierre

**Files:**
- Modify: `scripts/qa-inventario.mjs`

**Interfaces:**
- Consumes: la UI de Tasks 6 y 7 (clases `.inv-corr-editor`, `input[data-fila][data-campo]`, `.inv-copia`).

- [ ] **Step 1: Actualizar el arnés**
  - `elegir(E, opciones, pregunta)`: responder a las preguntas nuevas — `Tu archivo no trae existencia` → `Dejar todas en 0` (por defecto) y `Tu archivo no trae costo` → `Dejar todas en 0`; con `E.atajoOmitir`, `Omitir todas estas filas`; con `E.ceros`, `Dejar todos en 0`; además probar el control por línea (**En 0** / **Omitir**) en `corrige-todo`.
  - Nuevo archivo `productos-sucios.xlsx` (con cabecera `Código, Nombre, Categoría, Unidad, Costo, Precio, Existencia`) con: precio `abc`, costo vacío, existencia `-4`, nombre vacío con otros datos, una fila con costo **y** existencia pendientes, un nombre `<img src=x onerror=alert(1)>` con precio inválido, y suficientes filas para pasar de 50 pendientes de costo en el escenario grande.
  - Manejo del editor (junto al de `renombrar`): rellenar cada `input[data-fila][data-campo]` con `E.valores[campo]` y pulsar **Listo**; además, probar que **Listo** con un campo vacío no avanza (error en línea visible).
- [ ] **Step 2: Escenarios nuevos en `ESCENARIOS`**
  - `corrige-todo`: escribe los valores en todas las fases; descarga con los valores corregidos (`productosN` esperado) y sin texto `quedaron en 0`.
  - `atajos`: usa *Omitir todas estas filas* en nombre/precio y *Dejar todos en 0* en costo/existencia; la plantilla trae solo las filas válidas más las puestas en 0 a propósito; el resumen final menciona `Omitiste` y `Dejaste en 0`.
  - `sin-existencia`: archivo sin columna de existencia → una sola pregunta, *Dejar todas en 0*, todas las filas con existencia 0.
  - `reupload-correcciones`: elige *Subir otro archivo* y sube uno limpio; no queda nada de las correcciones del primero.
  - `corrige-50mas`: más de 50 pendientes de costo → dos rondas; el atajo cubre todos.
  - Verificaciones comunes nuevas: no aparece la lista de categorías dos veces; hay un botón Copiar por categoría; el HTML del nombre malicioso no se ejecuta (sin diálogos ni errores de JS) y aparece como texto.
- [ ] **Step 3: Correr todo el QA**

Run: `node scripts/qa-inventario.mjs`
Expected: todos los escenarios (los 12 existentes y los nuevos) terminan sin fallas; revisar las capturas de las ventanas a 400 px (`mono-celular`).

- [ ] **Step 4: Suite completa**

Run: `node --test tests/*.test.mjs`
Expected: `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/qa-inventario.mjs
git commit -m "test(inventario): escenarios de QA de la correccion por fases y las categorias copiables"
```

- [ ] **Step 6: Antes de `master` (no se hace sin que el usuario lo pida)** — puerta de seguridad: `differential-review` sobre `master...sandbox` y `/security-review`. No hay cambios de base de datos, `package.json` ni `vendor/`, así que `get_advisors` y `supply-chain-risk-auditor` no aplican.
