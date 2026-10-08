# Bandeja de vacíos del bot — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada pregunta que el bot no supo responder quede registrada como un "vacío" agrupado por similitud, y que exista una bandeja en el admin donde ese vacío se resuelva escribiendo un bloque `bot_faq` en una lección.

**Architecture:** n8n captura la pregunta en el turno que falla, la embebe y llama a una RPC transaccional que la cuelga del vacío más cercano o abre uno nuevo. El admin lee la bandeja por RPCs `security definer` y la resuelve escribiendo un bloque `bot_faq` en la lección elegida, con re-embebido. Toda la lógica pura vive en módulos import-safe testeables con `node --test`; las tablas nuevas no tocan `bodi_conversations` ni `lecciones`.

**Tech Stack:** Supabase (Postgres + pgvector + PostgREST), n8n (workflow "Bold POS Chat" en n8n.mplasesores.com), JS ES modules sin framework, Tailwind precompilado, `node --test` para los módulos puros.

**Spec:** `docs/superpowers/specs/2026-09-19-bandeja-vacios-bot-design.md`

## Global Constraints

- Rama `sandbox`. Deploy a `master` al final, con visto bueno explícito del usuario.
- Tras cada tanda de código: `node --check <archivos>` + `node --test tests/*.test.mjs`. **Baseline al 2026-09-19: 311 tests, 311 pasan.** Ninguna tanda puede bajar ese número.
- Lógica pura → módulo import-safe (sin DOM, sin `supabase`) + test. Es el patrón del repo.
- Las RPCs llevan `revoke execute ... from public, anon` y `grant execute ... to authenticated` (las del admin) o `to service_role` (las que llama n8n). **Cero policies nuevas para `anon`.**
- Los módulos que hablan con Supabase resuelven el cliente con **import dinámico perezoso**, nunca `import` estático: `js/supabase.js` importa desde una URL CDN y un import estático rompe el runner de Node con `ERR_UNSUPPORTED_ESM_URL_SCHEME`. Ver la cabecera de `js/analytics-api.js`.
- **Prohibido `?? 0` al pintar cualquier número de la bandeja.** `supabase-js` no lanza en error: devuelve `{ error }`, y un `?? 0` convierte un fallo de consulta en un "0 vacíos pendientes" que parece buena noticia. Verificar `error` explícitamente y pintar estado de error.
- Tailwind está **precompilado** en `css/tw.css`: una clase que no existía cuando se generó el archivo no aplica nada. Reusar clases ya presentes en `admin.html` / `js/admin.js`; no inventar utilidades nuevas.
- Toda escritura desde el admin se registra con `logActivity(action, entityType, entityName, details)` de `js/activity.js`.
- El SQL Editor de Supabase muestra solo el resultado de la **última** sentencia: las consultas de diagnóstico van de a una.

**Valores fijados por la spec:**
- Embeddings: `vector(768)` (Gemini/Vertex, el mismo de `lecciones.embedding`).
- Similitud: `1 - (a <=> b)`, comparada con `>`, igual que `match_lessons`.
- Estados: `pendiente` | `resuelto` | `descartado`.
- Motivos de descarte: `no_aplica` | `es_soporte` | `duplicado` | `ruido`.
- Umbral de urgencia del aviso: `app_settings.gap_umbral_urgencia`, arranca en `5`.
- Umbral de coseno: `app_settings.gap_umbral_coseno`, **lo fija la Tanda 3**.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/create_bot_vacios.sql` | Tablas `bot_vacios` y `bot_vacios_preguntas` + índices |
| `supabase/migrations/create_registrar_pregunta_sin_respuesta.sql` | RPC de escritura que llama n8n |
| `supabase/migrations/create_analytics_bot_vacios.sql` | RPCs de lectura: bandeja, detalle, detector de silencio |
| `supabase/migrations/create_acciones_vacios.sql` | RPCs `resolver_vacio`, `descartar_vacio`, `dividir_vacio` |
| `js/gap-faq-block.js` | **Puro.** Construir el bloque `bot_faq` y el `contenido` nuevo sin vaciar la lección |
| `js/gap-lifecycle.js` | **Puro.** Estado mostrado de un vacío y veredicto del detector de silencio |
| `js/gap-split.js` | **Puro.** Validar una división y calcular los contadores resultantes |
| `js/gaps-api.js` | Capa de acceso a las RPCs de vacíos (patrón de `js/analytics-api.js`) |
| `js/admin-gaps.js` | Panel de la bandeja: lista, detalle, resolver, descartar, dividir |
| `scripts/calibrar-umbral-vacios.mjs` | Desechable: agrupa las preguntas históricas con varios umbrales |
| `admin.html` | Botón del sidebar + contenedor `panel-gaps` |
| `js/admin.js` | Importar y enganchar `renderGapsPanel` en `switchPanel`; badge del sidebar |

`js/admin.js` ya pasa de 3.000 líneas. La bandeja va en `js/admin-gaps.js` siguiendo el precedente de `admin-analytics.js` y `admin-bot-analytics.js`; en `admin.js` solo quedan el import, la línea de `switchPanel` y el badge.

---

## Orden de las tandas y por qué

1–2 preparan la infraestructura que **la calibración necesita**: sin un webhook que devuelva el vector, la Tanda 3 no puede correr. La 3 fija el umbral que la 5 codifica. La 6 enciende el registro en vivo **antes** de la UI a propósito: así las tandas 8–10 se construyen contra vacíos reales y no contra datos inventados.

---

### Task 1: Webhook de n8n que embebe un texto y devuelve el vector

El webhook actual (`EMBED_WEBHOOK`) recibe `{lessonId, text}` y **escribe** el embedding en `lecciones`; no devuelve el vector. La calibración y el registro de preguntas necesitan el vector de vuelta.

**REQUIRED SUB-SKILL:** invocar `n8n-mcp-skills:using-n8n-mcp-skills` antes de tocar n8n. No editar el workflow a ciegas.

**Files:**
- Modify: workflow n8n (instancia `n8n.mplasesores.com`) — workflow nuevo o rama nueva del existente
- Create: `docs/n8n/embed-text-webhook.md` (qué se creó, ruta, contrato)

**Interfaces:**
- Produces: `POST <N8N_EMBED_TEXT_URL>` con header `x-api-key`, body `{ "text": "..." }` → `200 { "embedding": [768 floats] }`. Ante texto vacío → `400 { "error": "text requerido" }`.

- [ ] **Step 1: Respaldar el workflow actual antes de tocarlo**

Exportar el JSON del workflow "Bold POS Chat" y guardarlo en `n8n/` con fecha, igual que los respaldos que ya existen ahí. Un workflow roto sin respaldo deja al bot sin responder en producción.

- [ ] **Step 2: Crear el webhook que devuelve el vector**

Reusar el mismo nodo de embeddings de Vertex que ya usa el flujo de lecciones, con el **mismo modelo y las mismas 768 dimensiones**. Si el modelo difiere, los vectores no son comparables con los de `lecciones` y todo el agrupamiento queda sin sentido.

Contrato de salida exacto: `{ "embedding": [ ... ] }`, array plano de 768 números.

- [ ] **Step 3: Probar el webhook con curl**

```bash
curl -s -X POST "$N8N_EMBED_TEXT_URL" -H "x-api-key: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text":"como cierro la caja del dia"}' | head -c 200
```

Esperado: un JSON que empieza por `{"embedding":[`. Verificar además la longitud:

```bash
curl -s -X POST "$N8N_EMBED_TEXT_URL" -H "x-api-key: $N8N_API_KEY" \
  -H "Content-Type: application/json" -d '{"text":"prueba"}' \
  | python -c "import json,sys; print(len(json.load(sys.stdin)['embedding']))"
```

Esperado: `768`. Si sale otro número, **parar**: el modelo no es el mismo que el de `lecciones` y hay que corregirlo antes de seguir.

- [ ] **Step 4: Documentar y commitear**

```bash
git add n8n/ docs/n8n/embed-text-webhook.md
git commit -m "feat(n8n): webhook que embebe un texto y devuelve el vector"
```

---

### Task 2: Tablas e índices

**Files:**
- Create: `supabase/migrations/create_bot_vacios.sql`

**Interfaces:**
- Produces: tablas `public.bot_vacios` y `public.bot_vacios_preguntas` con las columnas que usan todas las tandas siguientes.

- [ ] **Step 1: Escribir la migración**

```sql
-- Bandeja de vacíos del bot: un "vacío" es un grupo de preguntas reales que el
-- bot no supo responder, agrupadas por similitud de embedding.
--
-- Ver docs/superpowers/specs/2026-09-19-bandeja-vacios-bot-design.md
--
-- No se toca bodi_conversations ni lecciones: la bandeja se para sobre tablas
-- nuevas para que no pueda romper nada que ya esté en producción.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

create table if not exists public.bot_vacios (
  id                uuid primary key default gen_random_uuid(),
  titulo            text not null,
  -- El ANCLA. No se recalcula nunca: ver decisión 3 de la spec. Un centroide
  -- móvil hace que el vacío cambie de significado mientras alguien lo atiende.
  embedding         vector(768),
  categoria         text,
  vertical          text,
  plataforma        text,
  estado            text not null default 'pendiente'
                      check (estado in ('pendiente','resuelto','descartado')),
  motivo_descarte   text
                      check (motivo_descarte is null or motivo_descarte in
                        ('no_aplica','es_soporte','duplicado','ruido')),
  nota_descarte     text,
  leccion_id        uuid references public.lecciones(id) on delete set null,
  preguntas_total   int not null default 0,
  primera_vez       timestamptz,
  ultima_vez        timestamptz,
  resuelto_at       timestamptz,
  resuelto_por      text,
  created_at        timestamptz not null default now()
);

create table if not exists public.bot_vacios_preguntas (
  id               uuid primary key default gen_random_uuid(),
  -- NULL = sin clasificar (llegó sin embedding porque Vertex topó cuota).
  -- Perder la pregunta sería perder un dato irrecuperable; no agruparla es
  -- reversible.
  vacio_id         uuid references public.bot_vacios(id) on delete cascade,
  texto            text not null,
  embedding        vector(768),
  conversation_id  uuid references public.bodi_conversations(id) on delete set null,
  categoria        text,
  vertical         text,
  plataforma       text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_bot_vacios_embedding
  on public.bot_vacios using hnsw (embedding vector_cosine_ops);
create index if not exists idx_bot_vacios_bandeja
  on public.bot_vacios (estado, ultima_vez desc);
create index if not exists idx_bot_vacios_preguntas_vacio
  on public.bot_vacios_preguntas (vacio_id, created_at desc);
-- Para el cubo de "sin clasificar" y para el detector de silencio.
create index if not exists idx_bot_vacios_preguntas_creadas
  on public.bot_vacios_preguntas (created_at desc);

alter table public.bot_vacios            enable row level security;
alter table public.bot_vacios_preguntas  enable row level security;
-- Sin policies a propósito: con RLS activa y cero policies, nadie llega por
-- PostgREST. Todo el acceso pasa por las RPCs security definer.
```

- [ ] **Step 2: PASO MANUAL — correr la migración**

El usuario la pega en el SQL Editor de Supabase y la ejecuta. Si `gen_random_uuid()` no existe, falta `pgcrypto`; si `vector` no existe, falta la extensión `vector` — ambas ya están en uso en este proyecto, así que no debería pasar.

- [ ] **Step 3: Verificar que anon NO llega**

```bash
curl -s -D - -o /dev/null \
  "https://tczcngfhuendmldafbrc.supabase.co/rest/v1/bot_vacios?select=id&limit=1" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Prefer: count=exact" | grep -i "content-range\|^HTTP"
```

Esperado: `Content-Range: */0` (RLS activa sin policies devuelve vacío, no error). Si devuelve filas, **parar**: hay una policy heredada y el aislamiento no existe.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/create_bot_vacios.sql
git commit -m "feat(vacios): tablas e indices de la bandeja de vacios del bot"
```

---

### Task 3: Calibrar el umbral de coseno

Fija el número que la Tanda 5 codifica. **Ninguna tanda posterior puede empezar sin este valor.**

Se calibra sobre las ~250 preguntas históricas con `knowledge_gap`. Caveat honesto que hay que tener presente al mirar los grupos: esos textos son `first_user_msg` / `summary`, **no** la pregunta exacta del turno que falló (esa no existe todavía; empieza a existir en la Tanda 6). Sirven para elegir un umbral porque son textos con la misma forma, pero un grupo raro puede deberse al texto y no al umbral.

**Files:**
- Create: `scripts/calibrar-umbral-vacios.mjs`

**Interfaces:**
- Consumes: el webhook de la Task 1.
- Produces: el valor de `gap_umbral_coseno`, anotado en el commit y guardado en `app_settings` en la Tanda 5.

- [ ] **Step 1: PASO MANUAL — exportar las preguntas históricas**

En el SQL Editor, correr y exportar el resultado a `scratch/preguntas-historicas.json` (fuera del repo o en un path ignorado):

```sql
select coalesce(
         summary,
         (select m->>'content' from jsonb_array_elements(messages) m
           where m->>'role' = 'user' limit 1)
       ) as texto,
       coalesce(category, topic) as categoria,
       vertical
from bodi_conversations
where knowledge_gap is true
  and coalesce(summary, messages::text) is not null
order by started_at desc;
```

Se exporta a mano en vez de leerlo desde el script porque `anon` ya no lee `bodi_conversations` (verificado el 2026-09-19) y meterle una service key a un script desechable es peor idea que copiar un JSON.

- [ ] **Step 2: Escribir el script**

```js
// Desechable: agrupa las preguntas históricas con varios umbrales de coseno
// para poder elegir mirando. No es parte del producto — se borra o se deja
// como referencia, pero nada lo importa.
//
// Uso:
//   N8N_EMBED_TEXT_URL=... N8N_API_KEY=... \
//     node scripts/calibrar-umbral-vacios.mjs scratch/preguntas-historicas.json
import { readFileSync } from 'node:fs'

const URL_EMBED = process.env.N8N_EMBED_TEXT_URL
const KEY = process.env.N8N_API_KEY
if (!URL_EMBED || !KEY) { console.error('Faltan N8N_EMBED_TEXT_URL / N8N_API_KEY'); process.exit(1) }

const filas = JSON.parse(readFileSync(process.argv[2], 'utf8'))
  .map(f => ({ ...f, texto: String(f.texto || '').trim().replace(/\s+/g, ' ') }))
  .filter(f => f.texto.length >= 5)

async function embed(text) {
  const res = await fetch(URL_EMBED, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': KEY },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) throw new Error(`embed ${res.status}`)
  const { embedding } = await res.json()
  if (!Array.isArray(embedding) || embedding.length !== 768) {
    throw new Error(`embedding inesperado: ${embedding?.length}`)
  }
  return embedding
}

const coseno = (a, b) => {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// Mismo algoritmo que la RPC: ancla fija, se compara contra el ancla del vacío
// más cercano, y se filtra por vertical. Si acá se agrupa distinto que en la
// base, el umbral calibrado no significa nada.
function agrupar(items, umbral) {
  const vacios = []
  for (const it of items) {
    let mejor = null, mejorSim = -1
    for (const v of vacios) {
      if ((v.vertical || null) !== (it.vertical || null)) continue
      const s = coseno(v.ancla, it.emb)
      if (s > mejorSim) { mejorSim = s; mejor = v }
    }
    if (mejor && mejorSim > umbral) mejor.textos.push(it.texto)
    else vacios.push({ ancla: it.emb, vertical: it.vertical || null, textos: [it.texto] })
  }
  return vacios
}

console.error(`Embebiendo ${filas.length} preguntas…`)
const items = []
for (const [i, f] of filas.entries()) {
  try {
    items.push({ ...f, emb: await embed(f.texto) })
  } catch (e) {
    console.error(`  ✗ ${i}: ${e.message}`)
  }
  if (i % 25 === 0) console.error(`  ${i}/${filas.length}`)
  await new Promise(r => setTimeout(r, 150))  // ritmo, la cuota de Vertex es baja
}

for (const umbral of [0.70, 0.75, 0.80, 0.85, 0.90]) {
  const vacios = agrupar(items, umbral).sort((a, b) => b.textos.length - a.textos.length)
  const conVarias = vacios.filter(v => v.textos.length > 1).length
  console.log(`\n${'='.repeat(70)}\nUMBRAL ${umbral} → ${vacios.length} vacíos, ${conVarias} con más de una pregunta`)
  for (const v of vacios.slice(0, 8)) {
    console.log(`\n  [${v.textos.length}] ${v.textos[0].slice(0, 90)}`)
    for (const t of v.textos.slice(1, 5)) console.log(`      · ${t.slice(0, 90)}`)
  }
}
```

- [ ] **Step 3: Correrlo y elegir el umbral mirando los grupos**

```bash
node scripts/calibrar-umbral-vacios.mjs scratch/preguntas-historicas.json
```

Criterio de lectura, no de métrica:
- Si casi todos los vacíos tienen **una** pregunta, el umbral está **muy alto** — la bandeja sería el explorador que ya existe, con otro nombre.
- Si en un mismo grupo aparecen preguntas de temas distintos ("cómo cobro con tarjeta" junto a "cómo anulo una venta"), está **muy bajo** — peor que inútil.
- El bueno es el mayor umbral que todavía junta las variantes obvias de una misma pregunta.

- [ ] **Step 4: PASO MANUAL — el usuario revisa los grupos y aprueba el umbral**

Es una decisión de criterio sobre contenido real, no una que el implementador pueda tomar solo. Anotar el valor elegido; la Tanda 5 lo codifica.

- [ ] **Step 5: Commit**

```bash
git add scripts/calibrar-umbral-vacios.mjs
git commit -m "chore(vacios): script desechable para calibrar el umbral de coseno"
```

---

### Task 4: `js/gap-faq-block.js` — el bloque `bot_faq` sin vaciar la lección

Es el módulo que protege contra la clase de bug que ya vació lecciones antes (ver `docs/superpowers/specs/2026-07-27-integridad-contenido-lecciones-design.md`). Es puro, así que se prueba a fondo.

**Files:**
- Create: `js/gap-faq-block.js`
- Test: `tests/gap-faq-block.test.mjs`

**Interfaces:**
- Consumes: `parseLessonBlocks(raw)` de `js/lesson-blocks.js`.
- Produces:
  - `buildFaqBlock({ pregunta, variaciones, respuesta, mostrarAcordeon }) → object | null`
  - `contenidoConFaq(rawContenido, faqBlock) → string` (JSON listo para escribir en `lecciones.contenido`); **lanza** si el contenido no se pudo parsear.

- [ ] **Step 1: Escribir los tests que fallan**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFaqBlock, contenidoConFaq } from '../js/gap-faq-block.js'

test('buildFaqBlock: arma el bloque con la forma de bot_faq v2', () => {
  const b = buildFaqBlock({
    pregunta: '  ¿Cómo cierro caja?  ',
    variaciones: ['como cierro la caja', '  ', 'cierre de caja'],
    respuesta: 'Ve al módulo Caja y presiona Cerrar.',
  })
  assert.deepEqual(b, {
    type: 'bot_faq',
    pregunta: '¿Cómo cierro caja?',
    variaciones: 'como cierro la caja\ncierre de caja',
    respuesta: 'Ve al módulo Caja y presiona Cerrar.',
    mostrar_acordeon: false,
  })
})

test('buildFaqBlock: acepta variaciones como texto con saltos de línea', () => {
  const b = buildFaqBlock({ pregunta: 'P', variaciones: 'una\n\ndos\n', respuesta: 'R' })
  assert.equal(b.variaciones, 'una\ndos')
})

test('buildFaqBlock: sin pregunta o sin respuesta devuelve null', () => {
  assert.equal(buildFaqBlock({ pregunta: '', respuesta: 'R' }), null)
  assert.equal(buildFaqBlock({ pregunta: 'P', respuesta: '   ' }), null)
  assert.equal(buildFaqBlock({}), null)
})

test('contenidoConFaq: agrega el bloque al final de un contenido JSON', () => {
  const raw = JSON.stringify([{ type: 'step', text: '<p>uno</p>' }])
  const faq = buildFaqBlock({ pregunta: 'P', respuesta: 'R' })
  const out = JSON.parse(contenidoConFaq(raw, faq))
  assert.equal(out.length, 2)
  assert.equal(out[0].type, 'step')
  assert.equal(out[1].type, 'bot_faq')
})

test('contenidoConFaq: el HTML legacy se preserva como bloque html', () => {
  const raw = '<p>lección vieja escrita a mano</p>'
  const out = JSON.parse(contenidoConFaq(raw, buildFaqBlock({ pregunta: 'P', respuesta: 'R' })))
  assert.equal(out.length, 2)
  assert.equal(out[0].type, 'html')
  assert.equal(out[0].html, raw)
  assert.equal(out[1].type, 'bot_faq')
})

test('contenidoConFaq: un contenido vacío da una lección de un solo bloque', () => {
  for (const raw of ['', '   ', null, undefined]) {
    const out = JSON.parse(contenidoConFaq(raw, buildFaqBlock({ pregunta: 'P', respuesta: 'R' })))
    assert.equal(out.length, 1)
    assert.equal(out[0].type, 'bot_faq')
  }
})

test('contenidoConFaq: nunca pierde bloques que ya existían', () => {
  const previos = [
    { type: 'step', text: '<p>a</p>' },
    { type: 'image', url: 'u', label: 'l' },
    { type: 'bot_nota', content: 'ojo' },
  ]
  const out = JSON.parse(contenidoConFaq(JSON.stringify(previos), buildFaqBlock({ pregunta: 'P', respuesta: 'R' })))
  assert.equal(out.length, 4)
  assert.deepEqual(out.slice(0, 3), previos)
})

test('contenidoConFaq: convive con un bot_faq que ya existía', () => {
  const previos = [{ type: 'bot_faq', pregunta: 'otra', variaciones: '', respuesta: 'x', mostrar_acordeon: false }]
  const out = JSON.parse(contenidoConFaq(JSON.stringify(previos), buildFaqBlock({ pregunta: 'P', respuesta: 'R' })))
  assert.equal(out.length, 2)
  assert.equal(out[0].pregunta, 'otra')
  assert.equal(out[1].pregunta, 'P')
})

test('contenidoConFaq: sin bloque válido lanza en vez de escribir basura', () => {
  assert.throws(() => contenidoConFaq('[]', null), /bloque/)
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
node --test tests/gap-faq-block.test.mjs
```

Esperado: FAIL — `Cannot find module '../js/gap-faq-block.js'`.

- [ ] **Step 3: Escribir el módulo**

```js
// Construye el bloque bot_faq con el que se resuelve un vacío, y el `contenido`
// nuevo de la lección destino.
//
// Import-safe (sin DOM, sin supabase): la lectura y la escritura de
// `lecciones.contenido` viven en el llamador, que DEBE releer la lección justo
// antes de escribir.
//
// Por qué existe este módulo: escribir `contenido` desde un segundo lugar es la
// clase de bug que ya vació lecciones (ver el spec de integridad de contenido
// del 2026-07-27). La propiedad que sostiene todo es que contenidoConFaq nunca
// devuelve menos bloques de los que había: si el crudo traía algo y el parseo
// da vacío, lanza en vez de escribir.
import { parseLessonBlocks } from './lesson-blocks.js'

export function buildFaqBlock({ pregunta, variaciones, respuesta, mostrarAcordeon = false } = {}) {
  const p = String(pregunta ?? '').trim()
  const r = String(respuesta ?? '').trim()
  if (!p || !r) return null

  const lista = Array.isArray(variaciones)
    ? variaciones
    : String(variaciones ?? '').split('\n')

  return {
    type: 'bot_faq',
    pregunta: p,
    variaciones: lista.map(v => String(v ?? '').trim()).filter(Boolean).join('\n'),
    respuesta: r,
    mostrar_acordeon: !!mostrarAcordeon,
  }
}

export function contenidoConFaq(rawContenido, faqBlock) {
  if (!faqBlock || faqBlock.type !== 'bot_faq') {
    throw new Error('contenidoConFaq: se esperaba un bloque bot_faq válido')
  }
  const blocks = parseLessonBlocks(rawContenido)

  // parseLessonBlocks solo devuelve [] para entradas vacías. Si el crudo traía
  // algo y acá hay [], el parseo falló de una forma que no previmos y estamos a
  // un JSON.stringify de borrar la lección. Lanzar es la única salida segura.
  const traiaAlgo = typeof rawContenido === 'string' && rawContenido.trim().length > 0
  if (traiaAlgo && blocks.length === 0) {
    throw new Error('contenidoConFaq: el contenido no se pudo parsear; abortado para no vaciar la lección')
  }

  return JSON.stringify([...blocks, faqBlock])
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
node --check js/gap-faq-block.js && node --test tests/gap-faq-block.test.mjs
```

Esperado: PASS, 9 tests.

- [ ] **Step 5: Correr la suite completa**

```bash
node --test tests/*.test.mjs 2>&1 | tail -8
```

Esperado: `pass 320`, `fail 0` (311 + 9).

- [ ] **Step 6: Commit**

```bash
git add js/gap-faq-block.js tests/gap-faq-block.test.mjs
git commit -m "feat(vacios): modulo puro que agrega un bot_faq sin vaciar la leccion"
```

---

### Task 5: `js/gap-lifecycle.js` — estado mostrado y detector de silencio

**Files:**
- Create: `js/gap-lifecycle.js`
- Test: `tests/gap-lifecycle.test.mjs`

**Interfaces:**
- Produces:
  - `estadoMostrado(vacio, { umbralReincidencia = 3 }) → 'pendiente' | 'resuelto' | 'resuelto_reincidente' | 'descartado' | 'descartado_reincidente'`
  - `registroEnSilencio({ ultimoGapConversacion, ultimaPreguntaRegistrada, horasTolerancia = 6 }) → { enSilencio, horasSinRegistrar }`
  - El vacío que consumen trae `preguntas_desde_cierre`, que calcula la RPC de lectura de la Task 7.

- [ ] **Step 1: Escribir los tests que fallan**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoMostrado, registroEnSilencio } from '../js/gap-lifecycle.js'

test('estadoMostrado: un vacío abierto es pendiente', () => {
  assert.equal(estadoMostrado({ estado: 'pendiente', preguntas_desde_cierre: 0 }), 'pendiente')
  // Un pendiente nunca es "reincidente": todas sus preguntas son las suyas.
  assert.equal(estadoMostrado({ estado: 'pendiente', preguntas_desde_cierre: 9 }), 'pendiente')
})

test('estadoMostrado: resuelto con UNA pregunta nueva ya es reincidente', () => {
  assert.equal(estadoMostrado({ estado: 'resuelto', preguntas_desde_cierre: 0 }), 'resuelto')
  assert.equal(estadoMostrado({ estado: 'resuelto', preguntas_desde_cierre: 1 }), 'resuelto_reincidente')
})

test('estadoMostrado: descartado necesita cruzar el umbral para volver', () => {
  assert.equal(estadoMostrado({ estado: 'descartado', preguntas_desde_cierre: 2 }), 'descartado')
  assert.equal(estadoMostrado({ estado: 'descartado', preguntas_desde_cierre: 3 }), 'descartado_reincidente')
  assert.equal(
    estadoMostrado({ estado: 'descartado', preguntas_desde_cierre: 5 }, { umbralReincidencia: 10 }),
    'descartado')
})

test('estadoMostrado: tolera contadores ausentes o nulos', () => {
  assert.equal(estadoMostrado({ estado: 'resuelto' }), 'resuelto')
  assert.equal(estadoMostrado({ estado: 'resuelto', preguntas_desde_cierre: null }), 'resuelto')
})

test('registroEnSilencio: el bot reporta vacíos pero no se registra ninguno', () => {
  const r = registroEnSilencio({
    ultimoGapConversacion: '2026-09-19T15:00:00Z',
    ultimaPreguntaRegistrada: '2026-09-17T15:00:00Z',
  })
  assert.equal(r.enSilencio, true)
  assert.equal(r.horasSinRegistrar, 48)
})

test('registroEnSilencio: dentro de la tolerancia no alarma', () => {
  const r = registroEnSilencio({
    ultimoGapConversacion: '2026-09-19T15:00:00Z',
    ultimaPreguntaRegistrada: '2026-09-19T12:00:00Z',
  })
  assert.equal(r.enSilencio, false)
  assert.equal(r.horasSinRegistrar, 3)
})

test('registroEnSilencio: nunca se registró nada pero sí hay gaps → silencio', () => {
  const r = registroEnSilencio({
    ultimoGapConversacion: '2026-09-19T15:00:00Z',
    ultimaPreguntaRegistrada: null,
  })
  assert.equal(r.enSilencio, true)
  assert.equal(r.horasSinRegistrar, null)
})

test('registroEnSilencio: sin gaps no hay nada que alarmar', () => {
  // Un día tranquilo se ve igual que un módulo muerto SOLO si se mira el
  // registro; por eso la referencia es el gap más reciente, no el reloj.
  const r = registroEnSilencio({ ultimoGapConversacion: null, ultimaPreguntaRegistrada: null })
  assert.equal(r.enSilencio, false)
})

test('registroEnSilencio: el registro más nuevo que el gap no es silencio', () => {
  const r = registroEnSilencio({
    ultimoGapConversacion: '2026-09-19T10:00:00Z',
    ultimaPreguntaRegistrada: '2026-09-19T15:00:00Z',
  })
  assert.equal(r.enSilencio, false)
  assert.equal(r.horasSinRegistrar, 0)
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
node --test tests/gap-lifecycle.test.mjs
```

Esperado: FAIL — módulo inexistente.

- [ ] **Step 3: Escribir el módulo**

```js
// Estado mostrado de un vacío y veredicto del detector de silencio del
// registro. Import-safe: sin DOM y sin supabase.
//
// El estado GUARDADO son tres valores (pendiente/resuelto/descartado). El
// estado MOSTRADO agrega la reincidencia, que no es una columna sino una
// lectura de los contadores: un vacío cerrado que sigue recibiendo preguntas.
//
// Por qué importa la distinción: un resuelto reincidente NO dice "falta
// contenido" — dice que el contenido existe y el bot no lo está recuperando
// (umbral de match_lessons, embedding sin regenerar, lección apagada). Es un
// problema distinto y más barato de arreglar.

export function estadoMostrado(vacio, { umbralReincidencia = 3 } = {}) {
  const estado = vacio?.estado
  const desde = Number(vacio?.preguntas_desde_cierre ?? 0) || 0

  // Un resuelto reincide con UNA sola pregunta: escribiste la respuesta y aun
  // así alguien volvió a quedarse sin ella. No hay que esperar a que se repita.
  if (estado === 'resuelto') return desde > 0 ? 'resuelto_reincidente' : 'resuelto'

  // Un descartado sí necesita insistencia: lo cerraste a propósito, y una
  // pregunta suelta más no invalida ese juicio.
  if (estado === 'descartado') {
    return desde >= umbralReincidencia ? 'descartado_reincidente' : 'descartado'
  }

  return 'pendiente'
}

const HORA_MS = 3600_000

export function registroEnSilencio({
  ultimoGapConversacion,
  ultimaPreguntaRegistrada,
  horasTolerancia = 6,
} = {}) {
  // Sin gaps recientes no hay nada que registrar: un día tranquilo no es una
  // avería. La referencia es el último gap reportado, no el reloj.
  if (!ultimoGapConversacion) return { enSilencio: false, horasSinRegistrar: null }

  const gap = Date.parse(ultimoGapConversacion)
  if (Number.isNaN(gap)) return { enSilencio: false, horasSinRegistrar: null }

  if (!ultimaPreguntaRegistrada) return { enSilencio: true, horasSinRegistrar: null }

  const reg = Date.parse(ultimaPreguntaRegistrada)
  if (Number.isNaN(reg)) return { enSilencio: true, horasSinRegistrar: null }

  const horas = Math.max(0, Math.round((gap - reg) / HORA_MS))
  return { enSilencio: horas > horasTolerancia, horasSinRegistrar: horas }
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
node --check js/gap-lifecycle.js && node --test tests/gap-lifecycle.test.mjs
```

Esperado: PASS, 9 tests.

- [ ] **Step 5: Correr la suite completa**

```bash
node --test tests/*.test.mjs 2>&1 | tail -8
```

Esperado: `pass 329`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add js/gap-lifecycle.js tests/gap-lifecycle.test.mjs
git commit -m "feat(vacios): estado mostrado de un vacio y detector de silencio"
```

---

### Task 6: `js/gap-split.js` — validar una división

**Files:**
- Create: `js/gap-split.js`
- Test: `tests/gap-split.test.mjs`

**Interfaces:**
- Produces:
  - `validarDivision(preguntas, seleccionIds) → { ok: true } | { ok: false, motivo: string }`
  - `contadoresTrasDividir(preguntas, seleccionIds) → { original, nuevo, anclaPreguntaId }` donde cada lado es `{ preguntas_total, primera_vez, ultima_vez }`
  - `preguntas` es `[{ id, created_at }]`; las mismas reglas viven en la RPC `dividir_vacio` (Task 9), que es quien manda por ser transaccional. Este módulo deshabilita el botón antes de un viaje perdido y permite probar las reglas a fondo.

- [ ] **Step 1: Escribir los tests que fallan**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { validarDivision, contadoresTrasDividir } from '../js/gap-split.js'

const PREGUNTAS = [
  { id: 'a', created_at: '2026-09-10T10:00:00Z' },
  { id: 'b', created_at: '2026-09-12T10:00:00Z' },
  { id: 'c', created_at: '2026-09-15T10:00:00Z' },
  { id: 'd', created_at: '2026-09-18T10:00:00Z' },
]

test('validarDivision: selección vacía se rechaza', () => {
  assert.deepEqual(validarDivision(PREGUNTAS, []), { ok: false, motivo: 'seleccion_vacia' })
  assert.deepEqual(validarDivision(PREGUNTAS, null), { ok: false, motivo: 'seleccion_vacia' })
})

test('validarDivision: una pregunta que no es de este vacío se rechaza entera', () => {
  assert.deepEqual(validarDivision(PREGUNTAS, ['a', 'zzz']), { ok: false, motivo: 'pregunta_ajena' })
})

test('validarDivision: seleccionar TODAS se rechaza', () => {
  // Mover todo no divide nada: deja el vacío original con cero preguntas.
  // Si lo que está mal es el título, se edita el título.
  assert.deepEqual(validarDivision(PREGUNTAS, ['a', 'b', 'c', 'd']), { ok: false, motivo: 'seleccion_total' })
})

test('validarDivision: una selección parcial es válida', () => {
  assert.deepEqual(validarDivision(PREGUNTAS, ['b', 'd']), { ok: true })
  assert.deepEqual(validarDivision(PREGUNTAS, ['a']), { ok: true })
})

test('validarDivision: sin preguntas no hay nada que dividir', () => {
  assert.deepEqual(validarDivision([], ['a']), { ok: false, motivo: 'pregunta_ajena' })
})

test('contadoresTrasDividir: reparte totales y fechas entre los dos lados', () => {
  const r = contadoresTrasDividir(PREGUNTAS, ['b', 'd'])
  assert.deepEqual(r.original, {
    preguntas_total: 2,
    primera_vez: '2026-09-10T10:00:00Z',
    ultima_vez: '2026-09-15T10:00:00Z',
  })
  assert.deepEqual(r.nuevo, {
    preguntas_total: 2,
    primera_vez: '2026-09-12T10:00:00Z',
    ultima_vez: '2026-09-18T10:00:00Z',
  })
})

test('contadoresTrasDividir: el ancla del nuevo es la pregunta MÁS ANTIGUA seleccionada', () => {
  // Misma regla con la que nace cualquier vacío: la primera pregunta manda.
  assert.equal(contadoresTrasDividir(PREGUNTAS, ['d', 'b']).anclaPreguntaId, 'b')
  assert.equal(contadoresTrasDividir(PREGUNTAS, ['c']).anclaPreguntaId, 'c')
})

test('contadoresTrasDividir: el orden de entrada no cambia el resultado', () => {
  const a = contadoresTrasDividir(PREGUNTAS, ['b', 'd'])
  const b = contadoresTrasDividir([...PREGUNTAS].reverse(), ['d', 'b'])
  assert.deepEqual(a, b)
})

test('contadoresTrasDividir: una selección inválida lanza', () => {
  assert.throws(() => contadoresTrasDividir(PREGUNTAS, []), /seleccion_vacia/)
  assert.throws(() => contadoresTrasDividir(PREGUNTAS, ['a', 'b', 'c', 'd']), /seleccion_total/)
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
node --test tests/gap-split.test.mjs
```

Esperado: FAIL — módulo inexistente.

- [ ] **Step 3: Escribir el módulo**

```js
// Validación y aritmética de "dividir un vacío". Import-safe.
//
// Las mismas reglas viven en la RPC dividir_vacio, que es la que manda porque
// es transaccional. Este módulo existe para dos cosas: deshabilitar el botón
// antes de un viaje perdido, y poder probar las reglas a fondo sin base.
//
// La regla que más sorprende: seleccionar TODAS las preguntas se rechaza. Mover
// todo no divide nada — deja el vacío original con cero preguntas, huérfano en
// la bandeja. Si lo que está mal es el título, se edita el título.

function clasificar(preguntas, seleccionIds) {
  const lista = Array.isArray(preguntas) ? preguntas : []
  const sel = new Set(Array.isArray(seleccionIds) ? seleccionIds : [])
  const conocidos = new Set(lista.map(p => p.id))

  for (const id of sel) if (!conocidos.has(id)) return { motivo: 'pregunta_ajena' }
  if (sel.size === 0) return { motivo: 'seleccion_vacia' }
  if (sel.size === lista.length) return { motivo: 'seleccion_total' }

  return {
    motivo: null,
    seSeparan: lista.filter(p => sel.has(p.id)),
    quedan: lista.filter(p => !sel.has(p.id)),
  }
}

export function validarDivision(preguntas, seleccionIds) {
  const { motivo } = clasificar(preguntas, seleccionIds)
  return motivo ? { ok: false, motivo } : { ok: true }
}

function resumen(grupo) {
  const fechas = grupo.map(p => p.created_at).filter(Boolean).sort()
  return {
    preguntas_total: grupo.length,
    primera_vez: fechas[0] ?? null,
    ultima_vez: fechas[fechas.length - 1] ?? null,
  }
}

export function contadoresTrasDividir(preguntas, seleccionIds) {
  const { motivo, seSeparan, quedan } = clasificar(preguntas, seleccionIds)
  if (motivo) throw new Error(motivo)

  // El ancla del vacío nuevo es la pregunta más antigua de las seleccionadas:
  // la misma regla con la que nace cualquier vacío. El ancla del ORIGINAL no se
  // toca (decisión 3 de la spec).
  const masAntigua = [...seSeparan].sort((a, b) =>
    String(a.created_at).localeCompare(String(b.created_at)))[0]

  return {
    original: resumen(quedan),
    nuevo: resumen(seSeparan),
    anclaPreguntaId: masAntigua.id,
  }
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
node --check js/gap-split.js && node --test tests/gap-split.test.mjs
```

Esperado: PASS, 9 tests.

- [ ] **Step 5: Correr la suite completa**

```bash
node --test tests/*.test.mjs 2>&1 | tail -8
```

Esperado: `pass 338`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add js/gap-split.js tests/gap-split.test.mjs
git commit -m "feat(vacios): validacion y aritmetica de dividir un vacio"
```

---

### Task 7: RPC de registro `registrar_pregunta_sin_respuesta`

Usa el umbral aprobado en la Task 3.

**Files:**
- Create: `supabase/migrations/create_registrar_pregunta_sin_respuesta.sql`

**Interfaces:**
- Produces: `registrar_pregunta_sin_respuesta(p_texto text, p_embedding vector, p_conversation_id uuid, p_vertical text, p_plataforma text, p_categoria text) → uuid` (el `vacio_id`, o `null` si quedó sin clasificar). Ejecutable por `service_role`.

- [ ] **Step 1: PASO MANUAL — guardar el umbral en app_settings**

En el SQL Editor, con el valor aprobado en la Task 3 (ejemplo con `0.85`; **usar el real**):

```sql
insert into public.app_settings (key, value, env) values
  ('gap_umbral_coseno', '0.85', 'prod'),
  ('gap_umbral_urgencia', '5', 'prod')
on conflict (key, env) do update set value = excluded.value;
```

Va con `env = 'prod'` porque `loadSettingsResult` lee `prod` como base y el entorno actual encima: así sandbox lo hereda y puede sobrescribirlo sin tocar producción.

- [ ] **Step 2: Escribir la migración**

```sql
-- Registra una pregunta que el bot no supo responder y la cuelga del vacío más
-- cercano, o abre uno nuevo. La llama n8n desde la rama de knowledge_gap del
-- workflow "Bold POS Chat".
--
-- Una sola RPC y no tres viajes (buscar → decidir → insertar) porque dos
-- preguntas parecidas que llegan a la vez abrirían dos vacíos duplicados. Acá
-- es atómico.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
drop function if exists public.registrar_pregunta_sin_respuesta(text, vector, uuid, text, text, text);
create or replace function public.registrar_pregunta_sin_respuesta(
  p_texto           text,
  p_embedding       vector default null,
  p_conversation_id uuid   default null,
  p_vertical        text   default null,
  p_plataforma      text   default null,
  p_categoria       text   default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_umbral  double precision;
  v_vacio   uuid;
  v_texto   text := nullif(btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g')), '');
begin
  -- Sin texto no hay nada que registrar. Silencioso a propósito: es una rama
  -- del bot en producción, no queremos que un turno raro tumbe la respuesta.
  if v_texto is null or length(v_texto) < 5 then
    return null;
  end if;

  -- Sin embedding (Vertex topó cuota) la pregunta se guarda SIN clasificar en
  -- vez de perderse. El dato original es irrecuperable; no agruparlo no lo es.
  if p_embedding is null then
    insert into bot_vacios_preguntas
      (vacio_id, texto, embedding, conversation_id, categoria, vertical, plataforma)
    values (null, v_texto, null, p_conversation_id, p_categoria, p_vertical, p_plataforma);
    return null;
  end if;

  select coalesce(
           (select value::double precision from app_settings
             where key = 'gap_umbral_coseno' and env = 'prod' limit 1),
           0.85)
    into v_umbral;

  -- El vacío MÁS CERCANO por encima del umbral, dentro de la misma vertical.
  -- La misma pregunta en Retail y en Restaurantes no es el mismo vacío porque
  -- la respuesta es distinta (decisión 4).
  select v.id into v_vacio
    from bot_vacios v
   where v.embedding is not null
     and coalesce(v.vertical, '') = coalesce(p_vertical, '')
     and 1 - (v.embedding <=> p_embedding) > v_umbral
   order by v.embedding <=> p_embedding
   limit 1;

  if v_vacio is null then
    insert into bot_vacios
      (titulo, embedding, categoria, vertical, plataforma,
       preguntas_total, primera_vez, ultima_vez)
    values (v_texto, p_embedding, p_categoria, p_vertical, p_plataforma, 0, now(), now())
    returning id into v_vacio;
  end if;

  insert into bot_vacios_preguntas
    (vacio_id, texto, embedding, conversation_id, categoria, vertical, plataforma)
  values (v_vacio, v_texto, p_embedding, p_conversation_id, p_categoria, p_vertical, p_plataforma);

  -- Contadores DERIVADOS de las filas, no incrementados: un contador por suma
  -- se desincroniza en cuanto algo falla a mitad de camino, y después de
  -- dividir un vacío no habría forma de saber cuál es el bueno.
  update bot_vacios v
     set preguntas_total = s.total,
         primera_vez     = s.primera,
         ultima_vez      = s.ultima
    from (select count(*) as total, min(created_at) as primera, max(created_at) as ultima
            from bot_vacios_preguntas where vacio_id = v_vacio) s
   where v.id = v_vacio;

  return v_vacio;
end;
$$;

revoke execute on function public.registrar_pregunta_sin_respuesta(text, vector, uuid, text, text, text) from public, anon, authenticated;
grant  execute on function public.registrar_pregunta_sin_respuesta(text, vector, uuid, text, text, text) to service_role;
```

- [ ] **Step 3: PASO MANUAL — correr la migración**

- [ ] **Step 4: Probar la RPC con SQL, sin tocar n8n**

De a una sentencia (el SQL Editor solo muestra la última). Con un vector de prueba:

```sql
-- 1) Dos preguntas idénticas deben caer en el MISMO vacío.
select registrar_pregunta_sin_respuesta(
  'como cierro la caja del dia',
  (select embedding from lecciones where embedding is not null limit 1),
  null, 'retail', 'android', 'Caja');
```

```sql
select registrar_pregunta_sin_respuesta(
  'como cierro la caja del dia otra vez',
  (select embedding from lecciones where embedding is not null limit 1),
  null, 'retail', 'android', 'Caja');
```

```sql
-- Esperado: UN vacío con preguntas_total = 2.
select id, titulo, preguntas_total, primera_vez, ultima_vez from bot_vacios;
```

```sql
-- 2) Sin embedding: queda sin clasificar, NO se pierde.
select registrar_pregunta_sin_respuesta('una pregunta sin vector ninguno', null, null, 'retail', 'android', 'Caja');
```

```sql
-- Esperado: una fila con vacio_id null.
select id, texto, vacio_id from bot_vacios_preguntas where vacio_id is null;
```

```sql
-- 3) Texto basura: no registra nada y devuelve null.
select registrar_pregunta_sin_respuesta('hi', null, null, null, null, null);
```

```sql
-- 4) Limpiar los datos de prueba.
delete from bot_vacios_preguntas;
delete from bot_vacios;
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/create_registrar_pregunta_sin_respuesta.sql
git commit -m "feat(vacios): RPC transaccional que registra una pregunta sin respuesta"
```

---

### Task 8: n8n — registrar el vacío en la rama de `knowledge_gap`

**REQUIRED SUB-SKILL:** invocar `n8n-mcp-skills:using-n8n-mcp-skills` antes de tocar n8n.

Es la pieza que no cubre ningún test y la que, si falla, deja el módulo muerto en silencio. El detector de la Task 12 es la red; esta tanda tiene que dejarla bien puesta igual.

**Files:**
- Modify: workflow "Bold POS Chat" en n8n
- Create: respaldo del workflow en `n8n/` con fecha

**Interfaces:**
- Consumes: el webhook de embeddings de la Task 1; la RPC de la Task 7.
- Produces: una fila en `bot_vacios_preguntas` por cada turno con `knowledge_gap: true`.

- [ ] **Step 1: Respaldar el workflow antes de tocarlo**

- [ ] **Step 2: Agregar la rama de registro**

En la rama donde el flujo ya decide `knowledge_gap: true`, encadenar:

1. Embeber **el mensaje del usuario de ESE turno** — no el primero de la conversación, no el `summary`. Esa distinción es el motivo entero de la spec.
2. Llamar a `registrar_pregunta_sin_respuesta` con la service key, pasando `texto`, `embedding`, `conversation_id`, `vertical`, `plataforma`, `categoria`.

Dos requisitos que no se pueden negociar:

- **La rama va en paralelo a la respuesta, no antes.** El estudiante no puede esperar por el registro. Si el embedding tarda o falla, el bot ya respondió.
- **Un fallo acá no puede tumbar la respuesta del bot.** Configurar el nodo con `onError: continueRegularOutput`. Un vacío perdido es malo; un bot caído es mucho peor.

- [ ] **Step 3: Probar de punta a punta contra el bot real**

Mandar por el chat (en sandbox) una pregunta que con seguridad no tenga lección, por ejemplo *"cómo configuro el modo karaoke del punto de venta"*. Después:

```sql
select p.texto, p.created_at, v.titulo, v.preguntas_total
  from bot_vacios_preguntas p
  left join bot_vacios v on v.id = p.vacio_id
 order by p.created_at desc limit 5;
```

Esperado: la fila con **el texto exacto que escribiste**.

- [ ] **Step 4: Probar que el texto es el del turno, no el primero**

Conversación de dos turnos: primero algo que el bot SÍ responde, después la pregunta rara. Verificar que la fila registrada trae la **segunda**. Si trae la primera, el nodo está leyendo el mensaje equivocado y todo el agrupamiento queda envenenado.

- [ ] **Step 5: Probar que un fallo del registro no tumba al bot**

Desactivar temporalmente el nodo de la RPC, mandar una pregunta, y confirmar que el bot **responde igual**. Reactivar.

- [ ] **Step 6: Commit del respaldo**

```bash
git add n8n/
git commit -m "feat(n8n): registrar la pregunta del turno cuando el bot no sabe"
```

---

### Task 9: RPCs de lectura y de acciones

**Files:**
- Create: `supabase/migrations/create_analytics_bot_vacios.sql`
- Create: `supabase/migrations/create_acciones_vacios.sql`

**Interfaces:**
- Produces, todas `security definer` y `grant execute to authenticated`:
  - `analytics_bot_vacios(p_estado text, p_vertical text, p_categoria text, p_limit int) → jsonb` — array de vacíos con `preguntas_desde_cierre`
  - `analytics_bot_vacio_detalle(p_vacio_id uuid) → jsonb` — `{ vacio, preguntas: [...] }`
  - `analytics_vacios_salud() → jsonb` — `{ pendientes, sin_clasificar, ultimo_gap_conversacion, ultima_pregunta_registrada }`
  - `resolver_vacio(p_vacio_id uuid, p_leccion_id uuid, p_email text) → void`
  - `descartar_vacio(p_vacio_id uuid, p_motivo text, p_nota text) → void`
  - `dividir_vacio(p_vacio_id uuid, p_pregunta_ids uuid[], p_titulo text) → uuid`

- [ ] **Step 1: Escribir la migración de lectura**

```sql
-- Lectura de la bandeja de vacíos. security definer + grant a authenticated:
-- las tablas tienen RLS sin policies, así que este es el único camino.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

drop function if exists public.analytics_bot_vacios(text, text, text, int);
create or replace function public.analytics_bot_vacios(
  p_estado    text default 'pendiente',
  p_vertical  text default null,
  p_categoria text default null,
  p_limit     int  default 100
) returns jsonb
language sql stable security definer set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.preguntas_total desc, r.ultima_vez desc), '[]'::jsonb)
  from (
    select v.id, v.titulo, v.categoria, v.vertical, v.plataforma, v.estado,
           v.motivo_descarte, v.nota_descarte, v.leccion_id, l.titulo as leccion_titulo,
           v.preguntas_total, v.primera_vez, v.ultima_vez, v.resuelto_at, v.resuelto_por,
           -- Preguntas llegadas DESPUÉS de cerrarlo. Es lo que convierte un
           -- "resuelto" en "resuelto pero siguen preguntando": no falta
           -- contenido, el bot no lo está recuperando.
           (select count(*) from bot_vacios_preguntas p
             where p.vacio_id = v.id
               and v.resuelto_at is not null
               and p.created_at > v.resuelto_at) as preguntas_desde_cierre
      from bot_vacios v
      left join lecciones l on l.id = v.leccion_id
     where (p_estado    is null or v.estado = p_estado)
       and (p_vertical  is null or v.vertical = p_vertical)
       and (p_categoria is null or v.categoria = p_categoria)
     order by v.preguntas_total desc, v.ultima_vez desc
     limit p_limit
  ) r;
$$;
revoke execute on function public.analytics_bot_vacios(text, text, text, int) from public, anon;
grant  execute on function public.analytics_bot_vacios(text, text, text, int) to authenticated;

drop function if exists public.analytics_bot_vacio_detalle(uuid);
create or replace function public.analytics_bot_vacio_detalle(p_vacio_id uuid)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'vacio', (select to_jsonb(v) from bot_vacios v where v.id = p_vacio_id),
    'preguntas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'texto', p.texto,
               'conversation_id', p.conversation_id, 'created_at', p.created_at,
               -- Los mensajes viajan acá y no se consultan aparte: el
               -- explorador de conversaciones expande por índice de la página
               -- cargada, así que NO hay forma de abrir una conversación por
               -- id. Traerlos por esta RPC (security definer) además evita
               -- depender de si `authenticated` tiene SELECT sobre
               -- bodi_conversations, que el repo no refleja.
               'mensajes', coalesce(c.messages, '[]'::jsonb),
               'resumen', c.summary)
             order by p.created_at desc)
        from bot_vacios_preguntas p
        left join bodi_conversations c on c.id = p.conversation_id
       where p.vacio_id = p_vacio_id), '[]'::jsonb)
  );
$$;
revoke execute on function public.analytics_bot_vacio_detalle(uuid) from public, anon;
grant  execute on function public.analytics_bot_vacio_detalle(uuid) to authenticated;

-- Salud del registro: alimenta el badge y el detector de silencio. Los dos
-- max() que comparan "el bot reportó vacíos" contra "se registró alguno".
drop function if exists public.analytics_vacios_salud();
create or replace function public.analytics_vacios_salud()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'pendientes',      (select count(*) from bot_vacios where estado = 'pendiente'),
    'sin_clasificar',  (select count(*) from bot_vacios_preguntas where vacio_id is null),
    'ultimo_gap_conversacion',
      (select max(started_at) from bodi_conversations where knowledge_gap is true),
    'ultima_pregunta_registrada',
      (select max(created_at) from bot_vacios_preguntas)
  );
$$;
revoke execute on function public.analytics_vacios_salud() from public, anon;
grant  execute on function public.analytics_vacios_salud() to authenticated;
```

- [ ] **Step 2: Escribir la migración de acciones**

```sql
-- Acciones de la bandeja: resolver, descartar, dividir.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

drop function if exists public.resolver_vacio(uuid, uuid, text);
create or replace function public.resolver_vacio(
  p_vacio_id uuid, p_leccion_id uuid, p_email text
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  update bot_vacios
     set estado = 'resuelto', leccion_id = p_leccion_id,
         resuelto_at = now(), resuelto_por = p_email,
         motivo_descarte = null, nota_descarte = null
   where id = p_vacio_id;
  if not found then raise exception 'vacio_inexistente'; end if;
end;
$$;
revoke execute on function public.resolver_vacio(uuid, uuid, text) from public, anon;
grant  execute on function public.resolver_vacio(uuid, uuid, text) to authenticated;

drop function if exists public.descartar_vacio(uuid, text, text);
create or replace function public.descartar_vacio(
  p_vacio_id uuid, p_motivo text, p_nota text default null
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_motivo not in ('no_aplica','es_soporte','duplicado','ruido') then
    raise exception 'motivo_invalido';
  end if;
  update bot_vacios
     set estado = 'descartado', motivo_descarte = p_motivo, nota_descarte = p_nota,
         resuelto_at = now(), leccion_id = null
   where id = p_vacio_id;
  if not found then raise exception 'vacio_inexistente'; end if;
end;
$$;
revoke execute on function public.descartar_vacio(uuid, text, text) from public, anon;
grant  execute on function public.descartar_vacio(uuid, text, text) to authenticated;

-- Dividir. El vacío ORIGINAL conserva su ancla: recalcularla sería el centroide
-- móvil que descarta la decisión 3, entrando por la puerta de atrás. El nuevo
-- toma el embedding de la pregunta más antigua de las seleccionadas.
drop function if exists public.dividir_vacio(uuid, uuid[], text);
create or replace function public.dividir_vacio(
  p_vacio_id uuid, p_pregunta_ids uuid[], p_titulo text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_total    int;
  v_sel      int;
  v_nuevo    uuid;
  v_ancla    vector(768);
  v_origen   bot_vacios%rowtype;
begin
  select * into v_origen from bot_vacios where id = p_vacio_id;
  if not found then raise exception 'vacio_inexistente'; end if;

  if p_pregunta_ids is null or array_length(p_pregunta_ids, 1) is null then
    raise exception 'seleccion_vacia';
  end if;

  select count(*) into v_total from bot_vacios_preguntas where vacio_id = p_vacio_id;
  select count(*) into v_sel   from bot_vacios_preguntas
   where vacio_id = p_vacio_id and id = any(p_pregunta_ids);

  -- Rechaza ENTERA, no parcial: una selección con una pregunta ajena es un bug
  -- del cliente, y dividir "lo que sí se pudo" deja un estado que nadie pidió.
  if v_sel <> array_length(p_pregunta_ids, 1) then raise exception 'pregunta_ajena'; end if;
  -- Mover todo no divide nada: dejaría el original con cero preguntas.
  if v_sel = v_total then raise exception 'seleccion_total'; end if;

  select embedding into v_ancla from bot_vacios_preguntas
   where id = any(p_pregunta_ids) order by created_at asc limit 1;

  insert into bot_vacios
    (titulo, embedding, categoria, vertical, plataforma, estado, preguntas_total)
  values (coalesce(nullif(btrim(p_titulo), ''), v_origen.titulo),
          v_ancla, v_origen.categoria, v_origen.vertical, v_origen.plataforma,
          -- Nace PENDIENTE aunque el original estuviera resuelto: la FAQ que se
          -- escribió no cubre lo que se acaba de separar.
          'pendiente', 0)
  returning id into v_nuevo;

  update bot_vacios_preguntas set vacio_id = v_nuevo
   where vacio_id = p_vacio_id and id = any(p_pregunta_ids);

  -- Contadores recalculados desde las filas en AMBOS lados, nunca restados.
  update bot_vacios v set
    preguntas_total = s.total, primera_vez = s.primera, ultima_vez = s.ultima
    from (select vacio_id, count(*) total, min(created_at) primera, max(created_at) ultima
            from bot_vacios_preguntas
           where vacio_id in (p_vacio_id, v_nuevo) group by vacio_id) s
   where v.id = s.vacio_id;

  return v_nuevo;
end;
$$;
revoke execute on function public.dividir_vacio(uuid, uuid[], text) from public, anon;
grant  execute on function public.dividir_vacio(uuid, uuid[], text) to authenticated;
```

- [ ] **Step 3: PASO MANUAL — correr las dos migraciones**

- [ ] **Step 4: Probar `dividir_vacio` con SQL**

Crear un vacío con 3 preguntas (repitiendo la llamada de la Task 7 Step 4), anotar sus ids, y de a una sentencia:

```sql
-- Debe fallar con seleccion_total.
select dividir_vacio('<vacio_id>', array(select id from bot_vacios_preguntas where vacio_id = '<vacio_id>'), 'X');
```

```sql
-- Debe fallar con pregunta_ajena.
select dividir_vacio('<vacio_id>', array['00000000-0000-0000-0000-000000000000'::uuid], 'X');
```

```sql
-- Debe funcionar: separa UNA de las tres.
select dividir_vacio('<vacio_id>', array['<pregunta_id>'::uuid], 'Vacío separado de prueba');
```

```sql
-- Esperado: 2 y 1, y el embedding del original SIN cambiar.
select id, titulo, preguntas_total, estado from bot_vacios;
```

- [ ] **Step 5: Limpiar los datos de prueba y commitear**

```bash
git add supabase/migrations/create_analytics_bot_vacios.sql supabase/migrations/create_acciones_vacios.sql
git commit -m "feat(vacios): RPCs de lectura y acciones de la bandeja"
```

---

### Task 10: `js/gaps-api.js` — capa de acceso

**Files:**
- Create: `js/gaps-api.js`
- Test: `tests/gaps-api.test.mjs`

**Interfaces:**
- Consumes: las RPCs de la Task 9.
- Produces: `fetchVacios(filtros, client)`, `fetchVacioDetalle(id, client)`, `fetchVaciosSalud(client)`, `resolverVacio(id, leccionId, email, client)`, `descartarVacio(id, motivo, nota, client)`, `dividirVacio(id, preguntaIds, titulo, client)`, `getSupabaseClient(loader)`, `_resetGapsClientCache()`.

- [ ] **Step 1: Escribir los tests que fallan**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fetchVacios, fetchVacioDetalle, fetchVaciosSalud,
  resolverVacio, descartarVacio, dividirVacio,
} from '../js/gaps-api.js'

// Cliente falso: registra la llamada y devuelve lo que se le pida.
function fakeClient(respuesta = { data: [], error: null }) {
  const llamadas = []
  return {
    llamadas,
    rpc: async (name, params) => { llamadas.push({ name, params }); return respuesta },
  }
}

test('fetchVacios: manda los filtros con null cuando no se pasan', async () => {
  const c = fakeClient({ data: [], error: null })
  await fetchVacios({}, c)
  assert.deepEqual(c.llamadas[0], {
    name: 'analytics_bot_vacios',
    params: { p_estado: 'pendiente', p_vertical: null, p_categoria: null, p_limit: 100 },
  })
})

test('fetchVacios: respeta los filtros que sí se pasan', async () => {
  const c = fakeClient({ data: [], error: null })
  await fetchVacios({ estado: 'resuelto', vertical: 'retail', categoria: 'Caja', limit: 20 }, c)
  assert.deepEqual(c.llamadas[0].params, {
    p_estado: 'resuelto', p_vertical: 'retail', p_categoria: 'Caja', p_limit: 20,
  })
})

test('un error de la RPC se propaga como throw, NUNCA como dato vacío', async () => {
  // supabase-js no lanza: devuelve { error }. Si esto se tragara el error, la
  // bandeja pintaría "0 vacíos pendientes" ante un fallo de red.
  const c = fakeClient({ data: null, error: { message: 'permission denied' } })
  await assert.rejects(() => fetchVacios({}, c), /analytics_bot_vacios: permission denied/)
  await assert.rejects(() => fetchVaciosSalud(c), /analytics_vacios_salud/)
  await assert.rejects(() => resolverVacio('v', 'l', 'e@x.com', c), /resolver_vacio/)
})

test('fetchVacioDetalle: pasa el id', async () => {
  const c = fakeClient({ data: { vacio: null, preguntas: [] }, error: null })
  await fetchVacioDetalle('abc', c)
  assert.deepEqual(c.llamadas[0], { name: 'analytics_bot_vacio_detalle', params: { p_vacio_id: 'abc' } })
})

test('resolverVacio y descartarVacio mandan sus parámetros', async () => {
  const c = fakeClient({ data: null, error: null })
  await resolverVacio('v1', 'l1', 'yo@x.com', c)
  await descartarVacio('v2', 'ruido', 'nota', c)
  assert.deepEqual(c.llamadas[0].params, { p_vacio_id: 'v1', p_leccion_id: 'l1', p_email: 'yo@x.com' })
  assert.deepEqual(c.llamadas[1].params, { p_vacio_id: 'v2', p_motivo: 'ruido', p_nota: 'nota' })
})

test('dividirVacio manda el array de ids y devuelve el id nuevo', async () => {
  const c = fakeClient({ data: 'nuevo-id', error: null })
  const r = await dividirVacio('v1', ['a', 'b'], 'Título nuevo', c)
  assert.equal(r, 'nuevo-id')
  assert.deepEqual(c.llamadas[0].params, {
    p_vacio_id: 'v1', p_pregunta_ids: ['a', 'b'], p_titulo: 'Título nuevo',
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

```bash
node --test tests/gaps-api.test.mjs
```

Esperado: FAIL — módulo inexistente.

- [ ] **Step 3: Escribir el módulo**

```js
// Capa de acceso a las RPCs de la bandeja de vacíos. El panel consume estas
// funciones y no toca bot_vacios / bot_vacios_preguntas directamente (no
// podría: esas tablas tienen RLS sin policies).
//
// El cliente se resuelve con import dinámico perezoso A PROPÓSITO, igual que en
// js/analytics-api.js: js/supabase.js importa supabase-js desde una URL CDN, y
// un import estático rompe el runner de Node con ERR_UNSUPPORTED_ESM_URL_SCHEME.
// NO lo conviertas a import estático.

let supabaseInstance = null

export async function getSupabaseClient(loader = () => import('./supabase.js')) {
  if (!supabaseInstance) {
    const { supabase } = await loader()
    supabaseInstance = supabase
  }
  return supabaseInstance
}

// Solo para tests.
export function _resetGapsClientCache() { supabaseInstance = null }

// Lanza ante error. supabase-js devuelve { error } sin lanzar, y un error
// tragado acá se vuelve "0 vacíos pendientes" en pantalla: una avería que
// parece una buena noticia.
async function callRpc(client, name, params) {
  const { data, error } = await client.rpc(name, params)
  if (error) throw new Error(`${name}: ${error.message}`)
  return data
}

export async function fetchVacios(filtros = {}, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'analytics_bot_vacios', {
    p_estado: filtros.estado ?? 'pendiente',
    p_vertical: filtros.vertical ?? null,
    p_categoria: filtros.categoria ?? null,
    p_limit: filtros.limit ?? 100,
  })
}

export async function fetchVacioDetalle(vacioId, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'analytics_bot_vacio_detalle', { p_vacio_id: vacioId })
}

export async function fetchVaciosSalud(client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'analytics_vacios_salud', {})
}

export async function resolverVacio(vacioId, leccionId, email, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'resolver_vacio', {
    p_vacio_id: vacioId, p_leccion_id: leccionId, p_email: email,
  })
}

export async function descartarVacio(vacioId, motivo, nota, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'descartar_vacio', {
    p_vacio_id: vacioId, p_motivo: motivo, p_nota: nota ?? null,
  })
}

export async function dividirVacio(vacioId, preguntaIds, titulo, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'dividir_vacio', {
    p_vacio_id: vacioId, p_pregunta_ids: preguntaIds, p_titulo: titulo,
  })
}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

```bash
node --check js/gaps-api.js && node --test tests/gaps-api.test.mjs
```

Esperado: PASS, 6 tests.

- [ ] **Step 5: Correr la suite completa**

```bash
node --test tests/*.test.mjs 2>&1 | tail -8
```

Esperado: `pass 344`, `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add js/gaps-api.js tests/gaps-api.test.mjs
git commit -m "feat(vacios): capa de acceso a las RPCs de la bandeja"
```

---

### Task 11: El panel — lista, franjas y badge

**Files:**
- Create: `js/admin-gaps.js`
- Modify: `admin.html` (botón del sidebar después de "Sugerencias" + `<section id="panel-gaps">`)
- Modify: `js/admin.js` (import, línea en `switchPanel`, etiqueta del breadcrumb, badge)

**Interfaces:**
- Consumes: `fetchVacios`, `fetchVaciosSalud` (Task 10); `estadoMostrado`, `registroEnSilencio` (Task 5).
- Produces: `renderGapsPanel()` y `refreshGapsBadge()`, exportadas desde `js/admin-gaps.js`.

- [ ] **Step 1: Agregar el botón y el contenedor en `admin.html`**

Después del botón `data-panel="suggestions"` (línea 88), con las mismas clases:

```html
<button data-panel="gaps" class="admin-nav w-full px-3 py-2 rounded-xl text-sm font-bold text-left flex items-center justify-between">
  <span>Vacíos del bot</span>
  <span id="gapsBadge" class="hidden text-[10px] font-black px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700"></span>
</button>
```

Y junto a las demás `<section id="panel-…">`:

```html
<section id="panel-gaps" class="hidden"></section>
```

Usar solo clases que ya aparecen en `admin.html` / `js/admin.js`: `css/tw.css` está precompilado y una utilidad nueva no aplicaría nada.

- [ ] **Step 2: Escribir `js/admin-gaps.js` con la lista**

```js
// Bandeja de vacíos del bot: lista, detalle y acciones.
//
// Vive fuera de js/admin.js (que ya pasa de 3.000 líneas), siguiendo el
// precedente de admin-analytics.js y admin-bot-analytics.js.
import { fetchVacios, fetchVaciosSalud } from './gaps-api.js'
import { estadoMostrado, registroEnSilencio } from './gap-lifecycle.js'

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const hace = iso => {
  if (!iso) return '—'
  const dias = Math.floor((Date.now() - Date.parse(iso)) / 86400000)
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  return `hace ${dias} días`
}

export async function renderGapsPanel() {
  const el = document.getElementById('panel-gaps')
  el.innerHTML = `<p class="text-sm text-[var(--black-40)] p-6">Cargando...</p>`

  // Sin ?? 0 y sin try/catch que se trague el error: un fallo de lectura tiene
  // que verse como fallo, no como "no hay vacíos".
  let pendientes, reincidentes, salud
  try {
    ;[pendientes, reincidentes, salud] = await Promise.all([
      fetchVacios({ estado: 'pendiente' }),
      fetchVacios({ estado: 'resuelto' }),
      fetchVaciosSalud(),
    ])
  } catch (e) {
    el.innerHTML = `<div class="p-6">
      <p class="text-sm font-bold text-[var(--error-100)]">No se pudo leer la bandeja de vacíos.</p>
      <p class="text-xs text-[var(--black-40)] mt-1">${escapeHtml(e.message)}</p>
    </div>`
    return
  }

  const vuelven = (reincidentes || []).filter(v => estadoMostrado(v) === 'resuelto_reincidente')
  const silencio = registroEnSilencio({
    ultimoGapConversacion: salud?.ultimo_gap_conversacion,
    ultimaPreguntaRegistrada: salud?.ultima_pregunta_registrada,
  })

  el.innerHTML = `
    <div class="p-4 md:p-6 flex flex-col gap-4">
      ${silencio.enSilencio ? avisoSilencioHtml(silencio) : ''}
      ${Number(salud?.sin_clasificar) > 0 ? sinClasificarHtml(salud.sin_clasificar) : ''}
      ${vuelven.length ? franjaReincidentesHtml(vuelven) : ''}
      <div>
        <h2 class="text-sm font-black text-[var(--blue-100)] mb-2">
          Pendientes (${(pendientes || []).length})
        </h2>
        <div class="flex flex-col gap-1.5">
          ${(pendientes || []).length
            ? pendientes.map(filaHtml).join('')
            : `<p class="text-xs text-[var(--black-40)]">Nada pendiente. Si el bot está fallando igual, mira el aviso de arriba.</p>`}
        </div>
      </div>
    </div>`
}

function avisoSilencioHtml(s) {
  const cuando = s.horasSinRegistrar === null
    ? 'y no se ha registrado ninguno nunca'
    : `pero no se registra ninguno desde hace ${s.horasSinRegistrar} horas`
  return `<div class="border border-[var(--error-100)] rounded-xl p-3">
    <p class="text-xs font-black text-[var(--error-100)]">El registro de vacíos parece roto</p>
    <p class="text-xs text-[var(--black-60)] mt-1">
      El bot reportó preguntas sin respuesta ${escapeHtml(cuando)}.
      Revisa la rama de registro del workflow de n8n.
    </p>
  </div>`
}

function sinClasificarHtml(n) {
  return `<div class="border border-[var(--warning-150)] rounded-xl p-3">
    <p class="text-xs font-black text-[var(--warning-150)]">${n} preguntas sin clasificar</p>
    <p class="text-xs text-[var(--black-60)] mt-1">
      Llegaron sin embedding (cuota de Vertex). No se perdieron, pero tampoco se agruparon.
    </p>
  </div>`
}

function franjaReincidentesHtml(vs) {
  return `<div>
    <h2 class="text-sm font-black text-[var(--warning-150)] mb-2">
      Resueltos que siguen preguntándose (${vs.length})
    </h2>
    <p class="text-xs text-[var(--black-40)] mb-2">
      El contenido existe y el bot no lo está recuperando. Revisa que la lección
      esté activa y con embedding al día — es más barato que escribir de nuevo.
    </p>
    <div class="flex flex-col gap-1.5">${vs.map(filaHtml).join('')}</div>
  </div>`
}

function filaHtml(v) {
  const chips = [v.vertical, v.categoria].filter(Boolean)
    .map(c => `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--blue-10)] text-[var(--blue-100)]">${escapeHtml(c)}</span>`)
    .join(' ')
  const extra = Number(v.preguntas_desde_cierre) > 0
    ? `<span class="text-[10px] font-bold text-[var(--warning-150)]">+${v.preguntas_desde_cierre} desde que lo cerraste</span>`
    : ''
  return `<button data-vacio="${escapeHtml(v.id)}"
      class="gap-row w-full text-left bg-white border border-[var(--blue-10)] rounded-xl p-3 hover:bg-[var(--background-page)]">
    <div class="flex items-start justify-between gap-3">
      <span class="text-sm font-bold text-[var(--black-100)]">${escapeHtml(v.titulo)}</span>
      <span class="shrink-0 text-xs font-black text-[var(--blue-100)]">${v.preguntas_total}×</span>
    </div>
    <div class="flex items-center gap-2 mt-1.5 flex-wrap">
      ${chips}
      <span class="text-[10px] text-[var(--black-40)]">última ${escapeHtml(hace(v.ultima_vez))}</span>
      ${extra}
    </div>
  </button>`
}

export async function refreshGapsBadge() {
  const badge = document.getElementById('gapsBadge')
  if (!badge) return
  try {
    const salud = await fetchVaciosSalud()
    const n = Number(salud?.pendientes)
    // Number(undefined) es NaN, no 0: un fallo de lectura deja el badge oculto
    // en vez de afirmar que no hay nada pendiente.
    if (Number.isFinite(n) && n > 0) {
      badge.textContent = String(n)
      badge.classList.remove('hidden')
    } else {
      badge.classList.add('hidden')
    }
  } catch (e) {
    console.error('[gaps] no se pudo leer la salud de la bandeja:', e.message)
    badge.classList.add('hidden')
  }
}
```

- [ ] **Step 3: Engancharlo en `js/admin.js`**

Junto a los demás imports (cerca de la línea 19):

```js
import { renderGapsPanel, refreshGapsBadge } from './admin-gaps.js'
```

En el mapa `labels` de `switchPanel` (línea 398), agregar `gaps: 'Vacíos del bot',`.

Junto a los demás despachos de `switchPanel` (después de la línea 413):

```js
  if (panel === 'gaps') renderGapsPanel()
```

Y al final de la inicialización, donde ya se llama a `switchPanel(savedPanel)` (línea 268):

```js
  refreshGapsBadge()
```

- [ ] **Step 4: Verificar sintaxis y suite**

```bash
node --check js/admin-gaps.js && node --check js/admin.js && node --test tests/*.test.mjs 2>&1 | tail -6
```

Esperado: sin errores de sintaxis; `pass 344`, `fail 0` (esta tanda no agrega tests: es render con DOM).

- [ ] **Step 5: Verificar en el navegador**

Abrir el admin en sandbox, entrar a "Vacíos del bot". Con los vacíos reales que dejó la Task 8, confirmar: la lista ordena por número de preguntas descendente, los chips salen, y el badge del sidebar muestra el conteo.

Prueba del camino de error, que es la que más importa: en las DevTools, bloquear la petición a `analytics_bot_vacios` (o renombrar temporalmente la RPC en el módulo) y confirmar que aparece **"No se pudo leer la bandeja de vacíos"** y **no** "0 pendientes".

- [ ] **Step 6: Commit**

```bash
git add js/admin-gaps.js js/admin.js admin.html
git commit -m "feat(vacios): panel de la bandeja con lista, franjas y badge"
```

---

### Task 12: Detalle y resolver

**Files:**
- Modify: `js/admin-gaps.js`

**Interfaces:**
- Consumes: `fetchVacioDetalle`, `resolverVacio` (Task 10); `buildFaqBlock`, `contenidoConFaq` (Task 4); `dedupeQuestions` de `js/faq-suggest.js`; `embedLesson` y `logActivity`.
- Produces: `abrirDetalle(vacioId)` dentro del módulo.

- [ ] **Step 1: Extraer `embedLesson` a `js/lesson-embed.js`**

`embedLesson` vive hoy como función privada de `js/admin.js` (línea 29). La bandeja la necesita, pero **no se puede importar desde `js/admin.js`**: `admin.js` importa `admin-gaps.js`, así que `admin-gaps.js` importando `admin.js` sería un ciclo. Los ciclos de ES modules "funcionan" con declaraciones de función por hoisting y se rompen en cuanto alguien convierte una a `const`. No se deja puesta esa trampa.

Crear `js/lesson-embed.js` moviendo tal cual el código de `js/admin.js:23-39`:

```js
// Dispara el re-embebido de una lección contra el webhook de n8n. Vive aparte
// de js/admin.js porque lo necesitan dos consumidores (el editor de lecciones y
// la bandeja de vacíos), y un import entre ellos sería circular.
//
// No es import-safe (hace fetch), así que no lleva test propio: lo que sí es
// puro —armar el texto a embeber— ya vive en js/lesson-embed-text.js.
import { lessonToEmbedText } from './lesson-embed-text.js'

const EMBED_WEBHOOK = 'https://n8n.mplasesores.com/webhook/embed-lesson'
const EMBED_TOKEN   = 'BoldBodi-2026-K9xMvP7q'

export async function embedLesson(lessonId, titulo, categoria, blocks, notas) {
  try {
    const text = lessonToEmbedText(titulo, categoria, blocks, notas)
    const res = await fetch(EMBED_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': EMBED_TOKEN },
      body: JSON.stringify({ lessonId, text })
    })
    return res.ok
  } catch (_) { return false }
}
```

En `js/admin.js`: borrar la función y las dos constantes de las líneas 23-39, y agregar `import { embedLesson } from './lesson-embed.js'`. **Ojo:** `EMBED_WEBHOOK` y `EMBED_TOKEN` se usan también en las líneas 1710 y 1722; esos dos usos necesitan las constantes. Exportarlas también desde `js/lesson-embed.js` y ajustar el import de `admin.js`:

```js
export const EMBED_WEBHOOK = 'https://n8n.mplasesores.com/webhook/embed-lesson'
export const EMBED_TOKEN   = 'BoldBodi-2026-K9xMvP7q'
```

```js
import { embedLesson, EMBED_WEBHOOK, EMBED_TOKEN } from './lesson-embed.js'
```

- [ ] **Step 1b: Verificar que el editor de lecciones sigue funcionando**

```bash
node --check js/lesson-embed.js && node --check js/admin.js && node --test tests/*.test.mjs 2>&1 | tail -6
```

Después, en el navegador: guardar una lección y confirmar que el re-embebido se dispara igual (el badge "Sin IA" desaparece, o el estado de embeddings del panel baja en uno). Esta extracción toca código que ya está en producción, así que se verifica antes de construir nada encima.

```bash
git add js/lesson-embed.js js/admin.js
git commit -m "refactor(lecciones): embedLesson sale de admin.js a su propio modulo"
```

- [ ] **Step 2: Agregar el detalle y el modal de resolución**

En `js/admin-gaps.js`, **ampliar** el import existente de `./gaps-api.js` (no agregar un segundo import del mismo módulo) y sumar los nuevos:

```js
import { fetchVacios, fetchVaciosSalud, fetchVacioDetalle, resolverVacio } from './gaps-api.js'
import { contenidoConFaq, buildFaqBlock } from './gap-faq-block.js'
import { dedupeQuestions } from './faq-suggest.js'
import { supabase } from './supabase.js'
import { logActivity } from './activity.js'
import { embedLesson } from './lesson-embed.js'
```

El detalle, que reemplaza la lista mientras está abierto:

```js
let vacioAbierto = null   // { vacio, preguntas } del detalle en pantalla

async function abrirDetalle(vacioId) {
  const el = document.getElementById('panel-gaps')
  el.innerHTML = `<p class="text-sm text-[var(--black-40)] p-6">Cargando...</p>`

  let detalle, lecciones
  try {
    detalle = await fetchVacioDetalle(vacioId)
    const { data, error } = await supabase
      .from('lecciones').select('id,titulo,vertical').order('titulo')
    if (error) throw new Error(`lecciones: ${error.message}`)
    lecciones = data
  } catch (e) {
    el.innerHTML = `<div class="p-6">
      <p class="text-sm font-bold text-[var(--error-100)]">No se pudo abrir el vacío.</p>
      <p class="text-xs text-[var(--black-40)] mt-1">${escapeHtml(e.message)}</p>
      <button id="gapVolver" class="mt-3 text-xs font-bold text-[var(--blue-100)] hover:underline">← Volver</button>
    </div>`
    document.getElementById('gapVolver').addEventListener('click', renderGapsPanel)
    return
  }

  vacioAbierto = detalle
  const v = detalle.vacio
  // Las preguntas reales son lo que permite escribir la respuesta sin adivinar,
  // y también lo que precarga las variaciones.
  const variacionesSugeridas = dedupeQuestions(detalle.preguntas.map(p => p.texto)).join('\n')
  // La vertical del vacío acota el selector: ofrecer lecciones de la otra
  // vertical sería ofrecer el destino equivocado.
  const opciones = lecciones
    .filter(l => !v.vertical || !l.vertical || l.vertical === v.vertical || l.vertical === 'ambas')
    .map(l => `<option value="${escapeHtml(l.id)}">${escapeHtml(l.titulo)}</option>`).join('')

  el.innerHTML = `
    <div class="p-4 md:p-6 flex flex-col gap-4">
      <button id="gapVolver" class="text-xs font-bold text-[var(--blue-100)] hover:underline text-left">← Volver a la bandeja</button>

      <div>
        <h2 class="text-base font-black text-[var(--black-100)]">${escapeHtml(v.titulo)}</h2>
        <p class="text-xs text-[var(--black-40)] mt-1">
          ${v.preguntas_total} preguntas · primera ${escapeHtml(hace(v.primera_vez))} · última ${escapeHtml(hace(v.ultima_vez))}
        </p>
      </div>

      <div>
        <h3 class="text-xs font-black text-[var(--blue-100)] mb-1.5">Preguntas reales</h3>
        <div class="flex flex-col gap-1">
          ${detalle.preguntas.map((p, i) => preguntaHtml(p, i)).join('')}
        </div>
        <div id="gapSplitBar" class="hidden mt-2"></div>
      </div>

      <div class="bg-white border border-amber-200 rounded-xl p-3 flex flex-col gap-1.5">
        <h3 class="text-xs font-black text-amber-700">Resolver con una FAQ del bot</h3>
        <select id="gapLeccion" class="w-full px-2 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-xs outline-none focus:border-amber-400">
          <option value="">Elige la lección destino…</option>${opciones}
        </select>
        <input id="gapPregunta" value="${escapeHtml(v.titulo)}" placeholder="Pregunta base"
          class="w-full px-2 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-xs font-bold outline-none focus:border-amber-400">
        <textarea id="gapVariaciones" rows="3"
          class="w-full px-2 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-xs outline-none focus:border-amber-400 resize-none">${escapeHtml(variacionesSugeridas)}</textarea>
        <textarea id="gapRespuesta" rows="4" placeholder="Respuesta que dará el bot..."
          class="w-full px-2 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-xs outline-none focus:border-amber-400 resize-none"></textarea>
        <label class="flex items-center gap-1.5 text-[11px] text-[var(--black-60)] cursor-pointer select-none">
          <input type="checkbox" id="gapAcordeon" class="accent-[var(--blue-100)]">
          Mostrar en la lección como acordeón (visible al estudiante)
        </label>
        <p id="gapMsg" class="text-xs hidden"></p>
        <div class="flex gap-2 mt-1">
          <button id="gapGuardar" class="px-3 py-2 rounded-xl text-xs font-bold bg-[var(--blue-100)] text-white">Guardar y cerrar el vacío</button>
          <button id="gapDescartarBtn" class="px-3 py-2 rounded-xl text-xs font-bold text-[var(--black-60)] border border-[var(--blue-20)]">Descartar…</button>
        </div>
      </div>

      <div id="gapDescartarBox" class="hidden"></div>
    </div>`

  document.getElementById('gapVolver').addEventListener('click', renderGapsPanel)
  document.getElementById('gapGuardar').addEventListener('click', onGuardar)
  wireVerConversacion()
  wireDescartar(v)
  wireDividir(v)
}

function preguntaHtml(p, i) {
  const verConv = (p.mensajes || []).length
    ? `<button type="button" data-conv="${i}" class="gap-conv text-[10px] font-bold text-[var(--blue-100)] hover:underline shrink-0">ver conversación</button>`
    : ''
  return `<div class="bg-white border border-[var(--blue-10)] rounded-lg p-2">
    <label class="flex items-start gap-2 cursor-pointer">
      <input type="checkbox" class="gap-pregunta mt-0.5 accent-[var(--blue-100)]" value="${escapeHtml(p.id)}">
      <span class="flex-1 text-xs text-[var(--black-100)]">${escapeHtml(p.texto)}</span>
      <span class="text-[10px] text-[var(--black-40)] shrink-0">${escapeHtml(hace(p.created_at))}</span>
      ${verConv}
    </label>
    <div class="gap-conv-detail hidden mt-2 pt-2 border-t border-[var(--blue-10)] text-xs" data-detail="${i}"></div>
  </div>`
}

// La conversación se expande acá adentro, no se navega a otro panel: el
// explorador no sabe abrir una conversación por id, y además perder el lugar en
// la bandeja a mitad de una revisión es lo que hace que nadie la termine.
function wireVerConversacion() {
  document.querySelectorAll('.gap-conv').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault()
      const i = btn.dataset.conv
      const box = document.querySelector(`.gap-conv-detail[data-detail="${i}"]`)
      if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return }
      const p = vacioAbierto.preguntas[i]
      const msgs = (p.mensajes || []).map(m =>
        `<p class="mb-1"><b class="text-[var(--blue-100)]">${m.role === 'user' ? 'Usuario' : 'Bot'}:</b> ${escapeHtml(m.content || '')}</p>`).join('')
      box.innerHTML = `${p.resumen ? `<p class="italic text-[var(--black-60)] mb-2">✨ ${escapeHtml(p.resumen)}</p>` : ''}${msgs}`
      box.classList.remove('hidden')
    })
  })
}

async function onGuardar() {
  const btn = document.getElementById('gapGuardar')
  const msg = document.getElementById('gapMsg')
  const leccionId = document.getElementById('gapLeccion').value
  if (!leccionId) { mostrarMsg('Elige la lección destino.', true); return }

  btn.disabled = true
  btn.textContent = 'Guardando...'
  const { error } = await guardarResolucion({
    vacioId: vacioAbierto.vacio.id,
    leccionId,
    pregunta: document.getElementById('gapPregunta').value,
    variaciones: document.getElementById('gapVariaciones').value,
    respuesta: document.getElementById('gapRespuesta').value,
    mostrarAcordeon: document.getElementById('gapAcordeon').checked,
  })
  btn.disabled = false
  btn.textContent = 'Guardar y cerrar el vacío'

  if (error) { mostrarMsg(error, true); return }
  renderGapsPanel()
  refreshGapsBadge()
}

function mostrarMsg(texto, esError) {
  const msg = document.getElementById('gapMsg')
  msg.textContent = texto
  msg.className = `text-xs ${esError ? 'text-[var(--error-100)]' : 'text-[var(--success-150)]'}`
}
```

Y en `renderGapsPanel`, al final, enganchar las filas:

```js
  el.querySelectorAll('.gap-row').forEach(b =>
    b.addEventListener('click', () => abrirDetalle(b.dataset.vacio)))
```

El flujo de resolución:

```js
// Escribe el bloque bot_faq en la lección destino y cierra el vacío.
//
// El orden importa y no es negociable: se RELEE `contenido` justo antes de
// escribir. Usar una copia leída al abrir el modal es la clase de bug que ya
// vació lecciones — si alguien la editó mientras tanto, se pisaría su trabajo
// entero en vez de perder unos segundos.
async function guardarResolucion({ vacioId, leccionId, pregunta, variaciones, respuesta, mostrarAcordeon }) {
  const bloque = buildFaqBlock({ pregunta, variaciones, respuesta, mostrarAcordeon })
  if (!bloque) return { error: 'Falta la pregunta base o la respuesta.' }

  const { data: leccion, error: errLeer } = await supabase
    .from('lecciones').select('id,titulo,categoria,contenido,notas').eq('id', leccionId).single()
  if (errLeer) return { error: `No se pudo leer la lección: ${errLeer.message}` }

  let contenido
  try {
    contenido = contenidoConFaq(leccion.contenido, bloque)
  } catch (e) {
    // contenidoConFaq lanza cuando el parseo daría vacío teniendo contenido.
    return { error: e.message }
  }

  const { error: errGuardar } = await supabase
    .from('lecciones').update({ contenido }).eq('id', leccionId)
  if (errGuardar) return { error: `No se pudo guardar la lección: ${errGuardar.message}` }

  const { data: { user } } = await supabase.auth.getUser()
  try {
    await resolverVacio(vacioId, leccionId, user?.email || '')
  } catch (e) {
    // La lección YA se guardó. Decirlo en vez de fingir que no pasó nada: el
    // contenido está bien y lo único pendiente es cerrar el vacío.
    return { error: `La FAQ se guardó, pero el vacío no se pudo cerrar: ${e.message}` }
  }

  logActivity('update', 'bot_vacio', pregunta, { leccion_id: leccionId, accion: 'resuelto' })

  // Re-embeber al final y sin bloquear: sin esto el bot no encuentra la FAQ
  // recién escrita, que es el objetivo entero de la bandeja.
  embedLesson(leccion.id, leccion.titulo, leccion.categoria,
    JSON.parse(contenido), leccion.notas)

  return { error: null }
}
```

El modal de detalle muestra las preguntas reales (cada una con enlace a su conversación), y precarga el formulario:

```js
const variacionesSugeridas = dedupeQuestions(detalle.preguntas.map(p => p.texto)).join('\n')
```

El selector de lección se llena con `supabase.from('lecciones').select('id,titulo,categoria').order('titulo')`, filtrando por la vertical del vacío cuando la tiene.

- [ ] **Step 3: Verificar sintaxis**

```bash
node --check js/admin-gaps.js && node --check js/admin.js
```

- [ ] **Step 4: Verificar en el navegador, con la prueba que importa**

1. Abrir un vacío real, confirmar que se ven las preguntas con fecha y que "ver conversación" despliega los mensajes ahí mismo.
2. Elegir una lección **que tenga contenido**, escribir una respuesta y guardar.
3. **Confirmar que la lección conservó todos sus bloques anteriores** y ganó uno `bot_faq`. Esta es la verificación crítica de toda la tanda.
4. Repetir con una lección en **formato HTML legacy** (una vieja, sin JSON en `contenido`): debe quedar con un bloque `html` + el `bot_faq`, sin perder el HTML.
5. Confirmar que el vacío pasó a resuelto y desapareció de Pendientes.

- [ ] **Step 5: Commit**

```bash
git add js/admin-gaps.js js/admin.js
git commit -m "feat(vacios): detalle del vacio y resolucion hacia un bloque bot_faq"
```

---

### Task 13: Descartar y dividir

**Files:**
- Modify: `js/admin-gaps.js`

**Interfaces:**
- Consumes: `descartarVacio`, `dividirVacio` (Task 10); `validarDivision` (Task 6).

- [ ] **Step 1: Ampliar los imports de `js/admin-gaps.js`**

```js
import { fetchVacios, fetchVaciosSalud, fetchVacioDetalle, resolverVacio,
         descartarVacio, dividirVacio } from './gaps-api.js'
import { validarDivision } from './gap-split.js'
```

- [ ] **Step 2: Agregar el descarte**

```js
const MOTIVOS = {
  no_aplica: 'No aplica',
  es_soporte: 'Es soporte, no academia',
  duplicado: 'Duplicado de otro vacío',
  ruido: 'Ruido',
}

function wireDescartar(vacio) {
  const box = document.getElementById('gapDescartarBox')
  document.getElementById('gapDescartarBtn').addEventListener('click', () => {
    box.classList.remove('hidden')
    box.innerHTML = `
      <div class="bg-white border border-[var(--blue-10)] rounded-xl p-3 flex flex-col gap-1.5">
        <h3 class="text-xs font-black text-[var(--black-60)]">Descartar sin crear contenido</h3>
        <select id="gapMotivo" class="w-full px-2 py-1.5 rounded-lg border border-[var(--blue-20)] text-xs outline-none">
          ${Object.entries(MOTIVOS).map(([k, t]) =>
            `<option value="${k}">${escapeHtml(t)}</option>`).join('')}
        </select>
        <input id="gapNota" placeholder="Nota (opcional)"
          class="w-full px-2 py-1.5 rounded-lg border border-[var(--blue-20)] text-xs outline-none">
        <p id="gapDescartarMsg" class="text-xs hidden"></p>
        <button id="gapDescartarOk" class="px-3 py-2 rounded-xl text-xs font-bold bg-[var(--black-60)] text-white">
          Descartar este vacío
        </button>
      </div>`

    document.getElementById('gapDescartarOk').addEventListener('click', async () => {
      const motivo = document.getElementById('gapMotivo').value
      const nota = document.getElementById('gapNota').value.trim() || null
      const btn = document.getElementById('gapDescartarOk')
      btn.disabled = true
      try {
        await descartarVacio(vacio.id, motivo, nota)
      } catch (e) {
        btn.disabled = false
        const m = document.getElementById('gapDescartarMsg')
        m.textContent = `No se pudo descartar: ${e.message}`
        m.className = 'text-xs text-[var(--error-100)]'
        return
      }
      // El motivo no es burocracia: a los dos meses dice si el detector genera
      // basura y de qué tipo.
      logActivity('update', 'bot_vacio', vacio.titulo, { accion: 'descartado', motivo })
      renderGapsPanel()
      refreshGapsBadge()
    })
  })
}
```

- [ ] **Step 3: Agregar la división**

```js
function wireDividir(vacio) {
  const bar = document.getElementById('gapSplitBar')
  const seleccion = () =>
    [...document.querySelectorAll('.gap-pregunta:checked')].map(c => c.value)

  const pintarBarra = () => {
    const ids = seleccion()
    if (ids.length === 0) { bar.classList.add('hidden'); return }

    // Se valida en el CLIENTE antes de llamar. La RPC rechaza lo mismo y es la
    // que manda (es transaccional), pero explicar el motivo acá evita un viaje
    // perdido y, sobre todo, evita que el usuario no entienda el rechazo.
    const v = validarDivision(vacioAbierto.preguntas, ids)
    const motivos = {
      seleccion_vacia: 'Selecciona al menos una pregunta.',
      seleccion_total: 'Seleccionaste todas: eso no divide nada, deja este vacío sin preguntas. Si el título está mal, edítalo.',
      pregunta_ajena: 'Alguna pregunta ya no pertenece a este vacío. Recarga la bandeja.',
    }

    bar.classList.remove('hidden')
    bar.innerHTML = v.ok
      ? `<div class="flex items-center gap-2 flex-wrap">
           <input id="gapSplitTitulo" placeholder="Título del vacío nuevo"
             class="flex-1 min-w-[180px] px-2 py-1.5 rounded-lg border border-[var(--blue-20)] text-xs outline-none">
           <button id="gapSplitOk" class="px-3 py-2 rounded-xl text-xs font-bold bg-amber-100 text-amber-700">
             Mover ${ids.length} a un vacío nuevo
           </button>
           <span id="gapSplitMsg" class="text-xs"></span>
         </div>`
      : `<p class="text-xs text-[var(--error-100)]">${escapeHtml(motivos[v.motivo] || 'No se puede dividir así.')}</p>`

    if (!v.ok) return
    document.getElementById('gapSplitOk').addEventListener('click', async () => {
      const titulo = document.getElementById('gapSplitTitulo').value.trim()
      const btn = document.getElementById('gapSplitOk')
      btn.disabled = true
      let nuevoId
      try {
        nuevoId = await dividirVacio(vacio.id, ids, titulo)
      } catch (e) {
        btn.disabled = false
        document.getElementById('gapSplitMsg').textContent = `No se pudo dividir: ${e.message}`
        document.getElementById('gapSplitMsg').className = 'text-xs text-[var(--error-100)]'
        return
      }
      // 'move' ("Movió") ya existe en actionBadge (js/admin.js:2837): la
      // división queda auditada sin inventar un tipo de acción nuevo.
      logActivity('move', 'bot_vacio', vacio.titulo,
        { desde: vacio.id, hacia: nuevoId, preguntas: ids.length })
      abrirDetalle(vacio.id)   // recargar: los contadores cambiaron en ambos lados
    })
  }

  document.querySelectorAll('.gap-pregunta').forEach(c =>
    c.addEventListener('change', pintarBarra))
}
```

- [ ] **Step 4: Verificar sintaxis**

```bash
node --check js/admin-gaps.js
```

- [ ] **Step 5: Verificar en el navegador**

1. Descartar un vacío con motivo; confirmar que sale de Pendientes y que el motivo quedó guardado.
2. Abrir un vacío con varias preguntas, marcar una, dividir. Confirmar que los dos contadores cuadran con las filas reales:

```sql
select v.id, v.titulo, v.preguntas_total,
       (select count(*) from bot_vacios_preguntas p where p.vacio_id = v.id) as filas_reales
  from bot_vacios v;
```

Esperado: `preguntas_total = filas_reales` en **ambos**.

3. Intentar seleccionar todas las preguntas: el botón debe explicar por qué no se puede, sin llamar a la RPC.
4. Dividir un vacío **resuelto** y confirmar que el nuevo nace **pendiente**.

- [ ] **Step 6: Commit**

```bash
git add js/admin-gaps.js
git commit -m "feat(vacios): descartar con motivo y dividir un vacio"
```

---

### Task 14: Resumen diario por n8n

**REQUIRED SUB-SKILL:** invocar `n8n-mcp-skills:using-n8n-mcp-skills` antes de tocar n8n.

**Files:**
- Create: workflow n8n nuevo, respaldado en `n8n/`
- Create: `supabase/migrations/create_analytics_vacios_resumen_diario.sql`

**Interfaces:**
- Produces: `analytics_vacios_resumen_diario() → jsonb` con `{ nuevos_24h, urgentes, reincidentes, en_silencio }`, ejecutable por `service_role`.

- [ ] **Step 1: Escribir la RPC del resumen**

```sql
-- Resumen para el aviso diario. Lo llama un workflow de n8n una vez al día.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
drop function if exists public.analytics_vacios_resumen_diario();
create or replace function public.analytics_vacios_resumen_diario()
returns jsonb
language sql stable security definer set search_path = public
as $$
  with umbral as (
    select coalesce((select value::int from app_settings
                      where key = 'gap_umbral_urgencia' and env = 'prod' limit 1), 5) as n
  )
  select jsonb_build_object(
    'nuevos_24h', (select coalesce(jsonb_agg(jsonb_build_object(
                            'titulo', titulo, 'preguntas', preguntas_total) order by preguntas_total desc), '[]'::jsonb)
                     from bot_vacios
                    where estado = 'pendiente' and created_at > now() - interval '24 hours'),
    'urgentes',   (select coalesce(jsonb_agg(jsonb_build_object(
                            'titulo', titulo, 'preguntas', preguntas_total) order by preguntas_total desc), '[]'::jsonb)
                     from bot_vacios, umbral
                    where estado = 'pendiente' and preguntas_total >= umbral.n),
    'reincidentes', (select count(*) from bot_vacios v
                      where v.estado = 'resuelto' and v.resuelto_at is not null
                        and exists (select 1 from bot_vacios_preguntas p
                                     where p.vacio_id = v.id and p.created_at > v.resuelto_at)),
    'en_silencio', (select (select max(started_at) from bodi_conversations where knowledge_gap is true)
                         > coalesce((select max(created_at) from bot_vacios_preguntas), '-infinity'::timestamptz)
                           + interval '6 hours')
  );
$$;
revoke execute on function public.analytics_vacios_resumen_diario() from public, anon;
grant  execute on function public.analytics_vacios_resumen_diario() to authenticated, service_role;
```

- [ ] **Step 2: PASO MANUAL — correr la migración y probar la RPC**

```sql
select analytics_vacios_resumen_diario();
```

- [ ] **Step 3: Crear el workflow del resumen**

Schedule diario (hora de Bogotá, el proyecto ya usa esa zona) → llamar a la RPC → si `nuevos_24h`, `urgentes` y `en_silencio` están todos vacíos/false, **no mandar nada**. Un aviso diario que llega aunque no haya novedad se ignora a la semana.

El canal (correo o WhatsApp) lo elige el usuario en este paso.

- [ ] **Step 4: Probar disparándolo a mano y commitear**

```bash
git add supabase/migrations/create_analytics_vacios_resumen_diario.sql n8n/
git commit -m "feat(vacios): resumen diario de la bandeja por n8n"
```

---

### Task 15: Verificación de punta a punta y deploy

- [ ] **Step 1: Suite completa y sintaxis**

```bash
node --test tests/*.test.mjs 2>&1 | tail -8
```

Esperado: `pass 344`, `fail 0`. Si bajó de 311, algo se rompió: **no seguir**.

- [ ] **Step 2: El ciclo completo, con el bot real**

1. En sandbox, preguntarle al bot algo que no tenga lección.
2. Confirmar que el vacío aparece en la bandeja con el **texto exacto**.
3. Resolverlo escribiendo una FAQ en una lección real.
4. Esperar a que el re-embebido termine (el panel de Lecciones muestra el estado de los embeddings).
5. **Preguntarle al bot lo mismo otra vez y confirmar que ahora responde con esa FAQ.** Este es el único paso que prueba que todo el sistema sirve para algo.

- [ ] **Step 3: Confirmar que anon sigue sin llegar**

```bash
for t in bot_vacios bot_vacios_preguntas; do
  echo -n "$t -> "
  curl -s -D - -o /dev/null \
    "https://tczcngfhuendmldafbrc.supabase.co/rest/v1/$t?select=id&limit=1" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
    -H "Prefer: count=exact" | grep -i "content-range"
done
```

Esperado: `*/0` en las dos.

- [ ] **Step 4: PASO MANUAL — encender el módulo en sandbox y usarlo unos días**

El toggle por entorno existe justamente para esto: el **panel** se enciende solo en sandbox. Antes de producción conviene que el umbral se pruebe con vacíos reales: si la bandeja se llena de vacíos de una sola pregunta, quedó alto.

**Ojo con el umbral: es global, no por entorno.** Lo lee n8n, que atiende a los dos entornos por el mismo webhook y no sabe de cuál vino la pregunta, así que las RPCs leen la fila `env = 'prod'` fija. Ajustarlo durante las pruebas cambia también el agrupamiento de producción. El panel sí queda aislado; el umbral no.

- [ ] **Step 5: PASO MANUAL — visto bueno del usuario y merge a master**

```bash
git checkout master && git merge --ff-only sandbox && git push
```

---

## Cobertura de la spec

| Requisito de la spec | Tarea |
|---|---|
| Captura en el turno, escrita por n8n | 1, 8 |
| RPC transaccional única | 7 |
| Ancla fija, filtro por vertical | 7 |
| Umbral calibrado con las 250 históricas | 3 |
| Tablas nuevas, `bodi_conversations`/`lecciones` intactas | 2 |
| Cero policies para `anon` | 2, 9, 15 |
| Panel tras toggle por entorno | 11, 15 |
| Lista por `preguntas_total` desc | 11 |
| Franja "resueltos que siguen preguntándose" | 5, 11 |
| Detalle con preguntas reales y enlace a la conversación | 12 |
| Resolver → `bot_faq` + re-embeber | 4, 12 |
| Relectura de `contenido` antes de escribir | 12 |
| Descartar con motivo | 13 |
| Dividir un vacío | 6, 9, 13 |
| Nuevo nace `pendiente` al dividir uno resuelto | 9, 13 |
| Auditoría con `move` | 13 |
| Badge + resumen diario | 11, 14 |
| Detector de silencio | 5, 9, 11 |
| Cubo de "sin clasificar" | 7, 11 |
| Sin `?? 0` en el render | 10, 11 |
| Módulos puros testeados | 4, 5, 6, 10 |

**Fuera del plan, como manda la spec:** fusionar vacíos, re-anclar, lección nueva y bloques de pasos como destino, borrador por LLM, MCP, lecciones anidadas.
