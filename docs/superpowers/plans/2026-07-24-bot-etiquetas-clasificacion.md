# Sub-proyecto C — Etiquetas y clasificación · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aprovechar la señal determinista `bot_no_info` (de A) en el dashboard BolBot: consolidar dos cards de "Requiere tu atención" en una sola card determinista, y etiquetar en el explorador las conversaciones donde el bot no tuvo información.

**Architecture:** Dos capas. DB: extender dos RPCs de Supabase para exponer `no_info` (agregado por categoría) y `bot_no_info` (por conversación). Frontend: en `js/admin-bot-analytics.js`, reemplazar dos cards por una card consolidada y agregar un badge en el explorador; la lógica de selección de la card se extrae a un módulo puro import-safe con tests.

**Tech Stack:** JS ES-modules vanilla (sin build), `node:test`, Supabase RPC (SQL `create or replace function`).

## Global Constraints

- Rama de trabajo: `sandbox`. No hacer deploy; el usuario aplica las RPCs y aprueba el cierre.
- Campos nuevos en el contrato de datos:
  - `analytics_bot_summary().by_category[i].no_info: number` (conteo de conversaciones con `bot_no_info` en la categoría, en el rango).
  - `analytics_bot_conversations()[i].bot_no_info: boolean` (por conversación).
- La card consolidada **reemplaza exactamente** las dos cards actuales de "Requiere tu atención": 🔗 *Contenido faltante* y ↗ *Escala mucho a soporte*. Se **conservan** 😟 *Tema con sentimiento negativo* y 🔴 *Dudas recurrentes no resueltas ①c*. La sección pasa de 4 a 3 cards.
- La card consolidada NO lleva `llmNote()`: sus tres señales (`no_info`, `support_pct`, `has_lesson`) son deterministas.
- La función pura de selección va en un módulo **nuevo** import-safe (`js/bot-attention.js`). NO en `js/admin-bot-analytics.js`, que usa `document`/`localStorage`/`location` y no importa en Node.
- Reusar lo existente: `attentionCard(...)`, `goToCreateLesson` (atributo `data-gap-cat`), `goToEditLessonByCategory` (atributo `data-edit-cat`) y los listeners ya presentes (no agregar listeners nuevos para la card).
- Sin clases Tailwind nuevas. Estilo de `admin-bot-analytics.js`: indentación 2 espacios, SIN punto y coma.
- Tests: `node --test tests/*.test.mjs`. El warning `MODULE_TYPELESS_PACKAGE_JSON` es esperado en todo el repo y NO es hallazgo.
- Las RPCs se recrean con `drop function if exists ... / create or replace` conservando los `revoke/grant` existentes; las aplica y verifica el usuario en Supabase (el MCP de la sesión no ve el proyecto Bold POS).

---

### Task 1: RPCs — exponer `no_info` y `bot_no_info`

Recrear las dos RPCs con los campos nuevos. **Las aplica el usuario en el SQL Editor de Supabase** (patrón de A); esta tarea entrega los dos `.sql` completos.

**Files:**
- Create: `supabase/migrations/update_analytics_bot_summary_no_info.sql`
- Create: `supabase/migrations/update_analytics_bot_conversations_no_info.sql`

**Interfaces:**
- Consumes: columna `bodi_conversations.bot_no_info` (creada en A).
- Produces: `by_category[i].no_info` (RPC summary) y `[i].bot_no_info` (RPC conversations), consumidos por Tasks 2 y 3.

- [ ] **Step 1: Escribir `update_analytics_bot_summary_no_info.sql`**

Función completa (idéntica a la actual salvo: `bot_no_info` en el CTE `res` y `'no_info', ...` en cada objeto de `by_category`):

```sql
-- analytics_bot_summary + no_info por categoría (Sub-proyecto C).
-- Agrega el conteo de conversaciones con bot_no_info (señal determinista de A)
-- por categoría, para la card consolidada "Contenido por reforzar".
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
drop function if exists public.analytics_bot_summary(timestamptz, timestamptz);
create or replace function public.analytics_bot_summary(
  p_from timestamptz,
  p_to   timestamptz
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with res as (
    select
      support_redirected,
      sentiment,
      status,
      bot_no_info,
      coalesce(category, topic, 'Sin categoría') as cat,
      coalesce(
        resolution_status,
        case when resolved is true then 'resuelta'
             when resolved is false then 'no_resuelta' end
      ) as eff_status,
      started_at
    from bodi_conversations
    where started_at >= p_from and started_at <= p_to
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'total',       (select count(*) from res),
      'resolved',    (select count(*) from res where eff_status = 'resuelta'),
      'unresolved',  (select count(*) from res where eff_status = 'no_resuelta'),
      'ambiguous',   (select count(*) from res where eff_status = 'ambigua'),
      'resolved_pct', (
        select round(100.0 * count(*) filter (where eff_status = 'resuelta')
                      / nullif(count(*) filter (where eff_status in ('resuelta','no_resuelta')), 0))
        from res
      ),
      'abandoned',   (select count(*) from res where status = 'abandoned'),
      'support',     (select count(*) from res where support_redirected),
      'resolved_without_support_pct', (
        select round(100.0 * count(*) filter (where not coalesce(support_redirected, false))
                      / nullif(count(*), 0))
        from res
      ),
      'sentiment_net', (
        select round(100.0 * (count(*) filter (where sentiment = 'positivo')
                              - count(*) filter (where sentiment = 'negativo'))
                      / nullif(count(*), 0))
        from res
      ),
      'sentiment', jsonb_build_object(
        'positivo', (select count(*) from res where sentiment = 'positivo'),
        'neutro',   (select count(*) from res where sentiment = 'neutro' or sentiment is null),
        'negativo', (select count(*) from res where sentiment = 'negativo')
      )
    ),
    'by_category', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'category', cat, 'total', c,
        'resolved_pct', rp, 'negative_pct', np, 'support_pct', sp,
        'no_info', ni, 'dominant_sentiment', dom) order by c desc), '[]'::jsonb)
      from (
        select cat,
               count(*) as c,
               round(100.0 * count(*) filter (where eff_status = 'resuelta')
                     / nullif(count(*) filter (where eff_status in ('resuelta','no_resuelta')), 0)) as rp,
               round(100.0 * count(*) filter (where sentiment = 'negativo') / nullif(count(*), 0)) as np,
               round(100.0 * count(*) filter (where support_redirected) / nullif(count(*), 0)) as sp,
               count(*) filter (where bot_no_info) as ni,
               mode() within group (order by coalesce(sentiment, 'neutro')) as dom
        from res group by cat
      ) t
    ),
    'heatmap', (
      select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'hour', hr, 'count', c) order by dow, hr), '[]'::jsonb)
      from (
        select extract(dow from started_at at time zone 'America/Tegucigalpa')::int as dow,
               extract(hour from started_at at time zone 'America/Tegucigalpa')::int as hr,
               count(*) as c
        from res group by 1, 2
      ) t
    )
  );
$$;

revoke execute on function public.analytics_bot_summary(timestamptz, timestamptz) from public, anon;
grant  execute on function public.analytics_bot_summary(timestamptz, timestamptz) to authenticated;
```

- [ ] **Step 2: Escribir `update_analytics_bot_conversations_no_info.sql`**

Función completa (idéntica a la actual salvo: `bot_no_info` agregado a las columnas del CTE `res`; el `to_jsonb(r)` lo propaga solo):

```sql
-- analytics_bot_conversations + bot_no_info por fila (Sub-proyecto C).
-- Expone la señal determinista bot_no_info (de A) en el explorador para el
-- badge "Sin info". Ejecutar UNA sola vez en el SQL Editor de Supabase.
drop function if exists public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int);
create or replace function public.analytics_bot_conversations(
  p_from      timestamptz,
  p_to        timestamptz,
  p_status    text default null,
  p_sentiment text default null,
  p_support   boolean default null,
  p_category  text default null,
  p_search    text default null,
  p_limit     int default 100
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with res as (
    select
      id, started_at, ended_at, status, sentiment, support_redirected,
      bot_no_info,
      messages, lessons_used, summary,
      coalesce(category, topic, 'Sin categoría') as cat,
      coalesce(resolution_status,
        case when resolved is true then 'resuelta'
             when resolved is false then 'no_resuelta' end) as eff_status,
      (select m->>'content'
         from jsonb_array_elements(messages) m
        where m->>'role' = 'user'
        limit 1) as first_user_msg
    from bodi_conversations
    where started_at >= p_from and started_at <= p_to
      and (p_sentiment is null or sentiment = p_sentiment)
      and (p_support  is null or coalesce(support_redirected, false) = p_support)
      and (p_category is null or coalesce(category, topic, 'Sin categoría') = p_category)
      and (p_search   is null or messages::text ilike '%' || p_search || '%')
      and (p_status   is null or coalesce(resolution_status,
             case when resolved is true then 'resuelta'
                  when resolved is false then 'no_resuelta' end) = p_status)
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at desc), '[]'::jsonb)
  from (select * from res order by started_at desc limit p_limit) r;
$$;
revoke execute on function public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int) from public, anon;
grant  execute on function public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int) to authenticated;
```

- [ ] **Step 3: Pedir al usuario que aplique ambas RPCs y verificar**

Mostrar los dos `.sql` y pedir que los ejecute en el SQL Editor de Supabase (proyecto Bold POS). Verificación (el usuario pega en el SQL Editor):

```sql
select (analytics_bot_summary(now() - interval '365 days', now())->'by_category'->0) ? 'no_info' as summary_ok,
       (analytics_bot_conversations(now() - interval '365 days', now(), null, null, null, null, null, 1)->0) ? 'bot_no_info' as convs_ok;
```

Expected: `summary_ok = true` y `convs_ok = true` (ambas RPCs devuelven los campos nuevos). Esperar confirmación antes de dar por hecha la tarea.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/update_analytics_bot_summary_no_info.sql supabase/migrations/update_analytics_bot_conversations_no_info.sql
git commit -m "chore: RPCs exponen no_info por categoría y bot_no_info por conversación (sub-proyecto C)"
```

---

### Task 2: Módulo puro `js/bot-attention.js` (selección de la card)

Función pura, import-safe en Node, que elige la categoría más urgente de reforzar. Sin DOM.

**Files:**
- Create: `js/bot-attention.js`
- Test: `tests/bot-attention.test.mjs`

**Interfaces:**
- Consumes: `by_category` (de `analytics_bot_summary`, con `no_info`/`support_pct`/`category`) y `gaps` (de `content_gaps`, con `category`/`has_lesson`).
- Produces: `pickContentToReinforce(byCategory, gaps) => { category: string, noInfo: number, supportPct: number, hasLesson: boolean, action: 'create'|'reinforce' } | null`. Devuelve `null` si ninguna categoría tiene `no_info > 0`.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/bot-attention.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { pickContentToReinforce } from '../js/bot-attention.js'

const GAPS = [
  { category: 'Impresora', has_lesson: false },
  { category: 'Ventas', has_lesson: true },
]

test('elige la categoría con más no_info', () => {
  const by = [
    { category: 'Ventas', no_info: 2, support_pct: 10 },
    { category: 'Impresora', no_info: 5, support_pct: 40 },
  ]
  const r = pickContentToReinforce(by, GAPS)
  assert.equal(r.category, 'Impresora')
  assert.equal(r.noInfo, 5)
  assert.equal(r.supportPct, 40)
})

test("action 'create' cuando la categoría no tiene lección", () => {
  const by = [{ category: 'Impresora', no_info: 3, support_pct: 0 }]
  const r = pickContentToReinforce(by, GAPS)
  assert.equal(r.hasLesson, false)
  assert.equal(r.action, 'create')
})

test("action 'reinforce' cuando la categoría ya tiene lección", () => {
  const by = [{ category: 'Ventas', no_info: 4, support_pct: 20 }]
  const r = pickContentToReinforce(by, GAPS)
  assert.equal(r.hasLesson, true)
  assert.equal(r.action, 'reinforce')
})

test('categoría ausente en gaps → action create', () => {
  const by = [{ category: 'Reportes', no_info: 1, support_pct: 0 }]
  const r = pickContentToReinforce(by, GAPS)
  assert.equal(r.hasLesson, false)
  assert.equal(r.action, 'create')
})

test('null cuando ninguna categoría tiene no_info > 0', () => {
  const by = [
    { category: 'Ventas', no_info: 0, support_pct: 10 },
    { category: 'Impresora', support_pct: 40 },
  ]
  assert.equal(pickContentToReinforce(by, GAPS), null)
})

test('entradas vacías/indefinidas → null', () => {
  assert.equal(pickContentToReinforce([], []), null)
  assert.equal(pickContentToReinforce(undefined, undefined), null)
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/bot-attention.test.mjs`
Expected: FAIL — `Cannot find module '../js/bot-attention.js'`.

- [ ] **Step 3: Escribir la implementación mínima**

Crear `js/bot-attention.js`:

```js
// Lógica pura de la card "Contenido por reforzar" del dashboard BolBot.
// Import-safe en Node: sin DOM. Testeable con node:test.
//
// Elige la categoría más urgente de reforzar por falta de contenido: rankea
// by_category por no_info (señal determinista de A) y cruza con gaps
// (content_gaps) para saber si ya existe lección → crear vs reforzar.
export function pickContentToReinforce(byCategory, gaps) {
  const ranked = (byCategory || [])
    .filter(c => (c.no_info || 0) > 0)
    .sort((a, b) => (b.no_info || 0) - (a.no_info || 0))
  const top = ranked[0]
  if (!top) return null
  const gap = (gaps || []).find(g => g.category === top.category)
  const hasLesson = gap ? gap.has_lesson === true : false
  return {
    category: top.category,
    noInfo: top.no_info,
    supportPct: top.support_pct ?? 0,
    hasLesson,
    action: hasLesson ? 'reinforce' : 'create',
  }
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/bot-attention.test.mjs`
Expected: PASS — 6 tests.

- [ ] **Step 5: Correr la suite completa**

Run: `node --test tests/*.test.mjs`
Expected: PASS — todos los archivos verdes.

- [ ] **Step 6: Commit**

```bash
git add js/bot-attention.js tests/bot-attention.test.mjs
git commit -m "feat: módulo puro bot-attention.js (selección de card Contenido por reforzar)"
```

---

### Task 3: Cablear card consolidada y badge en `js/admin-bot-analytics.js`

Reemplazar las dos cards por la card consolidada (usando `pickContentToReinforce`) y agregar el badge "Sin info" en el explorador.

**Files:**
- Modify: `js/admin-bot-analytics.js` — import (cabecera); bloque `attention` (~L55-72); `convRows` (~L177-184).

**Interfaces:**
- Consumes: `pickContentToReinforce` de `js/bot-attention.js` (Task 2); `summary.by_category[i].no_info` y `conv.bot_no_info` de las RPCs (Task 1).
- Produces: card "Contenido por reforzar" cableada a los listeners existentes; badge "Sin info" en cada fila.

> **Nota:** `admin-bot-analytics.js` usa `document`/`localStorage`/`location` y no es import-safe en Node → esta tarea no lleva unit test propio (la lógica testeable vive en Task 2). Verificación = la suite sigue verde + revisión del cableado + navegador.

- [ ] **Step 1: Importar la función pura**

Añadir junto a los imports existentes de la cabecera (donde se importa de `./analytics-api.js` / `./analytics-ui.js`):

```js
import { pickContentToReinforce } from './bot-attention.js'
```

- [ ] **Step 2: Reemplazar las dos cards por la card consolidada**

En `renderBotAnalytics`, en el bloque que hoy calcula `negCat`/`supCat`/`gapNoLesson` y arma `attention` (~L52-72), quitar el cálculo de `supCat` y `gapNoLesson`, calcular `reinforce`, y reemplazar las dos cards (🔗 *Contenido faltante* y ↗ *Escala mucho a soporte*) por una sola. El resultado del bloque queda así:

```js
  // Capa ② — Requiere atención (señales accionables)
  const negCat = summary.by_category.filter(c => c.negative_pct >= 30).sort((a, b) => b.negative_pct - a.negative_pct)[0]
  const reinforce = pickContentToReinforce(summary.by_category, gaps)
  const attention = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
      ${reinforce
        ? attentionCard('📚', 'Contenido por reforzar',
            `"${escapeHtml(reinforce.category)}": ${reinforce.noInfo} sin-info · ${reinforce.supportPct}% escala a soporte.`,
            reinforce.action === 'create' ? '→ Crear lección' : '→ Reforzar contenido', 'warning',
            reinforce.action === 'create'
              ? `data-gap-cat="${escapeHtml(reinforce.category)}"`
              : `data-edit-cat="${escapeHtml(reinforce.category)}"`)
        : attentionCard('📚', 'Contenido por reforzar', 'Sin huecos de información en el rango.', '', 'warning', '')}
      ${attentionCard('😟', 'Tema con sentimiento negativo',
        negCat ? `"${escapeHtml(negCat.category)}" — ${negCat.negative_pct}% negativo.` : 'Nada crítico.',
        negCat ? '→ Revisar respuesta / lección' : '', 'error',
        negCat ? `data-edit-cat="${escapeHtml(negCat.category)}"` : '')}
      ${attentionCard('🔴', 'Dudas recurrentes no resueltas ' + llmNote(),
        'Se prioriza con clustering del LLM (①c). Hoy: ver explorador filtrado por "No resuelta".',
        '', 'error', '')}
    </div>`
```

- [ ] **Step 3: Agregar el badge "Sin info" en `convRows`**

En `convRows` (~L177-184), tras el badge "Escaló", agregar:

```js
      ${c.bot_no_info ? '<span class="text-[10px] px-2 rounded-full border border-[var(--warning-150)] text-[var(--warning-150)]">Sin info</span>' : ''}
```

La fila queda (contexto):

```js
    <div class="bot-conv-row px-3 py-2 border-b border-[var(--blue-10)] cursor-pointer text-xs flex items-center gap-2" data-idx="${i}">
      <span class="flex-1 text-[var(--black-100)]">${escapeHtml((c.first_user_msg || '(sin mensaje)').slice(0, 90))}</span>
      ${c.sentiment === 'negativo' ? '<span class="text-[10px] px-2 rounded-full border border-[var(--error-100)] text-[var(--error-100)]">Neg</span>' : ''}
      ${c.support_redirected ? '<span class="text-[10px] px-2 rounded-full border border-[var(--warning-150)] text-[var(--warning-150)]">Escaló</span>' : ''}
      ${c.bot_no_info ? '<span class="text-[10px] px-2 rounded-full border border-[var(--warning-150)] text-[var(--warning-150)]">Sin info</span>' : ''}
      <span class="text-[var(--black-40)]">${escapeHtml(c.cat)}</span>
    </div>
```

- [ ] **Step 4: Verificar sintaxis y suite**

Run: `node --check js/admin-bot-analytics.js && node --test tests/*.test.mjs`
Expected: sin error de sintaxis; suite verde (esta tarea no añade tests, confirma que no rompió imports/parseo).

- [ ] **Step 5: Commit**

```bash
git add js/admin-bot-analytics.js
git commit -m "feat: card consolidada 'Contenido por reforzar' + badge 'Sin info' en el explorador (sub-proyecto C)"
```

---

## Notas de verificación final

- **Navegador (tras aplicar las RPCs):** /admin → analytics → BolBot: la card "Contenido por reforzar" muestra la categoría con más sin-info y el botón correcto (crear si no hay lección, reforzar si sí); el explorador muestra el badge "Sin info" en las conversaciones con `bot_no_info`; "Requiere tu atención" tiene 3 cards.
- **Datos incrementales:** `no_info`/`bot_no_info` solo se llenan con conversaciones nuevas (A ya en prod). Al inicio la card puede decir "Sin huecos…" hasta que se acumulen datos.
- **Fuera de alcance:** filtro "Sin info" en el explorador; card 😟 y 🔴; barra de satisfacción e insights (D); estados de ciclo de vida (B); evaluación LLM (①c).
