# Mejoras del Bot — Frente 3 (pregunta de vertical + n8n) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan checkbox (`- [ ]`).

**Goal:** Que el bot pregunte al inicio "¿Retail o Restaurantes?" (detrás de un toggle en Sugerencias, apagado por defecto) y que n8n no mezcle lecciones entre verticales/plataformas, subiendo la tasa de resolución real.

**Architecture:** Sitio estático + Supabase para el frontend del chat (`js/assistant.js`, `js/admin.js`), y el workflow n8n "Bold POS Chat" (id `dZGuYJbRbG6h8aqv`) para el cerebro. El frontend ya manda `vertical`/`plataforma` en el body del webhook (deploy 9ef8794). Fase 1 (frontend) es git-committed y queda dormida tras un toggle OFF → cero impacto en producción hasta habilitarla. Fase 2 (n8n) se edita vía API con backup y prueba en vivo.

**Tech Stack:** JS vanilla ES modules, Tailwind CSS vars, Supabase JS v2, `app_settings` (convención: clave ausente/≠'false' = habilitado), n8n public API (curl PUT), OpenAI (gpt-4o / gpt-4o-mini), RPC `match_lessons` (ya acepta `p_vertical`/`p_plataforma` default null).

## Global Constraints

- Diagnóstico y decisiones en memoria `bolbot-mejoras-plan.md`. Toggle `bot_pregunta_vertical` **OFF por defecto** (no hay lecciones de Restaurantes hasta el próximo mes).
- La vertical elegida por el bot se guarda en la MISMA clave de storage del portal: `bold_vertical` (sincronía bot↔portal). Si ya hay `bold_vertical` guardado, el bot NO pregunta.
- Convención `app_settings`: clave ausente o valor ≠ `'false'` ⇒ habilitado. Toggles se escriben con `String(bool)`.
- Backup del workflow: `.superpowers/sdd/n8n-workflow-backup-2026-07-14.json` (rollback = PUT de ese JSON). Token webhook de prueba: header `x-api-key: BoldBodi-2026-K9xMvP7q`.
- **Filtro de vertical ESTRICTO** (Retail nunca recibe contenido de Restaurantes); **plataforma SUAVE** (contexto para el LLM, no filtro duro en la RPC, para no ocultar lecciones de la otra plataforma).
- n8n en producción y activo: cada edición se prueba con el webhook antes de dar por buena; el backup permite rollback inmediato.
- Copy de UI en español; commits estilo repo.

---

## Fase 1 — Frontend (git, dormido tras toggle OFF)

### Task 1: Toggle `bot_pregunta_vertical` en Sugerencias

**Files:**
- Modify: `js/admin.js` (`renderSuggestionsPanel`, tarjeta "Comportamiento" ~línea 2150-2163 y carga de settings ~línea 2134-2138)

**Interfaces:**
- Consumes: patrón `.setting-toggle` con `data-setting` (auto-cableado por el handler existente en ~línea 2214 que hace upsert a `app_settings` + `logActivity('update','bot_setting',clave)`).
- Produces: clave `bot_pregunta_vertical` en `app_settings` (leída por Task 2).

- [ ] **Step 1: Incluir la clave en la carga de settings del panel**

En `renderSuggestionsPanel`, cambiar el `.in([...])`:

```js
    .in('key', ['chips_inicio', 'chips_tras_respuesta', 'bot_pregunta_vertical'])
```

- [ ] **Step 2: Agregar el toggle a la tarjeta "Comportamiento"**

Dentro del `<div class="space-y-3">` de la tarjeta Comportamiento, después del label de `chips_tras_respuesta`, agregar:

```html
        <label class="flex items-center justify-between gap-3 ${settingsError ? 'opacity-50' : 'cursor-pointer'}">
          <span class="text-sm font-bold">Preguntar Retail o Restaurantes al abrir el chat<span class="block text-[10px] font-normal text-[var(--black-40)]">Actívalo cuando ya existan lecciones de Restaurantes.</span></span>
          <input type="checkbox" data-setting="bot_pregunta_vertical" class="setting-toggle w-4 h-4 accent-[var(--blue-100)]" ${settingsError ? 'disabled' : ''} ${settings.bot_pregunta_vertical === 'true' ? 'checked' : ''}>
        </label>
```

Nota: este toggle usa `=== 'true'` (OFF por defecto: ausente ⇒ desactivado), a diferencia de los chips que usan `!== 'false'` (ON por defecto). El handler `.setting-toggle` ya persiste `String(checked)`, así que un click enciende con `'true'` y apaga con `'false'` — consistente con la lectura.

- [ ] **Step 3: Etiqueta legible en actividad**

En `js/admin.js`, el mapa de etiquetas de actividad (~línea 128, donde está `bot_setting: 'Config. bot'`) ya cubre `bot_setting`; no requiere cambio (la clave se registra vía `logActivity('update','bot_setting','bot_pregunta_vertical')`). Verificar que el registro de actividad muestra algo legible; si el detalle crudo `bot_pregunta_vertical` se ve mal, mapearlo donde se traducen las claves de setting (mismo lugar que `chips_inicio`/`chips_tras_respuesta` si existe tal mapa; si no, dejar la clave cruda como los demás).

- [ ] **Step 4: Verificación manual**

En `/admin` → Sugerencias: el toggle aparece apagado, encenderlo muestra toast y queda `bot_pregunta_vertical='true'` en `app_settings` (Table Editor); recargar conserva el estado; apagarlo escribe `'false'`.

- [ ] **Step 5: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): toggle para preguntar Retail/Restaurantes al abrir el chat"
```

### Task 2: Pregunta de vertical en el chat (`js/assistant.js`)

**Files:**
- Modify: `js/assistant.js` (`loadChipSettings`/estado ~línea 49-64, `renderAssistant` ~línea 147-189, y el saludo inicial ~línea 166-170)

**Interfaces:**
- Consumes: `app_settings.bot_pregunta_vertical`; `storageGet`/`storageSet` (ya importados); `VERTICALES` de `js/vertical.js` (labels/iconos).
- Produces: escribe `bold_vertical` en storage (lo lee el portal y el body del webhook vía `getSeleccion`).

- [ ] **Step 1: Cargar el setting de pregunta de vertical**

Extender `loadChipSettings` (o agregar carga análoga) para leer `bot_pregunta_vertical` junto a los chips, guardando en el estado del módulo:

```js
let askVertical = false  // bot_pregunta_vertical: OFF por defecto
```

En la query de settings, agregar `'bot_pregunta_vertical'` al `.in([...])` y setear `askVertical = map.bot_pregunta_vertical === 'true'`.

- [ ] **Step 2: Decidir si preguntar**

Función pura para la condición (fácil de testear):

```js
// Pregunta la vertical solo si: el toggle está ON, el usuario no la eligió aún
// (ni en el portal ni antes en el chat) y no hay conversación en curso.
export function debePreguntarVertical({ askVertical, verticalGuardada, history }) {
  return askVertical === true && !verticalGuardada && (history?.length || 0) === 0
}
```

- [ ] **Step 3: Test de la condición**

`tests/assistant-vertical.test.mjs` (import estático de la función pura):

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { debePreguntarVertical } from '../js/assistant.js'

test('pregunta solo con toggle ON, sin vertical guardada y sin historial', () => {
  assert.equal(debePreguntarVertical({ askVertical: true,  verticalGuardada: null,      history: [] }), true)
  assert.equal(debePreguntarVertical({ askVertical: false, verticalGuardada: null,      history: [] }), false)
  assert.equal(debePreguntarVertical({ askVertical: true,  verticalGuardada: 'retail',  history: [] }), false)
  assert.equal(debePreguntarVertical({ askVertical: true,  verticalGuardada: null,      history: [{role:'user',content:'x'}] }), false)
})
```

Nota: `js/assistant.js` importa desde CDN (`supabase-js`) al cargarse, lo que rompe el import en Node. Para poder testear la función pura sin ejecutar el módulo entero, extraer `debePreguntarVertical` a `js/vertical.js` (que ya es import-safe en Node y ya tiene tests) en lugar de a `assistant.js`. Ajustar el import del test a `../js/vertical.js` y que `assistant.js` la importe desde ahí. **Decisión: colocar `debePreguntarVertical` en `js/vertical.js`.**

- [ ] **Step 4: Render de la pregunta de vertical**

En `renderAssistant`, cuando `debePreguntarVertical(...)` sea true, en lugar del saludo normal + chips de sugerencia, mostrar el saludo seguido de dos chips grandes (mismo estilo monocromo del portal, iconos lucide `store`/`utensils`):

```js
// dentro del innerHTML de #chatMessages, reemplazando el saludo por:
`<div class="flex justify-start">
  <div class="msg-bot text-sm">¡Hola! Soy bolbot POS 👋 Para darte la ayuda correcta, ¿qué producto Bold usas?</div>
</div>
<div id="verticalPick" class="flex gap-2 px-1 pt-1">
  <button data-vertical="retail" class="vpick flex-1 rounded-xl border-[1.5px] border-[var(--blue-20)] px-3 py-2 text-center hover:border-[var(--blue-100)]">
    <i data-lucide="store" class="w-4 h-4 mx-auto mb-0.5"></i><span class="block text-xs font-black">Retail</span>
  </button>
  <button data-vertical="restaurantes" class="vpick flex-1 rounded-xl border-[1.5px] border-[var(--blue-20)] px-3 py-2 text-center hover:border-[var(--blue-100)]">
    <i data-lucide="utensils" class="w-4 h-4 mx-auto mb-0.5"></i><span class="block text-xs font-black">Restaurantes</span>
  </button>
</div>`
```

Mientras la pregunta esté visible, ocultar los chips de sugerencia y el input (o dejar el input pero sin foco): el usuario primero elige vertical. Al hacer click en `.vpick`:

```js
container.querySelectorAll('.vpick').forEach(btn => btn.addEventListener('click', () => {
  storageSet('bold_vertical', btn.dataset.vertical)
  renderAssistant() // re-render: ya hay vertical guardada → saludo normal + chips
}))
```

Como `renderAssistant` se re-ejecuta y ahora `bold_vertical` existe, `debePreguntarVertical` da false y el chat sigue su flujo normal. La vertical viaja al webhook automáticamente (el body ya incluye `...getSeleccion()`).

- [ ] **Step 5: Verificación manual**

Con `bot_pregunta_vertical='true'` en `app_settings` y `bold_vertical` limpio en localStorage: abrir el chat muestra la pregunta con los dos botones; elegir uno guarda `bold_vertical`, muestra el saludo normal y los chips, y un mensaje enviado incluye ese `vertical` en el POST a `/api/chat` (pestaña Network). Con el toggle OFF o con `bold_vertical` ya presente: el chat abre normal sin preguntar. Con conversación en curso (history no vacío): no pregunta.

- [ ] **Step 6: Commit**

```bash
git add js/assistant.js js/vertical.js tests/assistant-vertical.test.mjs
git commit -m "feat(bot): pregunta inicial Retail/Restaurantes en el chat (tras toggle)"
```

---

## Fase 2 — n8n (API, en vivo, con backup y prueba)

> Antes de cualquier PUT: confirmar que el backup `.superpowers/sdd/n8n-workflow-backup-2026-07-14.json` existe y es válido. Cada task edita el workflow con `curl PUT` (patrón aprobado en settings.local.json) sobre el JSON completo modificado, y se prueba con el webhook antes de continuar. Ante cualquier fallo: rollback restaurando el backup con un PUT.

### Task 3: Filtro de vertical en "Buscar lecciones"

**Files:**
- Modify (vía API): nodo "Buscar lecciones" del workflow n8n.

**Interfaces:**
- Consumes: `vertical` del body del webhook (disponible como `$('Validar input y token').first().json.vertical`).
- Produces: `match_lessons` recibe `p_vertical` (estricto); `p_plataforma` se deja en null (suave, se maneja en el prompt — Task 4).

- [ ] **Step 1: Ajustar el body del nodo "Buscar lecciones"**

El body actual arma `{ query_embedding, match_count: 5, match_threshold: 0.15 }`. Cambiarlo a:

```
={{ JSON.stringify({ query_embedding: $('Embeber pregunta').first().json.data[0].embedding, match_count: 5, match_threshold: 0.15, p_vertical: ($('Validar input y token').first().json.vertical || null), p_plataforma: null }) }}
```

`p_vertical` estricto (null si el body no lo trae ⇒ sin filtro, retrocompatible). `p_plataforma: null` deliberado (plataforma suave).

- [ ] **Step 2: Aplicar vía API y probar**

Editar el JSON del workflow (solo ese nodo), hacer `curl PUT`, y probar el webhook con 3 payloads: (a) sin `vertical` (retrocompat, debe traer lecciones como hoy), (b) `vertical:'retail'` (debe traer solo retail — hoy todas), (c) `vertical:'restaurantes'` (debe traer 0 hasta que existan lecciones). Verificar en la respuesta que no hay error y que el filtro se aplicó.

- [ ] **Step 3: Registrar en el ledger** el commit-equivalente (n8n no es git): anotar en `.superpowers/sdd/progress.md` el cambio aplicado y que la prueba pasó.

### Task 4: Reforzar el prompt (FAQs, plataforma, repregunta, mayúsculas)

**Files:**
- Modify (vía API): nodo "Construir prompt" (system prompt) y nodo "Embeber pregunta" (normalización).

**Interfaces:**
- Consumes: `plataforma`/`vertical` del body (para contexto); el embedding.

- [ ] **Step 1: Contexto de plataforma/vertical en el system prompt**

En "Construir prompt", agregar al `systemPrompt` una línea con el contexto del cliente cuando venga en el body: p. ej. `'El cliente usa Bold POS ' + vertical + ' en plataforma ' + plataforma + '. Prioriza pasos de esa plataforma; si la lección es de la otra plataforma, adáptala y acláraselo.'` (leer `vertical`/`plataforma` de `$('Validar input y token').first().json`, con fallback a retail/web).

- [ ] **Step 2: Reforzar uso de FAQs y repregunta**

Ajustar las reglas del system prompt: (a) reforzar que las FAQs/[FAQ] en las lecciones son respuestas válidas y deben usarse; (b) **antes** de derivar a soporte por pregunta vaga o de una sola palabra (ej. "IMPRESORA", "Periféricos"), hacer UNA pregunta corta de aclaración en vez de mandar directo a soporte. Esto se hace en el prompt (no recableando nodos), dado que la cadena RAG corre siempre y el nodo "Clarificar" está desconectado.

- [ ] **Step 3: Normalizar el input del embedding**

En "Embeber pregunta", normalizar el texto antes de embeber para que MAYÚSCULAS no degraden el retrieval: bajar a minúsculas la query (`.toLowerCase()`) manteniendo la lógica de contexto previo existente. Cambio mínimo dentro de la expresión que arma `input`.

- [ ] **Step 4: Aplicar vía API y probar** con los casos reales que fallaron: "IMPRESORA" (debe repreguntar, no mandar directo a soporte), "NO ENCUENTRO LA OPCION SINCRONIZAR" (mayúsculas → debe encontrar la lección de sincronización), "codigo de barras"→"como conecto el lector a la app" (seguimiento → debe encontrar la FAQ). Verificar respuestas.

- [ ] **Step 5: Registrar** el cambio y resultado de pruebas en `.superpowers/sdd/progress.md`.

### Task 5: Verificación integral y cierre

- [ ] **Step 1:** Suite de tests del repo verde (`node --test tests/*.test.mjs`).
- [ ] **Step 2:** Con el toggle ON en un entorno de prueba: flujo completo bot (pregunta vertical → elige → mensaje → respuesta filtrada por vertical) verificado en navegador.
- [ ] **Step 3:** Push de la Fase 1 a `sandbox`; deploy a producción con confirmación del usuario (la Fase 1 es inocua con el toggle OFF).
- [ ] **Step 4:** Confirmar el estado final del workflow n8n en producción (o rollback si algo quedó mal) y actualizar la memoria `bolbot-mejoras-plan.md` con lo hecho y lo que queda (frentes 1, 2 y 4).
