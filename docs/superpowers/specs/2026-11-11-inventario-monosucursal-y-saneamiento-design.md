# Inventario mono-sucursal + saneamiento + purgador heurístico — diseño

Fecha: 2026-11-11 · Estado: diseño aprobado; implementación pendiente en `sandbox`.

## Por qué

El conversor de inventario hoy exige al cliente **descargar su plantilla de Bold POS** antes
de poder cargar productos: la plantilla trae el ID de su sucursal, las categorías, las
unidades y los impuestos de su cuenta. Para el cliente **mono-sucursal** (una sola bodega)
ese paso es fricción pura: Bold ya nos manda su `warehouseId` por `postMessage`
(`bold:context`), y las listas de referencia las podemos empacar nosotros.

Aparte, el conversor hoy acepta cualquier texto en campos como `nombre`, `categoría`,
`descripción` — incluidos caracteres que Bold rechaza en el import (`` ` ´ { | } % ? ° ¡ ! ``)
y duplicados obvios (`"Camisa"`, `"CAMISA"`, `"Camisas"`). El cliente descarga la plantilla
llena, la importa, y Bold se la devuelve con errores.

Este spec resuelve lo primero (camino mono-sucursal) y mete un **purgador heurístico** de
categorías y unidades que corre en los dos caminos, además de un **saneador** de
caracteres prohibidos.

## Qué entra

1. **Pregunta inicial** en el conversor: *"¿Tu cuenta de Bold tiene más de una sucursal?"*.
   Bifurca el flujo.
2. **Camino mono-sucursal**: se salta la descarga/upload de la plantilla de Bold. El conversor
   arma una **plantilla sintética** a partir de un xlsx base empacado en `vendor/`, le inyecta
   el `warehouseId` del `bold:context` y, si el cliente tiene facturación electrónica, la
   columna `Impuesto*` y la lista de IVAs.
3. **Purgador heurístico** de categorías y unidades. Sin IA. Corre en los dos caminos.
4. **Saneador** de caracteres prohibidos. Corre sobre los campos de texto antes de escribir
   al xlsx de salida.
5. **IVA general** y manejo de **IVA mixto**: pregunta explícita cuando el archivo del cliente
   no trae impuesto por fila, o cuando lo trae parcial.
6. **Filas vacías** mejoradas: se omiten silenciosamente las filas sin dato en columnas
   mapeadas, aunque tengan basura en columnas no mapeadas.
7. **Columnas obligatorias** validadas y defaulteadas según las 6 que Bold marca con `*`.

## Qué NO entra (fuera-de-alcance)

- **Purgador con IA** (Vertex/Gemini): queda para un Spec 2. Incluye tabla
  `inventario_purga_cache` en Supabase, webhook n8n `inventario/purgar-con-ia`, setting
  `inventario_purga_model` en `app_settings`, editor del cliente sobre la lista purgada y
  agrupación semántica tipo `"Camisa Hombre M"` + `"ROPA HOMBRE CAMISA"` → una.
- **Multi-sucursal "real"**. Hoy `inv-plantilla.js:71` detecta solo la primera columna
  `Existencia Inicial en Sucursal-`. Las plantillas con varias (vimos 14) no se manejan; ese
  gap preexistente queda.
- **Variantes** (tallas, colores). El conversor nunca las tocó y este spec no las toca.
- **Requerimientos a Bold** (que mande `warehouseCount` o lista de bodegas en
  `bold:context`). Vive en el backlog como requerimiento; no cambia nada acá.
- **Rotación automatizada** de los archivos base de `vendor/`. Se queda como paso manual
  documentado en `vendor/README.md`.
- **Tests automatizados del chat**. No existe harness; QA del `pasoSucursales`, IVA mixto
  y `pasoResultado` es **manual**.

## Decisiones tomadas por el usuario

- **Bold solo manda la bodega activa** en `bold:context`, no la lista total ni el conteo. La
  pregunta de sucursales se le hace al cliente directamente, con copy explícito que
  prevenga la confusión con "¿dónde querés cargar hoy?".
- **El `warehouseId` NO se le muestra al cliente**. Entra solo al encabezado del xlsx
  (`Existencia Inicial en Sucursal-<warehouseId>`); en chat siempre "tu sucursal".
- **La hoja Instrucciones es la ley**: todo lo que se escribe en columnas `Categoría`,
  `Unidad de medida` e `Impuesto` tiene que estar en la Instrucciones del xlsx entregado.
  Sin eso, Bold rechaza el import.
- **Categorías**: en mono-sucursal, se **respetan las del cliente** (purgadas). Default
  `General` solo si quedan vacías. (Antes propuse colapsar todo a General; corregido tras
  feedback.)
- **Unidades**: idem. Default `Unidades` solo si quedan vacías.
- **IVA general**: cuando el cliente tiene FE y su archivo no trae IVA por fila (o lo trae
  parcial), pregunta el IVA general y da salidas limpias para el caso mixto.
- **Modelo del futuro purgador IA**: configurable vía `app_settings.inventario_purga_model`,
  arrancando con `gemini-2.5-flash`. Fuera de este spec.
- **Colombia es la única localización.** Impuestos canónicos: `EXCLUIDO`, `EXENTO`, `INC-8`,
  `IVA-5`, `IVA-19`.

## Decisiones mías (a revisar)

- **La plantilla sintética es "igual" a una subida por el cliente** downstream. `inv-sesion`
  la guarda en `estado.plantillas[tipo]` con la misma forma (`{ info, wb, nombre }`), así
  `inv-convertir`, `inv-plantilla` y `pasoResultado` no se enteran. Esto preserva el motor
  puro y aísla todo el cambio al chat + un módulo nuevo.
- **No se renombra `inv-camino.js`**. El chip "herramienta" sigue abriendo el conversor
  igual; la bifurcación mono/multi ocurre dentro de `iniciarConversacion`.
- **El purgador heurístico se extrae a `inv-purgador.js`** (puro). Reutilizable para
  categorías y unidades; en Spec 2 se le agregan llamadas a Vertex sin cambiar la firma.

## Flujo del chat

### Paso nuevo al arranque del conversor: `pasoSucursales`

Antes del `INTRO_HTML` actual. Copy exacto (el preámbulo es crítico para prevenir el
malentendido con "¿dónde quiero cargar hoy?"):

> **Antes de empezar, una pregunta importante sobre tu cuenta de Bold:**
>
> No te pregunto dónde querés cargar el inventario ahora. Te pregunto por el **total de
> sucursales activas en tu cuenta de Bold POS**.
>
> **¿Tu cuenta tiene más de una sucursal?**

Chips:

- **"Solo tengo esta sucursal"** — *Preparo la plantilla por vos con tu sucursal lista. No
  hace falta descargar nada de Bold.*
- **"Tengo más de una sucursal"** — *Te pido que descargues la plantilla desde Bold POS;
  la de tu cuenta trae los IDs de todas tus sucursales.*

### Rama mono-sucursal

```
pasoSucursales ("una")
  ↓
INTRO_HTML variante mono
  ↓
Preguntar FE sí/no   ──────┐
  ↓                        │  (en paralelo) fetch de los 2 xlsx base de vendor/
agregarPlantillaSintetica  ◀┘
  ↓
pasoOrigen       (igual al actual)
  ↓
pasoColumnas     (igual al actual)
  ↓
pasoPreguntas    (adaptado — ver "IVA general y mixto" y "Purgador")
  ↓
pasoResultado    (texto adaptado, muestra lista para crear en Bold)
```

### Rama multi-sucursal

```
pasoSucursales ("más")
  ↓
INTRO_HTML actual
  ↓
pasoPlantillas      (igual al actual)
  ↓
pasoOrigen / pasoColumnas / pasoPreguntas (purgador + IVA general) / pasoResultado
```

El flujo multi mantiene lo que ya hace, con dos mejoras: (1) el purgador heurístico corre
antes del match contra `plantilla.listas.categorias` y `.unidades`; (2) la pregunta de IVA
general y manejo de mixto corre cuando el archivo no trae impuesto completo por fila.

## Módulos

### Nuevos

- **`js/inv-plantilla-sintetica.js`** (puro). Función `construirPlantilla(XLSX, { baseBytes,
  warehouseId, conFE, tipo })` → `{ wb, info }`. Recibe `XLSX` inyectado (lo tiene la sesión
  vía `cargarXlsx`). No fetchea, no toca DOM.
- **`js/inv-saneamiento.js`** (puro). Función `sanear(texto)` que aplica las reglas de
  caracteres prohibidos + colapso de espacios + trim.
- **`js/inv-purgador.js`** (puro). Función `purgar(lista)` → `{ limpias, mapeo, informe }`.
  Reutilizable para categorías y unidades.

### Modificados

- **`js/inv-sesion.js`**: nuevo método `agregarPlantillaSintetica({ warehouseId, conFE })`
  que fetchea los 2 bases de `vendor/`, los pasa a `construirPlantilla` para cada tipo
  (inventariable y no-inventariable), guarda en `estado.plantillas`.
- **`js/inv-chat.js`**: nuevo paso `pasoSucursales` al arranque; adaptaciones en
  `pasoPreguntas` (IVA general, mixto) y `pasoResultado` (lista para crear en Bold en el
  camino mono). Los pasos `pasoOrigen` y `pasoColumnas` no cambian.
- **`js/inv-convertir.js`**:
   - Aplica `sanear()` sobre `codigo`, `nombre`, `categoria`, `referencia`, `descripcion`
     antes de pushear a `salidas`.
   - Llama a `purgar()` sobre la lista de categorías/unidades del archivo antes del
     mapeo contra la plantilla.
   - Nuevas opciones de impuesto: `ivaGeneral: 'IVA-19' | 'IVA-5' | 'EXCLUIDO' | 'EXENTO'` y
     `ivaStrategy: 'por_fila' | 'todos_igual'`. Con `por_fila`, cada fila usa su IVA del
     archivo; si viene vacía, cae a `ivaGeneral` si está seteado, si no a `EXENTO`. Con
     `todos_igual`, todas las filas usan `ivaGeneral` (es obligatorio).
   - Nueva lógica de filas vacías: ver "Filas vacías".
- **`tests/inv-convertir.test.mjs`**: cubre saneamiento, purgador aplicado, estrategias de
  IVA, filas vacías nuevas.
- **`js/bold-context.js`**: expone `warehouseId` top-level (**ya mergeado**).

### No tocados

`inv-plantilla.js`, `inv-origen.js`, `inv-codigos.js`, `inv-excel.js`, `inv-numeros.js`,
`inv-camino.js`.

## Plantilla sintética

### Pipeline

```
1. wb = XLSX.read(baseBytes, { type: 'array' })
2. hoja = wb.Sheets['Item Inventariable' | 'Item No Inventariable']
3. Smoke test de estructura ─────────────┐
4. Renombrar columna de existencia       │ si algo falla → throw
   (solo tipo='inventariable')           │ 'parse_fallo' |
5. Si conFE: inyectar Impuesto*          │ 'estructura_cambio'
6. Reescribir hoja Instrucciones         │
7. Releer con leerPlantilla(hojas)       │ ← reusa inv-plantilla.js
8. return { wb, info }
```

### Renombrado de la sucursal (paso 4)

- Buscar la única celda del header row que matchee `/^existencia inicial en sucursal-/i`.
- Reemplazar por `Existencia Inicial en Sucursal-<warehouseId>` — sin la coletilla
  "- Sucursal Principal" que trae el base.
- Si hay más de una: `throw 'estructura_cambio'`. En el base "Sin FE" actual hay exactamente
  una.

### Inyección de `Impuesto*` (paso 5)

- Encontrar la columna `Precio Venta Total*` en el header row.
- Insertar una columna nueva inmediatamente a la derecha, header `Impuesto*`.
- Celdas de data quedan vacías; el conversor las llena.
- Si no encuentra `Precio Venta Total*`: `throw 'estructura_cambio'`.

### Reescritura de Instrucciones (paso 6)

- Mantener títulos originales (`Categorias:`, `Listado de Unidades:`, `Listado de impuestos:`)
  y los textos de ayuda ("Revisa esta hoja…").
- Reemplazar los valores con:
   - Categorías: `['General']`.
   - Unidades: `['Centímetros', 'Galónes', 'Gramos', 'Kilogramos', 'Libras', 'Litros',
     'Metros', 'Metros cuadrados', 'Metros cúbicos', 'Miligramos', 'Mililitros',
     'Milímetros', 'Onzas', 'Par', 'Unidades']` (lista canónica de Bold observada en la
     Instrucciones del archivo "Sin FE").
   - Impuestos (si `conFE`): `['EXCLUIDO', 'EXENTO', 'INC-8', 'IVA-5', 'IVA-19']`. Si
     `!conFE`: omitir la columna entera.

### Qué hace `inv-sesion.agregarPlantillaSintetica`

1. Prefetch paralelo de los 2 bases:
   `/vendor/bold-plantilla-base-inventariable.xlsx` y `/vendor/bold-plantilla-base-noinventariable.xlsx`.
2. Un retry con backoff 300ms → 800ms para fallas de red (solo).
3. Llamar a `construirPlantilla` por tipo.
4. Guardar en `estado.plantillas.inventariable` y `.noinventariable` con
   `nombre: '(plantilla preparada para vos)'` para que `pasoResultado` muestre un texto
   amable.
5. Devolver `{ ok: true }` o `{ error, codigo: 'fetch_fallo' | 'parse_fallo' |
   'estructura_cambio' }`.

## Purgador heurístico

### Qué hace

Recibe una lista de strings (categorías de las filas del archivo del cliente, o unidades) y
devuelve `{ limpias, mapeo, informe }`:

- `limpias`: array ordenado de canónicas finales, sin duplicados.
- `mapeo`: objeto `{ original → canonica }` para que el conversor, al escribir cada fila,
  reemplace la categoría/unidad original por su canónica.
- `informe`: `{ duplicados_exactos, singulares_plurales }` con los conteos para la telemetría
  y el futuro UI editor (Spec 2).

### Pipeline

1. **Sanear** cada valor (ver "Saneamiento").
2. **Normalizar** para comparar: lowercase, sin tildes, trim, colapso de espacios.
3. **Dedup exacto** post-normalización. Canónica: la forma más larga (o la primera si
   empatan); conservar su casing original.
4. **Singular/plural**: si dos canónicas normalizadas difieren solo por `(es|s)$`, mergearlas.
   Canónica: la forma más larga. Helper ya existe en `inv-convertir.js:33`; se mueve a
   `inv-purgador.js` y se reusa.
5. **Devolver** `limpias` ordenado alfabéticamente, `mapeo` y `informe`.

### Qué NO hace (queda para Spec 2)

- Agrupación semántica (`"Camisas de hombre"` + `"ROPA HOMBRE CAMISA"`).
- Corrección ortográfica contra diccionario.
- Llamadas a IA.

### Uso en el conversor

En `inv-convertir.js`, antes del `forEach(filas)`:

```js
const { limpias: catsLimpias, mapeo: mapeoCats } = purgar(
  filas.map(f => get(f, 'categoria')).filter(Boolean)
)
const { limpias: unidadesLimpias, mapeo: mapeoUnidades } = purgar(
  filas.map(f => get(f, 'unidad')).filter(Boolean)
)
```

Dentro del `forEach`, al escribir `out.categoria`:

```js
let categoria = mapeoCats[get(fila, 'categoria')] ?? ''
// ... y después el match contra plantilla.listas.categorias (multi-sucursal)
// o el escrito tal cual con default General (mono-sucursal).
```

Idem para `out.unidad`.

## Saneamiento

### Reglas

| Entra | Sale |
|---|---|
| `` ` `` (acento grave) | `'` |
| `´` (acento agudo solo) | `'` |
| `°` | `#` |
| `{` `}` `\|` `%` `?` `¡` `!` | eliminar |

Después del reemplazo/borrado:

- Colapsar `\s+` a un espacio.
- Trim en los extremos.
- Si queda vacío, el campo cae al default (`General`, `Unidades`, etc.) o queda vacío si es
  opcional.

### Dónde se aplica

- En `inv-convertir.js`, sobre los valores que van a `out`: `codigo`, `nombre`, `categoria`,
  `referencia`, `descripcion`. También sobre `unidad` e `isv` por safety aunque salgan de
  listas canónicas.
- También dentro de `purgar()` (paso 1 del pipeline).
- **No** sobre valores crudos antes del mapeo de columnas; queremos que `mapeo` opere sobre
  el header original.
- **No** sobre números — los sanitiza `parseNumero`.

### Preserva

- Tildes normales (`canción` → `canción`).
- Mayúsculas / minúsculas (`Camisa` → `Camisa`).
- Caracteres latinos y dígitos.

## IVA general y mixto

Solo si **FE = sí**. Tres casos según lo que trae el archivo:

### Caso A — Sin columna de IVA o toda vacía

Pregunta del bot:
> *"¿Qué IVA querés aplicar por defecto a tus ítems?"*

Chips: `IVA-19`, `IVA-5`, `Excluido`, `Exento`. Se aplica a todas las filas.

Opción de `inv-convertir`: `ivaGeneral: '<elegido>'`, `ivaStrategy: 'por_fila'` (como el
archivo viene vacío, el fallback a `ivaGeneral` cubre todas las filas).

### Caso B — Columna de IVA completa (todas las filas con valor válido)

No se pregunta. Cada fila usa su IVA del archivo. Opción: `ivaStrategy: 'por_fila'` sin
`ivaGeneral`. Comportamiento actual.

### Caso C — IVA mixto (algunas filas con IVA válido, otras vacías o inválidas)

Mensaje del bot:
> *"Tu archivo trae IVA en algunos productos (**X** filas) pero no en otros (**Y** filas).
> ¿Cómo lo resolvemos?"*

Tres chips:

- **"Vuelvo a subir mi archivo con la columna de IVA completa"** → regresa a `pasoOrigen`.
- **"Elegí UN IVA para los que faltan, respetá los que ya tienen"** → siguiente mensaje:
  *"¿Cuál es ese IVA?"*. Opción: `ivaGeneral: '<elegido>', ivaStrategy: 'por_fila'`.
- **"Aplicá UN IVA a TODOS, yo corrijo en Bold después"** → aplica el elegido a todas.
  Opción: `ivaGeneral: '<elegido>', ivaStrategy: 'todos_igual'`. Mensaje posterior:
  *"Si querés cambiar el IVA de algunos productos después del import, podés hacerlo en
  Bold POS con **Actualización masiva**. La pestaña **Instrucciones** del xlsx descargado
  tiene la lista de IVAs válidos."*

### Detección

- **"Válido"**: `parseImpuesto()` ya existente devuelve número no-null.
- **"Vacío / inválido"**: `parseImpuesto()` devuelve null.
- Si todas válidas → Caso B. Si todas inválidas → Caso A. Si mezcla → Caso C.

## Columnas obligatorias

Bold marca 6 columnas con `*` en el header. Cada una tiene un comportamiento acordado:

| Columna | Mono-sucursal | Multi-sucursal |
|---|---|---|
| `Nombre*` | Sin default → fila descartada con error (hoy). | Igual. |
| `Categoria*` | Purgada; se escribe tal cual. `General` si queda vacía. | Purgada; mapeada contra `plantilla.listas.categorias`; `General` si no matchea o si `opciones.categoriasAGeneral`. |
| `Unidad de medida*` | Purgada; se escribe tal cual. `Unidades` si queda vacía. | Purgada; mapeada contra `plantilla.listas.unidades`; `Unidades` si no matchea. |
| `Precio Costo*` | `0` + aviso al cliente (hoy). | Igual. |
| `Precio Venta Total*` | Sin default → fila descartada con error (hoy). | Igual. |
| `Impuesto*` | Solo existe si `conFE`. IVA elegido según sección anterior. | Igual. |

En mono-sucursal, por no haber lista Bold contra la cual validar, las categorías purgadas
se le muestran al cliente en `pasoResultado` con botón **Copiar**:

> *"Estas **N** categorías no existen en tu Bold todavía. Creálas antes de importar (Bold
> POS → Ítems → Categorías → Crear). Podés pegarlas una por línea:"*
>
> `[lista]`  `[Copiar]`

Idem para unidades que no estén en la lista canónica de Bold:

> *"Estas **M** unidades que usás no están en la lista estándar de Bold. Creálas antes de
> importar (Bold POS → Ítems → Unidades):"*

## Filas vacías

Hoy `vacia(fila)` filtra las filas donde **toda** celda está en blanco. Nueva regla:

Una fila se **omite silenciosamente** (sin contar como error) si cumple TODAS:

- `nombre` vacío o columna no mapeada.
- `precioTotal` **y** `precioBase` vacíos.
- `costo`, `existencia`, `codigo` vacíos.

Esto cubre:

- Filas totalmente en blanco (ya se filtran).
- Filas con basura en columnas no mapeadas (p.ej., Alegra deja una nota en una columna
  lateral).
- Filas de separación / titulares de sección ("— Zapatos —" en la columna A).

Una fila que **sí tenga** nombre o precio pero le falte el otro → error con mensaje claro
(como hoy).

## `vendor/` — archivos base

Trabajo previo a la implementación (puede ir en un commit separado del mismo PR):

1. **Renombrar** los 2 archivos "Sin FE" a nombres técnicos:
   - `vendor/bold-plantilla-base-inventariable.xlsx`
   - `vendor/bold-plantilla-base-noinventariable.xlsx`
2. **Limpiar** su data de prueba:
   - Hoja `Item Inventariable` / `Item No Inventariable`: dejar solo el header row + una
     fila de ejemplo con el formato que el conversor va a llenar (si Bold acepta el archivo
     vacío, dejar sin ejemplo). Ningún dato de otra cuenta.
   - Hoja `Instrucciones`: dejar los títulos y los textos de ayuda. Reemplazar las listas:
     - Categorías → `General`.
     - Unidades → las 15 canónicas (Centímetros, …, Unidades).
     - Impuestos → vacío (el archivo base es "Sin FE"; la columna se inyecta en runtime).
3. **Borrar** las 2 variantes "Con FE" del `vendor/` (no se usan — la columna de IVA se
   inyecta programáticamente).
4. Crear **`vendor/README.md`** con:
   - Fecha de última rotación.
   - De qué cuenta de Bold se bajó cada archivo.
   - Paso a paso para rotar (bajar nueva plantilla de Bold → limpiar → commitear).
   - Expectativa: rotar cuando Bold anuncie cambios en el formato, o cuando el smoke test
     empiece a fallar en producción.

## Fallbacks y telemetría

### Fallbacks del camino mono

Tres puntos de falla; comportamiento idéntico:

| Falla | Código |
|---|---|
| fetch 404/5xx/red caída | `fetch_fallo` |
| parse del xlsx corrupto | `parse_fallo` |
| smoke test de estructura | `estructura_cambio` |

**Comportamiento:**

1. Un retry con backoff (300ms → 800ms) **solo** para `fetch_fallo`.
2. Si sigue fallando, el bot le dice al cliente:
   > *"Tuve un problema preparando tu plantilla. Vamos por el camino manual: descargala
   > desde Bold POS y súbela aquí. Te guío paso a paso."*
3. Cae al `pasoPlantillas` normal (flujo multi actual). El cliente queda operativo.
4. Telemetría con el `codigo`.

### Telemetría nueva

Sobre `telemetriaReal('inventario')` ya existente.

**Pasos** (eventos sin error):

- `sucursales_una` (metric: `warehouseId` — para contar cuentas únicas que hacen mono).
- `sucursales_mas`.
- `plantilla_sintetica_lista` (metric: `ms_fetch`, `ms_construir`).

**Errores**:

- `plantilla_sintetica` / `fetch_fallo` | `parse_fallo` | `estructura_cambio`.
- `iva_mixto` / `detectado` (metric: `filas_con`, `filas_sin`).
- `iva_mixto` / `resolucion_reupload` | `resolucion_por_fila_con_fallback` |
  `resolucion_todos_igual` (metric: `iva_elegido`, salvo `reupload` que no lleva).
- `saneamiento` / `caracteres_removidos` (metric: `cantidad` — para medir si vale la pena
  mostrar un aviso al cliente).
- `purgador` / `fusiones` (metric: `exactas`, `singulares_plurales`).

**Métricas**:

- `iva_general_elegido` (metric: `iva`, `camino: mono|multi`).

## Tests

### Nuevos

**`tests/inv-plantilla-sintetica.test.mjs`**: contra los archivos reales de `vendor/`.

- `construirPlantilla({ conFE: false, tipo: 'inventariable', warehouseId: 9999 })`:
   - `info.sucursal === 'Sucursal-9999'`.
   - `info.tieneIsv === false`.
   - `info.listas.unidades` incluye `'Unidades'` y las 15 canónicas.
   - `info.listas.categorias === ['General']`.
   - `info.listas.impuestos` vacío.
- `construirPlantilla({ conFE: true, tipo: 'inventariable', warehouseId: 9999 })`:
   - `info.tieneIsv === true`.
   - `info.listas.impuestos === ['EXCLUIDO', 'EXENTO', 'INC-8', 'IVA-19', 'IVA-5']`.
- Variantes `tipo: 'noinventariable'`: sin columna de existencia.
- **Smoke test**: contra los bytes reales. Si alguien rota mal el archivo o Bold cambia,
  falla en CI.
- Error handling:
   - bytes vacíos → `throw` capturado en el método de sesión (tests ahí).
   - Ninguna columna `Existencia Inicial en Sucursal-` en inventariable: tira
     `estructura_cambio`.
   - No se encuentra `Precio Venta Total*` para inyectar impuesto: tira `estructura_cambio`.

**`tests/inv-saneamiento.test.mjs`**:

- `` sanear('Café`especial') === "Café'especial" ``
- `sanear('Tasa °18') === 'Tasa #18'`
- `sanear('{Promoción}') === 'Promoción'`
- `sanear('¡Hola!') === 'Hola'`
- `sanear('A | B') === 'A B'` (colapsa espacios post-borrado).
- `sanear('   ') === ''`.
- `sanear('A%B?C') === 'ABC'`.
- Preserva tildes: `sanear('canción') === 'canción'`.
- No altera dígitos ni letras no-latinas.

**`tests/inv-purgador.test.mjs`**:

- Dedup exacto: `['CAMISA', 'camisa', 'Camisa ']` → `limpias: ['Camisa']`, `mapeo: { CAMISA: 'Camisa', camisa: 'Camisa', 'Camisa ': 'Camisa' }`.
- Canónica = forma más larga: `['Camisa', 'camisa HOMBRE']` → canónica `'camisa HOMBRE'`.
- Singular/plural: `['Camisa', 'Camisas', 'Pantalón', 'Pantalones']` → 2 canónicas.
- Saneamiento integrado: `['Café°1', 'Café#1']` → 1 canónica (porque `°→#` colapsa).
- Lista vacía: `[]` → `{ limpias: [], mapeo: {}, informe: {...} }`.
- Informe cuenta merges: `['CAMISA', 'camisa']` → `informe.duplicados_exactos === 1`.

**`tests/inv-sesion.test.mjs`**:

- `agregarPlantillaSintetica({ warehouseId: 9999, conFE: true })`:
   - Con `fetch` mockeado que devuelve bytes de fixture → `estado.plantillas.inventariable` y
     `.noinventariable` con `info` válida.
   - Con `fetch` que falla 1 vez y responde el segundo → retry activo → éxito.
   - Con `fetch` que falla 2 veces → devuelve `{ error, codigo: 'fetch_fallo' }` y
     `estado.plantillas` queda vacío.
- Después de `agregarPlantillaSintetica`, `recalcular()` con archivo origen de fixture →
  produce `salidas` como si la plantilla fuera subida.

### Ampliados

**`tests/inv-convertir.test.mjs`**:

- Saneamiento se aplica a `out.nombre`, `out.categoria`, `out.descripcion`, `out.referencia`,
  `out.codigo`.
- Purgador aplicado: dos filas con categorías `['CAMISA', 'camisa']` → ambas quedan con la
  canónica única en `out.categoria`.
- **IVA Caso B (completo)**: `ivaStrategy: 'por_fila'`, sin `ivaGeneral`. Cada fila usa su
  propio IVA del archivo; filas con impuesto vacío caen al default `EXENTO` (comportamiento
  actual).
- **IVA Caso C `por_fila` con fallback**: `ivaStrategy: 'por_fila'`, `ivaGeneral: 'IVA-19'`.
  Fila con `impuesto: 5%` → `out.isv === 'IVA-5'`; fila sin impuesto → `out.isv === 'IVA-19'`.
- **IVA Caso C `todos_igual`**: misma entrada, `ivaStrategy: 'todos_igual'`,
  `ivaGeneral: 'IVA-19'`. Ambas filas → `out.isv === 'IVA-19'` (ignora el 5% del archivo).
- **IVA Caso A**: archivo sin columna de IVA, `ivaStrategy: 'por_fila'`,
  `ivaGeneral: 'IVA-5'` → todas con `IVA-5` (fallback aplica a todas).
- **Filas vacías nuevas**: fila con contenido solo en columna no-mapeada → omitida
  silenciosa, no cuenta como error.
- **Filas con nombre/precio parcial**: error como antes (regresión).

### NO automatizado

- UX de `pasoSucursales` (chips, copy).
- UX de IVA mixto (3 chips de resolución).
- UX de `pasoResultado` mono (lista para crear en Bold).

Todas quedan a **QA manual** en el PR.

## Riesgos conocidos y aceptados

1. **Mono-sucursal pierde relación con la lista Bold real.** En mono, las categorías
   purgadas se asumen "faltantes" porque no tenemos la lista Bold contra la cual comparar. El
   cliente tiene que crearlas en Bold antes de importar (le damos la lista con botón
   Copiar). Aceptable — es el mismo paso que hace hoy en multi para las que faltan.
2. **Los xlsx base pueden quedar viejos si Bold rota formato.** Smoke test falla ruidoso
   (CI o runtime); fallback al flujo multi mantiene operativo mientras se actualiza.
3. **Cambio de cuenta mid-session.** Si el cliente abre dos POS distintos en la misma
   sesión del portal, el `warehouseId` es el del último `bold:context`. Edge case raro; fix
   es recargar.
4. **Purgador heurístico puro no agrupa semánticamente.** `"Camisa Hombre M"` y
   `"ROPA HOMBRE CAMISA"` quedan separadas. Spec 2 (IA) lo resuelve.
5. **Sin tests de UX del chat.** Regresiones en el copy o en el orden de los chips no se
   detectan automáticamente. Mitigación: PRs con cambios al chat requieren QA manual
   explícito.

## Tamaño estimado del PR

- **Nuevos**: `js/inv-plantilla-sintetica.js`, `js/inv-saneamiento.js`, `js/inv-purgador.js`,
  `tests/inv-plantilla-sintetica.test.mjs`, `tests/inv-saneamiento.test.mjs`,
  `tests/inv-purgador.test.mjs`, `tests/inv-sesion.test.mjs`, `vendor/README.md`.
- **Modificados**: `js/inv-chat.js`, `js/inv-sesion.js`, `js/inv-convertir.js`,
  `tests/inv-convertir.test.mjs`.
- **Renombrados/limpiados**: 2 archivos de `vendor/` (base inv + no-inv); 2 borrados
  (Con-FE sucios).
- **Ya mergeado**: `warehouseId` en `js/bold-context.js` + tests.

Mid-sized, un solo PR.
