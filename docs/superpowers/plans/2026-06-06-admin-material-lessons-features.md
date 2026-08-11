# Admin Material & Lessons Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar 5 features al panel admin: toggle lista/cuadrícula en materiales, lightbox de preview, renombrar archivos, flechas ↑↓ en bloques de lección, y toggle de vista previa de lección.

**Architecture:** Todos los cambios en `js/admin.js` excepto `renameFile` que va en `js/upload.js`. Nuevas variables de estado a nivel de módulo (`materialView`, `lessonPreviewVisible`). Modales dinámicos creados via JavaScript y appended a `document.body`. Sin nuevos archivos HTML.

**Tech Stack:** Vanilla JS ES modules, Tailwind CSS CDN, Lucide Icons (global `window.lucide`), Supabase Storage JS client.

---

## Files

- Modify: `js/upload.js` — agregar `renameFile()` (Task 3)
- Modify: `js/admin.js` — todas las demás tareas

---

## Task 1: Toggle lista/cuadrícula en panel de materiales

**Files:**
- Modify: `js/admin.js`

El panel de materiales actualmente solo tiene vista cuadrícula. Se agrega un toggle para cambiar a vista lista, con persistencia en localStorage.

- [ ] **Step 1: Agregar variable de estado a nivel de módulo**

En `admin.js`, después de la línea `let currentCategories = []`, agregar:

```js
let materialView = localStorage.getItem('admin_material_view') || 'grid'
```

- [ ] **Step 2: Agregar botones de toggle al HTML del panel material**

En `renderMaterialPanel`, localizar el bloque de búsqueda:

```js
      <div class="flex items-center gap-3 mb-4">
        <input id="materialSearch" type="text" placeholder="🔍 Buscar archivos..."
          class="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#E92129]">
        <span id="materialFileCount" class="text-xs text-slate-400 shrink-0"></span>
      </div>
```

Reemplazar por:

```js
      <div class="flex items-center gap-3 mb-4">
        <input id="materialSearch" type="text" placeholder="🔍 Buscar archivos..."
          class="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#E92129]">
        <span id="materialFileCount" class="text-xs text-slate-400 shrink-0"></span>
        <div class="flex gap-0.5 border border-slate-200 rounded-lg p-0.5 shrink-0">
          <button id="viewGrid" class="p-1.5 rounded-md transition-colors ${materialView === 'grid' ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600'}" aria-label="Vista cuadrícula">
            <i data-lucide="grid-3x3" class="w-4 h-4"></i>
          </button>
          <button id="viewList" class="p-1.5 rounded-md transition-colors ${materialView === 'list' ? 'bg-slate-100 text-slate-700' : 'text-slate-400 hover:text-slate-600'}" aria-label="Vista lista">
            <i data-lucide="list" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
```

- [ ] **Step 3: Refactorizar renderMaterialGrid para soportar ambas vistas**

Reemplazar la función completa `renderMaterialGrid` por esta versión que soporta grid y list:

```js
function renderMaterialGrid(files) {
  const grid = document.getElementById('materialGrid')
  const count = document.getElementById('materialFileCount')
  if (!grid) return
  if (count) count.textContent = `${files.length} archivos`

  if (!files.length) {
    grid.className = ''
    grid.innerHTML = '<p class="text-center text-slate-400 text-sm py-12">No hay archivos subidos aún</p>'
    return
  }

  if (materialView === 'list') {
    grid.className = 'space-y-2'
    grid.innerHTML = files.map(f => `
      <div class="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-3 py-2.5 hover:border-slate-200 transition-colors group">
        <div class="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg overflow-hidden bg-slate-50">
          ${f.type.startsWith('image/')
            ? `<img src="${escapeHtml(f.url)}" alt="" class="w-10 h-10 object-cover" loading="lazy">`
            : fileIcon(f.type)}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-slate-700 truncate" title="${escapeHtml(displayName(f.name))}">${escapeHtml(displayName(f.name))}</p>
          <p class="text-xs text-slate-400">${formatBytes(f.size)}</p>
        </div>
        <div class="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button class="preview-file p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-500"
            data-url="${escapeHtml(f.url)}" data-type="${escapeHtml(f.type)}" data-name="${escapeHtml(f.name)}" aria-label="Ver ${escapeHtml(displayName(f.name))}">
            <i data-lucide="eye" class="w-4 h-4"></i>
          </button>
          <button class="rename-file p-1.5 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-500"
            data-path="${escapeHtml(f.name)}" data-display="${escapeHtml(displayName(f.name))}" aria-label="Renombrar ${escapeHtml(displayName(f.name))}">
            <i data-lucide="pencil" class="w-4 h-4"></i>
          </button>
          <button class="copy-url p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            data-url="${escapeHtml(f.url)}" data-name="${escapeHtml(f.name)}" aria-label="Copiar URL">
            <i data-lucide="link" class="w-4 h-4"></i>
          </button>
          <button class="delete-file p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"
            data-path="${escapeHtml(f.name)}" aria-label="Eliminar ${escapeHtml(displayName(f.name))}">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `).join('')
  } else {
    grid.className = 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3'
    grid.innerHTML = files.map(f => `
      <div class="group relative bg-white border border-slate-100 rounded-xl p-3 text-center shadow-sm hover:shadow-md transition-shadow">
        ${f.type.startsWith('image/')
          ? `<img src="${escapeHtml(f.url)}" alt="" class="w-full h-16 object-cover rounded-lg mb-2" loading="lazy">`
          : `<div class="flex justify-center mb-2">${fileIcon(f.type)}</div>`}
        <p class="text-xs text-slate-700 truncate font-medium" title="${escapeHtml(displayName(f.name))}">${escapeHtml(displayName(f.name))}</p>
        <p class="text-xs text-slate-400">${formatBytes(f.size)}</p>
        <div class="absolute inset-0 bg-black/60 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
          <button class="preview-file bg-blue-500 text-white rounded-lg p-1.5"
            data-url="${escapeHtml(f.url)}" data-type="${escapeHtml(f.type)}" data-name="${escapeHtml(f.name)}" aria-label="Ver">
            <i data-lucide="eye" class="w-3.5 h-3.5"></i>
          </button>
          <button class="rename-file bg-amber-500 text-white rounded-lg p-1.5"
            data-path="${escapeHtml(f.name)}" data-display="${escapeHtml(displayName(f.name))}" aria-label="Renombrar">
            <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
          </button>
          <button class="copy-url bg-slate-600 text-white rounded-lg p-1.5"
            data-url="${escapeHtml(f.url)}" data-name="${escapeHtml(f.name)}" aria-label="Copiar URL">
            <i data-lucide="link" class="w-3.5 h-3.5"></i>
          </button>
          <button class="delete-file bg-red-500 text-white rounded-lg p-1.5"
            data-path="${escapeHtml(f.name)}" aria-label="Eliminar">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `).join('')
  }

  lucide.createIcons()

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
        .then(() => showToast(`URL de "${displayName(btn.dataset.name)}" copiada`))
        .catch(() => showToast('No se pudo copiar al portapapeles', 'error'))
    })
  })

  grid.querySelectorAll('.delete-file').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation()
      if (!confirm(`¿Eliminar "${displayName(btn.dataset.path)}"?\nEsta acción no se puede deshacer.`)) return
      try {
        await deleteFile(btn.dataset.path)
        showToast('Archivo eliminado')
        const updated = await listFiles()
        renderMaterialGrid(updated)
      } catch {
        showToast('Error al eliminar el archivo', 'error')
      }
    })
  })
}
```

- [ ] **Step 4: Agregar event listeners para los botones de toggle en renderMaterialPanel**

Al final de `renderMaterialPanel`, después del event listener de `materialSearch`, agregar:

```js
  let currentFiles = files

  document.getElementById('viewGrid').addEventListener('click', () => {
    materialView = 'grid'
    localStorage.setItem('admin_material_view', 'grid')
    document.getElementById('viewGrid').className = 'p-1.5 rounded-md transition-colors bg-slate-100 text-slate-700'
    document.getElementById('viewList').className = 'p-1.5 rounded-md transition-colors text-slate-400 hover:text-slate-600'
    renderMaterialGrid(currentFiles)
  })

  document.getElementById('viewList').addEventListener('click', () => {
    materialView = 'list'
    localStorage.setItem('admin_material_view', 'list')
    document.getElementById('viewGrid').className = 'p-1.5 rounded-md transition-colors text-slate-400 hover:text-slate-600'
    document.getElementById('viewList').className = 'p-1.5 rounded-md transition-colors bg-slate-100 text-slate-700'
    renderMaterialGrid(currentFiles)
  })
```

IMPORTANTE: La variable `files` ya existe en el scope de `renderMaterialPanel`. Pero el search handler usa `files` y el toggle también necesita los archivos actuales. Necesitas actualizar `files` a `currentFiles` en el handler de `loadFiles` y `materialSearch`. Específicamente, en `loadFiles`:

```js
  const loadFiles = async () => {
    const grid = document.getElementById('materialGrid')
    if (!grid) return
    grid.innerHTML = '<p class="col-span-5 text-center text-slate-400 text-sm py-12">Cargando...</p>'
    try {
      files = await listFiles()
      currentFiles = files
      renderMaterialGrid(files)
      lucide.createIcons()
    } catch {
      grid.innerHTML = `<p class="col-span-5 text-center text-red-400 text-sm py-12">Error al cargar. <button onclick="renderMaterialPanel()" class="underline">Reintentar</button></p>`
    }
  }
```

Y en el handler de search actualizar `currentFiles` también:

```js
  document.getElementById('materialSearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase()
    const filtered = files.filter(f => f.name.toLowerCase().includes(q))
    currentFiles = filtered
    renderMaterialGrid(filtered)
    lucide.createIcons()
  })
```

NOTA: `let currentFiles = files` debe declararse ANTES de `loadFiles` en el scope de `renderMaterialPanel`. Agrégalo justo después de `let files = []`:

```js
  let files = []
  let currentFiles = []
```

- [ ] **Step 5: Verificar manualmente**

Abrir el panel Material. Verificar que:
- Los botones cuadrícula/lista aparecen junto al buscador
- Hacer clic en lista: los archivos se muestran como filas horizontales
- Hacer clic en cuadrícula: los archivos vuelven a la cuadrícula
- Recargar la página: el modo se mantiene (localStorage)
- Buscar archivos: la vista permanece en el modo activo

- [ ] **Step 6: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): toggle lista/cuadrícula en panel de materiales con persistencia"
```

---

## Task 2: Lightbox para preview de imágenes y videos

**Files:**
- Modify: `js/admin.js`

Al hacer clic en el botón "Ver" (ojo) de un archivo, se abre un modal fullscreen. Imágenes: `<img>`. Videos: `<video controls>`. Otros tipos: mensaje + enlace para abrir en nueva pestaña.

- [ ] **Step 1: Agregar función initFilePreviewModal a admin.js**

Agregar esta función ANTES de `initMediaLibraryModal` (que está al final del archivo):

```js
function initFilePreviewModal() {
  const modal = document.createElement('div')
  modal.id = 'filePreviewModal'
  modal.className = 'hidden fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4'
  modal.innerHTML = `
    <button id="closeFilePreview" class="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors" aria-label="Cerrar vista previa">
      <i data-lucide="x" class="w-6 h-6"></i>
    </button>
    <div id="filePreviewContent" class="max-w-4xl w-full max-h-[85vh] flex items-center justify-center"></div>
    <p id="filePreviewName" class="absolute bottom-4 left-0 right-0 text-center text-white/60 text-sm px-4 truncate"></p>
  `
  document.body.appendChild(modal)
  lucide.createIcons()

  document.getElementById('closeFilePreview').addEventListener('click', () => {
    modal.classList.add('hidden')
    document.getElementById('filePreviewContent').innerHTML = ''
  })

  modal.addEventListener('click', e => {
    if (e.target === modal) {
      modal.classList.add('hidden')
      document.getElementById('filePreviewContent').innerHTML = ''
    }
  })

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      modal.classList.add('hidden')
      document.getElementById('filePreviewContent').innerHTML = ''
    }
  })
}
```

- [ ] **Step 2: Agregar función openFilePreview**

Agregar DESPUÉS de `initFilePreviewModal`:

```js
function openFilePreview(url, type, name) {
  const modal = document.getElementById('filePreviewModal')
  const content = document.getElementById('filePreviewContent')
  const nameEl = document.getElementById('filePreviewName')

  if (type.startsWith('image/')) {
    content.innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(displayName(name))}" class="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl">`
  } else if (type.startsWith('video/')) {
    content.innerHTML = `<video src="${escapeHtml(url)}" controls class="max-w-full max-h-[80vh] rounded-lg shadow-2xl" style="max-width:800px"></video>`
  } else {
    content.innerHTML = `
      <div class="text-center text-white/80">
        <div class="flex justify-center mb-4 opacity-50">${fileIcon(type).replace(/class="([^"]+)"/g, 'class="$1" style="color:white;width:64px;height:64px"')}</div>
        <p class="mb-4 text-lg font-medium">${escapeHtml(displayName(name))}</p>
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 px-4 py-2 bg-white/20 rounded-xl text-white hover:bg-white/30 transition-colors text-sm font-bold">
          <i data-lucide="external-link" class="w-4 h-4"></i> Abrir en nueva pestaña
        </a>
      </div>`
    lucide.createIcons()
  }

  nameEl.textContent = displayName(name)
  modal.classList.remove('hidden')
}
```

- [ ] **Step 3: Llamar initFilePreviewModal desde init()**

En la función `init()`, después de `initPasteHandler()`, agregar:

```js
  initFilePreviewModal()
```

- [ ] **Step 4: Verificar manualmente**

Abrir el panel Material. Hacer clic en el botón ojo (👁) de una imagen. Verificar que:
- El modal negro aparece con la imagen centrada
- Hacer clic fuera de la imagen o en X cierra el modal
- Presionar ESC cierra el modal
- Para un video, se muestra un player con controles
- Para un PDF u otro tipo, se muestra el botón "Abrir en nueva pestaña"

- [ ] **Step 5: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): lightbox para preview de imágenes y videos en biblioteca de materiales"
```

---

## Task 3: Renombrar archivos en la biblioteca de materiales

**Files:**
- Modify: `js/upload.js` — agregar `renameFile()`
- Modify: `js/admin.js` — importar `renameFile`, agregar modal y función

Supabase Storage tiene `move()` para renombrar archivos en el mismo bucket. El nuevo nombre genera un nuevo timestamp para evitar colisiones.

ADVERTENCIA al usuario: las lecciones que referencien el archivo con la URL antigua deberán actualizarse manualmente.

- [ ] **Step 1: Agregar renameFile a upload.js**

Al final de `js/upload.js`, agregar:

```js
export async function renameFile(oldPath, newDisplayName) {
  const ext = oldPath.match(/(\.[^.]+)?$/)[0] || ''
  const rawBase = newDisplayName.replace(/\.[^.]+$/, '').trim()
  const base = rawBase
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9\-_]/g, '')
    .toLowerCase() || 'archivo'
  const newPath = `${base}-${Date.now()}${ext}`
  const { error } = await supabase.storage.from(BUCKET).move(oldPath, newPath)
  if (error) throw error
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(newPath)
  return { path: newPath, url: data.publicUrl }
}
```

- [ ] **Step 2: Importar renameFile en admin.js**

Localizar en `admin.js`:

```js
import { uploadFile, listFiles, deleteFile } from './upload.js'
```

Reemplazar por:

```js
import { uploadFile, listFiles, deleteFile, renameFile } from './upload.js'
```

- [ ] **Step 3: Agregar initRenameModal y openRenameModal a admin.js**

Agregar ANTES de `initFilePreviewModal` (o en cualquier lugar después de las imports):

```js
let _renameCurrentPath = null
let _renameReloadCallback = null

function initRenameModal() {
  const modal = document.createElement('div')
  modal.id = 'renameModal'
  modal.className = 'hidden fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4'
  modal.innerHTML = `
    <div class="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl">
      <h3 class="font-black text-base mb-3">Renombrar archivo</h3>
      <input id="renameInput" type="text" autocomplete="off"
        class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129] mb-2">
      <p class="text-xs text-amber-600 mb-4 flex items-start gap-1.5">
        <i data-lucide="triangle-alert" class="w-3.5 h-3.5 shrink-0 mt-0.5"></i>
        Las lecciones que referencien este archivo deberán actualizarse manualmente.
      </p>
      <div class="flex gap-2">
        <button id="cancelRename" class="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-500 hover:bg-slate-50">Cancelar</button>
        <button id="confirmRename" class="flex-1 py-2 rounded-xl bg-[#E92129] text-white text-sm font-bold">Renombrar</button>
      </div>
    </div>
  `
  document.body.appendChild(modal)
  lucide.createIcons()

  document.getElementById('cancelRename').addEventListener('click', () => {
    modal.classList.add('hidden')
  })

  modal.addEventListener('click', e => {
    if (e.target === modal) modal.classList.add('hidden')
  })

  document.getElementById('confirmRename').addEventListener('click', async () => {
    const newName = document.getElementById('renameInput').value.trim()
    if (!newName || !_renameCurrentPath) return
    const btn = document.getElementById('confirmRename')
    btn.disabled = true
    btn.textContent = 'Renombrando...'
    try {
      await renameFile(_renameCurrentPath, newName)
      modal.classList.add('hidden')
      showToast('Archivo renombrado correctamente')
      if (_renameReloadCallback) await _renameReloadCallback()
    } catch (e) {
      showToast('Error al renombrar: ' + e.message, 'error')
      btn.disabled = false
      btn.textContent = 'Renombrar'
    }
  })

  document.getElementById('renameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('confirmRename').click()
    if (e.key === 'Escape') modal.classList.add('hidden')
  })
}

function openRenameModal(path, currentDisplayName) {
  _renameCurrentPath = path
  _renameReloadCallback = async () => {
    const updated = await listFiles()
    renderMaterialGrid(updated)
  }
  document.getElementById('renameInput').value = currentDisplayName
  document.getElementById('confirmRename').disabled = false
  document.getElementById('confirmRename').textContent = 'Renombrar'
  document.getElementById('renameModal').classList.remove('hidden')
  setTimeout(() => document.getElementById('renameInput').select(), 50)
}
```

- [ ] **Step 4: Llamar initRenameModal desde init()**

En `init()`, después de `initFilePreviewModal()`:

```js
  initRenameModal()
```

- [ ] **Step 5: Verificar manualmente**

Abrir el panel Material. Hacer clic en el botón lápiz (✏️) de un archivo. Verificar que:
- El modal aparece con el nombre actual pre-llenado y seleccionado
- Cambiar el nombre y hacer clic en "Renombrar"
- El archivo aparece con el nuevo nombre en la biblioteca
- Presionar Enter hace lo mismo que "Renombrar"
- ESC cierra el modal
- Un nombre con espacios o acentos se sanitiza correctamente

- [ ] **Step 6: Commit**

```bash
git add js/upload.js js/admin.js
git commit -m "feat(admin): renombrar archivos en biblioteca de materiales con Supabase Storage move"
```

---

## Task 4: Flechas ↑↓ para mover bloques de lección

**Files:**
- Modify: `js/admin.js` — `blockItemHtml`, `renderBlockList`

El reordenamiento de bloques actualmente solo funciona via drag & drop (Sortable.js). Se agregan botones ↑↓ como alternativa accesible para usuarios sin mouse.

- [ ] **Step 1: Agregar botones ↑↓ en blockItemHtml**

Localizar el return final de `blockItemHtml`. Actualmente:

```js
  const cardBg = isBotBlock ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'
  return `<div data-idx="${i}" class="${cardBg} border rounded-xl p-2.5 flex items-start gap-2">
    <div class="drag-handle text-slate-300 text-lg cursor-grab mt-0.5 select-none leading-none">⠿</div>
    <div class="flex-1 min-w-0">
      <div class="text-[9px] font-black uppercase mb-1.5" style="color:${color}">${label}</div>
      ${fields}
    </div>
    <button class="del-block text-slate-300 hover:text-red-400 text-sm px-1 mt-0.5 shrink-0" aria-label="Eliminar bloque">✕</button>
  </div>`
```

Reemplazar por:

```js
  const cardBg = isBotBlock ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'
  const isFirst = i === 0
  const isLast = i === currentBlocks.length - 1
  return `<div data-idx="${i}" class="${cardBg} border rounded-xl p-2.5 flex items-start gap-2">
    <div class="flex flex-col items-center gap-0.5 shrink-0 mt-0.5">
      <div class="drag-handle text-slate-300 text-lg cursor-grab select-none leading-none">⠿</div>
      <button class="move-up text-slate-300 hover:text-slate-600 transition-colors p-0.5 rounded ${isFirst ? 'opacity-30 cursor-not-allowed' : ''}" ${isFirst ? 'disabled' : ''} aria-label="Mover bloque arriba">
        <i data-lucide="chevron-up" class="w-3.5 h-3.5"></i>
      </button>
      <button class="move-down text-slate-300 hover:text-slate-600 transition-colors p-0.5 rounded ${isLast ? 'opacity-30 cursor-not-allowed' : ''}" ${isLast ? 'disabled' : ''} aria-label="Mover bloque abajo">
        <i data-lucide="chevron-down" class="w-3.5 h-3.5"></i>
      </button>
    </div>
    <div class="flex-1 min-w-0">
      <div class="text-[9px] font-black uppercase mb-1.5" style="color:${color}">${label}</div>
      ${fields}
    </div>
    <button class="del-block text-slate-300 hover:text-red-400 text-sm px-1 mt-0.5 shrink-0" aria-label="Eliminar bloque">✕</button>
  </div>`
```

- [ ] **Step 2: Agregar event listeners para move-up y move-down en renderBlockList**

En `renderBlockList`, después del bloque de `list.querySelectorAll('.del-block')`, agregar:

```js
  list.querySelectorAll('.move-up').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.closest('[data-idx]').dataset.idx)
      if (idx === 0) return
      const moved = currentBlocks.splice(idx, 1)[0]
      currentBlocks.splice(idx - 1, 0, moved)
      renderBlockList()
      updatePreview()
    })
  })

  list.querySelectorAll('.move-down').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.closest('[data-idx]').dataset.idx)
      if (idx === currentBlocks.length - 1) return
      const moved = currentBlocks.splice(idx, 1)[0]
      currentBlocks.splice(idx + 1, 0, moved)
      renderBlockList()
      updatePreview()
    })
  })
```

- [ ] **Step 3: Verificar manualmente**

Abrir una lección con 3+ bloques. Verificar que:
- Cada bloque muestra ↑↓ junto al handle de drag
- El primer bloque tiene ↑ deshabilitado (opaco, no responde)
- El último bloque tiene ↓ deshabilitado
- Hacer clic en ↓ mueve el bloque una posición abajo
- Hacer clic en ↑ mueve el bloque una posición arriba
- El drag & drop de Sortable.js sigue funcionando
- La vista previa se actualiza al reordenar

- [ ] **Step 4: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): flechas arriba/abajo para reordenar bloques de lección (alternativa a drag)"
```

---

## Task 5: Toggle para mostrar/ocultar vista previa de lección

**Files:**
- Modify: `js/admin.js` — `renderLessonsPanel`, `openLessonForm`, nueva función `applyPreviewState`

Por defecto la vista previa siempre está visible (panel derecho del modal de lección). Un botón en el header permite ocultarla para tener más espacio en pantallas pequeñas. La preferencia persiste en localStorage.

- [ ] **Step 1: Agregar variable de estado a nivel de módulo**

Después de `let materialView = ...`, agregar:

```js
let lessonPreviewVisible = localStorage.getItem('admin_lesson_preview') !== 'false'
```

- [ ] **Step 2: Agregar botón toggle al header del modal de lección**

En `renderLessonsPanel`, dentro del template HTML del modal, localizar el header:

```js
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h3 id="lessonFormTitle" class="font-black text-base">Nueva lección</h3>
          <button id="cancelLessonForm" class="text-slate-400 hover:text-slate-700 text-lg leading-none px-1">&#x2715;</button>
        </div>
```

Reemplazar por:

```js
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h3 id="lessonFormTitle" class="font-black text-base">Nueva lección</h3>
          <div class="flex items-center gap-2">
            <button id="togglePreview" class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors" aria-label="Alternar vista previa">
              <i data-lucide="eye" class="w-3.5 h-3.5"></i>
              <span class="hidden sm:inline">Vista previa</span>
            </button>
            <button id="cancelLessonForm" class="text-slate-400 hover:text-slate-700 text-lg leading-none px-1">&#x2715;</button>
          </div>
        </div>
```

- [ ] **Step 3: Agregar función applyPreviewState**

Agregar esta función ANTES de `openLessonForm`:

```js
function applyPreviewState() {
  const formGrid = document.querySelector('#lessonFormModal .flex-1.overflow-hidden.grid')
  const previewPanel = document.querySelector('#lessonFormModal .overflow-y-auto.bg-slate-50')
  const btn = document.getElementById('togglePreview')
  if (!formGrid || !previewPanel || !btn) return
  const icon = btn.querySelector('i[data-lucide]')
  if (lessonPreviewVisible) {
    formGrid.style.gridTemplateColumns = '1fr 1fr'
    previewPanel.classList.remove('hidden')
    if (icon) icon.setAttribute('data-lucide', 'eye')
    btn.classList.remove('text-slate-300')
    btn.classList.add('text-slate-400')
  } else {
    formGrid.style.gridTemplateColumns = '1fr'
    previewPanel.classList.add('hidden')
    if (icon) icon.setAttribute('data-lucide', 'eye-off')
    btn.classList.remove('text-slate-400')
    btn.classList.add('text-slate-300')
  }
  lucide.createIcons()
}
```

- [ ] **Step 4: Conectar el botón toggle y aplicar estado inicial**

En `renderLessonsPanel`, después de los event listeners de `lessonTitulo` y `lessonDescripcion` (alrededor de las líneas con `addEventListener('input', e => {`), agregar:

```js
  document.getElementById('togglePreview').addEventListener('click', () => {
    lessonPreviewVisible = !lessonPreviewVisible
    localStorage.setItem('admin_lesson_preview', String(lessonPreviewVisible))
    applyPreviewState()
  })
```

- [ ] **Step 5: Llamar applyPreviewState al abrir el formulario**

En `openLessonForm`, al final de la función (después de `updatePreview()`):

```js
  applyPreviewState()
```

- [ ] **Step 6: Verificar manualmente**

Abrir una lección. Verificar que:
- La vista previa es visible por defecto (panel derecho)
- El botón "Vista previa" está en el header del modal
- Hacer clic alterna la visibilidad del panel derecho
- El ícono cambia de `eye` a `eye-off` al ocultar
- Al ocultar, el formulario ocupa todo el ancho
- Recargar y abrir una lección: el estado persiste
- La funcionalidad de edición sigue igual (los bloques, el examen, etc.)

- [ ] **Step 7: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): toggle mostrar/ocultar vista previa en editor de lecciones"
```

---

## Self-Review

**Spec coverage:**
- [x] Toggle lista/cuadrícula en materiales → Task 1
- [x] Preview lightbox al hacer clic → Task 2
- [x] Renombrar archivos → Task 3
- [x] Flechas ↑↓ en bloques → Task 4
- [x] Toggle de vista previa → Task 5
- [x] Persistencia de preferencias en localStorage → Tasks 1, 5
- [x] Advertencia de URLs rotas al renombrar → Task 3 Step 3
- [x] Loading state en botón renombrar → Task 3 Step 3 (confirmRename se deshabilita)
- [x] ESC cierra modals → Tasks 2, 3
- [x] Primer/último bloque tienen flechas deshabilitadas → Task 4 Step 1

**Dependencias entre tareas:**
- Task 1 debe implementarse ANTES que Task 2 y 3 porque `renderMaterialGrid` refactorizada incluye los botones preview y rename
- Tasks 2, 3 requieren `initFilePreviewModal` y `initRenameModal` llamadas desde `init()` — hacerlo en orden
- Tasks 4 y 5 son independientes entre sí y de Tasks 1-3

**Sin placeholders. Código completo en cada paso.**
