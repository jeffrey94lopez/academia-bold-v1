# Cruce entre verticales en el bot — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el bot, cuando no encuentre la respuesta en la vertical del comercio pero sí en la otra, lo ofrezca en vez de decir "no tengo información", y que cada cruce quede registrado para analítica.

**Architecture:** Dos búsquedas vectoriales en cadena dentro del workflow de n8n (filtrada y sin filtrar). `Construir prompt` compara ambos conjuntos y decide el cruce de forma determinista; los ids nunca pasan por el LLM. El portal pinta la oferta, reenvía la aceptación, ofrece cambiar la vertical de la sesión y escribe una fila por cruce en una tabla nueva.

**Tech Stack:** JavaScript ES modules sin bundler, Supabase (Postgres + PostgREST + pgvector), n8n editado por su API REST, `node:test` para pruebas unitarias.

**Spec:** `docs/superpowers/specs/2026-10-02-cruce-vertical-bot-design.md`

## Global Constraints

- Umbral de cruce: **0.35**. El de la búsqueda normal sigue en **0.15**. No los unifiques.
- **Los ids de lección NUNCA pasan por el LLM**: `Formatear respuesta` los adjunta desde el item, no desde el texto del modelo.
- La vertical se lee del nodo **Webhook** (`$('Webhook').first().json.body.vertical`), nunca de `wb`: `wb` es la salida de "Normalizar intención" y no arrastra todos los campos del body.
- `Construir prompt` lee las lecciones **por nombre de nodo**. Un nodo nuevo no lo alimenta por estar conectado: hay que leerlo con `$('Buscar en otra vertical').all()`.
- **Una sola fila por cruce**: INSERT al ofrecer (`acepto` en `null`), UPDATE por `id` al responder.
- Las pruebas se corren con `node --test tests/*.test.mjs` (con el glob; sin él Node revienta con `MODULE_NOT_FOUND`). Línea base: **373 verdes**.
- Chequeo de sintaxis: `node --input-type=module --check < archivo.js`. **Nunca `node --check archivo.js`**: sobre un archivo con `import` sale 0 siempre, incluso roto.
- `css/tw.css` está precompilado: una clase de Tailwind ausente de ese archivo no aplica nada. Verificá cada clase nueva antes de usarla. Los botones de este plan reusan CSS propio que ya existe en `css/style.css`.
- Los mensajes de commit van en español, estilo del repo.
- Las migraciones **no las ejecuta el agente**: se escriben y las corre el usuario en el SQL Editor.
- `supabase-js` no lanza en error. Un INSERT bloqueado por RLS deja la analítica vacía en silencio: verificar por REST crudo.

---

## Desviación del spec, decidida al planificar

El spec pedía extraer "la lógica pura de decidir si hay cruce" a un módulo testeable con `node:test`. **No se hace, a propósito.**

La decisión corre dentro de un Code node de n8n, que no puede importar nuestros módulos. Un módulo JS con tests sería una **segunda copia** de la lógica: la probada no sería la que corre, que es peor que no tener test — da confianza falsa. La lógica queda en el nodo, corta y legible, y se verifica contra el webhook real (Task 5, Step 5), que sí ejercita el camino de producción.

Lo que sí va a `node:test` es lo que de verdad corre en el navegador: `chatRequestBody` y `shouldAskResolution` (Task 2).

---

## Estructura de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `supabase/migrations/add_cruce_vertical.sql` | Columna `account_id`, tabla `bot_cruces_vertical`, policies | Crear |
| `js/clarify.js` | Body del webhook y reglas de qué botones mostrar | Modificar |
| `js/cruce-vertical.js` | Escritura del registro de cruces a Supabase | Crear |
| `js/assistant.js` | Botones del cruce, reenvío, `account_id` en la conversación | Modificar |
| `js/lessons.js` | Exponer el cambio de vertical al asistente | Modificar |
| `tests/clarify.test.mjs` | Pruebas del body y de los botones | Modificar |
| Workflow `Bold POS Chat` (n8n) | Segunda búsqueda, decisión del cruce, bandera | Modificar vía API |

---

# Tanda 1 — Base de datos

## Task 1: Esquema del registro de cruces

**Files:** Create `supabase/migrations/add_cruce_vertical.sql`

**Interfaces:**
- Consumes: nada.
- Produces: `bodi_conversations.account_id`, tabla `public.bot_cruces_vertical`.

- [ ] **Step 1: Escribir la migración**

```sql
-- Cruce entre verticales: cuando el bot no encuentra la respuesta en la
-- vertical del comercio pero sí en la otra, lo ofrece y registra el hecho.
--
-- Se guarda `account_id` en las conversaciones porque sin él no se puede
-- responder "¿este comercio está mal clasificado?". Matiza la decisión previa
-- de no persistir identidad, que era sobre localStorage (se filtraba entre
-- comercios en un equipo compartido); esto es del lado servidor, el account_id
-- ya queda en los logs de n8n desde el 2026-09-30, y es el número de cuenta de
-- un comercio, no de una persona. El nombre y el correo del usuario siguen sin
-- salir del navegador.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

alter table public.bodi_conversations
  add column if not exists account_id text;

create table if not exists public.bot_cruces_vertical (
  id                 uuid primary key default gen_random_uuid(),
  conversation_id    uuid references public.bodi_conversations(id) on delete cascade,
  account_id         text,
  vertical_comercio  text not null,
  vertical_contenido text not null,
  leccion_id         uuid,
  leccion_titulo     text,
  -- null = se ofreció y no contestó; true/false = qué contestó.
  -- Distingue "le ofrecimos" de "le interesó", que son preguntas distintas.
  acepto             boolean,
  created_at         timestamptz not null default now()
);

create index if not exists idx_cruces_leccion on public.bot_cruces_vertical (leccion_id);
create index if not exists idx_cruces_cuenta  on public.bot_cruces_vertical (account_id);
create index if not exists idx_cruces_fecha   on public.bot_cruces_vertical (created_at desc);

alter table public.bot_cruces_vertical enable row level security;

-- El portal escribe como `anon`, igual que bodi_conversations. Sin estas dos
-- policies el INSERT se bloquea EN SILENCIO (supabase-js no lanza) y la tabla
-- queda vacía sin que nadie se entere.
drop policy if exists cruces_insert_anon on public.bot_cruces_vertical;
create policy cruces_insert_anon on public.bot_cruces_vertical
  for insert to anon with check (true);

drop policy if exists cruces_update_anon on public.bot_cruces_vertical;
create policy cruces_update_anon on public.bot_cruces_vertical
  for update to anon using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Control 1: la columna y la tabla existen. Debe devolver 2 filas.
select 'bodi_conversations.account_id' as objeto, count(*) as existe
from information_schema.columns
where table_schema='public' and table_name='bodi_conversations' and column_name='account_id'
union all
select 'tabla bot_cruces_vertical', count(*)
from information_schema.tables
where table_schema='public' and table_name='bot_cruces_vertical';

-- Control 2: las dos policies quedaron. Debe listar cruces_insert_anon y
-- cruces_update_anon. Si falta alguna, el portal escribirá en silencio y sin
-- efecto.
select policyname, cmd from pg_policies
where schemaname='public' and tablename='bot_cruces_vertical'
order by policyname;
```

- [ ] **Step 2: Pedirle al usuario que la ejecute y confirme los dos controles**

El agente NO ejecuta migraciones.

- [ ] **Step 3: Verificar por REST que PostgREST ya ve la tabla**

```bash
K=$(grep -oP "(?<=SUPABASE_ANON_KEY = ')[^']+" js/supabase.js)
curl -s "https://tczcngfhuendmldafbrc.supabase.co/rest/v1/bot_cruces_vertical?select=id&limit=1" \
  -H "apikey: $K" -H "Authorization: Bearer $K"
```

Expected: `[]` (tabla vacía pero visible). Si devuelve `{"code":"42P01"}` la tabla no existe; si devuelve un error de esquema, el caché de PostgREST no se refrescó.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/add_cruce_vertical.sql
git commit -m "feat(db): registro de cruces entre verticales y account_id en conversaciones"
```

---

# Tanda 2 — Lógica pura del portal

## Task 2: `clarify.js` — aceptación del cruce y qué botones mostrar

**Files:** Modify `js/clarify.js`, `tests/clarify.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: `chatRequestBody({..., cruceAceptado})` agrega `cross_vertical_accepted`; `shouldAskResolution(data)` devuelve `false` cuando `data.cross_vertical` existe.

**El conflicto que esto resuelve:** hoy `shouldAskResolution` devuelve `true` salvo en repregunta, soporte o `knowledge_gap`. El turno del cruce no es ninguno de los tres, así que se pintarían **los botones del cruce y los de "¿Logré resolver tu duda?" al mismo tiempo**. Dos preguntas simultáneas al usuario.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar al final de `tests/clarify.test.mjs`:

```js
test('chatRequestBody: cross_vertical_accepted solo cuando se pasa', () => {
  const base = { message: 'hola', history: [], faqContext: [], clarifyCount: 0,
                 seleccion: { vertical: 'retail', plataforma: 'web' } }
  assert.equal('cross_vertical_accepted' in chatRequestBody(base), false)

  const con = chatRequestBody({ ...base, cruceAceptado: 'abc-123' })
  assert.equal(con.cross_vertical_accepted, 'abc-123')
})

test('chatRequestBody: un cruceAceptado vacío no ensucia el body', () => {
  const base = { message: 'hola', history: [], faqContext: [], clarifyCount: 0,
                 seleccion: { vertical: 'retail', plataforma: 'web' } }
  assert.equal('cross_vertical_accepted' in chatRequestBody({ ...base, cruceAceptado: null }), false)
  assert.equal('cross_vertical_accepted' in chatRequestBody({ ...base, cruceAceptado: '' }), false)
})

test('shouldAskResolution: no pregunta en el turno del cruce', () => {
  assert.equal(shouldAskResolution({ cross_vertical: { leccion_id: 'x', titulo: 'T', vertical: 'restaurantes' } }), false)
})

test('shouldAskResolution: sigue preguntando en una respuesta normal', () => {
  assert.equal(shouldAskResolution({ response: 'ok' }), true)
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test tests/clarify.test.mjs`
Expected: FAIL — `cross_vertical_accepted` no existe y `shouldAskResolution` devuelve `true` en el turno del cruce.

- [ ] **Step 3: Implementar**

En `js/clarify.js`, reemplazar `shouldAskResolution` y `chatRequestBody`:

```js
// ¿Se debe mostrar el botón "¿Logré resolver tu duda? Sí/No" tras este turno?
// Solo cuando el bot dio una respuesta/resultado real: NO en las repreguntas
// (asked_clarification), NI cuando derivó a soporte (support_redirected), NI
// cuando no tuvo información (knowledge_gap) — esos dos traen su propio prompt
// con opción de soporte — NI cuando ofreció contenido de la otra vertical
// (cross_vertical), que ya trae su propia pregunta Sí/No: dos juegos de botones
// a la vez son dos preguntas simultáneas al usuario.
export function shouldAskResolution(data) {
  if (!data) return false
  return data.asked_clarification !== true &&
    data.support_redirected !== true &&
    data.knowledge_gap !== true &&
    !data.cross_vertical
}

// Body del POST al webhook n8n, con clarify_count y la selección esparcida.
// `contexto` (el del comercio que manda Bold POS, ver js/bold-context.js) es
// opcional: solo agrega claves cuando de verdad las tenemos.
// `cruceAceptado` es el id de la lección de la otra vertical que el usuario
// aceptó ver: hace que n8n responda desde ella saltándose el filtro, pero solo
// en ese turno.
export function chatRequestBody({ message, history, faqContext, clarifyCount, seleccion, contexto, cruceAceptado }) {
  const body = { message, history, faq_context: faqContext, clarify_count: clarifyCount, ...seleccion }
  if (contexto?.accountId)    body.account_id    = contexto.accountId
  if (contexto?.businessName) body.business_name = contexto.businessName
  if (cruceAceptado)          body.cross_vertical_accepted = cruceAceptado
  return body
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `node --test tests/clarify.test.mjs && node --test tests/*.test.mjs`
Expected: PASS. 373 + 4 nuevos = 377.

- [ ] **Step 5: Commit**

```bash
git add js/clarify.js tests/clarify.test.mjs
git commit -m "feat(bot): aceptacion del cruce en el body y sin botones duplicados"
```

---

# Tanda 3 — n8n

## Task 3: El workflow detecta y ofrece el cruce

**Files:** Modifica el workflow `Bold POS Chat` (`dZGuYJbRbG6h8aqv`) en `https://n8n.mplasesores.com`. No hay archivo en el repo.

**Interfaces:**
- Consumes: `cross_vertical_accepted` del body (Task 2).
- Produces: `cross_vertical: { leccion_id, titulo, vertical }` en la respuesta del webhook.

**Los tres cambios van en UN solo PUT.** Son un cambio coherente: a medias, el workflow queda inconsistente (un nodo nuevo que nadie lee, o una bandera que nadie produce).

- [ ] **Step 1: Respaldar el workflow**

```bash
N8N_KEY=$(grep -ohP '(?<=X-N8N-API-KEY: )[A-Za-z0-9._-]+' .claude/settings.local.json | head -1)
curl -s -H "X-N8N-API-KEY: $N8N_KEY" \
  "https://n8n.mplasesores.com/api/v1/workflows/dZGuYJbRbG6h8aqv" \
  > docs/superpowers/backups/2026-10-02-bold-pos-chat-ANTES-CRUCE.json
node -e "const w=require('./docs/superpowers/backups/2026-10-02-bold-pos-chat-ANTES-CRUCE.json'); console.log(w.name, w.nodes.length, w.active)"
```

Expected: `Bold POS Chat 16 true`. Si sale `undefined`, la llamada falló — para acá.

- [ ] **Step 2: Nodo nuevo "Buscar en otra vertical"**

Copia exacta de `Buscar lecciones` (mismo `type`, `typeVersion`, `url`, `headerParameters`, `sendBody`, `contentType`, `rawContentType`, `options`), con tres diferencias:

- `name`: `Buscar en otra vertical`
- `id`: un uuid nuevo
- `position`: desplazada para que no se solapen en el canvas
- `parameters.body`: **sin** `p_vertical` y con el umbral de cruce:

```
={{ JSON.stringify({ query_embedding: $('Embeber pregunta').first().json.predictions[0].embeddings.values, match_count: 3, match_threshold: 0.35 }) }}
```

**Conexiones:** la cadena pasa de `Buscar lecciones → Construir prompt` a
`Buscar lecciones → Buscar en otra vertical → Construir prompt`.

- [ ] **Step 3: `Construir prompt` lee los dos conjuntos y decide**

Insertar justo después del bloque `try { ... } catch (_) { lessons = []; }` que llena `lessons` (alrededor de la línea 48):

```js
var cruceCandidatas = [];
try {
  var _cr = $('Buscar en otra vertical').all();
  if (_cr.length === 1 && Array.isArray(_cr[0].json)) cruceCandidatas = _cr[0].json;
  else cruceCandidatas = _cr.map(function(i) { return i.json; });
} catch (_) { cruceCandidatas = []; }

var aceptado = null;
try { aceptado = $('Webhook').first().json.body.cross_vertical_accepted || null; } catch(_) {}

// Candidatas de OTRA vertical: la busqueda sin filtro tambien devuelve las
// propias, y ofrecer un cruce hacia la vertical en la que ya estas no
// significa nada.
var otras = cruceCandidatas.filter(function(l) {
  return l && l.vertical && l.vertical !== vertical && l.vertical !== 'ambas';
});

// Si el usuario acepto, se responde DESDE esa leccion aunque no sea de su
// vertical; es un permiso explicito y vale solo para este turno.
var leccionAceptada = null;
if (aceptado) {
  leccionAceptada = otras.filter(function(l) { return String(l.id) === String(aceptado); })[0] || null;
  if (leccionAceptada) { lessons = [leccionAceptada]; docContent = lessonToText(leccionAceptada); }
}

// Hay cruce que OFRECER solo si no encontramos nada propio y no venimos de una
// aceptacion. El umbral duro lo aplica el nodo (0.35); esto es el guardia.
var cruce = (!lessons.length && !leccionAceptada && otras.length) ? otras[0] : null;
```

**Importante sobre el orden:** `docContent` se calcula hoy *antes* de este bloque. Si `leccionAceptada` existe hay que recalcularlo, como hace la línea de arriba. Verificá que el `var docContent = ...` original siga apareciendo antes.

En el array `systemPrompt`, agregar como elemento **después** de `verticalInstruccion`:

```js
  cruce ? ('ATENCION: no hay contenido de la vertical del comercio para esta pregunta, pero SI existe una leccion de la vertical "' + cruce.vertical + '" titulada "' + cruce.titulo + '". NO respondas la pregunta. Dile al usuario que eso no esta en el contenido de su tipo de negocio, que si tenemos una leccion de la otra vertical sobre ese tema, nombrala, y preguntale si quiere verla. Breve, dos frases.') : '',
```

- [ ] **Step 4: `Formatear respuesta` adjunta la bandera**

Al final del Code node, reemplazar el `return` por:

```js
var crossVertical = null;
try {
  var _c = $('Construir prompt').first().json.cruce;
  if (_c && _c.id) crossVertical = { leccion_id: _c.id, titulo: _c.titulo, vertical: _c.vertical };
} catch (_) {}
var out = { response: reply, segments: segments, topic: topic, sentiment: sentiment, support_redirected: supportRedirected, asked_clarification: askedClarification, knowledge_gap: knowledgeGap, media: media, lessons_used: lessons_used };
if (crossVertical) { out.cross_vertical = crossVertical; out.knowledge_gap = false; }
return [{ json: out }];
```

Para que eso funcione, `Construir prompt` debe devolver `cruce` en su item. Su `return` final pasa a:

```js
return [{ json: { cruce: cruce, messages: [
  { role: 'system', content: systemPrompt },
  ...history,
  { role: 'user', content: message }
] } }];
```

**El `knowledge_gap: false`** es la pieza que impide que `Formatear respuesta` pise la respuesta del cruce con el copy de "todavía no tengo información" (ese bloque corre antes y reemplaza `reply` entero).

- [ ] **Step 5: Subir y probar contra el webhook**

Ojo al `PUT`: filtrar `settings` a `executionOrder`, `errorWorkflow`, `saveManualExecutions`, `saveDataSuccessExecution`, `saveDataErrorExecution`, `saveExecutionProgress`, `timezone`, `executionTimeout`, o rechaza con "settings must NOT have additional properties".

La ruta del webhook es `bold-pos-chat`. El token del header `x-api-key` está en el nodo "Validar input y token"; **lleva dos guiones** (`BoldBodi-2026-...`), así que una regex `[A-Za-z0-9]+` lo trunca y da `Unauthorized [line 4]` — eso NO es el bot roto, es la prueba mal armada. Usá `[A-Za-z0-9_-]+`.

```bash
curl -s -X POST "https://n8n.mplasesores.com/webhook/bold-pos-chat" \
  -H "Content-Type: application/json" -H "x-api-key: $TOKEN" --max-time 120 \
  -d '{"message":"como gestiono las mesas de mi negocio","history":[{"role":"user","content":"como gestiono las mesas de mi negocio"}],"faq_context":[],"clarify_count":0,"vertical":"retail","plataforma":"web"}'
```

Expected: la respuesta trae `cross_vertical` con la lección "Gestión de mesas" y vertical `restaurantes`, el texto ofrece verla sin responder la pregunta, y `knowledge_gap` es `false`.

Las otras tres pruebas, todas obligatorias antes de dar por bueno:

| Caso | Esperado |
|---|---|
| misma pregunta con `vertical: restaurantes` | Responde normal, **sin** `cross_vertical` |
| sin `vertical` en el body | Como hoy: responde normal, sin filtro ni cruce |
| con `cross_vertical_accepted: "<id de la lección>"` y `vertical: retail` | Responde **desde** esa lección |

Si algo falla: restaurar el respaldo del Step 1 con un `PUT`.

- [ ] **Step 6: Commit del respaldo**

```bash
git add docs/superpowers/backups/2026-10-02-bold-pos-chat-ANTES-CRUCE.json
git commit -m "chore(bot): respaldo del workflow antes del cruce entre verticales"
```

(Si `docs/superpowers/backups` está en `.gitignore`, el respaldo vive solo en disco: anotalo en el reporte y no fuerces el commit.)

---

# Tanda 4 — Portal

## Task 4: Registro del cruce

**Files:** Create `js/cruce-vertical.js`; Modify `js/assistant.js` (`createConversation`)

**Interfaces:**
- Consumes: la tabla de Task 1.
- Produces: `registrarCruce({...}) -> Promise<string|null>` (devuelve el `id` de la fila) y `marcarCruce(id, acepto) -> Promise<void>`.

- [ ] **Step 1: Crear `js/cruce-vertical.js`**

```js
// js/cruce-vertical.js — registro de los cruces entre verticales del bot.
//
// Una fila por cruce: se inserta cuando el bot lo OFRECE (con `acepto` en null)
// y se actualiza cuando el usuario responde. No son dos filas: "ofrecido" y
// "aceptado" son dos estados del mismo hecho, y contarlos aparte duplicaria el
// volumen en la analitica.
//
// Responde tres preguntas: si una leccion deberia estar marcada 'ambas'
// (agrupando por leccion_id), si un comercio esta mal clasificado (agrupando
// por account_id), y cuanto pasa esto.
import { supabase } from './supabase.js'

/** Inserta el cruce ofrecido. Devuelve el id de la fila, o null si fallo. */
export async function registrarCruce({ conversationId, accountId, verticalComercio, cross }) {
  if (!cross?.leccion_id) return null
  try {
    const { data, error } = await supabase
      .from('bot_cruces_vertical')
      .insert({
        conversation_id:    conversationId || null,
        account_id:         accountId || null,
        vertical_comercio:  verticalComercio,
        vertical_contenido: cross.vertical,
        leccion_id:         cross.leccion_id,
        leccion_titulo:     cross.titulo || null,
      })
      .select('id')
      .single()
    // supabase-js NO lanza en error: sin este chequeo un INSERT bloqueado por
    // RLS dejaria la analitica vacia sin que nadie se entere.
    if (error) { console.warn('[cruce-vertical] insert:', error.message); return null }
    return data?.id || null
  } catch (e) {
    console.warn('[cruce-vertical] insert:', e.message)
    return null
  }
}

/** Marca si el usuario acepto ver el contenido de la otra vertical. */
export async function marcarCruce(id, acepto) {
  if (!id) return
  try {
    const { error } = await supabase
      .from('bot_cruces_vertical').update({ acepto }).eq('id', id)
    if (error) console.warn('[cruce-vertical] update:', error.message)
  } catch (e) {
    console.warn('[cruce-vertical] update:', e.message)
  }
}
```

- [ ] **Step 2: Guardar `account_id` en la conversación**

En `js/assistant.js`, dentro de `createConversation()`, el bloque que ya agrega `vertical`/`plataforma` solo cuando hay contexto de Bold gana también el `account_id`. La condición no cambia — sigue siendo `getContextoBold()?.vertical` — porque sin contexto tampoco hay cuenta.

- [ ] **Step 3: Verificar sintaxis**

Run: `node --input-type=module --check < js/cruce-vertical.js && node --input-type=module --check < js/assistant.js`
Expected: exit 0 en los dos.

`js/cruce-vertical.js` importa `supabase.js` (URL de CDN), así que no se puede probar desde Node. Correcto, no es un descuido.

- [ ] **Step 4: Commit**

```bash
git add js/cruce-vertical.js js/assistant.js
git commit -m "feat(analytics): registrar los cruces entre verticales y la cuenta del comercio"
```

---

## Task 5: Los botones del cruce y el reenvío

**Files:** Modify `js/assistant.js`, `js/lessons.js`

**Interfaces:**
- Consumes: `registrarCruce`/`marcarCruce` (Task 4), `cross_vertical` del bot (Task 3), `chatRequestBody` con `cruceAceptado` (Task 2).
- Produces: `window.aplicarVerticalDesdeChat(vertical)` expuesto por `js/lessons.js`.

- [ ] **Step 1: Exponer el cambio de vertical**

`applySeleccion` es privada de `renderLessons()` en `js/lessons.js`. Se expone igual que `window.openLessonById` (misma función, alrededor de la línea 597), que ya resuelve este mismo problema de comunicación entre pestañas. Junto a esa línea:

```js
  // El asistente ofrece cambiar de vertical tras un cruce. Se expone por
  // `window` y no por import porque lessons.js no exporta nada: su estado vive
  // dentro de renderLessons().
  window.aplicarVerticalDesdeChat = (vertical) => applySeleccion({ vertical }, { origen: 'cruce-bot' })
```

- [ ] **Step 2: Pintar los botones del cruce**

En `js/assistant.js`, una función nueva al lado de `appendResolutionButtons()` (línea 586), reusando sus clases de `css/style.css` (`.resolution-btns`, `.resolution-label`, `.resolution-actions`, `.res-btn`) — **ya existen, no hay CSS nuevo que agregar**:

```js
// Botones del cruce entre verticales. Reusa el CSS de los de resolucion: es el
// mismo patron visual (una pregunta corta con dos salidas) y no justifica
// estilos propios.
function appendCrossButtons(cross, cruceId) {
  const box = document.getElementById('chatMessages')
  if (!box) return
  document.querySelectorAll('.cross-btns').forEach(el => el.remove())
  const btns = document.createElement('div')
  btns.className = 'resolution-btns cross-btns'
  const etiqueta = cross.vertical === 'restaurantes' ? 'Restaurantes' : 'Retail'
  btns.innerHTML = `
    <p class="resolution-label">¿Quieres ver la información de ${escapeHtml(etiqueta)}?</p>
    <div class="resolution-actions">
      <button class="res-btn res-yes">Sí, muéstramela</button>
      <button class="res-btn res-no">No, gracias</button>
    </div>`
  btns.querySelector('.res-yes').onclick = () => {
    btns.remove()
    marcarCruce(cruceId, true)
    pendingCross = cross
    sendMessage('Sí, muéstrame esa información')
  }
  btns.querySelector('.res-no').onclick = () => {
    btns.remove()
    marcarCruce(cruceId, false)
  }
  box.appendChild(btns)
  if (followScroll) scrollToBottom()
}
```

Agregar `let pendingCross = null` junto a las otras variables de estado del módulo.

- [ ] **Step 3: Cablear la respuesta del bot — son DOS puntos de edición distintos**

Los dos están dentro de `sendMessage` (que empieza en `js/assistant.js:695` y recibe el texto como parámetro, así que el botón puede llamarla directo).

**Punto A, ANTES del `fetch`** (junto a `const sel = getSeleccion()`, línea ~728): leer y limpiar el permiso.

```js
    const cruceAceptado = pendingCross?.leccion_id || null
    pendingCross = null
```

`cruceAceptado` entra en el objeto que se le pasa a `chatRequestBody`. Se limpia **acá y no después del `fetch`**: si la petición falla, el permiso no debe quedar pegado para el mensaje siguiente.

**Punto B, DESPUÉS de la respuesta** (justo antes de `if (data.support_redirected)`, línea ~767): registrar y ofrecer.

`sel` está declarada en la línea 728, dentro de la misma función, así que está en alcance acá.

```js
    if (data.cross_vertical) {
      const id = await registrarCruce({
        conversationId: conversationId,
        accountId: getContextoBold()?.accountId,
        verticalComercio: sel.vertical,
        cross: data.cross_vertical,
      })
      appendCrossButtons(data.cross_vertical, id)
    }
```

Sumar `cruceAceptado` al objeto que se le pasa a `chatRequestBody`, junto a `faqContext`, `clarifyCount`, `seleccion` y `contexto` que ya están ahí.

- [ ] **Step 4: El botón de cambiar la vertical de la sesión**

Tras renderizar la respuesta de un turno que venía de una aceptación (`cruceAceptado` no nulo), agregar un botón suelto:

```js
function appendSwitchVerticalButton(vertical) {
  const box = document.getElementById('chatMessages')
  if (!box) return
  const etiqueta = vertical === 'restaurantes' ? 'Restaurantes' : 'Retail'
  const wrap = document.createElement('div')
  wrap.className = 'resolution-btns'
  wrap.innerHTML = `
    <div class="resolution-actions">
      <button class="res-btn res-yes">Ver siempre contenido de ${escapeHtml(etiqueta)}</button>
    </div>`
  wrap.querySelector('.res-btn').onclick = () => {
    wrap.remove()
    window.aplicarVerticalDesdeChat?.(vertical)
    appendBubble('bot', `Listo, ahora te muestro contenido de ${etiqueta}.`)
  }
  box.appendChild(wrap)
  if (followScroll) scrollToBottom()
}
```

**Este botón no pasa por el bot**: cambia la selección en el navegador. Y el cambio dura solo la sesión por construcción — `onContextoBold` vuelve a aplicar la vertical de Bold en la próxima carga. Eso es deliberado: un comercio bien clasificado vuelve solo a lo suyo.

- [ ] **Step 5: Verificar**

Run: `node --input-type=module --check < js/assistant.js && node --input-type=module --check < js/lessons.js && node --test tests/*.test.mjs`
Expected: exit 0 y 377 verdes.

`js/assistant.js` y `js/lessons.js` dependen del DOM y de supabase: no llevan test unitario. La verificación es la Task 6.

- [ ] **Step 6: Commit**

```bash
git add js/assistant.js js/lessons.js
git commit -m "feat(bot): ofrecer el contenido de la otra vertical y poder cambiarse a ella"
```

---

# Tanda 5 — Verificación

## Task 6: End-to-end en navegador

**Files:** ninguno.

- [ ] **Step 1: Suite completa**

Run: `node --test tests/*.test.mjs`
Expected: 377 verdes. Si falla algo que no tocaste, parar.

- [ ] **Step 2: Levantar el portal**

`preview_start` con la configuración `academia-static` de `.claude/launch.json` (puerto 4173). La primera vez tarda: `npx serve` se descarga.

- [ ] **Step 3: Simular un comercio de retail y provocar el cruce**

En la consola del portal:

```js
window.dispatchEvent(new MessageEvent('message', {
  origin: 'https://pos.bold.co',
  data: { type: 'bold:context', accountId: '9999', businessType: 'retail',
          businessName: 'Prueba Retail', platform: 'web', user: { name: 'Ana' } }
}))
```

Luego, en el chat, preguntar **"como gestiono las mesas de mi negocio"**.

Expected: el bot NO dice "no tengo información". Dice que eso no está en Retail, nombra la lección de Restaurantes y pregunta si quiere verla, con dos botones. **No** aparecen los botones de "¿Logré resolver tu duda?".

- [ ] **Step 4: Aceptar y verificar los dos efectos**

Pulsar "Sí, muéstramela".

Expected: el bot responde desde la lección "Gestión de mesas", y debajo aparece el botón "Ver siempre contenido de Restaurantes". Al pulsarlo, la pestaña Lecciones pasa a Restaurantes.

- [ ] **Step 5: Verificar el registro por REST, no por la UI**

```bash
K=$(grep -oP "(?<=SUPABASE_ANON_KEY = ')[^']+" js/supabase.js)
curl -s "https://tczcngfhuendmldafbrc.supabase.co/rest/v1/bot_cruces_vertical?select=*&order=created_at.desc&limit=3" \
  -H "apikey: $K" -H "Authorization: Bearer $K"
```

Expected: una fila con `vertical_comercio: retail`, `vertical_contenido: restaurantes`, el título de la lección, `account_id: 9999` y `acepto: true`. **Una sola fila, no dos.**

Si viene `[]`, el INSERT se bloqueó por RLS en silencio: revisar las policies del Control 2 de la Task 1.

- [ ] **Step 6: Verificar que no se rompió el camino normal**

Repetir con `businessType: 'restaurant'` y la misma pregunta.
Expected: responde directo, sin botones de cruce, y **sí** aparecen los de "¿Logré resolver tu duda?".

- [ ] **Step 7: Reportar**

Qué se verificó y qué salió, con la salida real. Si un paso no se pudo correr, decirlo en vez de inventar la verificación.

---

## Notas para quien ejecute

- **Orden de despliegue:** la migración de la Task 1 va antes que el frontend. Sin la tabla, `registrarCruce` falla en silencio (devuelve null) y el cruce igual funciona — solo se pierde la analítica. Sin la columna `account_id`, el INSERT de la conversación falla entero.
- **El cambio de n8n es en producción y afecta al bot en vivo.** Respaldo antes, y las cuatro pruebas del Step 5 de la Task 3 antes de dar nada por bueno.
- **Rama:** el repo trabaja en `sandbox`. Confirmá con el usuario antes de tocar `master`.
- Si un paso no se puede verificar como dice el plan, decilo en vez de inventar la verificación.
