# Sub-proyecto A — Reglas de interacción del bot · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el bot indague antes de responder/escalar (tope 2), maneje "no tengo información" sin empujar a soporte, y deje señales deterministas (`bot_no_info`, `bot_asked_clarification`) para calcular los KPIs del Sprint 1.

**Architecture:** La lógica de conversación vive en el prompt del workflow n8n "Bold POS Chat" (la cadena RAG corre siempre; solo se edita el system prompt + la salida estructurada). El frontend aporta un cambio chico: cuenta un `clarify_count` de sesión, lo envía al webhook y persiste dos booleanos nuevos en `bodi_conversations`. La lógica pura del contador se aísla en un módulo import-safe (`js/clarify.js`) con tests unitarios; `assistant.js` (que importa desde CDN y no corre en Node) solo cablea.

**Tech Stack:** JS ES-modules vanilla (sin build), `node:test` para unit tests, Supabase REST (PATCH) para persistencia, n8n vía API REST (GET/PUT del workflow) para el prompt.

## Global Constraints

- Rama de trabajo: `sandbox`. No hacer deploy; el usuario aplica la migración y aprueba cada PUT a n8n.
- Copy sin-info **exacto** (R2, aprobado — no parafrasear): `Todavía no tengo información sobre eso 🙏 Soy un asistente que se actualiza cada semana con las consultas de los usuarios, así que es muy probable que pronto pueda ayudarte. ¿Quieres que te ayude con otra cosa mientras tanto?`
- Tope de indagación **determinista**: regla dura en el prompt `si clarify_count >= 2, no volver a preguntar`.
- Columnas nuevas: `bot_no_info` (← `knowledge_gap` de la respuesta) y `bot_asked_clarification` (← `asked_clarification`). **NO** reusar la columna `knowledge_gap` de ①a (reservada al texto del LLM de ①c).
- Campo `category` en la respuesta n8n se **reusa** del `topic` ya existente — no crear campo nuevo.
- Workflow n8n: **"Bold POS Chat"**, id `dZGuYJbRbG6h8aqv`, host `https://n8n.mplasesores.com`. Prueba del webhook con header `x-api-key: BoldBodi-2026-K9xMvP7q`.
- Edición de n8n en vivo = patrón frente 3: **backup del workflow → confirmar con el usuario → PUT → probar webhook → rollback restaurando el backup si algo falla.** Confirmar con el usuario antes de CADA PUT.
- La función pura NO va en `js/assistant.js` (importa desde CDN, rompe el import en Node). Va en `js/clarify.js`.
- KPIs que habilita (display es trabajo de C/D, aquí solo se deja el dato): preguntas completadas +10%, resolución +15% (proxy `1 − (escaladas + bot_no_info)/total`).

---

### Task 1: Migración de esquema (`bodi_conversations`)

Añade las dos columnas booleanas que persistirá el frontend. **La aplica el usuario en Supabase** (patrón de ①a); esta tarea entrega el SQL y lo verifica.

**Files:**
- Create: `supabase/migrations/add_bot_interaction_signals.sql` (convención del repo: todas las migraciones viven en `supabase/migrations/`)

**Interfaces:**
- Consumes: nada.
- Produces: columnas `bodi_conversations.bot_no_info boolean NOT NULL DEFAULT false` y `bodi_conversations.bot_asked_clarification boolean NOT NULL DEFAULT false`, consumidas por Task 3 (upsert).

- [ ] **Step 1: Escribir el archivo de migración**

Crear `supabase/migrations/add_bot_interaction_signals.sql` con:

```sql
-- Sub-proyecto A — señales deterministas de interacción del bot.
-- bot_no_info: el bot dio el mensaje sin-info (R2 / knowledge_gap de la respuesta n8n).
-- bot_asked_clarification: el turno fue una pregunta de aclaración (R1 / asked_clarification).
-- NO se reusa la columna knowledge_gap de ①a (reservada al texto descriptivo del LLM de ①c).
ALTER TABLE bodi_conversations
  ADD COLUMN IF NOT EXISTS bot_no_info boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bot_asked_clarification boolean NOT NULL DEFAULT false;
```

- [ ] **Step 2: Pedir al usuario que aplique la migración**

Mostrar el SQL y pedir que lo ejecute en el SQL editor de Supabase (o confirmar aplicarlo vía la tool `mcp__claude_ai_Supabase__apply_migration`). Esperar confirmación antes de seguir — Task 3 depende de que las columnas existan.

- [ ] **Step 3: Verificar que las columnas existen**

Consultar el catálogo (vía tool de Supabase `execute_sql`):

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'bodi_conversations'
  and column_name in ('bot_no_info', 'bot_asked_clarification');
```

Expected: 2 filas, ambas `boolean`, `is_nullable = NO`, default `false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/add_bot_interaction_signals.sql
git commit -m "chore: migración bot_no_info/bot_asked_clarification (sub-proyecto A)"
```

---

### Task 2: Módulo puro `js/clarify.js` (lógica del contador)

Función pura, import-safe en Node, para (a) decidir el próximo `clarify_count` a partir del actual y la respuesta del bot, y (b) armar el body del webhook con el shape correcto. Sin DOM, sin imports de CDN.

**Files:**
- Create: `js/clarify.js`
- Test: `tests/clarify.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `nextClarifyCount(current: number, data: object|null|undefined) => number` — devuelve `current+1` si `data.asked_clarification === true`; si no, `0`. Normaliza `current` inválido/negativo a `0`.
  - `chatRequestBody({ message: string, history: any[], faqContext: any, clarifyCount: number, seleccion: object }) => object` — devuelve `{ message, history, faq_context, clarify_count, ...seleccion }`.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/clarify.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { nextClarifyCount, chatRequestBody } from '../js/clarify.js'

test('nextClarifyCount incrementa cuando la respuesta pidió aclaración', () => {
  assert.equal(nextClarifyCount(0, { asked_clarification: true }), 1)
  assert.equal(nextClarifyCount(1, { asked_clarification: true }), 2)
})

test('nextClarifyCount reinicia a 0 en respuesta final', () => {
  assert.equal(nextClarifyCount(2, { asked_clarification: false }), 0)
  assert.equal(nextClarifyCount(2, {}), 0)
  assert.equal(nextClarifyCount(2, null), 0)
  assert.equal(nextClarifyCount(1, undefined), 0)
})

test('nextClarifyCount normaliza current inválido a 0 antes de decidir', () => {
  assert.equal(nextClarifyCount(-3, { asked_clarification: true }), 1)
  assert.equal(nextClarifyCount(NaN, { asked_clarification: true }), 1)
  assert.equal(nextClarifyCount(undefined, { asked_clarification: true }), 1)
  assert.equal(nextClarifyCount(2.5, { asked_clarification: true }), 1)
})

test('chatRequestBody incluye clarify_count y esparce la selección', () => {
  const body = chatRequestBody({
    message: 'hola',
    history: [{ role: 'user', content: 'hola' }],
    faqContext: [{ q: 'a' }],
    clarifyCount: 2,
    seleccion: { vertical: 'retail', plataforma: 'web' },
  })
  assert.deepEqual(body, {
    message: 'hola',
    history: [{ role: 'user', content: 'hola' }],
    faq_context: [{ q: 'a' }],
    clarify_count: 2,
    vertical: 'retail',
    plataforma: 'web',
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/clarify.test.mjs`
Expected: FAIL — `Cannot find module '../js/clarify.js'`.

- [ ] **Step 3: Escribir la implementación mínima**

Crear `js/clarify.js`:

```js
// Lógica pura del contador de indagación (clarify_count) del bot.
// Import-safe en Node: sin DOM ni dependencias de CDN. Testeable con node:test.
//
// El backend (n8n) usa `clarify_count >= 2` como regla dura para dejar de
// repreguntar. El frontend cuenta cuántas veces SEGUIDAS el bot pidió
// aclaración en la sesión y lo manda en el body del webhook.

// Próximo valor del contador a partir del actual y la respuesta del bot.
// Incrementa si el turno fue una aclaración; se reinicia en respuesta final.
export function nextClarifyCount(current, data) {
  const n = Number.isInteger(current) && current >= 0 ? current : 0
  return data && data.asked_clarification === true ? n + 1 : 0
}

// Body del POST al webhook n8n, con clarify_count y la selección esparcida.
export function chatRequestBody({ message, history, faqContext, clarifyCount, seleccion }) {
  return { message, history, faq_context: faqContext, clarify_count: clarifyCount, ...seleccion }
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/clarify.test.mjs`
Expected: PASS — 4 tests.

- [ ] **Step 5: Correr la suite completa (sin regresiones)**

Run: `node --test tests/*.test.mjs`
Expected: PASS — todos los archivos verdes.

- [ ] **Step 6: Commit**

```bash
git add js/clarify.js tests/clarify.test.mjs
git commit -m "feat: módulo puro clarify.js (contador de indagación + shape del body)"
```

---

### Task 3: Cablear `clarify.js` en `js/assistant.js`

Conectar la función pura al chat real: mantener un `clarify_count` de sesión, enviarlo en el body, actualizarlo con la respuesta, persistir los dos booleanos, y reiniciar el contador al limpiar el chat.

**Files:**
- Modify: `js/assistant.js` — import (junto a otros imports, cabecera del archivo); declaración de estado (~L84, junto a `sessionMessages`); body del fetch (L615); post-respuesta/upsert (L649-660); handler de `clearChat` (L567-575).

**Interfaces:**
- Consumes: `nextClarifyCount`, `chatRequestBody` de `js/clarify.js` (Task 2); `getSeleccion` de `js/vertical.js` (existente); columnas de Task 1.
- Produces: envía `clarify_count` al webhook; persiste `bot_no_info`/`bot_asked_clarification`. Consumido por C (etiqueta) y D (insights) más adelante.

> **Nota:** `assistant.js` importa desde CDN y no corre en Node, así que esta tarea no lleva unit test propio; su lógica testeable ya está cubierta por Task 2. Verificación = navegador (Task 4, Step 6) + revisión de que el cableado usa las funciones puras.

- [ ] **Step 1: Importar las funciones puras**

Añadir junto a los imports existentes de la cabecera de `js/assistant.js` (donde ya se importa `getSeleccion` desde `./vertical.js`):

```js
import { nextClarifyCount, chatRequestBody } from './clarify.js'
```

- [ ] **Step 2: Declarar el estado de sesión del contador**

En el bloque de estado (~L84, junto a `let sessionMessages = []`), añadir:

```js
let clarifyCount = 0   // indagaciones seguidas del bot en esta sesión (tope 2, ver clarify.js)
```

- [ ] **Step 3: Enviar `clarify_count` en el body del webhook**

Reemplazar la línea del body del fetch (L615):

```js
      body: JSON.stringify({ message: text, history, faq_context: cachedFaqs, ...getSeleccion() })
```

por:

```js
      body: JSON.stringify(chatRequestBody({
        message: text, history, faqContext: cachedFaqs,
        clarifyCount, seleccion: getSeleccion(),
      }))
```

- [ ] **Step 4: Actualizar el contador y persistir los booleanos tras la respuesta**

En el bloque post-respuesta, justo después de obtener `data` (después de L617 `const data = await res.json()` y una vez usado `data.response`), actualizar el contador:

```js
    clarifyCount = nextClarifyCount(clarifyCount, data)
```

Colocarlo antes del `upsertConversation`. Luego, en el patch de `upsertConversation` (L654-660), añadir las dos claves nuevas:

```js
    await upsertConversation({
      messages: sessionMessages,
      topic: data.topic || null,
      sentiment: data.sentiment ?? 'neutro',
      support_redirected: data.support_redirected || false,
      lessons_used: data.lessons_used || [],
      bot_no_info: data.knowledge_gap || false,
      bot_asked_clarification: data.asked_clarification || false,
    })
```

- [ ] **Step 5: Reiniciar el contador al limpiar el chat**

En el handler de `clearBtn` (L567-575), añadir el reinicio junto a los otros resets:

```js
  clearBtn.addEventListener('click', () => {
    skipActiveTypewriter()
    hideSkipButton()
    storageRemove('bold_chat_history')
    conversationId  = null
    sessionMessages = []
    history         = []
    clarifyCount    = 0
    renderAssistant()
  })
```

- [ ] **Step 6: Verificar que la suite sigue verde**

Run: `node --test tests/*.test.mjs`
Expected: PASS (esta tarea no añade tests; confirma que no rompió imports/parseo de otros módulos).

- [ ] **Step 7: Commit**

```bash
git add js/assistant.js
git commit -m "feat: assistant.js envía clarify_count y persiste bot_no_info/bot_asked_clarification"
```

---

### Task 4: Reglas de prompt y salida estructurada en n8n

Editar el workflow "Bold POS Chat" para: (R1) indagación adaptativa con tope duro por `clarify_count`, (R2) mensaje sin-info que no escala, (R3) nuevo gatillo de escalamiento tras 2 aclaraciones; y que la respuesta JSON incluya `knowledge_gap` y `asked_clarification`. **Todo vía prompt** — la cadena RAG corre siempre, el nodo "Clarificar" queda huérfano, no se recablea nada.

**Files:**
- Modify (en n8n, no en el repo): system prompt del nodo **"Construir prompt"**; esquema de salida del nodo del LLM; nodo **"Formatear respuesta"** (agrega los 2 campos al JSON).
- Create: `docs/superpowers/backups/2026-07-23-bold-pos-chat.json` (backup del workflow antes de editar).

**Interfaces:**
- Consumes: `clarify_count` que llega en el body del webhook (Task 3).
- Produces: respuesta JSON con `knowledge_gap: boolean` y `asked_clarification: boolean` (+ `topic` reusado como `category`), consumidos por Task 3 (upsert). Contrato de respuesta pasa de `{ response, segments[], media[], support_redirected, topic, sentiment, lessons_used }` a ese mismo objeto **+ `knowledge_gap`, `asked_clarification`**.

- [ ] **Step 1: Backup del workflow**

Obtener el workflow completo por API y guardarlo como backup. Ejemplo (ajustar host/credencial al patrón frente 3 ya aprobado):

```bash
curl -s -H "x-api-key: BoldBodi-2026-K9xMvP7q" \
  "https://n8n.mplasesores.com/api/v1/workflows/dZGuYJbRbG6h8aqv" \
  -o docs/superpowers/backups/2026-07-23-bold-pos-chat.json
```

Expected: archivo JSON con `nodes[]` incluyendo "Construir prompt", el nodo del LLM (OpenAI) y "Formatear respuesta". Confirmar que no está vacío antes de seguir.

- [ ] **Step 2: Commit del backup**

```bash
git add docs/superpowers/backups/2026-07-23-bold-pos-chat.json
git commit -m "chore: backup del workflow Bold POS Chat antes de reglas de interacción"
```

- [ ] **Step 3: Redactar el system prompt (R1/R2/R3) e insertarlo en "Construir prompt"**

Bloque a añadir al system prompt (few-shot incluido para fiabilidad de los booleanos). Insertarlo en el texto del nodo "Construir prompt", conservando lo existente de RAG/formato:

```
REGLAS DE INTERACCIÓN

R1 — Indagación (tope 2). Recibes clarify_count = {{ clarify_count }}.
- Si el mensaje es ambiguo o una palabra suelta (ej. "IMPRESORA", "Periféricos")
  y no tienes contexto suficiente para responder con confianza, haz UNA pregunta
  corta de aclaración; NO respondas ni escales. En ese caso asked_clarification = true.
- REGLA DURA: si clarify_count >= 2, NO vuelvas a preguntar. Da la mejor respuesta
  posible con las lecciones disponibles, o escala a soporte si aplica.

R2 — Sin información. Si entendiste la pregunta pero NO hay contenido en las
lecciones para responderla, responde EXACTAMENTE:
"Todavía no tengo información sobre eso 🙏 Soy un asistente que se actualiza cada
semana con las consultas de los usuarios, así que es muy probable que pronto pueda
ayudarte. ¿Quieres que te ayude con otra cosa mientras tanto?"
En ese caso knowledge_gap = true y NO derives a soporte.

R3 — Escalamiento. Mantén la lógica actual (frustración, muchos turnos, soporte
previo). NUEVO: escala también tras 2 aclaraciones sin éxito. El caso R2 por sí
solo NO escala.

Ejemplos:
- Usuario: "IMPRESORA" (clarify_count=0) → pregunta de aclaración, asked_clarification=true, knowledge_gap=false.
- Usuario: "IMPRESORA" (clarify_count=2) → responde con lo disponible o escala; asked_clarification=false.
- Usuario: "¿Cómo configuro el datáfono X99?" y no hay lección → mensaje R2, knowledge_gap=true, sin soporte.
```

- [ ] **Step 4: Añadir la salida estructurada del LLM**

Configurar el nodo del LLM para producir salida estructurada con los booleanos explícitos, además del texto de respuesta. El objeto de salida debe incluir al menos:

```
response (string), asked_clarification (boolean), knowledge_gap (boolean)
```

(topic/sentiment ya existen en el flujo actual; no duplicarlos.) Usar el mecanismo de structured output ya presente en el workflow; si el LLM devuelve el JSON como texto, parsearlo en "Formatear respuesta".

- [ ] **Step 5: Propagar los campos en "Formatear respuesta"**

Editar el nodo "Formatear respuesta" para que el JSON final incluya, además de lo actual:

```
knowledge_gap:      <del LLM, default false>
asked_clarification: <del LLM, default false>
```

Mantener `topic` (lo reusa el frontend como `category`). No quitar campos existentes (`response`, `segments`, `media`, `support_redirected`, `topic`, `sentiment`, `lessons_used`).

- [ ] **Step 6: Confirmar con el usuario y hacer el PUT**

Mostrar al usuario el diff conceptual (prompt + salida estructurada + formato). **Esperar confirmación explícita.** Luego:

```bash
curl -s -X PUT -H "x-api-key: BoldBodi-2026-K9xMvP7q" \
  -H "Content-Type: application/json" \
  "https://n8n.mplasesores.com/api/v1/workflows/dZGuYJbRbG6h8aqv" \
  --data @<workflow-editado>.json
```

Expected: HTTP 200 y el workflow devuelto con los nodos editados.

- [ ] **Step 7: Probar los casos reales vía webhook**

Enviar POST al webhook (header `x-api-key: BoldBodi-2026-K9xMvP7q`) y verificar el JSON de respuesta:

1. `{ "message": "IMPRESORA", "clarify_count": 0, ... }` → repregunta, `asked_clarification: true`, `support_redirected: false`.
2. Segundo turno aún ambiguo `clarify_count: 1` → 2ª pregunta (`asked_clarification: true`).
3. Tercer turno `clarify_count: 2` → **no** repregunta; responde o escala (`asked_clarification: false`).
4. Pregunta clara sin contenido → copy R2 exacto, `knowledge_gap: true`, `support_redirected: false`.

Expected: los cuatro casos cumplen. Si alguno falla, **rollback** (Step 9) y ajustar el prompt.

- [ ] **Step 8: Verificar persistencia end-to-end en el navegador**

Abrir el bot en el navegador, reproducir el caso "IMPRESORA" y un caso sin-info, y confirmar en la fila de `bodi_conversations` (vía Supabase `execute_sql`, filtrando por la conversación más reciente) que `bot_asked_clarification` y `bot_no_info` quedaron en `true` según corresponda.

```sql
select id, topic, bot_no_info, bot_asked_clarification, updated_at
from bodi_conversations order by updated_at desc limit 3;
```

Expected: la fila del turno de aclaración tiene `bot_asked_clarification = true`; la del turno sin-info tiene `bot_no_info = true`.

- [ ] **Step 9: (Solo si algo falla) Rollback**

Restaurar el workflow desde el backup:

```bash
curl -s -X PUT -H "x-api-key: BoldBodi-2026-K9xMvP7q" \
  -H "Content-Type: application/json" \
  "https://n8n.mplasesores.com/api/v1/workflows/dZGuYJbRbG6h8aqv" \
  --data @docs/superpowers/backups/2026-07-23-bold-pos-chat.json
```

Expected: HTTP 200; el bot vuelve al comportamiento previo. Diagnosticar y reintentar desde Step 3.

- [ ] **Step 10: Correr la suite y commitear el estado final**

Run: `node --test tests/*.test.mjs`
Expected: PASS.

```bash
git add docs/superpowers/plans/2026-07-23-bot-reglas-interaccion.md
git commit -m "docs: plan de implementación — Sub-proyecto A (reglas de interacción del bot)"
```

---

## Notas de verificación final (Sprint 1)

Con A implementado, los KPIs quedan calculables sin ①c (el display es trabajo de C/D):
- **Preguntas completadas:** conversaciones con respuesta final (`bot_no_info = false`, no escaladas). `bot_asked_clarification` da el embudo de indagación.
- **Resolución (proxy):** `1 − (escaladas + bot_no_info) / total`.

**Fuera de alcance (otros sub-proyectos):** máquina de estados/timers (B); etiqueta visual y consolidación de alertas (C); barra de satisfacción e insights (D); evaluación rica con LLM (①c).
