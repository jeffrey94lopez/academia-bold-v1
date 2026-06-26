# Search, Realtime Lessons & Bot FAQ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify resource search into one input, add Supabase Realtime for live lesson updates, and send FAQ context to the bot.

**Architecture:** Three independent changes to three files. Each task can be implemented and tested without the others. `resources.js` each load function returns a filter closure consumed by a single `#resourceSearch` input. `lessons.js` opens a Supabase Realtime channel after mount and exposes a cleanup function for `main.js`. `assistant.js` prefetches FAQs once and includes them in every n8n request.

**Tech Stack:** Vanilla ES modules, Supabase JS v2 (CDN), Supabase Postgres Realtime

## Global Constraints

- No build step — plain ES modules loaded from `index.html`
- All changes must preserve existing mobile/desktop layouts exactly
- Escape all user-facing strings with the existing `escapeHtml()` utility
- No new dependencies

---

### Task 1: Global search input in Resources

**Files:**
- Modify: `js/resources.js` (all changes in this file)

**Interfaces:**
- Produces: each load function now returns `(q: string) => void` (a filter closure). `renderResources` stores these in module-level variables and wires them to a single `#resourceSearch` input.

---

- [ ] **Step 1: Add three module-level filter variables**

At the top of `js/resources.js`, after the existing `let activeSubTab = 'faq'` line, add:

```js
let filterFaq      = (_q) => {}
let filterGlossary = (_q) => {}
let filterMaterial = (_q) => {}
```

- [ ] **Step 2: Replace the two search inputs in the HTML template with one shared input**

In `renderResources()`, find the template string. Make three edits:

**Remove** the `faqSearchWrapper` block (it's between the tabs row and `#subFaq`):
```html
      <div id="faqSearchWrapper" class="px-4 pb-2 shrink-0">
        <input id="faqStudentSearch" type="text" placeholder="Buscar pregunta..."
          class="w-full px-4 py-2 rounded-xl bg-[var(--background-page)] text-sm outline-none focus:ring-2 focus:ring-[var(--blue-100)]">
      </div>
```

**Add** the shared input in its place (same position, right after the tabs `<div class="flex gap-2...">`):
```html
      <div class="px-4 pb-2 shrink-0">
        <input id="resourceSearch" type="text" placeholder="Buscar pregunta..."
          class="w-full px-4 py-2 rounded-xl bg-[var(--background-page)] text-sm outline-none focus:ring-2 focus:ring-[var(--blue-100)]">
      </div>
```

**Remove** the inner search block from `#subGlossary` (the `<div class="mb-3">` that wraps `#searchGlossary`):
```html
        <div class="mb-3">
          <input id="searchGlossary" type="text" placeholder="Buscar término..."
            class="w-full px-4 py-2 rounded-xl bg-[var(--background-page)] text-sm outline-none focus:ring-2 focus:ring-[var(--blue-100)]">
        </div>
```

- [ ] **Step 3: Capture filter functions from Promise.all and wire the shared input**

Find this block in `renderResources()`:
```js
  await Promise.all([loadFaq(), loadGlossary(), loadMaterial()])
  bindResourceEvents()
```

Replace it with:
```js
  const [faqFn, glossaryFn, materialFn] = await Promise.all([loadFaq(), loadGlossary(), loadMaterial()])
  filterFaq      = faqFn      ?? ((_q) => {})
  filterGlossary = glossaryFn ?? ((_q) => {})
  filterMaterial = materialFn ?? ((_q) => {})

  document.getElementById('resourceSearch').addEventListener('input', e => {
    const q = e.target.value
    if (activeSubTab === 'faq')      filterFaq(q)
    else if (activeSubTab === 'glossary') filterGlossary(q)
    else                             filterMaterial(q)
  })

  bindResourceEvents()
```

- [ ] **Step 4: Update `switchSubTab` to clear the input, update placeholder, and reset the list**

Find the existing `switchSubTab` function (around line 201). Replace the entire function body with:

```js
function switchSubTab(tab) {
  activeSubTab = tab

  const search = document.getElementById('resourceSearch')
  if (search) {
    search.value = ''
    const placeholders = { faq: 'Buscar pregunta...', glossary: 'Buscar término...', material: 'Buscar material...' }
    search.placeholder = placeholders[tab] || 'Buscar...'
  }

  // Reset the active tab to its full list
  if (tab === 'faq')           filterFaq('')
  else if (tab === 'glossary') filterGlossary('')
  else                         filterMaterial('')

  document.getElementById('subFaq').classList.toggle('hidden', tab !== 'faq')
  document.getElementById('subGlossary').classList.toggle('hidden', tab !== 'glossary')
  document.getElementById('subMaterial').classList.toggle('hidden', tab !== 'material')

  const active   = 'sub-tab shrink-0 px-4 py-1.5 rounded-full text-xs font-bold bg-[var(--blue-100)] text-white'
  const inactive = 'sub-tab shrink-0 px-4 py-1.5 rounded-full text-xs font-bold text-[var(--black-60)] bg-[var(--black-10)]'
  document.getElementById('tabFaq').className      = tab === 'faq'      ? active : inactive
  document.getElementById('tabGlossary').className = tab === 'glossary' ? active : inactive
  document.getElementById('tabMaterial').className = tab === 'material' ? active : inactive
}
```

Note: the old `faqSearchWrapper` toggle line is intentionally removed.

- [ ] **Step 5: Refactor `loadFaq` to return a filter closure**

Replace the entire `loadFaq` function with:

```js
async function loadFaq() {
  const { data, error } = await supabase.from('preguntas_frecuentes').select('*').order('orden').order('created_at')
  const list = document.getElementById('faqList')

  if (error || !data?.length) {
    list.innerHTML = '<p class="text-[var(--black-60)] text-sm text-center py-8">No hay preguntas frecuentes aún.</p>'
    return (_q) => {}
  }

  const actionBtn = (f) => {
    if (f.leccion_id) {
      return `<button type="button" class="faq-lesson-btn mt-2 text-xs font-bold text-[var(--blue-100)] hover:underline" data-lesson-id="${f.leccion_id}">Ver lección →</button>`
    } else if (f.link_url && /^https?:\/\//i.test(f.link_url)) {
      return `<a href="${escapeHtml(f.link_url)}" target="_blank" rel="noopener noreferrer" class="mt-2 inline-block text-xs font-bold text-[var(--blue-100)] hover:underline">Más información →</a>`
    }
    return ''
  }

  function renderFaqList(items) {
    if (!items.length) {
      list.innerHTML = '<p class="text-[var(--black-60)] text-sm text-center py-8">No hay resultados.</p>'
      return
    }
    list.innerHTML = items.map(f => `
      <details class="rounded-xl border border-[var(--blue-10)] bg-white overflow-hidden">
        <summary class="flex items-center justify-between gap-2 p-3 cursor-pointer list-none font-bold text-sm select-none">
          <span>${escapeHtml(f.pregunta)}</span>
          <i data-lucide="chevron-down" class="w-4 h-4 shrink-0 text-[var(--black-60)] transition-transform faq-chevron"></i>
        </summary>
        <div class="px-3 pb-3 text-xs text-[var(--black-60)] border-t border-[var(--blue-10)] pt-2 mt-0">
          ${escapeHtml(f.respuesta)}
          ${actionBtn(f)}
        </div>
      </details>
    `).join('')

    lucide.createIcons()

    list.querySelectorAll('details').forEach(d => {
      d.addEventListener('toggle', () => {
        const icon = d.querySelector('.faq-chevron')
        if (icon) icon.style.transform = d.open ? 'rotate(180deg)' : ''
      })
    })

    list.querySelectorAll('.faq-lesson-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelector('[data-tab="lessons"]')?.click()
        setTimeout(() => window.openLessonById?.(btn.dataset.lessonId), 150)
      })
    })
  }

  renderFaqList(data)

  return (q) => {
    const lower = q ? q.toLowerCase() : ''
    renderFaqList(lower
      ? data.filter(f => f.pregunta.toLowerCase().includes(lower) || f.respuesta.toLowerCase().includes(lower))
      : data)
  }
}
```

- [ ] **Step 6: Refactor `loadGlossary` to return a filter closure**

Replace the entire `loadGlossary` function with:

```js
async function loadGlossary() {
  const { data, error } = await supabase.from('glosario').select('*').order('termino')
  const list = document.getElementById('glossaryList')

  if (error || !data?.length) {
    list.innerHTML = '<p class="text-[var(--black-60)] text-sm text-center py-8">No hay términos en el glosario aún.</p>'
    return (_q) => {}
  }

  const render = (items) => {
    list.innerHTML = items.map(g => `
      <div class="p-3 rounded-xl border border-[var(--blue-10)] bg-white">
        <p class="font-black text-sm text-[var(--blue-100)]">${escapeHtml(g.termino)}</p>
        <p class="text-xs text-[var(--black-60)] mt-0.5">${escapeHtml(g.definicion)}</p>
      </div>
    `).join('')
  }

  render(data)

  return (q) => {
    const lower = q ? q.toLowerCase() : ''
    render(lower
      ? data.filter(g => g.termino.toLowerCase().includes(lower) || g.definicion.toLowerCase().includes(lower))
      : data)
  }
}
```

- [ ] **Step 7: Refactor `loadMaterial` to return a filter closure**

Replace the entire `loadMaterial` function with:

```js
async function loadMaterial() {
  const { data, error } = await supabase.from('material_apoyo').select('*')
  const list = document.getElementById('materialList')

  if (error || !data?.length) {
    list.innerHTML = '<p class="text-[var(--black-60)] text-sm text-center py-8 col-span-2">No hay material disponible aún.</p>'
    return (_q) => {}
  }

  const iconMap  = { pdf: 'file-text', link: 'link', video: 'play-circle' }
  const colorMap = { pdf: 'text-[var(--blue-100)]', link: 'text-[var(--info-100)]', video: 'text-[var(--blue-60)]' }

  const render = (items) => {
    if (!items.length) {
      list.innerHTML = '<p class="text-[var(--black-60)] text-sm text-center py-8 col-span-2">No hay resultados.</p>'
      return
    }
    list.innerHTML = items.map(m => `
      <a href="${escapeHtml(m.url)}" target="_blank" rel="noopener"
        class="flex items-center gap-3 p-4 rounded-2xl border border-[var(--blue-20)] bg-white hover:border-[var(--blue-100)] transition-colors group">
        <div class="w-10 h-10 rounded-xl bg-[var(--black-10)] flex items-center justify-center shrink-0">
          <i data-lucide="${iconMap[m.tipo] || 'file'}" class="w-5 h-5 ${colorMap[m.tipo] || 'text-[var(--black-60)]'}"></i>
        </div>
        <div class="min-w-0">
          <p class="font-bold text-sm truncate group-hover:text-[var(--blue-100)] transition-colors">${escapeHtml(m.titulo)}</p>
          <p class="text-[10px] font-bold text-[var(--black-60)] uppercase">${escapeHtml(m.tipo)}</p>
        </div>
        <i data-lucide="external-link" class="w-4 h-4 text-[var(--black-40)] ml-auto shrink-0"></i>
      </a>
    `).join('')
    lucide.createIcons()
  }

  render(data)

  return (q) => {
    const lower = q ? q.toLowerCase() : ''
    render(lower
      ? data.filter(m => m.titulo.toLowerCase().includes(lower) || m.tipo.toLowerCase().includes(lower))
      : data)
  }
}
```

- [ ] **Step 8: Verify in browser**

Open the app, go to P. Frecuentes:
- A single search bar appears above the content
- Typing in FAQ tab filters questions/answers
- Clicking Glosario tab: input clears, placeholder changes to "Buscar término...", typing filters glossary
- Clicking Material de apoyo tab: input clears, placeholder changes to "Buscar material...", typing filters by title/type
- Switching tabs always resets to full list

- [ ] **Step 9: Commit**

```
git add js/resources.js
git commit -m "feat(resources): unify search into single shared input across all tabs"
```

---

### Task 2: Real-time lesson updates

**Files:**
- Modify: `js/lessons.js`
- Modify: `js/main.js`

**Interfaces:**
- Produces: `window.lessonsCleanup(): void` — exposed by `lessons.js`, called by `main.js` when navigating away from lessons tab.

---

- [ ] **Step 1: Make `lessons` mutable inside `renderLessons`**

In `lessons.js`, find lines 12–15 (the `Promise.all` destructuring at the top of `renderLessons`):

```js
  const [{ data: lessons, error }, { data: cats }] = await Promise.all([
    supabase.from('lecciones').select('*').eq('active', true).order('orden'),
    supabase.from('categorias').select('*').order('orden'),
  ])
```

Replace with:

```js
  const [lessonsRes, catsRes] = await Promise.all([
    supabase.from('lecciones').select('*').eq('active', true).order('orden'),
    supabase.from('categorias').select('*').order('orden'),
  ])
  let lessons = lessonsRes.data || []
  const error = lessonsRes.error
  const cats  = catsRes.data
```

The rest of `renderLessons` uses `lessons`, `error`, and `cats` identically — no other changes needed for this step.

- [ ] **Step 2: Add `showToast` and `refreshLessons` inside `renderLessons`**

Find the `// ── Initialize` comment block near the end of `renderLessons` (around line 322). Insert the following two functions **before** that block:

```js
  // ── Toast ─────────────────────────────────────────────────────────────────
  function showToast(msg) {
    const existing = document.getElementById('ls-toast')
    if (existing) existing.remove()
    const toast = document.createElement('div')
    toast.id = 'ls-toast'
    toast.style.cssText = 'position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:50;padding:6px 16px;border-radius:999px;font-size:11px;font-weight:700;color:#fff;background:var(--blue-100);box-shadow:0 2px 8px rgba(0,0,0,.15);pointer-events:none;white-space:nowrap'
    toast.textContent = msg
    container.appendChild(toast)
    setTimeout(() => toast.remove(), 3000)
  }

  // ── Realtime refresh ──────────────────────────────────────────────────────
  async function refreshLessons() {
    const { data: freshLessons, error: err } = await supabase
      .from('lecciones').select('*').eq('active', true).order('orden')
    if (err || !freshLessons) return

    lessons = freshLessons

    // Rebuild grouped in-place (keeps CATEGORIES reference intact)
    for (const key of Object.keys(grouped)) delete grouped[key]
    for (const cat of CATEGORIES) grouped[cat.key] = []
    for (const l of lessons) {
      const cat = l.categoria || CATEGORIES[0]?.key || 'General'
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(l)
    }

    // If active lesson was removed/disabled, clear the content panel
    if (activeLesson && !lessons.find(l => l.id === activeLesson.id)) {
      activeLesson = null
      renderDeskContent()
    }

    renderAccordion()
    renderMobileCatList()
    renderMobileLessonList()
  }
```

- [ ] **Step 3: Subscribe to Realtime and expose cleanup**

In the `// ── Initialize` block (after `renderDeskContent()` on line ~327), add at the end of `renderLessons`, right before the closing `}` of the function:

```js
  // ── Supabase Realtime ─────────────────────────────────────────────────────
  const channel = supabase
    .channel('lessons-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lecciones' }, async () => {
      await refreshLessons()
      showToast('Lecciones actualizadas ✓')
    })
    .subscribe()

  window.lessonsCleanup = () => {
    supabase.removeChannel(channel)
    window.lessonsCleanup = null
  }
```

- [ ] **Step 4: Call cleanup in `main.js` when leaving the lessons tab**

In `js/main.js`, find the `switchTab` function. Add one line at its very beginning:

```js
function switchTab(tab) {
  if (tab !== 'lessons') window.lessonsCleanup?.()   // ← add this line
  document.querySelectorAll('[id^="section-"]').forEach(s => s.classList.add('hidden'))
  // ... rest unchanged ...
}
```

- [ ] **Step 5: Verify in browser**

Open the app on the Centro de Ayuda tab. In another tab (or the admin panel), add a new lesson to Supabase. Within 1–2 seconds:
- A blue toast "Lecciones actualizadas ✓" appears briefly at the top of the section
- The new lesson appears in the sidebar/category list without refreshing the page
- If a lesson was open in the content panel, it remains visible and unchanged

- [ ] **Step 6: Commit**

```
git add js/lessons.js js/main.js
git commit -m "feat(lessons): add Supabase Realtime for live lesson list updates"
```

---

### Task 3: Bot FAQ context

**Files:**
- Modify: `js/assistant.js`

**Interfaces:**
- Consumes: `supabase` client from `./supabase.js` (already imported)
- Produces: `faq_context` field added to every n8n request body. n8n workflow must be updated separately to use this field.

---

- [ ] **Step 1: Add `cachedFaqs` and `loadFaqContext`**

At the top of `js/assistant.js`, after the existing constants (`N8N_URL`, `ABANDON_URL`, `FALLBACK_CHIPS`), add:

```js
let cachedFaqs = []

async function loadFaqContext() {
  try {
    const { data } = await supabase
      .from('preguntas_frecuentes')
      .select('pregunta, respuesta')
      .order('orden')
      .order('created_at')
    cachedFaqs = data || []
  } catch (_) {
    cachedFaqs = []
  }
}
```

- [ ] **Step 2: Load FAQs at startup**

Find the last line of `assistant.js` (line 572):
```js
renderAssistant().catch(err => console.error('[bolbot POS] Failed to render assistant:', err))
```

Replace with:
```js
loadFaqContext()
renderAssistant().catch(err => console.error('[bolbot POS] Failed to render assistant:', err))
```

`loadFaqContext` is fire-and-forget. By the time the user sends their first message, the FAQs will be loaded.

- [ ] **Step 3: Include `faq_context` in the n8n request**

In `sendMessage`, find the fetch call (around line 516):
```js
    const res  = await fetch(N8N_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history })
    })
```

Replace the `body` line only:
```js
      body: JSON.stringify({ message: text, history, faq_context: cachedFaqs })
```

- [ ] **Step 4: Verify the payload in browser DevTools**

Open the app, send any message to the bot. In DevTools → Network → select the `/api/chat` request → Payload. Confirm the request body contains `faq_context: [...]` with the FAQ objects from the database.

If `faq_context` is an empty array `[]`, check that `preguntas_frecuentes` has rows and that the Supabase query ran without error.

- [ ] **Step 5: Note the required n8n change**

The frontend now sends the FAQ data. For the bot to actually use it, update the n8n prompt-building node to include something like:

```
{{$json.faq_context.length > 0 ? 'Preguntas frecuentes de referencia:\n' + $json.faq_context.map(f => 'P: ' + f.pregunta + '\nR: ' + f.respuesta).join('\n\n') : ''}}
```

This step is outside the codebase and must be done directly in the n8n workflow editor.

- [ ] **Step 6: Commit**

```
git add js/assistant.js
git commit -m "feat(bot): send FAQ context in every n8n request for bot awareness"
```
