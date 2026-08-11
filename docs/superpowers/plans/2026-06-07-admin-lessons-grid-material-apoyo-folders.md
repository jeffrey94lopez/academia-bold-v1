# Admin: Grid lecciones, Material de apoyo, Carpetas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar toggle grid/lista en lecciones, panel CRUD de Material de apoyo en admin, y navegación por carpetas en la Biblioteca de archivos.

**Architecture:** Tres features independientes, todas en `js/admin.js` con cambios menores en `js/upload.js` y `admin.html`. Material de apoyo es un nuevo panel separado (nav + panel div). Carpetas usan rutas con prefijo en Supabase Storage — `listFiles` pasa a aceptar `path=''` y retorna `{folders, files}`.

**Tech Stack:** Vanilla JS ES modules, Tailwind CSS CDN, Lucide Icons (global `window.lucide`), Supabase JS client v2, Supabase Storage.

---

## Files

- Modify: `admin.html` — nuevo nav item + panel div para Material de apoyo
- Modify: `js/upload.js` — `listFiles(path='')` retorna `{folders,files}`, nuevo `createFolder()`, `uploadFile` acepta `targetFolder`
- Modify: `js/admin.js` — todas las demás tareas

---

## Task 1: Toggle grid/lista en panel de lecciones

**Files:**
- Modify: `js/admin.js`

El panel de lecciones actualmente solo tiene vista lista (tarjetas de ancho completo). Se agrega toggle para vista cuadrícula (2-3 columnas con tarjetas compactas).

- [ ] **Step 1: Agregar variable de módulo**

En `admin.js`, después de `let _materialCurrentFiles = []` (línea ~16), agregar:

```js
let lessonListView = localStorage.getItem('admin_lesson_list_view') || 'list'
```

- [ ] **Step 2: Reemplazar el bloque de búsqueda en renderLessonsPanel**

En `renderLessonsPanel`, localizar el div con `<div class="relative mb-4">` que contiene el input de búsqueda:

```js
    <div class="relative mb-4">
      <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"></i>
      <input id="lessonSearch" type="text" placeholder="Buscar lección..."
        class="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129] bg-white">
    </div>
```

Reemplazar por:

```js
    <div class="flex items-center gap-3 mb-4">
      <div class="relative flex-1">
        <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"></i>
        <input id="lessonSearch" type="text" placeholder="Buscar lección..."
          class="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129] bg-white">
      </div>
      <div class="flex gap-0.5 border border-slate-200 rounded-lg p-0.5 shrink-0">
        <button id="lessonViewList" class="p-1.5 rounded-md transition-colors ${lessonListView === 'list' ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600'}" aria-label="Vista lista">
          <i data-lucide="list" class="w-4 h-4"></i>
        </button>
        <button id="lessonViewGrid" class="p-1.5 rounded-md transition-colors ${lessonListView === 'grid' ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600'}" aria-label="Vista cuadrícula">
          <i data-lucide="grid-3x3" class="w-4 h-4"></i>
        </button>
      </div>
    </div>
```

- [ ] **Step 3: Agregar lessonCardGridHtml**

Agregar esta función DESPUÉS de `lessonCardHtml`:

```js
function lessonCardGridHtml(l) {
  const cat = currentCategories.find(c => c.nombre === l.categoria)
  return `
    <div class="lesson-card bg-white rounded-xl border border-slate-100 p-3.5 cursor-pointer hover:border-[#E92129] hover:shadow-sm transition-all flex flex-col gap-2" data-id="${l.id}">
      <div class="flex items-start justify-between gap-2">
        <p class="font-bold text-sm text-slate-800 leading-tight line-clamp-2 flex-1">${escapeHtml(l.titulo)}</p>
        <span class="shrink-0 text-[10px] text-slate-400 font-bold">#${escapeHtml(String(l.orden))}</span>
      </div>
      ${l.descripcion ? `<p class="text-xs text-slate-400 line-clamp-2">${escapeHtml(l.descripcion)}</p>` : ''}
      ${cat ? `<span class="self-start text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">${escapeHtml(cat.emoji)} ${escapeHtml(cat.nombre)}</span>` : ''}
      <div class="flex gap-1 mt-auto pt-2 border-t border-slate-50">
        <button data-id="${l.id}" class="copy-whatsapp flex-1 flex items-center justify-center py-1 rounded-lg hover:bg-green-50 text-slate-400 hover:text-green-600" aria-label="Copiar ${escapeHtml(l.titulo)} para WhatsApp">
          <i data-lucide="share-2" class="w-3.5 h-3.5"></i>
        </button>
        <button data-id="${l.id}" data-titulo="${escapeHtml(l.titulo)}" class="del-lesson flex-1 flex items-center justify-center py-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500" aria-label="Eliminar lección ${escapeHtml(l.titulo)}">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>`
}
```

- [ ] **Step 4: Actualizar renderGroupedLessons para usar ambas vistas**

En `renderGroupedLessons`, localizar la rama `if (q)` para búsqueda y la renderización por categorías. Aplicar estos cambios:

**Rama de búsqueda** — reemplazar:
```js
  if (q) {
    list.innerHTML = filtered.map(l => lessonCardHtml(l)).join('')
```
Por:
```js
  if (q) {
    list.innerHTML = lessonListView === 'grid'
      ? `<div class="grid grid-cols-2 lg:grid-cols-3 gap-3">${filtered.map(l => lessonCardGridHtml(l)).join('')}</div>`
      : filtered.map(l => lessonCardHtml(l)).join('')
```

**Rama de categorías** — en el bucle `for (const cat of currentCategories)`, reemplazar:
```js
        ${catLessons.length
          ? catLessons.map(l => lessonCardHtml(l)).join('')
          : '<p class="text-xs text-slate-400 pl-1 pb-2">Sin lecciones.</p>'}
```
Por:
```js
        ${catLessons.length
          ? lessonListView === 'grid'
            ? `<div class="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">${catLessons.map(l => lessonCardGridHtml(l)).join('')}</div>`
            : catLessons.map(l => lessonCardHtml(l)).join('')
          : '<p class="text-xs text-slate-400 pl-1 pb-2">Sin lecciones.</p>'}
```

**Bloque de sin categoría** — reemplazar:
```js
        ${uncategorized.map(l => lessonCardHtml(l)).join('')}
```
Por:
```js
        ${lessonListView === 'grid'
          ? `<div class="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">${uncategorized.map(l => lessonCardGridHtml(l)).join('')}</div>`
          : uncategorized.map(l => lessonCardHtml(l)).join('')}
```

- [ ] **Step 5: Agregar event listeners de toggle en renderLessonsPanel**

En `renderLessonsPanel`, después de los listeners de `lessonTitulo` y `lessonDescripcion` y ANTES del listener de `togglePreview`, agregar:

```js
  document.getElementById('lessonViewList').addEventListener('click', () => {
    lessonListView = 'list'
    localStorage.setItem('admin_lesson_list_view', 'list')
    document.getElementById('lessonViewList').className = 'p-1.5 rounded-md transition-colors bg-slate-100 text-slate-700'
    document.getElementById('lessonViewGrid').className = 'p-1.5 rounded-md transition-colors text-slate-400 hover:text-slate-600'
    renderGroupedLessons(allLessons, document.getElementById('lessonSearch')?.value || '')
  })
  document.getElementById('lessonViewGrid').addEventListener('click', () => {
    lessonListView = 'grid'
    localStorage.setItem('admin_lesson_list_view', 'grid')
    document.getElementById('lessonViewList').className = 'p-1.5 rounded-md transition-colors text-slate-400 hover:text-slate-600'
    document.getElementById('lessonViewGrid').className = 'p-1.5 rounded-md transition-colors bg-slate-100 text-slate-700'
    renderGroupedLessons(allLessons, document.getElementById('lessonSearch')?.value || '')
  })
```

- [ ] **Step 6: Verificar manualmente**

Abrir el panel de lecciones. Verificar:
- Botones lista/cuadrícula aparecen junto al buscador
- Vista cuadrícula muestra tarjetas en 2-3 columnas con título, descripción, categoría y botones de acción
- Vista lista muestra las tarjetas originales de ancho completo
- Buscar: la vista activa permanece
- Recargar: el modo persiste (localStorage)
- Los botones edit/delete/whatsapp funcionan en ambas vistas

- [ ] **Step 7: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): toggle grid/lista en panel de lecciones con persistencia"
```

---

## Task 2: Panel "Material de apoyo" en admin

**Files:**
- Modify: `admin.html`
- Modify: `js/admin.js`

Agrega un nuevo panel en el nav del admin para gestionar la tabla `material_apoyo` de Supabase. Los campos son `titulo`, `url`, `tipo` (pdf/link/video).

- [ ] **Step 1: Agregar nav button y panel div en admin.html**

En `admin.html`, localizar el botón de Sugerencias Bot:
```html
        <button data-panel="suggestions" class="admin-nav w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50">
          <i data-lucide="message-square" class="w-4 h-4"></i> Sugerencias Bot
        </button>
```

Agregar ANTES de él:
```html
        <button data-panel="material-apoyo" class="admin-nav w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50">
          <i data-lucide="link" class="w-4 h-4"></i> Mat. de apoyo
        </button>
```

Y agregar el div del panel junto a los demás paneles (después de `<div id="panel-material" class="hidden">`):
```html
        <div id="panel-material-apoyo" class="hidden"></div>
```

- [ ] **Step 2: Agregar case en switchPanel**

En `admin.js`, en la función `switchPanel`, después de `if (panel === 'material') renderMaterialPanel()`, agregar:

```js
  if (panel === 'material-apoyo') renderMaterialApoyoPanel()
```

- [ ] **Step 3: Implementar renderMaterialApoyoPanel**

Agregar esta función ANTES de `renderSuggestionsPanel`:

```js
async function renderMaterialApoyoPanel() {
  const el = document.getElementById('panel-material-apoyo')
  const { data } = await supabase.from('material_apoyo').select('*').order('titulo')

  const iconMap = { pdf: 'file-text', link: 'link', video: 'play-circle' }
  const colorMap = { pdf: 'text-red-500', link: 'text-blue-500', video: 'text-purple-500' }

  el.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-black">Material de apoyo</h2>
        <p class="text-xs text-slate-400 mt-0.5">Recursos visibles para los usuarios en la sección Recursos.</p>
      </div>
      <button id="addMatApoyo" class="bg-[#E92129] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:scale-105 transition-transform">
        <i data-lucide="plus" class="w-3.5 h-3.5"></i> Nuevo recurso
      </button>
    </div>
    <div class="space-y-2">
      ${(data || []).map(m => `
        <div class="bg-white rounded-xl border border-slate-100 p-3 flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
            <i data-lucide="${iconMap[m.tipo] || 'file'}" class="w-5 h-5 ${colorMap[m.tipo] || 'text-slate-500'}"></i>
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-bold text-sm truncate">${escapeHtml(m.titulo)}</p>
            <p class="text-xs text-slate-400 uppercase font-bold">${escapeHtml(m.tipo)}</p>
          </div>
          <div class="flex gap-1 shrink-0">
            <button data-id="${m.id}" data-titulo="${escapeHtml(m.titulo)}" data-url="${escapeHtml(m.url)}" data-tipo="${escapeHtml(m.tipo)}"
              class="edit-mat-apoyo p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Editar ${escapeHtml(m.titulo)}">
              <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
            <button data-id="${m.id}" data-titulo="${escapeHtml(m.titulo)}"
              class="del-mat-apoyo p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-500" aria-label="Eliminar ${escapeHtml(m.titulo)}">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `).join('') || '<p class="text-slate-400 text-sm py-4">No hay recursos. Crea el primero.</p>'}
    </div>
    <div id="matApoyoForm" class="hidden mt-4 bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <input type="hidden" id="matApoyoId">
      <input id="matApoyoTitulo" placeholder="Título del recurso" autocomplete="off"
        class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
      <div class="flex gap-2">
        <input id="matApoyoUrl" placeholder="URL o enlace al recurso" autocomplete="off"
          class="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
        <button id="matApoyoPickLib" type="button"
          class="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50 shrink-0 flex items-center gap-1.5">
          <i data-lucide="folder-open" class="w-3.5 h-3.5"></i> Biblioteca
        </button>
      </div>
      <select id="matApoyoTipo" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129] bg-white">
        <option value="link">🔗 Link / Enlace web</option>
        <option value="pdf">📄 PDF / Documento</option>
        <option value="video">▶️ Video</option>
      </select>
      <p id="matApoyoError" class="hidden text-red-500 text-xs"></p>
      <div class="flex gap-2">
        <button id="cancelMatApoyo" class="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-500">Cancelar</button>
        <button id="saveMatApoyo" class="flex-1 py-2 rounded-xl bg-[#E92129] text-white text-sm font-bold">Guardar</button>
      </div>
    </div>
  `
  lucide.createIcons()

  const showForm = () => document.getElementById('matApoyoForm').classList.remove('hidden')
  const hideForm = () => document.getElementById('matApoyoForm').classList.add('hidden')

  document.getElementById('addMatApoyo').addEventListener('click', () => {
    document.getElementById('matApoyoId').value = ''
    document.getElementById('matApoyoTitulo').value = ''
    document.getElementById('matApoyoUrl').value = ''
    document.getElementById('matApoyoTipo').value = 'link'
    document.getElementById('matApoyoError').classList.add('hidden')
    showForm()
    document.getElementById('matApoyoTitulo').focus()
  })

  document.querySelectorAll('.edit-mat-apoyo').forEach(b => b.addEventListener('click', () => {
    document.getElementById('matApoyoId').value = b.dataset.id
    document.getElementById('matApoyoTitulo').value = b.dataset.titulo
    document.getElementById('matApoyoUrl').value = b.dataset.url
    document.getElementById('matApoyoTipo').value = b.dataset.tipo
    document.getElementById('matApoyoError').classList.add('hidden')
    showForm()
  }))

  document.querySelectorAll('.del-mat-apoyo').forEach(b => b.addEventListener('click', async () => {
    if (!confirm(`¿Eliminar "${b.dataset.titulo}"?`)) return
    await supabase.from('material_apoyo').delete().eq('id', b.dataset.id)
    renderMaterialApoyoPanel()
  }))

  document.getElementById('cancelMatApoyo').addEventListener('click', hideForm)

  document.getElementById('matApoyoPickLib').addEventListener('click', () => {
    openMediaLibrary(url => {
      document.getElementById('matApoyoUrl').value = url
    })
  })

  document.getElementById('saveMatApoyo').addEventListener('click', async () => {
    const id = document.getElementById('matApoyoId').value
    const titulo = document.getElementById('matApoyoTitulo').value.trim()
    const url = document.getElementById('matApoyoUrl').value.trim()
    const tipo = document.getElementById('matApoyoTipo').value
    const errorEl = document.getElementById('matApoyoError')

    if (!titulo || !url) {
      errorEl.textContent = 'Completa el título y la URL.'
      errorEl.classList.remove('hidden')
      return
    }

    const btn = document.getElementById('saveMatApoyo')
    btn.disabled = true
    btn.textContent = 'Guardando...'
    const { error } = id
      ? await supabase.from('material_apoyo').update({ titulo, url, tipo }).eq('id', id)
      : await supabase.from('material_apoyo').insert({ titulo, url, tipo })
    if (error) {
      errorEl.textContent = 'Error al guardar: ' + error.message
      errorEl.classList.remove('hidden')
      btn.disabled = false
      btn.textContent = 'Guardar'
      return
    }
    renderMaterialApoyoPanel()
  })
}
```

- [ ] **Step 4: Verificar manualmente**

Navegar al panel "Mat. de apoyo" en el admin. Verificar:
- Lista de recursos con ícono según tipo (link/pdf/video)
- Botón "Nuevo recurso" abre el formulario
- Formulario con título, URL, botón Biblioteca (abre media library), selector de tipo
- Guardar crea el registro en Supabase tabla `material_apoyo`
- Editar precarga el formulario con los datos
- Eliminar pide confirmación y borra el registro
- En la app del usuario (index.html → Recursos → Material de apoyo), el recurso aparece con el tipo correcto

- [ ] **Step 5: Commit**

```bash
git add admin.html js/admin.js
git commit -m "feat(admin): panel CRUD para Material de apoyo con picker de biblioteca"
```

---

## Task 3: Carpetas en Biblioteca de archivos

**Files:**
- Modify: `js/upload.js`
- Modify: `js/admin.js`

Agrega navegación por carpetas en el panel Material del admin. Las carpetas usan prefijos de ruta en Supabase Storage (`carpeta/archivo.jpg`). Al crear una carpeta se sube un `.emptyFolderPlaceholder`.

- [ ] **Step 1: Actualizar listFiles en upload.js**

Reemplazar la función `listFiles` completa por:

```js
export async function listFiles(path = '') {
  const { data, error } = await supabase.storage.from(BUCKET).list(path || '', {
    limit: 200,
    sortBy: { column: 'created_at', order: 'desc' },
  })
  if (error) throw error

  const items = data || []

  const folders = items
    .filter(f => f.id === null)
    .map(f => ({ name: f.name, isFolder: true }))

  const files = items
    .filter(f => f.id !== null && f.name !== '.emptyFolderPlaceholder')
    .map(f => {
      const fullPath = path ? `${path}/${f.name}` : f.name
      return {
        name: fullPath,
        size: f.metadata?.size || 0,
        type: f.metadata?.mimetype || '',
        url: supabase.storage.from(BUCKET).getPublicUrl(fullPath).data.publicUrl,
      }
    })

  return { folders, files }
}
```

- [ ] **Step 2: Agregar createFolder y actualizar uploadFile en upload.js**

Agregar DESPUÉS de `listFiles`:

```js
export async function createFolder(folderPath) {
  const placeholder = `${folderPath}/.emptyFolderPlaceholder`
  const { error } = await supabase.storage.from(BUCKET).upload(placeholder, new Blob(['']), { upsert: true })
  if (error) throw error
}
```

Actualizar `uploadFile` para aceptar carpeta destino. Localizar la línea:
```js
export async function uploadFile(file, onProgress) {
```

Reemplazar por:
```js
export async function uploadFile(file, onProgress, targetFolder = '') {
```

Y localizar la construcción del path:
```js
  const path = `${base || 'archivo'}-${Date.now()}${ext}`
```

Reemplazar por:
```js
  const filename = `${base || 'archivo'}-${Date.now()}${ext}`
  const path = targetFolder ? `${targetFolder}/${filename}` : filename
```

Y la variable `path` en el `upload` ya es correcta porque fue redeclarada.

NOTA: Dentro de `uploadFile` la variable se llamaba `path`, ahora se llama `filename` y `path`. Verifica que la llamada a `supabase.storage.from(BUCKET).upload(path, file, {...})` use `path` (el nuevo, con carpeta).

- [ ] **Step 3: Corregir renameFile para preservar carpeta**

En `renameFile`, la ruta de destino actualmente ignora la carpeta de origen. Localizar:

```js
  const newPath = `${base}-${Date.now()}${ext}`
```

Reemplazar por:

```js
  const lastSlash = oldPath.lastIndexOf('/')
  const folder = lastSlash >= 0 ? oldPath.slice(0, lastSlash) : ''
  const newPath = folder ? `${folder}/${base}-${Date.now()}${ext}` : `${base}-${Date.now()}${ext}`
```

- [ ] **Step 4: Actualizar imports en admin.js**

Localizar:
```js
import { uploadFile, listFiles, deleteFile, renameFile } from './upload.js'
```

Reemplazar por:
```js
import { uploadFile, listFiles, deleteFile, renameFile, createFolder } from './upload.js'
```

- [ ] **Step 5: Agregar variables de módulo de carpeta en admin.js**

Después de `let lessonListView = ...`, agregar:

```js
let currentFolderPath = ''
```

- [ ] **Step 6: Actualizar renderMaterialPanel para soporte de carpetas**

En `renderMaterialPanel`, reemplazar el HTML del panel completo. El panel necesita: breadcrumb, botón "Nueva carpeta", y el dropzone/búsqueda existentes.

Localizar el inicio del template `el.innerHTML = \`` en `renderMaterialPanel` y reemplazar TODO el bloque hasta el cierre del template con:

```js
  el.innerHTML = `
    <div class="max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-black">Biblioteca de archivos</h2>
        <button id="newFolderBtn" class="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50">
          <i data-lucide="folder-plus" class="w-3.5 h-3.5"></i> Nueva carpeta
        </button>
      </div>

      <div id="folderBreadcrumb" class="flex items-center gap-1 mb-3 flex-wrap min-h-[24px]"></div>

      <div id="newFolderForm" class="hidden bg-white border border-slate-200 rounded-xl p-3 mb-4 flex items-center gap-2">
        <i data-lucide="folder" class="w-4 h-4 text-slate-400 shrink-0"></i>
        <input id="newFolderInput" type="text" placeholder="Nombre de la carpeta" autocomplete="off"
          class="flex-1 px-2 py-1 rounded-lg border border-slate-200 text-sm outline-none focus:border-[#E92129]">
        <button id="cancelNewFolder" class="px-3 py-1 rounded-lg border border-slate-200 text-xs font-bold text-slate-500 hover:bg-slate-50">Cancelar</button>
        <button id="confirmNewFolder" class="px-3 py-1 rounded-lg bg-[#E92129] text-white text-xs font-bold">Crear</button>
      </div>

      <div id="materialDropzone" class="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center mb-6 hover:border-[#E92129] transition-colors cursor-pointer">
        <i data-lucide="folder-open" class="w-10 h-10 text-slate-300 mx-auto mb-3 block"></i>
        <p class="text-slate-400 text-sm mb-3">Arrastra archivos aquí o</p>
        <button id="materialPickFile" class="px-4 py-2 bg-[#E92129] text-white text-sm rounded-lg font-bold flex items-center gap-1.5 mx-auto"><i data-lucide="upload" class="w-4 h-4"></i> Buscar archivo</button>
        <p class="text-xs text-slate-400 mt-2">Cualquier tipo · Máx. 50MB</p>
        <div id="materialProgress" class="hidden mt-4">
          <div class="h-1.5 bg-slate-200 rounded-full overflow-hidden max-w-xs mx-auto">
            <div id="materialProgressBar" class="h-full bg-[#E92129] transition-all" style="width:0%"></div>
          </div>
          <p class="text-xs text-slate-400 mt-1">Subiendo...</p>
        </div>
      </div>

      <div class="flex items-center gap-3 mb-4">
        <input id="materialSearch" type="text" placeholder="🔍 Buscar archivos..."
          class="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#E92129]">
        <span id="materialFileCount" class="text-xs text-slate-400 shrink-0"></span>
        <div class="flex gap-0.5 border border-slate-200 rounded-lg p-0.5 shrink-0">
          <button id="viewGrid" class="p-1.5 rounded-md transition-colors ${_materialView === 'grid' ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600'}" aria-label="Vista cuadrícula">
            <i data-lucide="grid-3x3" class="w-4 h-4"></i>
          </button>
          <button id="viewList" class="p-1.5 rounded-md transition-colors ${_materialView === 'list' ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600'}" aria-label="Vista lista">
            <i data-lucide="list" class="w-4 h-4"></i>
          </button>
        </div>
      </div>

      <div id="materialGrid" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
        <p class="col-span-5 text-center text-slate-400 text-sm py-12">Cargando archivos...</p>
      </div>
    </div>
  `
```

NOTA: El toggle `_materialView` es la misma variable `materialView` que ya existe. Si la variable se llama `materialView` en el código, usa `materialView` en las interpolaciones del template. Verifica el nombre real en el módulo y usa el correcto.

- [ ] **Step 7: Agregar renderFolderBreadcrumb y lógica de carpetas en renderMaterialPanel**

Agregar esta función ANTES de `renderMaterialPanel`:

```js
function renderFolderBreadcrumb() {
  const container = document.getElementById('folderBreadcrumb')
  if (!container) return
  const parts = currentFolderPath ? currentFolderPath.split('/') : []
  const crumbs = [
    { label: 'Todos los archivos', path: '' },
    ...parts.map((p, i) => ({ label: p, path: parts.slice(0, i + 1).join('/') }))
  ]
  container.innerHTML = crumbs.map((c, i) => {
    const isLast = i === crumbs.length - 1
    if (isLast) return `<span class="text-slate-700 font-bold text-sm">${escapeHtml(c.label)}</span>`
    return `<button class="folder-crumb text-[#E92129] hover:underline text-sm font-bold" data-path="${escapeHtml(c.path)}">${escapeHtml(c.label)}</button><span class="text-slate-300 text-sm">/</span>`
  }).join('')

  container.querySelectorAll('.folder-crumb').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFolderPath = btn.dataset.path
      renderMaterialPanel()
    })
  })
}
```

Dentro de `renderMaterialPanel`, DESPUÉS de `lucide.createIcons()` y ANTES de `let files = []`, agregar:

```js
  renderFolderBreadcrumb()
```

- [ ] **Step 8: Actualizar loadFiles para pasar currentFolderPath y manejar folders**

Dentro de `renderMaterialPanel`, reemplazar la función `loadFiles`:

```js
  let files = []
  let currentFiles = []
  let currentFolders = []
```

Reemplazar `loadFiles` por:

```js
  const loadFiles = async () => {
    const grid = document.getElementById('materialGrid')
    if (!grid) return
    grid.innerHTML = '<p class="col-span-5 text-center text-slate-400 text-sm py-12">Cargando...</p>'
    try {
      const result = await listFiles(currentFolderPath)
      files = result.files
      currentFolders = result.folders
      _materialCurrentFiles = files
      renderMaterialGrid(files, currentFolders)
    } catch {
      grid.innerHTML = `<p class="col-span-5 text-center text-red-400 text-sm py-12">Error al cargar. <button onclick="renderMaterialPanel()" class="underline">Reintentar</button></p>`
    }
  }
```

NOTA: Busca la declaración actual de `let files = []` y `let currentFiles = []` en `renderMaterialPanel` y reemplaza por `let files = [], currentFiles = [], currentFolders = []`. La variable `_materialCurrentFiles` ya es de módulo.

- [ ] **Step 9: Actualizar el handler materialSearch para preservar folders**

Reemplazar el handler de `materialSearch`:

```js
  document.getElementById('materialSearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase()
    const filtered = files.filter(f => {
      const name = f.name.split('/').pop()
      return name.toLowerCase().includes(q)
    })
    _materialCurrentFiles = filtered
    renderMaterialGrid(filtered, q ? [] : currentFolders)
  })
```

- [ ] **Step 10: Agregar handlers de carpeta (nueva carpeta, toggles, upload) en renderMaterialPanel**

Después del handler de `materialSearch`, agregar:

```js
  document.getElementById('newFolderBtn').addEventListener('click', () => {
    document.getElementById('newFolderForm').classList.remove('hidden')
    document.getElementById('newFolderInput').value = ''
    document.getElementById('newFolderInput').focus()
  })

  document.getElementById('cancelNewFolder').addEventListener('click', () => {
    document.getElementById('newFolderForm').classList.add('hidden')
  })

  document.getElementById('confirmNewFolder').addEventListener('click', async () => {
    const raw = document.getElementById('newFolderInput').value.trim()
    if (!raw) return
    const name = raw.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase() || 'carpeta'
    const folderPath = currentFolderPath ? `${currentFolderPath}/${name}` : name
    const btn = document.getElementById('confirmNewFolder')
    btn.disabled = true
    btn.textContent = 'Creando...'
    try {
      await createFolder(folderPath)
      document.getElementById('newFolderForm').classList.add('hidden')
      showToast(`Carpeta "${name}" creada`)
      await loadFiles()
    } catch (e) {
      showToast('Error al crear carpeta: ' + e.message, 'error')
      btn.disabled = false
      btn.textContent = 'Crear'
    }
  })

  document.getElementById('newFolderInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('confirmNewFolder').click()
    if (e.key === 'Escape') document.getElementById('cancelNewFolder').click()
  })
```

También actualizar el toggle de `#viewGrid` y `#viewList` para usar `currentFolders`:

```js
  document.getElementById('viewGrid').addEventListener('click', () => {
    materialView = 'grid'
    localStorage.setItem('admin_material_view', 'grid')
    document.getElementById('viewGrid').className = 'p-1.5 rounded-md transition-colors bg-slate-100 text-slate-700'
    document.getElementById('viewList').className = 'p-1.5 rounded-md transition-colors text-slate-400 hover:text-slate-600'
    renderMaterialGrid(_materialCurrentFiles, currentFolders)
  })

  document.getElementById('viewList').addEventListener('click', () => {
    materialView = 'list'
    localStorage.setItem('admin_material_view', 'list')
    document.getElementById('viewGrid').className = 'p-1.5 rounded-md transition-colors text-slate-400 hover:text-slate-600'
    document.getElementById('viewList').className = 'p-1.5 rounded-md transition-colors bg-slate-100 text-slate-700'
    renderMaterialGrid(_materialCurrentFiles, currentFolders)
  })
```

Actualizar el `doUpload` para pasar `currentFolderPath`:

```js
  const doUpload = async (file) => {
    progressDiv.classList.remove('hidden')
    progressBar.style.width = '0%'
    try {
      await uploadFile(file, pct => { progressBar.style.width = pct + '%' }, currentFolderPath)
      showToast('Archivo subido correctamente')
      await loadFiles()
    } catch (e) {
      showToast(e.message || 'Error al subir archivo', 'error')
    } finally {
      progressDiv.classList.add('hidden')
    }
  }
```

- [ ] **Step 11: Actualizar renderMaterialGrid para mostrar carpetas**

La firma de `renderMaterialGrid` cambia a `renderMaterialGrid(files, folders = [])`.

Reemplazar la función completa `renderMaterialGrid`:

```js
function renderMaterialGrid(files, folders = []) {
  const grid = document.getElementById('materialGrid')
  const count = document.getElementById('materialFileCount')
  if (!grid) return
  if (count) count.textContent = `${folders.length + files.length} elementos`

  if (!folders.length && !files.length) {
    grid.className = ''
    grid.innerHTML = '<p class="text-center text-slate-400 text-sm py-12">No hay archivos subidos aún</p>'
    return
  }

  const folderCards = folders.map(f => {
    const folderPath = currentFolderPath ? `${currentFolderPath}/${f.name}` : f.name
    return `
      <div class="folder-card group bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:border-amber-300 hover:bg-amber-100 transition-colors" data-path="${escapeHtml(folderPath)}">
        <i data-lucide="folder" class="w-8 h-8 text-amber-400 shrink-0"></i>
        <p class="text-sm font-bold text-slate-700 truncate flex-1">${escapeHtml(f.name)}</p>
        <i data-lucide="chevron-right" class="w-4 h-4 text-slate-300 shrink-0"></i>
      </div>`
  }).join('')

  if (materialView === 'list') {
    grid.className = 'space-y-2'
    grid.innerHTML = folderCards + files.map(f => `
      <div class="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-3 py-2.5 hover:border-slate-200 transition-colors group">
        <div class="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg overflow-hidden bg-slate-50">
          ${f.type.startsWith('image/')
            ? `<img src="${escapeHtml(f.url)}" alt="" class="w-10 h-10 object-cover" loading="lazy">`
            : fileIcon(f.type)}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-slate-700 truncate" title="${escapeHtml(displayName(f.name.split('/').pop()))}">${escapeHtml(displayName(f.name.split('/').pop()))}</p>
          <p class="text-xs text-slate-400">${formatBytes(f.size)}</p>
        </div>
        <div class="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button class="preview-file p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-500"
            data-url="${escapeHtml(f.url)}" data-type="${escapeHtml(f.type)}" data-name="${escapeHtml(f.name)}" aria-label="Ver ${escapeHtml(displayName(f.name.split('/').pop()))}">
            <i data-lucide="eye" class="w-4 h-4"></i>
          </button>
          <button class="rename-file p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-500"
            data-path="${escapeHtml(f.name)}" data-display="${escapeHtml(displayName(f.name.split('/').pop()))}" aria-label="Renombrar ${escapeHtml(displayName(f.name.split('/').pop()))}">
            <i data-lucide="pencil" class="w-4 h-4"></i>
          </button>
          <button class="copy-url p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            data-url="${escapeHtml(f.url)}" data-name="${escapeHtml(f.name)}" aria-label="Copiar URL">
            <i data-lucide="link" class="w-4 h-4"></i>
          </button>
          <button class="delete-file p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"
            data-path="${escapeHtml(f.name)}" aria-label="Eliminar ${escapeHtml(displayName(f.name.split('/').pop()))}">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `).join('')
  } else {
    grid.className = 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3'
    const folderGrid = folders.map(f => {
      const folderPath = currentFolderPath ? `${currentFolderPath}/${f.name}` : f.name
      return `
        <div class="folder-card group bg-amber-50 border border-amber-100 rounded-xl p-3 text-center cursor-pointer hover:border-amber-300 hover:bg-amber-100 transition-colors" data-path="${escapeHtml(folderPath)}">
          <div class="flex justify-center mb-2"><i data-lucide="folder" class="w-10 h-10 text-amber-400"></i></div>
          <p class="text-xs text-slate-700 truncate font-bold" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</p>
        </div>`
    }).join('')
    grid.innerHTML = folderGrid + files.map(f => `
      <div class="group relative bg-white border border-slate-100 rounded-xl p-3 text-center shadow-sm hover:shadow-md transition-shadow">
        ${f.type.startsWith('image/')
          ? `<img src="${escapeHtml(f.url)}" alt="" class="w-full h-16 object-cover rounded-lg mb-2" loading="lazy">`
          : `<div class="flex justify-center mb-2">${fileIcon(f.type)}</div>`}
        <p class="text-xs text-slate-700 truncate font-medium" title="${escapeHtml(displayName(f.name.split('/').pop()))}">${escapeHtml(displayName(f.name.split('/').pop()))}</p>
        <p class="text-xs text-slate-400">${formatBytes(f.size)}</p>
        <div class="absolute inset-0 bg-black/60 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
          <button class="preview-file bg-blue-500 text-white rounded-lg p-1.5"
            data-url="${escapeHtml(f.url)}" data-type="${escapeHtml(f.type)}" data-name="${escapeHtml(f.name)}" aria-label="Ver ${escapeHtml(displayName(f.name.split('/').pop()))}">
            <i data-lucide="eye" class="w-3.5 h-3.5"></i>
          </button>
          <button class="rename-file bg-amber-500 text-white rounded-lg p-1.5"
            data-path="${escapeHtml(f.name)}" data-display="${escapeHtml(displayName(f.name.split('/').pop()))}" aria-label="Renombrar ${escapeHtml(displayName(f.name.split('/').pop()))}">
            <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
          </button>
          <button class="copy-url bg-slate-600 text-white rounded-lg p-1.5"
            data-url="${escapeHtml(f.url)}" data-name="${escapeHtml(f.name)}" aria-label="Copiar URL">
            <i data-lucide="link" class="w-3.5 h-3.5"></i>
          </button>
          <button class="delete-file bg-red-500 text-white rounded-lg p-1.5"
            data-path="${escapeHtml(f.name)}" aria-label="Eliminar ${escapeHtml(displayName(f.name.split('/').pop()))}">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `).join('')
  }

  lucide.createIcons()

  grid.querySelectorAll('.folder-card').forEach(card => {
    card.addEventListener('click', () => {
      currentFolderPath = card.dataset.path
      renderMaterialPanel()
    })
  })

  grid.querySelectorAll('.preview-file').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      openFilePreview(btn.dataset.url, btn.dataset.type, btn.dataset.name)
    })
  })

  grid.querySelectorAll('.rename-file').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      openRenameModal(btn.dataset.path, btn.dataset.display)
    })
  })

  grid.querySelectorAll('.copy-url').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      navigator.clipboard.writeText(btn.dataset.url)
        .then(() => showToast(`URL de "${displayName(btn.dataset.name.split('/').pop())}" copiada`))
        .catch(() => showToast('No se pudo copiar al portapapeles', 'error'))
    })
  })

  grid.querySelectorAll('.delete-file').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation()
      const displayN = displayName(btn.dataset.path.split('/').pop())
      if (!confirm(`¿Eliminar "${displayN}"?\nEsta acción no se puede deshacer.`)) return
      try {
        await deleteFile(btn.dataset.path)
        showToast('Archivo eliminado')
        renderMaterialPanel()
      } catch {
        showToast('Error al eliminar el archivo', 'error')
      }
    })
  })
}
```

- [ ] **Step 12: Actualizar _renameReloadCallback en openRenameModal**

En `openRenameModal`, localizar el callback:

```js
  _renameReloadCallback = async () => {
    const updated = await listFiles()
    renderMaterialGrid(updated)
    _materialCurrentFiles = updated
  }
```

Reemplazar por:

```js
  _renameReloadCallback = async () => {
    renderMaterialPanel()
  }
```

- [ ] **Step 13: Actualizar openMediaLibrary para nueva firma de listFiles**

En `openMediaLibrary`, localizar:

```js
    files = await listFiles()
```

Reemplazar por:

```js
    const result = await listFiles('')
    files = result.files
```

- [ ] **Step 14: Verificar manualmente**

Abrir el panel Material. Verificar:
- Breadcrumb muestra "Todos los archivos" en root
- Botón "Nueva carpeta" abre formulario inline con input y botones Crear/Cancelar
- Crear una carpeta: aparece tarjeta amber con ícono de carpeta
- Hacer clic en carpeta: navega dentro (breadcrumb se actualiza)
- Breadcrumb es clickeable para volver a niveles anteriores
- Subir un archivo dentro de una carpeta: aparece en esa carpeta
- Los archivos existentes (sin carpeta) siguen apareciendo en root
- Renombrar un archivo en una subcarpeta: el archivo permanece en la misma carpeta (no se mueve a root)
- Vista lista y cuadrícula funcionan en subcarpetas

- [ ] **Step 15: Commit**

```bash
git add js/upload.js js/admin.js
git commit -m "feat(admin): navegación por carpetas en Biblioteca de archivos con Supabase Storage"
```

---

## Self-Review

**Spec coverage:**
- [x] Toggle grid/lista en lecciones → Task 1
- [x] Vista cuadrícula con tarjetas compactas en 2-3 columnas → Task 1 (lessonCardGridHtml)
- [x] Persistencia del modo en localStorage → Task 1 (lessonListView)
- [x] Panel Material de apoyo en admin → Task 2
- [x] CRUD completo (crear/editar/eliminar) → Task 2
- [x] Picker de biblioteca de medios para URL → Task 2 (matApoyoPickLib)
- [x] Tipo de recurso (pdf/link/video) → Task 2 (select)
- [x] Los recursos aparecen en la app del usuario → ya funciona (resources.js lee material_apoyo)
- [x] Carpetas en Biblioteca → Task 3
- [x] Crear carpeta con placeholder → Task 3 (createFolder)
- [x] Breadcrumb navegable → Task 3 (renderFolderBreadcrumb)
- [x] Upload dentro de carpeta activa → Task 3 (targetFolder param)
- [x] Renombrar preserva carpeta → Task 3 Step 3 (renameFile fix)
- [x] Folders visibles en grid y list view → Task 3 Step 11
- [x] Media library no afectada (sigue listando root) → Task 3 Step 13

**Dependencias entre tareas:**
- Task 1 es completamente independiente
- Task 2 es independiente (nuevo panel separado)
- Task 3 depende del estado actual de admin.js (no depende de Tasks 1 o 2, pero si se implementan en orden 1→2→3 se evitan conflictos de merge)

**Sin placeholders. Código completo en cada paso.**
