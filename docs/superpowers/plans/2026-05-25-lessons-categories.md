# Lessons Categories & Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add category-based sidebar navigation to the student lessons section (accordion on desktop, 3-screen mobile flow), a search bar, notes field, YouTube iframe embeds, and B/I/U rich text formatting in step blocks.

**Architecture:** Five targeted changes — a new `step-formatter.js` module handles markdown-style formatting; `block-renderer.js` gains YouTube iframe support and consumes `renderStepText`; `lessons.js` is fully rewritten as a split-panel layout (no modal); `admin.js` gains three new fields (categoria, notas, B/I/U toolbar); `index.html` gets the Asistente IA button styled black. The database requires two new columns added manually in Supabase before any code change.

**Tech Stack:** Vanilla JS ES Modules, Tailwind CSS CDN, Supabase JS v2. No build step — browser runs modules directly.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `js/step-formatter.js` | **Create** | `applyFormat()` + `renderStepText()` — B/I/U toolbar logic and marker parser |
| `js/block-renderer.js` | **Modify** | Video block → YouTube iframe; step block → `renderStepText` |
| `js/admin.js` | **Modify** | Add categoria select, notas textarea, B/I/U toolbar to lesson editor |
| `js/lessons.js` | **Full rewrite** | Split-panel desktop layout + 3-screen mobile navigation |
| `index.html` | **Modify** | Asistente IA nav button → black background |
| Supabase dashboard | **Manual SQL** | Add `categoria` and `notas` columns to `lecciones` table |

---

### Task 1: Database migration

**Files:**
- No files modified — run SQL in Supabase dashboard

- [ ] **Step 1: Open Supabase SQL editor**

Go to your Supabase project → SQL Editor → New query. Run this:

```sql
ALTER TABLE lecciones ADD COLUMN categoria text NOT NULL DEFAULT 'Ventas';
ALTER TABLE lecciones ADD COLUMN notas text;
```

- [ ] **Step 2: Verify columns exist**

Run in the same editor:

```sql
SELECT id, titulo, categoria, notas FROM lecciones LIMIT 3;
```

Expected: result shows `categoria` column with value `"Ventas"` for all existing rows, `notas` is NULL.

- [ ] **Step 3: Commit a note**

```bash
git add .
git commit -m "docs: note database migration for categoria and notas columns"
```

---

### Task 2: Create `js/step-formatter.js`

**Files:**
- Create: `js/step-formatter.js`

This module has two exports:
- `applyFormat(textarea, marker)` — wraps selected text (or inserts empty pair at cursor) with a marker like `**`, `*`, `__`
- `renderStepText(text)` — parses those markers and returns a DocumentFragment of text nodes + styled elements

- [ ] **Step 1: Create the file with this exact content**

```js
export function applyFormat(textarea, marker) {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const val = textarea.value

  if (start !== end) {
    const selected = val.slice(start, end)
    textarea.value = val.slice(0, start) + marker + selected + marker + val.slice(end)
    textarea.selectionStart = start + marker.length
    textarea.selectionEnd = end + marker.length
  } else {
    textarea.value = val.slice(0, start) + marker + marker + val.slice(start)
    const pos = start + marker.length
    textarea.selectionStart = pos
    textarea.selectionEnd = pos
  }

  textarea.focus()
  textarea.dispatchEvent(new Event('input'))
}

export function renderStepText(text) {
  const frag = document.createDocumentFragment()
  if (text == null) return frag
  let remaining = String(text)

  // Order matters: ** must come before * so "**bold**" matches strong, not em
  const patterns = [
    { re: /\*\*(.+?)\*\*/s, tag: 'strong' },
    { re: /\*(.+?)\*/s,     tag: 'em'     },
    { re: /__(.+?)__/s,     tag: 'u'      },
  ]

  while (remaining.length > 0) {
    let earliest = null
    for (const { re, tag } of patterns) {
      const m = re.exec(remaining)
      if (m && (earliest === null || m.index < earliest.index)) {
        earliest = { index: m.index, length: m[0].length, inner: m[1], tag }
      }
    }

    if (!earliest) {
      frag.append(document.createTextNode(remaining))
      break
    }

    if (earliest.index > 0) {
      frag.append(document.createTextNode(remaining.slice(0, earliest.index)))
    }

    const el = document.createElement(earliest.tag)
    el.textContent = earliest.inner
    frag.append(el)

    remaining = remaining.slice(earliest.index + earliest.length)
  }

  return frag
}
```

- [ ] **Step 2: Manual smoke test**

Open the browser console on any page that can load ES modules. Paste and run:

```js
// Paste in browser console to verify renderStepText logic manually
import('/js/step-formatter.js').then(({ renderStepText }) => {
  const frag = renderStepText('Haz clic en **Guardar** y luego en *Confirmar*')
  const div = document.createElement('div')
  div.appendChild(frag)
  console.log(div.innerHTML)
  // Expected: "Haz clic en <strong>Guardar</strong> y luego en <em>Confirmar</em>"
})
```

- [ ] **Step 3: Commit**

```bash
git add js/step-formatter.js
git commit -m "feat: add step-formatter module with applyFormat and renderStepText"
```

---

### Task 3: Update `js/block-renderer.js`

**Files:**
- Modify: `js/block-renderer.js`

Two changes: (1) import `renderStepText` and use it for step blocks; (2) replace the video dark-card anchor with a YouTube iframe.

- [ ] **Step 1: Add import at the top of the file**

The current file starts with `export function renderBlocks(blocks) {`. Add one line before it:

```js
import { renderStepText } from './step-formatter.js'
```

- [ ] **Step 2: Update the step block renderer**

Find this line (around line 16):

```js
      p.textContent = block.text != null ? String(block.text) : ''
```

Replace it with:

```js
      p.appendChild(renderStepText(block.text != null ? String(block.text) : ''))
```

- [ ] **Step 3: Replace the entire video block branch**

Find and replace the entire `} else if (block.type === 'video') {` block. The current block is the section from `} else if (block.type === 'video') {` through the closing `frag.append(a)` line (before the `} else if (block.type === 'link') {` line). Replace the whole video block with:

```js
    } else if (block.type === 'video') {
      let videoId = null
      try {
        const u = new URL(block.url)
        if (u.hostname.includes('youtube.com')) videoId = u.searchParams.get('v')
        else if (u.hostname === 'youtu.be') videoId = u.pathname.slice(1)
      } catch (_) {}
      if (!videoId) continue

      const wrap = document.createElement('div')
      wrap.style.cssText = 'margin-bottom:14px'

      const iframe = document.createElement('iframe')
      iframe.src = `https://www.youtube.com/embed/${videoId}`
      iframe.setAttribute('allowfullscreen', '')
      iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture')
      iframe.setAttribute('loading', 'lazy')
      iframe.style.cssText = 'width:100%;aspect-ratio:16/9;border:0;border-radius:10px;display:block'
      wrap.append(iframe)

      if (block.label) {
        const cap = document.createElement('p')
        cap.style.cssText = 'font-size:11px;color:#94a3b8;margin:6px 0 0'
        cap.textContent = block.label
        wrap.append(cap)
      }

      frag.append(wrap)
```

- [ ] **Step 4: Verify the complete file looks correct**

The full `js/block-renderer.js` should now be:

```js
import { renderStepText } from './step-formatter.js'

export function renderBlocks(blocks) {
  if (!Array.isArray(blocks)) return document.createDocumentFragment()
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
      p.appendChild(renderStepText(block.text != null ? String(block.text) : ''))
      wrap.append(circle, p)
      frag.append(wrap)

    } else if (block.type === 'image') {
      let validUrl = false
      try { new URL(block.url); validUrl = true } catch (_) {}
      if (validUrl && !/^https?:\/\//i.test(block.url)) validUrl = false
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
      let videoId = null
      try {
        const u = new URL(block.url)
        if (u.hostname.includes('youtube.com')) videoId = u.searchParams.get('v')
        else if (u.hostname === 'youtu.be') videoId = u.pathname.slice(1)
      } catch (_) {}
      if (!videoId) continue

      const wrap = document.createElement('div')
      wrap.style.cssText = 'margin-bottom:14px'

      const iframe = document.createElement('iframe')
      iframe.src = `https://www.youtube.com/embed/${videoId}`
      iframe.setAttribute('allowfullscreen', '')
      iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture')
      iframe.setAttribute('loading', 'lazy')
      iframe.style.cssText = 'width:100%;aspect-ratio:16/9;border:0;border-radius:10px;display:block'
      wrap.append(iframe)

      if (block.label) {
        const cap = document.createElement('p')
        cap.style.cssText = 'font-size:11px;color:#94a3b8;margin:6px 0 0'
        cap.textContent = block.label
        wrap.append(cap)
      }

      frag.append(wrap)

    } else if (block.type === 'link') {
      let validUrl = false
      try { new URL(block.url); validUrl = true } catch (_) {}
      if (validUrl && !/^https?:\/\//i.test(block.url)) validUrl = false
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

- [ ] **Step 5: Open admin.html in browser, edit a lesson that has a video block**

Add a video block with URL `https://www.youtube.com/watch?v=dQw4w9WgXcQ`. The live preview panel should show an embedded YouTube iframe instead of the old dark play-button card.

- [ ] **Step 6: Verify step bold text**

Add a step block with text `Haz clic en **Guardar**`. The preview should show "Haz clic en **Guardar**" with "Guardar" in bold.

- [ ] **Step 7: Commit**

```bash
git add js/block-renderer.js
git commit -m "feat: video blocks render as YouTube iframes, step blocks support bold/italic/underline"
```

---

### Task 4: Update `js/admin.js`

**Files:**
- Modify: `js/admin.js`

Four changes: (1) import `applyFormat`; (2) add `lessonCategoria` select and `lessonNotas` textarea to modal HTML; (3) add B/I/U toolbar to step block HTML; (4) wire toolbar buttons and populate/save new fields.

- [ ] **Step 1: Add import at the top of `js/admin.js`**

The file currently starts with:

```js
import { supabase } from './supabase.js'
import { requireAuth, logout } from './auth.js'
import { renderBlocks } from './block-renderer.js'
```

Change it to:

```js
import { supabase } from './supabase.js'
import { requireAuth, logout } from './auth.js'
import { renderBlocks } from './block-renderer.js'
import { applyFormat } from './step-formatter.js'
```

- [ ] **Step 2: Add `lessonCategoria` select to the modal HTML**

Inside `renderLessonsPanel()`, find this block in the modal HTML template:

```js
            <div class="space-y-2 mb-4">
              <input id="lessonTitulo" placeholder="Título" required
                class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
              <input id="lessonDescripcion" placeholder="Descripción corta" required
                class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
            </div>
```

Replace it with:

```js
            <div class="space-y-2 mb-4">
              <input id="lessonTitulo" placeholder="Título" required
                class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
              <input id="lessonDescripcion" placeholder="Descripción corta" required
                class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
              <select id="lessonCategoria"
                class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129] bg-white">
                <option>Ventas</option>
                <option>Inventario</option>
                <option>Ingresos</option>
                <option>Egresos</option>
                <option>Contactos</option>
                <option>Configuración</option>
              </select>
            </div>
```

- [ ] **Step 3: Add `lessonNotas` textarea to the modal HTML**

Find the add-block buttons div followed immediately by the orden+save row:

```js
            <div class="flex flex-wrap gap-1.5 mb-4">
              <button data-type="step" class="add-block bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-slate-200">+ Paso</button>
              <button data-type="image" class="add-block bg-blue-50 text-blue-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-blue-100">+ Imagen</button>
              <button data-type="video" class="add-block bg-purple-50 text-purple-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-purple-100">+ Video</button>
              <button data-type="link" class="add-block bg-green-50 text-green-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-green-100">+ Link</button>
            </div>
            <div class="flex items-end gap-3 pt-3 border-t border-slate-100">
```

Replace with:

```js
            <div class="flex flex-wrap gap-1.5 mb-4">
              <button data-type="step" class="add-block bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-slate-200">+ Paso</button>
              <button data-type="image" class="add-block bg-blue-50 text-blue-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-blue-100">+ Imagen</button>
              <button data-type="video" class="add-block bg-purple-50 text-purple-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-purple-100">+ Video</button>
              <button data-type="link" class="add-block bg-green-50 text-green-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-green-100">+ Link</button>
            </div>
            <div class="mb-4">
              <p class="text-[10px] font-black uppercase text-slate-400 tracking-wide mb-1">Notas</p>
              <textarea id="lessonNotas" placeholder="Notas adicionales para el estudiante (opcional)..." rows="3"
                class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#E92129] resize-none"></textarea>
            </div>
            <div class="flex items-end gap-3 pt-3 border-t border-slate-100">
```

- [ ] **Step 4: Add B/I/U toolbar to step blocks in `blockItemHtml()`**

Find the step block fields in `blockItemHtml()`:

```js
  if (block.type === 'step') {
    fields = `<textarea data-field="text" rows="2" placeholder="Texto del paso..."
      class="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129] resize-none">${escapeHtml(block.text || '')}</textarea>`
```

Replace with:

```js
  if (block.type === 'step') {
    fields = `
      <div class="flex gap-1 mb-1.5">
        <button type="button" class="fmt-btn px-2 py-0.5 rounded text-[10px] font-black bg-slate-200 hover:bg-slate-300 text-slate-700 leading-none" data-marker="**" title="Negrita"><strong>B</strong></button>
        <button type="button" class="fmt-btn px-2 py-0.5 rounded text-[10px] font-black bg-slate-200 hover:bg-slate-300 text-slate-700 leading-none" data-marker="*" title="Cursiva"><em>I</em></button>
        <button type="button" class="fmt-btn px-2 py-0.5 rounded text-[10px] font-black bg-slate-200 hover:bg-slate-300 text-slate-700 leading-none" data-marker="__" title="Subrayado"><u>U</u></button>
      </div>
      <textarea data-field="text" rows="2" placeholder="Texto del paso..."
        class="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129] resize-none">${escapeHtml(block.text || '')}</textarea>`
```

- [ ] **Step 5: Wire fmt-btn clicks in `renderBlockList()`**

Inside `renderBlockList()`, after the block that wires `.del-block` listeners (around line 210-217), add:

```js
  list.querySelectorAll('.fmt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const textarea = btn.closest('[data-idx]').querySelector('textarea[data-field="text"]')
      applyFormat(textarea, btn.dataset.marker)
    })
  })
```

- [ ] **Step 6: Populate categoria and notas in `openLessonForm()`**

Find the `openLessonForm` function. After the line:

```js
  document.getElementById('lessonDescripcion').value = lesson?.descripcion || ''
```

Add:

```js
  document.getElementById('lessonCategoria').value = lesson?.categoria || 'Ventas'
  document.getElementById('lessonNotas').value = lesson?.notas || ''
```

- [ ] **Step 7: Include categoria and notas in save payload**

Find the `saveLessonBtn` click handler and the `payload` object:

```js
    const payload = {
      titulo,
      descripcion: document.getElementById('lessonDescripcion').value,
      contenido: JSON.stringify(currentBlocks),
      orden,
    }
```

Replace with:

```js
    const payload = {
      titulo,
      descripcion: document.getElementById('lessonDescripcion').value,
      contenido: JSON.stringify(currentBlocks),
      orden,
      categoria: document.getElementById('lessonCategoria').value,
      notas: document.getElementById('lessonNotas').value.trim() || null,
    }
```

- [ ] **Step 8: Verify in browser**

Open `admin.html`. Click "Nueva lección":
- Confirm you see the Categoría dropdown (Ventas selected by default)
- Confirm you see the Notas textarea below the add-block buttons
- Add a Paso block — confirm B/I/U buttons appear above the textarea
- Select some text in the textarea, click B — confirm it wraps with `**text**`
- Click B without selection — confirm `****` is inserted with cursor between the markers

- [ ] **Step 9: Commit**

```bash
git add js/admin.js
git commit -m "feat: add categoria, notas, and B/I/U formatting toolbar to lesson editor"
```

---

### Task 5: Update `index.html` — Asistente IA button

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Find the Asistente IA desktop nav button**

In `index.html`, find this button (around line 60):

```html
    <button data-tab="assistant" class="nav-tab-desk flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-[#E92129] bg-red-50 dark:bg-red-950/30">
      <i data-lucide="bot" class="w-4 h-4"></i> Asistente IA
    </button>
```

Replace with:

```html
    <button data-tab="assistant" class="nav-tab-desk flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-white bg-[#111] dark:bg-[#111]">
      <i data-lucide="bot" class="w-4 h-4"></i> Asistente IA
    </button>
```

- [ ] **Step 2: Verify in browser**

Open `index.html`. The Asistente IA button in the left desktop sidebar should have a black background with white text. The Lecciones and Recursos buttons should be unchanged.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "style: Asistente IA nav button black background"
```

---

### Task 6: Rewrite `js/lessons.js`

**Files:**
- Modify (full rewrite): `js/lessons.js`

This is a complete replacement. The current flat-grid + modal approach is deleted entirely and replaced with a split-panel desktop layout and 3-screen mobile layout.

- [ ] **Step 1: Replace the entire file with this content**

```js
import { supabase } from './supabase.js'
import { renderBlocks } from './block-renderer.js'

const CATEGORIES = [
  { key: 'Ventas',        emoji: '📊' },
  { key: 'Inventario',    emoji: '📦' },
  { key: 'Ingresos',      emoji: '💰' },
  { key: 'Egresos',       emoji: '💸' },
  { key: 'Contactos',     emoji: '👥' },
  { key: 'Configuración', emoji: '⚙️' },
]

function escapeHtml(text) {
  if (text == null) return ''
  return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

async function renderLessons() {
  const container = document.getElementById('section-lessons')
  container.innerHTML = '<div class="flex items-center justify-center h-full text-slate-400 text-sm">Cargando lecciones...</div>'

  const { data: lessons, error } = await supabase
    .from('lecciones')
    .select('*')
    .order('orden')

  if (error || !lessons?.length) {
    container.innerHTML = '<p class="text-slate-400 text-sm text-center pt-16">No hay lecciones disponibles.</p>'
    return
  }

  // Group by category, preserving CATEGORIES order
  const grouped = {}
  for (const cat of CATEGORIES) grouped[cat.key] = []
  for (const l of lessons) {
    const cat = l.categoria || 'Ventas'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(l)
  }

  // Initial state
  const firstCat = CATEGORIES.find(c => grouped[c.key].length > 0)?.key || CATEGORIES[0].key
  let activeCategory = firstCat
  let activeLesson = grouped[firstCat]?.[0] || null
  let searchQuery = ''

  // Build skeleton
  container.innerHTML = `
    <!-- MOBILE: 3-screen stack (hidden on md+) -->
    <div class="md:hidden absolute inset-0">
      <div id="ls-screen-categories" class="absolute inset-0 flex flex-col bg-white">
        <div class="px-4 py-3 border-b border-slate-100 shrink-0">
          <h2 class="font-black text-base">Lecciones</h2>
        </div>
        <div id="ls-cat-list" class="flex-1 overflow-y-auto"></div>
      </div>

      <div id="ls-screen-lessons" class="absolute inset-0 flex-col bg-white hidden">
        <div class="bg-[#E92129] px-4 py-3 flex items-center gap-3 shrink-0">
          <button id="ls-back-cats" class="text-white/80 text-2xl font-bold leading-none">‹</button>
          <span id="ls-mob-cat-title" class="text-white font-black text-sm flex-1"></span>
        </div>
        <div class="px-3 py-2 border-b border-slate-100 shrink-0">
          <div class="flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2">
            <span class="text-slate-400 text-sm">🔍</span>
            <input id="ls-mob-search" placeholder="Buscar lección..." class="bg-transparent text-sm flex-1 outline-none placeholder-slate-400">
          </div>
        </div>
        <div id="ls-lesson-list" class="flex-1 overflow-y-auto"></div>
      </div>

      <div id="ls-screen-content" class="absolute inset-0 flex-col bg-slate-50 hidden">
        <div class="bg-[#E92129] px-4 py-3 flex items-center gap-3 shrink-0">
          <button id="ls-back-lessons" class="text-white/80 text-2xl font-bold leading-none">‹</button>
          <span id="ls-mob-lesson-title" class="text-white font-black text-sm flex-1 truncate"></span>
        </div>
        <div id="ls-mob-content" class="flex-1 overflow-y-auto p-4 custom-scroll"></div>
      </div>
    </div>

    <!-- DESKTOP: sidebar + content panel (hidden below md) -->
    <div class="hidden md:flex absolute inset-0">
      <div class="w-48 bg-white border-r border-slate-100 flex flex-col shrink-0">
        <div class="p-2.5 border-b border-slate-100 shrink-0">
          <div class="flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2">
            <span class="text-slate-400 text-xs">🔍</span>
            <input id="ls-desk-search" placeholder="Buscar..." class="bg-transparent text-xs flex-1 outline-none placeholder-slate-400">
          </div>
        </div>
        <div id="ls-accordion" class="flex-1 overflow-y-auto custom-scroll"></div>
      </div>
      <div id="ls-desk-content" class="flex-1 overflow-y-auto p-5 bg-slate-50 custom-scroll"></div>
    </div>
  `

  // ── Shared: render lesson content into any container ──────────────────────
  function renderLessonContent(container, lesson) {
    container.innerHTML = ''
    const catLessons = grouped[lesson.categoria || 'Ventas'] || []
    const lessonIdx = catLessons.findIndex(l => l.id === lesson.id) + 1

    let blocks = []
    let isLegacy = false
    try {
      const p = JSON.parse(lesson.contenido)
      if (Array.isArray(p)) blocks = p
      else isLegacy = true
    } catch (_) { isLegacy = true }

    // If first block is a video, promote it above the title
    const firstVideoIdx = blocks.findIndex(b => b.type === 'video')
    let topVideo = null, restBlocks = blocks
    if (firstVideoIdx === 0) { topVideo = blocks[0]; restBlocks = blocks.slice(1) }

    if (topVideo) container.appendChild(renderBlocks([topVideo]))

    const titleEl = document.createElement('h2')
    titleEl.className = 'font-black text-base text-slate-900 mb-0.5'
    titleEl.textContent = lesson.titulo

    const metaEl = document.createElement('p')
    metaEl.className = 'text-xs text-slate-400 mb-4'
    metaEl.textContent = `${lesson.categoria || 'Ventas'} · Lección ${lessonIdx}`

    container.append(titleEl, metaEl)

    if (restBlocks.length > 0) {
      container.appendChild(renderBlocks(restBlocks))
    } else if (isLegacy && lesson.contenido) {
      // Legacy HTML fallback for lessons saved before block editor
      const div = document.createElement('div')
      div.innerHTML = lesson.contenido
      container.append(div)
    }

    if (lesson.notas) {
      const notasWrap = document.createElement('div')
      notasWrap.style.cssText = 'margin-top:16px;background:#fefce8;border-left:3px solid #eab308;border-radius:8px;padding:12px 14px'
      const notasTitle = document.createElement('p')
      notasTitle.style.cssText = 'font-size:11px;font-weight:900;color:#854d0e;margin-bottom:6px'
      notasTitle.textContent = '📝 Notas'
      const notasText = document.createElement('p')
      notasText.style.cssText = 'font-size:12px;color:#713f12;line-height:1.5'
      notasText.textContent = lesson.notas
      notasWrap.append(notasTitle, notasText)
      container.append(notasWrap)
    }
  }

  // ── Desktop: accordion ────────────────────────────────────────────────────
  function renderAccordion() {
    const accordion = document.getElementById('ls-accordion')
    accordion.innerHTML = CATEGORIES
      .filter(c => grouped[c.key].length > 0)
      .map(cat => {
        const isOpen = cat.key === activeCategory
        const catLessons = grouped[cat.key]
        const q = searchQuery.toLowerCase()
        const filtered = q
          ? catLessons.filter(l =>
              l.titulo.toLowerCase().includes(q) ||
              (l.descripcion || '').toLowerCase().includes(q))
          : catLessons

        const lessonRows = isOpen ? `
          <div>
            ${filtered.map(l => {
              const isActive = activeLesson?.id === l.id
              return `<button
                class="acc-lesson w-full text-left px-4 py-2.5 text-xs border-b border-slate-100/60 hover:bg-red-50 transition-colors ${isActive ? 'bg-red-50 border-l-2 border-l-[#E92129]' : ''}"
                data-id="${l.id}">
                <span class="${isActive ? 'font-bold text-[#E92129]' : 'text-slate-600'}">${escapeHtml(l.titulo)}</span>
              </button>`
            }).join('')}
            ${filtered.length === 0 && q ? '<p class="text-xs text-slate-400 px-4 py-2">Sin resultados</p>' : ''}
          </div>` : ''

        return `
          <div>
            <button class="acc-cat w-full flex items-center justify-between px-3 py-2.5 border-b border-slate-100 hover:bg-slate-50 transition-colors" data-cat="${escapeHtml(cat.key)}">
              <span class="text-xs font-black ${isOpen ? 'text-[#E92129]' : 'text-slate-600'}">${cat.emoji} ${escapeHtml(cat.key)}</span>
              <span class="text-[10px] ${isOpen ? 'text-[#E92129]' : 'text-slate-300'}">${isOpen ? '▾' : '▸'}</span>
            </button>
            ${lessonRows}
          </div>`
      }).join('')

    accordion.querySelectorAll('.acc-cat').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.cat
        searchQuery = ''
        const searchEl = document.getElementById('ls-desk-search')
        if (searchEl) searchEl.value = ''
        renderAccordion()
      })
    })

    accordion.querySelectorAll('.acc-lesson').forEach(btn => {
      btn.addEventListener('click', () => {
        activeLesson = lessons.find(l => l.id === btn.dataset.id) || null
        renderAccordion()
        renderDeskContent()
      })
    })
  }

  function renderDeskContent() {
    const panel = document.getElementById('ls-desk-content')
    if (!panel) return
    if (!activeLesson) {
      panel.innerHTML = '<p class="text-slate-400 text-sm">Selecciona una lección.</p>'
      return
    }
    renderLessonContent(panel, activeLesson)
  }

  // Desktop search
  document.getElementById('ls-desk-search')?.addEventListener('input', e => {
    searchQuery = e.target.value
    renderAccordion()
  })

  // ── Mobile: screens ───────────────────────────────────────────────────────
  function showScreen(name) {
    const screens = ['categories', 'lessons', 'content']
    for (const s of screens) {
      const el = document.getElementById(`ls-screen-${s}`)
      if (!el) continue
      if (s === name) {
        el.classList.remove('hidden')
        el.classList.add('flex')
      } else {
        el.classList.add('hidden')
        el.classList.remove('flex')
      }
    }
  }

  function renderMobileCatList() {
    const list = document.getElementById('ls-cat-list')
    list.innerHTML = ''
    CATEGORIES.filter(c => grouped[c.key].length > 0).forEach(cat => {
      const btn = document.createElement('button')
      btn.className = 'w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 text-left hover:bg-slate-50 transition-colors'
      btn.innerHTML = `
        <span class="text-lg">${cat.emoji}</span>
        <span class="font-bold text-sm flex-1 text-slate-800">${escapeHtml(cat.key)}</span>
        <span class="text-slate-300 text-xl">›</span>`
      btn.addEventListener('click', () => {
        activeCategory = cat.key
        renderMobileLessonList()
        showScreen('lessons')
      })
      list.append(btn)
    })
  }

  function renderMobileLessonList() {
    const catObj = CATEGORIES.find(c => c.key === activeCategory)
    const titleEl = document.getElementById('ls-mob-cat-title')
    if (titleEl) titleEl.textContent = `${catObj?.emoji || ''} ${activeCategory}`

    const q = document.getElementById('ls-mob-search')?.value?.toLowerCase() || ''
    const filtered = (grouped[activeCategory] || []).filter(l =>
      !q || l.titulo.toLowerCase().includes(q) || (l.descripcion || '').toLowerCase().includes(q))

    const list = document.getElementById('ls-lesson-list')
    list.innerHTML = ''
    filtered.forEach(l => {
      const isActive = activeLesson?.id === l.id
      const btn = document.createElement('button')
      btn.className = `w-full text-left px-4 py-3.5 border-b border-slate-100 hover:bg-slate-50 transition-colors ${isActive ? 'border-l-2 border-l-[#E92129] bg-red-50/40' : ''}`
      const title = document.createElement('p')
      title.className = `text-sm ${isActive ? 'font-bold text-[#E92129]' : 'font-medium text-slate-700'}`
      title.textContent = l.titulo
      btn.append(title)
      btn.addEventListener('click', () => {
        activeLesson = l
        renderMobileLessonList()
        document.getElementById('ls-mob-lesson-title').textContent = l.titulo
        renderLessonContent(document.getElementById('ls-mob-content'), l)
        showScreen('content')
      })
      list.append(btn)
    })

    if (filtered.length === 0 && q) {
      const empty = document.createElement('p')
      empty.className = 'text-slate-400 text-sm px-4 py-4'
      empty.textContent = 'Sin resultados.'
      list.append(empty)
    }
  }

  // Mobile back buttons
  document.getElementById('ls-back-cats')?.addEventListener('click', () => showScreen('categories'))
  document.getElementById('ls-back-lessons')?.addEventListener('click', () => showScreen('lessons'))

  // Mobile search
  document.getElementById('ls-mob-search')?.addEventListener('input', () => renderMobileLessonList())

  // ── Initialize ────────────────────────────────────────────────────────────
  renderMobileCatList()
  renderMobileLessonList()
  showScreen('categories')

  renderAccordion()
  renderDeskContent()
}

renderLessons()
```

- [ ] **Step 2: Open `index.html` in browser on desktop (≥768px wide)**

Verify:
- Left panel shows search bar + accordion with categories
- Only the first category (that has lessons) is open
- First lesson is highlighted in red
- Right panel shows the first lesson content with YouTube iframe at top (if video block is first)
- Clicking a closed category opens it and closes the previous one
- Clicking a lesson updates the right panel
- Typing in search filters lessons in the open category only

- [ ] **Step 3: Resize browser to mobile width (<768px)**

Verify:
- You see the category list (Screen 1) with all 6 categories
- Tapping a category navigates to Screen 2 (lesson list with red header + back button + search)
- Tapping a lesson navigates to Screen 3 (content with red header + back button + YouTube iframe)
- Back buttons work correctly
- Bottom nav (Asistente / Lecciones / Recursos) stays visible on all 3 screens

- [ ] **Step 4: Verify notas section**

Edit a lesson in admin, add text to the Notas field, save. On the student view, open that lesson — verify the yellow "📝 Notas" card appears below the block content.

- [ ] **Step 5: Commit**

```bash
git add js/lessons.js
git commit -m "feat: lessons redesign with category sidebar, search, mobile 3-screen navigation, and notes"
```

---

## Self-Review Checklist (run before handing off)

After completing all tasks, verify:

- [ ] `lecciones` table has both `categoria` and `notas` columns in Supabase
- [ ] `js/step-formatter.js` exists and is committed
- [ ] `js/block-renderer.js` imports `renderStepText` and video blocks show iframes
- [ ] `js/admin.js` shows categoria dropdown, notas textarea, and B/I/U toolbar on step blocks
- [ ] `js/lessons.js` shows the split-panel desktop layout and 3-screen mobile flow
- [ ] `index.html` Asistente IA button has black background
- [ ] No console errors on either `index.html` or `admin.html`
- [ ] Existing legacy lessons (HTML content) still render via innerHTML fallback
