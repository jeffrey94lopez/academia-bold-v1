# Admin UX Improvements V2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar 5 mejoras UX en el panel admin de Academia Bold POS para cumplir con las guías de accesibilidad (WCAG/Material Design) e interacción.

**Architecture:** Todos los cambios están en `js/admin.js` (vanilla JS + Tailwind). Las mejoras son: loading state en botones de guardar, aria-labels en botones icon-only, iconos Lucide en reemplazo de emojis en la media library, y empty state con CTA en la lista de lecciones. No se crean nuevos archivos.

**Tech Stack:** Vanilla JS ES modules, Tailwind CSS CDN, Lucide Icons (global `window.lucide`), Supabase JS client.

---

## Files

- Modify: `js/admin.js` — todos los cambios de este plan

---

## Task 1: Loading state en botón "Guardar lección"

**Archivo:** `js/admin.js` — función `saveLessonBtn` handler, línea ~285

El botón "Guardar lección" no se deshabilita durante el guardado async. El usuario puede hacer clic múltiples veces y crear lecciones duplicadas.

- [ ] **Step 1: Modificar el handler de saveLessonBtn**

Localizar el bloque que empieza en `document.getElementById('saveLessonBtn').addEventListener('click', async () => {` y reemplazar:

```js
document.getElementById('saveLessonBtn').addEventListener('click', async () => {
    const titulo = document.getElementById('lessonTitulo').value.trim()
    const orden = parseInt(document.getElementById('lessonOrden').value)
    if (!titulo || isNaN(orden)) {
      alert('Completa Título y Orden antes de guardar.')
      return
    }
    const id = document.getElementById('lessonId').value
    const payload = {
      titulo,
      descripcion: document.getElementById('lessonDescripcion').value,
      contenido: JSON.stringify(currentBlocks),
      orden,
      categoria: document.getElementById('lessonCategoria').value,
      notas: document.getElementById('lessonNotas').value.trim() || null,
      examen: currentQuestions.length ? { preguntas: currentQuestions } : null,
    }
    const { error } = id
      ? await supabase.from('lecciones').update(payload).eq('id', id)
      : await supabase.from('lecciones').insert(payload)
    if (error) { alert('Error al guardar: ' + error.message); return }
    document.getElementById('lessonFormModal').classList.add('hidden')
    renderLessonsPanel()
  })
```

Por este bloque (con loading state):

```js
document.getElementById('saveLessonBtn').addEventListener('click', async () => {
    const titulo = document.getElementById('lessonTitulo').value.trim()
    const orden = parseInt(document.getElementById('lessonOrden').value)
    if (!titulo || isNaN(orden)) {
      alert('Completa Título y Orden antes de guardar.')
      return
    }
    const btn = document.getElementById('saveLessonBtn')
    btn.disabled = true
    btn.textContent = 'Guardando...'
    const id = document.getElementById('lessonId').value
    const payload = {
      titulo,
      descripcion: document.getElementById('lessonDescripcion').value,
      contenido: JSON.stringify(currentBlocks),
      orden,
      categoria: document.getElementById('lessonCategoria').value,
      notas: document.getElementById('lessonNotas').value.trim() || null,
      examen: currentQuestions.length ? { preguntas: currentQuestions } : null,
    }
    const { error } = id
      ? await supabase.from('lecciones').update(payload).eq('id', id)
      : await supabase.from('lecciones').insert(payload)
    if (error) {
      alert('Error al guardar: ' + error.message)
      btn.disabled = false
      btn.textContent = 'Guardar lección'
      return
    }
    document.getElementById('lessonFormModal').classList.add('hidden')
    renderLessonsPanel()
  })
```

- [ ] **Step 2: Agregar loading state a saveTerm (glosario)**

Localizar `document.getElementById('saveTerm').addEventListener('click', async () => {` y reemplazar el interior:

```js
document.getElementById('saveTerm').addEventListener('click', async () => {
    const id = document.getElementById('termId').value
    const payload = {
      termino: document.getElementById('termTermino').value,
      definicion: document.getElementById('termDefinicion').value,
    }
    if (id) {
      await supabase.from('glosario').update(payload).eq('id', id)
    } else {
      await supabase.from('glosario').insert(payload)
    }
    renderGlossaryPanel()
  })
```

Por:

```js
document.getElementById('saveTerm').addEventListener('click', async () => {
    const btn = document.getElementById('saveTerm')
    btn.disabled = true
    btn.textContent = 'Guardando...'
    const id = document.getElementById('termId').value
    const payload = {
      termino: document.getElementById('termTermino').value,
      definicion: document.getElementById('termDefinicion').value,
    }
    if (id) {
      await supabase.from('glosario').update(payload).eq('id', id)
    } else {
      await supabase.from('glosario').insert(payload)
    }
    renderGlossaryPanel()
  })
```

- [ ] **Step 3: Agregar loading state a saveSug (sugerencias)**

Localizar `document.getElementById('saveSug').addEventListener('click', async () => {` y agregar al inicio (antes del `const id = ...`):

```js
const saveBtn = document.getElementById('saveSug')
saveBtn.disabled = true
saveBtn.textContent = 'Guardando...'
```

Y en el bloque `if (activo)` donde puede retornar temprano, restaurar el estado antes del `return`:

```js
if (otrasActivas.length >= 6) {
  errorEl.textContent = 'Máximo 6 sugerencias activas. Desactiva una antes de agregar otra.'
  errorEl.classList.remove('hidden')
  saveBtn.disabled = false
  saveBtn.textContent = 'Guardar'
  return
}
```

- [ ] **Step 4: Verificar manualmente**

Abrir el admin en el navegador. Abrir una lección, hacer clic en "Guardar lección". Verificar que:
- El botón dice "Guardando..." y está deshabilitado durante el guardado
- El botón no aparece después del guardado (el modal se cierra)
- Si hay un error de red, el botón se reactiva

- [ ] **Step 5: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): loading state en botones guardar previene envíos duplicados"
```

---

## Task 2: aria-label en todos los botones icon-only

**Archivo:** `js/admin.js` — funciones `lessonCardHtml`, `renderLessonsPanel`, `renderGlossaryPanel`, `renderSuggestionsPanel`, `blockItemHtml`, `renderQuestionList`

Los botones de editar/eliminar/copiar usan solo iconos Lucide sin texto visible. Los lectores de pantalla los leen como "button" sin contexto.

- [ ] **Step 1: Agregar aria-label y data-titulo en lessonCardHtml**

Localizar la función `lessonCardHtml` y reemplazar los dos botones de acción:

```js
      <div class="flex gap-1 shrink-0">
        <button data-id="${l.id}" class="copy-whatsapp p-1.5 rounded-lg hover:bg-green-50 text-slate-400 hover:text-green-600" title="Copiar para WhatsApp">
          <i data-lucide="share-2" class="w-4 h-4"></i>
        </button>
        <button data-id="${l.id}" class="del-lesson p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500" title="Eliminar">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
```

Por:

```js
      <div class="flex gap-1 shrink-0">
        <button data-id="${l.id}" class="copy-whatsapp p-1.5 rounded-lg hover:bg-green-50 text-slate-400 hover:text-green-600" title="Copiar para WhatsApp" aria-label="Copiar lección para WhatsApp">
          <i data-lucide="share-2" class="w-4 h-4"></i>
        </button>
        <button data-id="${l.id}" data-titulo="${escapeHtml(l.titulo)}" class="del-lesson p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500" title="Eliminar" aria-label="Eliminar lección ${escapeHtml(l.titulo)}">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
```

- [ ] **Step 2: Mejorar mensaje de confirmación de eliminar lección**

Localizar el handler de `.del-lesson` en `wireLessonCards`:

```js
  list.querySelectorAll('.del-lesson').forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation()
    if (!confirm('¿Eliminar esta lección?')) return
    await supabase.from('lecciones').delete().eq('id', b.dataset.id)
    renderLessonsPanel()
  }))
```

Reemplazar por:

```js
  list.querySelectorAll('.del-lesson').forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation()
    if (!confirm(`¿Eliminar la lección "${b.dataset.titulo}"?\nEsta acción no se puede deshacer.`)) return
    await supabase.from('lecciones').delete().eq('id', b.dataset.id)
    renderLessonsPanel()
  }))
```

- [ ] **Step 3: aria-label en botones de categorías**

En `renderLessonsPanel`, localizar el HTML de `.edit-cat` y `.del-cat` dentro del `currentCategories.map(c => ...)`:

```js
            <button class="edit-cat text-slate-300 hover:text-slate-600 p-1" data-id="${c.id}" data-nombre="${escapeHtml(c.nombre)}" data-emoji="${escapeHtml(c.emoji)}" title="Editar">
              <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
            </button>
            <button class="del-cat text-slate-300 hover:text-red-500 p-1" data-id="${c.id}" data-nombre="${escapeHtml(c.nombre)}" title="Eliminar">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
```

Reemplazar por:

```js
            <button class="edit-cat text-slate-300 hover:text-slate-600 p-1" data-id="${c.id}" data-nombre="${escapeHtml(c.nombre)}" data-emoji="${escapeHtml(c.emoji)}" title="Editar" aria-label="Editar categoría ${escapeHtml(c.nombre)}">
              <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
            </button>
            <button class="del-cat text-slate-300 hover:text-red-500 p-1" data-id="${c.id}" data-nombre="${escapeHtml(c.nombre)}" title="Eliminar" aria-label="Eliminar categoría ${escapeHtml(c.nombre)}">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
```

- [ ] **Step 4: aria-label en botones del glosario**

En `renderGlossaryPanel`, localizar los botones `.edit-term` y `.del-term`:

```js
            <button data-id="${g.id}" data-term="${escapeHtml(g.termino)}" data-def="${escapeHtml(g.definicion)}" class="edit-term p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
              <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
            <button data-id="${g.id}" class="del-term p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-500">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
```

Reemplazar por:

```js
            <button data-id="${g.id}" data-term="${escapeHtml(g.termino)}" data-def="${escapeHtml(g.definicion)}" class="edit-term p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Editar término ${escapeHtml(g.termino)}">
              <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
            <button data-id="${g.id}" class="del-term p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-500" aria-label="Eliminar término ${escapeHtml(g.termino)}">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
```

- [ ] **Step 5: aria-label en botones de sugerencias**

En `renderSuggestionsPanel`, localizar los botones `.edit-sug` y `.del-sug`:

```js
            <button data-id="${s.id}" data-texto="${escapeHtml(s.texto)}" data-orden="${escapeHtml(String(s.orden))}" data-activo="${escapeHtml(String(s.activo))}" class="edit-sug p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
              <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
            <button data-id="${s.id}" class="del-sug p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-500">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
```

Reemplazar por:

```js
            <button data-id="${s.id}" data-texto="${escapeHtml(s.texto)}" data-orden="${escapeHtml(String(s.orden))}" data-activo="${escapeHtml(String(s.activo))}" class="edit-sug p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Editar sugerencia ${escapeHtml(s.texto)}">
              <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
            <button data-id="${s.id}" class="del-sug p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-500" aria-label="Eliminar sugerencia ${escapeHtml(s.texto)}">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
```

- [ ] **Step 6: aria-label en botón eliminar bloque (blockItemHtml)**

Al final de `blockItemHtml`, localizar:

```js
    <button class="del-block text-slate-300 hover:text-red-400 text-sm px-1 mt-0.5 shrink-0">✕</button>
```

Reemplazar por:

```js
    <button class="del-block text-slate-300 hover:text-red-400 text-sm px-1 mt-0.5 shrink-0" aria-label="Eliminar bloque">✕</button>
```

- [ ] **Step 7: aria-label en botón eliminar pregunta (renderQuestionList)**

Localizar dentro de `renderQuestionList`:

```js
        <button data-qi="${qi}" class="del-q text-slate-300 hover:text-red-400 text-sm px-1 shrink-0 mt-1">✕</button>
```

Reemplazar por:

```js
        <button data-qi="${qi}" class="del-q text-slate-300 hover:text-red-400 text-sm px-1 shrink-0 mt-1" aria-label="Eliminar pregunta">✕</button>
```

- [ ] **Step 8: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): aria-labels en botones icon-only mejoran accesibilidad"
```

---

## Task 3: Reemplazar emojis con iconos Lucide en media library

**Archivo:** `js/admin.js` — función `fileIcon`, `renderMaterialGrid`, `renderMediaGrid`, `renderMaterialPanel`

Los emojis `📄 🎬 📁` son inconsistentes con el resto del admin que usa Lucide SVG. Los emojis varían según SO/navegador y no se pueden estilizar con CSS.

- [ ] **Step 1: Reemplazar la función fileIcon**

Localizar:

```js
function fileIcon(type) {
  if (!type) return '📁'
  if (type.startsWith('image/')) return '🖼️'
  if (type === 'application/pdf') return '📄'
  if (type.startsWith('video/')) return '🎬'
  if (type.startsWith('audio/')) return '🎵'
  return '📁'
}
```

Reemplazar por:

```js
function fileIcon(type) {
  if (!type) return '<i data-lucide="folder" class="w-8 h-8 text-slate-400"></i>'
  if (type.startsWith('image/')) return '<i data-lucide="image" class="w-8 h-8 text-blue-400"></i>'
  if (type === 'application/pdf') return '<i data-lucide="file-text" class="w-8 h-8 text-red-400"></i>'
  if (type.startsWith('video/')) return '<i data-lucide="video" class="w-8 h-8 text-purple-400"></i>'
  if (type.startsWith('audio/')) return '<i data-lucide="music" class="w-8 h-8 text-green-400"></i>'
  return '<i data-lucide="file" class="w-8 h-8 text-slate-400"></i>'
}
```

- [ ] **Step 2: Ajustar el wrapper en renderMaterialGrid**

Lucide necesita un div flex para centrar el icono (no text-3xl). Localizar en `renderMaterialGrid`:

```js
        : `<div class="text-3xl mb-2">${fileIcon(f.type)}</div>`}
```

Reemplazar por:

```js
        : `<div class="flex justify-center mb-2">${fileIcon(f.type)}</div>`}
```

- [ ] **Step 3: Ajustar el wrapper en renderMediaGrid**

Localizar en `renderMediaGrid`:

```js
      : `<div class="text-3xl mb-1">${fileIcon(f.type)}</div>`
```

Reemplazar por:

```js
      : `<div class="flex justify-center mb-1">${fileIcon(f.type)}</div>`
```

- [ ] **Step 4: Agregar lucide.createIcons() después de renderMaterialGrid**

La función `fileIcon` ahora retorna HTML con `data-lucide="..."`. Lucide necesita ser invocado para convertir esos elementos en SVG. Localizar en `renderMaterialPanel` la función interna `loadFiles`:

```js
  const loadFiles = async () => {
    const grid = document.getElementById('materialGrid')
    if (!grid) return
    grid.innerHTML = '<p class="col-span-5 text-center text-slate-400 text-sm py-12">Cargando...</p>'
    try {
      files = await listFiles()
      renderMaterialGrid(files)
    } catch {
      grid.innerHTML = `<p class="col-span-5 text-center text-red-400 text-sm py-12">Error al cargar. <button onclick="renderMaterialPanel()" class="underline">Reintentar</button></p>`
    }
  }
```

Reemplazar por:

```js
  const loadFiles = async () => {
    const grid = document.getElementById('materialGrid')
    if (!grid) return
    grid.innerHTML = '<p class="col-span-5 text-center text-slate-400 text-sm py-12">Cargando...</p>'
    try {
      files = await listFiles()
      renderMaterialGrid(files)
      lucide.createIcons()
    } catch {
      grid.innerHTML = `<p class="col-span-5 text-center text-red-400 text-sm py-12">Error al cargar. <button onclick="renderMaterialPanel()" class="underline">Reintentar</button></p>`
    }
  }
```

- [ ] **Step 5: Agregar lucide.createIcons() en materialSearch input handler**

Localizar:

```js
  document.getElementById('materialSearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase()
    renderMaterialGrid(files.filter(f => f.name.toLowerCase().includes(q)))
  })
```

Reemplazar por:

```js
  document.getElementById('materialSearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase()
    renderMaterialGrid(files.filter(f => f.name.toLowerCase().includes(q)))
    lucide.createIcons()
  })
```

- [ ] **Step 6: Agregar lucide.createIcons() en openMediaLibrary**

Localizar en `openMediaLibrary`:

```js
  try {
    files = await listFiles()
    renderMediaGrid(files)
  } catch {
    grid.innerHTML = '<p class="col-span-4 text-center text-red-400 text-sm py-8">Error al cargar archivos</p>'
  }

  search.oninput = () => {
    const q = search.value.toLowerCase()
    renderMediaGrid(files.filter(f => f.name.toLowerCase().includes(q)))
  }
```

Reemplazar por:

```js
  try {
    files = await listFiles()
    renderMediaGrid(files)
    lucide.createIcons()
  } catch {
    grid.innerHTML = '<p class="col-span-4 text-center text-red-400 text-sm py-8">Error al cargar archivos</p>'
  }

  search.oninput = () => {
    const q = search.value.toLowerCase()
    renderMediaGrid(files.filter(f => f.name.toLowerCase().includes(q)))
    lucide.createIcons()
  }
```

- [ ] **Step 7: Reemplazar emoji del dropzone en renderMaterialPanel**

Localizar en el HTML del dropzone dentro de `renderMaterialPanel`:

```js
      <div class="text-4xl mb-3">📁</div>
```

Reemplazar por:

```js
      <i data-lucide="folder-open" class="w-10 h-10 text-slate-300 mx-auto mb-3 block"></i>
```

Y agregar `lucide.createIcons()` después de `el.innerHTML = ...` al inicio de `renderMaterialPanel`, justo antes de `let files = []`:

```js
  // después de el.innerHTML = `...`
  lucide.createIcons()
  let files = []
```

- [ ] **Step 8: Verificar en el navegador**

Abrir el panel Material. Verificar que:
- El dropzone muestra icono SVG folder en lugar de emoji 📁
- Los archivos no-imagen muestran iconos SVG coloreados en lugar de emojis
- Los iconos se ven en la modal de biblioteca de medios también
- Al buscar archivos, los iconos siguen mostrándose correctamente

- [ ] **Step 9: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): iconos Lucide SVG reemplazan emojis en media library"
```

---

## Task 4: Empty state mejorado en lista de lecciones

**Archivo:** `js/admin.js` — función `renderGroupedLessons`

Cuando no hay lecciones creadas, se muestra solo texto plano sin CTA. Un empty state con botón guía al usuario a crear el primer contenido.

- [ ] **Step 1: Mejorar el empty state cuando no hay lecciones (sin búsqueda)**

En `renderGroupedLessons`, localizar al final:

```js
    list.innerHTML = html || '<p class="text-slate-400 text-sm text-center py-8">No hay lecciones aún.</p>'
```

Reemplazar por:

```js
    if (!html) {
      list.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <div class="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <i data-lucide="book-open" class="w-8 h-8 text-slate-400"></i>
          </div>
          <p class="font-bold text-slate-700 mb-1">Aún no hay lecciones</p>
          <p class="text-xs text-slate-400 mb-4">Crea la primera lección para que los estudiantes comiencen</p>
          <button id="emptyAddLesson" class="bg-[#E92129] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 mx-auto">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i> Crear primera lección
          </button>
        </div>`
      lucide.createIcons()
      document.getElementById('emptyAddLesson')?.addEventListener('click', () => openLessonForm())
      return
    }
    list.innerHTML = html
```

- [ ] **Step 2: Mejorar el empty state de búsqueda sin resultados**

En `renderGroupedLessons`, al inicio de la función, localizar:

```js
  if (!filtered.length) {
    list.innerHTML = '<p class="text-slate-400 text-sm text-center py-8">No se encontraron lecciones.</p>'
    return
  }
```

Reemplazar por:

```js
  if (!filtered.length) {
    list.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <i data-lucide="search-x" class="w-10 h-10 text-slate-300 mb-3"></i>
        <p class="font-bold text-slate-500 mb-1">Sin resultados</p>
        <p class="text-xs text-slate-400">Ninguna lección coincide con "<span class="font-medium">${escapeHtml(q)}</span>"</p>
      </div>`
    lucide.createIcons()
    return
  }
```

- [ ] **Step 3: Verificar en el navegador**

Para probar el empty state principal: temporalmente borrar todas las lecciones o probar con una categoría vacía. Verificar que aparece el icono, los textos y el botón "Crear primera lección".

Para probar el empty state de búsqueda: escribir un término que no existe en el buscador y verificar que aparece el ícono search-x con el término buscado resaltado.

- [ ] **Step 4: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): empty states con CTA en lista de lecciones mejoran UX de primera vez"
```

---

## Task 5: aria-live en toasts para accesibilidad

**Archivo:** `js/admin.js` — función `showToast`

Los toasts actuales no son anunciados por lectores de pantalla porque no tienen `aria-live`.

- [ ] **Step 1: Agregar aria-live al toast**

Localizar la función `showToast`:

```js
function showToast(msg, type = 'success') {
  const t = document.createElement('div')
  t.className = `fixed bottom-4 right-4 z-[100] px-4 py-3 rounded-xl text-sm font-medium shadow-lg text-white ${
    type === 'error' ? 'bg-red-500' : 'bg-emerald-500'
  }`
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 3000)
}
```

Reemplazar por:

```js
function showToast(msg, type = 'success') {
  const t = document.createElement('div')
  t.className = `fixed bottom-4 right-4 z-[100] px-4 py-3 rounded-xl text-sm font-medium shadow-lg text-white transition-opacity ${
    type === 'error' ? 'bg-red-500' : 'bg-emerald-500'
  }`
  t.setAttribute('role', 'status')
  t.setAttribute('aria-live', 'polite')
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 3000)
}
```

- [ ] **Step 2: Verificar en el navegador**

Guardar una lección y verificar que el toast verde aparece. Inspeccionar el elemento en DevTools y confirmar que tiene `role="status"` y `aria-live="polite"`.

- [ ] **Step 3: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): aria-live en toasts para anuncio a lectores de pantalla"
```

---

## Self-Review

**Spec coverage:**
- [x] Loading state en "Guardar lección" → Task 1 Step 1
- [x] Loading state en saveTerm → Task 1 Step 2
- [x] Loading state en saveSug → Task 1 Step 3
- [x] aria-label en lección cards → Task 2 Step 1
- [x] Mensaje de confirmación mejorado → Task 2 Step 2
- [x] aria-label en categorías → Task 2 Step 3
- [x] aria-label en glosario → Task 2 Step 4
- [x] aria-label en sugerencias → Task 2 Step 5
- [x] aria-label en bloques → Task 2 Step 6
- [x] aria-label en preguntas → Task 2 Step 7
- [x] fileIcon retorna Lucide → Task 3 Step 1
- [x] Wrappers de grid ajustados → Task 3 Steps 2-3
- [x] lucide.createIcons() en todos los puntos de render → Task 3 Steps 4-7
- [x] Empty state de no-lecciones con CTA → Task 4 Step 1
- [x] Empty state de búsqueda sin resultados → Task 4 Step 2
- [x] aria-live en toasts → Task 5

**No hay placeholders.** Cada paso tiene el código exacto a reemplazar.
