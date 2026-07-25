# Sub-proyecto B — Estados de ciclo de vida · Spec de diseño

**Parte 4/4 del pedido de optimización del bot** (orden A→C→D→B). Rama `sandbox`. Toca datos (migración + 2 RPCs), el chat y el dashboard.

## Objetivo

Que toda conversación del BolBot termine en un estado final conocido, y que el dashboard distinga entre las tres formas de terminar: **cerrada por el cliente**, **abandonada** y **escalada a soporte**.

Doble propósito, con la medición como base:

1. **Medir bien** — hoy los KPIs de resolución están contaminados por conversaciones que quedan `active` para siempre.
2. **Rescatar al usuario** — avisarle antes de que su conversación se dé por terminada.

## Contexto actual

**El abandono no se registra nunca.** `js/assistant.js:142-145` dispara un `sendBeacon` a `https://n8n.mplasesores.com/webhook/bodi-abandon` en `beforeunload`, pero el workflow que lo atiende (`Bodi Abandon Webhook`, id `x3sImBnivO1XAHxp`, 4 nodos) está **inactivo** en n8n. Consecuencia: nada escribe `status = 'abandoned'`, el KPI `kpis.abandoned` del RPC es siempre 0, y toda conversación que el usuario no cierre con los botones queda `active` indefinidamente.

Lo que sí existe:

- `bodi_conversations.status` — `text NOT NULL DEFAULT 'active'`, con `CHECK (status IN ('active','completed','abandoned'))`. Los tres valores que necesitamos **ya están permitidos**.
- `resolveConversation(resolved, btnsEl)` (`js/assistant.js:131-140`) — único cierre explícito: escribe `resolved`, `status = 'completed'` y `ended_at`. Se dispara con los botones "¿Logré resolver tu duda?".
- `support_redirected boolean DEFAULT false` — lo escribe cada PATCH de `sendMessage` con `data.support_redirected` del webhook.
- `resolved` (bool) y `resolution_status` (`resuelta`/`no_resuelta`/`ambigua`) — dimensión de **calidad**, independiente del ciclo de vida. Los RPCs ya las combinan en `eff_status`.
- `started_at` / `ended_at`. **No hay marca de última actividad**, así que hoy es imposible saber qué conversación está inactiva.
- Convención de toggles: `app_settings` (`key`/`value` text), leída con `.in('key', [...])` y escrita con `upsert`; **clave ausente o ilegible ⇒ comportamiento por defecto** (ver `loadChipSettings` en `js/assistant.js:52-65` y el handler `.setting-toggle` en `js/admin.js:2246-2253`).

## Diseño

### 1. Modelo de estados: guardar el vuelo, derivar el final

Se separa **qué se guarda** de **cómo se cuenta**:

| Capa | Qué es | Valores |
|---|---|---|
| `status` (columna existente) | estado de vuelo: ¿sigue viva o terminó, y cómo? | `active` · `completed` · `abandoned` |
| `lifecycle` (derivado en los RPCs) | estado final que se muestra | `escalada` · `cerrada_cliente` · `abandonada` · `en_curso` |

La regla **"escalada gana"** vive en SQL, igual que el `eff_status` que ya coalesce la calidad:

```sql
case when support_redirected           then 'escalada'
     when status = 'completed'         then 'cerrada_cliente'
     when status = 'abandoned'         then 'abandonada'
     else 'en_curso' end as lifecycle
```

Por qué derivar en vez de escribir un cuarto valor en `status`:

- **No hace falta tocar el CHECK** de `status`: los tres valores de vuelo ya son los permitidos.
- **Funciona retroactivo**: toda conversación histórica con `support_redirected = true` aparece como escalada sin backfill.
- **No hay carrera de escrituras.** Si el estado final se escribiera, una conversación que escala en el mensaje 3 y sigue chateando quedaría marcada como terminada estando viva; y habría que decidir qué gana entre "escaló" y "abandonó" en tiempo de escritura.
- El barrido queda trivial: `WHERE status = 'active'`.

`en_curso` son las conversaciones vivas dentro de la ventana de cierre. En un rango histórico, después de que el cron corra, deben ser ~0. En el dashboard **no es un cuarto segmento de la barra**: va como nota al pie ("· 3 en curso") para no romper la comparación entre los tres finales.

### 2. `last_activity_at` + barrido con pg_cron

**Columna nueva** `last_activity_at timestamptz`:

- Backfill de filas existentes con `coalesce(ended_at, started_at)`.
- La escribe cada PATCH que ya hace `sendMessage` (un campo más en el payload del upsert) y también `resolveConversation`.
- Índice parcial `on bodi_conversations (last_activity_at) where status = 'active'` — calza exacto con el predicado del barrido y se mantiene chico porque solo indexa lo vivo.

**Función + agendado.** El `UPDATE` va envuelto en una función que devuelve cuántas filas cerró, para poder verificar a mano (`select close_stale_conversations()`) sin esperar al agendado:

```sql
create or replace function close_stale_conversations() returns int
language plpgsql security definer set search_path = public as $$
declare v_min int; v_count int;
begin
  select coalesce(
    (select value::int from app_settings
      where key = 'inactividad_cierre_min' and value ~ '^[0-9]+$'), 30) into v_min;
  update bodi_conversations
     set status = 'abandoned', ended_at = last_activity_at
   where status = 'active'
     and last_activity_at < now() - make_interval(mins => v_min);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

select cron.schedule('cerrar-conversaciones-inactivas', '*/10 * * * *',
  $$select close_stale_conversations()$$);
```

Decisiones dentro de eso:

- **`ended_at = last_activity_at`**, no `now()`: la conversación terminó cuando el usuario dejó de escribir. Usar la hora del barrido inflaría toda duración hasta 10 minutos.
- **Barre cada 10 min** contra un umbral de 30: el peor caso son 40 minutos hasta marcar, aceptable para un dato analítico.
- **El guard `value ~ '^[0-9]+$'`** es deliberado: si alguien escribe "treinta" en el admin, el barrido cae al default en vez de reventar y dejar de correr para siempre.
- **El barrido ignora cualquier switch de UI.** El cierre no es opcional: si se pudiera apagar, volvería el bug de las conversaciones `active` eternas. Los estados finales se garantizan siempre.

**Prerrequisito manual:** prender `pg_cron` en Supabase → Database → Extensions. La migración incluye `create extension if not exists pg_cron` y si no tiene permiso **debe fallar ruidosamente** en esa línea, no aplicarse a medias dejando el barrido sin agendar.

### 3. RPCs

- **`analytics_bot_summary`** — agrega `kpis.lifecycle = { cerrada_cliente, abandonada, escalada, en_curso }` (cuatro conteos sobre el `lifecycle` derivado en el CTE `res`). Se conserva `kpis.abandoned` para no romper consumidores.
- **`analytics_bot_conversations`** — agrega `lifecycle` por fila y un parámetro nuevo `p_lifecycle text default null` al final de la firma.

**Cuidado con el nombre:** `p_status` **ya significa calidad** (filtra sobre `resolution_status`). El filtro de ciclo de vida tiene que ser `p_lifecycle`, un parámetro aparte, o se pisan. Como `js/analytics-api.js` llama con parámetros nombrados, agregarlo al final no rompe las llamadas existentes; sí hay que actualizar el `drop function` con la firma completa.

### 4. Rescate por inactividad en el chat

**Tiempos, ambos editables desde el admin:**

| Clave en `app_settings` | Default | Quién la lee |
|---|---|---|
| `inactividad_aviso_min` | `5` (y `0` apaga el aviso) | el navegador |
| `inactividad_cierre_min` | `30` | el cron |

Cada clave tiene **un único consumidor**, así que no hay semántica compartida que se desincronice. No hay switch de encendido: un switch que no gobierna el barrido mentiría sobre lo que hace, y `aviso = 0` ya da la capacidad de apagar el aviso.

**Umbrales largos a propósito.** Cerrar rápido no solo pierde contexto: cuando una conversación se cierra, `conversationId` queda en `null` y el siguiente mensaje **crea una fila nueva**. Cerrar agresivo parte una duda real en dos o tres chats, lo que **infla el total de conversaciones y hunde el porcentaje de resueltas**. Por eso el navegador **no auto-cierra**: solo avisa. Si el usuario vuelve a los 25 minutos con la pestaña abierta, sigue en su conversación.

**Comportamiento del aviso (opción B — separador de sistema):**

- Se arma un temporizador después de cada mensaje. **Nunca aparece mientras el bot está escribiendo** (respeta el flag `sending`).
- Al llegar a `inactividad_aviso_min` se inserta un separador centrado que corta el hilo — línea horizontal + `⏱ ¿SIGUES AHÍ?` + subtexto "El chat se cierra solo en un rato" + píldora "Sí, sigo aquí". **No es una burbuja**: queda claro que no habló el bot.
- **Una sola vez por conversación.** Un aviso que reaparece cada 5 minutos es una molestia, no una ayuda. Si el usuario se va de nuevo, el cron cierra a los 30 y el chat no insiste.
- Cualquier acción del usuario (tocar la píldora o escribir) **borra el aviso completo** del hilo. No queda una pregunta muerta en el historial.
- **El aviso NO se persiste en `messages`.** Es UI, no conversación: si se guardara, contaminaría el historial que se le manda al LLM y las métricas de mensajes.
- Estilo: tokens existentes (`--black-60`, `--black-40`, `--blue-20`, `--blue-100`). Sin colores nuevos.

**Guard de conversación vencida.** Caso borde: pestaña abierta, el cron cierra a los 30, el usuario escribe a los 40. El frontend todavía tiene el `conversationId` viejo y haría PATCH sobre una fila ya marcada como abandonada, resucitándola con mensajes nuevos. Solución: antes de enviar, si el hueco de inactividad superó `inactividad_cierre_min`, el frontend suelta el `conversationId` (y `sessionMessages`) y arranca fila nueva.

La marca de última actividad del lado cliente es una **variable de módulo, sin persistir**. No hace falta localStorage: `conversationId` tampoco se persiste (`js/assistant.js:83`), así que una recarga ya arranca conversación nueva en el primer mensaje (`assistant.js:599`) — comportamiento pre-existente, fuera de alcance. El guard solo tiene que cubrir la vida de una misma pestaña.

**Módulo puro nuevo `js/inactivity.js`** (patrón de `clarify.js` y `bot-attention.js` — import-safe, sin DOM):

- `inactivitySettings(rows)` → `{ avisoMs, cierreMs }` desde las filas de `app_settings`. Clave ausente, vacía o no numérica ⇒ default. `aviso = 0` ⇒ `avisoMs = 0` (apagado).
- `isStaleConversation(lastActivityMs, nowMs, cierreMs)` → `boolean`.

El temporizador en sí (`setTimeout`, insertar/quitar el nodo del separador) queda como pegamento fino en `assistant.js`, sin test propio — mismo criterio que el sub-proyecto D: la lógica testeable vive en el módulo puro.

**Código muerto que se va:** `ABANDON_URL` (`js/assistant.js:10`) y el listener `beforeunload` con `sendBeacon` (`js/assistant.js:142-145`). Con pg_cron son redundantes y hoy apuntan a un workflow apagado. El workflow `Bodi Abandon Webhook` de n8n queda para borrar.

### 5. Admin — los dos campos numéricos

Van en la card "Comportamiento" del panel **Sugerencias Bot** (`renderSuggestionsPanel`, `js/admin.js:2163+`), donde ya viven `chips_inicio` y `chips_tras_respuesta`:

```
Comportamiento
  [✓] Mostrar sugerencias al abrir el chat
  [✓] Reaparecer después de cada respuesta
      Avisar por inactividad a los   [ 5] min   (0 = no avisar)
      Cerrar conversación a los      [30] min
```

Hay que sumar un handler `.setting-number` análogo al `.setting-toggle` existente: `upsert` de `{key, value: String(n)}` al cambiar, con validación de entero ≥ 0, y en caso de error revertir el campo al valor anterior + `showToast`, igual que hace hoy el de checkbox.

### 6. Dashboard

**Builder puro nuevo `lifecycleBar(lifecycle)`** en `js/analytics-ui.js`, misma barra apilada con conteos dentro que `sentimentBar` (sub-proyecto D):

- Entrada: `{ cerrada_cliente, abandonada, escalada, en_curso }` (campos opcionales ⇒ 0).
- Tres segmentos: `cerrada_cliente` = `bg-[var(--success-150)]` (texto blanco), `abandonada` = `bg-[var(--black-10)]` (texto `var(--black-60)`), `escalada` = `bg-[var(--warning-150)]` (texto blanco).
- `en_curso` **no es segmento**: se excluye del total de la barra y se devuelve/renderiza como nota al pie.
- Mismo tratamiento que `sentimentBar`: `total || 1`, `overflow-hidden whitespace-nowrap`, `title` con conteo + etiqueta larga.

**Card nueva "Cómo terminan las conversaciones"** en `js/admin-bot-analytics.js`, alimentada por `kpis.lifecycle`:

```
┌─ Cómo terminan las conversaciones ─────┐
│ ████████████ 120 │████ 45 │██ 18 │     │
│  cerró el cliente · abandonó · escaló   │
│  · 3 en curso                           │
└─────────────────────────────────────────┘
```

**Explorador:** badge de ciclo de vida por fila (`Cerró` / `Abandonó` / `Escaló` / `En curso`) y grupo de chips de filtro `filterChips('life', 'Cierre', [...])` que pasa `p_lifecycle`.

**Consolidación (evitar UI redundante).** Bajo "escalada gana", `lifecycle = 'escalada'` ⟺ `support_redirected = true`. Así que el badge y el filtro nuevos **reemplazan** a los actuales de soporte, en vez de convivir con ellos:

- el badge `Escaló` que hoy lee `c.support_redirected` (`js/admin-bot-analytics.js:175`) pasa a ser el badge de ciclo de vida;
- el grupo de chips `filterChips('sup', 'Soporte', …)` (L157) se reemplaza por el de ciclo de vida;
- la columna del CSV `{ label: 'Escaló', … }` (L248) pasa a `{ label: 'Cómo terminó', … }`.

Es el mismo criterio de consolidación que el sub-proyecto C (una card en vez de dos). El parámetro `p_support` del RPC **se conserva** para no romper la firma ni consumidores.

**Propiedad que sale gratis:** el abandono **no distorsiona `resolved_pct`**. Ese porcentaje ya usa como denominador solo `resuelta + no_resuelta`, y las abandonadas quedan sin resolución. Se puede medir abandono sin mover la métrica de calidad.

## Interfaces / unidades

- `inactivitySettings(rows)` — puro, sin DOM. Entrada: filas `{key, value}` de `app_settings`. Salida: `{avisoMs, cierreMs}`. Sin dependencias.
- `isStaleConversation(lastActivityMs, nowMs, cierreMs)` — puro, sin DOM. Salida: boolean.
- `lifecycleBar(lifecycle)` — puro, sin DOM. Entrada: los cuatro conteos. Salida: string HTML sin margen externo (el consumidor pone su spacing), igual que `sentimentBar`.
- `close_stale_conversations()` — unidad del lado datos. Contrato: cierra las vencidas y devuelve cuántas. Idempotente (correrla dos veces no cambia nada la segunda vez).
- `lifecycle` derivado — vive en los dos RPCs. Contrato: los tres finales + `en_curso` suman el total del rango.

## Testing

- `tests/inactivity.test.mjs` (nuevo):
  - `inactivitySettings`: claves presentes se parsean a ms; clave ausente ⇒ default (5/30); valor vacío, negativo o no numérico ⇒ default; `aviso = '0'` ⇒ `avisoMs = 0`.
  - `isStaleConversation`: dentro del umbral ⇒ false; pasado el umbral ⇒ true; borde exacto; `lastActivityMs` nulo/indefinido no lanza.
- `tests/analytics-ui.test.mjs` (extender) para `lifecycleBar`: los tres conteos aparecen; anchos calculados sobre el total de los tres (con `en_curso` **excluido** del cálculo); base cero no lanza y da `0%`; entrada indefinida no lanza.
- **SQL** verificado a mano por el usuario: correr las migraciones, `select close_stale_conversations()` (devuelve un int), `select cron.jobname from cron.job` (el agendado existe), y una consulta de conteos por `lifecycle` para contrastar con el dashboard.
- El cableado de `assistant.js`, `admin.js` y `admin-bot-analytics.js` se verifica en navegador (usan `document`, no son import-safe en Node). Para el aviso: bajar `inactividad_aviso_min` a 1 y esperar.
- Suite: `node --test tests/*.test.mjs`. El warning `MODULE_TYPELESS_PACKAGE_JSON` es esperado y NO es hallazgo.

## Manejo de errores

- `app_settings` ilegible o clave ausente ⇒ defaults, por convención del proyecto.
- PATCH del frontend que falla ⇒ no se pierde el estado: el cron cierra la conversación después. Es el punto del diseño híbrido.
- Minutos inválidos ⇒ guard doble: regex en SQL, validación en el handler del admin y default en `inactivitySettings`.
- `pg_cron` no disponible ⇒ la migración falla en su primera línea, ruidosamente.
- El aviso nunca aparece si el bot está respondiendo (flag `sending`), para no interrumpir una animación de typewriter en curso.

## Alcance

- Rama `sandbox`. Estilo del repo: 2 espacios, **sin punto y coma**, sin clases Tailwind nuevas.
- Migraciones en `supabase/migrations/`, aplicadas a mano en el SQL Editor (convención del proyecto: "ejecutar UNA sola vez").
- **Orden de trabajo:** ① datos y cron (migración + 2 RPCs) → ② rescate (`inactivity.js` + tests + `assistant.js` + `admin.js`) → ③ dashboard (`lifecycleBar` + tests + `admin-bot-analytics.js` + `analytics-api.js`).

**Fuera de alcance:**

- Tendencia de abandono en el tiempo (tocaría `analytics_bot_trend` y un gráfico nuevo).
- Cambiar `resolution_status`, `resolved` o la clasificación de calidad — dimensión independiente.
- El auto-eval con LLM (①c del rediseño de analytics).
- Reabrir una conversación cerrada: una vez cerrada, se arranca fila nueva. No hay "reopen".
- Notificar al usuario que su conversación se cerró mientras no estaba mirando.
