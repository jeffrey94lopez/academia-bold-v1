# Fundación de datos analytics (Supabase) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear la capa de datos en Supabase (esquema versionado + RPCs de agregación) para que los dashboards de analytics lean datos pre-agregados en vez de bajar miles de filas al cliente.

**Architecture:** Migraciones SQL idempotentes ejecutadas a mano en el SQL Editor de Supabase (convención existente del repo). Se formaliza la tabla `analytics_events`, se agregan columnas para los campos que llenarán después la telemetría front (①b) y el LLM de n8n (①c), y se crean funciones RPC `security definer` que devuelven un único `jsonb` agregado por rango de fechas. Un módulo JS delgado y testeado (`js/analytics-api.js`) expone la interfaz que consumirán los dashboards (sub-proyectos ② y ③).

**Tech Stack:** PostgreSQL (Supabase), PL/pgSQL/SQL functions, JS vanilla ESM, runner de tests `node:test` (`.mjs`).

## Global Constraints

- **JS vanilla, sin bundler.** El cliente Supabase se importa por ESM desde CDN (`js/supabase.js`); no hay `npm install` de supabase-js. Copiar el patrón existente.
- **Migraciones a mano.** No hay runner de migraciones. Cada archivo `.sql` va en `supabase/migrations/`, con cabecera-comentario en español y la línea `-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.`, y debe ser **idempotente** (`if not exists`, `drop function if exists` antes de `create or replace`).
- **Nada de bajar miles de filas al cliente.** Toda agregación ocurre en la RPC; el cliente recibe solo el resultado. (Elimina los `.limit(5000)` / `.limit(2000)` de `admin-analytics.js` — se hará al reescribir los dashboards en ② y ③.)
- **Tests:** runner nativo `node:test` con `node:assert/strict`, archivos `.mjs` en `tests/`. No hay script `test` en `package.json`; se corre con `node --test <archivo>`.
- **Tema Merlin / picker de calendario:** aplican a la UI (② y ③), no a esta capa de datos. Sin impacto aquí.
- **Esquema de resolución de 3 estados:** `resuelta` / `no_resuelta` / `ambigua`. "Resolución real" = `resuelta ÷ (resuelta + no_resuelta)`; las ambiguas no entran en el denominador.

**Nota sobre TDD en SQL:** el proyecto no tiene arnés de pruebas de base de datos y las migraciones se aplican a mano. Para las tareas SQL, el ciclo de prueba es una **query de verificación** ejecutada en el SQL Editor con salida esperada (mismo patrón que `add_vertical_plataforma_lecciones.sql`, que incluye un `select` de control). El único módulo con TDD clásico es `js/analytics-api.js` (Tarea 7).

---

### Task 1: Formalizar tabla `analytics_events`

La tabla existe en producción pero no tiene migración en el repo. Se versiona con `create table if not exists` (no-op si ya existe) y se añaden índices para que las RPCs agreguen por rango de fecha y tipo de evento sin escaneo completo.

**Files:**
- Create: `supabase/migrations/create_analytics_events.sql`

**Interfaces:**
- Produces: tabla `public.analytics_events(event_type text, payload jsonb, session_id text, mode text, created_at timestamptz)` + índices `idx_analytics_events_type_date`, `idx_analytics_events_created`.

- [ ] **Step 1: Escribir la migración**

```sql
-- analytics_events: telemetría de uso del portal (visitas, lecciones, exámenes,
-- búsquedas, certificados). La tabla ya existe en producción; esta migración la
-- versiona (create if not exists = no-op si ya está) y asegura los índices que
-- las RPCs de analytics necesitan para agregar por fecha/tipo sin escaneo total.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
create table if not exists public.analytics_events (
  id          bigint generated always as identity primary key,
  event_type  text not null,
  payload     jsonb default '{}'::jsonb,
  session_id  text,
  mode        text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_analytics_events_type_date
  on public.analytics_events (event_type, created_at desc);
create index if not exists idx_analytics_events_created
  on public.analytics_events (created_at desc);
```

- [ ] **Step 2: Aplicar en el SQL Editor**

Pega el contenido del archivo en el SQL Editor de Supabase y ejecútalo.
Esperado: `Success. No rows returned`. Si la tabla ya existía, el `create table` es no-op y solo se crean los índices que falten.

- [ ] **Step 3: Verificar (query de control)**

Ejecuta en el SQL Editor:
```sql
select indexname from pg_indexes
where tablename = 'analytics_events' and schemaname = 'public'
order by indexname;
```
Esperado: la lista incluye `idx_analytics_events_created` e `idx_analytics_events_type_date`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/create_analytics_events.sql
git commit -m "feat(db): versionar analytics_events + índices para analytics"
```

---

### Task 2: Columnas LLM + vertical/plataforma en `bodi_conversations`

Agrega las columnas que llenarán el LLM de n8n (①c) y la telemetría front (①b). Se añaden ahora para que las RPCs puedan referenciarlas; quedan `null` hasta que ①b/①c las poblen, y las RPCs hacen fallback a los campos actuales (`resolved`, `topic`).

**Files:**
- Create: `supabase/migrations/add_llm_fields_bodi_conversations.sql`

**Interfaces:**
- Consumes: tabla `bodi_conversations` (de `create_bodi_conversations.sql`).
- Produces: columnas `resolution_status text CHECK IN ('resuelta','no_resuelta','ambigua')`, `category text`, `knowledge_gap boolean`, `summary text`, `vertical text`, `plataforma text`, `lessons_used jsonb`.

- [ ] **Step 1: Escribir la migración**

```sql
-- Campos nuevos en bodi_conversations para la calidad real del bot (auto-eval
-- con LLM en n8n) y filtros del explorador:
--   resolution_status  estado de 3 valores que reemplaza al booleano 'resolved'
--   category           taxonomía estable de la duda (reemplaza el 'topic' libre)
--   knowledge_gap      true si la duda no está cubierta por ninguna lección
--   summary            resumen de una línea de la conversación
--   vertical/plataforma contexto que el bot ya recibe pero no se persistía
--   lessons_used       lecciones que usó el bot (ya lo escribe assistant.js)
-- Todas quedan null hasta que la telemetría (①b) y el LLM (①c) las llenen.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
alter table public.bodi_conversations
  add column if not exists resolution_status text
    check (resolution_status in ('resuelta','no_resuelta','ambigua')),
  add column if not exists category text,
  add column if not exists knowledge_gap boolean,
  add column if not exists summary text,
  add column if not exists vertical text,
  add column if not exists plataforma text,
  add column if not exists lessons_used jsonb default '[]'::jsonb;

create index if not exists idx_bodi_conv_category
  on public.bodi_conversations (category, started_at desc);
create index if not exists idx_bodi_conv_resolution
  on public.bodi_conversations (resolution_status, started_at desc);
```

- [ ] **Step 2: Aplicar en el SQL Editor**

Ejecuta el archivo. Esperado: `Success. No rows returned`.

- [ ] **Step 3: Verificar (query de control)**

```sql
select column_name from information_schema.columns
where table_name = 'bodi_conversations' and table_schema = 'public'
  and column_name in
  ('resolution_status','category','knowledge_gap','summary','vertical','plataforma','lessons_used')
order by column_name;
```
Esperado: 7 filas (las 7 columnas nuevas).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/add_llm_fields_bodi_conversations.sql
git commit -m "feat(db): columnas LLM y contexto en bodi_conversations"
```

---

### Task 3: RPC `analytics_lessons_summary`

Reemplaza toda la agregación cliente de la vista Lecciones (`admin-analytics.js:71-486`). Devuelve un `jsonb` con KPIs (actual y previo para deltas), serie de visitas por día, modo de entrada, top de lecciones, búsquedas agregadas y resultados de exámenes.

**Files:**
- Create: `supabase/migrations/create_analytics_lessons_summary.sql`

**Interfaces:**
- Consumes: `public.analytics_events`.
- Produces: función `public.analytics_lessons_summary(p_from timestamptz, p_to timestamptz, p_prev_from timestamptz, p_prev_to timestamptz) returns jsonb`. Forma del resultado:
  `{ kpis:{visits,prev_visits,new_students,prev_new_students,passes,avg_score,cert_views,cert_prints}, visits_by_day:[{day,count}], entry_mode:{course,explore}, top_lessons:[{lesson,count}], searches:[{term,count,avg_results,zero_count,last_at}], exams:[{lesson,passes,fails,total,pass_pct,avg_score}] }`.

- [ ] **Step 1: Escribir la migración**

```sql
-- analytics_lessons_summary: agrega en el servidor todas las métricas de la
-- vista Lecciones para un rango [p_from, p_to], más el conteo de visitas/nuevos
-- del rango previo [p_prev_from, p_prev_to] para calcular deltas. Devuelve un
-- único jsonb; el admin ya no baja miles de filas de analytics_events.
-- security definer: corre con privilegios del owner y solo expone agregados.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
create or replace function public.analytics_lessons_summary(
  p_from      timestamptz,
  p_to        timestamptz,
  p_prev_from timestamptz,
  p_prev_to   timestamptz
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with cur as (
    select event_type, payload, session_id, created_at
    from analytics_events
    where created_at >= p_from and created_at <= p_to
  ),
  prev as (
    select event_type, payload
    from analytics_events
    where created_at >= p_prev_from and created_at <= p_prev_to
  )
  select jsonb_build_object(
    'kpis', jsonb_build_object(
      'visits',            (select count(*) from cur  where event_type = 'page_view'),
      'prev_visits',       (select count(*) from prev where event_type = 'page_view'),
      'new_students',      (select count(*) from cur  where event_type = 'mode_selected' and payload->>'mode' = 'course'),
      'prev_new_students', (select count(*) from prev where event_type = 'mode_selected' and payload->>'mode' = 'course'),
      'passes',            (select count(*) from cur  where event_type = 'exam_pass'),
      'avg_score',         (select round(avg((payload->>'score')::numeric)) from cur where event_type = 'exam_pass'),
      'cert_views',        (select count(*) from cur  where event_type = 'certificate_view'),
      'cert_prints',       (select count(*) from cur  where event_type = 'certificate_print')
    ),
    'visits_by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d, 'count', c) order by d), '[]'::jsonb)
      from (
        select date_trunc('day', created_at)::date as d, count(*) as c
        from cur where event_type = 'page_view' group by 1
      ) t
    ),
    'entry_mode', jsonb_build_object(
      'course',  (select count(*) from cur where event_type = 'mode_selected' and payload->>'mode' = 'course'),
      'explore', (select count(*) from cur where event_type = 'mode_selected' and payload->>'mode' = 'explore')
    ),
    'top_lessons', (
      select coalesce(jsonb_agg(jsonb_build_object('lesson', lesson, 'count', c) order by c desc), '[]'::jsonb)
      from (
        select coalesce(payload->>'lesson_title', payload->>'lesson_id') as lesson, count(*) as c
        from cur where event_type = 'lesson_open'
        group by 1 order by c desc limit 10
      ) t
    ),
    'searches', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'term', term, 'count', c, 'avg_results', avg_r, 'zero_count', zc, 'last_at', last_at) order by c desc), '[]'::jsonb)
      from (
        select lower(trim(payload->>'term')) as term,
               count(*) as c,
               round(avg((payload->>'results_count')::numeric), 1) as avg_r,
               count(*) filter (where (payload->>'results_count')::int = 0) as zc,
               max(created_at) as last_at
        from cur
        where event_type = 'lesson_search' and coalesce(trim(payload->>'term'), '') <> ''
        group by 1
      ) t
    ),
    'exams', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'lesson', lesson, 'passes', passes, 'fails', fails, 'total', passes + fails,
        'pass_pct', round(100.0 * passes / nullif(passes + fails, 0)),
        'avg_score', avg_score) order by (passes + fails) desc), '[]'::jsonb)
      from (
        select coalesce(payload->>'lesson_title', payload->>'lesson_id') as lesson,
               count(*) filter (where event_type = 'exam_pass') as passes,
               count(*) filter (where event_type = 'exam_fail') as fails,
               round(avg((payload->>'score')::numeric) filter (where event_type = 'exam_pass')) as avg_score
        from cur where event_type in ('exam_pass', 'exam_fail')
        group by 1
      ) t
    )
  );
$$;

revoke execute on function public.analytics_lessons_summary(timestamptz, timestamptz, timestamptz, timestamptz) from public, anon;
grant  execute on function public.analytics_lessons_summary(timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;
```

- [ ] **Step 2: Aplicar en el SQL Editor**

Ejecuta el archivo. Esperado: `Success. No rows returned`.

- [ ] **Step 3: Verificar (query de control)**

```sql
select jsonb_pretty(public.analytics_lessons_summary(
  now() - interval '30 days', now(),
  now() - interval '60 days', now() - interval '30 days'));
```
Esperado: un objeto JSON con las claves `kpis`, `visits_by_day`, `entry_mode`, `top_lessons`, `searches`, `exams`. `kpis.visits` es un entero ≥ 0; los arrays vienen como `[]` si no hay datos. Sin errores de tipo.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/create_analytics_lessons_summary.sql
git commit -m "feat(db): RPC analytics_lessons_summary (agregación server-side)"
```

---

### Task 4: RPC `analytics_bot_summary`

Reemplaza la agregación cliente de la vista bot (`admin-analytics.js:507-676`). Usa `resolution_status` (nuevo) con fallback al booleano `resolved`, y `category` (nuevo) con fallback a `topic`.

**Files:**
- Create: `supabase/migrations/create_analytics_bot_summary.sql`

**Interfaces:**
- Consumes: `public.bodi_conversations` (con columnas de Task 2).
- Produces: función `public.analytics_bot_summary(p_from timestamptz, p_to timestamptz) returns jsonb`. Forma:
  `{ kpis:{total,resolved,unresolved,ambiguous,resolved_pct,abandoned,support,resolved_without_support_pct,sentiment_net,sentiment:{positivo,neutro,negativo}}, by_category:[{category,total,resolved_pct,negative_pct,support_pct,dominant_sentiment}], heatmap:[{dow,hour,count}] }`.

- [ ] **Step 1: Escribir la migración**

```sql
-- analytics_bot_summary: agrega en el servidor los KPIs y cortes de la vista
-- BolBot para un rango [p_from, p_to]. La resolución usa resolution_status
-- (3 estados) con fallback al booleano legacy 'resolved'; la categoría usa
-- 'category' con fallback al 'topic' libre. Devuelve un único jsonb.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
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
        'dominant_sentiment', dom) order by c desc), '[]'::jsonb)
      from (
        select cat,
               count(*) as c,
               round(100.0 * count(*) filter (where eff_status = 'resuelta')
                     / nullif(count(*) filter (where eff_status in ('resuelta','no_resuelta')), 0)) as rp,
               round(100.0 * count(*) filter (where sentiment = 'negativo') / nullif(count(*), 0)) as np,
               round(100.0 * count(*) filter (where support_redirected) / nullif(count(*), 0)) as sp,
               mode() within group (order by coalesce(sentiment, 'neutro')) as dom
        from res group by cat
      ) t
    ),
    'heatmap', (
      select coalesce(jsonb_agg(jsonb_build_object('dow', dow, 'hour', hr, 'count', c)), '[]'::jsonb)
      from (
        select extract(dow from started_at)::int as dow,
               extract(hour from started_at)::int as hr,
               count(*) as c
        from res group by 1, 2
      ) t
    )
  );
$$;

revoke execute on function public.analytics_bot_summary(timestamptz, timestamptz) from public, anon;
grant  execute on function public.analytics_bot_summary(timestamptz, timestamptz) to authenticated;
```

- [ ] **Step 2: Aplicar en el SQL Editor**

Ejecuta el archivo. Esperado: `Success. No rows returned`.

- [ ] **Step 3: Verificar (query de control)**

```sql
select jsonb_pretty(public.analytics_bot_summary(now() - interval '30 days', now()));
```
Esperado: objeto con `kpis` (incluye `resolved_pct`, `sentiment_net`, `sentiment.{positivo,neutro,negativo}`), `by_category` (array) y `heatmap` (array de `{dow,hour,count}`). Sin errores; con datos actuales `resolved`/`unresolved` deben salir del `resolved` legacy porque `resolution_status` aún es null.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/create_analytics_bot_summary.sql
git commit -m "feat(db): RPC analytics_bot_summary con resolución de 3 estados"
```

---

### Task 5: RPC `analytics_course_funnel`

Provee el embudo del curso de la vista Lecciones, contando sesiones distintas por etapa.

**Files:**
- Create: `supabase/migrations/create_analytics_course_funnel.sql`

**Interfaces:**
- Consumes: `public.analytics_events`.
- Produces: función `public.analytics_course_funnel(p_from timestamptz, p_to timestamptz) returns jsonb` con `{ entered, opened_lesson, took_exam, approved, certificate }` (enteros = nº de sesiones distintas en cada etapa).

- [ ] **Step 1: Escribir la migración**

```sql
-- analytics_course_funnel: embudo del curso por sesiones distintas.
-- Etapas: entró al curso -> abrió una lección -> presentó examen -> aprobó ->
-- vio certificado. Todas cuentan session_id distintos dentro del rango, para
-- que las etapas sean comparables. Ejecutar UNA sola vez en el SQL Editor.
create or replace function public.analytics_course_funnel(
  p_from timestamptz,
  p_to   timestamptz
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with c as (
    select event_type, session_id, payload
    from analytics_events
    where created_at >= p_from and created_at <= p_to and session_id is not null
  )
  select jsonb_build_object(
    'entered',       (select count(distinct session_id) from c where event_type = 'mode_selected' and payload->>'mode' = 'course'),
    'opened_lesson', (select count(distinct session_id) from c where event_type = 'lesson_open'),
    'took_exam',     (select count(distinct session_id) from c where event_type in ('exam_pass','exam_fail')),
    'approved',      (select count(distinct session_id) from c where event_type = 'exam_pass'),
    'certificate',   (select count(distinct session_id) from c where event_type = 'certificate_view')
  );
$$;

revoke execute on function public.analytics_course_funnel(timestamptz, timestamptz) from public, anon;
grant  execute on function public.analytics_course_funnel(timestamptz, timestamptz) to authenticated;
```

- [ ] **Step 2: Aplicar en el SQL Editor**

Ejecuta el archivo. Esperado: `Success. No rows returned`.

- [ ] **Step 3: Verificar (query de control)**

```sql
select public.analytics_course_funnel(now() - interval '90 days', now());
```
Esperado: `{"entered":N,"opened_lesson":N,"took_exam":N,"approved":N,"certificate":N}` con enteros ≥ 0.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/create_analytics_course_funnel.sql
git commit -m "feat(db): RPC analytics_course_funnel"
```

---

### Task 6: RPC `analytics_bot_trend`

Serie mensual para el Resumen ejecutivo: volumen, resolución real y sentimiento neto por mes.

**Files:**
- Create: `supabase/migrations/create_analytics_bot_trend.sql`

**Interfaces:**
- Consumes: `public.bodi_conversations`.
- Produces: función `public.analytics_bot_trend(p_months int default 6) returns jsonb` = array de `{month,conversations,resolved_pct,sentiment_net}` ordenado por mes ascendente.

- [ ] **Step 1: Escribir la migración**

```sql
-- analytics_bot_trend: serie mensual de los últimos p_months meses para el
-- Resumen ejecutivo. Por mes: conversaciones, % de resolución real y
-- sentimiento neto. Ejecutar UNA sola vez en el SQL Editor.
create or replace function public.analytics_bot_trend(
  p_months int default 6
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'month', to_char(m, 'YYYY-MM'),
    'conversations', c,
    'resolved_pct', rp,
    'sentiment_net', sn) order by m), '[]'::jsonb)
  from (
    select date_trunc('month', started_at) as m,
           count(*) as c,
           round(100.0 * count(*) filter (where eff = 'resuelta')
                 / nullif(count(*) filter (where eff in ('resuelta','no_resuelta')), 0)) as rp,
           round(100.0 * (count(*) filter (where sentiment = 'positivo')
                         - count(*) filter (where sentiment = 'negativo'))
                 / nullif(count(*), 0)) as sn
    from (
      select started_at, sentiment,
             coalesce(resolution_status,
               case when resolved is true then 'resuelta'
                    when resolved is false then 'no_resuelta' end) as eff
      from bodi_conversations
      where started_at >= date_trunc('month', now()) - make_interval(months => p_months - 1)
    ) s
    group by 1
  ) t;
$$;

revoke execute on function public.analytics_bot_trend(int) from public, anon;
grant  execute on function public.analytics_bot_trend(int) to authenticated;
```

- [ ] **Step 2: Aplicar en el SQL Editor**

Ejecuta el archivo. Esperado: `Success. No rows returned`.

- [ ] **Step 3: Verificar (query de control)**

```sql
select jsonb_pretty(public.analytics_bot_trend(6));
```
Esperado: array (`[]` si no hay datos) de objetos `{month:'YYYY-MM', conversations, resolved_pct, sentiment_net}`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/create_analytics_bot_trend.sql
git commit -m "feat(db): RPC analytics_bot_trend (serie mensual ejecutiva)"
```

---

### Task 7: Módulo cliente `js/analytics-api.js` (con tests)

Capa de acceso delgada que expone las RPCs como funciones tipadas para los dashboards (② y ③). Cada función acepta un `client` opcional (default: el singleton `supabase`) para poder testear con un cliente falso. TDD clásico.

**Files:**
- Create: `js/analytics-api.js`
- Test: `tests/analytics-api.test.mjs`

**Interfaces:**
- Consumes: `supabase` de `js/supabase.js`; RPCs de Tasks 3-6.
- Produces:
  - `fetchLessonsSummary(from: Date, to: Date, prevFrom: Date, prevTo: Date, client?) → Promise<object>`
  - `fetchBotSummary(from: Date, to: Date, client?) → Promise<object>`
  - `fetchCourseFunnel(from: Date, to: Date, client?) → Promise<object>`
  - `fetchBotTrend(months: number, client?) → Promise<object>`
  Cada una llama `client.rpc(nombre, params)`, lanza `Error` si `error` no es null, y devuelve `data`.

- [ ] **Step 1: Escribir el test que falla**

```javascript
// tests/analytics-api.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fetchLessonsSummary, fetchBotSummary, fetchCourseFunnel, fetchBotTrend,
} from '../js/analytics-api.js'

function fakeClient(captured) {
  return {
    rpc(name, params) {
      captured.name = name
      captured.params = params
      return Promise.resolve({ data: { ok: true, name }, error: null })
    },
  }
}

function errorClient() {
  return { rpc() { return Promise.resolve({ data: null, error: { message: 'boom' } }) } }
}

test('fetchLessonsSummary llama la RPC con fechas ISO y devuelve data', async () => {
  const cap = {}
  const from = new Date('2026-06-01T00:00:00Z')
  const to = new Date('2026-06-30T23:59:59Z')
  const pf = new Date('2026-05-01T00:00:00Z')
  const pt = new Date('2026-05-31T23:59:59Z')
  const data = await fetchLessonsSummary(from, to, pf, pt, fakeClient(cap))
  assert.equal(cap.name, 'analytics_lessons_summary')
  assert.equal(cap.params.p_from, from.toISOString())
  assert.equal(cap.params.p_prev_to, pt.toISOString())
  assert.deepEqual(data, { ok: true, name: 'analytics_lessons_summary' })
})

test('fetchBotSummary usa analytics_bot_summary', async () => {
  const cap = {}
  const from = new Date('2026-06-01T00:00:00Z')
  const to = new Date('2026-06-30T00:00:00Z')
  await fetchBotSummary(from, to, fakeClient(cap))
  assert.equal(cap.name, 'analytics_bot_summary')
  assert.equal(cap.params.p_from, from.toISOString())
})

test('fetchCourseFunnel usa analytics_course_funnel', async () => {
  const cap = {}
  await fetchCourseFunnel(new Date('2026-06-01T00:00:00Z'), new Date('2026-06-30T00:00:00Z'), fakeClient(cap))
  assert.equal(cap.name, 'analytics_course_funnel')
})

test('fetchBotTrend pasa p_months', async () => {
  const cap = {}
  await fetchBotTrend(6, fakeClient(cap))
  assert.equal(cap.name, 'analytics_bot_trend')
  assert.equal(cap.params.p_months, 6)
})

test('lanza Error cuando la RPC devuelve error', async () => {
  await assert.rejects(
    () => fetchBotSummary(new Date(), new Date(), errorClient()),
    /boom/,
  )
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node --test tests/analytics-api.test.mjs`
Expected: FAIL — `Cannot find module '../js/analytics-api.js'` (el módulo aún no existe).

- [ ] **Step 3: Escribir la implementación mínima**

```javascript
// js/analytics-api.js
// Capa de acceso a las RPCs de analytics. Devuelve el jsonb agregado por el
// servidor; los dashboards (② y ③) consumen estas funciones y no tocan
// analytics_events / bodi_conversations directamente.
import { supabase } from './supabase.js'

async function callRpc(client, name, params) {
  const { data, error } = await client.rpc(name, params)
  if (error) throw new Error(`${name}: ${error.message}`)
  return data
}

export function fetchLessonsSummary(from, to, prevFrom, prevTo, client = supabase) {
  return callRpc(client, 'analytics_lessons_summary', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_prev_from: prevFrom.toISOString(),
    p_prev_to: prevTo.toISOString(),
  })
}

export function fetchBotSummary(from, to, client = supabase) {
  return callRpc(client, 'analytics_bot_summary', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  })
}

export function fetchCourseFunnel(from, to, client = supabase) {
  return callRpc(client, 'analytics_course_funnel', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  })
}

export function fetchBotTrend(months = 6, client = supabase) {
  return callRpc(client, 'analytics_bot_trend', { p_months: months })
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node --test tests/analytics-api.test.mjs`
Expected: PASS (5 tests, 0 fail).

- [ ] **Step 5: Commit**

```bash
git add js/analytics-api.js tests/analytics-api.test.mjs
git commit -m "feat: módulo analytics-api con acceso a RPCs (+ tests)"
```

---

## Cierre del sub-proyecto

Al terminar las 7 tareas, la capa de datos está lista: esquema versionado, columnas para los datos nuevos, y RPCs que devuelven todo agregado. Los sub-proyectos ② (Dashboard Lecciones) y ③ (Dashboard BolBot + Resumen + puente) reescriben `admin-analytics.js` para consumir `js/analytics-api.js` en vez de bajar filas crudas. La telemetría front (①b) y el auto-eval LLM (①c) llenan las columnas nuevas; hasta entonces las RPCs funcionan con fallback a los campos actuales.
