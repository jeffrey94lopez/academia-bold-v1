# Lesson Block Editor — Design Spec

## Goal

Replace the raw HTML textarea in the admin lesson editor with a visual block-based editor. Admins compose lessons by adding typed blocks (Step, Image, Video, Link), reorder them via drag & drop, and see a live student-side preview. The student lesson modal renders the same blocks natively.

## Architecture

### Data Model

No schema change. `lecciones.contenido` stays as-is (text column), but content format changes from free HTML to a JSON array of blocks:

```json
[
  { "type": "step",  "text": "Ingresa a Bold Pagos y ve a Integraciones → Llaves de integración" },
  { "type": "image", "url": "https://academia.localizadoc.com/img/pantalla.png", "caption": "Pantalla de configuración" },
  { "type": "video", "url": "https://youtube.com/watch?v=EVoNWSgGhYo", "label": "Ver tutorial completo" },
  { "type": "link",  "url": "https://bold.co/docs/integraciones", "label": "Documentación oficial" }
]
```

**Backwards compatibility:** When rendering, attempt `JSON.parse(contenido)`. If it fails (old HTML lessons), render via `innerHTML` as fallback. This preserves existing lessons without migration.

### Block Types

| Type    | Fields               | Rendered as                          |
|---------|----------------------|--------------------------------------|
| `step`  | `text`               | Numbered circle (auto-counted) + text |
| `image` | `url`, `caption`     | `<img>` full-width + caption below   |
| `video` | `url`, `label`       | Dark card with play icon, tap opens YouTube |
| `link`  | `url`, `label`       | White card with link icon + arrow    |

### Components

**`js/block-renderer.js`** — New shared module. Exports a single function:
```js
export function renderBlocks(blocks)  // returns a DocumentFragment
```
Used by both admin live preview and student lesson modal. Step numbers are assigned sequentially as the array is walked (index of step-type blocks only).

**`js/admin.js`** — Lesson editor replaced:
- Current: single `<textarea>` for raw HTML
- New: block list with add/delete/reorder, plus live preview panel
- SortableJS loaded from CDN (`https://cdn.jsdelivr.net/npm/sortablejs@1/Sortable.min.js`) — same pattern as Lucide/Tailwind CDN imports already in project
- On save: serialize block array to JSON string → store in `contenido`
- On edit: parse `contenido` JSON → populate block list

**`js/lessons.js`** — Student lesson modal updated:
- Replace `element.innerHTML = lesson.contenido` with block-renderer call
- If JSON parse fails, fall back to `innerHTML` (legacy path)

**`admin.html`** — No structural change needed. SortableJS `<script>` tag added before closing `</body>`.

## Admin Editor UI

Split-panel modal (grid 1fr 1fr, min-height 500px):

**Left panel — Editor:**
- Título field (text input)
- Descripción field (text input)
- Block list: each block shows drag handle (⠿), colored type badge, field inputs, delete (✕)
  - Step: one textarea for `text`
  - Image: input for `url`, input for `caption` (optional)
  - Video: input for `url`, input for `label`
  - Link: input for `url`, input for `label`
- Add-block buttons: `+ Paso` / `+ Imagen` / `+ Video` / `+ Link`
- Orden field (number) + `Guardar lección` button
- Drag & drop via SortableJS on the block list container

**Right panel — Live preview:**
- Labeled "Vista previa del estudiante"
- Updates on every input change (no debounce needed — DOM ops are cheap)
- Renders via `renderBlocks()` — same output the student sees

## Student Lesson View

Existing modal (`#lessonModal`) updated to render blocks instead of raw HTML:

- **Step blocks** → `<div>` with red numbered circle + paragraph text. Numbers auto-increment across all step blocks in the lesson.
- **Image blocks** → `<img src="url">` with `alt=""`, full-width, rounded corners. Caption as `<p>` below if present.
- **Video blocks** → Dark card with play button circle. Clicking opens `url` in new tab (no inline embed — avoids iframe security issues on mobile).
- **Link blocks** → White card with 🔗 icon, label text, and → arrow. Clicking opens `url` in new tab.

## Security

- All text content inserted via `textContent` (never `innerHTML`) in the block renderer.
- Image `url` and link `url` values validated with `URL` constructor before use; invalid URLs silently skipped.
- YouTube `url` opened via `window.open()` — no iframe embed, no `srcdoc`.
- Admin-side: no change to existing `escapeHtml` usage for lesson title/description in list view.

## Out of Scope

- Lesson completion tracking (no progress stored)
- Block type conversion (a step block cannot be changed to an image block — delete and re-add instead)
- Image upload (URL-only — stays consistent with current approach)
- Markdown support within step text
- Inline YouTube embed (click-to-open avoids CSP and mobile iframe issues)

## Open Questions

None. All decisions resolved during brainstorming.
