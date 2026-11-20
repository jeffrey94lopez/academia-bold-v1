# Inventario: corrección de datos por fases, categorías con copiar y fin de unidades por crear — diseño

Fecha: 2026-11-20 · Estado: diseño pendiente de aprobación; implementación en `sandbox`.
Parte de: `2026-10-27-conversor-inventario-design.md`, `2026-11-11-inventario-monosucursal-y-saneamiento-design.md`
y `2026-11-12-inventario-purgador-ia-design.md` (ya implementados).

## Por qué

Hoy el conversor decide solo cuando un dato no sirve: descarta la fila (nombre vacío, precio
inválido) o pone **0** (costo y existencia faltantes o negativos). El cliente se entera al final,
en desplegables cerrados, y no puede corregir nada. Los ceros inventados llegan a Bold como si
fueran datos reales; en existencia eso deja el stock mal cargado sin que nadie lo note.

Además, la lista de categorías por crear llega como una sola caja de texto y el cliente tiene que
partirla a mano; y el chat manda a crear unidades en Bold, algo que Bold no permite.

## Qué entra

1. **Corrección por fases (principal).** El motor deja de descartar o poner 0 por su cuenta.
   Devuelve *pendientes* y el chat los resuelve con el cliente en **ventanas separadas, una por
   campo**, cada una validada antes de pasar a la siguiente.
2. **Categorías por crear con una fila y botón Copiar por categoría.**
3. **Quitar el bloque "unidades por crear"** (`construirUnidadesNoCanonicas`, `pasoResultado`
   camino mono). Las 15 unidades de Bold son fijas y no se pueden crear. Una unidad sin
   equivalente ya se resuelve con la pregunta de `unidadesSinMapa`; nunca debe llegar a la plantilla.

## No-metas

- Cambiar el purgador heurístico, la IA, la detección de columnas, ni el manejo de IVA.
- Corregir códigos, categorías, unidades o descripciones en estas ventanas (siguen como hoy).
- Variantes y multi-sucursal real (siguen fuera).
- Editar datos en una tabla tipo Excel: el editor solo cubre los datos inválidos.

## Anti-metas (fracaso aunque funcione)

- Que cualquier dato se ponga en 0 u omita **sin que el cliente lo haya elegido**.
- Que el cliente se quede atascado sin salida en archivos grandes (siempre hay atajo).
- Que una fila omitida o corregida desaparezca del reporte final.
- Telemetría con nombres o valores del cliente.

## Enfoques considerados

| | Cómo | A favor | En contra |
|---|---|---|---|
| **A. Motor devuelve pendientes y acepta correcciones** ✅ elegido | `convertir()` sigue puro: no exporta lo pendiente, lo reporta; las correcciones vuelven como opciones | Testeable en Node, sin duplicar reglas, el chat solo pinta | Cambia el contrato de `convertir()` |
| B. Validación aparte en el chat antes de convertir | El chat revisa los datos | Motor intacto | Duplica reglas de `convertir()`; se desincroniza |
| C. Que corrija en su Excel y re-suba | Sin editor | Nada que construir | No cumple lo pedido |

El usuario eligió **A** y pidió que la corrección sea **por fases**, un campo por ventana.

## Corrección por fases

### Orden de las fases (mi decisión)

**Nombre → Precio de venta → Costo → Existencia.** Primero los campos que deciden si la fila
existe (nombre y precio, que además solo permiten "omitir" como salida), después los que se pueden
dejar en 0. Así el cliente no corrige costo ni existencia de una fila que acaba de omitir.
Una fase sin pendientes **no aparece**. Tras cada fase se recalcula antes de pasar a la siguiente.

### Qué es "pendiente"

| Campo | Pendiente si | Salidas del cliente |
|---|---|---|
| Nombre | vacío en una fila que tiene otros datos | escribir nombre · omitir |
| Precio de venta | faltante, no numérico o negativo (y sin precio base utilizable) | escribir precio · omitir |
| Costo | faltante, no numérico o negativo | escribir costo · dejar en 0 |
| Existencia | faltante, no numérica o negativa; **solo inventariables** | escribir existencia · dejar en 0 |

Las filas totalmente vacías o con datos solo en columnas no mapeadas siguen omitiéndose en
silencio (regla de `filaSinDatoMapeado`, sin cambios). El precio 0 sigue siendo válido (mi
decisión: no cambia lo que hoy se acepta).

### Dos formas de ventana

1. **Columna completa sin dato** (no está mapeada, o todas las filas relevantes vacías; el caso
   Alegra sin existencia). Una sola pregunta, no una lista:
   *"Tu archivo no trae existencia. ¿Qué hago?"* → **Dejar todas en 0** · **Poner el mismo valor a
   todas** (pide el número) · **Subir otro archivo** (vuelve a `pasoOrigen`).
   Para nombre y precio (columna completa vacía) no se ofrece omitir: dejaría 0 productos. Solo
   *Subir otro archivo* y *Corregirlos aquí* (abre la lista de filas sueltas).
2. **Filas sueltas.** Lista con una línea por pendiente: `Fila 31 · Leche — Existencia es negativa (−4)`
   y un campo para escribir. Cada línea tiene además su propio control: **En 0** (costo/existencia) u
   **Omitir** (nombre/precio), para corregir unas pocas y decidir las demás sin escribir todo.
   Botones: **Listo** y un atajo de fase que aplica a todos los pendientes del campo:
   costo/existencia → **Dejar todos en 0**; nombre/precio → **Omitir todas estas filas**.

"Listo" no avanza mientras quede una línea sin valor válido (número ≥ 0; nombre no vacío) o sin
decisión; el error sale en línea junto al campo, no en un mensaje aparte.

### Muchos pendientes

Se muestran **de 50 en 50** dentro de la misma fase; al pulsar Listo sigue la siguiente página
hasta terminar la fase. El atajo de la fase aplica a **todos** los pendientes del campo, no solo a
los visibles. (Mi decisión: 50 por página.)

### Resumen final

`pasoResultado` dice qué decidió el cliente: *"Dejaste en 0 N costos y M existencias a propósito;
omitiste K filas"*. Las filas omitidas se siguen listando en el desplegable de errores. Desaparecen
los avisos automáticos "quedaron en 0" para estos campos (ya no hay ceros automáticos).

## Diseño técnico

### Motor: `js/inv-convertir.js`

- **Nuevas opciones**
  - `opciones.correcciones`: `{ [filaN]: { nombre?, precioTotal?, costo?, existencia? } }`, con los
    valores ya como número (nombre como texto).
  - `opciones.omitidas`: arreglo de números de fila que el cliente decidió omitir.
  - `opciones.valorPorColumna`: `{ costo?: number, existencia?: number }` para "todas en 0 / mismo
    valor" cuando la columna entera no trae dato.
  - `opciones.cerosAceptados`: arreglo de `{fila, campo}` para "dejar estos en 0" (queda registrado
    para el resumen).
- **Salida nueva:** `r.pendientes = [{ fila, nombre, campo, motivo, original }]` (`campo ∈ nombre |
  precioTotal | costo | existencia`, `motivo ∈ vacio | invalido | negativo`) y `r.columnasSinDato
  = ['costo' | 'existencia' | ...]`.
- **Regla:** una fila con un pendiente **no se exporta ni cuenta como error**; queda en
  `pendientes` hasta que haya corrección, omisión o valor por columna. Una fila ya omitida no genera
  pendientes de campos posteriores.
- Se eliminan los `costo = 0 / sinCosto++` y `ex = 0 / sinExistencia++` automáticos y el aviso
  de existencia negativa; el `error(...'filas_precio')` y `filas_nombre` pasan a ser pendientes.
  Los códigos de error solo se conservan para las filas **omitidas por el cliente**.
- `inv-sesion.js`: `cargarOrigen` reinicia `correcciones`, `omitidas`, `valorPorColumna` y
  `cerosAceptados` (las filas del archivo nuevo son otras).

### Chat: `js/inv-chat.js`

- Nuevo `pasoCorrecciones(r)` dentro de `pasoPreguntas`, **después de la pregunta de inventariable
  (para saber a quién aplica existencia) y antes de `pasoIA`**. Recorre las fases en orden;
  cada una: `recalcular()` → si hay pendientes del campo, ventana → aplicar → siguiente.
- Editor propio, estilo `editorMapeo` / `editorGrupos`, clases en `css/inventario.css`.
- "Subir otro archivo" vuelve a `pasoOrigen` y reentra a `pasoPreguntas` (ya existe el patrón del
  IVA mixto, `inv-chat.js:321-326`).
- Telemetría (`telemetria.paso` / `error` existentes o `tool_step` nuevos, **solo conteos**):
  `corregir_<campo>` con `pendientes`, y la decisión (`corrigio`, `ceros`, `omitio`, `reupload`).
  Se agregan a `PASOS`/`ERRORES` en `js/herramientas-telemetria.js`.

### Categorías por crear

En `pasoPreguntas` (hoy `inv-chat.js:360-375`), el `<pre>` único se reemplaza por una fila por
categoría: nombre + botón **Copiar** que copia solo esa. Tras copiar, la fila muestra un check y el
botón dice "Copiada" (se puede volver a copiar). Contador "N de M copiadas" (solo informativo, no
bloquea). Botones de abajo: **Ya las creé, continuar** y **Enviar todo a "General"**; se quita
"Copiar categorías". Con más de ~15 filas, la lista tiene scroll interno. Sin portapapeles: el texto
queda visible en la fila. El texto de la categoría se escapa con `esc`.

### Unidades

Se elimina `construirUnidadesNoCanonicas` y su bloque en `pasoResultado`. No se reemplaza por nada:
una unidad sin equivalente ya se resuelve con `unidadesSinMapa`.

## Pruebas

- `tests/inv-convertir.test.mjs`: costo/existencia/precio/nombre inválidos → `pendientes` y **ninguna**
  fila exportada con 0 automático; correcciones aplicadas; `omitidas`; `valorPorColumna`;
  `columnasSinDato`; filas omitidas no generan pendientes posteriores; regresión de filas vacías
  silenciosas y de precio 0 válido. Se actualizan los tests existentes que esperaban los ceros
  automáticos.
- `tests/inv-sesion.test.mjs`: `cargarOrigen` limpia las correcciones.
- `scripts/qa-inventario.mjs`: escenarios nuevos (pendientes de un campo, de varios en orden, columna
  sin existencia, "subir otro archivo", más de 50 pendientes, categorías con copiar por fila).
  Verificar en navegador real (Playwright) según CLAUDE.md.
- Sin migraciones SQL. Solo front y tests. Puerta de seguridad antes de `master`: `differential-review`
  y `/security-review` (no cambian `package.json`, `vendor/` ni la base de datos).

## Decisiones tras la revisión del diseño (mías, a revisar)

- **Control por línea:** además del atajo de fase, cada línea tiene su "En 0" u "Omitir" (arriba).
- **Pendientes tras cada ronda:** se recalculan después de **cada ronda** y se toman los primeros 50
  de los que quedan. Como "Listo" exige resolver las 50 visibles, ninguna se salta ni se repite.
  Una fila que sigue con otro campo pendiente (ej. nombre corregido pero costo malo) aparece en la
  fase de ese otro campo.
- **Columna completa sin dato:** todas las filas candidatas tienen ese campo vacío (no cuenta una
  columna con valores presentes pero inválidos; esas van a la lista). Para existencia, candidatas =
  solo inventariables, por eso las ventanas corren **después** de la pregunta de inventariable.
- **`valorPorColumna`** solo llena celdas vacías; nunca pisa un valor válido ni uno negativo o inválido.
- **Resumen final:** `decisiones.ceros` cuenta celdas puestas en 0 (por línea, por atajo o por
  "todas en 0"); `decisiones.valorComun = { campo, valor, filas }` registra "el mismo valor a todas".
- **Subir otro archivo:** vuelve a `pasoOrigen` y `pasoColumnas`. Se conserva lo de la cuenta
  (facturación electrónica e IVA elegido); se reinician las decisiones del archivo (correcciones,
  omitidas, valor por columna, inventariable, códigos y categorías de IA; esta última se reaplica
  por firma si las listas son iguales, como ya ocurre).
- **`r.total`** sigue siendo "filas exportadas" (también `sinCodigo`), así que sus consumidores
  (`sinCodigo === total`, mensaje final, telemetría) no cambian de significado. Si llegara a
  `pasoResultado` con pendientes, es un error de programación: se registra y se detiene.
- **Cero válido:** `0` es válido en precio, costo y existencia. Una celda vacía nunca se toma como 0.

## Riesgos aceptados

1. **Cambio de contrato de `convertir()`:** quienes la llamen (sesión, tests, QA) deben manejar
   `pendientes`. Se contiene porque solo hay un consumidor real (`sesion.recalcular`).
2. **Más pasos para el cliente** en archivos sucios. Mitigado con atajos y con una sola pregunta
   para columnas completas faltantes.
3. **Claves por número de fila:** válidas mientras el archivo no cambie; por eso se reinician al
   cargar otro.

## Lo que queda al constructor

- Texto exacto de cada ventana y mensajes de error (español neutro, tuteo; sin el voseo que hoy
  mezcla el chat).
- Diseño visual del editor y de las filas de categorías, siguiendo `css/inventario.css`.
- Cómo se nombra cada paso de telemetría dentro de la convención existente.
