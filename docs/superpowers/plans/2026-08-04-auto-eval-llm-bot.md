# Auto-evaluación de calidad del bot con LLM (①c) Implementation Plan

> **Ejecución INLINE (no subagentes).** Este sub-proyecto construye un workflow en n8n de producción vía la API REST, no código del repo con tests. Se ejecuta paso a paso en esta sesión, con **OK puntual del usuario** antes de cada acción que crea/activa/ejecuta algo en n8n en vivo. Los pasos usan checkbox (`- [ ]`).

**Goal:** Un workflow n8n nuevo e independiente que, en cron, evalúa con un LLM cada conversación cerrada sin evaluar y escribe `resolution_status`, `category`, `knowledge_gap`, `summary` y `sentiment` en `bodi_conversations`.

**Architecture:** Schedule Trigger → llama una RPC de Supabase que devuelve el lote a evaluar → loop por conversación → HTTP a OpenAI con *structured outputs* (`response_format: json_schema`) → PATCH a Supabase (PostgREST) con los 5 campos. Sin secretos en el JSON del workflow: las llamadas HTTP usan **credenciales de n8n** (OpenAI existente + una credencial Supabase service-role). El guard `resolution_status IS NULL` da idempotencia y backfill natural.

**Tech Stack:** n8n (API REST pública, `https://n8n.mplasesores.com/api/v1`), Supabase (PostgREST + una RPC), OpenAI `gpt-4o-mini` structured outputs.

## Global Constraints

- **No tocar otros workflows.** La instancia es compartida (MPL y varios clientes). Solo se **crea** un workflow nuevo; el `Bold POS Chat` (`dZGuYJbRbG6h8aqv`) y el resto no se modifican.
- **Sin secretos en el workflow.** Las claves (OpenAI, service-role) viven en **credenciales de n8n** referenciadas por id. Nada de JWT/keys en texto plano en los nodos.
- **RLS:** `bodi_conversations` solo permite `SELECT` a `authenticated` → las llamadas de lectura/escritura usan la **service-role**.
- **Idempotencia:** `resolution_status IS NULL` evita re-evaluar; correr dos veces no duplica costo.
- **API n8n:** key en `.claude/settings.local.json` (`X-N8N-API-KEY`). GET/PUT sobre `dZGuYJbRbG6h8aqv` ya están aprobados; **POST /workflows, PATCH y GET de otros ids pedirán aprobación** al ejecutarlos — es lo esperado.
- **Migraciones a mano:** el SQL (Task 1) va en `supabase/migrations/`, idempotente, y lo aplica el usuario en el SQL Editor.
- **Modelo:** `gpt-4o-mini`, `temperature: 0`, structured outputs (`strict: true`).

## Taxonomía de `category` (fija)

`Configuración`, `Inventario`, `Ingresos`, `Egresos`, `Ventas`, `Contactos`, `Reportes`, `Casos de Uso`, `Hardware/Periféricos`, `Facturación/Cuenta`, `Otro`.

---

### Task 1: RPC `analytics_conversations_to_evaluate`

Encapsula la selección del lote en SQL (el filtro "tiene mensaje de usuario" es incómodo en PostgREST). El workflow solo llama la RPC. `security definer` para leer saltando la RLS; se concede solo a `service_role`.

**Files:**
- Create: `supabase/migrations/create_analytics_conversations_to_evaluate.sql`

**Interfaces:**
- Produces: `public.analytics_conversations_to_evaluate(p_limit int default 50) returns table(id uuid, messages jsonb)` — conversaciones cerradas, sin evaluar, con ≥1 mensaje de usuario, más viejas primero.

- [ ] **Step 1: Escribir la migración**

```sql
-- analytics_conversations_to_evaluate: lote de conversaciones cerradas y aún sin
-- evaluar por el LLM (resolution_status is null), con al menos un mensaje de
-- usuario, más viejas primero. La usa el workflow n8n de auto-evaluación (①c).
-- security definer + grant solo a service_role: el job la llama con la
-- credencial service-role; ningún rol anónimo la ejecuta.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
create or replace function public.analytics_conversations_to_evaluate(
  p_limit int default 50
) returns table(id uuid, messages jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select id, messages
  from bodi_conversations
  where status in ('completed','abandoned')
    and resolution_status is null
    and exists (
      select 1 from jsonb_array_elements(coalesce(messages,'[]'::jsonb)) m
      where m->>'role' = 'user'
    )
  order by started_at asc
  limit greatest(1, least(p_limit, 200));
$$;

revoke execute on function public.analytics_conversations_to_evaluate(int) from public, anon, authenticated;
grant  execute on function public.analytics_conversations_to_evaluate(int) to service_role;
```

- [ ] **Step 2: Aplicar en el SQL Editor** — Esperado: `Success. No rows returned`.

- [ ] **Step 3: Verificar (query de control, como service_role en el SQL Editor)**

```sql
select count(*) as pendientes,
       (select count(*) from public.analytics_conversations_to_evaluate(50)) as lote;
```
Esperado: `pendientes` = nº de cerradas sin evaluar (histórico ~113 al inicio); `lote` = min(pendientes, 50). Sin error.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/create_analytics_conversations_to_evaluate.sql
git commit -m "feat(db): RPC analytics_conversations_to_evaluate (lote para ①c)"
```

---

### Task 2: Credenciales en n8n (prerequisito — lo hace el usuario en la UI de n8n)

El workflow referencia dos credenciales por id. No se crean por la API (n8n no expone crear/listar credenciales con datos de forma fiable); las confirma/crea el usuario.

**Interfaces:**
- Produces: `OPENAI_CRED_ID` y `SUPABASE_CRED_ID` (ids de credencial) que consumen las Tasks 3+.

- [ ] **Step 1: OpenAI** — ya existe: credencial `openAiApi` id **`DGC36ZkqZ6GRAz10`** (la usa el workflow de chat). Se reutiliza. No hay que crear nada.

- [ ] **Step 2: Supabase service-role** — el usuario crea (si no existe) una credencial **"Header Auth"** en n8n con:
  - Nombre sugerido: `Supabase Academia (service-role)`.
  - Header name: `Authorization` · Header value: `Bearer <SERVICE_ROLE_KEY>` del proyecto `tczcngfhuendmldafbrc` (Supabase → Project Settings → API → `service_role`).
  - (El header `apikey` se manda por separado en cada nodo, ver Task 3; o se crea una credencial "Supabase API" nativa que ya incluye host+key — cualquiera de las dos sirve, pero Header Auth es la más simple.)

- [ ] **Step 3: El usuario pasa a Claude el `SUPABASE_CRED_ID`** (visible en la URL al editar la credencial, o en el desplegable del nodo). Con ese id + `DGC36ZkqZ6GRAz10` se arma el workflow.

> **Gate:** No continuar a Task 3 sin `SUPABASE_CRED_ID`. Si el usuario dice que ya existe una credencial Supabase/Postgres, se identifica su id inspeccionando un workflow que ya toque este Supabase (p. ej. `Embeber Lección`, id `LE4c80XzDKXqZ0At`) vía `GET /workflows/{id}` — requiere aprobación puntual.

---

### Task 3: Construir y crear el workflow (inactivo)

Se arma el JSON del workflow y se crea vía `POST /api/v1/workflows` **inactivo**. Se guarda una copia en scratch gitignored para poder re-PUT/rollback.

**Files:**
- Create (scratch, gitignored): `.superpowers/sdd/aeval-workflow.json`

**Interfaces:**
- Consumes: `OPENAI_CRED_ID`, `SUPABASE_CRED_ID` (Task 2); la RPC de Task 1.
- Produces: `AEVAL_WF_ID` (id del workflow nuevo).

**Topología de nodos (config exacta):**

1. **Schedule Trigger** (`n8n-nodes-base.scheduleTrigger`): intervalo cada 1 hora. (Se activa recién en Task 6; se crea desconectado del cron real hasta validar.)
2. **HTTP Request — obtener lote** (`n8n-nodes-base.httpRequest`), credencial `SUPABASE_CRED_ID`:
   - `POST {SUPABASE_URL}/rest/v1/rpc/analytics_conversations_to_evaluate`
   - Headers: `apikey: <service-role>` (o vía credencial), `Content-Type: application/json`.
   - Body JSON: `{ "p_limit": 50 }` (en Task 4 se prueba con `1`).
   - Devuelve un array `[{id, messages}]`.
3. **Split In Batches / Loop Over Items** (`n8n-nodes-base.splitInBatches`, batchSize 1): itera cada conversación.
4. **Code — construir prompt** (`n8n-nodes-base.code`, runOnceForEachItem):
   ```javascript
   const msgs = Array.isArray($json.messages) ? $json.messages : [];
   const transcript = msgs
     .map(m => `${m.role === 'user' ? 'Usuario' : 'Bot'}: ${String(m.content ?? '').trim()}`)
     .join('\n')
     .slice(0, 4000); // acota tokens
   return { json: { id: $json.id, transcript } };
   ```
5. **HTTP Request — OpenAI** (`n8n-nodes-base.httpRequest`), credencial `OPENAI_CRED_ID` (`predefinedCredentialType` → `openAiApi`):
   - `POST https://api.openai.com/v1/chat/completions`, body raw JSON:
   ```json
   {
     "model": "gpt-4o-mini",
     "temperature": 0,
     "messages": [
       { "role": "system", "content": "Eres un evaluador de conversaciones de soporte de Bold POS (un POS/punto de venta). Recibes el transcript (Usuario ↔ Bot) y devuelves SOLO el objeto estructurado. resolution_status: 'resuelta' si el bot dio lo que el usuario pedía y este no siguió insistiendo; 'no_resuelta' si no resolvió o el usuario terminó frustrado o derivado a soporte sin respuesta útil; 'ambigua' si el bot respondió pero el usuario se fue sin señal clara. category: UNA de la lista; si no encaja en las de producto usa las operativas; si nada aplica, 'Otro'. knowledge_gap: true si el bot no pudo resolver con el contenido disponible (dijo que no tenía información, derivó a soporte sin dar la solución, o el tema no está cubierto). summary: una línea (máx 120 caracteres) en español con la consulta principal. sentiment: tono general del usuario en toda la conversación." },
       { "role": "user", "content": "={{ $json.transcript }}" }
     ],
     "response_format": {
       "type": "json_schema",
       "json_schema": {
         "name": "eval_conversacion",
         "strict": true,
         "schema": {
           "type": "object",
           "additionalProperties": false,
           "required": ["resolution_status","category","knowledge_gap","summary","sentiment"],
           "properties": {
             "resolution_status": { "type": "string", "enum": ["resuelta","no_resuelta","ambigua"] },
             "category": { "type": "string", "enum": ["Configuración","Inventario","Ingresos","Egresos","Ventas","Contactos","Reportes","Casos de Uso","Hardware/Periféricos","Facturación/Cuenta","Otro"] },
             "knowledge_gap": { "type": "boolean" },
             "summary": { "type": "string" },
             "sentiment": { "type": "string", "enum": ["positivo","neutro","negativo"] }
           }
         }
       }
     }
   }
   ```
6. **Code — parsear** (`n8n-nodes-base.code`, runOnceForEachItem):
   ```javascript
   const raw = $json.choices?.[0]?.message?.content ?? '{}';
   const e = JSON.parse(raw);
   // arrastra el id desde el nodo de construcción del prompt
   const id = $('Code - construir prompt').item.json.id;
   return { json: { id,
     resolution_status: e.resolution_status,
     category: e.category,
     knowledge_gap: e.knowledge_gap,
     summary: e.summary,
     sentiment: e.sentiment } };
   ```
7. **HTTP Request — escribir** (`n8n-nodes-base.httpRequest`), credencial `SUPABASE_CRED_ID`:
   - `PATCH {SUPABASE_URL}/rest/v1/bodi_conversations?id=eq.{{ $json.id }}`
   - Headers: `apikey: <service-role>`, `Content-Type: application/json`, `Prefer: return=minimal`.
   - Body JSON: `{ "resolution_status": "={{ $json.resolution_status }}", "category": "={{ $json.category }}", "knowledge_gap": {{ $json.knowledge_gap }}, "summary": "={{ $json.summary }}", "sentiment": "={{ $json.sentiment }}" }`.
8. Volver al **Split In Batches** hasta agotar el lote.

`SUPABASE_URL` = `https://tczcngfhuendmldafbrc.supabase.co`.

- [ ] **Step 1:** Escribir `.superpowers/sdd/aeval-workflow.json` con la topología anterior, `active: false`, nombre `Bold POS - Auto-eval calidad (①c)`. Ajustar `typeVersion` de cada nodo consultando un workflow existente vía la API si hace falta (el de chat ya usa httpRequest y code).
- [ ] **Step 2 (requiere OK del usuario):** `POST /api/v1/workflows` con el JSON. Guardar el `id` devuelto como `AEVAL_WF_ID`. Confirmar que se creó **inactivo**.
- [ ] **Step 3:** `GET /api/v1/workflows/{AEVAL_WF_ID}` y revisar que los nodos/credenciales quedaron bien enganchados (sin credenciales faltantes).

---

### Task 4: Prueba con una sola conversación

**Interfaces:** Consumes `AEVAL_WF_ID`.

- [ ] **Step 1:** Poner el body del nodo "obtener lote" en `{ "p_limit": 1 }`.
- [ ] **Step 2 (requiere OK del usuario):** Ejecutar el workflow a mano vía API (`POST /api/v1/workflows/{AEVAL_WF_ID}/run` o el endpoint de ejecución que exponga esta versión de n8n; si no, activar temporalmente y disparar). Alternativa sin API: el usuario pulsa "Execute workflow" en la UI.
- [ ] **Step 3: Verificar** — el usuario corre en el SQL Editor:
  ```sql
  select id, resolution_status, category, knowledge_gap, sentiment, summary
  from bodi_conversations
  where resolution_status is not null
  order by started_at desc limit 3;
  ```
  Esperado: la fila evaluada tiene los 5 campos poblados y coherentes con su transcript (revisar 1 a mano). Si algo sale raro (categoría fuera de taxonomía, summary vacío), ajustar el prompt/schema y repetir.
- [ ] **Step 4:** Restaurar `p_limit` a `50`.

---

### Task 5: Backfill del histórico

- [ ] **Step 1 (requiere OK del usuario):** Ejecutar el workflow repetidamente (o subir temporalmente el cron a cada pocos minutos) hasta que `analytics_conversations_to_evaluate(50)` devuelva 0 filas. Con ~113 pendientes y lote 50, son ~3 corridas.
- [ ] **Step 2: Verificar**:
  ```sql
  select count(*) filter (where resolution_status is null and status in ('completed','abandoned')) as sin_evaluar,
         count(*) filter (where resolution_status is not null) as evaluadas
  from bodi_conversations;
  ```
  Esperado: `sin_evaluar` → 0 (o solo las que fallaron, que reintentará el cron); `evaluadas` sube al histórico.
- [ ] **Step 3: Idempotencia** — ejecutar una vez más y confirmar que no re-evalúa (el lote sale vacío, 0 llamadas a OpenAI).

---

### Task 6: Activar el schedule

- [ ] **Step 1 (requiere OK del usuario):** Confirmar el Schedule Trigger a **cada 1 hora** y activar el workflow (`PATCH /api/v1/workflows/{AEVAL_WF_ID}` con `active: true`, o el endpoint `/activate`).
- [ ] **Step 2: Verificar en el dashboard** — Analytics → BolBot: la "resolución real" y las categorías reflejan el dato del LLM (ya no la nota de fallback), y el sentimiento se ve más repartido (ya no todo neutro).
- [ ] **Step 3:** Registrar en memoria del proyecto: `AEVAL_WF_ID`, que ①c está en producción, y el patrón (RPC + workflow n8n con credenciales nativas).

---

## Cierre del sub-proyecto

El bot reporta **calidad real** (resolución LLM de 3 estados), categoría estable, gap de conocimiento, resumen y sentimiento de toda la conversación, poblados en cron sin tocar el workflow de chat ni exponer secretos. Los dashboards ② y ③ mejoran solos vía el `coalesce` de las RPCs de ①a.

## Self-review (cobertura del spec)

- Workflow nuevo e independiente, cron, sin tocar el chat → Task 3/6.
- Selección `completed/abandoned` + `resolution_status is null` + ≥1 mensaje usuario, más viejas primero, con límite → Task 1 (RPC).
- LLM `gpt-4o-mini` structured outputs con los 5 campos y la taxonomía fija → Task 3 (nodo OpenAI + schema).
- Escritura de los 5 campos por id → Task 3 (nodo PATCH).
- Credenciales nativas (OpenAI existente + Supabase service-role), sin secretos en el JSON → Task 2/3.
- Backfill por el guard `IS NULL` + idempotencia → Task 5.
- Verificación por query de control + dashboard → Tasks 4/5/6.
- Prerequisito real (service-role, RLS solo-authenticated) explícito → Task 2 gate.
