# Purgador con IA de categorías y unidades — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el conversor de inventario una categorías repetidas y traduzca unidades con Gemini (vía n8n), proponiendo y dejando confirmar al cliente, y que el admin vea cuánto cuesta y si se acepta.

**Architecture:** Navegador (`js/inv-ia.js` puro + `js/inv-ia-cliente.js`) → `api/purgar.js` (Vercel, valida y gatea) → workflow n8n `inventario/purgar-con-ia` (caché por cuenta + Gemini + registro de uso en Supabase). El motor `convertir()` solo recibe un mapa más en `opciones`. Si la IA falla, el flujo sigue igual que hoy.

**Tech Stack:** JS vanilla ES modules, `node --test`, Vercel Functions (Node runtime), Supabase Postgres (RLS, RPC security definer), n8n + Vertex Gemini, Playwright (QA).

**Spec:** `docs/superpowers/specs/2026-11-12-inventario-purgador-ia-design.md`

## Global Constraints
- Rama `sandbox`. Nada a `master` sin puerta de seguridad y sin que el usuario lo pida (CLAUDE.md).
- Tests: `node --test tests/*.test.mjs`. Suite verde en cada commit (hoy 632).
- Commits en español `tipo(alcance): descripcion`, terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Unidades destino: **siempre** `UNIDADES_CANONICAS_BOLD` (`js/inv-plantilla-sintetica.js:15`), en mono y multi.
- Límites: ≤ 300 elementos por lista, ≤ 80 caracteres por elemento, cuerpo ≤ 64 KB, `run_id`/`account_id` ≤ 64. Timeout del navegador **15 s**. Umbral de simplificar: **> 15** categorías tras unir. Caché **90 días**, por `account_id`.
- `modo ∈ {'categorias','unidades','simplificar'}`. `decision ∈ {'acepto','corrigio','originales','fallo'}`.
- La IA **nunca** recibe nombres de productos, precios, el archivo, `account_id` ni el contexto de Bold. La telemetría y `inventario_ia_uso` solo guardan números.
- Gate: navegador solo llama si `APP_ENV !== 'prod'` **y** `app_settings.inventario_ia_activa === 'true'` (ojo: la convención "clave ausente ⇒ habilitado" **no** aplica aquí; ausente = apagado). Servidor: `VERCEL_ENV === 'production'` → 404.
- Toda tabla nueva con RLS activado. HTML dinámico siempre con `escapeHtml`/`esc`.
- Copy de la UI en español neutro.

## Review Focus
1. **Lista enorme** (archivo con > 300 categorías únicas tras el heurístico): no se llama a la IA, telemetría `fallo` con `n_entrada`, el flujo sigue como hoy. → test en Task 4.
2. **La IA devuelve un nombre con caracteres prohibidos o vacío tras `sanear`** (p. ej. `"Bebidas|frías"`, `"¡!"`): toda la respuesta se descarta. → test en Task 1.
3. **En multi, la IA junta dos categorías existentes o renombra una existente**: respuesta descartada; el cliente nunca ve ese resumen. → test en Task 1.
4. **Re-subida con listas idénticas**: no se vuelve a mostrar el resumen; se reaplica la decisión anterior. Con listas distintas, se limpia `categoriasIA` y se pregunta otra vez. → test en Task 2 (limpieza) y escenario QA en Task 6.
5. **Sin contexto de Bold (sin `account_id`)**: la IA se llama igual y n8n no cachea; nada se rompe. → test en Task 5 (proxy reenvía sin `account_id`) y en Task 8 (rama del workflow).

---

### Task 1: Módulo puro `inv-ia.js` (pedido, validación, resumen)

**Files:**
- Create: `js/inv-ia.js`
- Test: `tests/inv-ia.test.mjs`

**Interfaces:**
- Consumes: `sanear(s): string` (`js/inv-saneamiento.js`), `normalizar(s)` (`js/inv-numeros.js`), `UNIDADES_CANONICAS_BOLD`.
- Produces:
  - `LIMITES = { maxElementos: 300, maxLargo: 80 }`
  - `armarPedido({ modo, categorias = [], existentes = [], unidades = [] }): { modo, categorias, existentes, unidades } | null` — dedup por `normalizar`, recorta a 80 chars; `null` si alguna lista pasa de 300 o la lista principal del modo queda vacía.
  - `validarRespuesta(pedido, respuesta): { ok: true, mapeo: Record<string,string|null> } | { ok: false, codigo: 'ia_respuesta_invalida' }`
    - modos `categorias`/`simplificar`: `respuesta.grupos: [{ nombre, miembros[] }]`; cada elemento de `pedido.categorias` aparece **exactamente una vez** en algún `miembros`; ningún miembro desconocido; `sanear(nombre) === nombre` y no vacío; un grupo no puede contener dos `existentes`; si un grupo contiene una existente, `nombre` debe ser esa existente; en modo `categorias` el `nombre` debe ser uno de sus miembros o una existente. `mapeo` = `{ miembro → nombre }`.
    - modo `unidades`: `respuesta.unidades: Record<string, string|null>`; cada unidad del pedido presente; valores ∈ `UNIDADES_CANONICAS_BOLD` o `null`. `mapeo` = ese objeto.
  - `resumenGrupos(mapeo): Array<{ nombre: string, miembros: string[], cambia: boolean }>` ordenado por `nombre`; `cambia` = false si el grupo es solo `[nombre]`.
  - `huboCambios(mapeo): boolean`.

- [ ] **Step 1: Write the failing tests** en `tests/inv-ia.test.mjs`:
  - `armarPedido dedup y recorte`: `armarPedido({modo:'categorias', categorias:['Bebidas','bebidas','x'.repeat(90)]}).categorias` → `['Bebidas','x'.repeat(80)]`.
  - `armarPedido > 300 → null` y `lista principal vacía → null`.
  - `validarRespuesta categorias ok`: pedido `['Bebidas','BEBIDA FRIA','Aseo']`, grupos `[{nombre:'Bebidas',miembros:['Bebidas','BEBIDA FRIA']},{nombre:'Aseo',miembros:['Aseo']}]` → `mapeo['BEBIDA FRIA'] === 'Bebidas'`.
  - Rechazos (`ok:false`): miembro faltante; miembro repetido; miembro desconocido; nombre `'Bebidas|frías'`; nombre `'¡!'`; modo `categorias` con nombre que no es miembro (`'Refrescos'` para `['Gaseosa','Soda']`); multi con `existentes:['Bebidas','Refrescos']` y un grupo que contiene ambas; grupo con existente `'Bebidas'` pero `nombre:'Bebida'`; JSON sin `grupos`.
  - `simplificar` acepta nombre nuevo (`'Abarrotes'` para `['Arroz','Frijol']`).
  - `unidades`: `{UND:'Unidades', Kgs:'Kilogramos', Docena:null}` ok; `{UND:'Cajas'}` rechazado; unidad faltante rechazada.
  - `resumenGrupos` y `huboCambios` sobre el mapeo del primer caso.
- [ ] **Step 2:** `node --test tests/inv-ia.test.mjs` → FAIL (módulo no existe).
- [ ] **Step 3:** Implementar `js/inv-ia.js` con las firmas de arriba (sin DOM, sin red).
- [ ] **Step 4:** `node --test tests/*.test.mjs` → todo PASS.
- [ ] **Step 5:** Commit `feat(inventario): modulo puro para pedir y validar el purgador con IA`.

### Task 2: El motor aplica `categoriasIA` y la sesión la limpia al re-subir

**Files:**
- Modify: `js/inv-convertir.js:158` (después de `purgaCategorias.mapeo[...]`)
- Modify: `js/inv-sesion.js:51` (opciones iniciales) y `:111-114` (`cargarOrigen`)
- Test: `tests/inv-convertir.test.mjs`, `tests/inv-sesion.test.mjs`

**Interfaces:**
- Consumes: mapeo de Task 1.
- Produces: `opciones.categoriasIA: Record<string,string> | null` (clave = canónica del heurístico). `convertir()` agrega a su retorno `categoriasPurgadas: string[]` y `unidadesPurgadas: string[]` (= `purgaCategorias.limpias` / `purgaUnidades.limpias`). Unidades de la IA van al `opciones.unidades` existente. `sesion.estado.ia = { firma: string|null, decisiones: { categorias?, unidades? } }` para reaplicar en re-subida.

- [ ] **Step 1: Tests que fallan:**
  - convertir: filas con categorías `'BEBIDA FRIA'`, `'Bebidas'`, `'Aseo'`, plantilla con lista `['General']`, `opciones.categoriasIA = {'BEBIDA FRIA':'Bebidas'}` → `categoriasFaltantes` = `['Aseo','Bebidas']` (en cualquier orden, 2 elementos) y la fila de `'BEBIDA FRIA'` sale con categoría `'Bebidas'`.
  - convertir: con `categoriasAGeneral: true` y `categoriasIA` → todo a `General` (la IA no rompe esa opción).
  - sesión: tras `cargarOrigen` de un archivo nuevo, `estado.opciones.categoriasIA === null`.
- [ ] **Step 2:** correr → FAIL.
- [ ] **Step 3:** En `convertir`, `categoria = opciones.categoriasIA?.[categoria] ?? categoria` justo después de aplicar el heurístico. Agregar `categoriasIA: null` a las opciones iniciales y resetearlo en `cargarOrigen`; agregar `estado.ia = { firma: null, decisiones: {} }` (no se resetea en `cargarOrigen`: la firma decide si se reaplica).
- [ ] **Step 4:** suite completa PASS.
- [ ] **Step 5:** Commit `feat(inventario): el conversor aplica la agrupacion de categorias de la IA`.

### Task 3: Telemetría `tool_ia` y códigos de error

**Files:**
- Modify: `js/herramientas-telemetria.js` (`ERRORES`, `crearTelemetriaHerramienta`)
- Test: `tests/herramientas.test.mjs`

**Interfaces:**
- Produces: `telemetria.ia(etapa, decision, { n_entrada, n_salida, codigo? })` → `track('tool_ia', payload({ etapa, decision, n_entrada, n_salida, codigo }))`, **sin** deduplicar. `ERRORES` suma `ia_fallo`, `ia_respuesta_invalida`, `ia_timeout`, `ia_lista_grande` con sus frases para el admin.

- [ ] **Step 1:** Tests: dos llamadas `ia('categorias','acepto',{n_entrada:48,n_salida:12})` → `track` recibe 2 eventos `tool_ia` con esos campos y `run_id`; el test de cobertura de códigos sigue verde con los 4 nuevos.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** suite PASS.
- [ ] **Step 5:** Commit `feat(analytics): evento tool_ia para medir la aceptacion del purgador con IA`.

### Task 4: Cliente HTTP con timeout y gate

**Files:**
- Create: `js/inv-ia-cliente.js`
- Test: `tests/inv-ia-cliente.test.mjs`

**Interfaces:**
- Consumes: `armarPedido`, `validarRespuesta` (Task 1).
- Produces: `async pedirIA({ modo, categorias, existentes, unidades, runId, accountId }, { fetch = globalThis.fetch, timeoutMs = 15000, activa }): Promise<{ ok: true, mapeo } | { ok: false, codigo: 'ia_lista_grande'|'ia_timeout'|'ia_fallo'|'ia_respuesta_invalida'|'ia_desactivada' }>`
  - `activa === false` → `ia_desactivada` sin red.
  - `armarPedido` null → `ia_lista_grande` sin red.
  - `POST /api/purgar` JSON `{ ...pedido, run_id, account_id }` con `AbortController`; abort → `ia_timeout`; status ≠ 200 o `{desactivado:true}` → `ia_fallo` / `ia_desactivada`; luego `validarRespuesta(pedido, json.resultado)`.
  - `iaActiva(): Promise<boolean>` = `APP_ENV !== 'prod' && (await loadSettings(['inventario_ia_activa'])).inventario_ia_activa === 'true'` (import dinámico de `settings.js` para que los tests no carguen Supabase).

- [ ] **Step 1:** Tests con `fetch` falso: ok; 500 → `ia_fallo`; fetch que nunca resuelve con `timeoutMs: 20` → `ia_timeout`; 301 categorías → `ia_lista_grande` y `fetch` no llamado; respuesta inválida → `ia_respuesta_invalida`; `activa:false` → no llama; `accountId` undefined → el body no trae `account_id`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** suite PASS.
- [ ] **Step 5:** Commit `feat(inventario): cliente del purgador con IA con timeout y gate`.

### Task 5: Endpoint `api/purgar.js`

**Files:**
- Create: `api/purgar.js`
- Test: `tests/api-purgar.test.mjs`

**Interfaces:**
- Produces:
  - `export function validarPedido(body): { ok: true, limpio } | { ok: false }` — solo campos `modo, categorias, existentes, unidades, run_id, account_id`; tipos string; límites de Global Constraints.
  - `export async function POST(request: Request): Promise<Response>` (Node runtime; **no** usar `runtime: 'edge'`, está deprecado). Orden: `VERCEL_ENV === 'production'` → 404; sin `N8N_PURGA_URL`/`N8N_API_KEY` → 500 `Not configured`; `content-length` > 65536 o JSON inválido → 400; `validarPedido` falla → 400; reenvía `{ ...limpio, env: process.env.VERCEL_ENV ?? 'development' }` con header `x-api-key`; error upstream → 502 `{ error: 'Upstream error' }`. Nunca devuelve la URL de n8n.
  - Otros métodos: Vercel responde 405 solo al exportar solo `POST`.

- [ ] **Step 1:** Tests importando el módulo con `process.env` controlado y `globalThis.fetch` falso: producción → 404; campo extra `x` no se reenvía; `env` lo pone el servidor aunque el body traiga `env:'prod'`; 301 elementos → 400; elemento de 81 chars → 400; `modo:'otro'` → 400; upstream lanza → 502.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** suite PASS.
- [ ] **Step 5:** Agregar `N8N_PURGA_URL` en Vercel **solo Preview** (`vercel env add N8N_PURGA_URL preview`; el valor lo da el usuario al crear el webhook en Task 8 — si aún no existe, dejar el paso marcado y seguir).
- [ ] **Step 6:** Commit `feat(api): proxy del purgador con IA con limites y cerrado en produccion`.

### Task 6: Conversación en el chat (resumen A, corregir, simplificar, unidades)

**Files:**
- Modify: `js/inv-chat.js` (`pasoPreguntas`, antes de `for (const u of r.unidadesSinMapa)` en `:340`)
- Modify: `css/inventario.css` (editor)
- Modify: `scripts/qa-inventario.mjs` (interceptar `/api/purgar` y `app_settings`)

**Interfaces:**
- Consumes: `pedirIA`, `iaActiva` (Task 4), `resumenGrupos`, `huboCambios` (Task 1), `telemetria.ia` (Task 3), `opciones.categoriasIA`, `estado.ia` (Task 2).
- Produces: `async function pasoIA()` interna a `iniciarConversacion`.

Comportamiento (copy fijo del spec):
1. Si `!(await iaActiva())` → return.
2. Listas: categorías = `r.categoriasPurgadas` (Task 2); existentes = `plantillaReferencia().listas.categorias`. Firma = JSON de las listas; si `estado.ia.firma === firma`, reaplicar `estado.ia.decisiones` y return.
3. Burbuja "Estoy ordenando tus categorías…" y `pedirIA({modo:'categorias', ...})`. Fallo → `telemetria.ia('categorias','fallo',{codigo})` y seguir.
4. Si `huboCambios`: mensaje "Tu archivo traía **N** categorías. Varias eran la misma escrita distinto; quedan **M**:" + lista `• Nombre ← miembros (+k)` (máx. 3 miembros visibles por grupo) + chips `Se ve bien` / `Corregir alguna` / `Dejar las originales`.
5. `Corregir alguna` → editor en la burbuja: por grupo, input con el nombre (saneado al confirmar) y por miembro un botón "Sacar del grupo"; botón `Listo`. Decisión `corrigio`.
6. Si quedan > 15: "Quedan **M** categorías. ¿Quieres que te proponga juntarlas en menos grupos más amplios?" `Sí, propónmelo` / `No, así está bien` → modo `simplificar`, mismo resumen y chips; se compone sobre el mapeo anterior.
7. Unidades: `r.unidadesPurgadas` que `mapearUnidad` no resuelve → `pedirIA({modo:'unidades'})`; las no-null se muestran "Traduje tus unidades a las de Bold: UND → Unidades, …" `Se ve bien` / `Corregir alguna` (corregir = chips por unidad con las 15) y se guardan en `opciones.unidades`; las `null` siguen a la pregunta actual.
8. Cada decisión → `telemetria.ia(etapa, decision, {n_entrada, n_salida})`; guardar en `estado.ia`; `sesion.recalcular()`.

- [ ] **Step 1:** QA: en `scripts/qa-inventario.mjs` interceptar `**/api/purgar` con respuestas fijas por modo y forzar `inventario_ia_activa='true'` interceptando la lectura de `app_settings`. Escenarios nuevos: `ia-acepta`, `ia-corrige` (renombra un grupo), `ia-falla` (500), `ia-timeout` (no responde), `ia-reupload` (IVA mixto → re-sube el mismo archivo: el resumen aparece **una** vez). Escenario `ia-15000`: archivo generado de 15 000 productos con ~120 categorías únicas → la IA recibe ≤ 120 elementos, el conversor llega a la descarga y se anota el tiempo total (sin umbral duro; si pasa de ~20 s se reporta). Aserciones: llega a la descarga; la plantilla trae las categorías unidas; "Varias eran la misma" aparece ≤ 1 vez; en falla/timeout el flujo es idéntico al actual.
- [ ] **Step 2:** `npm run qa:inventario ia-acepta ia-corrige ia-falla ia-timeout ia-reupload` → FAIL.
- [ ] **Step 3:** Implementar `pasoIA` + CSS del editor (usar skills `frontend-design`; mismas variables de `css/inventario.css`, legible a 400 px).
- [ ] **Step 4:** QA completo (`npm run qa:inventario`, los 7 viejos + 5 nuevos) y suite → PASS. Captura móvil revisada.
- [ ] **Step 5:** Commit `feat(inventario): el chat propone unir categorias y traducir unidades con IA`.

### Task 7: Migración Supabase (tablas, RLS, RPC)

**Files:**
- Create: `supabase/migrations/create_inventario_ia.sql`

**Interfaces:**
- Produces: tablas `inventario_purga_cache(clave text primary key, account_id text not null, modo text, modelo text, prompt_version text, resultado jsonb not null, creado timestamptz default now())` con índice en `creado`; `inventario_ia_uso(id bigint identity pk, creado timestamptz default now(), env text not null, run_id text, account_id text, modo text, modelo text, prompt_version text, tokens_entrada int, tokens_salida int, cache_hit bool, n_entrada int, n_salida int, duracion_ms int)` con índice `(env, creado)`. RLS activado en ambas, **sin políticas**; `revoke all ... from anon, authenticated`.
- RPC `analytics_herramientas_ia(p_from timestamptz, p_to timestamptz, p_env text default 'prod') returns jsonb`, `security definer`, `set search_path = public`, `revoke ... from public, anon` / `grant execute ... to authenticated`. Devuelve `{ llamadas, cache_pct, tokens_entrada, tokens_salida, costo_usd, costo_por_conversion, costo_por_descarga, decisiones: { categorias: {acepto, corrigio, originales, fallo}, unidades: {...}, simplificar: {...} } }`. Precio desde `app_settings` clave `inventario_ia_precio` (fila del env con base prod), leído con cast seguro (regex) como en `update_analytics_herramientas_cast_seguro.sql`; sin precio → `costo_*` null. Decisiones: última `tool_ia` por `(run_id, etapa)` en `analytics_events`. Descargas: `tool_complete` con `tool='inventario'`.
- Inserta en `app_settings` (env `sandbox`): `inventario_ia_activa='false'`, `inventario_purga_model='gemini-2.5-flash'`, `inventario_ia_prompt_version='1'` con `on conflict do nothing`. El precio lo pone el usuario.

- [ ] **Step 1:** Probar en Postgres local (Docker `postgres:17-alpine`, con stubs de `analytics_events`, `app_settings` y roles `anon`/`authenticated`): sembrar 3 usos (uno cache_hit), 2 runs con decisión, 1 descarga, precio `{"entrada_por_millon":0.3,"salida_por_millon":2.5}` → números esperados calculados a mano; precio `'abc'` → `costo_usd` null sin error; `anon` no puede ejecutar ni leer las tablas.
- [ ] **Step 2:** Commit `feat(analytics): tablas y rpc para medir el costo del purgador con IA`.
- [ ] **Step 3:** **Avisar al usuario** que se aplica a mano en el SQL Editor (o con su permiso vía `supabase db query --remote -f`). Después: `supabase db advisors --remote` sin ERROR nuevos.

### Task 8: Workflow n8n `inventario/purgar-con-ia`

**Files:**
- Create: `n8n/inventario-purgar-con-ia.json` (export sin credenciales)
- Create: `n8n/prompts/purgar-v1.md` (texto del prompt versionado)

Nodos: Webhook POST (verifica `x-api-key`) → leer `app_settings` (`inventario_ia_activa`, `inventario_purga_model`, `inventario_ia_prompt_version`; mezcla prod + `env`) → apagado ⇒ `{desactivado:true}` → borrar caché > 90 días → si hay `account_id`: buscar `sha256(account_id|modo|listas ordenadas|modelo|version)` en caché → hit ⇒ registrar uso `cache_hit=true, tokens 0` y responder → Vertex `generateContent` con `responseMimeType: application/json` + `responseSchema` del modo (credencial existente de Vertex) → guardar caché (solo con `account_id`) → registrar uso con `usageMetadata.promptTokenCount` / `candidatesTokenCount` y `duracion_ms` → responder `{ resultado, cache }`. Todo a Supabase con `service_role` (credencial existente de n8n).

Prompt v1 (reglas que el validador de Task 1 hace cumplir): unir solo lo que significa lo mismo; en `categorias` el nombre del grupo es uno de sus miembros (el más claro) o una existente; nunca juntar dos existentes; cada entrada exactamente una vez; sin caracteres `` ` ´ ° { } | % ? ¡ ! ``; unidades solo de las 15 (lista literal) o null; ante la duda, no unir.

- [ ] **Step 1:** Construir el workflow en n8n (sandbox) y probarlo con `curl` contra el webhook: lista de ejemplo de 20 categorías con repetidas → respuesta pasa `validarRespuesta` (script `node -e` que importa `js/inv-ia.js`); segunda llamada igual → `cache:true`; sin `account_id` → no cachea; `inventario_ia_activa='false'` → `desactivado`.
- [ ] **Step 2:** Exportar JSON y prompt al repo; confirmar que no hay secretos (`grep -i "key\|token\|secret"` solo muestra ids/nombres de credenciales).
- [ ] **Step 3:** Pasar al usuario la URL del webhook para `N8N_PURGA_URL` (Task 5, Step 5). Commit `feat(n8n): workflow del purgador con IA con cache por cuenta y registro de uso`.

### Task 9: Tarjeta "IA del conversor" en el admin

**Files:**
- Modify: `js/analytics-api.js` (`fetchHerramientasIA(from, to, env, client)` → `rpc('analytics_herramientas_ia', ...)`)
- Modify: `js/herramientas-vista.js` (`armarVistaIA(data)` puro) y `js/admin-herramientas-analytics.js` (render)
- Test: `tests/herramientas.test.mjs`

**Interfaces:**
- Produces: `armarVistaIA(data): { llamadas, cachePct, costoTotal: string|null, costoPorConversion: string|null, costoPorDescarga: string|null, decisiones: Array<{ etapa, acepto, corrigio, originales, fallo, total }> }`; montos formateados `US$ 0.0012` (4 decimales), `null` → "Sin precio configurado".

- [ ] **Step 1:** Tests de `armarVistaIA`: datos completos; `costo_usd` null; sin llamadas (todo 0, sin división por cero).
- [ ] **Step 2:** FAIL. **Step 3:** implementar y renderizar la tarjeta debajo de la sección del conversor (`tarjeta(...)` existente), con barras aceptó/corrigió/originales/falló. Si la RPC falla (migración no aplicada), la tarjeta muestra "Sin datos de IA todavía" y el resto de la pestaña sigue.
- [ ] **Step 4:** Suite PASS + mirar la pestaña en navegador (Playwright MCP) con datos sembrados en sandbox.
- [ ] **Step 5:** Commit `feat(analytics): tarjeta de costo y aceptacion del purgador con IA`.

### Task 10: Verificación de punta a punta y puerta de seguridad

- [ ] **Step 1:** Con migración aplicada, workflow activo y `inventario_ia_activa='true'` en sandbox: probar en el preview de Vercel con el arnés apuntando al preview (o QA manual dentro de Bold staging) un archivo real con categorías repetidas. Verificar fila en `inventario_ia_uso` con tokens > 0, segunda corrida `cache_hit`, y la tarjeta del admin con costo.
- [ ] **Step 2:** `curl -X POST` al `/api/purgar` del dominio de producción → 404.
- [ ] **Step 3:** Puerta de seguridad (CLAUDE.md): `differential-review` sobre `master...sandbox`, `/security-review`, advisors de Supabase. Reportar hallazgos al usuario.
- [ ] **Step 4:** Push de `sandbox` y comentario en el PR con el resumen. **No** mergear a `master` sin aprobación del equipo.
