# Live Updates + Typing Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las sesiones abiertas del portal (embebido en Bold POS) reciban contenido nuevo en tiempo real, se recarguen solas ante un deploy nuevo, y las respuestas del bot se escriban progresivamente con opción de saltar.

**Architecture:** Un módulo puro `js/reload-policy.js` (testeable en Node) decide cuándo recargar; `js/live-updates.js` (solo navegador) hace el poll de `/version.json` y las suscripciones Supabase Realtime; `js/typewriter.js` anima burbujas revelando nodos de texto con TreeWalker. `js/assistant.js` integra la animación y expone `loadFaqContext`/`rerenderChips` para Realtime.

**Tech Stack:** Vanilla JS (ES modules), Supabase JS v2 (Realtime), Vercel static build, `node:test` para tests.

**Spec:** `docs/superpowers/specs/2026-07-02-live-updates-typing-animation-design.md`

## Global Constraints

- Rama de trabajo: `sandbox` (nunca commitear a `master` en este plan).
- Sin dependencias nuevas de npm; sin frameworks.
- Los tests corren con `node --test tests/` (patrón existente: `tests/storage.test.mjs`).
- Los módulos testeados en Node NO pueden importar `js/supabase.js` (importa desde CDN, Node no lo resuelve).
- Comentarios y textos de UI en español, siguiendo el estilo del código existente.
- Velocidad de escritura ~190 caracteres/seg (3 chars cada 16 ms).
- El historial restaurado de localStorage NUNCA se anima.

**Nota de desviación del spec:** el spec pedía suscribir también `lecciones`, pero `js/lessons.js:390-402` YA tiene su propia suscripción Realtime a `lecciones` (de un plan anterior: refresca en sitio preservando la lección activa y muestra toast). Este plan NO la duplica: el Realtime nuevo cubre solo `preguntas_frecuentes` y `bot_sugerencias`. La publicación de Supabase ya incluye `lecciones` (esa feature funciona en producción); la migración solo agrega las dos tablas nuevas. Limitación preexistente conocida (LOW, fuera de alcance): al salir de la pestaña Lecciones se remueve el canal y no se re-suscribe al volver.

---

### Task 1: Política de recarga (módulo puro, TDD)

**Files:**
- Create: `js/reload-policy.js`
- Test: `tests/reload-policy.test.mjs`

**Interfaces:**
- Produces: `computeReloadAction({ currentVersion, newVersion, busy }) → 'none' | 'reload' | 'defer'` y `isNearBottom(el, tolerance = 40) → boolean` (acepta cualquier objeto con `scrollHeight`, `scrollTop`, `clientHeight`).

- [ ] **Step 1: Write the failing test**

```js
// tests/reload-policy.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeReloadAction, isNearBottom } from '../js/reload-policy.js'

test('misma versión → none', () => {
  assert.equal(computeReloadAction({ currentVersion: 'abc', newVersion: 'abc', busy: false }), 'none')
})

test('sin versión conocida o sin versión nueva → none (poll deshabilitado/fallido)', () => {
  assert.equal(computeReloadAction({ currentVersion: null, newVersion: 'abc', busy: false }), 'none')
  assert.equal(computeReloadAction({ currentVersion: 'abc', newVersion: null, busy: false }), 'none')
})

test('versión nueva y bot libre → reload', () => {
  assert.equal(computeReloadAction({ currentVersion: 'abc', newVersion: 'def', busy: false }), 'reload')
})

test('versión nueva pero bot ocupado → defer', () => {
  assert.equal(computeReloadAction({ currentVersion: 'abc', newVersion: 'def', busy: true }), 'defer')
})

test('isNearBottom con tolerancia por defecto (40px)', () => {
  assert.equal(isNearBottom({ scrollHeight: 1000, scrollTop: 900, clientHeight: 100 }), true)   // exacto al fondo
  assert.equal(isNearBottom({ scrollHeight: 1000, scrollTop: 865, clientHeight: 100 }), true)   // a 35px
  assert.equal(isNearBottom({ scrollHeight: 1000, scrollTop: 800, clientHeight: 100 }), false)  // a 100px
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/reload-policy.test.mjs`
Expected: FAIL — `Cannot find module '.../js/reload-policy.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// js/reload-policy.js
// Lógica pura de "¿debo recargar?" — sin imports para poder testearla en Node.

export function computeReloadAction({ currentVersion, newVersion, busy }) {
  if (!currentVersion || !newVersion) return 'none'
  if (newVersion === currentVersion) return 'none'
  return busy ? 'defer' : 'reload'
}

export function isNearBottom(el, tolerance = 40) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= tolerance
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/reload-policy.test.mjs`
Expected: PASS (6 tests). Correr también `node --test tests/` para confirmar que `storage.test.mjs` sigue verde.

- [ ] **Step 5: Commit**

```bash
git add js/reload-policy.js tests/reload-policy.test.mjs
git commit -m "feat(live-updates): política pura de recarga por versión"
```

---

### Task 2: version.json + watcher de deploys + quitar botón "Actualizar"

**Files:**
- Modify: `vercel.json:2` (buildCommand)
- Modify: `.gitignore`
- Create: `js/live-updates.js`
- Modify: `js/main.js:1-4`
- Modify: `js/assistant.js:117-124` (header del chat) y `js/assistant.js:474-483` (listeners)

**Interfaces:**
- Consumes: `computeReloadAction` de `js/reload-policy.js` (Task 1).
- Produces: `startLiveUpdates()` (export de `js/live-updates.js`, llamado desde `main.js`) y `botIsBusy() → boolean` (usado internamente; detecta por DOM: indicador de typing visible, clase `.tw-running` presente, o `#chatInput` con texto).

- [ ] **Step 1: Generar version.json en el build**

En `vercel.json`, reemplazar el buildCommand:

```json
"buildCommand": "npx tailwindcss -i css/input.css -o css/tw.css --minify && node -e \"require('fs').writeFileSync('version.json', JSON.stringify({v: process.env.VERCEL_GIT_COMMIT_SHA || Date.now().toString()}))\"",
```

Agregar al final de `.gitignore`:

```
# Generado por el build de Vercel
version.json
```

- [ ] **Step 2: Verificar el comando de build localmente**

Run: `node -e "require('fs').writeFileSync('version.json', JSON.stringify({v: process.env.VERCEL_GIT_COMMIT_SHA || Date.now().toString()}))" && cat version.json && rm version.json`
Expected: imprime `{"v":"<timestamp>"}` sin error.

- [ ] **Step 3: Crear el watcher en js/live-updates.js**

```js
// js/live-updates.js
// Mantiene la sesión al día: recarga ante deploys nuevos (poll a /version.json)
// y refresca contenido vía Supabase Realtime (se agrega en startRealtime).
import { computeReloadAction } from './reload-policy.js'

const VERSION_POLL_MS = 60_000
const DEFER_CHECK_MS  = 2_000

let bootVersion   = null
let reloadPending = false

async function fetchVersion() {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()).v || null
  } catch { return null }
}

// Ocupado = respuesta del bot en curso, animación de escritura corriendo,
// o texto sin enviar en el input. Se detecta por DOM para no acoplar módulos.
function botIsBusy() {
  const typing = document.getElementById('typingIndicator')
  if (typing && !typing.classList.contains('hidden')) return true
  if (document.querySelector('.tw-running')) return true
  const input = document.getElementById('chatInput')
  if (input && input.value.trim()) return true
  return false
}

function doReload() {
  window.location.href = window.location.origin + window.location.pathname + '?v=' + Date.now()
}

function armDeferredReload() {
  if (reloadPending) return
  reloadPending = true
  const t = setInterval(() => {
    if (!botIsBusy()) { clearInterval(t); doReload() }
  }, DEFER_CHECK_MS)
}

async function startVersionWatcher() {
  bootVersion = await fetchVersion()
  if (!bootVersion) return // desarrollo local o fetch fallido: chequeo desactivado
  setInterval(async () => {
    if (reloadPending) return
    const v = await fetchVersion()
    const action = computeReloadAction({ currentVersion: bootVersion, newVersion: v, busy: botIsBusy() })
    if (action === 'reload') doReload()
    else if (action === 'defer') armDeferredReload()
  }, VERSION_POLL_MS)
}

export function startLiveUpdates() {
  startVersionWatcher()
}
```

- [ ] **Step 4: Conectarlo en main.js**

En `js/main.js`, después de los imports existentes:

```js
import { startLiveUpdates } from './live-updates.js'

startLiveUpdates()
```

- [ ] **Step 5: Eliminar el botón "Actualizar" del chat**

En `js/assistant.js` quitar del template del header (líneas ~117-120) el bloque:

```html
<button id="refreshApp" class="text-xs text-[var(--black-60)] hover:text-[var(--blue-100)] font-bold flex items-center gap-1" title="Actualizar la app">
  <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Actualizar
</button>
```

Y en `bindAssistantEvents()` quitar:

```js
const refreshBtn = document.getElementById('refreshApp')

refreshBtn.addEventListener('click', () => {
  // Force reload bypassing browser cache
  window.location.href = window.location.origin + window.location.pathname + '?v=' + Date.now()
})
```

- [ ] **Step 6: Verificar en navegador local**

Run: `npx tailwindcss -i css/input.css -o css/tw.css --minify` y servir la carpeta (`npx serve .` o similar). Abrir la app:
Expected: el chat carga sin botón "Actualizar", con "Limpiar" intacto; consola sin errores; sin `version.json` local el watcher queda inactivo (ninguna recarga espontánea).

- [ ] **Step 7: Commit**

```bash
git add vercel.json .gitignore js/live-updates.js js/main.js js/assistant.js
git commit -m "feat(live-updates): auto-recarga ante deploys nuevos via version.json; quitar botón Actualizar"
```

---

### Task 3: Contenido en tiempo real (Supabase Realtime)

**Files:**
- Create: `supabase/migrations/enable_realtime_content.sql`
- Modify: `js/assistant.js:17-42` (exports de contexto/chips)
- Modify: `js/resources.js:9` (export)
- Modify: `js/live-updates.js` (suscripciones)

**Interfaces:**
- Consumes: `startLiveUpdates()` existente (Task 2); `loadChips()` y `sendMessage()` internos de `assistant.js`.
- Produces: `loadFaqContext()` y `rerenderChips()` exportados de `js/assistant.js`; `renderResources()` exportado de `js/resources.js`; `startRealtime()` interno de `live-updates.js` llamado por `startLiveUpdates()`.
- NO tocar `js/lessons.js`: su Realtime de `lecciones` (líneas 390-402) ya cubre esa tabla.

- [ ] **Step 1: Crear la migración SQL**

```sql
-- supabase/migrations/enable_realtime_content.sql
-- Habilita Supabase Realtime (postgres_changes) para el contenido que el
-- portal del cliente refresca en vivo. (`lecciones` ya está en la publicación
-- desde la feature de realtime de lecciones.) Ejecutar UNA sola vez en el SQL
-- Editor del proyecto Supabase (falla con "already member" si se repite: ignorar).
alter publication supabase_realtime add table public.preguntas_frecuentes;
alter publication supabase_realtime add table public.bot_sugerencias;
```

- [ ] **Step 2: Exportar los hooks de contenido en assistant.js**

En `js/assistant.js`:

1. Cambiar `async function loadFaqContext()` por `export async function loadFaqContext()`.
2. Agregar después de `loadChips()`:

```js
// Re-dibuja los chips de sugerencias (solo si el chat sigue en estado
// inicial: con conversación en curso no movemos la UI debajo del usuario).
export async function rerenderChips() {
  const wrap = document.getElementById('quickQueries')
  if (!wrap || history.length > 0) return
  const chips = await loadChips()
  wrap.innerHTML = chips.map(q => `
    <button class="quick-query shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border border-[var(--blue-20)] hover:border-[var(--blue-100)] transition-colors whitespace-nowrap">${escapeHtml(q)}</button>
  `).join('')
  wrap.querySelectorAll('.quick-query').forEach(btn => {
    btn.addEventListener('click', () => sendMessage(btn.textContent))
  })
}
```

- [ ] **Step 3: Exportar el render de recursos**

- `js/resources.js:9`: `async function renderResources()` → `export async function renderResources()`

(El módulo ya se auto-ejecuta al final del archivo; eso no cambia. NO tocar `js/lessons.js`.)

- [ ] **Step 4: Suscripciones Realtime en live-updates.js**

Agregar a `js/live-updates.js`:

```js
import { supabase } from './supabase.js'
import { loadFaqContext, rerenderChips } from './assistant.js'
import { renderResources } from './resources.js'

function debounce(fn, ms) {
  let t
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) }
}

// Debounce de 1.5 s: si el admin guarda varias filas seguidas, un solo refresh.
// (`lecciones` no se suscribe aquí: lessons.js ya tiene su propio canal.)
const onFaqChange   = debounce(() => { loadFaqContext(); renderResources().catch(() => {}) }, 1500)
const onChipsChange = debounce(() => { rerenderChips().catch(() => {}) }, 1500)

function startRealtime() {
  const channel = supabase.channel('live-content')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'preguntas_frecuentes' }, onFaqChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_sugerencias' }, onChipsChange)
    .subscribe(status => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[live-updates] Realtime desconectado, reintento en 30 s')
        setTimeout(() => { supabase.removeChannel(channel); startRealtime() }, 30_000)
      }
    })
}
```

Y en `startLiveUpdates()`:

```js
export function startLiveUpdates() {
  startVersionWatcher()
  startRealtime()
}
```

- [ ] **Step 5: Verificar que los tests de Node siguen pasando**

Run: `node --test tests/`
Expected: PASS — `reload-policy.test.mjs` y `storage.test.mjs` verdes (live-updates.js NO se importa desde tests; importa supabase y solo corre en navegador).

- [ ] **Step 6: Ejecutar la migración en Supabase**

Manual (usuario o agente con acceso): abrir Supabase → SQL Editor → pegar el contenido de `supabase/migrations/enable_realtime_content.sql` → Run.
Expected: `Success. No rows returned`. Si dice `relation ... is already member of publication`, ya estaba habilitado: continuar.

- [ ] **Step 7: Verificación manual en navegador**

Con la app servida localmente (y la migración ejecutada): abrir el portal, y desde el admin (u otra pestaña) editar el texto de una sugerencia de `bot_sugerencias`.
Expected: en ≤2 s el chip del chat cambia sin recargar. En consola no hay errores.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/enable_realtime_content.sql js/assistant.js js/resources.js js/live-updates.js
git commit -m "feat(live-updates): contenido en tiempo real via Supabase Realtime (FAQs y chips)"
```

---

### Task 4: Animación de escritura progresiva con "Mostrar todo"

**Files:**
- Create: `js/typewriter.js`
- Modify: `js/assistant.js` (integración en `renderAssistant`, `appendSegments`, `sendMessage`, `appendBubble`)

**Interfaces:**
- Consumes: `isNearBottom(el)` de `js/reload-policy.js` (Task 1).
- Produces: `typewrite(rootEl, { onTick }) → Promise<void>` y `skipActiveTypewriter()` (exports de `js/typewriter.js`). La clase CSS `tw-running` sobre la burbuja en animación (la usa `botIsBusy()` de Task 2).

- [ ] **Step 1: Crear el motor js/typewriter.js**

```js
// js/typewriter.js
// Escritura progresiva: el HTML de la burbuja ya está completo en el DOM;
// se vacían sus nodos de texto y se revelan por partes con un TreeWalker.
// Elementos atómicos (img/iframe/svg) se ocultan con visibility (conservan
// su espacio, sin saltos de layout) y aparecen cuando les llega el turno.

const CHARS_PER_TICK = 3   // ~190 caracteres/seg a 16 ms por tick
const TICK_MS = 16

let active = null // { root, skip } de la animación en curso

export function skipActiveTypewriter() {
  active?.skip()
}

function buildRevealPlan(root) {
  const steps = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let node
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.nodeValue) continue
      steps.push({ kind: 'text', node, full: node.nodeValue })
      node.nodeValue = ''
    } else if (['IMG', 'IFRAME', 'SVG'].includes((node.tagName || '').toUpperCase())) {
      node.style.visibility = 'hidden'
      steps.push({ kind: 'atom', node })
    }
  }
  return steps
}

export function typewrite(root, { onTick } = {}) {
  return new Promise(resolve => {
    const steps = buildRevealPlan(root)
    root.classList.add('tw-running')
    let i = 0, pos = 0, finished = false

    function finish() {
      if (finished) return
      finished = true
      clearInterval(timer)
      for (; i < steps.length; i++) {
        const s = steps[i]
        if (s.kind === 'text') s.node.nodeValue = s.full
        else s.node.style.visibility = ''
      }
      root.classList.remove('tw-running')
      if (active?.root === root) active = null
      onTick?.()
      resolve()
    }

    const timer = setInterval(() => {
      let budget = CHARS_PER_TICK
      while (budget > 0 && i < steps.length) {
        const s = steps[i]
        if (s.kind === 'atom') { s.node.style.visibility = ''; i++; continue }
        const take = Math.min(budget, s.full.length - pos)
        pos += take
        budget -= take
        s.node.nodeValue = s.full.slice(0, pos)
        if (pos >= s.full.length) { i++; pos = 0 }
      }
      onTick?.()
      if (i >= steps.length) finish()
    }, TICK_MS)

    active = { root, skip: finish }
  })
}
```

- [ ] **Step 2: Integrar en assistant.js — imports y estado**

En `js/assistant.js` agregar imports:

```js
import { typewrite, skipActiveTypewriter } from './typewriter.js'
import { isNearBottom } from './reload-policy.js'
```

Estado nuevo junto a los `let` existentes (línea ~44):

```js
let followScroll  = true   // el usuario está al fondo → el scroll acompaña
let skipAll       = false  // "Mostrar todo": revela el resto sin animar
```

- [ ] **Step 3: Tracking de scroll y helpers de animación**

En `renderAssistant()`, dentro del template, cambiar el div raíz `<div class="flex flex-col h-full">` por `<div class="flex flex-col h-full relative">` (ancla para el botón de saltar).

Al final de `bindAssistantEvents()` agregar:

```js
const box = document.getElementById('chatMessages')
box.addEventListener('scroll', () => { followScroll = isNearBottom(box) })
box.addEventListener('click', e => {
  if (e.target.closest('.tw-running')) { skipAll = true; skipActiveTypewriter() }
})
```

Agregar estos helpers después de `scrollToBottom()`:

```js
function onTypeTick() {
  if (followScroll) scrollToBottom()
}

function scrollToMessageTop(el) {
  const box = document.getElementById('chatMessages')
  box.scrollTop = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 8
}

function showSkipButton() {
  if (document.getElementById('twSkipBtn')) return
  const btn = document.createElement('button')
  btn.id = 'twSkipBtn'
  btn.textContent = 'Mostrar todo ↓'
  btn.style.cssText = 'position:absolute;bottom:88px;right:16px;z-index:20;background:var(--blue-100);color:#fff;font-size:11px;font-weight:700;padding:6px 12px;border-radius:9999px;box-shadow:0 2px 8px rgba(0,0,0,.18);font-family:var(--font-family);'
  btn.onclick = () => { skipAll = true; skipActiveTypewriter() }
  document.getElementById('section-assistant').firstElementChild.appendChild(btn)
}

function hideSkipButton() {
  document.getElementById('twSkipBtn')?.remove()
}
```

- [ ] **Step 4: Burbuja de bot animada**

Agregar después de `appendBubble()`:

```js
// Crea la burbuja del bot con el HTML completo y la anima (o la muestra
// entera si el usuario ya pidió "Mostrar todo" en esta respuesta).
async function appendBotAnimated(content) {
  const box = document.getElementById('chatMessages')
  const div = document.createElement('div')
  div.className = 'flex justify-start'
  const wide = hasMedia(content)
  div.innerHTML = `<div class="${wide ? 'msg-bot-wide' : 'msg-bot'} text-sm">${renderMarkdown(content)}</div>`
  box.appendChild(div)
  if (!skipAll) await typewrite(div.firstElementChild, { onTick: onTypeTick })
  return div
}
```

- [ ] **Step 5: Animar appendSegments**

Convertir `appendSegments` en `async function appendSegments(segments)`. Dentro:

1. En `flushText()`: reemplazar el cuerpo para que devuelva el trabajo asíncrono acumulable. Cambiar la función interna por:

```js
async function flushText() {
  if (!textBuffer.length) return
  const content = textBuffer.join('\n\n')
  textBuffer = []
  await appendBotAnimated(content)
}
```

2. Reemplazar cada llamada `flushText()` por `await flushText()` (hay 4: antes de imagen, video, link, y la final).
3. Para los bloques de media (imagen/video/link), después de `box.appendChild(...)` de cada uno, si `!skipAll`, ocultarlos y revelarlos en secuencia con una pequeña pausa en lugar del `scrollToBottom()` directo:

```js
// tras appendChild del bloque de imagen / video / link:
if (!skipAll) {
  d.style.visibility = 'hidden'
  await new Promise(r => setTimeout(r, 150))
  d.style.visibility = ''
}
onTypeTick()
```

(donde `d` es el contenedor creado en cada rama; en la rama de link el contenedor agregado al DOM es `wrap`).

- [ ] **Step 6: Integrar en sendMessage**

En `sendMessage()`, dentro del `try` después de `typing.classList.add('hidden')`, reemplazar el bloque que agrega la respuesta (desde `if (segments)` hasta `appendResolutionButtons()`) por:

```js
    skipAll = false
    showSkipButton()
    let firstBubbleEl = null
    const box = document.getElementById('chatMessages')
    const markFirst = () => { if (!firstBubbleEl) { firstBubbleEl = box.lastElementChild; scrollToMessageTop(firstBubbleEl); followScroll = isNearBottom(box) } }

    if (segments) {
      const observer = new MutationObserver(() => { markFirst(); observer.disconnect() })
      observer.observe(box, { childList: true })
      await appendSegments(segments)
      observer.disconnect()
    } else {
      const p = appendBotAnimated(reply)
      markFirst()
      await p
      if (data.media?.length) appendMedia(data.media)
    }
    hideSkipButton()
    if (data.support_redirected) appendSupportCTA()
    appendResolutionButtons()
```

Y al final de `sendMessage()` (fuera del try/catch) eliminar el `scrollToBottom()` final (el scroll ya lo maneja la animación; en el catch de error se conserva el comportamiento actual).
En el `catch`, agregar `hideSkipButton()` antes del `appendBubble` de error.

- [ ] **Step 7: Animar también los mensajes cortos de resolución**

En `resolveConversation()`, reemplazar `appendBubble('bot', ...)` por `appendBotAnimated(...)` (sin await extra — la función ya es async):

```js
  await appendBotAnimated(resolved
    ? '¡Me alegra haber podido ayudarte! Escríbeme cuando tengas otra duda.'
    : 'Entendido. Para una ayuda más detallada puedes contactar a [Soporte Bold POS](https://api.whatsapp.com/send?phone=573171109500&text=Hola%20,%20necesito%20su%20ayuda%20en%20Bold%20POS.).')
```

- [ ] **Step 8: Verificación en navegador**

Servir localmente y probar en el chat:
1. Pregunta corta → escritura fluida, botón "Mostrar todo ↓" visible durante la animación y desaparece al terminar; botones "¿Logré resolver tu duda?" aparecen al final.
2. Pregunta que devuelva lección larga → el chat se posiciona al INICIO de la respuesta; el texto crece hacia abajo sin arrastrar al usuario; si el usuario baja al fondo, el scroll acompaña.
3. Click en "Mostrar todo ↓" a mitad de animación → todo el contenido (media incluida) aparece al instante.
4. Recargar la página → el historial restaurado se muestra completo SIN animación.
5. `node --test tests/` sigue verde.

- [ ] **Step 9: Commit**

```bash
git add js/typewriter.js js/assistant.js
git commit -m "feat(chat): animación de escritura progresiva con Mostrar todo y scroll desde el inicio"
```

---

### Task 5: Verificación integral en sandbox

**Files:**
- Ninguno nuevo (push + pruebas).

**Interfaces:**
- Consumes: todo lo anterior desplegado en la rama `sandbox`.

- [ ] **Step 1: Push a sandbox**

```bash
git push origin sandbox
```

Expected: Vercel construye el preview. Verificar build OK en el dashboard o esperando ~90 s.

- [ ] **Step 2: Verificar version.json en el preview**

Run: `curl -s https://academia-bold-v1-git-sandbox-jeffreymartinezhn-projects.vercel.app/version.json`
(Nota: el preview tiene Vercel Authentication; si devuelve 302/HTML de login, verificar desde el navegador logueado.)
Expected: `{"v":"<sha del commit>"}`.

- [ ] **Step 3: Prueba end-to-end en el navegador (sandbox)**

1. Abrir el sandbox logueado en Vercel. Confirmar: sin botón "Actualizar", chat funcional.
2. Editar una FAQ/sugerencia en el admin del sandbox → la sesión abierta se actualiza sin recargar (≤2 s).
3. Hacer un commit trivial y push a `sandbox` → en ≤60 s tras el deploy, la pestaña abierta se recarga sola; el historial del chat sobrevive.
4. Repetir el punto 3 pero con texto escrito en el input sin enviar → la recarga espera hasta vaciar/enviar el input.
5. Pregunta con lección larga → animación completa según Task 4 Step 8.

- [ ] **Step 4: Reporte al usuario**

Resumir resultados y quedar a la espera de su aprobación para mergear `sandbox` → `master` (producción). NO mergear sin confirmación.
