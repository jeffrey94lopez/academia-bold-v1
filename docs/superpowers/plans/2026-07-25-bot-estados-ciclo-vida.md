# Sub-proyecto B — Estados de ciclo de vida · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que toda conversación del BolBot termine en un estado final conocido (cerrada por el cliente / abandonada / escalada) y que el dashboard lo muestre, cerrando el bug de conversaciones que quedan `active` para siempre.

**Architecture:** `bodi_conversations.status` sigue guardando el estado de vuelo (`active`/`completed`/`abandoned`) y el estado final `lifecycle` se **deriva** en los RPCs con la regla "escalada gana" — así funciona retroactivo y no hay carreras de escritura. Una columna nueva `last_activity_at` habilita el barrido: una función SQL agendada con `pg_cron` es la **única** que cierra por inactividad. El navegador solo avisa (separador de sistema a los 5 min, una vez) y nunca cierra, porque cerrar en cliente fragmenta conversaciones.

**Tech Stack:** SQL/plpgsql + `pg_cron` en Supabase, JS ES-modules vanilla (sin build), `node:test`, Tailwind (clases existentes) + CSS con tokens de `css/style.css`.

## Global Constraints

- Rama de trabajo: `sandbox`. Spec: `docs/superpowers/specs/2026-07-25-bot-estados-ciclo-vida-design.md`.
- Estilo del repo: indentación 2 espacios, **sin punto y coma**, sin clases Tailwind nuevas (reusar las existentes).
- Convención de settings: `app_settings` con `key`/`value` **text**; clave ausente, vacía o inválida ⇒ **default** (nunca reventar).
- Defaults exactos: `inactividad_aviso_min` = **5** (`0` apaga el aviso), `inactividad_cierre_min` = **30**. Barrido cada **10 minutos**.
- Nombres exactos de los valores de `lifecycle`: `cerrada_cliente`, `abandonada`, `escalada`, `en_curso`.
- El parámetro del filtro de ciclo de vida se llama **`p_lifecycle`**. `p_status` YA significa calidad (`resolution_status`) — no reusarlo.
- Colores exactos de la barra: cerradas `bg-[var(--success-150)]` (texto blanco), abandonadas `bg-[var(--black-10)]` (texto `var(--black-60)`), escaladas `bg-[var(--warning-150)]` (texto blanco).
- Las migraciones NO se aplican desde el código: se escriben en `supabase/migrations/` y el usuario las corre a mano en el SQL Editor (convención: "ejecutar UNA sola vez").
- Tests: `node --test tests/*.test.mjs`. El warning `MODULE_TYPELESS_PACKAGE_JSON` es esperado en todo el repo y **NO** es hallazgo.
- Los archivos `admin*.js` y `assistant.js` usan `document`/`localStorage` y **no son import-safe en Node** → no llevan unit test propio; se verifican con `node --check` + navegador.

## File Structure

- `supabase/migrations/add_conversation_lifecycle.sql` — **Create:** `last_activity_at` + backfill + índice parcial + `close_stale_conversations()` + agendado pg_cron.
- `supabase/migrations/update_analytics_bot_summary_lifecycle.sql` — **Create:** el RPC expone `kpis.lifecycle`.
- `supabase/migrations/update_analytics_bot_conversations_lifecycle.sql` — **Create:** el RPC expone `lifecycle` por fila + parámetro `p_lifecycle`.
- `js/inactivity.js` — **Create:** módulo puro (settings + detección de conversación vencida).
- `tests/inactivity.test.mjs` — **Create:** unit tests del módulo puro.
- `css/style.css` — **Modify:** estilos del separador de inactividad.
- `js/assistant.js` — **Modify:** temporizador, separador, `last_activity_at`, guard de conversación vencida; **borrar** `ABANDON_URL` y el `beforeunload`.
- `js/live-updates.js` — **Modify:** recargar los minutos por realtime (import + `onSettingsChange`).
- `js/admin.js` — **Modify:** los dos campos numéricos + handler `.setting-number`.
- `js/analytics-ui.js` — **Modify:** extraer `stackedBar` interno, reescribir `sentimentBar` sobre él, agregar `lifecycleBar`.
- `tests/analytics-ui.test.mjs` — **Modify:** agregar tests de `lifecycleBar` (los 4 de `sentimentBar` NO se tocan).
- `js/analytics-api.js` — **Modify:** pasar `p_lifecycle`.
- `js/admin-bot-analytics.js` — **Modify:** card nueva, badge, chips de filtro, columna CSV.

**Orden obligatorio:** Task 1 → Task 2 (datos primero: sin RPCs no hay `lifecycle` que consumir) → Tasks 3-5 (rescate) → Tasks 6-7 (dashboard). Tasks 3 y 6 son independientes entre sí. **Task 4 y Task 5 tocan archivos distintos** y pueden ir en cualquier orden después de Task 3.

---

### Task 1: Migración de datos y barrido con pg_cron

Agrega la marca de última actividad, el índice del barrido, la función que cierra las inactivas y su agendado. Su primera corrida manual **es el backfill del histórico**: cierra como abandonadas todas las filas `active` viejas.

**Files:**
- Create: `supabase/migrations/add_conversation_lifecycle.sql`

**Interfaces:**
- Produces: columna `bodi_conversations.last_activity_at timestamptz` (default `now()`); función `public.close_stale_conversations() returns int` (devuelve cuántas cerró). Consumido por Task 2 (deriva `lifecycle` de `status`), Task 4 (escribe `last_activity_at`) y la verificación manual.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/add_conversation_lifecycle.sql`:

```sql
-- Sub-proyecto B — ciclo de vida de las conversaciones del BolBot.
-- Agrega la marca de última actividad, el índice del barrido, la función que
-- cierra las conversaciones inactivas y su agendado con pg_cron.
--
-- PRERREQUISITO MANUAL: prender la extensión pg_cron en el dashboard de
-- Supabase (Database → Extensions). Si no está prendida, la primera línea
-- falla ruidosamente y NO hay que continuar: sin el agendado, el barrido
-- nunca corre y las conversaciones vuelven a quedar 'active' para siempre.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

create extension if not exists pg_cron;

-- 1. Marca de última actividad. Backfill: las filas viejas no tienen mejor
--    dato que su ended_at (si cerraron) o su started_at — los mensajes en
--    messages no guardan timestamp.
alter table public.bodi_conversations
  add column if not exists last_activity_at timestamptz;

update public.bodi_conversations
   set last_activity_at = coalesce(ended_at, started_at)
 where last_activity_at is null;

alter table public.bodi_conversations
  alter column last_activity_at set default now();

-- 2. Índice del barrido: solo indexa lo vivo, calza exacto con el predicado.
create index if not exists idx_bodi_conv_stale
  on public.bodi_conversations (last_activity_at)
  where status = 'active';

-- 3. El barrido. Devuelve cuántas cerró para poder verificar a mano sin
--    esperar al agendado. ended_at = last_activity_at (la hora honesta en que
--    el usuario dejó de escribir), NO now(), que inflaría toda duración.
create or replace function public.close_stale_conversations() returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min   int;
  v_count int;
begin
  -- El guard del regex es deliberado: si alguien escribe "treinta" en el
  -- admin, cae al default en vez de reventar y dejar de correr para siempre.
  select coalesce(
    (select value::int from app_settings
      where key = 'inactividad_cierre_min' and value ~ '^[0-9]+$'),
    30) into v_min;

  update bodi_conversations
     set status   = 'abandoned',
         ended_at = last_activity_at
   where status = 'active'
     and last_activity_at < now() - make_interval(mins => v_min);

  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.close_stale_conversations() from public, anon;

-- 4. Agendado cada 10 min. El unschedule previo hace el archivo re-ejecutable
--    sin dejar dos jobs con el mismo nombre.
select cron.unschedule('cerrar-conversaciones-inactivas')
 where exists (select 1 from cron.job where jobname = 'cerrar-conversaciones-inactivas');

select cron.schedule('cerrar-conversaciones-inactivas', '*/10 * * * *',
  $$select public.close_stale_conversations()$$);
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/add_conversation_lifecycle.sql
git commit -m "chore: migración de ciclo de vida (last_activity_at + barrido pg_cron)"
```

- [ ] **Step 3: Pedirle al usuario que la aplique y verifique**

**PARAR acá y pedirle al usuario** (el agente NO tiene acceso al proyecto Supabase de Bold POS):

> 1. Prender `pg_cron` en Supabase → Database → Extensions.
> 2. Correr el contenido de `supabase/migrations/add_conversation_lifecycle.sql` en el SQL Editor.
> 3. Correr estas cuatro verificaciones y pegar los resultados:

```sql
-- a) el backfill no dejó filas sin marca → debe dar 0
select count(*) as sin_marca from bodi_conversations where last_activity_at is null;

-- b) el barrido corre y cierra el histórico → devuelve un entero (probablemente alto)
select public.close_stale_conversations();

-- c) el agendado quedó registrado → una fila con schedule '*/10 * * * *'
select jobname, schedule, active from cron.job
 where jobname = 'cerrar-conversaciones-inactivas';

-- d) cómo quedó repartido el histórico
select status, count(*) from bodi_conversations group by status order by 2 desc;
```

Expected: (a) `0`; (b) un entero ≥ 0 — si el histórico tenía muchas `active`, este número es alto y **eso es correcto**, es el backfill; (c) una fila con `active = true`; (d) ya casi no quedan `active` (solo las de los últimos 30 min).

**No avanzar a Task 2 sin la confirmación del usuario.** Si (b) devuelve error de permisos sobre `app_settings`, revisar que la función quedó con `security definer`.

---

### Task 2: Los dos RPCs exponen `lifecycle`

`analytics_bot_summary` suma `kpis.lifecycle` (los cuatro conteos) y `analytics_bot_conversations` suma `lifecycle` por fila más el filtro `p_lifecycle`. La regla "escalada gana" vive acá, en SQL, y por eso funciona retroactivo.

**Files:**
- Create: `supabase/migrations/update_analytics_bot_summary_lifecycle.sql`
- Create: `supabase/migrations/update_analytics_bot_conversations_lifecycle.sql`

**Interfaces:**
- Consumes: `status` y `support_redirected` de `bodi_conversations` (Task 1 no cambia ninguna de las dos).
- Produces: `analytics_bot_summary().kpis.lifecycle = { cerrada_cliente, abandonada, escalada, en_curso }` (cuatro enteros) — consumido por Task 7. `analytics_bot_conversations()[i].lifecycle` (string con uno de los cuatro valores) y el parámetro `p_lifecycle text default null` — consumidos por Task 7.

- [ ] **Step 1: Escribir la migración del summary**

Crear `supabase/migrations/update_analytics_bot_summary_lifecycle.sql`. Es el archivo `update_analytics_bot_summary_no_info.sql` **completo** más el `lifecycle` derivado en el CTE y el bloque `kpis.lifecycle`; todo lo demás queda idéntico (incluido `kpis.abandoned`, que se conserva para no romper consumidores):

```sql
-- analytics_bot_summary + kpis.lifecycle (Sub-proyecto B).
-- Deriva el estado final de cada conversación con la regla "escalada gana" y
-- devuelve los cuatro conteos. Es derivado, no una columna: funciona sobre
-- todo el histórico sin backfill.
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
      case when support_redirected   then 'escalada'
           when status = 'completed' then 'cerrada_cliente'
           when status = 'abandoned' then 'abandonada'
           else 'en_curso' end as lifecycle,
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
      'lifecycle', jsonb_build_object(
        'cerrada_cliente', (select count(*) from res where lifecycle = 'cerrada_cliente'),
        'abandonada',      (select count(*) from res where lifecycle = 'abandonada'),
        'escalada',        (select count(*) from res where lifecycle = 'escalada'),
        'en_curso',        (select count(*) from res where lifecycle = 'en_curso')
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

- [ ] **Step 2: Escribir la migración del explorador**

Crear `supabase/migrations/update_analytics_bot_conversations_lifecycle.sql`. Dos cosas para no equivocarse: el `drop function` lleva la firma **vieja** (8 parámetros) y el `p_lifecycle` nuevo va **al final** de la nueva.

**El filtro de `p_lifecycle` NO va en el `where` del CTE**, a diferencia de los demás. Va en el `select * from res` interno, que sí puede referenciar el alias `lifecycle` del CTE. Semántica idéntica (filtra antes del `limit`) y evita escribir la expresión `case` dos veces — que es lo que hace hoy `p_status`, y no hay razón para repetir esa duplicación en código nuevo.

```sql
-- analytics_bot_conversations + lifecycle por fila y filtro p_lifecycle
-- (Sub-proyecto B). p_status YA significa calidad (resolution_status): el
-- filtro de ciclo de vida es un parámetro APARTE, no se reusa ese.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
drop function if exists public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int);
create or replace function public.analytics_bot_conversations(
  p_from      timestamptz,
  p_to        timestamptz,
  p_status    text default null,
  p_sentiment text default null,
  p_support   boolean default null,
  p_category  text default null,
  p_search    text default null,
  p_limit     int default 100,
  p_lifecycle text default null
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
      case when support_redirected   then 'escalada'
           when status = 'completed' then 'cerrada_cliente'
           when status = 'abandoned' then 'abandonada'
           else 'en_curso' end as lifecycle,
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
  from (
    select * from res
     where p_lifecycle is null or lifecycle = p_lifecycle
     order by started_at desc
     limit p_limit
  ) r;
$$;
revoke execute on function public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int, text) from public, anon;
grant  execute on function public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int, text) to authenticated;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/update_analytics_bot_summary_lifecycle.sql supabase/migrations/update_analytics_bot_conversations_lifecycle.sql
git commit -m "chore: RPCs derivan lifecycle y aceptan p_lifecycle (sub-proyecto B)"
```

- [ ] **Step 4: Pedirle al usuario que las aplique y verifique**

**PARAR acá y pedirle al usuario** que corra los dos archivos en el SQL Editor (primero el del summary, después el de conversations) y luego estas verificaciones:

```sql
-- a) el summary trae los cuatro conteos
select analytics_bot_summary(now() - interval '365 days', now()) -> 'kpis' -> 'lifecycle';

-- b) los tres finales + en_curso suman el total del rango
with k as (select analytics_bot_summary(now() - interval '365 days', now()) -> 'kpis' as j)
select (j->>'total')::int as total,
       (j->'lifecycle'->>'cerrada_cliente')::int
     + (j->'lifecycle'->>'abandonada')::int
     + (j->'lifecycle'->>'escalada')::int
     + (j->'lifecycle'->>'en_curso')::int as suma
from k;

-- c) el filtro nuevo funciona y las filas traen lifecycle
select jsonb_array_length(analytics_bot_conversations(
  now() - interval '365 days', now(), null, null, null, null, null, 100, 'abandonada')) as abandonadas;
```

Expected: (a) un objeto con las cuatro claves; (b) `total` = `suma` **exactamente** (si no coinciden, la derivación tiene un hueco); (c) un entero ≥ 0.

**No avanzar sin la confirmación del usuario.** Nota histórica de C: la migración de `conversations` requirió un segundo intento — si falla la primera vez, reintentar antes de investigar.

---

### Task 3: Módulo puro `js/inactivity.js` + tests

Las dos funciones puras del rescate: leer los minutos configurados y decidir si una conversación ya venció.

**Files:**
- Create: `js/inactivity.js`
- Test: `tests/inactivity.test.mjs`

**Interfaces:**
- Produces:
  - `inactivitySettings(rows) => { avisoMs, cierreMs }`. `rows` = filas `{key, value}` de `app_settings` (array; `null`/`undefined` acepta). Devuelve **milisegundos**. Clave ausente, vacía, negativa o no numérica ⇒ default (`aviso` 5 min, `cierre` 30 min). `aviso = '0'` ⇒ `avisoMs = 0` (apagado).
  - `isStaleConversation(lastActivityMs, nowMs, cierreMs) => boolean`. `true` si el hueco ya alcanzó el umbral de cierre. Consumidos por Task 4.

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/inactivity.test.mjs`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { inactivitySettings, isStaleConversation } from '../js/inactivity.js'

const MIN = 60000

test('lee los minutos configurados y los devuelve en ms', () => {
  const s = inactivitySettings([
    { key: 'inactividad_aviso_min', value: '3' },
    { key: 'inactividad_cierre_min', value: '45' },
  ])
  assert.equal(s.avisoMs, 3 * MIN)
  assert.equal(s.cierreMs, 45 * MIN)
})

test('claves ausentes caen a los defaults 5 y 30', () => {
  const s = inactivitySettings([])
  assert.equal(s.avisoMs, 5 * MIN)
  assert.equal(s.cierreMs, 30 * MIN)
})

test('entrada nula no lanza y da defaults', () => {
  let s
  assert.doesNotThrow(() => { s = inactivitySettings(null) })
  assert.equal(s.avisoMs, 5 * MIN)
  assert.equal(s.cierreMs, 30 * MIN)
})

test('valores inválidos caen al default en vez de reventar', () => {
  for (const bad of ['', '  ', 'treinta', '-5', '2.5', 'NaN']) {
    const s = inactivitySettings([{ key: 'inactividad_cierre_min', value: bad }])
    assert.equal(s.cierreMs, 30 * MIN, `"${bad}" debería caer al default`)
  }
})

test('aviso en 0 apaga el aviso', () => {
  const s = inactivitySettings([{ key: 'inactividad_aviso_min', value: '0' }])
  assert.equal(s.avisoMs, 0)
})

test('isStaleConversation: dentro del umbral es false', () => {
  const now = 1_000_000
  assert.equal(isStaleConversation(now - 10 * MIN, now, 30 * MIN), false)
})

test('isStaleConversation: pasado el umbral es true', () => {
  const now = 1_000_000
  assert.equal(isStaleConversation(now - 40 * MIN, now, 30 * MIN), true)
})

test('isStaleConversation: el borde exacto cuenta como vencida', () => {
  const now = 1_000_000
  assert.equal(isStaleConversation(now - 30 * MIN, now, 30 * MIN), true)
})

test('isStaleConversation: sin última actividad no lanza y es false', () => {
  assert.equal(isStaleConversation(0, 1_000_000, 30 * MIN), false)
  assert.equal(isStaleConversation(undefined, 1_000_000, 30 * MIN), false)
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/inactivity.test.mjs`
Expected: FAIL — no existe `js/inactivity.js` (error de import).

- [ ] **Step 3: Escribir la implementación mínima**

Crear `js/inactivity.js`:

```js
// Sub-proyecto B — lógica pura del rescate por inactividad del chat.
// Import-safe (sin DOM, sin timers): el temporizador y el separador viven en
// assistant.js. Acá solo vive lo que se puede testear en aislamiento.

const AVISO_MIN_DEFAULT  = 5
const CIERRE_MIN_DEFAULT = 30

// Lee los minutos de app_settings y los devuelve en ms. Convención del
// proyecto: clave ausente, vacía o no numérica ⇒ default (nunca reventar).
// aviso = 0 apaga el aviso.
export function inactivitySettings(rows) {
  const map = Object.fromEntries((rows || []).map(r => [r.key, r.value]))
  const minutes = (key, fallback) => {
    const raw = map[key]
    if (typeof raw !== 'string' || !/^\d+$/.test(raw.trim())) return fallback
    return parseInt(raw.trim(), 10)
  }
  return {
    avisoMs:  minutes('inactividad_aviso_min',  AVISO_MIN_DEFAULT)  * 60000,
    cierreMs: minutes('inactividad_cierre_min', CIERRE_MIN_DEFAULT) * 60000,
  }
}

// true si el hueco desde la última actividad ya alcanzó el umbral de cierre:
// el cron pudo haberla marcado como abandonada, así que NO hay que escribirle
// encima (la resucitaría con mensajes nuevos). Se arranca fila nueva.
export function isStaleConversation(lastActivityMs, nowMs, cierreMs) {
  if (!lastActivityMs || !cierreMs) return false
  return (nowMs - lastActivityMs) >= cierreMs
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/inactivity.test.mjs`
Expected: PASS — 9 tests.

- [ ] **Step 5: Correr la suite completa**

Run: `node --test tests/*.test.mjs`
Expected: PASS — todos los archivos verdes (59 previos + 9 nuevos = 68).

- [ ] **Step 6: Commit**

```bash
git add js/inactivity.js tests/inactivity.test.mjs
git commit -m "feat: módulo puro inactivity.js (settings + conversación vencida)"
```

---

### Task 4: Cablear el rescate en el chat

El separador de sistema a los N minutos (una sola vez, sin persistir), el `last_activity_at` en cada PATCH, el guard de conversación vencida, y borrar el beacon muerto.

**Files:**
- Modify: `css/style.css` — agregar el bloque de estilos del separador al final.
- Modify: `js/assistant.js` — import (~L7); borrar `ABANDON_URL` (L10) y el `beforeunload` (L142-145); estado de módulo (~L86-89); `loadInactivitySettings` + llamarla en `renderAssistant` (~L150); helpers del temporizador; `resolveConversation` (L131-140); `sendMessage` (~L595-670).
- Modify: `js/live-updates.js` — import (L6) y `onSettingsChange` (L69), para que cambiar los minutos en el admin tenga efecto sin recargar.

**Interfaces:**
- Consumes: `inactivitySettings(rows)` e `isStaleConversation(lastActivityMs, nowMs, cierreMs)` de `js/inactivity.js` (Task 3); columna `last_activity_at` (Task 1).

> **Nota:** `assistant.js` usa `document`/`localStorage` y no es import-safe en Node → esta tarea no lleva unit test propio. Verificación = `node --check` + suite verde + navegador.

- [ ] **Step 1: Agregar los estilos del separador**

Al final de `css/style.css`, agregar:

```css
/* ── Aviso de inactividad (separador de sistema, sub-proyecto B) ─────────────
   NO es una burbuja: corta el hilo para que se lea como aviso del sistema y
   no como un mensaje del bot. */
.idle-notice {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--space-2) 0;
}
.idle-divider {
  display: flex;
  align-items: center;
  gap: 8px;
}
.idle-divider::before,
.idle-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--blue-20);
}
.idle-divider span {
  font-family: var(--font-family);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--black-60);
  white-space: nowrap;
}
.idle-sub {
  text-align: center;
  font-family: var(--font-family);
  font-size: 11px;
  color: var(--black-40);
}
.idle-actions {
  display: flex;
  justify-content: center;
}
.idle-still-here {
  font-family: var(--font-family);
  font-size: 11px;
  font-weight: 800;
  color: var(--blue-100);
  background: transparent;
  border: 1.5px solid var(--blue-100);
  border-radius: var(--radius-full);
  padding: 4px 14px;
  cursor: pointer;
}
.idle-still-here:hover { background: var(--blue-10); }
```

- [ ] **Step 2: Importar el módulo y borrar el beacon muerto**

En `js/assistant.js`, agregar el import después del de `clarify.js` (L7):

```js
import { inactivitySettings, isStaleConversation } from './inactivity.js'
```

**Borrar** la línea 10 completa:

```js
const ABANDON_URL = 'https://n8n.mplasesores.com/webhook/bodi-abandon'
```

**Borrar** el listener completo (L142-145) — con pg_cron es redundante y apunta a un workflow apagado:

```js
window.addEventListener('beforeunload', () => {
  if (!conversationId) return
  navigator.sendBeacon(ABANDON_URL, new Blob([JSON.stringify({ conversationId })], { type: 'application/json' }))
})
```

- [ ] **Step 3: Agregar el estado de módulo y la carga de settings**

En `js/assistant.js`, junto a las otras variables de módulo (después de `let sending = false`, ~L89), agregar:

```js
// Rescate por inactividad (sub-proyecto B). El navegador solo AVISA; el cierre
// lo hace el barrido de pg_cron. Cerrar en cliente fragmentaría una duda real
// en varias filas (al cerrar, el próximo mensaje crea conversación nueva).
let inactivity     = { avisoMs: 5 * 60000, cierreMs: 30 * 60000 }
let lastActivityMs = 0
let idleTimer      = null
let idleNudged     = false   // el aviso sale UNA vez por conversación
```

Y una función de carga análoga a `loadChipSettings` (ponerla justo después de `loadChipSettings`, ~L65):

```js
export async function loadInactivitySettings() {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['inactividad_aviso_min', 'inactividad_cierre_min'])
    if (error) return
    inactivity = inactivitySettings(data)
    // Si el admin acaba de apagar el aviso, matar el temporizador ya armado:
    // si no, el aviso pendiente igual saldría una última vez.
    if (!inactivity.avisoMs) clearIdleTimer()
  } catch (_) { /* mantener los defaults */ }
}
```

En `renderAssistant` (~L150), sumarla al `Promise.all` existente:

```js
  const [chips] = await Promise.all([loadChips(), loadChipSettings(), loadInactivitySettings()])
```

- [ ] **Step 3b: Recargar los minutos en vivo (realtime)**

`js/live-updates.js` ya re-llama `loadChipSettings()` con cada cambio de `app_settings` (debounce de 1500 ms). Sin sumar la nueva ahí, cambiar los minutos en el admin no tendría efecto en un chat abierto hasta recargar la página, que es justamente lo que se quería evitar al hacerlos editables.

En `js/live-updates.js`, **reemplazar** el import de L6:

```js
import { loadFaqContext, rerenderChips, loadChipSettings } from './assistant.js'
```

por:

```js
import { loadFaqContext, rerenderChips, loadChipSettings, loadInactivitySettings } from './assistant.js'
```

Y **reemplazar** L69:

```js
const onSettingsChange  = debounce(() => { loadChipSettings().catch(() => {}) }, 1500)
```

por:

```js
const onSettingsChange  = debounce(() => {
  loadChipSettings().catch(() => {})
  loadInactivitySettings().catch(() => {})
}, 1500)
```

`loadInactivitySettings` tiene que quedar **exportada** en `assistant.js` (Step 3) para que este import funcione.

- [ ] **Step 4: Agregar los helpers del temporizador y el separador**

En `js/assistant.js`, agregar estas cuatro funciones justo antes de `appendResolutionButtons` (~L496):

```js
// ── Rescate por inactividad ──────────────────────────────────────────────────

function clearIdleTimer() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
}

function removeIdleNotice() {
  document.querySelectorAll('.idle-notice').forEach(el => el.remove())
}

// Marca actividad y rearma el temporizador. Se llama al terminar cada
// intercambio y cuando el usuario dice que sigue ahí.
function registerActivity() {
  lastActivityMs = Date.now()
  clearIdleTimer()
  if (!inactivity.avisoMs || idleNudged || !conversationId) return
  idleTimer = setTimeout(appendIdleNotice, inactivity.avisoMs)
}

// Separador de sistema. NO se persiste en messages: es UI, no conversación —
// si se guardara contaminaría el historial que se le manda al LLM.
function appendIdleNotice() {
  const box = document.getElementById('chatMessages')
  if (!box || sending) return   // nunca interrumpir una respuesta en curso
  removeIdleNotice()
  idleNudged = true
  const notice = document.createElement('div')
  notice.className = 'idle-notice'
  notice.innerHTML = `
    <div class="idle-divider"><span>⏱ ¿Sigues ahí?</span></div>
    <p class="idle-sub">El chat se cierra solo en un rato</p>
    <div class="idle-actions"><button class="idle-still-here">Sí, sigo aquí</button></div>`
  notice.querySelector('.idle-still-here').onclick = () => {
    removeIdleNotice()
    registerActivity()
  }
  box.appendChild(notice)
  if (followScroll) scrollToBottom()
}
```

- [ ] **Step 5: Cablear `resolveConversation`**

En `js/assistant.js`, el cuerpo actual de `resolveConversation` (L131-140) termina así:

```js
  await upsertConversation({ resolved, status: 'completed', ended_at: new Date().toISOString() })
  conversationId  = null
  sessionMessages = []
}
```

Reemplazar por (se apaga el temporizador y se limpia el aviso, y la marca de actividad queda coherente con el cierre):

```js
  const nowIso = new Date().toISOString()
  await upsertConversation({ resolved, status: 'completed', ended_at: nowIso, last_activity_at: nowIso })
  clearIdleTimer()
  removeIdleNotice()
  conversationId  = null
  sessionMessages = []
  idleNudged      = false
}
```

- [ ] **Step 6: Cablear `sendMessage`**

En `js/assistant.js`, **inmediatamente antes** de la línea `if (!conversationId) await createConversation()` (~L599), insertar:

```js
  // Si el hueco de inactividad superó el umbral de cierre, el barrido pudo
  // haber marcado esta conversación como abandonada: no le escribimos encima
  // (la resucitaría con mensajes nuevos y el dato quedaría mentiroso).
  if (conversationId && isStaleConversation(lastActivityMs, Date.now(), inactivity.cierreMs)) {
    conversationId  = null
    sessionMessages = []
    idleNudged      = false
  }
  clearIdleTimer()
  removeIdleNotice()

```

Después, en el `upsertConversation` del final del `try` (~L661-669), agregar el campo nuevo. El bloque actual es:

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

Reemplazarlo por:

```js
    await upsertConversation({
      messages: sessionMessages,
      topic: data.topic || null,
      sentiment: data.sentiment ?? 'neutro',
      support_redirected: data.support_redirected || false,
      lessons_used: data.lessons_used || [],
      bot_no_info: data.knowledge_gap || false,
      bot_asked_clarification: data.asked_clarification || false,
      last_activity_at: new Date().toISOString(),
    })
    registerActivity()
```

- [ ] **Step 7: Verificar sintaxis y suite**

Run: `node --check js/assistant.js && node --check js/inactivity.js && node --check js/live-updates.js && node --test tests/*.test.mjs`
Expected: sin error de sintaxis; suite verde (68 tests).

- [ ] **Step 8: Verificar que no quedaron referencias al beacon borrado**

Run: `grep -n "ABANDON_URL\|sendBeacon\|bodi-abandon" js/assistant.js`
Expected: **sin resultados**. Si aparece alguna, el borrado del Step 2 quedó incompleto.

- [ ] **Step 9: Commit**

```bash
git add css/style.css js/assistant.js js/live-updates.js
git commit -m "feat: aviso de inactividad + last_activity_at; quita el beacon muerto de abandono"
```

---

### Task 5: Los dos campos de minutos en el admin

**Files:**
- Modify: `js/admin.js` — query de settings (~L2166-2170); card "Comportamiento" (~L2185-2194); handler nuevo junto al de `.setting-toggle` (~L2246-2257).

**Interfaces:**
- Produces: las claves `inactividad_aviso_min` e `inactividad_cierre_min` en `app_settings`, consumidas por `loadInactivitySettings` (Task 4) y por `close_stale_conversations()` (Task 1).

> **Nota:** `admin.js` no es import-safe en Node → sin unit test. Verificación = `node --check` + navegador.

- [ ] **Step 1: Sumar las dos claves a la query de settings**

En `js/admin.js`, dentro de `renderSuggestionsPanel` (~L2169), la línea actual es:

```js
    .in('key', ['chips_inicio', 'chips_tras_respuesta'])
```

Reemplazar por:

```js
    .in('key', ['chips_inicio', 'chips_tras_respuesta', 'inactividad_aviso_min', 'inactividad_cierre_min'])
```

- [ ] **Step 2: Agregar los dos campos a la card "Comportamiento"**

En `js/admin.js`, dentro del `<div class="space-y-3">` de la card "Comportamiento", **después** del `<label>` de `chips_tras_respuesta` (~L2193) y antes del `</div>` que cierra el `space-y-3`, insertar:

```html
        <label class="flex items-center justify-between gap-3 ${settingsError ? 'opacity-50' : ''}">
          <span class="text-sm font-bold">Avisar por inactividad a los <span class="font-normal text-[var(--black-40)]">(0 = no avisar)</span></span>
          <span class="flex items-center gap-1 shrink-0">
            <input type="number" min="0" max="240" data-setting="inactividad_aviso_min" class="setting-number w-16 px-2 py-1 rounded border border-[var(--blue-20)] text-xs text-right" ${settingsError ? 'disabled' : ''} value="${escapeHtml(settings.inactividad_aviso_min ?? '5')}">
            <span class="text-xs text-[var(--black-40)]">min</span>
          </span>
        </label>
        <label class="flex items-center justify-between gap-3 ${settingsError ? 'opacity-50' : ''}">
          <span class="text-sm font-bold">Cerrar conversación inactiva a los</span>
          <span class="flex items-center gap-1 shrink-0">
            <input type="number" min="1" max="1440" data-setting="inactividad_cierre_min" class="setting-number w-16 px-2 py-1 rounded border border-[var(--blue-20)] text-xs text-right" ${settingsError ? 'disabled' : ''} value="${escapeHtml(settings.inactividad_cierre_min ?? '30')}">
            <span class="text-xs text-[var(--black-40)]">min</span>
          </span>
        </label>
```

- [ ] **Step 3: Agregar el handler `.setting-number`**

En `js/admin.js`, **inmediatamente después** del bloque `.setting-toggle` (que termina en `}))` en ~L2257), insertar:

```js
  // Settings numéricos (minutos de inactividad). Valida entero ≥ 0 y revierte
  // al valor anterior si falla, igual que el handler de los switches.
  document.querySelectorAll('.setting-number').forEach(inp => {
    let prev = inp.value
    inp.addEventListener('change', async () => {
      const n = parseInt(inp.value, 10)
      if (!Number.isInteger(n) || n < 0) {
        inp.value = prev
        showToast('Debe ser un número entero de minutos (0 o más)', 'error')
        return
      }
      const clave = inp.dataset.setting
      const { error } = await supabase.from('app_settings').upsert({ key: clave, value: String(n) })
      if (error) {
        inp.value = prev
        showToast('Error al guardar: ' + error.message, 'error')
        return
      }
      inp.value = String(n)
      prev = String(n)
      logActivity('update', 'bot_setting', clave)
      showToast('Configuración guardada')
    })
  })
```

- [ ] **Step 4: Verificar sintaxis y suite**

Run: `node --check js/admin.js && node --test tests/*.test.mjs`
Expected: sin error de sintaxis; suite verde.

- [ ] **Step 5: Commit**

```bash
git add js/admin.js
git commit -m "feat: minutos de aviso y cierre por inactividad configurables en el admin"
```

---

### Task 6: `lifecycleBar` sobre un helper compartido con `sentimentBar` + tests

`lifecycleBar` es la misma barra apilada que `sentimentBar` con otros colores y etiquetas. En vez de duplicarla, se extrae un helper interno `stackedBar(segments)` y **las dos** pasan a usarlo.

**Decisión del usuario (pre-flight scan, 2026-07-25):** extraer el helper aunque toque `sentimentBar`, que ya está en producción. La red de seguridad son sus 4 tests existentes: el refactor debe dejar su salida **byte-idéntica**, así que si pasan sin tocarlos, el refactor es correcto. **No modificar los tests de `sentimentBar`** — si hay que cambiarlos para que pasen, el refactor está mal.

**Files:**
- Modify: `js/analytics-ui.js` — extraer `stackedBar` (interno, sin exportar), reescribir `sentimentBar` sobre él, agregar `lifecycleBar`.
- Test: `tests/analytics-ui.test.mjs` — agregar casos (el archivo ya existe con 4 tests de `sentimentBar` que NO se tocan).

**Interfaces:**
- Produces: `lifecycleBar(lifecycle) => string` (HTML). `lifecycle = { cerrada_cliente, abandonada, escalada, en_curso }` (campos opcionales; faltantes ⇒ 0). Devuelve la barra apilada de **tres** segmentos sin margen externo. `en_curso` se **excluye** del total y de la barra (no está entre los segmentos). Consumido por Task 7.
- Interno (no exportar): `stackedBar(segments) => string`, con `segments = [{ count, label, colorClass, textClass }]`. El total es la suma de los `count` con `|| 1` para evitar división por cero.
- `sentimentBar(sentiment) => string` **no cambia de firma ni de salida**.

- [ ] **Step 1: Escribir los tests que fallan**

En `tests/analytics-ui.test.mjs`, cambiar la línea del import para agregar `lifecycleBar`:

```js
import { sentimentBar, lifecycleBar } from '../js/analytics-ui.js'
```

Y agregar al final del archivo:

```js
test('lifecycleBar muestra los tres conteos dentro de la barra', () => {
  const html = lifecycleBar({ cerrada_cliente: 120, abandonada: 45, escalada: 18 })
  assert.match(html, />120</)
  assert.match(html, />45</)
  assert.match(html, />18</)
})

test('lifecycleBar excluye en_curso del cálculo de anchos', () => {
  const html = lifecycleBar({ cerrada_cliente: 2, abandonada: 1, escalada: 1, en_curso: 96 })
  assert.match(html, /width:50%/)
  assert.match(html, /width:25%/)
  assert.doesNotMatch(html, />96</)
})

test('lifecycleBar con base cero no lanza y produce anchos 0%', () => {
  let html
  assert.doesNotThrow(() => { html = lifecycleBar({ cerrada_cliente: 0, abandonada: 0, escalada: 0 }) })
  assert.match(html, /width:0%/)
})

test('lifecycleBar con entrada indefinida no lanza', () => {
  assert.doesNotThrow(() => lifecycleBar(undefined))
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `node --test tests/analytics-ui.test.mjs`
Expected: FAIL — `lifecycleBar` no es una función exportada.

- [ ] **Step 3: Escribir la implementación mínima**

En `js/analytics-ui.js`, **reemplazar la función `sentimentBar` completa** (desde su comentario de cabecera hasta su `}` de cierre, hoy las últimas líneas del archivo) por este bloque de tres funciones.

El `stackedBar` produce **exactamente** el mismo HTML que hoy: cada segmento arranca con salto de línea + 6 espacios, y `segments.map(seg).join('')` concatena igual que la interpolación de los tres `seg(...)` seguidos. Por eso los tests de `sentimentBar` pasan sin tocarse.

```js
// Barra apilada genérica con los conteos DENTRO de cada segmento. Interna: la
// comparten sentimentBar y lifecycleBar, que solo difieren en colores y
// etiquetas. Devuelve solo la barra (sin margen); el consumidor la envuelve
// con su propio spacing.
function stackedBar(segments) {
  const total = segments.reduce((sum, s) => sum + s.count, 0) || 1
  const seg = s => `
      <div class="flex items-center justify-center ${s.colorClass} ${s.textClass} text-[10px] font-bold overflow-hidden whitespace-nowrap" style="width:${Math.round(100 * s.count / total)}%" title="${s.count} ${s.label}">${s.count > 0 ? s.count : ''}</div>`
  return `
    <div class="flex h-5 rounded-full overflow-hidden">${segments.map(seg).join('')}
    </div>`
}

// Sentimiento (pos/neu/neg), reusada por el Resumen ejecutivo y el dashboard
// BolBot.
export function sentimentBar(sentiment) {
  const s = sentiment || {}
  return stackedBar([
    { count: s.positivo || 0, label: 'positivas', colorClass: 'bg-[var(--success-150)]', textClass: 'text-white' },
    { count: s.neutro   || 0, label: 'neutras',   colorClass: 'bg-[var(--black-10)]',    textClass: 'text-[var(--black-60)]' },
    { count: s.negativo || 0, label: 'negativas', colorClass: 'bg-[var(--error-100)]',   textClass: 'text-white' },
  ])
}

// Cómo terminan las conversaciones. en_curso NO es segmento: se excluye del
// total (son las vivas de la ventana de cierre) y el consumidor lo muestra
// como nota al pie.
export function lifecycleBar(lifecycle) {
  const l = lifecycle || {}
  return stackedBar([
    { count: l.cerrada_cliente || 0, label: 'cerradas por el cliente', colorClass: 'bg-[var(--success-150)]', textClass: 'text-white' },
    { count: l.abandonada      || 0, label: 'abandonadas',             colorClass: 'bg-[var(--black-10)]',    textClass: 'text-[var(--black-60)]' },
    { count: l.escalada        || 0, label: 'escaladas a soporte',     colorClass: 'bg-[var(--warning-150)]', textClass: 'text-white' },
  ])
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `node --test tests/analytics-ui.test.mjs`
Expected: PASS — 8 tests (4 de `sentimentBar` + 4 nuevos). **Los 4 de `sentimentBar` deben pasar sin haberlos modificado**: es la verificación de que el refactor dejó su salida intacta. Si alguno falla, arreglar `stackedBar` — no el test.

- [ ] **Step 5: Correr la suite completa**

Run: `node --test tests/*.test.mjs`
Expected: PASS — 72 tests.

- [ ] **Step 6: Commit**

```bash
git add js/analytics-ui.js tests/analytics-ui.test.mjs
git commit -m "feat: helper stackedBar compartido + lifecycleBar (cómo terminan las conversaciones) + tests"
```

---

### Task 7: Card, badge y filtro en el dashboard BolBot

Card nueva con la barra, y **consolidación**: el badge y el chip de soporte se reemplazan por los de ciclo de vida, porque bajo "escalada gana" `lifecycle = 'escalada'` ⟺ `support_redirected = true` y tener los dos sería UI redundante.

**Files:**
- Modify: `js/analytics-api.js` — `fetchBotConversations` (L66-78).
- Modify: `js/admin-bot-analytics.js` — import (L4-6); card nueva (~L44 y ~L87); `convRows` (L175); `renderExplorer` (L157); `wireExplorer` (L191, L197); `exportBotCsv` (L248).

**Interfaces:**
- Consumes: `lifecycleBar(lifecycle)` de `js/analytics-ui.js` (Task 6); `kpis.lifecycle` y el `lifecycle` por fila + `p_lifecycle` de los RPCs (Task 2).

> **Nota:** ninguno de los dos archivos es import-safe en Node → sin unit test. Verificación = `node --check` + suite verde + navegador.

- [ ] **Step 1: Pasar `p_lifecycle` en la capa de API**

En `js/analytics-api.js`, dentro de `fetchBotConversations`, agregar el parámetro nuevo después de `p_limit`:

```js
    p_limit: filters.limit ?? null,
    p_lifecycle: filters.lifecycle ?? null,
```

- [ ] **Step 2: Importar `lifecycleBar`**

En `js/admin-bot-analytics.js`, agregar `lifecycleBar` al import existente de `./analytics-ui.js`:

```js
import {
  rangeControlsHtml, wireRangeControls, computeRange, kpiCard, llmNote, sentimentBar, lifecycleBar,
} from './analytics-ui.js'
```

- [ ] **Step 3: Construir la card y montarla**

En `js/admin-bot-analytics.js`, después del bloque `const kpis = \`...\`` (que cierra en ~L44) agregar:

```js
  // Cómo terminan las conversaciones (sub-proyecto B). en_curso va como nota
  // al pie, no como segmento: son las vivas de la ventana de cierre.
  const lc = k.lifecycle || {}
  const lifecyclePanel = `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4 mt-4">
      <p class="text-sm font-bold text-[var(--black-100)] mb-2">Cómo terminan las conversaciones</p>
      ${lifecycleBar(lc)}
      <p class="text-[10px] text-[var(--black-60)] mt-2">cerró el cliente · abandonó · escaló${lc.en_curso ? ` · ${lc.en_curso} en curso` : ''}</p>
    </div>`
```

Y en el `el.innerHTML` (~L87), insertarla justo después de `${kpis}`:

```js
    ${kpis}
    ${lifecyclePanel}
```

- [ ] **Step 4: Reemplazar el badge de soporte por el de ciclo de vida**

En `js/admin-bot-analytics.js`, agregar el helper y su tabla **antes** de `function convRows(convs)` (~L169):

```js
const LIFECYCLE_BADGE = {
  cerrada_cliente: ['Cerró',    'var(--success-150)'],
  abandonada:      ['Abandonó', 'var(--black-40)'],
  escalada:        ['Escaló',   'var(--warning-150)'],
  en_curso:        ['En curso', 'var(--blue-100)'],
}

// Un solo badge para el cierre: bajo "escalada gana", lifecycle = 'escalada'
// equivale a support_redirected, así que este badge reemplaza al de soporte.
function lifecycleBadge(lifecycle) {
  const b = LIFECYCLE_BADGE[lifecycle]
  if (!b) return ''
  return `<span class="text-[10px] px-2 rounded-full border" style="border-color:${b[1]};color:${b[1]}">${b[0]}</span>`
}
```

Dentro de `convRows`, **reemplazar** la línea del badge de soporte (L175):

```js
      ${c.support_redirected ? '<span class="text-[10px] px-2 rounded-full border border-[var(--warning-150)] text-[var(--warning-150)]">Escaló</span>' : ''}
```

por:

```js
      ${lifecycleBadge(c.lifecycle)}
```

- [ ] **Step 5: Reemplazar el grupo de chips de soporte**

En `js/admin-bot-analytics.js`, dentro de `renderExplorer`, **reemplazar** la línea L157:

```js
        ${filterChips('sup', 'Soporte', [['', 'Todas'], ['true', 'Escaló'], ['false', 'No escaló']])}
```

por:

```js
        ${filterChips('life', 'Cierre', [['', 'Todas'], ['cerrada_cliente', 'Cerró'], ['abandonada', 'Abandonó'], ['escalada', 'Escaló']])}
```

- [ ] **Step 6: Cablear el filtro nuevo en `wireExplorer`**

En `js/admin-bot-analytics.js`, dentro de `wireExplorer`, **reemplazar** la línea del estado (L191):

```js
  const state = { estado: '', sent: '', sup: '', search: '' }
```

por:

```js
  const state = { estado: '', sent: '', life: '', search: '' }
```

Y **reemplazar** la línea del filtro de soporte (L197):

```js
    if (state.sup) filters.support = state.sup === 'true'
```

por:

```js
    if (state.life) filters.lifecycle = state.life
```

- [ ] **Step 7: Actualizar la columna del CSV**

En `js/admin-bot-analytics.js`, dentro de `exportBotCsv`, **reemplazar** la línea L248:

```js
    { label: 'Escaló', getValue: r => r.support_redirected ? 'Sí' : 'No' },
```

por:

```js
    { label: 'Cómo terminó', getValue: r => r.lifecycle || '' },
```

- [ ] **Step 8: Verificar sintaxis y suite**

Run: `node --check js/analytics-api.js && node --check js/admin-bot-analytics.js && node --test tests/*.test.mjs`
Expected: sin error de sintaxis; suite verde (72 tests).

- [ ] **Step 9: Verificar que no quedó estado huérfano del filtro viejo**

Run: `grep -n "state.sup\|'sup'\|data-group=\"sup\"" js/admin-bot-analytics.js`
Expected: **sin resultados**. Si aparece algo, quedó una referencia al grupo de chips borrado y el filtro se rompería en silencio.

- [ ] **Step 10: Commit**

```bash
git add js/analytics-api.js js/admin-bot-analytics.js
git commit -m "feat: card 'Cómo terminan las conversaciones' + badge y filtro de ciclo de vida"
```

---

## Notas de verificación final

**Navegador — /admin → analytics → BolBot:**
- La card "Cómo terminan las conversaciones" muestra la barra de tres segmentos con los conteos dentro y la línea de leyenda debajo (con "· N en curso" solo si hay).
- El explorador muestra **un** badge de cierre por fila (Cerró / Abandonó / Escaló), ya no el de soporte.
- El grupo de chips "Cierre" filtra y el resumen de filtros activos muestra `life:abandonada`.
- El CSV trae la columna "Cómo terminó" con el valor de `lifecycle`.

**Navegador — el chat (portal):**
- Con `inactividad_aviso_min` en `1` desde el admin: mandar un mensaje, esperar ~1 min y ver aparecer el separador `⏱ ¿SIGUES AHÍ?` con la píldora. Tocarla lo borra y no vuelve a aparecer en esa conversación.
- Con `inactividad_aviso_min` en `0`: el separador nunca aparece.
- **Efecto en vivo:** con el chat abierto, cambiar los minutos en el admin y ver que el nuevo valor aplica sin recargar la página (realtime, ~1.5 s de debounce). Poner `0` con un aviso pendiente lo cancela.
- El aviso NO aparece mientras el bot está escribiendo una respuesta larga.
- En Supabase, la fila de esa conversación tiene `last_activity_at` actualizado con cada mensaje.

**Fuera de alcance (no implementar):** tendencia de abandono en el tiempo; tocar `resolution_status`/`resolved`; auto-eval con LLM (①c); reabrir conversaciones cerradas; notificar al usuario que su conversación se cerró.

**Pendiente manual del usuario, además de las migraciones:** borrar el workflow `Bodi Abandon Webhook` (id `x3sImBnivO1XAHxp`) de n8n, que quedó sin consumidor.
