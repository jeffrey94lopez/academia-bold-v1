# Filtrado automático por vertical — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el portal, el centro de ayuda y el bot filtren su contenido por la vertical del comercio que Bold POS ya manda en producción, sin que el usuario tenga que elegirla.

**Architecture:** Se agrega el valor `'ambas'` a la columna `vertical` de `lecciones`, `preguntas_frecuentes` y `glosario`. Una única función `aplicaA(item, vertical)` en `js/vertical.js` define qué significa que un contenido aplique a una vertical, y la misma condición se replica en SQL dentro de `match_lessons`. El portal oculta la tarjeta de vertical cuando Bold ya la dictó, y n8n pasa la vertical al retrieval y al prompt del bot.

**Tech Stack:** JavaScript ES modules sin framework ni bundler (los `.js` se sirven tal cual), Supabase (Postgres + PostgREST + pgvector), n8n para el bot, `node:test` para las pruebas unitarias, Tailwind vía CDN.

**Spec:** `docs/superpowers/specs/2026-09-14-filtro-automatico-vertical-design.md`

## Global Constraints

- Valores válidos de `vertical` en las tres tablas: exactamente `'retail'`, `'restaurantes'`, `'ambas'`.
- `'ambas'` **NO** entra en la constante `VERTICALES` de `js/vertical.js`. Esa lista son las verticales *seleccionables* (2); si `'ambas'` entrara ahí, el portal pintaría una tercera tarjeta y `setSeleccion` aceptaría `'ambas'` como selección del usuario.
- Convención existente del repo: `vertical` ausente o desconocida cuenta como `retail`; una clave de `app_settings` ausente o distinta de `'false'` cuenta como habilitada.
- Las tablas nuevas llevan `NOT NULL DEFAULT 'ambas'`: la migración no puede esconder contenido existente.
- Las pruebas se corren con `node --test tests/<archivo>.test.mjs` (no hay script en `package.json`).
- Los módulos con pruebas deben quedar import-safe en Node: sin tocar `window`, `document` ni importar `js/supabase.js` a nivel de módulo (ese import carga una URL de CDN y rompe el runner con `ERR_UNSUPPORTED_ESM_URL_SCHEME`).
- Los mensajes de commit van en español, en el estilo del repo (`feat(admin):`, `fix(bot):`, `docs(vertical):`).
- Las migraciones SQL **no las ejecuta el agente**: se escriben en `supabase/migrations/` y las corre el usuario en el SQL Editor de Supabase. El agente verifica el resultado por REST.
- `supabase-js` no lanza en error: nunca dar por buena una consulta porque la UI se vea bien. Verificar por REST crudo.

---

## Fuera de alcance de este plan

- **Material de apoyo** y pestaña **Curso**: decisión explícita del usuario en el spec.
- **Reclasificar contenido existente**: es trabajo de contenido, no de código. Todo queda en `'ambas'` o como está.
- **Rellenar el histórico de analíticas**: las 559 conversaciones sin vertical se quedan en `null`.
- **El chip de filtro por vertical en el dashboard de BolBot.** Requiere agregar `p_vertical` a cinco RPCs (`analytics_bot_summary`, `analytics_off_hours`, `analytics_bot_trend`, `analytics_bot_conversations`, `analytics_content_gaps`), cuyas definiciones SQL no se leyeron al escribir este plan. Necesita su propio plan, después de la Tarea 13. Lo que sí entra acá es empezar a **guardar** el dato, que es lo que hoy no ocurre.

---

## Estructura de archivos

| Archivo | Responsabilidad | Acción |
|---|---|---|
| `js/vertical.js` | Metadatos de verticales, selección persistida y **la regla única de filtrado** | Modificar |
| `js/utils.js` | Helpers sin dependencias; recibe `isStaff()` | Modificar |
| `js/lessons.js` | Pestaña Lecciones del portal | Modificar |
| `js/resources.js` | Pestaña Centro de ayuda (FAQ / glosario / material) | Modificar |
| `js/assistant.js` | Chat del bot: `faq_context` y alta de conversación | Modificar |
| `js/admin.js` | Panel de administración | Modificar |
| `js/lesson-duplicate.js` | Lógica pura de duplicar lección | Modificar |
| `supabase/migrations/add_vertical_ambas.sql` | Constraint de `lecciones` + columnas nuevas | Crear |
| `supabase/migrations/update_match_lessons_ambas.sql` | `match_lessons` reconoce `'ambas'` | Crear |
| `tests/vertical.test.mjs` | Pruebas de `vertical.js` | Modificar |
| `tests/utils.test.mjs` | Pruebas de `utils.js` | Modificar |
| `tests/lesson-duplicate.test.mjs` | Pruebas de duplicar lección | Modificar |
| `tests/clarify.test.mjs` | Pruebas del body del webhook | Modificar |
| `docs/superpowers/backups/2026-09-14-bold-pos-chat.json` | Respaldo del workflow antes de tocarlo | Crear |

---

# Tanda 1 — La regla de filtrado y el esquema

## Task 1: `aplicaA` — la regla única de filtrado

**Files:**
- Modify: `js/vertical.js`
- Test: `tests/vertical.test.mjs`

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces:
  - `aplicaA(item, vertical) -> boolean`
  - `VERTICALES_CONTENIDO: Array<{key: string, label: string, icon: string}>` — las 3 opciones marcables en formularios de admin (retail, restaurantes, ambas).
  - `etiqueta(l) -> { icon: string, texto: string }` — ahora soporta `'ambas'`.
  - `labelVertical(vertical) -> string` — solo el nombre de la vertical, sin la plataforma. Para los badges de FAQ y glosario, que no tienen plataforma.
  - `verticalHabilitada(settings, vertical) -> boolean`

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar al final de `tests/vertical.test.mjs`. Recuerda ampliar el `import` de arriba del archivo con `aplicaA`, `VERTICALES_CONTENIDO`, `labelVertical` y `verticalHabilitada`.

```js
test('aplicaA: ambas aplica a las dos verticales', () => {
  assert.equal(aplicaA({ vertical: 'ambas' }, 'retail'), true)
  assert.equal(aplicaA({ vertical: 'ambas' }, 'restaurantes'), true)
})

test('aplicaA: una vertical concreta solo aplica a la suya', () => {
  assert.equal(aplicaA({ vertical: 'retail' }, 'retail'), true)
  assert.equal(aplicaA({ vertical: 'retail' }, 'restaurantes'), false)
  assert.equal(aplicaA({ vertical: 'restaurantes' }, 'restaurantes'), true)
  assert.equal(aplicaA({ vertical: 'restaurantes' }, 'retail'), false)
})

test('aplicaA: vertical ausente, null o basura cuenta como retail', () => {
  assert.equal(aplicaA({}, 'retail'), true)
  assert.equal(aplicaA({ vertical: null }, 'retail'), true)
  assert.equal(aplicaA({ vertical: '' }, 'restaurantes'), false)
  assert.equal(aplicaA(null, 'retail'), true)
})

test('filtrarPorSeleccion incluye las lecciones ambas', () => {
  const ls = [
    { titulo: 'A', vertical: 'retail',       plataforma: 'web' },
    { titulo: 'B', vertical: 'restaurantes', plataforma: 'web' },
    { titulo: 'C', vertical: 'ambas',        plataforma: 'web' },
    { titulo: 'D', vertical: 'ambas',        plataforma: 'mobile' },
  ]
  const r = filtrarPorSeleccion(ls, { vertical: 'restaurantes', plataforma: 'web' })
  assert.deepEqual(r.map(l => l.titulo), ['B', 'C'])
})

test('etiqueta: ambas trae su propio icono y label', () => {
  assert.deepEqual(etiqueta({ vertical: 'ambas', plataforma: 'mobile' }),
    { icon: 'layers', texto: 'Ambas · Mobile' })
})

test('labelVertical: nombre suelto para contenido sin plataforma', () => {
  assert.equal(labelVertical('retail'), 'Retail')
  assert.equal(labelVertical('restaurantes'), 'Restaurantes')
  assert.equal(labelVertical('ambas'), 'Ambas')
  assert.equal(labelVertical(null), 'Retail')
})

// Una FAQ y un término de glosario no tienen `plataforma`: aplicaA solo mira
// `vertical`, así que la misma regla sirve para las tres tablas.
test('aplicaA sirve igual para FAQ y glosario (sin plataforma)', () => {
  const faq  = { pregunta: '¿Cómo divido una cuenta?', vertical: 'restaurantes' }
  const term = { termino: 'Comanda', vertical: 'restaurantes' }
  const pago = { pregunta: '¿Cómo proceso un pago?', vertical: 'ambas' }
  assert.equal(aplicaA(faq, 'restaurantes'), true)
  assert.equal(aplicaA(faq, 'retail'), false)
  assert.equal(aplicaA(term, 'retail'), false)
  assert.equal(aplicaA(pago, 'retail'), true)
  assert.equal(aplicaA(pago, 'restaurantes'), true)
})

test('VERTICALES_CONTENIDO trae las 3 opciones y VERTICALES sigue con 2', () => {
  assert.deepEqual(VERTICALES_CONTENIDO.map(v => v.key), ['retail', 'restaurantes', 'ambas'])
  assert.deepEqual(VERTICALES.map(v => v.key), ['retail', 'restaurantes'])
})

test('setSeleccion sigue rechazando ambas como selección del usuario', () => {
  limpiarSeleccion()
  setSeleccion({ vertical: 'ambas' })
  assert.equal(getSeleccion().vertical, 'retail')
})

test('verticalesVisibles: una vertical con solo lecciones ambas es visible', () => {
  const ls = [{ vertical: 'ambas', plataforma: 'web' }]
  assert.deepEqual(verticalesVisibles(ls, {}), ['retail', 'restaurantes'])
})

test('verticalHabilitada respeta el switch de app_settings', () => {
  assert.equal(verticalHabilitada({}, 'retail'), true)
  assert.equal(verticalHabilitada({ vertical_retail_enabled: 'false' }, 'retail'), false)
  assert.equal(verticalHabilitada({ vertical_retail_enabled: 'true' }, 'retail'), true)
})
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `node --test tests/vertical.test.mjs`
Expected: FAIL — `SyntaxError: The requested module './js/vertical.js' does not provide an export named 'aplicaA'`

- [ ] **Step 3: Implementar en `js/vertical.js`**

Agregar después de la constante `P_KEYS`:

```js
// Tercer valor de la columna `vertical`: el contenido que sirve para las dos.
// A propósito NO está en VERTICALES: esa lista son las verticales seleccionables
// (el portal pinta una tarjeta por cada una y setSeleccion solo acepta esas).
// 'ambas' es una marca de contenido, no una selección posible del usuario.
export const AMBAS = { key: 'ambas', label: 'Ambas', icon: 'layers' }

// Las 3 opciones que un admin puede marcar en un formulario de contenido.
export const VERTICALES_CONTENIDO = [...VERTICALES, AMBAS]

/**
 * ¿Este contenido aplica a esta vertical? Es la ÚNICA definición de esa regla
 * en el frontend; la misma condición está replicada en SQL dentro de
 * match_lessons. Si cambias una, cambia la otra.
 *
 * Tolerante a propósito con la vertical ausente: en `lecciones` la columna
 * vieja podía venir vacía, y un `select` parcial que no traiga la columna no
 * debería esconder contenido.
 */
export function aplicaA(item, vertical) {
  const v = item?.vertical || 'retail'
  return v === AMBAS.key || v === vertical
}
```

Reemplazar `filtrarPorSeleccion` y `etiqueta`:

```js
export function filtrarPorSeleccion(lecciones, { vertical, plataforma }) {
  return (lecciones || []).filter(l =>
    aplicaA(l, vertical) &&
    (l.plataforma || 'web') === plataforma)
}

// Metadatos de una vertical de CONTENIDO (las 2 seleccionables más 'ambas').
function metaVertical(vertical) {
  const key = vertical || 'retail'
  return key === AMBAS.key
    ? AMBAS
    : VERTICALES.find(x => x.key === key) || VERTICALES[0]
}

// Solo el nombre, sin plataforma: las FAQ y los términos del glosario no tienen
// plataforma, así que `etiqueta()` les sobraría la mitad.
export function labelVertical(vertical) {
  return metaVertical(vertical).label
}

export function etiqueta(l) {
  const v = metaVertical(l.vertical)
  const p = PLATAFORMAS.find(x => x.key === (l.plataforma || 'web')) || PLATAFORMAS[0]
  return { icon: v.icon, texto: `${v.label} · ${p.label}` }
}
```

Exportar el helper de habilitación (hoy la función privada `habilitado` ya existe) y usar `aplicaA` en los dos sitios que comparaban con `===`:

```js
export function verticalHabilitada(settings, vertical) {
  return habilitado(settings, `vertical_${vertical}_enabled`)
}

export function verticalesVisibles(lecciones, settings) {
  const ls = lecciones || []
  return V_KEYS.filter(v => {
    if (!verticalHabilitada(settings, v)) return false
    const plats = plataformasHabilitadas(settings, v)
    return ls.some(l => aplicaA(l, v) && plats.includes(l.plataforma || 'web'))
  })
}
```

Y dentro de `resolverSeleccion`, la línea de `conLecciones`:

```js
  const conLecciones = plats.find(p =>
    ls.some(l => aplicaA(l, v) && (l.plataforma || 'web') === p))
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `node --test tests/vertical.test.mjs`
Expected: PASS — los 14 tests que ya existían siguen verdes más los 11 nuevos.

- [ ] **Step 5: Commit**

```bash
git add js/vertical.js tests/vertical.test.mjs
git commit -m "feat(vertical): aplicaA como regla unica de filtrado y valor 'ambas'"
```

---

## Task 2: `resolverSeleccion` deja de sobrescribir la vertical de Bold

**Files:**
- Modify: `js/vertical.js`
- Test: `tests/vertical.test.mjs`

**Interfaces:**
- Consumes: `aplicaA`, `verticalHabilitada` de la Tarea 1.
- Produces: `resolverSeleccion(lecciones, settings, seleccion, { verticalFija })` — cuarto parámetro nuevo, opcional, default `{ verticalFija: false }`. Con `verticalFija: true` la vertical recibida se respeta aunque no tenga lecciones; solo se resuelve la plataforma.

**Por qué:** hoy `resolverSeleccion` cambia de vertical sola si la elegida no tiene lecciones. Con el selector oculto eso le mostraría a un restaurante contenido de retail sin avisarle. El interruptor del admin sí sigue mandando: es el control deliberado de "todavía no lanzamos".

- [ ] **Step 1: Escribir las pruebas que fallan**

```js
test('resolverSeleccion verticalFija: respeta la vertical aunque no tenga lecciones', () => {
  const ls = [{ vertical: 'retail', plataforma: 'web' }]
  assert.deepEqual(
    resolverSeleccion(ls, {}, { vertical: 'restaurantes', plataforma: 'web' }, { verticalFija: true }),
    { vertical: 'restaurantes', plataforma: 'web' })
})

test('resolverSeleccion verticalFija: sigue resolviendo la plataforma deshabilitada', () => {
  const ls = [{ vertical: 'restaurantes', plataforma: 'mobile' }]
  const settings = { plataforma_restaurantes_web_enabled: 'false' }
  assert.deepEqual(
    resolverSeleccion(ls, settings, { vertical: 'restaurantes', plataforma: 'web' }, { verticalFija: true }),
    { vertical: 'restaurantes', plataforma: 'mobile' })
})

test('resolverSeleccion verticalFija: el switch del admin gana sobre Bold', () => {
  const ls = [{ vertical: 'retail', plataforma: 'web' }]
  const settings = { vertical_restaurantes_enabled: 'false' }
  const r = resolverSeleccion(ls, settings, { vertical: 'restaurantes', plataforma: 'web' }, { verticalFija: true })
  assert.equal(r.vertical, 'retail')
})

test('resolverSeleccion sin verticalFija se comporta igual que antes', () => {
  const ls = [{ vertical: 'retail', plataforma: 'web' }]
  const r = resolverSeleccion(ls, {}, { vertical: 'restaurantes', plataforma: 'web' })
  assert.equal(r.vertical, 'retail')
})
```

- [ ] **Step 2: Correr las pruebas y verificar que fallan**

Run: `node --test tests/vertical.test.mjs`
Expected: FAIL — los tres primeros fallan; el de `verticalFija: true` con vertical sin lecciones devuelve `retail` en vez de `restaurantes`.

- [ ] **Step 3: Implementar**

Reemplazar la firma y el comienzo de `resolverSeleccion` en `js/vertical.js`:

```js
/**
 * Normaliza una selección contra lo que de verdad hay publicado.
 *
 * `verticalFija` se usa cuando Bold POS nos dijo la vertical del comercio: ese
 * dato no se sobrescribe por falta de contenido (sería mostrarle a un
 * restaurante material de retail sin avisarle; para eso está el estado vacío).
 * Lo único que gana sobre Bold es el switch del admin, que es el "todavía no
 * lanzamos" deliberado.
 */
export function resolverSeleccion(lecciones, settings, seleccion = {}, { verticalFija = false } = {}) {
  const { vertical, plataforma } = seleccion

  if (verticalFija && V_KEYS.includes(vertical) && verticalHabilitada(settings, vertical)) {
    const plats = plataformasHabilitadas(settings, vertical)
    if (plats.includes(plataforma)) return { vertical, plataforma }
    const ls = lecciones || []
    const conLecciones = plats.find(p =>
      ls.some(l => aplicaA(l, vertical) && (l.plataforma || 'web') === p))
    return { vertical, plataforma: conLecciones || plats[0] || plataforma }
  }

  const visibles = verticalesVisibles(lecciones, settings)
  if (visibles.includes(vertical) &&
      plataformasHabilitadas(settings, vertical).includes(plataforma)) {
    return { vertical, plataforma }
  }
  if (visibles.length === 0) return seleccion

  const v = visibles[0]
  const plats = plataformasHabilitadas(settings, v)
  const ls = lecciones || []
  const conLecciones = plats.find(p =>
    ls.some(l => aplicaA(l, v) && (l.plataforma || 'web') === p))
  return { vertical: v, plataforma: conLecciones || plats[0] }
}
```

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `node --test tests/vertical.test.mjs`
Expected: PASS — todo verde, incluidos los 7 tests de `resolverSeleccion` que ya existían.

- [ ] **Step 5: Commit**

```bash
git add js/vertical.js tests/vertical.test.mjs
git commit -m "feat(vertical): la vertical que manda Bold ya no se sobrescribe"
```

---

## Task 3: Migración del esquema

**Files:**
- Create: `supabase/migrations/add_vertical_ambas.sql`

**Interfaces:**
- Consumes: nada.
- Produces: `preguntas_frecuentes.vertical` y `glosario.vertical` (`text NOT NULL DEFAULT 'ambas'`), y `lecciones.vertical` aceptando `'ambas'`.

- [ ] **Step 1: Averiguar el nombre real de la constraint**

No asumas que se llama `lecciones_vertical_check`: la creó Postgres y si el nombre no coincide, el `drop ... if exists` no hace nada y el `add` falla por duplicado. Pídele al usuario que corra esto en el SQL Editor y te pase el resultado:

```sql
select con.conname, pg_get_constraintdef(con.oid)
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public' and rel.relname = 'lecciones' and con.contype = 'c';
```

- [ ] **Step 2: Escribir la migración**

Crear `supabase/migrations/add_vertical_ambas.sql` con el nombre de constraint que devolvió el paso 1 (abajo va el nombre por defecto de Postgres; cámbialo si difiere):

```sql
-- Tercer valor de `vertical`: 'ambas', para el contenido que sirve a las dos
-- verticales (ej. "cómo proceso un pago"), y la columna `vertical` en las dos
-- tablas del centro de ayuda que no la tenían.
--
-- El DEFAULT 'ambas' es lo que hace esta migración segura: las FAQ y términos
-- que ya existen siguen visibles para todos los comercios. Nadie tiene que
-- reclasificar contenido antes del deploy; se marca después, ítem por ítem.
--
-- Las lecciones NO se tocan: siguen en retail/restaurantes y 'ambas' queda
-- disponible de aquí en adelante.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase, ANTES de
-- desplegar el frontend que usa estos valores.

alter table public.lecciones drop constraint if exists lecciones_vertical_check;
alter table public.lecciones add constraint lecciones_vertical_check
  check (vertical in ('retail', 'restaurantes', 'ambas'));

alter table public.preguntas_frecuentes
  add column if not exists vertical text not null default 'ambas'
    check (vertical in ('retail', 'restaurantes', 'ambas'));

alter table public.glosario
  add column if not exists vertical text not null default 'ambas'
    check (vertical in ('retail', 'restaurantes', 'ambas'));

-- ---------------------------------------------------------------------------
-- Control 1: las 3 columnas aceptan los mismos 3 valores. Debe listar 3 filas.
select rel.relname, pg_get_constraintdef(con.oid)
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname in ('lecciones', 'preguntas_frecuentes', 'glosario')
  and pg_get_constraintdef(con.oid) ilike '%ambas%';

-- Control 2: ninguna fila quedó sin vertical. Las 3 cuentas de null deben ser 0
-- y las de 'ambas' deben igualar el total de FAQ y de términos.
select 'preguntas_frecuentes' as tabla, count(*) filter (where vertical is null) as nulos,
       count(*) filter (where vertical = 'ambas') as ambas, count(*) as total
from public.preguntas_frecuentes
union all
select 'glosario', count(*) filter (where vertical is null),
       count(*) filter (where vertical = 'ambas'), count(*)
from public.glosario;
```

- [ ] **Step 3: Pedirle al usuario que la ejecute**

El agente no ejecuta migraciones. Avísale al usuario que la corra en el SQL Editor y que confirme la salida de los dos controles.

- [ ] **Step 4: Verificar por REST, no por la UI**

`supabase-js` no lanza en error y un `?? 0` en el render fabrica datos creíbles, así que la comprobación va contra PostgREST crudo. La clave anon está en `js/supabase.js`.

```bash
K=$(grep -oP "(?<=SUPABASE_ANON_KEY = ')[^']+" js/supabase.js)
curl -s "https://tczcngfhuendmldafbrc.supabase.co/rest/v1/preguntas_frecuentes?select=id,vertical&limit=3" \
  -H "apikey: $K" -H "Authorization: Bearer $K"
curl -s "https://tczcngfhuendmldafbrc.supabase.co/rest/v1/glosario?select=id,vertical&limit=3" \
  -H "apikey: $K" -H "Authorization: Bearer $K"
```

Expected: las dos respuestas traen `"vertical":"ambas"` en cada fila. Si viene `{"code":"42703"}` la columna no existe y la migración no corrió.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/add_vertical_ambas.sql
git commit -m "feat(db): 'ambas' como tercera vertical y columna vertical en FAQ y glosario"
```

---

## Task 4: `match_lessons` reconoce `'ambas'`

**Files:**
- Create: `supabase/migrations/update_match_lessons_ambas.sql`

**Interfaces:**
- Consumes: la Tarea 3 (el constraint ya acepta `'ambas'`).
- Produces: `match_lessons(query_embedding, match_count, match_threshold, p_vertical, p_plataforma)` devolviendo también las lecciones `'ambas'` cuando `p_vertical` no es null.

- [ ] **Step 1: Confirmar cuál es la versión vigente**

La base es `update_match_lessons_activas.sql` (la más reciente: incluye `notas`, `active` y `bot_active`). Confirma que es la que está viva antes de reescribirla:

```sql
select pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'match_lessons';
```

Expected: el cuerpo contiene `l.notas`, `l.active IS NOT FALSE` y `l.bot_active IS NOT FALSE`. Si no, para y avisa: alguien la cambió por fuera.

- [ ] **Step 2: Escribir la migración**

Crear `supabase/migrations/update_match_lessons_ambas.sql`:

```sql
-- match_lessons deja de esconderle al bot las lecciones marcadas 'ambas'.
--
-- La condición replica exactamente la de aplicaA() en js/vertical.js. Si
-- cambias una, cambia la otra: son la misma regla escrita dos veces porque
-- viven en dos runtimes.
--
-- Base: update_match_lessons_activas.sql (la vigente: trae notas, active y
-- bot_active). El tipo de retorno no cambia, así que CREATE OR REPLACE basta
-- sin DROP previo y ningún llamador se entera.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

CREATE OR REPLACE FUNCTION public.match_lessons(query_embedding vector, match_count integer DEFAULT 5, match_threshold double precision DEFAULT 0.15, p_vertical text default null, p_plataforma text default null)
 RETURNS TABLE(id uuid, titulo text, categoria text, contenido text, notas text, similarity double precision, vertical text, plataforma text)
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
  BEGIN
    RETURN QUERY
    SELECT l.id, l.titulo, l.categoria, l.contenido, l.notas,
      1 - (l.embedding <=> query_embedding) AS similarity,
      l.vertical, l.plataforma
    FROM lecciones l
    WHERE l.embedding IS NOT NULL
      AND l.active IS NOT FALSE
      AND l.bot_active IS NOT FALSE
      AND 1 - (l.embedding <=> query_embedding) > match_threshold
      AND (p_vertical IS NULL OR l.vertical = p_vertical OR l.vertical = 'ambas')
      AND (p_plataforma IS NULL OR l.plataforma = p_plataforma)
    ORDER BY l.embedding <=> query_embedding
    LIMIT match_count;
  END;
  $function$;

-- ---------------------------------------------------------------------------
-- Control: la firma no se movió (debe seguir apareciendo `notas text`).
select pg_get_function_arguments(p.oid) as argumentos,
       pg_get_function_result(p.oid)    as retorno
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'match_lessons';
```

- [ ] **Step 3: Pedirle al usuario que la ejecute y confirme el control**

Expected del control: `retorno` incluye `notas text`. Si se perdió, el prompt de n8n deja de recibir el campo Notas de la lección.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/update_match_lessons_ambas.sql
git commit -m "feat(bot): match_lessons sirve tambien las lecciones marcadas 'ambas'"
```

---

# Tanda 2 — Portal

## Task 5: `isStaff()` se muda a `utils.js`

**Files:**
- Modify: `js/utils.js`
- Modify: `js/lessons.js:25-34` (borrar la definición local, importar)
- Test: `tests/utils.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces: `isStaff() -> boolean` exportada desde `js/utils.js`.

**Por qué acá:** hoy `isStaff()` es privada de `lessons.js`, que importa `supabase.js` (URL de CDN) y toca el DOM — o sea, **no se puede probar desde Node**. La Tarea 6 la vuelve load-bearing: pasa a decidir si un comercio puede ver contenido de otra vertical, que es comportamiento con consecuencias. Moverla a `utils.js` es lo que permite escribirle pruebas. Va a `utils.js` y no a `vertical.js` porque es modo de operación del portal, no algo propio de las verticales.

(La Tarea 7 **no** la usa: `resources.js` filtra con `getSeleccion().vertical`, que en modo staff ya refleja lo que el staff eligió a mano. Si lees una versión anterior del plan que decía lo contrario, estaba equivocada.)

- [ ] **Step 1: Escribir la prueba que falla**

`isStaff()` toca `window` y `localStorage`, que en Node no existen. La prueba los simula. Agregar al final de `tests/utils.test.mjs` (y sumar `isStaff` al import de arriba):

```js
// isStaff lee window.location.search y localStorage; en Node no existen, así
// que se montan mínimos antes de importar nada que los use.
function conEntorno({ search = '', store = {} } = {}) {
  globalThis.window = { location: { search } }
  globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: k => { delete store[k] },
  }
  return store
}

test('isStaff: sin parámetro ni marca guardada es false', () => {
  conEntorno()
  assert.equal(isStaff(), false)
})

test('isStaff: ?staff=1 activa y queda recordado', () => {
  const store = conEntorno({ search: '?staff=1' })
  assert.equal(isStaff(), true)
  assert.equal(store.bold_staff, '1')
  conEntorno({ search: '', store })
  assert.equal(isStaff(), true)
})

test('isStaff: ?staff=0 lo apaga', () => {
  const store = conEntorno({ search: '?staff=0', store: { bold_staff: '1' } })
  assert.equal(isStaff(), false)
  assert.equal(store.bold_staff, undefined)
})

test('isStaff: un entorno sin window devuelve false en vez de lanzar', () => {
  delete globalThis.window
  delete globalThis.localStorage
  assert.equal(isStaff(), false)
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test tests/utils.test.mjs`
Expected: FAIL — `does not provide an export named 'isStaff'`

- [ ] **Step 3: Mover la función**

Agregar al final de `js/utils.js` (copia literal de la que está hoy en `lessons.js:27`):

```js
// Modo staff: se activa una vez con ?staff=1 en la URL (queda recordado en el
// navegador) y se desactiva con ?staff=0. Controla herramientas internas y el
// escape para ver la vertical contraria cuando Bold POS ya fijó una.
export function isStaff() {
  try {
    const p = new URLSearchParams(window.location.search)
    if (p.get('staff') === '1') localStorage.setItem('bold_staff', '1')
    else if (p.get('staff') === '0') localStorage.removeItem('bold_staff')
    return localStorage.getItem('bold_staff') === '1'
  } catch { return false }
}
```

En `js/lessons.js`: borrar las líneas 25-34 (el comentario y la función `isStaff`) y sumar `isStaff` al import que ya trae `escapeHtml` de `./utils.js`.

- [ ] **Step 4: Correr las pruebas y verificar que pasan**

Run: `node --test tests/utils.test.mjs`
Expected: PASS

- [ ] **Step 5: Verificar que no quedaron referencias rotas**

Run: `grep -n "isStaff" js/lessons.js js/utils.js`
Expected: en `lessons.js` solo el import y los usos (línea ~227), ninguna definición; en `utils.js` la definición exportada.

- [ ] **Step 6: Commit**

```bash
git add js/utils.js js/lessons.js tests/utils.test.mjs
git commit -m "refactor(portal): isStaff se mueve a utils para poder probarla"
```

---

## Task 6: El portal oculta la tarjeta de vertical

**Files:**
- Modify: `js/lessons.js` (import, `selectorHtml` línea ~82, las dos llamadas a `resolverSeleccion`)

**Interfaces:**
- Consumes: `resolverSeleccion(..., { verticalFija })` de la Tarea 2, `isStaff()` de la Tarea 5, `getContextoBold()` de `js/bold-context.js`.
- Produces: nada que consuman otras tareas.

- [ ] **Step 1: Agregar el helper y cambiar la condición del selector**

En los imports de `js/lessons.js`, sumar `getContextoBold` al import que ya trae `onContextoBold` y `seleccionDesdeContexto` de `./bold-context.js`.

Agregar arriba de `selectorHtml` (alrededor de la línea 79):

```js
// Bold POS nos dice la vertical del comercio, así que elegirla a mano no tiene
// sentido: se oculta la tarjeta. El chip Web/Mobile SÍ se queda — Bold no manda
// `platform` (va fijo en 'web'), y sin el chip nadie podría llegar a las
// lecciones Mobile. ?staff=1 devuelve el selector para que soporte pueda
// revisar la vertical contraria.
function verticalFijadaPorBold() {
  return !!getContextoBold()?.vertical && !isStaff()
}
```

Cambiar la línea 82:

```js
    const showVerticales  = verticalesShown.length >= 2 && !verticalFijadaPorBold()
```

- [ ] **Step 2: Pasar la bandera a `resolverSeleccion`**

Son **tres** llamadas, no dos. Todas llevan el mismo cuarto argumento `{ verticalFija: verticalFijadaPorBold() }`:

1. **Línea ~61**, el arranque: `resolverSeleccion(allLessons, settings, seleccionGuardada)`
2. **Línea ~415**, dentro de `applySeleccion`: `resolverSeleccion(allLessons, settings, getSeleccion())`
3. **Línea ~575**, dentro de `refreshLessons()`: `resolverSeleccion(allLessons, settings, sel)`

La tercera es la que más importa y es fácil de pasar por alto: `refreshLessons()` corre en cada actualización realtime de la tabla `lecciones`. Si se queda sin la bandera, basta con que alguien edite una lección para que el portal voltee en silencio a un comercio de restaurantes hacia Retail — exactamente lo que la decisión 3 del spec existe para impedir.

Run: `grep -n "resolverSeleccion(" js/lessons.js`
Expected: **tres** llamadas, y las tres con `{ verticalFija: verticalFijadaPorBold() }`.

- [ ] **Step 3: Verificar que los tests existentes siguen verdes**

Run: `node --test tests/vertical.test.mjs tests/utils.test.mjs`
Expected: PASS. (`lessons.js` no tiene pruebas unitarias: depende del DOM y de supabase. Se verifica en navegador en la Tarea 14.)

- [ ] **Step 4: Commit**

```bash
git add js/lessons.js
git commit -m "feat(portal): ocultar la tarjeta de vertical cuando Bold POS ya la dicto"
```

---

## Task 7: FAQ y glosario filtran por vertical

**Files:**
- Modify: `js/resources.js` (imports, `loadFaq`, `loadGlossary`, y la suscripción al contexto)

**Interfaces:**
- Consumes: `aplicaA`, `getSeleccion` de `js/vertical.js`; `onContextoBold` de `js/bold-context.js`.
- Produces: nada que consuman otras tareas.

**Nota:** la sub-pestaña de **material de apoyo no se toca** (fuera de alcance). Y esta pestaña no lleva selector visible: la vertical la decide Bold.

- [ ] **Step 1: Importar lo necesario**

Al inicio de `js/resources.js`, debajo del import de `supabase`:

```js
import { aplicaA, getSeleccion } from './vertical.js'
import { onContextoBold } from './bold-context.js'
```

Verifica si `escapeHtml` ya está importado en el archivo; si no lo está, no lo agregues: ya se usa en el código actual, así que debe venir de algún lado.

- [ ] **Step 2: Filtrar las FAQ**

En `loadFaq`, cambiar el `select` para traer la columna y filtrar en el render. La consulta:

```js
  const { data, error } = await supabase.from('preguntas_frecuentes').select('*, vertical').order('orden').order('created_at')
```

(`select('*')` ya trae la columna nueva; se deja explícito para que se lea la intención.)

Reemplazar las últimas líneas de `loadFaq` — desde `renderFaqList(data)` hasta el `return` — por:

```js
  // El filtro por vertical se aplica en cada render, no una vez sobre `data`:
  // el contexto de Bold puede llegar después de esta carga, y entonces el
  // repintado tiene que usar la vertical nueva.
  const visibles = () => data.filter(f => aplicaA(f, getSeleccion().vertical))

  renderFaqList(visibles())

  return (q) => {
    const lower = q ? q.toLowerCase() : ''
    renderFaqList(lower
      ? visibles().filter(f => f.pregunta.toLowerCase().includes(lower) || f.respuesta.toLowerCase().includes(lower))
      : visibles())
  }
```

- [ ] **Step 3: Filtrar el glosario**

Mismo patrón en `loadGlossary`. Reemplazar desde `render(data)` hasta el `return` por:

```js
  const visibles = () => data.filter(g => aplicaA(g, getSeleccion().vertical))

  render(visibles())

  return (q) => {
    const lower = q ? q.toLowerCase() : ''
    render(lower
      ? visibles().filter(g => g.termino.toLowerCase().includes(lower) || g.definicion.toLowerCase().includes(lower))
      : visibles())
  }
```

- [ ] **Step 4: Repintar cuando llega el contexto de Bold**

`filterFaq` y `filterGlossary` ya viven en el scope del módulo (líneas 5-7). Agregar al final de `js/resources.js`:

```js
// Si el contexto de Bold llega después de que la pestaña ya cargó, hay que
// repintar con la vertical nueva. Se conserva lo que el usuario tenga escrito
// en el buscador: repintar no debería borrarle la búsqueda.
onContextoBold(() => {
  const q = document.getElementById('resourceSearch')?.value || ''
  filterFaq(q)
  filterGlossary(q)
})
```

- [ ] **Step 5: Verificar que el módulo sigue cargando**

`resources.js` importa `supabase.js` (URL de CDN), así que no se puede importar desde Node. La verificación es en navegador, en la Tarea 14. Acá basta confirmar que no hay errores de sintaxis:

Run: `node --input-type=module --check < js/resources.js`
Expected: sin salida y exit 0. **No uses `node --check js/resources.js`**: sobre un archivo con `import` ese comando sale 0 siempre, incluso con el archivo roto — verificado en Node v24.18.0. El `--input-type=module` con redirección sí falla (exit 1) cuando hay error de sintaxis.

- [ ] **Step 6: Commit**

```bash
git add js/resources.js
git commit -m "feat(portal): FAQ y glosario filtran por la vertical del comercio"
```

---

## Task 8: El `faq_context` que va al bot sale filtrado

**Files:**
- Modify: `js/assistant.js` (`loadFaqContext` línea ~33, la llamada a `chatRequestBody` línea ~725)
- Test: `tests/clarify.test.mjs`

**Interfaces:**
- Consumes: `aplicaA` de `js/vertical.js`.
- Produces: nada. `js/clarify.js` **no cambia**: sigue siendo puro y recibe las FAQ ya filtradas.

- [ ] **Step 1: Escribir la prueba que falla**

`chatRequestBody` ya existe y es pura. La prueba fija el contrato de que lo que reciba es lo que manda, para que nadie mueva el filtrado adentro de `clarify.js`. Agregar a `tests/clarify.test.mjs`:

```js
test('chatRequestBody manda la vertical y las FAQ tal cual las recibe', () => {
  const faqs = [{ pregunta: 'a', respuesta: 'b' }]
  const body = chatRequestBody({
    message: 'hola', history: [], faqContext: faqs, clarifyCount: 0,
    seleccion: { vertical: 'restaurantes', plataforma: 'web' },
  })
  assert.equal(body.vertical, 'restaurantes')
  assert.equal(body.plataforma, 'web')
  assert.deepEqual(body.faq_context, faqs)
})
```

- [ ] **Step 2: Correr y ver el resultado**

Run: `node --test tests/clarify.test.mjs`
Expected: PASS de una — `chatRequestBody` ya esparce `seleccion`. Es una prueba de regresión que fija el contrato antes de tocar `assistant.js`; si falla, algo se rompió y hay que parar.

- [ ] **Step 3: Traer la columna en `loadFaqContext`**

En `js/assistant.js`, sumar `aplicaA` al import que ya trae `getSeleccion` de `./vertical.js`, y cambiar el `select`:

```js
      .select('pregunta, respuesta, vertical')
```

El cache sigue guardando **todas** las FAQ: el filtro va en el envío, no en la carga.

- [ ] **Step 4: Filtrar al armar el body**

En la llamada a `chatRequestBody` (línea ~725), reemplazar `faqContext: cachedFaqs` por el filtrado, apoyándose en que `getSeleccion()` ya se llama ahí mismo:

```js
      body: JSON.stringify(chatRequestBody(((sel) => ({
        message: text, history,
        // Filtrar acá y no en loadFaqContext: el contexto de Bold puede llegar
        // después de la carga inicial de FAQs, y el primer mensaje ya tiene que
        // salir con las de la vertical correcta.
        faqContext: cachedFaqs.filter(f => aplicaA(f, sel.vertical)),
        clarifyCount, seleccion: sel, contexto: getContextoBold(),
      }))(getSeleccion())))
```

Si esa expresión te resulta densa, sácala a una variable antes del `fetch`:

```js
    const sel = getSeleccion()
    const faqsDeLaVertical = cachedFaqs.filter(f => aplicaA(f, sel.vertical))
```

y usa `faqContext: faqsDeLaVertical, seleccion: sel` en el objeto. Prefiere esta segunda forma: se lee mejor.

- [ ] **Step 5: Correr las pruebas**

Run: `node --test tests/clarify.test.mjs tests/vertical.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add js/assistant.js tests/clarify.test.mjs
git commit -m "feat(bot): mandar al webhook solo las FAQ de la vertical del comercio"
```

---

# Tanda 3 — Admin

## Task 9: Lecciones con `'ambas'` en el panel de admin

**Files:**
- Modify: `js/admin.js` (markup del toggle línea ~591, filtro línea ~990, badges líneas ~1096 y ~1143, botones duplicar líneas ~1117 y ~1159)
- Modify: `js/lesson-duplicate.js`
- Test: `tests/lesson-duplicate.test.mjs`

**Interfaces:**
- Consumes: `aplicaA`, `etiqueta`, `VERTICALES_CONTENIDO` de la Tarea 1.
- Produces: `puedeDuplicarse(leccion) -> boolean` exportada desde `js/lesson-duplicate.js`.

- [ ] **Step 1: Escribir la prueba que falla**

Agregar a `tests/lesson-duplicate.test.mjs` (y sumar `puedeDuplicarse` al import):

```js
test('puedeDuplicarse: una lección ambas ya está en las dos verticales', () => {
  assert.equal(puedeDuplicarse({ vertical: 'ambas' }), false)
})

// otraVertical no sabe de 'ambas' (su else devuelve 'restaurantes'). Este test
// documenta ese comportamiento para que quede claro POR QUÉ hace falta el
// guardia de puedeDuplicarse en vez de "arreglar" otraVertical.
test('otraVertical con ambas cae al else: por eso el guardia va aparte', () => {
  assert.equal(otraVertical('ambas'), 'restaurantes')
})

test('puedeDuplicarse: retail y restaurantes sí se pueden duplicar', () => {
  assert.equal(puedeDuplicarse({ vertical: 'retail' }), true)
  assert.equal(puedeDuplicarse({ vertical: 'restaurantes' }), true)
  assert.equal(puedeDuplicarse({}), true)
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --test tests/lesson-duplicate.test.mjs`
Expected: FAIL — `does not provide an export named 'puedeDuplicarse'`

- [ ] **Step 3: Implementar en `js/lesson-duplicate.js`**

Agregar debajo de `otraVertical`:

```js
// Duplicar una lección 'ambas' no significa nada: ya sirve a las dos verticales,
// y otraVertical('ambas') devolvería 'restaurantes' por el else del ternario.
export function puedeDuplicarse(leccion) {
  return (leccion?.vertical || 'retail') !== 'ambas'
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --test tests/lesson-duplicate.test.mjs`
Expected: PASS

- [ ] **Step 5: Tercera opción en el toggle del formulario**

En `js/admin.js`, dentro de `<div id="lessonVertical" class="flex gap-2">` (línea ~592), agregar un tercer botón después del de Restaurantes:

```html
                  <button type="button" data-value="ambas" class="choice-opt flex-1 rounded-xl border-[1.5px] border-[var(--blue-20)] px-2 py-2 text-center text-[var(--black-60)] transition-colors">
                    <i data-lucide="layers" class="w-4 h-4 mx-auto mb-0.5"></i>
                    <span class="block text-[11px] font-black">Ambas</span>
                  </button>
```

`getChoice` y `setChoice` son genéricos (leen `data-value`), así que no hay que tocarlos.

- [ ] **Step 6: Arreglar el filtro del listado**

En `renderGroupedLessons` (línea ~990), la comparación estricta desaparecería una lección `'ambas'` de las dos pestañas. Sumar `aplicaA` al import de `./vertical.js` en `js/admin.js` y reemplazar:

```js
  const porVertical = allLessons.filter(l =>
    aplicaA(l, adminVertical) &&
    (adminPlataforma === 'all' || (l.plataforma || 'web') === adminPlataforma))
```

- [ ] **Step 7: Deduplicar los badges**

La etiqueta "Retail · Web" está escrita a mano con un ternario de dos ramas en `lessonCardHtml` (~1096) y `lessonCardGridHtml` (~1143), mientras `vertical.js` ya exporta `etiqueta()`. Sumar `etiqueta` al import y reemplazar **los dos** bloques por:

```js
            <i data-lucide="${etiqueta(l).icon}" class="w-3 h-3"></i>
            ${escapeHtml(etiqueta(l).texto)}
```

respetando la indentación de cada sitio (el de `lessonCardGridHtml` va con menos sangría).

- [ ] **Step 8: Deshabilitar el botón de duplicar en las lecciones `'ambas'`**

En `lessonCardHtml` y `lessonCardGridHtml`, la línea `const destino = otraVertical(l.vertical)` pasa a:

```js
  const dup = puedeDuplicarse(l)
  const destino = otraVertical(l.vertical)
```

Y en los dos botones `.dup-lesson` (líneas ~1117 y ~1159) agregar el atributo y el título alterno. Para el de `lessonCardHtml`:

```html
        <button data-id="${l.id}" ${dup ? '' : 'disabled'} class="dup-lesson p-1.5 rounded-lg ${dup ? 'hover:bg-[var(--blue-10)] text-[var(--black-40)] hover:text-[var(--blue-100)]' : 'text-[var(--black-10)] cursor-not-allowed'}" title="${dup ? `Duplicar en ${destino === 'retail' ? 'Retail' : 'Restaurantes'}` : 'Ya sirve a las dos verticales'}">
```

Para el de `lessonCardGridHtml`, el mismo cambio sobre su clase (`flex-1 flex items-center justify-center py-1 rounded-lg`).

Sumar `puedeDuplicarse` al import de `./lesson-duplicate.js` en `js/admin.js`.

- [ ] **Step 9: Verificar sintaxis y pruebas**

Run: `node --input-type=module --check < js/admin.js && node --test tests/lesson-duplicate.test.mjs tests/vertical.test.mjs`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add js/admin.js js/lesson-duplicate.js tests/lesson-duplicate.test.mjs
git commit -m "feat(admin): lecciones marcables como 'ambas' y badges unificados en etiqueta()"
```

---

## Task 10: Vertical en el panel de FAQ

**Files:**
- Modify: `js/admin.js` (`renderFaqPanel`, líneas ~1706-1845)

**Interfaces:**
- Consumes: `aplicaA`, `labelVertical`, `VERTICALES_CONTENIDO` de la Tarea 1.
- Produces: nada.

- [ ] **Step 1: Chips de filtro por vertical**

En `renderFaqPanel`, agregar una variable de estado arriba de `renderList`:

```js
  let faqVertical = 'all'   // 'all' | 'retail' | 'restaurantes'
```

Y en el `el.innerHTML`, justo antes del `<input id="searchFaq"...>`:

```html
    <div id="faqVerticalChips" class="flex gap-2 mb-3">
      <button data-v="all" class="faq-vchip px-3 py-1.5 rounded-full text-xs font-bold border border-[var(--blue-100)] bg-[var(--blue-10)] text-[var(--blue-100)]">Todas</button>
      <button data-v="retail" class="faq-vchip px-3 py-1.5 rounded-full text-xs font-bold border border-[var(--blue-20)] text-[var(--black-60)]">Retail</button>
      <button data-v="restaurantes" class="faq-vchip px-3 py-1.5 rounded-full text-xs font-bold border border-[var(--blue-20)] text-[var(--black-60)]">Restaurantes</button>
    </div>
```

- [ ] **Step 2: Aplicar el filtro y pintar el badge**

Agregar un helper y usarlo en el render inicial y en el buscador:

```js
  // 'all' muestra todo; una vertical concreta muestra las suyas MÁS las 'ambas'.
  const visiblesFaq = () => faqVertical === 'all'
    ? items
    : items.filter(f => aplicaA(f, faqVertical))
```

En `el.innerHTML`, cambiar `${renderList(items)}` por `${renderList(visiblesFaq())}`.

En `renderList`, dentro del `<div class="flex items-center gap-1.5 flex-wrap">`, después de los badges de lección y link:

```html
            <span class="text-[10px] font-bold bg-[var(--background-page)] text-[var(--black-40)] px-1.5 py-0.5 rounded-full">${escapeHtml(labelVertical(f.vertical))}</span>
```

(`labelVertical` da solo el nombre; `etiqueta()` traería además la plataforma, que una FAQ no tiene. Súmala al import de `./vertical.js` en `js/admin.js`.)

Y en el botón `.edit-faq`, agregar el dato para que el formulario lo reciba:

```html
            data-vertical="${escapeHtml(f.vertical || 'ambas')}"
```

- [ ] **Step 3: Cablear los chips**

Después de `lucide.createIcons()`, junto al listener de `searchFaq`:

```js
  document.querySelectorAll('.faq-vchip').forEach(b => b.addEventListener('click', () => {
    faqVertical = b.dataset.v
    document.querySelectorAll('.faq-vchip').forEach(x => {
      const on = x.dataset.v === faqVertical
      x.classList.toggle('border-[var(--blue-100)]', on)
      x.classList.toggle('bg-[var(--blue-10)]', on)
      x.classList.toggle('text-[var(--blue-100)]', on)
      x.classList.toggle('border-[var(--blue-20)]', !on)
      x.classList.toggle('text-[var(--black-60)]', !on)
    })
    document.getElementById('searchFaq').value = ''
    document.getElementById('faqList').innerHTML = renderList(visiblesFaq())
    bindFaqActions()
  }))
```

Y en el listener de `searchFaq`, cambiar `items.filter(...)` por `visiblesFaq().filter(...)`.

- [ ] **Step 4: Selector de vertical en el formulario**

En `faqFormInline`, después del campo de Respuesta y antes de "Lección relacionada":

```html
      <label class="block text-[9px] font-black uppercase tracking-widest text-[var(--black-40)] mb-1">Vertical</label>
      <select id="faqVertical" class="w-full px-3 py-2 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)] mb-2 bg-white">
        ${VERTICALES_CONTENIDO.map(v => `<option value="${v.key}">${v.label}</option>`).join('')}
      </select>
```

- [ ] **Step 5: Leer y escribir el campo**

`showFaqForm` gana un parámetro al final (default `'ambas'`, que es el default de altas nuevas):

```js
  function showFaqForm(id = '', pregunta = '', respuesta = '', leccionId = '', linkUrl = '', vertical = 'ambas') {
    document.getElementById('faqVertical').value = vertical
```

(pon esa línea junto a las otras asignaciones del formulario)

En `bindFaqActions`, pasar el dato nuevo:

```js
      showFaqForm(b.dataset.id, b.dataset.pregunta, b.dataset.respuesta, b.dataset.leccionId || '', b.dataset.linkUrl || '', b.dataset.vertical || 'ambas')))
```

En el handler de `saveFaq`, leer el valor y sumarlo a los dos payloads:

```js
    const vertical = document.getElementById('faqVertical').value || 'ambas'
```

```js
      ? await supabase.from('preguntas_frecuentes').update({ pregunta, respuesta, leccion_id, link_url, vertical }).eq('id', id).select('id').single()
      : await supabase.from('preguntas_frecuentes').insert({ pregunta, respuesta, leccion_id, link_url, vertical }).select('id').single()
```

- [ ] **Step 6: Verificar sintaxis**

Run: `node --input-type=module --check < js/admin.js`
Expected: sin salida.

- [ ] **Step 7: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): vertical en el panel de preguntas frecuentes"
```

---

## Task 11: Vertical en el panel de glosario

**Files:**
- Modify: `js/admin.js` (`renderGlossaryPanel`, líneas ~1857-1965)

**Interfaces:**
- Consumes: lo mismo que la Tarea 10.
- Produces: nada.

**Nota:** es el mismo patrón que la Tarea 10 pero sobre otros ids (`glosarioList`, `searchGlosario`, `termFormInline`, `.glos-item`, `.edit-term`). Se repite el código a propósito: quien ejecute esta tarea puede no haber visto la anterior.

- [ ] **Step 1: Estado y chips**

En `renderGlossaryPanel`, arriba de `renderList`:

```js
  let glosVertical = 'all'
  const visiblesGlos = () => glosVertical === 'all'
    ? items
    : items.filter(g => aplicaA(g, glosVertical))
```

En el `el.innerHTML`, antes del `<input id="searchGlosario"...>`:

```html
    <div id="glosVerticalChips" class="flex gap-2 mb-3">
      <button data-v="all" class="glos-vchip px-3 py-1.5 rounded-full text-xs font-bold border border-[var(--blue-100)] bg-[var(--blue-10)] text-[var(--blue-100)]">Todas</button>
      <button data-v="retail" class="glos-vchip px-3 py-1.5 rounded-full text-xs font-bold border border-[var(--blue-20)] text-[var(--black-60)]">Retail</button>
      <button data-v="restaurantes" class="glos-vchip px-3 py-1.5 rounded-full text-xs font-bold border border-[var(--blue-20)] text-[var(--black-60)]">Restaurantes</button>
    </div>
```

Y cambiar `${renderList(items)}` por `${renderList(visiblesGlos())}`.

- [ ] **Step 2: Badge y dato en el listado**

En `renderList`, después del `<p>` del término:

```html
          <span class="text-[10px] font-bold bg-[var(--background-page)] text-[var(--black-40)] px-1.5 py-0.5 rounded-full">${escapeHtml(labelVertical(g.vertical))}</span>
```

Y en el botón `.edit-term`:

```html
            data-vertical="${escapeHtml(g.vertical || 'ambas')}"
```

- [ ] **Step 3: Cablear los chips**

```js
  document.querySelectorAll('.glos-vchip').forEach(b => b.addEventListener('click', () => {
    glosVertical = b.dataset.v
    document.querySelectorAll('.glos-vchip').forEach(x => {
      const on = x.dataset.v === glosVertical
      x.classList.toggle('border-[var(--blue-100)]', on)
      x.classList.toggle('bg-[var(--blue-10)]', on)
      x.classList.toggle('text-[var(--blue-100)]', on)
      x.classList.toggle('border-[var(--blue-20)]', !on)
      x.classList.toggle('text-[var(--black-60)]', !on)
    })
    document.getElementById('searchGlosario').value = ''
    document.getElementById('glosarioList').innerHTML = renderList(visiblesGlos())
    bindGlosarioActions()
  }))
```

Y en el listener de `searchGlosario`, cambiar `items.filter(...)` por `visiblesGlos().filter(...)`.

- [ ] **Step 4: Selector en el formulario**

En `termFormInline`, después del textarea de Definición:

```html
      <label class="block text-[9px] font-black uppercase tracking-widest text-[var(--black-40)] mb-1">Vertical</label>
      <select id="termVertical" class="w-full px-3 py-2 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)] mb-2 bg-white">
        ${VERTICALES_CONTENIDO.map(v => `<option value="${v.key}">${v.label}</option>`).join('')}
      </select>
```

- [ ] **Step 5: Leer y escribir el campo**

`showForm` gana el parámetro:

```js
  function showForm(id = '', term = '', def = '', vertical = 'ambas') {
    document.getElementById('termVertical').value = vertical
```

`bindGlosarioActions` lo pasa:

```js
      showForm(b.dataset.id, b.dataset.term, b.dataset.def, b.dataset.vertical || 'ambas')))
```

Y el `payload` de `saveTerm`:

```js
    const payload = {
      termino:    document.getElementById('termTermino').value.trim(),
      definicion: document.getElementById('termDefinicion').value.trim(),
      vertical:   document.getElementById('termVertical').value || 'ambas',
    }
```

- [ ] **Step 6: Verificar sintaxis**

Run: `node --input-type=module --check < js/admin.js`
Expected: sin salida.

- [ ] **Step 7: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): vertical en el panel de glosario"
```

---

# Tanda 4 — El bot en n8n

## Task 12: n8n pasa la vertical al retrieval y al prompt

**Files:**
- Create: `docs/superpowers/backups/2026-09-14-bold-pos-chat.json`
- Modifica el workflow `Bold POS Chat` (`dZGuYJbRbG6h8aqv`) en `https://n8n.mplasesores.com` — no hay archivo en el repo.

**Interfaces:**
- Consumes: `match_lessons` con `'ambas'` (Tarea 4); el body ya trae `vertical` desde `chatRequestBody` (Tarea 8).
- Produces: nada.

**Cuidados documentados que aplican acá:**
- Al editar `jsCode` por la API, un `\n` dentro de un string JS debe quedar como **barra invertida + n literal**, no como salto de línea real, o el Code node tira `Invalid or unexpected token` y tumba el bot.
- En el `PUT`, filtrar `settings` a las claves que acepta la API pública (`executionOrder`, `errorWorkflow`, `saveManual*`, `timezone`, `executionTimeout`) o rechaza con `settings must NOT have additional properties`.
- El frontend manda el mensaje actual **también** como último item de `history`.

- [ ] **Step 1: Respaldar el workflow**

La API key está dentro de los comandos `curl` ya aprobados en las entradas de permisos de `.claude/settings.local.json`. Sácala de ahí a una variable de entorno para no repetirla ni dejarla en el historial de comandos:

```bash
N8N_KEY=$(grep -oP '(?<=X-N8N-API-KEY: )[A-Za-z0-9._-]+' .claude/settings.local.json | head -1)
test -n "$N8N_KEY" && echo "key encontrada (${#N8N_KEY} chars)" || echo "NO se encontro la key: pidesela al usuario"
```

```bash
curl -s -H "X-N8N-API-KEY: $N8N_KEY" \
  "https://n8n.mplasesores.com/api/v1/workflows/dZGuYJbRbG6h8aqv" \
  > docs/superpowers/backups/2026-09-14-bold-pos-chat.json
```

Verifica que el respaldo sirve antes de seguir:

Run: `node -e "const w=require('./docs/superpowers/backups/2026-09-14-bold-pos-chat.json'); console.log(w.name, w.nodes.length)"`
Expected: `Bold POS Chat` y un número de nodos mayor que 10. Si sale `undefined`, la llamada falló (probablemente la key) — para acá.

- [ ] **Step 2: Volcar los parámetros del nodo "Buscar lecciones"**

```bash
node -e "const w=require('./docs/superpowers/backups/2026-09-14-bold-pos-chat.json'); const n=w.nodes.find(x=>x.name==='Buscar lecciones'); console.log(n.type, n.typeVersion); console.log(JSON.stringify(n.parameters,null,2))"
```

Necesitas ver cómo manda hoy `query_embedding`, `match_count` y `match_threshold` para agregar `p_vertical` **en esa misma forma** (si es un `jsonBody` de HTTP Request, va como una clave más del JSON; si es `bodyParameters`, como una entrada más del arreglo).

- [ ] **Step 3: Agregar `p_vertical` al nodo**

El valor sale del body del webhook. En una expresión de n8n:

```
{{ $('Webhook').item.json.body.vertical || null }}
```

**`p_plataforma` NO se manda** (queda en su default `null`). La plataforma no viene de Bold: sale del chip del usuario, con `web` por defecto. Filtrar por ella haría que un comercio que usa la app móvil deje de encontrar respuestas que sí existen, y el síntoma sería "el bot no sabe nada" sin ninguna pista del porqué.

Edita el JSON del workflow y súbelo con `PUT`, acordándote de filtrar `settings`:

```bash
node -e "
const fs=require('fs');
const w=JSON.parse(fs.readFileSync('docs/superpowers/backups/2026-09-14-bold-pos-chat.json','utf8'));
const permitidas=['executionOrder','errorWorkflow','saveManualExecutions','saveDataSuccessExecution','saveDataErrorExecution','saveExecutionProgress','timezone','executionTimeout'];
const settings=Object.fromEntries(Object.entries(w.settings||{}).filter(([k])=>permitidas.includes(k)));
fs.writeFileSync('/tmp/wf.json', JSON.stringify({name:w.name,nodes:w.nodes,connections:w.connections,settings}));
"
```

(edita `w.nodes` con el cambio del paso 3 antes de escribir el archivo)

```bash
curl -s -X PUT -H "X-N8N-API-KEY: $N8N_KEY" -H "Content-Type: application/json" \
  --data @/tmp/wf.json \
  "https://n8n.mplasesores.com/api/v1/workflows/dZGuYJbRbG6h8aqv"
```

- [ ] **Step 4: Instrucción de lenguaje en "Construir prompt"**

Volcar el nodo igual que en el paso 2 (`$('Webhook').item.json.body.vertical` también está disponible ahí) y anteponer al prompt de sistema un texto fijo por vertical. Contenido exacto:

- `restaurantes` → `El comercio es un RESTAURANTE. Habla en sus términos: mesas, comandas, meseros, propinas, división de cuenta. No ofrezcas funciones que son de comercios retail (inventario por proveedor, catálogo de productos).`
- `retail` → `El comercio es un RETAIL. Habla en sus términos: productos, inventario, proveedores, catálogo. No ofrezcas funciones que son de restaurantes (mesas, comandas, división de cuenta).`
- sin vertical → no antepone nada.

Si el nodo es un Code node, **el `\n` dentro del string JS va como barra invertida + n literal**.

- [ ] **Step 5: Probar el webhook antes de dar nada por bueno**

La ruta y el token salen del propio workflow respaldado — no los adivines:

```bash
node -e "
const w=require('./docs/superpowers/backups/2026-09-14-bold-pos-chat.json');
const wh=w.nodes.find(n=>n.name==='Webhook');
console.log('ruta:', wh.parameters.path);
const val=w.nodes.find(n=>n.name==='Validar input y token');
console.log('nodo del token:', JSON.stringify(val.parameters).slice(0,600));
"
```

De la segunda línea sacas el valor que el nodo compara contra el header `x-api-key`.

```bash
curl -s -X POST "https://n8n.mplasesores.com/webhook/$RUTA" \
  -H "Content-Type: application/json" -H "x-api-key: $TOKEN" \
  -d '{"message":"como divido una cuenta entre dos mesas","history":[{"role":"user","content":"como divido una cuenta entre dos mesas"}],"faq_context":[],"clarify_count":0,"vertical":"restaurantes","plataforma":"web"}'
```

Expected: JSON con `response`. Repite con `"vertical":"retail"` y compara: la respuesta de retail no debería citar lecciones exclusivas de restaurantes. Si el bot devuelve error o se cae, restaura el respaldo del paso 1 con un `PUT`.

- [ ] **Step 6: Commit del respaldo**

```bash
git add docs/superpowers/backups/2026-09-14-bold-pos-chat.json
git commit -m "chore(bot): respaldo del workflow antes de pasarle la vertical"
```

---

# Tanda 5 — Analíticas y verificación

## Task 13: Guardar la vertical en las conversaciones

**Files:**
- Modify: `js/assistant.js` (`createConversation`, línea ~131)

**Interfaces:**
- Consumes: `getSeleccion` de `js/vertical.js` (ya importado).
- Produces: `bodi_conversations.vertical` y `.plataforma` pobladas en conversaciones nuevas.

**Contexto:** las dos columnas ya existen y están en `null` en las 559 filas — nadie las escribe nunca. Es el mismo patrón que tenía `bot_active` antes del commit `59cfcea`. **No se rellena el histórico:** esas conversaciones no tienen de dónde sacar la vertical, y asignarles `retail` sería fabricar un dato.

- [ ] **Step 1: Escribir la vertical en el INSERT**

En `createConversation`:

```js
    const { vertical, plataforma } = getSeleccion()
    const { error } = await supabase
      .from('bodi_conversations')
      .insert({ id, session_id: sessionId, messages: [], status: 'active', vertical, plataforma })
```

- [ ] **Step 2: Verificar sintaxis**

Run: `node --input-type=module --check < js/assistant.js`
Expected: sin salida.

- [ ] **Step 3: Verificar contra la base, no contra la UI**

Después de desplegar (o desde el portal local), manda un mensaje al bot y confirma por REST que la fila nueva trae la vertical. `supabase-js` no lanza en error: si el INSERT choca contra RLS, la conversación se crea sin las columnas y nadie se entera.

```bash
K=$(grep -oP "(?<=SUPABASE_ANON_KEY = ')[^']+" js/supabase.js)
curl -s "https://tczcngfhuendmldafbrc.supabase.co/rest/v1/bodi_conversations?select=id,started_at,vertical,plataforma&order=started_at.desc&limit=3" \
  -H "apikey: $K" -H "Authorization: Bearer $K"
```

Expected: la fila más reciente trae `"vertical":"retail"` (o la que corresponda), no `null`.

- [ ] **Step 4: Commit**

```bash
git add js/assistant.js
git commit -m "feat(analytics): guardar vertical y plataforma en cada conversacion del bot"
```

---

## Task 14: Verificación end-to-end en el navegador

**Files:** ninguno (solo verificación).

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la evidencia para poder decir que funciona.

**Cómo simular a Bold:** el navegador solo fija `origin` en mensajes reales, así que despachar un `MessageEvent` con el origen falseado desde la consola sirve para probar. `embed-test.html` ya trae el snippet.

- [ ] **Step 1: Correr toda la batería de pruebas**

Run: `node --test tests/`
Expected: PASS en todo. Si algún test que no tocaste falla, para y arréglalo antes de seguir.

- [ ] **Step 2: Levantar el portal**

Usa el preview del proyecto (o sirve la carpeta con cualquier estático). Abre `index.html` sin ningún parámetro.

- [ ] **Step 3: Estado base — sin contexto de Bold**

Expected: la tarjeta de vertical **se ve** (el portal suelto no recibe contexto), FAQ y glosario muestran todo, cero errores en consola.

- [ ] **Step 4: Simular un restaurante**

En la consola del portal:

```js
window.dispatchEvent(new MessageEvent('message', {
  origin: 'https://pos.bold.co',
  data: { type: 'bold:context', accountId: '13091', businessType: 'restaurant',
          businessName: 'Prueba Restaurante', platform: 'web',
          user: { id: '1', name: 'Ana' } }
}))
```

Expected:
- La tarjeta de vertical **desaparece**; los chips Web/Mobile **siguen**.
- Las lecciones son las de restaurantes más las marcadas `'ambas'`.
- FAQ y glosario filtran igual (para verlo, marca antes una FAQ como `retail` desde el admin: debe desaparecer).
- El saludo del bot usa el nombre.

- [ ] **Step 5: Verificar el escape de staff**

Abre `index.html?staff=1` y repite el paso 4.
Expected: la tarjeta de vertical **sí** se ve, y se puede cambiar a Retail a mano.

- [ ] **Step 6: Verificar que el bot recibe la vertical**

Con el contexto de restaurante puesto, manda un mensaje y mira la pestaña Red.
Expected: el POST a `/api/chat` lleva `"vertical":"restaurantes"` y un `faq_context` que **no** incluye las FAQ marcadas solo retail.

- [ ] **Step 7: Verificar el admin**

Abre `admin.html`. En Lecciones: marca una como "Ambas" y guarda; debe aparecer en las pestañas de Retail **y** de Restaurantes, con badge "Ambas · Web", y su botón de duplicar debe estar deshabilitado. En FAQ y Glosario: los chips filtran y el selector del formulario guarda.

- [ ] **Step 8: Reportar**

Escribe qué se verificó y qué salió. Si algo falló, dilo con la salida real — no reportes "listo" sobre un paso que no corriste.

---

## Notas para quien ejecute

- **Orden de despliegue:** las migraciones de las Tareas 3 y 4 van **antes** de subir el frontend. El default `'ambas'` hace que el orden inverso tampoco rompa nada visible, pero el admin tiraría error al guardar una FAQ con vertical.
- **Rama:** el repo trabaja en `sandbox` y luego mergea a `master`. Confirma con el usuario antes de tocar `master` directamente.
- **Si un paso no se puede verificar como dice el plan**, dilo en vez de inventar la verificación. El proyecto ya tiene tres casos documentados de números creíbles fabricados por un `?? 0` sobre una consulta que falló en silencio.
