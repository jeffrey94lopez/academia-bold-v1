# Image Upload + Media Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add native drag-and-drop file upload to Supabase Storage from the admin panel, with a reusable media library modal and a renovated Material panel gallery.

**Architecture:** A new `js/upload.js` module centralizes all Supabase Storage operations (upload, list, delete). The image block editor gets a drag-and-drop widget that replaces the manual URL input. A media library modal (opened from image blocks) lets admins pick previously uploaded files. The Material panel becomes a full file gallery with its own upload zone.

**Tech Stack:** Vanilla JS ES modules, Supabase JS v2 CDN, Tailwind CSS CDN, no build step.

**Spec:** `docs/superpowers/specs/2026-06-01-image-upload-media-library-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `js/upload.js` | Create | Supabase Storage: uploadFile, listFiles, deleteFile |
| `js/admin.js` | Modify | Add import, image block widget, modal logic, new Material panel |
| `admin.html` | Modify | Add media library modal HTML, update title |
| `index.html` | Modify | Update title and header subtitle |

---

## Task 1: Create `js/upload.js`

**Files:**
- Create: `js/upload.js`

- [ ] **Step 1: Write the module**

```javascript
import { supabase } from './supabase.js'

const BUCKET = 'material'
const MAX_BYTES = 50 * 1024 * 1024

export async function uploadFile(file, onProgress) {
  if (file.size > MAX_BYTES) throw new Error('El archivo supera el límite de 50MB')

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${Date.now()}-${safe}`

  const { data, error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    onUploadProgress: (p) => {
      if (onProgress && p.total) onProgress(Math.round((p.loaded / p.total) * 100))
    },
  })

  if (error) throw error

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path)
  return { url: urlData.publicUrl, path: data.path }
}

export async function listFiles() {
  const { data, error } = await supabase.storage.from(BUCKET).list('', {
    limit: 200,
    sortBy: { column: 'created_at', order: 'desc' },
  })
  if (error) throw error

  return (data || [])
    .filter(f => f.name !== '.emptyFolderPlaceholder')
    .map(f => ({
      name: f.name,
      size: f.metadata?.size || 0,
      type: f.metadata?.mimetype || '',
      url: supabase.storage.from(BUCKET).getPublicUrl(f.name).data.publicUrl,
    }))
}

export async function deleteFile(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}
```

- [ ] **Step 2: Verify in browser**

Open `admin.html` in the browser, open DevTools console, and run:
```javascript
// This won't work from console directly (module scope), but the lack of 404 for upload.js is enough
// Check: Network tab → reload → confirm js/upload.js loads with 200 status
```

- [ ] **Step 3: Commit**

```bash
git add js/upload.js
git commit -m "feat: add upload.js module for Supabase Storage operations"
```

---

## Task 2: Rename app to "Bold POS Academy"

**Files:**
- Modify: `index.html` (lines 6, 25-26)
- Modify: `admin.html` (lines 6, 19)

- [ ] **Step 1: Update `index.html` title and header**

In `index.html` line 6, replace:
```html
  <title>Academia Bold POS</title>
```
with:
```html
  <title>Bold POS Academy — Academia Oficial de Bold POS</title>
```

In `index.html` lines 25-26, replace:
```html
        <p class="font-black text-base uppercase tracking-tighter">Bold <span class="text-[#E92129] text-sm">POS</span></p>
        <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Academia Oficial</p>
```
with:
```html
        <p class="font-black text-base uppercase tracking-tighter">Bold <span class="text-[#E92129] text-sm">POS</span> Academy</p>
        <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Academia Oficial de Bold POS</p>
```

- [ ] **Step 2: Update `admin.html` title and login subtitle**

In `admin.html` line 6, replace:
```html
  <title>Admin — Academia Bold POS</title>
```
with:
```html
  <title>Admin — Bold POS Academy</title>
```

In `admin.html` line 19, replace:
```html
      <p class="text-slate-400 text-sm text-center mb-6">Academia Bold POS</p>
```
with:
```html
      <p class="text-slate-400 text-sm text-center mb-6">Bold POS Academy</p>
```

- [ ] **Step 3: Verify in browser**

Open `index.html` and `admin.html` — browser tab titles and header should show updated names.

- [ ] **Step 4: Commit**

```bash
git add index.html admin.html
git commit -m "feat: rename app to Bold POS Academy — Academia Oficial de Bold POS"
```

---

## Task 3: Add media library modal HTML + helper functions

**Files:**
- Modify: `admin.html` (before `</body>`)
- Modify: `js/admin.js` (add imports, helper functions, init call)

- [ ] **Step 1: Add upload.js import to `admin.js`**

In `js/admin.js`, insert a new line 3 after `import { requireAuth, logout } from './auth.js'`:

```javascript
import { uploadFile, listFiles, deleteFile } from './upload.js'
```

After the change, lines 1-5 of `admin.js` should look like:
```javascript
import { supabase } from './supabase.js'
import { requireAuth, logout } from './auth.js'
import { uploadFile, listFiles, deleteFile } from './upload.js'
import { renderBlocks } from './block-renderer.js'
import { applyFormat } from './step-formatter.js'
```

- [ ] **Step 2: Add helper functions to `admin.js` before `escapeHtml`**

Insert this block right before `function escapeHtml(text)` at line 591:

```javascript
function fileIcon(type) {
  if (!type) return '📁'
  if (type.startsWith('image/')) return '🖼️'
  if (type === 'application/pdf') return '📄'
  if (type.startsWith('video/')) return '🎬'
  if (type.startsWith('audio/')) return '🎵'
  return '📁'
}

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function showToast(msg, type = 'success') {
  const t = document.createElement('div')
  t.className = `fixed bottom-4 right-4 z-[100] px-4 py-3 rounded-xl text-sm font-medium shadow-lg text-white ${
    type === 'error' ? 'bg-red-500' : 'bg-emerald-500'
  }`
  t.textContent = msg
  document.body.appendChild(t)
  setTimeout(() => t.remove(), 3000)
}

let _mediaCallback = null
let _selectedUrl = null

async function openMediaLibrary(onSelect) {
  _mediaCallback = onSelect
  _selectedUrl = null

  const modal = document.getElementById('mediaLibraryModal')
  const grid = document.getElementById('mediaGrid')
  const selectBtn = document.getElementById('mediaSelectBtn')
  const search = document.getElementById('mediaSearch')

  modal.classList.remove('hidden')
  modal.classList.add('flex')
  selectBtn.disabled = true
  selectBtn.textContent = '✓ Usar archivo'
  search.value = ''
  grid.innerHTML = '<p class="col-span-4 text-center text-slate-400 text-sm py-8">Cargando...</p>'

  let files = []
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
}

function renderMediaGrid(files) {
  const grid = document.getElementById('mediaGrid')
  const count = document.getElementById('mediaCount')
  if (!grid) return
  count.textContent = `${files.length} archivos`

  if (!files.length) {
    grid.innerHTML = '<p class="col-span-4 text-center text-slate-400 text-sm py-8">No hay archivos subidos</p>'
    return
  }

  grid.innerHTML = files.map(f => `
    <div class="media-item cursor-pointer border-2 border-transparent rounded-xl p-2 text-center hover:border-[#E92129] transition-colors"
         data-url="${escapeHtml(f.url)}" data-name="${escapeHtml(f.name)}">
      <div class="text-3xl mb-1">${fileIcon(f.type)}</div>
      <p class="text-xs text-slate-700 truncate" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</p>
      <p class="text-xs text-slate-400">${formatBytes(f.size)}</p>
    </div>
  `).join('')

  grid.querySelectorAll('.media-item').forEach(item => {
    item.addEventListener('click', () => {
      grid.querySelectorAll('.media-item').forEach(i => {
        i.classList.remove('border-[#E92129]', 'bg-red-50')
      })
      item.classList.add('border-[#E92129]', 'bg-red-50')
      _selectedUrl = item.dataset.url
      const btn = document.getElementById('mediaSelectBtn')
      btn.disabled = false
      const short = item.dataset.name.length > 20
        ? item.dataset.name.substring(0, 20) + '…'
        : item.dataset.name
      btn.textContent = `✓ Usar ${short}`
    })
  })
}

function initMediaLibraryModal() {
  document.getElementById('mediaSelectBtn').addEventListener('click', () => {
    if (_selectedUrl && _mediaCallback) _mediaCallback(_selectedUrl)
    document.getElementById('mediaLibraryModal').classList.add('hidden')
    document.getElementById('mediaLibraryModal').classList.remove('flex')
  })
  document.getElementById('mediaCancelBtn').addEventListener('click', () => {
    document.getElementById('mediaLibraryModal').classList.add('hidden')
    document.getElementById('mediaLibraryModal').classList.remove('flex')
  })
  document.getElementById('mediaLibraryModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.add('hidden')
      e.currentTarget.classList.remove('flex')
    }
  })
}
```

- [ ] **Step 3: Call `initMediaLibraryModal()` inside `init()`**

In `admin.js`, find the `init()` function (line 9). Add the call after `lucide.createIcons()` on line 18:

```javascript
async function init() {
  const ok = await requireAuth()
  if (!ok) return

  document.getElementById('loginScreen').classList.add('hidden')
  document.getElementById('adminApp').classList.remove('hidden')
  document.getElementById('logoutBtn').addEventListener('click', logout)

  await renderLessonsPanel()
  lucide.createIcons()
  initMediaLibraryModal()   // ← add this line

  document.querySelectorAll('.admin-nav').forEach(btn => {
    btn.addEventListener('click', () => switchPanel(btn.dataset.panel))
  })
}
```

- [ ] **Step 4: Add modal HTML to `admin.html`**

In `admin.html`, insert this block between line 73 (`</div>`) and line 75 (`<script src=...sortablejs...>`):

```html
  <!-- Media library modal -->
  <div id="mediaLibraryModal" class="fixed inset-0 bg-black/60 z-50 hidden items-center justify-center p-4">
    <div class="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col" style="max-height:80vh">
      <div class="flex items-center gap-3 p-4 border-b border-slate-100">
        <h3 class="font-bold text-slate-800 flex-1">Biblioteca de medios</h3>
        <input id="mediaSearch" type="text" placeholder="🔍 Buscar..."
          class="px-3 py-1.5 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#E92129]">
        <span id="mediaCount" class="text-xs text-slate-400"></span>
      </div>
      <div id="mediaGrid" class="grid grid-cols-4 gap-3 p-4 overflow-y-auto flex-1 min-h-0"></div>
      <div class="flex gap-2 justify-end p-4 border-t border-slate-100 shrink-0">
        <button id="mediaCancelBtn" class="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Cancelar</button>
        <button id="mediaSelectBtn" class="px-4 py-2 text-sm bg-[#E92129] text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed" disabled>✓ Usar archivo</button>
      </div>
    </div>
  </div>
```

- [ ] **Step 5: Verify in browser**

1. Open `admin.html`, log in, open DevTools console.
2. Run `openMediaLibrary(url => console.log('selected:', url))` — the modal should open.
3. If files exist in the `material` bucket, they should appear in a 4-column grid.
4. Click a file → it should highlight in red and enable the "Usar" button.
5. Click "Usar" → console should log the URL.
6. Click outside the modal → it should close.

- [ ] **Step 6: Commit**

```bash
git add admin.html js/admin.js
git commit -m "feat: add media library modal and helper functions (fileIcon, showToast, openMediaLibrary)"
```

---

## Task 4: Replace image block URL input with upload widget

**Files:**
- Modify: `js/admin.js` (blockItemHtml image case, renderBlockList, new setupUploadZone)

- [ ] **Step 1: Replace the image block fields in `blockItemHtml()`**

In `js/admin.js`, replace lines 273-277:
```javascript
  } else if (block.type === 'image') {
    fields = `<input data-field="url" value="${escapeHtml(block.url || '')}" placeholder="URL de imagen"
        class="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129] mb-1.5">
      <input data-field="caption" value="${escapeHtml(block.caption || '')}" placeholder="Pie de foto (opcional)"
        class="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129]">`
```
with:
```javascript
  } else if (block.type === 'image') {
    fields = `
      <input data-field="url" value="${escapeHtml(block.url || '')}" class="hidden">
      <div class="upload-zone border-2 border-dashed border-slate-200 rounded-lg p-3 text-center mb-1.5 transition-colors">
        ${block.url ? `
          <div class="flex items-center gap-2 bg-slate-50 rounded-lg p-2">
            <img src="${escapeHtml(block.url)}" class="w-10 h-10 object-cover rounded shrink-0" onerror="this.style.display='none'">
            <span class="text-xs text-slate-600 truncate flex-1">${escapeHtml(block.url.split('/').pop())}</span>
            <button type="button" class="clear-upload text-slate-300 hover:text-red-400 text-sm px-1">✕</button>
          </div>
        ` : `
          <p class="text-slate-400 text-xs mb-2">🖼️ Arrastra una imagen aquí o</p>
          <div class="flex gap-1.5 justify-center">
            <button type="button" class="pick-file px-3 py-1.5 bg-[#E92129] text-white text-xs rounded-lg">📁 Buscar</button>
            <button type="button" class="pick-library px-3 py-1.5 bg-slate-100 text-slate-600 text-xs rounded-lg border border-slate-200">🗂️ Biblioteca</button>
          </div>
        `}
        <div class="upload-progress hidden mt-2">
          <div class="h-1 bg-slate-200 rounded-full overflow-hidden"><div class="upload-bar h-full bg-[#E92129] transition-all" style="width:0%"></div></div>
          <p class="text-xs text-slate-400 mt-1">Subiendo...</p>
        </div>
      </div>
      <input data-field="caption" value="${escapeHtml(block.caption || '')}" placeholder="Pie de foto (opcional)"
        class="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129]">`
```

- [ ] **Step 2: Add `setupUploadZone()` function before `escapeHtml`**

Insert this function right before `function fileIcon(type)` (which was added in Task 3):

```javascript
function setupUploadZone(zone) {
  const urlInput = zone.closest('[data-idx]').querySelector('input[data-field="url"]')
  const progressDiv = zone.querySelector('.upload-progress')
  const progressBar = zone.querySelector('.upload-bar')

  const doUpload = async (file) => {
    progressDiv.classList.remove('hidden')
    progressBar.style.width = '0%'
    try {
      const { url } = await uploadFile(file, pct => { progressBar.style.width = pct + '%' })
      urlInput.value = url
      urlInput.dispatchEvent(new Event('input'))
      renderBlockList()
    } catch (e) {
      showToast(e.message || 'Error al subir archivo', 'error')
      progressDiv.classList.add('hidden')
    }
  }

  zone.addEventListener('dragover', e => {
    e.preventDefault()
    e.stopPropagation()
    zone.classList.add('border-[#E92129]', 'bg-red-50')
  })
  zone.addEventListener('dragleave', () => {
    zone.classList.remove('border-[#E92129]', 'bg-red-50')
  })
  zone.addEventListener('drop', e => {
    e.preventDefault()
    e.stopPropagation()
    zone.classList.remove('border-[#E92129]', 'bg-red-50')
    if (e.dataTransfer.files[0]) doUpload(e.dataTransfer.files[0])
  })

  const pickBtn = zone.querySelector('.pick-file')
  if (pickBtn) {
    pickBtn.addEventListener('click', e => {
      e.stopPropagation()
      const fi = document.createElement('input')
      fi.type = 'file'
      fi.onchange = () => fi.files[0] && doUpload(fi.files[0])
      fi.click()
    })
  }

  const libBtn = zone.querySelector('.pick-library')
  if (libBtn) {
    libBtn.addEventListener('click', e => {
      e.stopPropagation()
      openMediaLibrary(url => {
        urlInput.value = url
        urlInput.dispatchEvent(new Event('input'))
        renderBlockList()
      })
    })
  }

  const clearBtn = zone.querySelector('.clear-upload')
  if (clearBtn) {
    clearBtn.addEventListener('click', e => {
      e.stopPropagation()
      urlInput.value = ''
      urlInput.dispatchEvent(new Event('input'))
      renderBlockList()
    })
  }
}
```

- [ ] **Step 3: Call `setupUploadZone()` from `renderBlockList()`**

In `js/admin.js`, find `renderBlockList()` (line 215). After the existing `list.querySelectorAll('.fmt-btn')` block (around line 243), and before the `sortableInstance = Sortable.create(...)` call (line 245), add:

```javascript
  list.querySelectorAll('.upload-zone').forEach(zone => setupUploadZone(zone))
```

The `renderBlockList` function should look like this after the change (showing the relevant section):
```javascript
  list.querySelectorAll('.fmt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const textarea = btn.closest('[data-idx]').querySelector('textarea[data-field="text"]')
      applyFormat(textarea, btn.dataset.marker)
    })
  })

  list.querySelectorAll('.upload-zone').forEach(zone => setupUploadZone(zone))  // ← new line

  sortableInstance = Sortable.create(list, {
```

- [ ] **Step 4: Verify in browser**

1. Log into the admin, open a lesson for editing.
2. Click "Agregar bloque" → "Imagen".
3. The block should show a dashed dropzone with "📁 Buscar" and "🗂️ Biblioteca" buttons.
4. Click "📁 Buscar" → file picker opens → select an image → it uploads, progress bar animates, then thumbnail appears.
5. Click "🗂️ Biblioteca" → media library modal opens → select a file → URL fills in the block.
6. Click "✕" on the thumbnail → the dropzone resets to empty state.
7. Try dragging an image file onto the dropzone → it should upload.
8. Save the lesson → the image should appear in the lesson preview.

- [ ] **Step 5: Commit**

```bash
git add js/admin.js
git commit -m "feat: replace image block URL input with drag-and-drop upload widget"
```

---

## Task 5: Renovate Material panel

**Files:**
- Modify: `js/admin.js` (replace `renderMaterialPanel`, add `renderMaterialGrid`)

- [ ] **Step 1: Replace `renderMaterialPanel()` in `admin.js`**

Replace lines 383-468 (the entire `async function renderMaterialPanel()` block) with:

```javascript
async function renderMaterialPanel() {
  const el = document.getElementById('panel-material')
  el.innerHTML = `
    <div class="max-w-4xl mx-auto">
      <h2 class="text-lg font-black mb-4">Biblioteca de archivos</h2>

      <div id="materialDropzone" class="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center mb-6 hover:border-[#E92129] transition-colors cursor-pointer">
        <div class="text-4xl mb-3">📁</div>
        <p class="text-slate-400 text-sm mb-3">Arrastra archivos aquí o</p>
        <button id="materialPickFile" class="px-4 py-2 bg-[#E92129] text-white text-sm rounded-lg font-bold">📁 Buscar archivo</button>
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
      </div>

      <div id="materialGrid" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
        <p class="col-span-5 text-center text-slate-400 text-sm py-12">Cargando archivos...</p>
      </div>
    </div>
  `

  let files = []

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

  await loadFiles()

  document.getElementById('materialSearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase()
    renderMaterialGrid(files.filter(f => f.name.toLowerCase().includes(q)))
  })

  const dropzone = document.getElementById('materialDropzone')
  const progressDiv = document.getElementById('materialProgress')
  const progressBar = document.getElementById('materialProgressBar')

  const doUpload = async (file) => {
    progressDiv.classList.remove('hidden')
    progressBar.style.width = '0%'
    try {
      await uploadFile(file, pct => { progressBar.style.width = pct + '%' })
      showToast('Archivo subido correctamente')
      await loadFiles()
    } catch (e) {
      showToast(e.message || 'Error al subir archivo', 'error')
    } finally {
      progressDiv.classList.add('hidden')
    }
  }

  dropzone.addEventListener('dragover', e => {
    e.preventDefault()
    dropzone.classList.add('border-[#E92129]', 'bg-red-50')
  })
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('border-[#E92129]', 'bg-red-50')
  })
  dropzone.addEventListener('drop', e => {
    e.preventDefault()
    dropzone.classList.remove('border-[#E92129]', 'bg-red-50')
    if (e.dataTransfer.files[0]) doUpload(e.dataTransfer.files[0])
  })

  document.getElementById('materialPickFile').addEventListener('click', e => {
    e.stopPropagation()
    const fi = document.createElement('input')
    fi.type = 'file'
    fi.onchange = () => fi.files[0] && doUpload(fi.files[0])
    fi.click()
  })
}

function renderMaterialGrid(files) {
  const grid = document.getElementById('materialGrid')
  const count = document.getElementById('materialFileCount')
  if (!grid) return
  if (count) count.textContent = `${files.length} archivos`

  if (!files.length) {
    grid.innerHTML = '<p class="col-span-5 text-center text-slate-400 text-sm py-12">No hay archivos subidos aún</p>'
    return
  }

  grid.innerHTML = files.map(f => `
    <div class="group relative bg-white border border-slate-100 rounded-xl p-3 text-center shadow-sm hover:shadow-md transition-shadow">
      <div class="text-3xl mb-2">${fileIcon(f.type)}</div>
      <p class="text-xs text-slate-700 truncate font-medium" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</p>
      <p class="text-xs text-slate-400">${formatBytes(f.size)}</p>
      <div class="absolute inset-0 bg-black/60 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
        <button class="copy-url bg-blue-500 text-white rounded-lg px-2 py-1 text-xs font-bold"
          data-url="${escapeHtml(f.url)}" data-name="${escapeHtml(f.name)}">📋 URL</button>
        <button class="delete-file bg-red-500 text-white rounded-lg px-2 py-1 text-xs font-bold"
          data-path="${escapeHtml(f.name)}">🗑️</button>
      </div>
    </div>
  `).join('')

  grid.querySelectorAll('.copy-url').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      navigator.clipboard.writeText(btn.dataset.url)
        .then(() => showToast(`URL de "${btn.dataset.name}" copiada`))
        .catch(() => showToast('No se pudo copiar al portapapeles', 'error'))
    })
  })

  grid.querySelectorAll('.delete-file').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation()
      if (!confirm(`¿Eliminar "${btn.dataset.path}"?`)) return
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

- [ ] **Step 2: Make `renderMaterialPanel` accessible for the retry button**

The retry button uses `onclick="renderMaterialPanel()"` which requires the function to be on `window`. Since the code is an ES module (all functions are scoped), add this line right before `init()` at the end of `admin.js`:

```javascript
window.renderMaterialPanel = renderMaterialPanel
```

- [ ] **Step 3: Verify in browser**

1. Log into the admin, click "Material" in the nav.
2. The panel should show: upload dropzone at top, search bar, and a grid of files from the `material` bucket.
3. Upload a file by dragging it onto the dropzone → progress bar animates → file appears in the grid after upload.
4. Upload a file by clicking "📁 Buscar archivo" → file picker opens → select a file → it uploads and appears in the grid.
5. Hover over a file in the grid → "📋 URL" and "🗑️" buttons appear.
6. Click "📋 URL" → a green toast appears saying the URL was copied.
7. Click "🗑️" on a file → confirm dialog → file disappears from the grid.
8. Type in the search bar → grid filters in real time.

- [ ] **Step 4: Commit**

```bash
git add js/admin.js
git commit -m "feat: renovate Material panel with file gallery, upload zone, and search"
```

---

## Supabase Storage permissions checklist

Before testing uploads, verify the `material` bucket allows writes from authenticated users. In the Supabase dashboard:

1. Go to Storage → Policies → `material` bucket.
2. Confirm there is an INSERT policy for `authenticated` role (or `public` if the bucket is public).
3. Confirm there is a DELETE policy for `authenticated` role.
4. If policies are missing, run in the SQL editor:

```sql
CREATE POLICY "Authenticated users can upload to material"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'material');

CREATE POLICY "Authenticated users can delete from material"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'material');
```

---

## Done — Acceptance Criteria

- [ ] Drag a file onto the image block dropzone → it uploads and the thumbnail appears
- [ ] Click "📁 Buscar" in the image block → file picker opens and uploads the selected file
- [ ] Click "🗂️ Biblioteca" in the image block → modal opens with existing files, selecting one fills the block URL
- [ ] Click "✕" on the image block thumbnail → dropzone resets to empty state
- [ ] Progress bar animates during upload in both the block and the Material panel
- [ ] Material panel shows all files from Supabase Storage in a grid
- [ ] Search in Material panel filters the grid in real time
- [ ] "📋 URL" on a Material file copies the public URL with a toast confirmation
- [ ] "🗑️" on a Material file removes it from Storage and from the grid
- [ ] Browser tab shows "Bold POS Academy — Academia Oficial de Bold POS" on index.html
- [ ] Error states show toast messages without breaking the UI
