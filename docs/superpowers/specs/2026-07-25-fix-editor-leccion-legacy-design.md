# Fix — abrir el editor de una lección legacy le borra el HTML · Spec de diseño

**Puerta 2** de la clase de bug documentada en `lecciones-contenido-doble-formato`. La puerta 1 (`cascadeUpdateUrl`) se cerró el 2026-07-25 y está en producción (`master` en `0a79ae8`); esta es la misma falla por otra entrada, y la encontró el review final de ese hotfix.

## Objetivo

Que abrir el editor de una lección en formato legacy y guardarla deje de destruir su contenido — y que el contenido quede visible y editable, en vez de solo preservado a ciegas.

## El bug

```js
// js/admin.js:1051-1056 — al abrir el editor
try {
  currentBlocks = lesson?.contenido ? JSON.parse(lesson.contenido) : []
  if (!Array.isArray(currentBlocks)) currentBlocks = []
} catch (_) {
  currentBlocks = []
}
```

`contenido` es `text` y guarda dos formatos (ver `lecciones-contenido-doble-formato`). Para una lección legacy —HTML crudo escrito a mano— `JSON.parse` lanza, se entra al `catch`, y `currentBlocks` queda en `[]`. Al guardar, `js/admin.js:721` escribe `contenido: JSON.stringify(currentBlocks)` = `'[]'`.

**Disparador:** abrir el editor de una lección legacy y guardar, incluso sin tocar el contenido. Corregir un typo del título alcanza. Flujo de éxito normal, sin ninguna señal.

**Segundo daño, menos obvio:** `js/admin.js:741` llama a `embedLesson(savedId, titulo, categoria, currentBlocks)` con esos bloques vacíos, así que **también se borra el embedding RAG** y el bot deja de saber de esa lección. Preservar el contenido sin arreglar esto dejaría la mitad del bug abierta.

**Es más alcanzable que la puerta 1:** no requiere arrastrar archivos ni que la lección referencie nada en particular — solo editarla.

## Diseño

### 1. `parseLessonBlocks(raw)` — la decisión, aislada y testeable

El bug vive en una sola decisión: *dado el `contenido` crudo, ¿qué bloques tiene esta lección?* Hoy esa decisión está escrita **tres veces** —`js/admin.js:1051-1056`, `js/lessons.js:178-183`, `js/course-tab.js:217-224`— y la copia del admin es la que cae a `[]`.

Módulo puro nuevo (patrón de `clarify.js`, `inactivity.js`, `content-url.js`: sin DOM, import-safe en Node, testeable en aislamiento):

```
parseLessonBlocks(raw) => Array
```

| Entrada | Salida |
|---|---|
| ya es un array (defensivo) | ese array, tal cual |
| string JSON que parsea a un array | ese array |
| string que no parsea, o parsea a algo que no es array, con contenido | `[{ type: 'html', html: raw }]` |
| `null`, `undefined`, `''`, solo espacios | `[]` |
| cualquier otro no-string (un número, un objeto) | `[]` |

**Nunca descarta contenido**: no existe una rama que reciba contenido y devuelva `[]`. Es la propiedad central, igual que en la puerta 1.

La primera fila es defensiva y no debería activarse —los tres llamadores pasan el crudo de la base, que es `text`— pero sin ella un array recibido por error caería a "no-string" y se descartaría, rompiendo justamente la propiedad central. Cuesta una línea y elimina el footgun.

Al usarla en los tres consumidores, la detección de legacy deja de estar duplicada. `js/lessons.js` y `js/course-tab.js` producen el mismo render que hoy: donde antes caían a su rama legacy con `innerHTML`, ahora reciben un bloque `html` que el renderer pinta con `innerHTML`. Mismo resultado, un solo lugar que decide.

### 2. El tipo de bloque `html`

Renderiza HTML crudo **sin decoración** — exactamente lo que hace hoy `js/lessons.js:204`. Se distingue del bloque `step`, que también admite HTML (`js/block-renderer.js:22-23`) pero le agrega un círculo numerado adelante: convertir legacy a `step` cambiaría el aspecto de la lección para el alumno.

**No se agrega a los botones de "agregar bloque"** (el mapa `defaults` en `js/admin.js:681-690` queda igual). Existe solo para recibir contenido legacy, así no proliferan bloques de HTML crudo escritos a mano. Aparece en el editor únicamente cuando `parseLessonBlocks` lo generó.

### 3. Los cuatro consumidores

Este es el alcance real. Si alguno ignora el tipo nuevo, el contenido se pierde por ahí:

| Archivo | Cambio | Si se omite |
|---|---|---|
| `js/block-renderer.js` | rama `html`: contenedor plano + `innerHTML` de `block.html`, sin numeración ni estilos de paso | la lección se ve vacía para el alumno |
| `js/admin.js:15-26` `lessonToEmbedText` | incluir `block.html` con strip de tags (mismo tratamiento que ya le da a `step` en la línea 20) | **el bot sigue perdiendo la lección** |
| `js/admin.js:1172-1228` `blockItemHtml` | entrada en `colors` y `labels`, y un `<textarea data-field="html">` | el admin no ve ni puede editar el bloque |
| `js/whatsapp-copy.js:48+` | rama `html` reusando el `htmlStepToWhatsApp(html)` que ya existe en la línea 28 | el copiado a WhatsApp omite el contenido |

Dos cosas que **no** hacen falta: el `textarea` se engancha al binding genérico que ya existe (`js/admin.js:1094` asigna `currentBlocks[idx][input.dataset.field]`, que es como funcionan los bloques `bot_*` con su `data-field="content"`); y los tres consumidores de `renderBlocks` (`lessons.js`, `course-tab.js`, `admin.js:1318` preview) quedan cubiertos con el único cambio en `block-renderer.js`.

**Se edita como texto crudo, no con Quill.** El bloque `step` usa Quill (`js/admin.js:1192`, `:1101-1119`), que normaliza el HTML a su propio subconjunto y podría simplificar marcado complejo de una lección vieja. Un `textarea` preserva lo que haya exactamente.

## Interfaces / unidades

- `parseLessonBlocks(raw)` — puro, sin dependencias. Entrada: el `contenido` tal como viene de la base. Salida: array de bloques. Testeable en aislamiento. Consumido por `admin.js`, `lessons.js` y `course-tab.js`.
- El tipo `html` — contrato: un bloque `{ type: 'html', html: string }`. Su `html` se renderiza tal cual, se serializa tal cual, y su texto sin tags alimenta el embedding.

## Testing

`tests/lesson-blocks.test.mjs` (nuevo), sobre `parseLessonBlocks`:

- **Array normal:** JSON de bloques → devuelve el array igual, sin envolver nada.
- **Legacy:** HTML crudo → un solo bloque `{type:'html', html:<el HTML exacto>}`.
- **JSON que parsea pero no es array:** `'{}'`, `'"texto"'`, `'42'`, `'null'` → bloque `html` con el string original (no se pierde).
- **Vacíos:** `null`, `undefined`, `''`, `'   '` → `[]`.
- **Array recibido directamente** (la rama defensiva): `[{type:'step',text:'x'}]` → el mismo array, no `[]`.
- **No-string que no es array:** un número, un objeto → `[]`.
- **Array vacío legítimo:** `'[]'` → `[]`, no un bloque `html` con el texto `"[]"`.

Los cuatro consumidores usan `document` y no son import-safe en Node → se verifican con `node --check` más la suite verde, y con la prueba manual de abajo.

**Verificación manual (para el usuario):** crear una lección de prueba, ponerle contenido legacy a mano en Supabase (`update lecciones set contenido = '<p>hola</p><ul><li>uno</li></ul>' where id = …`), abrirla en el editor, cambiarle **solo el título**, guardar, y confirmar que el contenido sigue ahí y se ve igual en el portal.

## Alcance

- Rama `sandbox`, merge a `master` cuando el usuario apruebe. Estilo del repo: 2 espacios, **sin punto y coma**, comentarios en español.
- Solo frontend. Sin migraciones.

**Lo que este cambio NO mejora, dicho explícitamente:** el bloque `html` renderiza HTML crudo, igual que hoy `js/lessons.js:204`. El perfil de riesgo es el mismo —solo un admin escribe ahí y la CSP de `vercel.json` bloquea scripts inline y `javascript:`— pero **hay un ensanchamiento chico y real**: hoy el HTML crudo solo se renderiza cuando *todo* el `contenido` falla a parsear, mientras que con el bloque nuevo puede convivir con bloques normales en la misma lección. Este spec **no cierra** el item de XSS legacy de la auditoría (`js/lessons.js:204`), lo formaliza.

**Fuera de alcance:**

- Reparar lecciones ya vaciadas por esta puerta. El diagnóstico del 2026-07-25 dio **0 lecciones con contenido vacío**, así que no hay nada que reparar hoy; si aparecieran, es un trabajo aparte.
- Migrar `contenido` a `jsonb` y unificar el doble formato de raíz.
- La puerta 3: `renameFile` (`js/admin.js:2955`) mueve el objeto en Storage pero nunca llama a `cascadeUpdateUrl`, así que renombrar deja las lecciones apuntando a una URL que ya no existe (imagen rota, contenido intacto).
- Los items #2 (escapar el cuerpo en `renderMarkdown` + el `onclick` del lightbox roto por la CSP), #7 (realtime de lecciones) y #10 (borrar categoría sin chequear `error`) de la auditoría.
- Chequear el `error` de las escrituras del editor (`js/admin.js:729-731` sí lo chequea; el `select` de `cascadeUpdateUrl` no) — pendiente inherited del lote de la auditoría.
