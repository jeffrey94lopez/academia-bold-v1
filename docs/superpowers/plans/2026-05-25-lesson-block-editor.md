# Lesson Block Editor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw HTML textarea lesson editor with a visual block-based editor (Step, Image, Video, Link blocks with drag & drop reordering and live preview), and update the student lesson view to render those blocks natively.

**Architecture:** A new `js/block-renderer.js` module exports `renderBlocks(blocks)` which converts a JSON block array into DOM nodes — shared by both the admin live preview and the student lesson modal. The admin editor replaces the current `<textarea>` with a split-panel modal (SortableJS for drag & drop). Lessons are saved as a JSON array in the existing `lecciones.contenido` column. Legacy HTML lessons fall back to `innerHTML`.

**Tech Stack:** Vanilla JS ES Modules, Tailwind CSS CDN, SortableJS CDN (`cdn.jsdelivr.net/npm/sortablejs@1`), Supabase JS v2

---

### Task 1: Create `js/block-renderer.js`

**Files:**
- Create: `js/block-renderer.js`

- [ ] **Step 1: Create the file**

Create `js/block-renderer.js` with this exact content:

```js
export function renderBlocks(blocks) {
  const frag = document.createDocumentFragment()
  let stepCount = 0

  for (const block of blocks) {
    if (block.type === 'step') {
      stepCount++
      const wrap = document.createElement('div')
      wrap.style.cssText = 'display:flex;gap:10px;align-items:flex-start;margin-bottom:14px'
      const circle = document.createElement('div')
      circle.style.cssText = 'width:24px;height:24px;background:#E92129;border-radius:50%;color:white;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px'
      circle.textContent = stepCount
      const p = document.createElement('p')
      p.style.cssText = 'font-size:13px;color:#334155;margin:3px 0 0;line-height:1.6'
      p.textContent = block.text || ''
      wrap.append(circle, p)
      frag.append(wrap)

    } else if (block.type === 'image') {
      let validUrl = false
      try { new URL(block.url); validUrl = true } catch (_) {}
      if (!validUrl) continue
      const wrap = document.createElement('div')
      wrap.style.cssText = 'border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:14px'
      const img = document.createElement('img')
      img.src = block.url
      img.alt = block.caption || ''
      img.style.cssText = 'width:100%;display:block'
      wrap.append(img)
      if (block.caption) {
        const cap = document.createElement('p')
        cap.style.cssText = 'font-size:11px;color:#94a3b8;margin:0;padding:8px 12px;background:#fff;border-top:1px solid #f1f5f9'
        cap.textContent = block.caption
        wrap.append(cap)
      }
      frag.append(wrap)

    } else if (block.type === 'video') {
      let validUrl = false
      try { new URL(block.url); validUrl = true } catch (_) {}
      if (!validUrl) continue
      const a = document.createElement('a')
      a.href = block.url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.style.cssText = 'display:block;margin-bottom:14px;text-decoration:none'
      const top = document.createElement('div')
      top.style.cssText = 'background:#1e293b;border-radius:10px 10px 0 0;height:80px;display:flex;align-items:center;justify-content:center'
      const playBtn = document.createElement('div')
      playBtn.style.cssText = 'width:36px;height:36px;background:#E92129;border-radius:50%;display:flex;align-items:center;justify-content:center'
      const playIcon = document.createElement('span')
      playIcon.style.cssText = 'color:white;font-size:16px;margin-left:3px'
      playIcon.textContent = '▶'
      playBtn.append(playIcon)
      top.append(playBtn)
      const bottom = document.createElement('div')
      bottom.style.cssText = 'background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;padding:10px 12px'
      const labelEl = document.createElement('p')
      labelEl.style.cssText = 'font-size:12px;font-weight:700;color:#1e293b;margin:0'
      labelEl.textContent = block.label || 'Ver video'
      bottom.append(labelEl)
      a.append(top, bottom)
      frag.append(a)

    } else if (block.type === 'link') {
      let validUrl = false
      try { new URL(block.url); validUrl = true } catch (_) {}
      if (!validUrl) continue
      const a = document.createElement('a')
      a.href = block.url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.style.cssText = 'display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;text-decoration:none;margin-bottom:14px'
      const icon = document.createElement('div')
      icon.style.cssText = 'width:32px;height:32px;background:#eff6ff;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0'
      icon.textContent = '🔗'
      const labelEl = document.createElement('p')
      labelEl.style.cssText = 'font-size:12px;font-weight:700;color:#1e293b;margin:0;flex:1'
      labelEl.textContent = block.label || block.url
      const arrow = document.createElement('span')
      arrow.style.cssText = 'color:#cbd5e1;font-size:14px'
      arrow.textContent = '→'
      a.append(icon, labelEl, arrow)
      frag.append(a)
    }
  }

  return frag
}
```

- [ ] **Step 2: Verify the file**

Open `js/block-renderer.js` and confirm:
- Starts with `export function renderBlocks(blocks) {`
- Has four `if/else if` branches: `step`, `image`, `video`, `link`
- All text assigned via `.textContent`, never `.innerHTML`
- `image`, `video`, `link` validate URL with `try { new URL(...) } catch`
- Returns `frag`

- [ ] **Step 3: Commit**

```bash
git add js/block-renderer.js
git commit -m "feat: add block-renderer shared module"
```

---

### Task 2: Update student lesson view in `js/lessons.js`

**Files:**
- Modify: `js/lessons.js` (lines 1–2, lines 52–57)

- [ ] **Step 1: Add import at top of `js/lessons.js`**

Line 1 currently reads:
```js
import { supabase } from './supabase.js'
```

Change lines 1–2 to:
```js
import { supabase } from './supabase.js'
import { renderBlocks } from './block-renderer.js'
```

- [ ] **Step 2: Replace the `innerHTML` assignment (lines 52–57)**

Find this block:
```js
  grid.querySelectorAll('.lesson-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const lesson = lessons.find(l => l.id === btn.dataset.id)
      document.getElementById('modalTitle').textContent = lesson.titulo
      document.getElementById('modalContent').innerHTML = lesson.contenido
      document.getElementById('lessonModal').classList.remove('hidden')
    })
  })
```

Replace with:
```js
  grid.querySelectorAll('.lesson-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const lesson = lessons.find(l => l.id === btn.dataset.id)
      document.getElementById('modalTitle').textContent = lesson.titulo
      const contentEl = document.getElementById('modalContent')
      contentEl.innerHTML = ''
      let blocks
      try { blocks = JSON.parse(lesson.contenido) } catch (_) { blocks = null }
      if (Array.isArray(blocks)) {
        contentEl.appendChild(renderBlocks(blocks))
      } else {
        contentEl.innerHTML = lesson.contenido
      }
      document.getElementById('lessonModal').classList.remove('hidden')
    })
  })
```

- [ ] **Step 3: Verify in browser**

Open `index.html` → Lecciones section. Click any lesson card. If the lesson has legacy HTML content it renders as before. No console errors.

- [ ] **Step 4: Commit**

```bash
git add js/lessons.js
git commit -m "feat: render lesson blocks from JSON in student modal"
```

---

### Task 3: Add SortableJS to `admin.html`

**Files:**
- Modify: `admin.html` (line 75)

- [ ] **Step 1: Add SortableJS script tag**

Find line 75 in `admin.html`:
```html
  <script type="module" src="js/admin.js"></script>
```

Replace with:
```html
  <script src="https://cdn.jsdelivr.net/npm/sortablejs@1/Sortable.min.js"></script>
  <script type="module" src="js/admin.js"></script>
```

SortableJS must be a regular (non-module) script loaded before `admin.js` so `Sortable` is available as a global.

- [ ] **Step 2: Verify SortableJS loads**

Open `admin.html` in browser → DevTools Console → type `Sortable` → should print the Sortable constructor, not `undefined`.

- [ ] **Step 3: Commit**

```bash
git add admin.html
git commit -m "feat: add SortableJS CDN for drag-and-drop in lesson editor"
```

---

### Task 4: Rewrite lesson editor in `js/admin.js`

**Files:**
- Modify: `js/admin.js` (lines 1–2, 65–84, 98–117, 120–128, and after line 128)

This task has five sub-steps that must be applied together before testing.

- [ ] **Step 1: Add import and module-level state at top of `js/admin.js`**

Replace lines 1–2:
```js
import { supabase } from './supabase.js'
import { requireAuth, logout } from './auth.js'
```

With:
```js
import { supabase } from './supabase.js'
import { requireAuth, logout } from './auth.js'
import { renderBlocks } from './block-renderer.js'

let currentBlocks = []
let sortableInstance = null
```

- [ ] **Step 2: Replace the modal HTML inside `renderLessonsPanel()`**

Inside `renderLessonsPanel()`, find the modal section (lines 65–84) — the entire `<div id="lessonFormModal">` block — and replace it with:

```js
    <div id="lessonFormModal" class="hidden fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl w-full max-w-5xl flex flex-col" style="max-height:90vh">
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h3 id="lessonFormTitle" class="font-black text-base">Nueva lección</h3>
          <button id="cancelLessonForm" class="text-slate-400 hover:text-slate-700 text-lg leading-none px-1">✕</button>
        </div>
        <div class="flex-1 overflow-hidden grid" style="grid-template-columns:1fr 1fr;min-height:0">
          <div class="overflow-y-auto p-5 border-r border-slate-100">
            <input type="hidden" id="lessonId">
            <div class="space-y-2 mb-4">
              <input id="lessonTitulo" placeholder="Título" required
                class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
              <input id="lessonDescripcion" placeholder="Descripción corta" required
                class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
            </div>
            <p class="text-[10px] font-black uppercase text-slate-400 tracking-wide mb-2">Contenido</p>
            <div id="blockList" class="space-y-2 mb-3"></div>
            <div class="flex flex-wrap gap-1.5 mb-4">
              <button data-type="step" class="add-block bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-slate-200">+ Paso</button>
              <button data-type="image" class="add-block bg-blue-50 text-blue-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-blue-100">+ Imagen</button>
              <button data-type="video" class="add-block bg-purple-50 text-purple-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-purple-100">+ Video</button>
              <button data-type="link" class="add-block bg-green-50 text-green-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-green-100">+ Link</button>
            </div>
            <div class="flex items-end gap-3 pt-3 border-t border-slate-100">
              <div>
                <p class="text-[10px] font-black uppercase text-slate-400 mb-1">Orden</p>
                <input id="lessonOrden" type="number" placeholder="1" required
                  class="w-16 px-2 py-1.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
              </div>
              <button id="saveLessonBtn" class="flex-1 py-2.5 rounded-xl bg-[#E92129] text-white text-sm font-bold">Guardar lección</button>
            </div>
          </div>
          <div class="overflow-y-auto p-5 bg-slate-50">
            <p class="text-[10px] font-black uppercase text-slate-400 tracking-wide mb-3">👁️ Vista previa del estudiante</p>
            <div class="bg-white rounded-xl p-4 shadow-sm">
              <h3 id="previewTitle" class="font-black text-sm mb-1 text-slate-900"></h3>
              <p id="previewDesc" class="text-xs text-slate-400 mb-4"></p>
              <div id="lessonPreview"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
```

- [ ] **Step 3: Replace the event listeners at the bottom of `renderLessonsPanel()`**

Find and remove this block (lines 98–117):
```js
  document.getElementById('cancelLessonForm').addEventListener('click', () => {
    document.getElementById('lessonFormModal').classList.add('hidden')
  })
  document.getElementById('lessonForm').addEventListener('submit', async e => {
    e.preventDefault()
    const id = document.getElementById('lessonId').value
    const payload = {
      titulo: document.getElementById('lessonTitulo').value,
      descripcion: document.getElementById('lessonDescripcion').value,
      contenido: document.getElementById('lessonContenido').value,
      orden: parseInt(document.getElementById('lessonOrden').value),
    }
    if (id) {
      await supabase.from('lecciones').update(payload).eq('id', id)
    } else {
      await supabase.from('lecciones').insert(payload)
    }
    document.getElementById('lessonFormModal').classList.add('hidden')
    renderLessonsPanel()
  })
```

Replace with:
```js
  document.getElementById('cancelLessonForm').addEventListener('click', () => {
    document.getElementById('lessonFormModal').classList.add('hidden')
  })

  document.getElementById('lessonTitulo').addEventListener('input', e => {
    document.getElementById('previewTitle').textContent = e.target.value
  })
  document.getElementById('lessonDescripcion').addEventListener('input', e => {
    document.getElementById('previewDesc').textContent = e.target.value
  })

  document.querySelectorAll('.add-block').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type
      const defaults = {
        step:  { type, text: '' },
        image: { type, url: '', caption: '' },
        video: { type, url: '', label: '' },
        link:  { type, url: '', label: '' },
      }
      currentBlocks.push(defaults[type])
      renderBlockList()
      updatePreview()
    })
  })

  document.getElementById('saveLessonBtn').addEventListener('click', async () => {
    const id = document.getElementById('lessonId').value
    const payload = {
      titulo: document.getElementById('lessonTitulo').value,
      descripcion: document.getElementById('lessonDescripcion').value,
      contenido: JSON.stringify(currentBlocks),
      orden: parseInt(document.getElementById('lessonOrden').value),
    }
    if (id) {
      await supabase.from('lecciones').update(payload).eq('id', id)
    } else {
      await supabase.from('lecciones').insert(payload)
    }
    document.getElementById('lessonFormModal').classList.add('hidden')
    renderLessonsPanel()
  })
```

- [ ] **Step 4: Replace `openLessonForm()` (lines 120–128)**

Replace:
```js
function openLessonForm(lesson = null) {
  document.getElementById('lessonFormTitle').textContent = lesson ? 'Editar lección' : 'Nueva lección'
  document.getElementById('lessonId').value = lesson?.id || ''
  document.getElementById('lessonTitulo').value = lesson?.titulo || ''
  document.getElementById('lessonDescripcion').value = lesson?.descripcion || ''
  document.getElementById('lessonContenido').value = lesson?.contenido || ''
  document.getElementById('lessonOrden').value = lesson?.orden || ''
  document.getElementById('lessonFormModal').classList.remove('hidden')
}
```

With:
```js
function openLessonForm(lesson = null) {
  document.getElementById('lessonFormTitle').textContent = lesson ? 'Editar lección' : 'Nueva lección'
  document.getElementById('lessonId').value = lesson?.id || ''
  document.getElementById('lessonTitulo').value = lesson?.titulo || ''
  document.getElementById('lessonDescripcion').value = lesson?.descripcion || ''
  document.getElementById('lessonOrden').value = lesson?.orden || ''
  document.getElementById('previewTitle').textContent = lesson?.titulo || ''
  document.getElementById('previewDesc').textContent = lesson?.descripcion || ''

  try {
    currentBlocks = lesson?.contenido ? JSON.parse(lesson.contenido) : []
    if (!Array.isArray(currentBlocks)) currentBlocks = []
  } catch (_) {
    currentBlocks = []
  }

  renderBlockList()
  updatePreview()
  document.getElementById('lessonFormModal').classList.remove('hidden')
}
```

- [ ] **Step 5: Add helper functions after `openLessonForm()`**

Insert these three functions immediately after `openLessonForm()`, before `renderGlossaryPanel()`:

```js
function renderBlockList() {
  const list = document.getElementById('blockList')
  if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null }

  list.innerHTML = currentBlocks.map((b, i) => blockItemHtml(b, i)).join('')

  list.querySelectorAll('input, textarea').forEach(input => {
    input.addEventListener('input', () => {
      const idx = parseInt(input.closest('[data-idx]').dataset.idx)
      currentBlocks[idx][input.dataset.field] = input.value
      updatePreview()
    })
  })

  list.querySelectorAll('.del-block').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.closest('[data-idx]').dataset.idx)
      currentBlocks.splice(idx, 1)
      renderBlockList()
      updatePreview()
    })
  })

  sortableInstance = Sortable.create(list, {
    handle: '.drag-handle',
    animation: 150,
    onEnd(evt) {
      const moved = currentBlocks.splice(evt.oldIndex, 1)[0]
      currentBlocks.splice(evt.newIndex, 0, moved)
      updatePreview()
    },
  })
}

function blockItemHtml(block, i) {
  const colors = { step: '#E92129', image: '#3b82f6', video: '#8b5cf6', link: '#16a34a' }
  const labels = { step: '📝 Paso', image: '🖼️ Imagen', video: '▶️ Video YouTube', link: '🔗 Link' }
  const color = colors[block.type] || '#94a3b8'
  const label = labels[block.type] || block.type

  let fields = ''
  if (block.type === 'step') {
    fields = `<textarea data-field="text" rows="2" placeholder="Texto del paso..."
      class="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129] resize-none">${escapeHtml(block.text || '')}</textarea>`
  } else if (block.type === 'image') {
    fields = `<input data-field="url" value="${escapeHtml(block.url || '')}" placeholder="URL de imagen"
        class="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129] mb-1.5">
      <input data-field="caption" value="${escapeHtml(block.caption || '')}" placeholder="Pie de foto (opcional)"
        class="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129]">`
  } else if (block.type === 'video') {
    fields = `<input data-field="url" value="${escapeHtml(block.url || '')}" placeholder="URL de YouTube"
        class="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129] mb-1.5">
      <input data-field="label" value="${escapeHtml(block.label || '')}" placeholder="Etiqueta del video"
        class="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129]">`
  } else if (block.type === 'link') {
    fields = `<input data-field="url" value="${escapeHtml(block.url || '')}" placeholder="URL del enlace"
        class="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129] mb-1.5">
      <input data-field="label" value="${escapeHtml(block.label || '')}" placeholder="Texto del enlace"
        class="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129]">`
  }

  return `<div data-idx="${i}" class="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-start gap-2">
    <div class="drag-handle text-slate-300 text-lg cursor-grab mt-0.5 select-none leading-none">⠿</div>
    <div class="flex-1 min-w-0">
      <div class="text-[9px] font-black uppercase mb-1.5" style="color:${color}">${label}</div>
      ${fields}
    </div>
    <button class="del-block text-slate-300 hover:text-red-400 text-sm px-1 mt-0.5 shrink-0">✕</button>
  </div>`
}

function updatePreview() {
  const preview = document.getElementById('lessonPreview')
  if (!preview) return
  preview.innerHTML = ''
  preview.appendChild(renderBlocks(currentBlocks))
}
```

- [ ] **Step 6: Verify full editor in browser**

Open `admin.html` → login → Lecciones panel. Run through this checklist:

1. Click "Nueva lección" → wide split-panel modal opens (editor left, preview right)
2. Type in Título → preview title updates in real-time
3. Type in Descripción → preview description updates
4. Click "+ Paso" → step block appears with textarea; type text → preview shows red numbered circle + text
5. Click "+ Imagen" → image block with URL + caption inputs
6. Enter `https://picsum.photos/400/200` in URL → preview shows the image
7. Enter caption text → preview shows caption below image
8. Click "+ Video" → video block with URL + label inputs; enter any URL → preview shows dark card with play button
9. Click "+ Link" → link block with URL + label; fill both → preview shows white card with 🔗
10. Drag a block by the ⠿ handle → block reorders, preview updates immediately
11. Click ✕ on a block → block removed, preview updates
12. Fill in Orden = 1 → click "Guardar lección" → modal closes, lesson appears in list
13. Click edit on that lesson → modal opens with all blocks pre-populated, preview matches
14. Clicking ✕ (cancel) closes modal without saving

- [ ] **Step 7: Verify student view**

Open `index.html` → navigate to Lecciones → click the lesson saved in Step 6 → blocks render with numbered steps, image, video card, link card. No console errors.

- [ ] **Step 8: Commit**

```bash
git add js/admin.js
git commit -m "feat: block-based split-panel lesson editor with live preview and drag & drop"
```
