# Auto-evaluación de calidad del bot con LLM (①c) — Diseño

**Fecha:** 2026-08-04
**Estado:** Diseño aprobado. Siguiente: plan de implementación.
**Relacionado:** sub-proyecto ①c del [rediseño de analytics](2026-07-20-rediseno-analytics-lecciones-bolbot-design.md). Llena de datos reales las columnas que ①a creó en `bodi_conversations` y que hoy están `null` (los dashboards ② y ③ hacen fallback al `resolved`/`topic` legacy hasta que esto exista).

## Contexto y problema

La calidad del bot se mide hoy con el botón "¿te sirvió?" que solo pulsa ~9% de los usuarios, y el tema sale del `topic` libre del clasificador. El rediseño de analytics decidió medir **calidad real** con un LLM que lee cada conversación completa y clasifica:

- **Resolución** en 3 estados (Resuelta / No resuelta / Ambigua) — reemplaza al booleano `resolved` del botón.
- **Categoría** de una taxonomía estable — reemplaza al `topic` libre.
- **Gap de conocimiento** (bool) — el bot no pudo resolver con el contenido disponible.
- **Resumen** de 1 línea.
- **Sentimiento** de toda la conversación — mejora el sentimiento por-turno actual (ver más abajo).

Las columnas ya existen (`add_llm_fields_bodi_conversations.sql`): `resolution_status`, `category`, `knowledge_gap`, `summary`. `sentiment` ya existía en la tabla base. El transcript completo está en la columna `messages` (jsonb `[{role, content}]`), persistido por `assistant.js` en cada turno.

**Sobre `sentiment`:** hoy lo puebla el frontend con `data.sentiment ?? 'neutro'` (`assistant.js:757`) — un sentimiento por-turno del clasificador liviano del chat, con default `'neutro'` y "gana el último". Es superficial y sesgado a neutro. Como el LLM de ①c lee el transcript completo, emitir también `sentiment` es casi gratis y da un valor de toda la conversación, más fiel. ①c lo sobrescribe **solo en conversaciones cerradas** (las activas conservan el valor en vivo hasta cerrarse y evaluarse).

## Restricciones

- **No tocar el workflow de chat en producción** (`Bold POS Chat`, id `dZGuYJbRbG6h8aqv`). ①c es un workflow **nuevo e independiente**.
- **Sin secretos hardcodeados.** El workflow de chat actual tiene el token y el JWT en texto plano (deuda conocida); el workflow nuevo usa **credenciales nativas de n8n**.
- **RLS:** `bodi_conversations` solo permite `SELECT` a `authenticated`. El job necesita una credencial **service-role** de Supabase para leer y escribir.
- **Idempotencia:** el guard `resolution_status IS NULL` evita re-evaluar; una corrida repetida no duplica trabajo ni gasta tokens de más.
- **Costo acotado:** `gpt-4o-mini`, `LIMIT` por corrida, un solo objeto estructurado por conversación.

## Diseño

### Topología del workflow (n8n, nuevo)

```
Schedule Trigger (cada hora)
  → Supabase (Postgres): SELECT conversaciones a evaluar   [service-role]
  → Split In Batches / loop por conversación
      → Preparar prompt (Code): serializa messages a texto rol: contenido
      → LLM (gpt-4o-mini) con Structured Output Parser
      → Supabase (Postgres): UPDATE los 5 campos por id     [service-role]
  → (fin del loop)
```

Se usan nodos nativos de n8n (Schedule Trigger, Postgres/Supabase, y el nodo de LLM de LangChain con output parser). Sin HTTP crudo con secretos embebidos.

### Selección (SELECT)

```sql
select id, messages
from bodi_conversations
where status in ('completed','abandoned')
  and resolution_status is null
  and jsonb_array_length(coalesce(messages, '[]'::jsonb)) >= 1
  and exists (
    select 1 from jsonb_array_elements(messages) m
    where m->>'role' = 'user'
  )
order by started_at asc
limit 50;
```

`order by started_at asc` procesa primero las más viejas (backfill ordenado). El `limit 50` acota cada corrida; como el Schedule corre cada hora, la cola histórica se vacía en pocas corridas y luego solo entran las nuevas conversaciones cerradas.

### Prompt del LLM y salida estructurada

**System (resumen del contenido):** clasificador de conversaciones de soporte de Bold POS. Recibe el transcript (usuario ↔ bot) y devuelve **solo** el objeto estructurado. Reglas:
- `resolution_status`: `resuelta` si el bot respondió lo que el usuario pedía y el usuario no siguió insistiendo; `no_resuelta` si el bot no resolvió o el usuario terminó frustrado / derivado a soporte sin respuesta útil; `ambigua` si el bot respondió pero el usuario se fue sin señal clara.
- `category`: **una** de la taxonomía fija (abajo). Si no encaja en las de lecciones, usar las operativas; si nada aplica, `Otro`.
- `knowledge_gap`: `true` si el bot no pudo resolver con el contenido disponible (dijo "no tengo información", derivó a soporte sin dar la solución, o el tema no está cubierto).
- `summary`: una línea (≤120 caracteres) en español, describiendo la consulta principal.
- `sentiment`: `positivo | neutro | negativo`, del tono general del usuario en toda la conversación.

**Taxonomía de `category` (fija):**
`Configuración`, `Inventario`, `Ingresos`, `Egresos`, `Ventas`, `Contactos`, `Reportes`, `Casos de Uso`, `Hardware/Periféricos`, `Facturación/Cuenta`, `Otro`.

(Las 8 primeras son las categorías reales de lecciones → una categoría mapea a un área de lecciones y el puente bot→lección del dashboard queda coherente. Las 3 últimas cubren lo que las lecciones no cubren. Es una lista fija en el prompt; si las categorías de lecciones cambian materialmente, se actualiza el prompt.)

**Structured Output Parser (JSON Schema):**
```json
{
  "type": "object",
  "required": ["resolution_status", "category", "knowledge_gap", "summary", "sentiment"],
  "properties": {
    "resolution_status": { "type": "string", "enum": ["resuelta", "no_resuelta", "ambigua"] },
    "category": { "type": "string", "enum": ["Configuración","Inventario","Ingresos","Egresos","Ventas","Contactos","Reportes","Casos de Uso","Hardware/Periféricos","Facturación/Cuenta","Otro"] },
    "knowledge_gap": { "type": "boolean" },
    "summary": { "type": "string" },
    "sentiment": { "type": "string", "enum": ["positivo","neutro","negativo"] }
  }
}
```

### Escritura (UPDATE)

Por cada conversación evaluada:
```sql
update bodi_conversations
set resolution_status = $1,
    category          = $2,
    knowledge_gap     = $3,
    summary           = $4,
    sentiment         = $5
where id = $6;
```

Los dashboards ② y ③ ya consumen estos campos con `coalesce` (RPCs de ①a): en cuanto se pueblan, la "resolución real", la categoría estable y el sentimiento dejan de ser fallback y pasan a ser el dato del LLM — sin cambios de frontend.

### Credenciales / prerequisitos (los configura el usuario en n8n)

1. **Supabase service-role** (Postgres o REST) — para `SELECT`/`UPDATE` saltando la RLS de solo-authenticated. Se crea como credencial de n8n; nunca en texto plano en el workflow.
2. **OpenAI** — credencial nativa de n8n (`openAiApi`), reutilizable.

### Backfill

No requiere paso especial: la primera corrida (y las siguientes hasta vaciar la cola) toma las conversaciones históricas con `resolution_status is null`. Con `limit 50` cada hora y ~113 pendientes, quedan al día en 3 corridas. Opcionalmente, ejecutar el workflow a mano (botón "Execute") las primeras veces para no esperar el cron.

### Verificación

- **Prueba de una conversación:** ejecutar el workflow con una sola fila (bajar el `limit` a 1) y confirmar que la fila queda con los 5 campos poblados y valores coherentes con el transcript.
- **Query de control:** `select resolution_status, category, knowledge_gap, sentiment, summary from bodi_conversations where resolution_status is not null order by started_at desc limit 10;`
- **Dashboard:** en Analytics → BolBot, la "resolución real" y las categorías dejan de mostrar la nota "✨ se afina con LLM" como fallback y reflejan el dato nuevo.
- **Idempotencia:** correr dos veces seguidas; la segunda corrida no re-evalúa las ya pobladas (guard `IS NULL`), no gasta tokens extra.

## Fuera de alcance

- No se toca el workflow de chat (`Bold POS Chat`).
- No se migran los secretos hardcodeados del workflow de chat (deuda aparte).
- No se añade `lessons_used` ni `vertical`/`plataforma` por conversación (esos son telemetría FRONT / otro trabajo; ①c es solo la auto-evaluación LLM).
- Sin reintentos sofisticados ni cola persistente: si una conversación falla la evaluación, queda con `resolution_status is null` y la reintenta la siguiente corrida (comportamiento natural del guard).

## Criterios de éxito

- Una conversación cerrada queda con `resolution_status`, `category`, `knowledge_gap`, `summary` y `sentiment` poblados y coherentes con su transcript.
- La cola de históricas (`resolution_status is null`) se vacía en pocas corridas y luego solo entran conversaciones nuevas cerradas.
- El dashboard BolBot muestra "resolución real" (LLM) y categorías estables en vez del fallback del botón/`topic`.
- El workflow no tiene secretos en texto plano (usa credenciales de n8n) y no toca el workflow de chat.
- Correr el workflow dos veces no re-evalúa ni duplica costo.
