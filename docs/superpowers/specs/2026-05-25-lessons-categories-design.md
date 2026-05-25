# Lessons Categories & Search — Design Spec

## Goal

Replace the flat grid of lesson cards in the student view with a split-panel layout: a sidebar showing categories (accordion on desktop, full-screen list on mobile) with a search bar, and a main panel showing the selected lesson's content. Each lesson's video block renders as an embedded YouTube iframe instead of a click-to-open link.

## Architecture

### Data Model

Add two columns to the existing `lecciones` table in Supabase:

```sql
ALTER TABLE lecciones ADD COLUMN categoria text NOT NULL DEFAULT 'Ventas';
ALTER TABLE lecciones ADD COLUMN notas text;
```

Categories are a fixed, predefined list — not a separate table. The six valid values are:

```
Ventas | Inventario | Ingresos | Egresos | Contactos | Configuración
```

No migration needed for existing rows; the DEFAULT ensures they fall into 'Ventas'. The admin editor enforces the list via a `<select>` dropdown. `notas` is nullable — existing rows default to NULL (not shown to students).

### Components

**`js/lessons.js`** — Full rewrite. Current flat-grid + modal approach is replaced entirely:
- Fetches all lessons once on load, grouped by `categoria`
- Desktop: renders a two-panel layout (sidebar + content) inside `#section-lessons`
- Mobile: renders a three-screen stack (categories → lessons → content) with back-button navigation
- Search filters the visible lesson list in the active category (case-insensitive, matches `titulo` + `descripcion`)
- Clicking a lesson populates the content panel without a modal

**`js/block-renderer.js`** — One change: the `video` block type now renders as a YouTube iframe instead of a dark-card link. See Video Block section below.

**`js/admin.js`** — Add `categoria` dropdown and `notas` textarea to the lesson editor modal. Add B/I/U formatting toolbar to step block inputs. Saves `categoria` and `notas` to the database.

**`js/step-formatter.js`** — New small module. Exports two functions:
- `applyFormat(textarea, marker)` — wraps the current text selection in `marker` (e.g. `**`, `*`, `__`)
- `renderStepText(text)` — parses `**bold**`, `*italic*`, `__underline__` markers and returns a `DocumentFragment` of text nodes and styled `<span>` elements (no innerHTML)

**`index.html`** — Update the Asistente IA nav button style to black background (see Navigation section below).

---

## Desktop Layout

```
┌──────────────┬──────────────────────┬────────────────────────────────┐
│  Main nav    │  Lessons sidebar     │  Lesson content                │
│  (224px)     │  (200px)             │  (flex: 1)                     │
│              │                      │                                │
│  🤖 Asistente│  [🔍 Buscar...]      │  ┌──────────────────────────┐ │
│  📚 Lecciones│                      │  │   YouTube iframe          │ │
│  📁 Recursos │  ▾ 📊 Ventas         │  │   (16:9, border-radius)   │ │
│              │    • Crear venta ←── │  └──────────────────────────┘ │
│  ──────────  │    • Descuentos      │                                │
│  ⚙️ Admin    │    • Cobros parc.    │  Cómo crear una venta          │
│              │  ▸ 📦 Inventario     │  Ventas · Lección 1            │
│              │  ▸ 💰 Ingresos       │                                │
│              │  ▸ 💸 Egresos        │  ① Paso uno...                │
│              │  ▸ 👥 Contactos      │  ② Paso dos...                │
│              │  ▸ ⚙️ Configuración  │                                │
└──────────────┴──────────────────────┴────────────────────────────────┘
```

- The lessons sidebar sits **inside** `#section-lessons`, not in the global nav.
- Accordion: only one category open at a time. Opening one closes the currently open one.
- Active lesson highlighted with red left border + red text + light red background.
- Search bar at top of sidebar filters the lesson list within the **active/open** category only. Searching does not open other categories.
- First lesson of the first category is selected by default on load (no empty state).
- "Lección N" numbering is the 1-based index of the lesson within its category (sorted by `orden`).
- The content panel does **not** scroll the page — it scrolls internally (`overflow-y: auto`).

---

## Mobile Layout

Three screens managed via a `data-screen` attribute on a wrapper div. Only one screen is visible at a time; transitions use CSS opacity/transform.

**Screen 1 — Categories**
- Full-width list of the six categories, each row shows emoji + name + `›` chevron
- Tapping a category navigates to Screen 2
- Bottom nav bar stays visible (Asistente / Lecciones / Recursos)

**Screen 2 — Lesson list**
- Red header bar: `‹` back button + category name
- Search bar below header to filter lessons in this category
- Lesson rows: lesson title, tap navigates to Screen 3
- Active lesson (last opened) shown with red left border
- Bottom nav bar stays visible

**Screen 3 — Lesson content**
- Red header bar: `‹` back button + lesson title (truncated)
- YouTube iframe at top (16:9 ratio)
- Lesson title, category · lesson number
- Block content (steps, images, links)
- Bottom nav bar stays visible
- Scrolls vertically for long lessons

---

## Video Block — YouTube iframe

`js/block-renderer.js` video block rendering changes from a dark-card anchor to an inline iframe:

**YouTube ID extraction:** Given `block.url`, extract the video ID using this logic:
1. Try `new URL(block.url)` — if hostname contains `youtube.com`, use `searchParams.get('v')`
2. If hostname is `youtu.be`, use `pathname.slice(1)`
3. If extraction fails or ID is empty, skip the block (render nothing)

**iframe element:**
```js
const iframe = document.createElement('iframe')
iframe.src = `https://www.youtube.com/embed/${videoId}`
iframe.setAttribute('allowfullscreen', '')
iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture')
iframe.setAttribute('loading', 'lazy')
iframe.style.cssText = 'width:100%;aspect-ratio:16/9;border:0;border-radius:10px;display:block;margin-bottom:12px'
```

No `title` attribute (avoids injecting user content into an attribute with no display). No `sandbox` attribute — YouTube embeds require script execution.

**Label:** If `block.label` is non-empty, render it as a small gray caption below the iframe (`<p style="font-size:11px;color:#94a3b8">` via `textContent`).

---

## Admin Editor Changes

### Categoria field

Add a `categoria` field between `descripcion` and the block list in the lesson editor modal (`js/admin.js`):

```html
<select id="lessonCategoria">
  <option>Ventas</option>
  <option>Inventario</option>
  <option>Ingresos</option>
  <option>Egresos</option>
  <option>Contactos</option>
  <option>Configuración</option>
</select>
```

- On `openLessonForm(lesson)`: set `lessonCategoria.value = lesson.categoria || 'Ventas'`
- On save: include `categoria: document.getElementById('lessonCategoria').value` in the upsert payload

### Notas field

Add a `notas` textarea below the block list in the editor left panel:

```html
<textarea id="lessonNotas" placeholder="Notas adicionales (opcional)..." rows="3"></textarea>
```

- On `openLessonForm(lesson)`: set `lessonNotas.value = lesson.notas || ''`
- On save: include `notas: document.getElementById('lessonNotas').value.trim() || null` in the upsert payload (empty string → null)

### Step block — B/I/U toolbar

Each step block input in `blockItemHtml()` gets a small inline toolbar above its textarea:

```html
<div class="fmt-toolbar" data-idx="${i}">
  <button class="fmt-btn" data-marker="**" title="Negrita"><strong>B</strong></button>
  <button class="fmt-btn" data-marker="*"  title="Cursiva"><em>I</em></button>
  <button class="fmt-btn" data-marker="__" title="Subrayado"><u>U</u></button>
</div>
<textarea class="block-field" data-field="text" ...></textarea>
```

Clicking a toolbar button calls `applyFormat(textarea, marker)` from `js/step-formatter.js`, which:
1. Reads `textarea.selectionStart` / `selectionEnd`
2. If selection is non-empty: wraps it — `text.slice(0, start) + marker + selected + marker + text.slice(end)`
3. If no selection: inserts `marker + marker` at cursor and places cursor between the two markers
4. Updates `currentBlocks[idx].text` and calls `updatePreview()`

The toolbar only appears on `step` blocks (not image/video/link).

---

## Notes — Student View

When `lesson.notas` is non-empty, render a "Notas" section below the block content in both desktop content panel and mobile Screen 3:

```
┌─────────────────────────────────────┐
│  📝 Notas                           │
│  Texto de notas aquí...             │
└─────────────────────────────────────┘
```

- Light yellow background card (`#fefce8`), left border `#eab308`, title "📝 Notas" in bold
- Content via `textContent` (no formatting — plain text only)
- If `notas` is null/empty, render nothing

---

## Step Block — Rich Text Rendering

`js/step-formatter.js` exports `renderStepText(text)`:

Parses three marker pairs in order of precedence — `**bold**`, `*italic*`, `__underline__` — using a single-pass tokenizer that splits on markers and builds DOM nodes:

```js
// Returns a DocumentFragment
export function renderStepText(text) {
  // tokenize: split on **...**, *...*, __...__
  // for each token: if marked, createElement('strong'|'em'|'u') + textContent
  // else: createTextNode
}
```

Rules:
- Markers do **not** nest (no `**bold *italic* bold**`)
- Unmatched markers are treated as literal text
- The function always returns a `DocumentFragment` — never throws

`js/block-renderer.js` step block: replace `p.textContent = stepText` with `p.appendChild(renderStepText(stepText))`.

---

## Navigation — Asistente IA Button

Update the existing desktop sidebar nav button style (in `index.html`) to match the approved design:
- Asistente IA: `background: #111; color: #fff` (black background, white text)
- Other nav items keep their current styling

---

## Security

- YouTube video ID is extracted and inserted only into the `iframe.src` URL via template literal — not into `innerHTML`. A malformed ID results in a broken embed (YouTube returns a 404 page in the iframe), not XSS.
- All lesson text content continues to use `textContent` via `renderBlocks`.
- Step rich text: `renderStepText` builds DOM nodes via `createElement` + `textContent` only — the marker parser never calls `innerHTML`.
- Search filtering uses string comparisons on `titulo`/`descripcion` only — no HTML injection.
- `categoria` value on save comes from a `<select>` dropdown, so only valid predefined values reach the database.
- `notas` is stored as plain text and rendered via `textContent` — no formatting support, no injection risk.

---

## Out of Scope

- Lesson completion / progress tracking
- Category management in admin (add/rename/delete categories)
- Cross-category search (search only filters within the active/selected category on desktop; within the selected category on mobile Screen 2)
- Lesson reordering across categories (existing `orden` field is per-lesson, not per-category)
- Deep-linking to a specific lesson via URL hash
- Rich text formatting in `notas` (plain text only)
- Nested or combined formatting markers in step text (e.g. bold+italic simultaneously)
