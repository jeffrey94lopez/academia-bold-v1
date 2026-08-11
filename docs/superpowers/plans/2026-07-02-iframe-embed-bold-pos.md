# Academia embebible en Bold POS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que la parte de usuario de la academia funcione de forma confiable dentro de un iframe cross-origin en Bold POS (pos.bold.co), sin pantalla en blanco aunque el navegador bloquee almacenamiento de terceros.

**Architecture:** Sitio estático (HTML + ES modules servidos por Vercel, sin bundler). Se agrega un módulo `js/storage.js` que envuelve `localStorage` con try/catch y fallback a un `Map` en memoria; los consumidores activos (`assistant.js`, `analytics.js`) lo importan, y `theme-init.js` (script clásico en `<head>`, no módulo) se protege con try/catch inline. Los headers anti-framing en `vercel.json` ya fueron relajados en el working tree para permitir `bold.co` y subdominios.

**Tech Stack:** JavaScript vanilla (ES modules), Vercel (headers/CSP), Node 24 built-in test runner (`node --test`) para el módulo de storage.

**Spec:** `docs/superpowers/specs/2026-07-02-iframe-embed-bold-pos-design.md`

## Global Constraints

- CSP `frame-ancestors` debe quedar exactamente: `'self' https://bold.co https://*.bold.co` (ningún otro origen).
- El header `X-Frame-Options` debe desaparecer por completo de `vercel.json`.
- Ninguna operación de storage puede lanzar excepción al usuario — nunca.
- `js/course.js`, `js/supabase.js` (función `studentClient`), `js/admin.js` y `admin.html` NO se tocan (course está deshabilitado; admin no se embebe).
- Sin dependencias nuevas de npm. El único devDependency existente es tailwindcss.
- Los fallos de storage son silenciosos: sin avisos al usuario, sin eventos de analytics.

---

### Task 1: Módulo `js/storage.js` con tests

**Files:**
- Create: `js/storage.js`
- Test: `tests/storage.test.mjs`

**Interfaces:**
- Consumes: nada (módulo hoja, sin imports).
- Produces: `storageGet(key: string): string | null`, `storageSet(key: string, value: string): void`, `storageRemove(key: string): void`. Ninguna lanza jamás. Task 2 las importa desde `./storage.js`.

**Contexto de diseño:** el módulo detecta una vez al cargar si `localStorage` es utilizable (write/read/remove de prueba en try/catch). Además, cada operación va en try/catch propio: si `setItem` falla en runtime (p. ej. `QuotaExceededError` o revocación de acceso a mitad de sesión), el valor cae al `Map` en memoria para que la siguiente lectura sea coherente dentro de la misma página. `storageGet` consulta el `Map` cuando `localStorage` no tiene el valor. En los tests, cada caso importa una instancia fresca del módulo con query-string (`import('../js/storage.js?caso=N')`) porque la detección ocurre al cargar y Node cachea módulos por URL completa.

- [ ] **Step 1: Escribir los tests (fallarán porque el módulo no existe)**

Crear `tests/storage.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'

// Cada test importa una instancia fresca del módulo (query-string distinta)
// porque storage.js detecta localStorage al cargar y Node cachea por URL.

function throwingStorage() {
  const boom = () => { throw new DOMException('blocked', 'SecurityError') }
  return { getItem: boom, setItem: boom, removeItem: boom }
}

function workingStorage() {
  const m = new Map()
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    _map: m,
  }
}

test('sin localStorage global: funciona con fallback en memoria', async () => {
  globalThis.localStorage = undefined
  const s = await import('../js/storage.js?caso=1')
  assert.equal(s.storageGet('x'), null)
  s.storageSet('x', 'hola')
  assert.equal(s.storageGet('x'), 'hola')
  s.storageRemove('x')
  assert.equal(s.storageGet('x'), null)
})

test('localStorage lanza SecurityError: nunca propaga, usa memoria', async () => {
  globalThis.localStorage = throwingStorage()
  const s = await import('../js/storage.js?caso=2')
  assert.doesNotThrow(() => s.storageSet('k', 'v'))
  assert.equal(s.storageGet('k'), 'v')
  assert.doesNotThrow(() => s.storageRemove('k'))
  assert.equal(s.storageGet('k'), null)
})

test('localStorage funcional: lee y escribe en localStorage real', async () => {
  const fake = workingStorage()
  globalThis.localStorage = fake
  const s = await import('../js/storage.js?caso=3')
  s.storageSet('tema', 'dark')
  assert.equal(fake._map.get('tema'), 'dark')
  assert.equal(s.storageGet('tema'), 'dark')
  s.storageRemove('tema')
  assert.equal(fake._map.has('tema'), false)
  assert.equal(s.storageGet('tema'), null)
})

test('setItem falla en runtime (quota): cae a memoria y la lectura es coherente', async () => {
  const fake = workingStorage()
  globalThis.localStorage = fake
  const s = await import('../js/storage.js?caso=4')
  fake.setItem = () => { throw new DOMException('quota', 'QuotaExceededError') }
  assert.doesNotThrow(() => s.storageSet('h', '[1,2]'))
  assert.equal(s.storageGet('h'), '[1,2]')
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `node --test tests/storage.test.mjs`
Expected: FAIL — `Cannot find module ... js/storage.js` en los 4 tests.

- [ ] **Step 3: Implementar `js/storage.js`**

```js
// js/storage.js — acceso a localStorage que nunca lanza.
// Dentro de un iframe third-party el navegador puede bloquear el storage
// (SecurityError) o borrarlo; aquí se degrada a un Map en memoria.
const memory = new Map()

const canUseLocalStorage = (() => {
  try {
    const k = '__bold_storage_test__'
    localStorage.setItem(k, '1')
    localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
})()

export function storageGet(key) {
  if (canUseLocalStorage) {
    try {
      const v = localStorage.getItem(key)
      if (v !== null) return v
    } catch {}
  }
  return memory.has(key) ? memory.get(key) : null
}

export function storageSet(key, value) {
  if (canUseLocalStorage) {
    try {
      localStorage.setItem(key, value)
      memory.delete(key)
      return
    } catch {}
  }
  memory.set(key, String(value))
}

export function storageRemove(key) {
  if (canUseLocalStorage) {
    try {
      localStorage.removeItem(key)
    } catch {}
  }
  memory.delete(key)
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `node --test tests/storage.test.mjs`
Expected: PASS — `# pass 4`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add js/storage.js tests/storage.test.mjs
git commit -m "feat(storage): safe localStorage wrapper with in-memory fallback"
```

---

### Task 2: Migrar consumidores activos al storage seguro

**Files:**
- Modify: `js/assistant.js` (líneas 1-2, 43, 51-52, 80, 498, 555)
- Modify: `js/analytics.js` (líneas 2, 5-6)
- Modify: `js/theme-init.js` (línea 1)

**Interfaces:**
- Consumes: `storageGet`, `storageSet`, `storageRemove` de `js/storage.js` (Task 1).
- Produces: nada nuevo — mismas claves de storage (`bold_chat_history`, `bold_session_id`, `bold_mode`, `theme`) y mismo comportamiento observable.

- [ ] **Step 1: `js/assistant.js` — import y reemplazo de las 6 llamadas directas**

Agregar el import (tras la línea 2 actual):

```js
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js'
import { escapeHtml } from './utils.js'
import { storageGet, storageSet, storageRemove } from './storage.js'
```

Línea 43:

```js
let history         = JSON.parse(storageGet('bold_chat_history') || '[]')
```

Líneas 51-52 (dentro de `createConversation`):

```js
  const sessionId = storageGet('bold_session_id') || crypto.randomUUID()
  storageSet('bold_session_id', sessionId)
```

Línea 80 (header `x-student-id`):

```js
          'x-student-id': storageGet('bold_session_id') || ''
```

Línea 498 (handler de `clearBtn`):

```js
    storageRemove('bold_chat_history')
```

Línea 555 (tras respuesta del bot):

```js
    storageSet('bold_chat_history', JSON.stringify(history.slice(-20)))
```

- [ ] **Step 2: `js/analytics.js` — import y reemplazo de las 2 lecturas**

```js
// js/analytics.js
import { supabase } from './supabase.js'
import { storageGet } from './storage.js'

export function track(eventType, payload = {}) {
  const session_id = storageGet('bold_session_id') || null
  const mode = storageGet('bold_mode') || (session_id ? 'course' : null)

  supabase
    .from('analytics_events')
    .insert({ event_type: eventType, payload, session_id, mode })
    .then(({ error }) => {
      if (error) console.error('[analytics] track error:', error)
    })
    .catch(err => console.error('[analytics] track error:', err))
}
```

- [ ] **Step 3: `js/theme-init.js` — try/catch inline**

Es un script clásico cargado en el `<head>` (no módulo ES): no puede importar
`storage.js`. Contenido completo del archivo:

```js
try{if(localStorage.theme==='dark')document.documentElement.classList.add('dark')}catch(e){}
```

- [ ] **Step 4: Verificar que no queda `localStorage` directo en la superficie embebida**

Run (Git Bash): `grep -n "localStorage" js/assistant.js js/analytics.js`
Expected: sin resultados (exit code 1).

Run: `grep -n "localStorage" js/theme-init.js`
Expected: 1 resultado, dentro del try/catch.

(`js/course.js`, `js/supabase.js` y `js/admin.js` conservan `localStorage` directo
a propósito — course está deshabilitado y admin no se embebe.)

- [ ] **Step 5: Smoke test top-level (regresión)**

Run: `npx -y serve -l 8080 .` (dejar corriendo) y abrir `http://localhost:8080` en el navegador.
Expected: el asistente carga y responde, las pestañas Lecciones y Recursos funcionan,
el tema oscuro persiste al recargar, y "Borrar chat" limpia el historial. Sin errores
en la consola relacionados con storage.

- [ ] **Step 6: Smoke test embebido (origen distinto)**

Crear en el scratchpad (NO commitear) `embed-test.html`:

```html
<!doctype html>
<title>Embed test</title>
<iframe src="http://localhost:8080/" style="width:420px;height:720px;border:1px solid #ccc"></iframe>
```

Servirla desde otro origen: `npx -y serve -l 9090 <carpeta-del-scratchpad>` y abrir
`http://127.0.0.1:9090/embed-test.html` (127.0.0.1 vs localhost = orígenes distintos).
Expected: la academia carga dentro del iframe (localmente no hay headers de Vercel,
así que el CSP no bloquea) y el asistente funciona.

- [ ] **Step 7: Commit**

```bash
git add js/assistant.js js/analytics.js js/theme-init.js
git commit -m "feat(embed): use crash-safe storage in embedded user surface"
```

---

### Task 3: Commit de headers y verificación post-deploy

**Files:**
- Modify: `vercel.json` (cambio YA aplicado en el working tree — este task solo lo commitea y verifica)

**Interfaces:**
- Consumes: nada.
- Produces: producción sirve `frame-ancestors 'self' https://bold.co https://*.bold.co` y ya no envía `X-Frame-Options`.

- [ ] **Step 1: Confirmar el diff pendiente de `vercel.json`**

Run: `git diff vercel.json`
Expected: solo dos cambios — desaparece el bloque `X-Frame-Options: DENY` y
`frame-ancestors 'none'` pasa a `frame-ancestors 'self' https://bold.co https://*.bold.co`.
Nada más tocado.

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "feat(embed): allow framing from bold.co for Bold POS integration"
```

- [ ] **Step 3: Desplegar (push a master → Vercel) y verificar headers en producción**

Tras el deploy:

Run: `curl.exe -sI https://academia.localizadoc.com/ | findstr /i "frame content-security"`
Expected: el header `Content-Security-Policy` contiene
`frame-ancestors 'self' https://bold.co https://*.bold.co` y NO aparece `X-Frame-Options`.

- [ ] **Step 4: Prueba de embed contra producción**

Editar el `embed-test.html` del scratchpad para apuntar a
`https://academia.localizadoc.com/` y abrirlo desde `http://127.0.0.1:9090`.
Expected: el navegador BLOQUEA el iframe (127.0.0.1 no está en la lista de
`frame-ancestors`) — esto confirma que la protección anti-clickjacking sigue viva.
La verificación positiva (que bold.co sí puede embeber) la hará el equipo de Bold POS;
pedirles confirmación.

- [ ] **Step 5: Prueba con cookies de terceros bloqueadas**

En Chrome: Configuración → Privacidad → Cookies de terceros → "Bloquear cookies de
terceros". Recargar la prueba de embed del paso 4 (aunque el frame esté bloqueado por
CSP para 127.0.0.1, esta prueba se completa cuando Bold POS tenga su embed): dentro
del iframe la academia debe cargar y el asistente responder, sin pantalla en blanco.
Mientras tanto, la cobertura de ese escenario queda garantizada por los tests de
Task 1 (storage que lanza SecurityError).

---

## Self-Review (ejecutada al escribir el plan)

1. **Cobertura del spec:** headers → Task 3; módulo storage → Task 1; refactor de los
   3 consumidores → Task 2; manejo de errores silencioso → Tasks 1-2; verificación
   (regresión, iframe hostil, post-deploy) → Task 2 steps 5-6 y Task 3 steps 3-5.
   Exclusiones (course.js, admin, studentClient) → Global Constraints. Sin huecos.
2. **Placeholders:** ninguno — todo step tiene código o comando concreto.
3. **Consistencia de tipos/nombres:** `storageGet`/`storageSet`/`storageRemove`
   idénticos en Task 1 (Produces), tests, y Task 2 (imports y usos).
