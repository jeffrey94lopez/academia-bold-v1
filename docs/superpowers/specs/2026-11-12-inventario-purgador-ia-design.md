# Spec 2 — Purgador con IA de categorías y unidades

Fecha: 2026-11-12 · Rama: `sandbox` · Depende de: Spec 1
(`2026-11-11-inventario-monosucursal-y-saneamiento-design.md`), ya implementado.

## Por qué

Los clientes llegan al conversor con archivos que traen **la misma categoría escrita de
muchas formas** ("Bebidas", "BEBIDA FRIA", "bebidas frías", "Bebidas y refrescos"). El
purgador heurístico del Spec 1 solo une duplicados exactos y singular/plural, así que esas
variantes sobreviven. Cada categoría que sobrevive es una que **el cliente tiene que crear a
mano en Bold** antes de importar: más trabajo, más abandono y una tienda desordenada.

Lo mismo pasa con las unidades ("Cja", "UND.", "Pqte"): hoy el chat pregunta una por una.

Segundo problema, menor: algunos clientes traen **demasiadas categorías muy específicas** que
convendría juntar en pocas.

Éxito = el cliente crea menos categorías en Bold, contesta menos preguntas de unidades, y
podemos demostrar **cuánto cuesta** la IA por conversión y **si los clientes aceptan** lo que
propone.

## Metas
1. **Unir categorías repetidas** por significado (lo principal). Siempre que el archivo traiga
   categorías.
2. **Traducir unidades** raras a las de Bold.
3. **Simplificar** (opcional, secundario): si tras unir quedan muchas, ofrecer juntarlas en
   menos grupos amplios. El cliente decide.
4. **Medir** tokens, costo y aceptación.

## No-metas
- Corrección ortográfica de nombres de productos, descripciones o cualquier otro campo.
- IA sobre IVA, precios, costos, existencias o conteos (fiscal / tiene que ser exacto).
- Multi-sucursal real, variantes (siguen fuera, igual que en Spec 1).
- Cambiar el purgador heurístico (`js/inv-purgador.js`): la IA va **encima**, sin tocar su
  firma.

## Anti-metas (sería un fracaso aunque funcione)
- Que la IA **bloquee** al cliente: si falla o tarda, el conversor sigue como hoy.
- Que la IA cambie algo **sin que el cliente lo vea**: siempre propone, el cliente confirma.
- Que una categoría propuesta no termine en la hoja Instrucciones (Bold rechaza el import).
- Mandar a la IA nombres de productos, precios, el archivo completo o el contexto de Bold.
- Un endpoint público que cualquiera pueda usar para gastar tokens sin límite.

## Restricciones
- Sitio estático + funciones de Vercel; IA vía **n8n → Gemini en Vertex**, donde ya viven las
  credenciales de Google (los workflows actuales llaman a `aiplatform.googleapis.com`).
- Gateado igual que el conversor: apagado en producción por `APP_ENV`. Además un interruptor
  en `app_settings` para apagar solo la IA.
- Colombia única localización; unidades canónicas = `UNIDADES_CANONICAS_BOLD`
  (`js/inv-plantilla-sintetica.js:15`).
- Telemetría sin contenido del cliente (regla de `js/herramientas-telemetria.js`).

## Enfoques considerados

| | Cómo | A favor | En contra |
|---|---|---|---|
| **1. Webhook n8n** ✅ elegido | navegador → `/api/purgar` (Vercel) → n8n → Gemini | Reusa credenciales de Vertex; el equipo cambia prompt/modelo sin deploy; caché y registro en Supabase como los otros workflows; ya era la decisión del Spec 1 | Pieza fuera del repo (se exporta el JSON a `n8n/`); suma latencia de n8n |
| 2. Función Vercel → Gemini directo | `/api/purgar` llama a Vertex | Todo en el repo, versionado y testeable | Secreto nuevo (cuenta de servicio en Vercel); cambiar el prompt exige deploy |
| 3. Desde el navegador | — | — | Expone la clave. Descartado |

El usuario eligió **1**.

## Experiencia del cliente (decidido: forma "A", resumen + revisar si quiere)

Va en `pasoPreguntas`, **antes** de la pregunta de unidades y de la lista de categorías
faltantes (`js/inv-chat.js:340-363`). Mientras espera: burbuja "Estoy ordenando tus
categorías…".

```
🤖 Tu archivo traía 48 categorías. Varias eran la misma escrita distinto; quedan 12:
   • Bebidas ← BEBIDA FRIA, bebidas frías, Refrescos (+2)
   • Lácteos ← LACTEOS, Leche y derivados
   • Aseo (sin cambios)
   …
   [Se ve bien] [Corregir alguna] [Dejar las originales]
```

- **Se ve bien** → se aplica la agrupación.
- **Corregir alguna** → editor en la burbuja: por grupo, renombrar el nombre final o sacar una
  categoría del grupo (queda sola). Botón "Listo".
- **Dejar las originales** → se ignora la IA; queda solo el purgador heurístico.
- Si la IA no unió nada, no se muestra el resumen.

**Simplificar**: si tras unir quedan **más de 15** categorías, una pregunta extra:
"Quedan 23 categorías. ¿Quieres que te proponga juntarlas en menos grupos más amplios?"
[Sí, propónmelo] [No, así está bien]. Si sí → segunda llamada en modo `simplificar` y el
mismo resumen A.

**Unidades**: mismo patrón, más corto: "Traduje tus unidades a las de Bold: UND → Unidades,
Kgs → Kilogramos, Lt → Litros…" [Se ve bien] [Corregir alguna]. Lo que la IA no pudo traducir
(`null`) sigue cayendo en la pregunta actual, una por una.

**Lista destino de unidades** = siempre las 15 de Bold POS (`UNIDADES_CANONICAS_BOLD`), en
mono y en multi. Decisión del usuario: las unidades de Bold son fijas y no cambian. La lista
vive en el prompt de n8n (no viaja en el pedido). La IA solo puede elegir de esa lista o
`null`; nunca inventa una unidad. Unidades del archivo que no tienen equivalente (p. ej.
"Caja", "Docena") quedan en `null` y se preguntan como hoy.

**Categorías existentes en multi**: son destinos fijos. La IA puede meter categorías del
archivo dentro de una existente, pero **nunca une dos existentes entre sí** ni las renombra
(tampoco en `simplificar`). La validación rechaza la respuesta si un grupo contiene dos
existentes o si renombra una existente.

**Camino multi**: la plantilla del cliente ya trae sus categorías de Bold
(`plantilla.listas.categorias`). Se le pasan a la IA como **existentes**, para que prefiera
mapear a una que ya existe ("BEBIDA FRIA" → la "Bebidas" que el cliente ya tiene en Bold).
En mono la única existente es `General`.

## Diseño técnico

### Navegador
- **`js/inv-ia.js`** (nuevo, puro, testeable en Node):
  - `armarPedido({ modo, categorias, existentes, unidades })` → cuerpo del POST. Entrada =
    las canónicas **ya purgadas** por el heurístico, únicas.
  - `validarRespuesta(pedido, respuesta)` → `{ ok, mapeo }` o `{ ok:false, codigo }`. Reglas:
    cada entrada aparece **exactamente una vez**; los nombres finales pasan por `sanear()` y no
    quedan vacíos; unidades solo pueden mapear a `UNIDADES_CANONICAS_BOLD` o a `null`.
    Cualquier violación → se descarta la respuesta entera (fallback).
  - `resumen(mapeo)` → los grupos para pintar el mensaje A.
- **Aplicación**: nuevas opciones de sesión `opciones.categoriasIA` (`{canonicaHeuristica →
  nombreFinal}`) y, para unidades, se prellena el `opciones.unidades` que **ya existe**. En
  `js/inv-convertir.js:158`, después de `purgaCategorias.mapeo[...]`, se aplica
  `opciones.categoriasIA`. Así el motor sigue puro y `categoriasFaltantes`, Instrucciones y la
  lista para crear en Bold salen ya con las categorías unidas.
- **Timeout 15 s** y cualquier error → sigue el flujo actual, telemetría `tool_error` con
  código `ia_fallo` / `ia_respuesta_invalida` / `ia_timeout` (se agregan a `ERRORES`).
- **Gate**: solo corre si `APP_ENV !== 'prod'` (igual que el conversor) **y**
  `app_settings.inventario_ia_activa` es verdadero.

### `/api/purgar.js` (Vercel)
Copia el patrón de `api/chat.js` con env propia `N8N_PURGA_URL` (misma `N8N_API_KEY`).
Defensas contra gasto abusivo, **antes** de llamar a n8n:
- Solo `POST`, `Content-Type: application/json`, cuerpo ≤ 64 KB.
- `modo ∈ {categorias, unidades, simplificar}`; ≤ 300 elementos por lista; cada uno ≤ 80
  caracteres; solo strings. Si no, 400.
- Pasa a n8n solo los campos permitidos (no reenvía el body tal cual): `modo`, `categorias`,
  `existentes`, `unidades`, `run_id` y `account_id` (strings ≤ 64; vienen del navegador y solo
  sirven para caché y agrupado en analytics) y **`env`, que lo pone la función desde
  `VERCEL_ENV`**, no el navegador. Así el costo por entorno es confiable. `account_id` llega a
  n8n y Supabase, **nunca** a Gemini. Sin `account_id` (sin contexto de Bold) la llamada se hace
  igual pero no se cachea.
- **Gate del lado del servidor** (la del navegador no basta, cualquiera puede llamar al
  endpoint):
  1. Si `VERCEL_ENV === 'production'` → 404 mientras el conversor siga cerrado en producción.
  2. `N8N_PURGA_URL` se configura **solo** en el entorno Preview de Vercel.
  3. n8n lee `inventario_ia_activa` (con el `env` recibido) antes de llamar a Gemini; apagado
     → responde `{ desactivado: true }` sin gastar tokens.
  Abrirlo en producción será un cambio explícito de este gate (fuera de este spec).
- Rate limit: regla del firewall de Vercel sobre `/api/purgar` (p. ej. 20 req/min por IP).
  Ver "Lo que queda al constructor".

### Workflow n8n `inventario/purgar-con-ia`
1. Webhook con verificación de `x-api-key`.
2. Lee `inventario_ia_activa`, `inventario_purga_model` (arranca `gemini-2.5-flash`) e
   `inventario_ia_prompt_version` de `app_settings`, con la misma mezcla que `mergeSettings`
   (`js/env.js`): fila `prod` como base, la del `env` recibido la pisa.
3. **Caché por cuenta** (decisión del usuario): clave = sha256(account_id + modo + listas
   ordenadas + modelo + versión de prompt). Si existe en `inventario_purga_cache` y tiene menos
   de 90 días → devuelve eso (no llama a Gemini). Sirve sobre todo cuando el mismo comercio
   re-sube su archivo.
4. Llama a Gemini con salida JSON estricta (`responseMimeType: application/json` + schema).
   Formato: `{ "grupos": [ { "nombre": "Bebidas", "miembros": ["BEBIDA FRIA", ...] } ] }` para
   categorías/simplificar; `{ "unidades": { "Cja": "Cajas", "xyz": null } }` para unidades.
5. Guarda en caché y **registra el uso** (abajo).
6. Responde `{ resultado, cache: bool }`.

El JSON del workflow se exporta a `n8n/inventario-purgar-con-ia.json` (sin credenciales,
igual que los otros).

### Supabase (una migración)
- **`inventario_purga_cache`**: `clave text pk, account_id text, modo, modelo, prompt_version,
  resultado jsonb, creado timestamptz`. RLS activado **sin políticas** (solo `service_role`, o
  sea n8n). **Retención 90 días**: las filas más viejas se borran (el workflow n8n las purga en
  cada llamada con un `delete ... where creado < now() - interval '90 days'`, o con `pg_cron`
  si está disponible; queda al constructor).
- `inventario_ia_uso` también guarda `account_id`, para ver el costo por comercio.
- **`inventario_ia_uso`**: `id, creado, env, run_id, modo, modelo, prompt_version,
  tokens_entrada int, tokens_salida int, cache_hit bool, n_entrada int, n_salida int,
  duracion_ms int`. Solo números, **nunca** texto del cliente. RLS sin políticas; lo escribe
  n8n con `service_role` a partir de `usageMetadata` de Gemini (no se puede falsear desde el
  navegador).
- **`app_settings`** (claves nuevas, por entorno como las demás): `inventario_ia_activa`,
  `inventario_purga_model`, `inventario_ia_prompt_version`, `inventario_ia_precio`
  (`{ "entrada_por_millon": <USD>, "salida_por_millon": <USD> }`; el precio no va fijo en el
  código porque Google lo cambia).
- **RPC `analytics_herramientas_ia(p_from, p_to, p_env)`**: `security definer`, solo
  `authenticated` (mismo revoke/grant que `analytics_herramientas`), casts seguros. Devuelve:
  llamadas, % caché, tokens, costo total (con `inventario_ia_precio`) y la aceptación. Dos
  promedios:
  - **costo por conversión que usó IA** = costo total / `run_id` distintos en
    `inventario_ia_uso` (incluye las que salieron de caché a $0: es el costo real promedio).
  - **costo por descarga** = costo total / corridas con `tool_complete` del conversor en el
    periodo (lo que cuesta cada plantilla que de verdad se llevó un cliente).

### Aceptación (telemetría del navegador)
Evento nuevo `tool_ia` (no se reusa `tool_step`: `telemetria.paso()` solo manda `{paso}` y
deduplica por corrida) con `etapa: 'categorias' | 'unidades' | 'simplificar'`,
`decision: 'acepto' | 'corrigio' | 'originales' | 'fallo'` y conteos (`n_entrada`,
`n_salida`). Sin nombres. Se agrega como método `telemetria.ia(...)` en
`js/herramientas-telemetria.js`, sin deduplicar; la RPC cuenta la **última** decisión por
`run_id` y etapa.

### Re-subida del archivo (IVA mixto → "Vuelvo a subir")
`pasoPreguntas` se reinicia (`inv-chat.js:316`). Al cargar un archivo nuevo se limpian
`opciones.categoriasIA` y las unidades que puso la IA, y la IA corre de nuevo sobre el archivo
nuevo (si las listas no cambiaron, sale de caché, gratis). Las decisiones del primer archivo no
se vuelven a preguntar si las listas son idénticas: se reaplican sin mostrar el resumen otra
vez.

### Admin
Tarjeta **"IA del conversor"** en la pestaña Herramientas (`js/admin-herramientas-analytics.js`):
llamadas, costo del periodo, costo promedio por conversión, % caché, y barras de
aceptó / corrigió / originales.

## Pruebas
- `tests/inv-ia.test.mjs`: armado del pedido, validación (falta un miembro, miembro repetido,
  nombre con caracteres prohibidos, unidad fuera de la lista, JSON roto → fallback),
  resumen.
- `tests/inv-convertir.test.mjs`: `categoriasIA` se aplica después del heurístico y las
  categorías unidas llegan a `categoriasFaltantes` y a Instrucciones.
- `scripts/qa-inventario.mjs`: el arnés intercepta `/api/purgar` con respuestas fijas.
  Escenarios nuevos: IA acepta, IA corrige, IA falla (500) y timeout → el flujo llega igual a
  la descarga; ninguna pregunta repetida.
- Migración probada en Postgres local (Docker) como la de casts seguros.
- Puerta de seguridad completa antes de `master` (endpoint público nuevo + tablas nuevas).

## Decisiones mías (a revisar)
- **Umbral de simplificar = 15** categorías tras unir.
- **Timeout 15 s**, límites de 300 elementos / 80 caracteres / 64 KB.
- **Entrada a la IA = salida del heurístico**, no las categorías crudas: menos tokens y la IA
  no rehace lo que ya resolvió el código.
- **El modelo nunca crea categorías nuevas de la nada** en modo `categorias`: solo elige un
  nombre para el grupo entre sus miembros o una existente en Bold. En `simplificar` sí puede
  proponer un nombre amplio nuevo (el cliente lo ve y confirma).

## Lo que queda al constructor
- Texto exacto del prompt (se versiona con `inventario_ia_prompt_version`).
- Diseño visual del editor "Corregir alguna", siguiendo `css/inventario.css`.
- Cómo se configura el rate limit (regla de firewall de Vercel vía CLI/dashboard o, si no está
  disponible en el plan, un contador simple en n8n).
- Precio inicial de `inventario_ia_precio` (tomarlo de la página de precios de Vertex el día
  que se aplique).
