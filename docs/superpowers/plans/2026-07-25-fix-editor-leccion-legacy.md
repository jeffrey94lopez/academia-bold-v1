# Fix — abrir el editor de una lección legacy le borra el HTML · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que abrir el editor de una lección en formato legacy y guardarla deje de destruir su contenido y su embedding — y que ese contenido quede visible y editable en el admin.

**Architecture:** Un módulo puro nuevo `js/lesson-blocks.js` concentra la única decisión del bug (*dado el `contenido` crudo, ¿qué bloques tiene esta lección?*), hoy duplicada en cinco lugares. El contenido legacy deja de ser un caso especial de cada consumidor y pasa a ser un tipo de bloque más, `{ type: 'html', html }`, que el renderer, el editor, el embedding y el copiado a WhatsApp saben tratar.

**Tech Stack:** JS ES-modules vanilla (sin build), `node:test`.

## Global Constraints

- Rama de trabajo: `sandbox`. Spec: `docs/superpowers/specs/2026-07-25-fix-editor-leccion-legacy-design.md`.
- Estilo del repo: indentación 2 espacios, **sin punto y coma**, comentarios en español.
- Propiedad central de `parseLessonBlocks`: **ninguna rama que reciba contenido puede devolver `[]`**. `[]` es exclusivo de las entradas vacías. Es lo mismo que se exigió en la puerta 1 (`remapContentUrl`).
- El helper es **puro e import-safe en Node**: sin `document`, sin `supabase`, sin efectos en top-level. Es lo que lo hace testeable.
- `js/admin.js`, `js/lessons.js`, `js/course-tab.js`, `js/block-renderer.js` y `js/whatsapp-copy.js` usan `document` y **no** son import-safe en Node → no llevan unit test propio; se verifican con `node --check` más la suite verde más la prueba manual del final.
- Tests: `node --test tests/*.test.mjs`. La suite está en **81** antes de este trabajo. El warning `MODULE_TYPELESS_PACKAGE_JSON` es esperado en todo el repo y **NO** es hallazgo.
- **Sin migraciones.** Solo frontend.
- El bloque `html` **no** se agrega a los botones de "agregar bloque" (el mapa `defaults` en `js/admin.js:681-690` no se toca). Solo lo produce `parseLessonBlocks`.

## File Structure

- `js/lesson-blocks.js` — **Create:** `parseLessonBlocks(raw)`, la única pieza con lógica de decisión.
- `tests/lesson-blocks.test.mjs` — **Create:** unit tests del helper.
- `js/block-renderer.js` — **Modify:** rama `html` en `renderBlocks` (después de la rama `step`, L12-28).
- `js/lessons.js` — **Modify:** import + parseo (L178-184) + borrar el fallback legacy (L202-206).
- `js/course-tab.js` — **Modify:** import + parseo y fallback legacy (L215-226).
- `js/admin.js` — **Modify:** import; `lessonToEmbedText` (L15-26); el `JSON.parse` sin `try` del re-embed (L953); el parseo al abrir el editor (L1051-1056); `blockItemHtml` (L1171-1228).
- `js/whatsapp-copy.js` — **Modify:** import + parseo (L40-44) + rama `html` en el loop (L47-63).

**Orden obligatorio:** Task 1 → Task 2 → Task 3 → Task 4.

Task 2 (el renderer) va **antes** que Task 3 (el admin) a propósito: Task 3 es lo que empieza a *guardar* bloques `html` en la base, y si el renderer todavía no los conoce, una lección legacy guardada entre las dos tareas se vería vacía para el alumno. Al revés no hay ventana de daño: después de Task 2 el renderer entiende un tipo de bloque que todavía nadie produce.

### Desviaciones respecto de la spec (deliberadas, ya verificadas contra el código)

1. **Son cinco consumidores, no cuatro.** La spec no vio `js/admin.js:953`: el botón "regenerar embedding" hace `embedLesson(..., JSON.parse(data.contenido))` **sin `try`**. Con una lección legacy eso lanza dentro del handler `async`, así que el botón queda `disabled` con el ícono `loader-2` girando y no aparece ningún toast. Se arregla en Task 3, Step 3, con la misma llamada al helper.
2. **`lessonToEmbedText` colapsa el HTML con espacios, no con `''`.** La spec dice "mismo tratamiento que ya le da a `step`", que usa `.replace(/<[^>]+>/g, '')`. Para un `step` eso está bien porque es un fragmento; para una lección legacy entera, `<p>hola</p><p>mundo</p>` se volvería `holamundo` — una sola palabra basura para el embedding. Se usa `' '` y se colapsan los espacios.

---

### Task 1: Módulo puro `js/lesson-blocks.js` + tests

**Files:**
- Create: `js/lesson-blocks.js`
- Test: `tests/lesson-blocks.test.mjs`

**Interfaces:**
- Produces: `parseLessonBlocks(raw) => Array`. `raw` es el `contenido` tal como viene de la base (un **string**; puede ser JSON de un array de bloques o HTML legacy). Devuelve siempre un array. Consumido por Tasks 2, 3 y 4.
- Produces: el tipo de bloque `{ type: 'html', html: string }` — su `html` se renderiza tal cual, se serializa tal cual, y su texto sin tags alimenta el embedding.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/lesson-blocks.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseLessonBlocks } from '../js/lesson-blocks.js'

test('formato moderno: devuelve el array de bloques tal cual', () => {
  const blocks = [{ type: 'step', text: 'uno' }, { type: 'image', url: 'https://x/f.png' }]
  const out = parseLessonBlocks(JSON.stringify(blocks))
  assert.deepEqual(out, blocks)
})

test('legacy: el HTML crudo se vuelve un solo bloque html con el contenido exacto', () => {
  const raw = '<p>hola</p><ul><li>uno</li></ul>'
  assert.deepEqual(parseLessonBlocks(raw), [{ type: 'html', html: raw }])
})

test('JSON válido que no es array: se preserva como bloque html, no se descarta', () => {
  for (const raw of ['{}', '"texto"', '42', 'null']) {
    assert.deepEqual(parseLessonBlocks(raw), [{ type: 'html', html: raw }], raw)
  }
})

test('vacíos: devuelven [] sin inventar bloques', () => {
  assert.deepEqual(parseLessonBlocks(null), [])
  assert.deepEqual(parseLessonBlocks(undefined), [])
  assert.deepEqual(parseLessonBlocks(''), [])
  assert.deepEqual(parseLessonBlocks('   '), [])
})

test('array recibido directamente (rama defensiva): se devuelve, no se descarta', () => {
  const blocks = [{ type: 'step', text: 'x' }]
  assert.equal(parseLessonBlocks(blocks), blocks)
})

test('no-string que tampoco es array: []', () => {
  assert.deepEqual(parseLessonBlocks(42), [])
  assert.deepEqual(parseLessonBlocks({ type: 'step' }), [])
})

test('array vacío legítimo: [] y no un bloque html con el texto "[]"', () => {
  assert.deepEqual(parseLessonBlocks('[]'), [])
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/lesson-blocks.test.mjs`
Expected: FAIL — no existe `js/lesson-blocks.js` (error de import, `ERR_MODULE_NOT_FOUND`).

- [ ] **Step 3: Escribir la implementación mínima**

Crear `js/lesson-blocks.js`:

```js
// Decide qué bloques tiene una lección a partir del `contenido` crudo.
// Import-safe (sin DOM, sin supabase): la I/O y el render viven en los
// consumidores.
//
// La columna `contenido` guarda DOS formatos: un string JSON con el array de
// bloques (el moderno) y HTML crudo escrito a mano (el legacy). Antes cada
// consumidor decidía por su cuenta y la copia del editor caía a [], que al
// guardar borraba la lección. Acá el legacy no es un caso especial: es un
// bloque más, de tipo 'html'.
//
// Propiedad central: ninguna rama que reciba contenido devuelve []. El array
// vacío es exclusivo de las entradas vacías.
export function parseLessonBlocks(raw) {
  // Defensivo: nadie debería pasar un array (los llamadores pasan el crudo de
  // la base, que es text), pero sin esta rama caería en "no-string" y se
  // perdería justo lo que hay que preservar.
  if (Array.isArray(raw)) return raw
  if (typeof raw !== 'string') return []
  if (!raw.trim()) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
  } catch (_) {}
  return [{ type: 'html', html: raw }]
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/lesson-blocks.test.mjs`
Expected: PASS — 7 tests.

- [ ] **Step 5: Correr la suite completa**

Run: `node --test tests/*.test.mjs`
Expected: PASS — 88 tests (81 previos + 7 nuevos). Si alguno de los 81 cambia, algo se rompió fuera de alcance: parar y reportar.

- [ ] **Step 6: Commit**

```bash
git add js/lesson-blocks.js tests/lesson-blocks.test.mjs
git commit -m "feat: parseLessonBlocks — el contenido legacy pasa a ser un bloque html + tests"
```

---

### Task 2: El portal del alumno renderiza el bloque `html`

El renderer aprende el tipo nuevo y los dos consumidores del portal dejan de tener su propia rama legacy. El resultado visible para el alumno es **idéntico** al de hoy: antes el HTML crudo se pintaba con `innerHTML` en un `div` suelto; ahora se pinta con `innerHTML` en un `div` que arma el renderer.

**Files:**
- Modify: `js/block-renderer.js` — rama nueva después de la rama `step` (que termina en L28).
- Modify: `js/lessons.js` — import (arriba, junto a los otros) + L178-184 + L200-206.
- Modify: `js/course-tab.js` — import (arriba, junto a los otros) + L215-226.

**Interfaces:**
- Consumes: `parseLessonBlocks(raw) => Array` de `js/lesson-blocks.js` (Task 1), y el bloque `{ type: 'html', html: string }`.

> **Nota:** los tres archivos usan `document` y no son import-safe en Node → esta tarea no lleva unit test propio. Verificación = `node --check` + suite verde + la prueba manual del final del plan.

- [ ] **Step 1: Agregar la rama `html` al renderer**

En `js/block-renderer.js`, el bloque `step` termina en la línea 28 con:

```js
      wrap.append(circle, textEl)
      frag.append(wrap)

    } else if (block.type === 'image') {
```

Insertar la rama nueva entre esas dos, dejando:

```js
      wrap.append(circle, textEl)
      frag.append(wrap)

    } else if (block.type === 'html') {
      // Contenido legacy: HTML crudo escrito a mano. Se pinta sin decoración,
      // exactamente como lo hacía js/lessons.js antes de unificar el parseo.
      // NO se convierte a `step`: eso le agregaría un círculo numerado y
      // cambiaría el aspecto de la lección para el alumno.
      const raw = block.html != null ? String(block.html) : ''
      if (!raw) continue
      const wrap = document.createElement('div')
      wrap.style.cssText = 'margin-bottom:14px'
      wrap.innerHTML = raw
      frag.append(wrap)

    } else if (block.type === 'image') {
```

- [ ] **Step 2: Cablear `js/lessons.js`**

Agregar el import junto a los que ya tiene el archivo arriba de todo:

```js
import { parseLessonBlocks } from './lesson-blocks.js'
```

Reemplazar el parseo (L178-184):

```js
    let blocks = []
    let isLegacy = false
    try {
      const p = JSON.parse(lesson.contenido)
      if (Array.isArray(p)) blocks = p
      else isLegacy = true
    } catch (_) { isLegacy = true }
```

por:

```js
    const blocks = parseLessonBlocks(lesson.contenido)
```

Y reemplazar el render con su fallback legacy (L200-206):

```js
    if (restBlocks.length > 0) {
      inner.appendChild(renderBlocks(restBlocks))
    } else if (isLegacy && lesson.contenido) {
      const div = document.createElement('div')
      div.innerHTML = lesson.contenido
      inner.append(div)
    }
```

por:

```js
    // El contenido legacy ya viene como bloque html desde parseLessonBlocks:
    // no hace falta una rama aparte acá.
    if (restBlocks.length > 0) {
      inner.appendChild(renderBlocks(restBlocks))
    }
```

Las líneas de `topVideo`/`restBlocks` que están en el medio (L186-198) **no se tocan**: siguen funcionando igual porque un bloque `html` no es `video`.

- [ ] **Step 3: Cablear `js/course-tab.js`**

Agregar el import junto a los que ya tiene el archivo arriba de todo:

```js
import { parseLessonBlocks } from './lesson-blocks.js'
```

Reemplazar L215-226:

```js
  let blocks = []
  try {
    const parsed = JSON.parse(lesson.contenido)
    if (Array.isArray(parsed)) blocks = parsed
  } catch (_) {}
  if (blocks.length) {
    inner.appendChild(renderBlocks(blocks))
  } else if (lesson.contenido) {
    const div = document.createElement('div')
    div.innerHTML = lesson.contenido
    inner.appendChild(div)
  }
```

por:

```js
  // El contenido legacy llega como bloque html; renderBlocks lo pinta.
  const blocks = parseLessonBlocks(lesson.contenido)
  if (blocks.length) {
    inner.appendChild(renderBlocks(blocks))
  }
```

- [ ] **Step 4: Verificar que no quedó lógica legacy suelta**

Run: `grep -n "isLegacy\|innerHTML = lesson.contenido" js/lessons.js js/course-tab.js`
Expected: **sin resultados**. Si aparece alguna, el reemplazo quedó incompleto.

- [ ] **Step 5: Verificar sintaxis y suite**

Run: `node --check js/block-renderer.js && node --check js/lessons.js && node --check js/course-tab.js && node --test tests/*.test.mjs`
Expected: sin error de sintaxis; suite verde en 88.

- [ ] **Step 6: Commit**

```bash
git add js/block-renderer.js js/lessons.js js/course-tab.js
git commit -m "fix: el portal renderiza el contenido legacy como bloque html"
```

---

### Task 3: El editor del admin deja de borrar el contenido y el embedding

Es el fix del bug. Cuatro cambios en `js/admin.js`: el parseo al abrir el editor (la causa), el embedding (el segundo daño), el `JSON.parse` sin `try` del re-embed (el que cuelga el botón) y la UI del bloque en el editor.

**Files:**
- Modify: `js/admin.js` — import (después de L10); `lessonToEmbedText` (L15-26); re-embed (L953); apertura del editor (L1051-1056); `blockItemHtml` (L1172-1228).

**Interfaces:**
- Consumes: `parseLessonBlocks(raw) => Array` de `js/lesson-blocks.js` (Task 1), y el bloque `{ type: 'html', html: string }`.

> **Nota:** `js/admin.js` usa `document` y no es import-safe en Node → esta tarea no lleva unit test propio. Verificación = `node --check` + suite verde + la prueba manual del final del plan.

- [ ] **Step 1: Agregar el import**

En `js/admin.js`, después del import de `remapContentUrl` (línea 10), agregar:

```js
import { parseLessonBlocks } from './lesson-blocks.js'
```

- [ ] **Step 2: Que el embedding incluya el bloque `html`**

En `js/admin.js`, `lessonToEmbedText` (L15-26) tiene hoy:

```js
    blocks.forEach(b => {
      if (b.type === 'step' && b.text)
        text += b.text.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() + '\n'
      else if ((b.type === 'bot_nota' || b.type === 'bot_faq') && b.content)
        text += b.content + '\n'
    })
```

Reemplazarlo por:

```js
    blocks.forEach(b => {
      if (b.type === 'step' && b.text)
        text += b.text.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() + '\n'
      else if (b.type === 'html' && b.html)
        // El legacy es una lección entera, no un fragmento: los tags se
        // reemplazan por espacio (no por '') para que <p>a</p><p>b</p> no
        // termine como "ab" en el embedding.
        text += String(b.html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() + '\n'
      else if ((b.type === 'bot_nota' || b.type === 'bot_faq') && b.content)
        text += b.content + '\n'
    })
```

Sin esto, guardar una lección legacy preserva el contenido pero **igual le borra el embedding** y el bot deja de saber de ella.

- [ ] **Step 3: Arreglar el `JSON.parse` sin `try` del botón de re-embed**

En `js/admin.js:953`:

```js
      const ok = await embedLesson(data.id, data.titulo, data.categoria, JSON.parse(data.contenido))
```

Reemplazar por:

```js
      const ok = await embedLesson(data.id, data.titulo, data.categoria, parseLessonBlocks(data.contenido))
```

Este `JSON.parse` no tiene `try`: con una lección legacy lanza dentro del handler, el botón queda `disabled` girando para siempre y no sale ningún toast.

- [ ] **Step 4: Que abrir el editor no descarte el contenido**

En `js/admin.js`, el bloque actual (L1051-1056) es:

```js
  try {
    currentBlocks = lesson?.contenido ? JSON.parse(lesson.contenido) : []
    if (!Array.isArray(currentBlocks)) currentBlocks = []
  } catch (_) {
    currentBlocks = []
  }
```

Reemplazarlo por:

```js
  // ACÁ vivía el bug: una lección legacy hacía lanzar a JSON.parse, currentBlocks
  // quedaba en [] y el siguiente guardado escribía '[]' encima del contenido.
  currentBlocks = parseLessonBlocks(lesson?.contenido)
```

El `try/catch` del `examen` que viene justo abajo (L1058-1065) **no se toca**: es otro campo y otro formato.

- [ ] **Step 5: Mostrar y permitir editar el bloque en el admin**

En `js/admin.js`, `blockItemHtml`, agregar la entrada en los dos mapas (L1172-1176). `colors` queda:

```js
  const colors = { step: 'var(--blue-100)', image: '#3b82f6', video: '#8b5cf6', link: '#16a34a', html: '#64748b',
    bot_nota: '#d97706', bot_advertencia: '#d97706', bot_pasos: '#d97706', bot_relacionado: '#d97706', bot_faq: '#d97706' }
```

y `labels`:

```js
  const labels = { step: '📝 Paso', image: '🖼️ Imagen', video: '▶️ Video YouTube', link: '🔗 Link', html: '📄 HTML (contenido antiguo)',
    bot_nota: '💡 Nota — bolbot POS', bot_advertencia: '⚠️ Advertencia — bolbot POS',
    bot_pasos: '📋 Pasos internos — bolbot POS', bot_relacionado: '🔗 Relacionado — bolbot POS', bot_faq: '❓ Preg. frecuente — bolbot POS' }
```

Y agregar la rama de campos. La rama del `step` es hoy (L1192-1193):

```js
  } else if (block.type === 'step') {
    fields = `<div class="quill-step-editor"></div>`
  } else if (block.type === 'image') {
```

Insertar la rama nueva entre esas, dejando:

```js
  } else if (block.type === 'step') {
    fields = `<div class="quill-step-editor"></div>`
  } else if (block.type === 'html') {
    // Textarea crudo a propósito, no Quill: Quill normaliza el HTML a su propio
    // subconjunto y simplificaría el marcado de una lección vieja.
    fields = `<textarea data-field="html" rows="8"
      class="w-full px-2 py-1.5 rounded-lg border border-[var(--blue-20)] bg-[var(--background-page)] text-xs font-mono outline-none focus:border-[var(--blue-100)] resize-y">${escapeHtml(block.html || '')}</textarea>
      <p class="text-[10px] text-[var(--black-40)] mt-1">Contenido en formato antiguo. Se guarda tal cual, sin tocarlo.</p>`
  } else if (block.type === 'image') {
```

El `textarea` no necesita listener propio: se engancha al binding genérico de `renderBlockList` (L1091-1097), que hace `currentBlocks[idx][input.dataset.field] = input.value` — el mismo mecanismo de los bloques `bot_*` con su `data-field="content"`.

- [ ] **Step 6: Verificar que no quedó nada de la lógica vieja**

Run: `grep -n "JSON.parse(lesson.contenido)\|JSON.parse(data.contenido)" js/admin.js`
Expected: **sin resultados**. Si aparece alguna, algún reemplazo quedó incompleto.

Run: `grep -n "html:" js/admin.js | head -20`
Expected: aparecen las entradas nuevas en `colors` y `labels`.

- [ ] **Step 7: Verificar que el bloque NO se agregó a los botones de "agregar bloque"**

Run: `grep -n "add-block" -A 14 js/admin.js | grep -c "html:"`
Expected: `0`. El mapa `defaults` (L681-690) tiene que quedar igual — el bloque `html` solo existe para recibir contenido legacy, no para escribirlo a mano.

- [ ] **Step 8: Verificar sintaxis y suite**

Run: `node --check js/admin.js && node --test tests/*.test.mjs`
Expected: sin error de sintaxis; suite verde en 88.

- [ ] **Step 9: Commit**

```bash
git add js/admin.js
git commit -m "fix: abrir y guardar una lección legacy ya no borra su contenido ni su embedding"
```

---

### Task 4: El copiado a WhatsApp incluye el contenido legacy

**Files:**
- Modify: `js/whatsapp-copy.js` — import (arriba de todo, el archivo hoy no tiene imports) + L40-44 + rama nueva en el loop (L47-63).

**Interfaces:**
- Consumes: `parseLessonBlocks(raw) => Array` de `js/lesson-blocks.js` (Task 1), y el bloque `{ type: 'html', html: string }`.

> **Nota:** `js/whatsapp-copy.js` usa `document` en `htmlStepToWhatsApp` y no es import-safe en Node → esta tarea no lleva unit test propio. Verificación = `node --check` + suite verde + la prueba manual del final del plan.

- [ ] **Step 1: Agregar el import**

`js/whatsapp-copy.js` hoy empieza directo con `function htmlToWhatsApp(node) {`. Agregar arriba de todo:

```js
import { parseLessonBlocks } from './lesson-blocks.js'
```

- [ ] **Step 2: Usar el helper para el parseo**

En `lessonToWhatsApp`, reemplazar (L40-44):

```js
  let blocks = []
  try {
    const p = JSON.parse(lesson.contenido)
    if (Array.isArray(p)) blocks = p
  } catch (_) {}
```

por:

```js
  const blocks = parseLessonBlocks(lesson.contenido)
```

Esto es lo que hace alcanzable la rama del Step 3 también para las lecciones legacy que todavía nadie abrió en el editor: hoy copiar una de esas produce solo el título.

- [ ] **Step 3: Agregar la rama `html` al loop**

En el loop de `lessonToWhatsApp`, la rama del `step` termina así (L49-54):

```js
    if (b.type === 'step' && b.text) {
      stepNum++
      const isHtml = /<[a-z]/i.test(b.text)
      const text = isHtml ? htmlStepToWhatsApp(b.text) : b.text
      lines.push(`${stepNum}. ${text}`)
    } else if (b.type === 'video' && b.url) {
```

Insertar la rama nueva entre esas, dejando:

```js
    if (b.type === 'step' && b.text) {
      stepNum++
      const isHtml = /<[a-z]/i.test(b.text)
      const text = isHtml ? htmlStepToWhatsApp(b.text) : b.text
      lines.push(`${stepNum}. ${text}`)
    } else if (b.type === 'html' && b.html) {
      // Contenido legacy: se convierte con el mismo traductor que los steps
      // con HTML, pero sin numerarlo (no es un paso).
      lines.push(htmlStepToWhatsApp(String(b.html)))
    } else if (b.type === 'video' && b.url) {
```

El `continue` de la línea 48 (`if (!b.type || b.type.startsWith('bot_')) continue`) no necesita cambios: `'html'` no empieza con `bot_`.

- [ ] **Step 4: Verificar sintaxis y suite**

Run: `node --check js/whatsapp-copy.js && node --test tests/*.test.mjs`
Expected: sin error de sintaxis; suite verde en 88.

- [ ] **Step 5: Commit**

```bash
git add js/whatsapp-copy.js
git commit -m "fix: el copiado a WhatsApp incluye el contenido legacy"
```

---

## Notas de verificación final

**Lectura del diff:** confirmar que en el camino nuevo no existe ninguna rama que reciba `contenido` no vacío y produzca `[]`. Es la propiedad central del fix, igual que en la puerta 1.

**Verificación manual (para el usuario, en el navegador).** Hacerla con una lección de descarte:

1. Crear una lección de prueba en el admin y guardarla.
2. En Supabase, ponerle contenido legacy a mano:
   `update lecciones set contenido = '<p>hola</p><ul><li>uno</li><li>dos</li></ul>' where id = …`
3. Abrirla en el portal del alumno: tiene que verse el párrafo y la lista.
4. Abrirla en el editor del admin: tiene que aparecer **un bloque "📄 HTML (contenido antiguo)"** con ese HTML adentro, no un editor vacío.
5. Cambiarle **solo el título** y guardar.
6. Volver a abrirla en el portal: el contenido tiene que seguir ahí y verse **igual** que en el paso 3.
7. Preguntarle al bot por esa lección: tiene que seguir encontrándola (el embedding no se borró).
8. Bonus: con la lección en legacy (antes del paso 5), tocar el botón de regenerar embedding — antes se quedaba girando para siempre, ahora tiene que terminar con toast.

Antes del fix, el paso 6 mostraba la lección vacía y el 7 fallaba.

**Fuera de alcance (no implementar):**

- Reparar lecciones ya vaciadas por esta puerta. El diagnóstico del 2026-07-25 dio 0 lecciones con contenido vacío.
- Migrar `contenido` a `jsonb` y unificar el doble formato de raíz.
- La puerta 3: `renameFile` (`js/admin.js:2955`) mueve el objeto en Storage pero nunca llama a `cascadeUpdateUrl`.
- El XSS del contenido legacy. El bloque `html` renderiza HTML crudo igual que hoy `js/lessons.js:204`; el spec deja constancia de que esto **no** cierra el item #2 de la auditoría y de que hay un ensanchamiento chico (ahora el HTML crudo puede convivir con bloques normales en la misma lección).
- Los items #7 (realtime de lecciones) y #10 (borrar categoría sin chequear `error`) de la auditoría.
- Chequear el `error` de las escrituras del editor.
