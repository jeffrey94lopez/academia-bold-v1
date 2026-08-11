# Admin UX Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five focused UX improvements to the admin panel: panel persistence across refreshes, heatmap hour labels, full module conversations dashboard, paste-to-upload images in lesson editor, and cleaner filenames with image previews in the media library.

**Architecture:** All changes are contained to three files (`js/admin.js`, `js/admin-analytics.js`, `js/upload.js`). No new files, no new dependencies, no backend changes. Each task is independent — they can be committed and tested separately.

**Tech Stack:** Vanilla JS ES modules, Supabase JS v2, Tailwind CSS CDN, Lucide icons CDN.

---

## File Map

| File | Tasks |
|------|-------|
| `js/admin.js` | Task 1 (panel persistence), Task 4 (paste-to-upload), Task 5 (media previews) |
| `js/admin-analytics.js` | Task 2 (heatmap hours), Task 3 (module dashboard) |
| `js/upload.js` | Task 5 (file naming) |

---

## Task 1: Panel Persistence Across Refresh

**Problem:** `init()` always calls `switchPanel('lessons')` on load. Refreshing while on the Bodi analytics tab sends the user back to Lecciones.

**Fix:** Save the active panel to `localStorage` on every `switchPanel()` call. On `init()`, read that value and restore it instead of defaulting to `'lessons'`.

**Files:**
- Modify: `js/admin.js` — `switchPanel()` (line 33) and `init()` (line 16)

---

- [ ] **Step 1.1 — Save panel on switch**

In `js/admin.js`, find `switchPanel(panel)` at line 33. Add `localStorage.setItem('admin_panel', panel)` as the first line of the function body:

```js
function switchPanel(panel) {
  localStorage.setItem('admin_panel', panel)   // ← ADD THIS LINE
  document.querySelectorAll('[id^="panel-"]').forEach(p => p.classList.add('hidden'))
  document.getElementById(`panel-${panel}`).classList.remove('hidden')
  document.querySelectorAll('.admin-nav').forEach(b => {
    const active = b.dataset.panel === panel
    b.classList.toggle('text-[#E92129]', active)
    b.classList.toggle('bg-red-50', active)
    b.classList.toggle('text-slate-500', !active)
  })

  if (panel === 'lessons') renderLessonsPanel()
  if (panel === 'glossary') renderGlossaryPanel()
  if (panel === 'material') renderMaterialPanel()
  if (panel === 'suggestions') renderSuggestionsPanel()
  if (panel === 'results') renderResultsPanel()
  if (panel === 'analytics') renderAnalyticsPanel()
}
```

- [ ] **Step 1.2 — Restore panel on init**

In `js/admin.js`, find `init()` at line 16. Replace the hardcoded `await renderLessonsPanel()` call with a `switchPanel()` call that uses the saved value:

```js
async function init() {
  const ok = await requireAuth()
  if (!ok) return

  document.getElementById('loginScreen').classList.add('hidden')
  document.getElementById('adminApp').classList.remove('hidden')
  document.getElementById('logoutBtn').addEventListener('click', logout)

  lucide.createIcons()
  initMediaLibraryModal()

  document.querySelectorAll('.admin-nav').forEach(btn => {
    btn.addEventListener('click', () => switchPanel(btn.dataset.panel))
  })

  const savedPanel = localStorage.getItem('admin_panel') || 'lessons'
  switchPanel(savedPanel)
}
```

- [ ] **Step 1.3 — Test**

1. Open the admin panel in the browser.
2. Click on "Analytics" tab → navigate to Bodi dashboard.
3. Press F5 (refresh).
4. Verify you land on Analytics → Bodi tab, not on Lecciones.
5. Repeat with Glosario and Sugerencias tabs.

- [ ] **Step 1.4 — Commit**

```bash
git add js/admin.js
git commit -m "fix: restore active admin panel after page refresh"
```

---

## Task 2: Heatmap — Hour Labels on Left

**Problem:** The heatmap (hour × day-of-week) shows day names (Mon–Sun) across the top but has no Y-axis labels, so it's impossible to read which hour a row corresponds to.

**Fix:** Add an extra first column (36px wide) for hour labels. The header row gets an empty leading cell. Each of the 24 hour rows gets a label cell showing `00h`–`23h`.

**Files:**
- Modify: `js/admin-analytics.js` — heatmap section inside `renderBodiAnalytics()` (lines 534–634)

---

- [ ] **Step 2.1 — Replace heatmap build and container**

In `js/admin-analytics.js`, find this block (starting around line 534):

```js
  const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  let heatCells = dayNames.map(d =>
    `<div class="text-[9px] text-slate-500 text-center font-bold pb-0.5">${d}</div>`
  ).join('')
  for (let h = 0; h < 24; h++) {
    for (let d = 0; d < 7; d++) {
      const count = heat[d][h]
      const opacity = count ? (0.12 + 0.88 * count / maxHeat).toFixed(2) : '0'
      heatCells += `<div style="background:rgba(233,33,41,${opacity});border-radius:2px;min-height:10px" title="${dayNames[d]} ${String(h).padStart(2,'0')}:00 — ${count} conv."></div>`
    }
  }
```

Replace it with:

```js
  const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  // Header row: empty corner cell + 7 day labels
  let heatCells = `<div></div>` + dayNames.map(d =>
    `<div class="text-[9px] text-slate-500 text-center font-bold pb-0.5">${d}</div>`
  ).join('')

  for (let h = 0; h < 24; h++) {
    // Hour label cell
    heatCells += `<div class="text-[9px] text-slate-400 flex items-center justify-end pr-1 leading-none">${String(h).padStart(2,'0')}h</div>`
    for (let d = 0; d < 7; d++) {
      const count = heat[d][h]
      const opacity = count ? (0.12 + 0.88 * count / maxHeat).toFixed(2) : '0'
      heatCells += `<div style="background:rgba(233,33,41,${opacity});border-radius:2px;min-height:10px" title="${dayNames[d]} ${String(h).padStart(2,'0')}:00 — ${count} conv."></div>`
    }
  }
```

- [ ] **Step 2.2 — Update the grid container**

In the same function, find the heatmap container div (around line 629):

```js
        <div class="grid gap-0.5" style="grid-template-columns:repeat(7,minmax(28px,1fr));min-width:200px;max-width:400px">
```

Replace it with (8 columns: 36px label + 7 day columns, wider min-width):

```js
        <div class="grid gap-0.5" style="grid-template-columns:36px repeat(7,minmax(28px,1fr));min-width:240px;max-width:480px">
```

- [ ] **Step 2.3 — Test**

1. Open admin → Analytics → Bodi tab.
2. Verify the heatmap shows hour labels `00h` through `23h` on the left column.
3. Verify day names (Lun–Dom) still appear across the top.
4. Verify hovering a cell shows the correct tooltip (e.g., "Lun 08:00 — 3 conv.").

- [ ] **Step 2.4 — Commit**

```bash
git add js/admin-analytics.js
git commit -m "feat: add hour labels to Y-axis of Bodi heatmap"
```

---

## Task 3: Full Module Conversations Dashboard

**Problem:** The current "Conversaciones por módulo" is a simple bar chart showing only total counts. The user wants a full breakdown per module (like the lessons dashboard): total, resolved %, abandoned %, support redirected, and sentiment for each module.

**Fix:** Replace the `topicCounts` computation and the bar chart HTML with a richer per-module stats table. Also remove the separate "Sentimiento" widget since sentiment is now shown per module.

**Files:**
- Modify: `js/admin-analytics.js` — data computation (lines 517–524) and HTML grid section (lines 591–623) inside `renderBodiAnalytics()`

---

- [ ] **Step 3.1 — Replace data computation**

In `js/admin-analytics.js`, find this block (around line 517):

```js
  const topicCounts = {}
  rows.forEach(r => { const t = r.topic || 'desconocido'; topicCounts[t] = (topicCounts[t] || 0) + 1 })
  const topicEntries = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])
  const maxTopic = Math.max(...topicEntries.map(e => e[1]), 1)

  const sentMap = { positivo: 0, neutro: 0, negativo: 0 }
  rows.forEach(r => { if (r.sentiment && sentMap[r.sentiment] !== undefined) sentMap[r.sentiment]++ })
  const sentimentTotal = sentMap.positivo + sentMap.neutro + sentMap.negativo || 1
```

Replace it with:

```js
  const moduleStats = {}
  rows.forEach(r => {
    const t = r.topic || 'Sin módulo'
    if (!moduleStats[t]) moduleStats[t] = { total: 0, resolved: 0, withAnswer: 0, abandoned: 0, support: 0, positivo: 0, neutro: 0, negativo: 0 }
    const m = moduleStats[t]
    m.total++
    if (r.resolved !== null) m.withAnswer++
    if (r.resolved === true) m.resolved++
    if (r.status === 'abandoned') m.abandoned++
    if (r.support_redirected) m.support++
    if (r.sentiment === 'positivo') m.positivo++
    else if (r.sentiment === 'negativo') m.negativo++
    else m.neutro++
  })
  const moduleEntries = Object.entries(moduleStats).sort((a, b) => b[1].total - a[1].total)
  const maxModuleTotal = Math.max(...moduleEntries.map(e => e[1].total), 1)
```

- [ ] **Step 3.2 — Replace the bar chart + sentiment HTML block**

Find this section in the template literal (around line 591):

```js
    <div class="grid gap-4 mb-5" style="grid-template-columns:2fr 1fr">
      <div class="bg-white rounded-2xl border border-slate-100 p-4">
        <p class="text-xs font-bold text-slate-800 mb-3">Conversaciones por módulo</p>
        ${topicEntries.length === 0
          ? '<p class="text-slate-400 text-xs">Sin datos en el período</p>'
          : topicEntries.map(([t, c]) => `
            <div class="mb-2">
              <div class="flex justify-between mb-0.5">
                <span class="text-xs text-slate-700">${escapeHtml(t)}</span>
                <span class="text-xs font-bold text-[#E92129]">${c}</span>
              </div>
              <div class="h-1.5 bg-slate-100 rounded-full">
                <div class="h-1.5 bg-[#E92129] rounded-full" style="width:${Math.round(c/maxTopic*100)}%"></div>
              </div>
            </div>`).join('')}
      </div>
      <div class="bg-white rounded-2xl border border-slate-100 p-4">
        <p class="text-xs font-bold text-slate-800 mb-3">Sentimiento</p>
        ${[['Positivo','positivo','#22c55e'],['Neutro','neutro','#94a3b8'],['Negativo','negativo','#ef4444']].map(([label, key, color]) => {
          const cnt = sentMap[key]
          const pct = Math.round(cnt / sentimentTotal * 100)
          return `<div class="mb-2.5">
            <div class="flex justify-between mb-0.5">
              <span class="text-xs text-slate-700">${label}</span>
              <span class="text-xs font-bold" style="color:${color}">${pct}%</span>
            </div>
            <div class="h-1.5 bg-slate-100 rounded-full">
              <div class="h-1.5 rounded-full" style="width:${pct}%;background:${color}"></div>
            </div>
          </div>`
        }).join('')}
        ${total === 0 ? '<p class="text-[10px] text-slate-400 mt-2">Sin datos</p>' : ''}
      </div>
    </div>
```

Replace it with:

```js
    <div class="bg-white rounded-2xl border border-slate-100 overflow-hidden mb-5">
      <div class="px-4 py-3 border-b border-slate-100">
        <p class="text-xs font-bold text-slate-800">Conversaciones por módulo</p>
      </div>
      ${moduleEntries.length === 0
        ? '<p class="text-slate-400 text-xs p-4">Sin datos en el período</p>'
        : `<div class="overflow-x-auto"><table class="w-full border-collapse text-xs">
          <thead><tr class="border-b border-slate-100 bg-slate-50">
            <th class="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase">Módulo</th>
            <th class="px-4 py-2 text-right text-[10px] font-bold text-slate-400 uppercase">Total</th>
            <th class="px-4 py-2 text-right text-[10px] font-bold text-slate-400 uppercase">Resueltas</th>
            <th class="px-4 py-2 text-right text-[10px] font-bold text-slate-400 uppercase">Abandon.</th>
            <th class="px-4 py-2 text-right text-[10px] font-bold text-slate-400 uppercase">Soporte</th>
            <th class="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase">Sentimiento</th>
            <th class="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase">Volumen</th>
          </tr></thead>
          <tbody>
            ${moduleEntries.map(([topic, m]) => {
              const resolvedPctM = m.withAnswer ? Math.round(m.resolved / m.withAnswer * 100) : 0
              const abandonedPctM = m.total ? Math.round(m.abandoned / m.total * 100) : 0
              const supportPctM = m.total ? Math.round(m.support / m.total * 100) : 0
              const sentTotal = m.positivo + m.neutro + m.negativo || 1
              const dominantSent = m.positivo >= m.negativo && m.positivo >= m.neutro ? 'positivo'
                : m.negativo >= m.neutro ? 'negativo' : 'neutro'
              const sentColor = dominantSent === 'positivo' ? '#22c55e' : dominantSent === 'negativo' ? '#ef4444' : '#94a3b8'
              const sentLabel = dominantSent === 'positivo' ? 'Positivo' : dominantSent === 'negativo' ? 'Negativo' : 'Neutro'
              const barPct = Math.round(m.total / maxModuleTotal * 100)
              return `<tr class="border-b border-slate-50 hover:bg-slate-50">
                <td class="px-4 py-2.5 font-bold text-slate-800">${escapeHtml(topic)}</td>
                <td class="px-4 py-2.5 text-right font-black text-[#E92129]">${m.total}</td>
                <td class="px-4 py-2.5 text-right text-slate-600">${resolvedPctM}%</td>
                <td class="px-4 py-2.5 text-right text-slate-600">${abandonedPctM}%</td>
                <td class="px-4 py-2.5 text-right text-slate-600">${supportPctM}%</td>
                <td class="px-4 py-2.5">
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded-full" style="color:${sentColor};background:${sentColor}18">${sentLabel}</span>
                </td>
                <td class="px-4 py-2.5 min-w-[80px]">
                  <div class="h-1.5 bg-slate-100 rounded-full">
                    <div class="h-1.5 bg-[#E92129] rounded-full" style="width:${barPct}%"></div>
                  </div>
                </td>
              </tr>`
            }).join('')}
          </tbody>
        </table></div>`}
    </div>
```

- [ ] **Step 3.3 — Test**

1. Open admin → Analytics → Bodi tab.
2. Verify a table appears with one row per module (Ventas, Inventario, etc.).
3. Verify each row shows Total, Resueltas %, Abandon. %, Soporte %, Sentimiento dominante, and a volume bar.
4. Verify modules are sorted by total conversations descending.
5. Verify "Sin datos en el período" appears when the date range has no conversations.

- [ ] **Step 3.4 — Commit**

```bash
git add js/admin-analytics.js
git commit -m "feat: replace module bar chart with full per-module stats table in Bodi dashboard"
```

---

## Task 4: Paste Screenshot to Upload (Ctrl+V in Lesson Form)

**Problem:** Adding images to lessons requires opening the media library, uploading a file, and selecting it. If the user has a screenshot in the clipboard, they should be able to paste it directly (Ctrl+V) and have it upload automatically as an image block.

**Fix:** Add a single `document` paste event listener (initialized once in `init()`). It only activates when the lesson form modal is visible. It extracts the image from the clipboard, calls `uploadFile()`, pushes an image block to `currentBlocks`, and re-renders the block list.

**Files:**
- Modify: `js/admin.js` — `initMediaLibraryModal()` (line 1176) and `init()` (line 16)

---

- [ ] **Step 4.1 — Add initPasteHandler function**

In `js/admin.js`, after the `initMediaLibraryModal()` function (after line 1192), add:

```js
function initPasteHandler() {
  document.addEventListener('paste', async e => {
    const modal = document.getElementById('lessonFormModal')
    if (!modal || modal.classList.contains('hidden')) return

    const imgItem = Array.from(e.clipboardData?.items || []).find(it => it.type.startsWith('image/'))
    if (!imgItem) return
    e.preventDefault()

    const file = imgItem.getAsFile()
    if (!file) return

    showToast('Subiendo imagen...')
    try {
      const { url } = await uploadFile(file)
      currentBlocks.push({ type: 'image', url, caption: '' })
      renderBlockList()
      showToast('✓ Imagen pegada')
    } catch (err) {
      showToast('Error al subir: ' + err.message)
    }
  })
}
```

- [ ] **Step 4.2 — Call initPasteHandler from init()**

In `js/admin.js`, find the updated `init()` function from Task 1. Add `initPasteHandler()` after `initMediaLibraryModal()`:

```js
async function init() {
  const ok = await requireAuth()
  if (!ok) return

  document.getElementById('loginScreen').classList.add('hidden')
  document.getElementById('adminApp').classList.remove('hidden')
  document.getElementById('logoutBtn').addEventListener('click', logout)

  lucide.createIcons()
  initMediaLibraryModal()
  initPasteHandler()   // ← ADD THIS

  document.querySelectorAll('.admin-nav').forEach(btn => {
    btn.addEventListener('click', () => switchPanel(btn.dataset.panel))
  })

  const savedPanel = localStorage.getItem('admin_panel') || 'lessons'
  switchPanel(savedPanel)
}
```

- [ ] **Step 4.3 — Test**

1. Open admin → Lecciones → click "Nueva lección" or edit an existing one.
2. Take a screenshot (Windows: `Win + Shift + S`, then copy to clipboard).
3. With the lesson form modal open, press `Ctrl+V`.
4. Verify a toast shows "Subiendo imagen..." then "✓ Imagen pegada".
5. Verify a new image block appears at the bottom of the content block list with the uploaded image URL.
6. Verify that `Ctrl+V` outside the modal (e.g., on the lessons list) does NOT trigger any upload.

- [ ] **Step 4.4 — Commit**

```bash
git add js/admin.js
git commit -m "feat: paste clipboard screenshots directly into lesson editor"
```

---

## Task 5: Cleaner File Names + Image Previews in Media Library

**Problem A — Naming:** Uploaded files get a `${Date.now()}-filename.ext` path (e.g., `1748956800000-captura.png`). The timestamp at the start makes it impossible to identify files by name in the media grid.

**Fix:** Move the timestamp to the end — `filename-${Date.now()}.ext` — and strip the timestamp suffix when displaying the name.

**Problem B — Previews:** The media library modal shows emoji icons (`🖼️`) for images. There are no actual thumbnails, making it hard to find the right image.

**Fix:** For image files, render an `<img>` tag instead of the emoji icon in both the media library modal grid (`renderMediaGrid`) and the material panel grid (`renderMaterialPanel`).

**Files:**
- Modify: `js/upload.js` — `uploadFile()` (line 6)
- Modify: `js/admin.js` — `renderMediaGrid()` (line 1139) and `renderMaterialPanel()` grid (around line 852)

---

- [ ] **Step 5.1 — Fix file naming in upload.js**

In `js/upload.js`, find in `uploadFile()`:

```js
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${Date.now()}-${safe}`
```

Replace with:

```js
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const ext = safe.match(/\.[^.]+$/)?.[0] ?? ''
  const base = ext ? safe.slice(0, -ext.length) : safe
  const path = `${base || 'archivo'}-${Date.now()}${ext}`
```

- [ ] **Step 5.2 — Add displayName helper in admin.js**

In `js/admin.js`, after the `formatBytes()` function (after line 1094), add:

```js
function displayName(name) {
  // Strip the -timestamp suffix added by uploadFile: "captura-1748956800000.png" → "captura.png"
  return name.replace(/-\d{13}(\.[^.]+)?$/, '$1')
}
```

- [ ] **Step 5.3 — Add image preview to media library modal (renderMediaGrid)**

In `js/admin.js`, find `renderMediaGrid()` at line 1139. Replace the item rendering:

```js
  grid.innerHTML = files.map(f => `
    <div class="media-item cursor-pointer border-2 border-transparent rounded-xl p-2 text-center hover:border-[#E92129] transition-colors"
         data-url="${escapeHtml(f.url)}" data-name="${escapeHtml(f.name)}">
      <div class="text-3xl mb-1">${fileIcon(f.type)}</div>
      <p class="text-xs text-slate-700 truncate" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</p>
      <p class="text-xs text-slate-400">${formatBytes(f.size)}</p>
    </div>
  `).join('')
```

Replace with:

```js
  grid.innerHTML = files.map(f => {
    const thumb = f.type.startsWith('image/')
      ? `<img src="${escapeHtml(f.url)}" alt="" class="w-full h-14 object-cover rounded-lg mb-1" loading="lazy">`
      : `<div class="text-3xl mb-1">${fileIcon(f.type)}</div>`
    return `
    <div class="media-item cursor-pointer border-2 border-transparent rounded-xl p-2 text-center hover:border-[#E92129] transition-colors"
         data-url="${escapeHtml(f.url)}" data-name="${escapeHtml(f.name)}">
      ${thumb}
      <p class="text-xs text-slate-700 truncate" title="${escapeHtml(displayName(f.name))}">${escapeHtml(displayName(f.name))}</p>
      <p class="text-xs text-slate-400">${formatBytes(f.size)}</p>
    </div>`
  }).join('')
```

- [ ] **Step 5.4 — Add image preview to material panel grid**

In `js/admin.js`, find the material panel's file grid (around line 852):

```js
    <div class="group relative bg-white border border-slate-100 rounded-xl p-3 text-center shadow-sm hover:shadow-md transition-shadow">
      <div class="text-3xl mb-2">${fileIcon(f.type)}</div>
      <p class="text-xs text-slate-700 truncate font-medium" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</p>
      <p class="text-xs text-slate-400">${formatBytes(f.size)}</p>
```

Replace with:

```js
    <div class="group relative bg-white border border-slate-100 rounded-xl p-3 text-center shadow-sm hover:shadow-md transition-shadow">
      ${f.type.startsWith('image/')
        ? `<img src="${escapeHtml(f.url)}" alt="" class="w-full h-16 object-cover rounded-lg mb-2" loading="lazy">`
        : `<div class="text-3xl mb-2">${fileIcon(f.type)}</div>`}
      <p class="text-xs text-slate-700 truncate font-medium" title="${escapeHtml(displayName(f.name))}">${escapeHtml(displayName(f.name))}</p>
      <p class="text-xs text-slate-400">${formatBytes(f.size)}</p>
```

- [ ] **Step 5.5 — Test**

1. Upload a new image from the Material panel — verify the filename stored is `name-timestamp.ext` (not `timestamp-name.ext`).
2. Open the media library modal — verify images show photo thumbnails, not `🖼️`.
3. Verify the display name shown in the grid is clean (no timestamp): `captura.png` not `captura-1748956800000.png`.
4. Verify non-image files (PDFs, videos) still show their emoji icons.
5. Paste a screenshot with Ctrl+V in the lesson form — verify the uploaded file appears in the media library with a thumbnail.

- [ ] **Step 5.6 — Commit**

```bash
git add js/admin.js js/upload.js
git commit -m "feat: image thumbnails in media library + cleaner upload filenames"
```

---

## Self-Review

**Spec coverage:**
- ✅ Panel persistence across refresh → Task 1
- ✅ Heatmap hour labels on Y-axis → Task 2
- ✅ Full module conversations dashboard → Task 3
- ✅ Paste screenshot → upload → image block → Task 4
- ✅ Clean filenames (timestamp at end) → Task 5 Step 1
- ✅ Image previews in media library modal → Task 5 Steps 3–4
- ✅ Display name strips timestamp → Task 5 Step 2

**Placeholder scan:** No TBDs, no "add appropriate error handling", no "similar to Task N". All steps include complete code.

**Type consistency:**
- `displayName(name)` — defined in Step 5.2, used in Steps 5.3 and 5.4 ✅
- `uploadFile(file)` — imported at top of `admin.js` from `./upload.js`, signature unchanged ✅
- `currentBlocks`, `renderBlockList()` — existing globals used in Task 4, no changes to their definitions ✅
- `moduleStats`, `moduleEntries`, `maxModuleTotal` — defined in Step 3.1, used in Step 3.2 ✅
