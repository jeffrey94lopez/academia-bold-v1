# Bodi Conversation Analytics — Spec

## Goal

Registrar conversaciones del chatbot Bodi en Supabase, mostrar un dashboard de analytics de conversaciones en el panel admin (junto al dashboard de lecciones existente), y exportar datos a CSV desde ambos dashboards.

## Audiencia

Solo el admin accede al dashboard. Los usuarios del chatbot no ven sus estadísticas.

## Arquitectura

- **Supabase** — nueva tabla `bodi_conversations` (una fila por conversación)
- **`ChatBot/chat.js`** — maneja logging: crea la fila al primer mensaje, actualiza tras cada respuesta, captura abandono con `sendBeacon`
- **n8n workflow** — devuelve `topic` y `sentiment` junto con `response` en cada respuesta
- **`js/admin.js`** — nueva función `renderBodiAnalytics()` + nuevo selector de subvista en el panel Analytics + botón CSV en ambos dashboards

---

## Modelo de datos

```sql
CREATE TABLE bodi_conversations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        text NOT NULL,
  started_at        timestamptz DEFAULT now(),
  ended_at          timestamptz,
  messages          jsonb DEFAULT '[]',
  topic             text,
  sentiment         text CHECK (sentiment IN ('positivo', 'neutro', 'negativo')),
  support_redirected boolean DEFAULT false,
  resolved          boolean,
  status            text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned'))
);

CREATE INDEX idx_bodi_conv_status  ON bodi_conversations (status, started_at DESC);
CREATE INDEX idx_bodi_conv_topic   ON bodi_conversations (topic, started_at DESC);
CREATE INDEX idx_bodi_conv_date    ON bodi_conversations (started_at DESC);
```

RLS:
```sql
ALTER TABLE bodi_conversations ENABLE ROW LEVEL SECURITY;

-- anon puede insertar y actualizar (el chatbot no requiere login)
CREATE POLICY "anon_insert" ON bodi_conversations
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update" ON bodi_conversations
  FOR UPDATE TO anon USING (true);

-- solo authenticated puede leer (admin)
CREATE POLICY "auth_select" ON bodi_conversations
  FOR SELECT TO authenticated USING (true);
```

### Campo `messages`

Array de objetos `{ role, content }` — misma estructura que ya maneja `chat.js`:
```json
[
  { "role": "user", "content": "¿Cómo proceso una venta?" },
  { "role": "assistant", "content": "Para procesar una venta en Bold POS..." }
]
```

---

## Cambios en n8n

### Formato de respuesta actualizado

El nodo **Formatear respuesta** devuelve:
```json
{
  "response": "Texto de Bodi para el usuario",
  "topic": "Ventas",
  "sentiment": "neutro",
  "support_redirected": true
}
```

### Modificaciones requeridas

1. **Prompt de OpenAI** — instrucción adicional al final del `systemPrompt` en "Construir prompt":
   ```
   Responde SIEMPRE en JSON con este formato exacto (sin markdown, sin bloques de código):
   {"reply":"<tu respuesta al usuario>","sentiment":"neutro"}
   El campo sentiment debe ser: positivo, neutro, o negativo según el tono del mensaje del usuario.
   ```

2. **Nodo "Formatear respuesta"** — parsea el JSON de OpenAI:
   ```javascript
   var raw = $input.first().json.message.content;
   var parsed;
   try { parsed = JSON.parse(raw); } catch(_) { parsed = { reply: raw, sentiment: 'neutro' }; }

   var wb = $('Normalizar intención').first().json;
   var supportRedirected = (parsed.reply || '').includes('573171109500');

   return [{ json: {
     response: parsed.reply || raw,
     topic: wb.topic || 'desconocido',
     sentiment: parsed.sentiment || 'neutro',
     support_redirected: supportRedirected
   } }];
   ```

3. **Ramas soporte y desconocido** — devuelven `sentiment: 'neutro'`, `topic: 'soporte'` o `'desconocido'`, `support_redirected: false` (o true para soporte).

4. **Nodo "Normalizar intención"** — debe incluir `topic` en su output (el módulo clasificado). Actualmente ya tiene el valor del clasificador; solo hay que asegurarse de que pase en el JSON.

---

## Cambios en `ChatBot/chat.js`

### Variables nuevas

```javascript
// Tomar los mismos valores que usa js/supabase.js (ya están en el proyecto)
const SUPABASE_URL = 'https://xxxx.supabase.co';   // mismo que SUPABASE_URL en supabase.js
const SUPABASE_ANON_KEY = 'eyJ...';                // mismo que SUPABASE_ANON_KEY en supabase.js
let conversationId = null; // uuid de la fila actual en bodi_conversations
```

### Función `upsertConversation(patch)`

Llama a Supabase REST directamente (sin SDK — ChatBot es standalone):
```javascript
async function upsertConversation(patch) {
  if (!conversationId) return;
  await fetch(`${SUPABASE_URL}/rest/v1/bodi_conversations?id=eq.${conversationId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify(patch)
  });
}
```

### Función `createConversation()`

Se llama al primer mensaje del usuario si `conversationId` es null:
```javascript
async function createConversation() {
  const sessionId = localStorage.getItem('bold_session_id') || crypto.randomUUID();
  localStorage.setItem('bold_session_id', sessionId);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/bodi_conversations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({ session_id: sessionId, messages: [], status: 'active' })
  });
  const [row] = await res.json();
  conversationId = row.id;
}
```

### Flujo en `sendMessage()`

```javascript
async function sendMessage(text = null) {
  const message = text || userInput.value.trim();
  if (!message) return;

  if (!conversationId) await createConversation();  // ← nuevo

  appendMsg('user', message);
  userInput.value = '';
  typingIndicator.style.display = 'block';

  try {
    const response = await fetch(N8N_WEBHOOK_URL, { ... });
    const data = await response.json();
    typingIndicator.style.display = 'none';

    const reply = data.response || 'No pude procesar tu pregunta. Intenta de nuevo.';
    appendMsg('bot', reply, true);  // true = mostrar botones Sí/No

    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: reply });
    localStorage.setItem('bold_history', JSON.stringify(history.slice(-20)));

    // ← nuevo: actualizar fila
    await upsertConversation({
      messages: history,
      topic: data.topic || null,
      sentiment: data.sentiment || 'neutro',
      support_redirected: data.support_redirected || false
    });
  } catch (error) {
    typingIndicator.style.display = 'none';
    appendMsg('bot', 'Error de conexión con el servidor.');
  }
}
```

### Botones Sí / No

`appendMsg` acepta tercer parámetro `showResolution`:
```javascript
function appendMsg(type, text, showResolution = false) {
  const div = document.createElement('div');
  div.className = `msg ${type}`;
  div.innerText = text;
  chatBox.appendChild(div);

  if (type === 'bot' && showResolution) {
    const btns = document.createElement('div');
    btns.className = 'resolution-btns';
    btns.innerHTML = `
      <span class="resolution-label">¿Logré resolver tu duda?</span>
      <button class="res-btn res-yes">✓ Sí</button>
      <button class="res-btn res-no">✗ No</button>
    `;
    btns.querySelector('.res-yes').onclick = () => resolveConversation(true, btns);
    btns.querySelector('.res-no').onclick  = () => resolveConversation(false, btns);
    chatBox.appendChild(btns);
  }

  chatBox.scrollTop = chatBox.scrollHeight;
}
```

```javascript
async function resolveConversation(resolved, btnsEl) {
  btnsEl.remove();
  await upsertConversation({
    resolved,
    status: 'completed',
    ended_at: new Date().toISOString()
  });
  conversationId = null; // próxima pregunta inicia nueva conversación
}
```

### Captura de abandono (`beforeunload`)

```javascript
window.addEventListener('beforeunload', () => {
  if (!conversationId) return;
  navigator.sendBeacon(
    `${SUPABASE_URL}/rest/v1/bodi_conversations?id=eq.${conversationId}`,
    new Blob([JSON.stringify({ status: 'abandoned', ended_at: new Date().toISOString() })], {
      type: 'application/json'
    })
  );
  // sendBeacon no soporta headers custom — usar endpoint n8n proxy si Supabase lo rechaza
  // alternativa: POST a endpoint n8n que actualiza Supabase
});
```

> **Nota:** Supabase REST requiere `apikey` header. `sendBeacon` no soporta headers custom. Alternativa: `sendBeacon` a un endpoint n8n (`/webhook/bodi-abandon`) que recibe `{ conversationId }` y hace el PATCH a Supabase con las credenciales del servidor.

### Reset al iniciar nuevo chat

`newChatBtn.onclick`:
```javascript
newChatBtn.onclick = () => {
  localStorage.removeItem('bold_history');
  conversationId = null;
  location.reload();
};
```

---

## Cambios en `js/admin.js`

### Selector de subvista en el panel Analytics

El encabezado del panel Analytics incluye dos botones tipo tab:

```
[ Dashboard de Lecciones ]  [ Dashboard de Bodi ]
```

Al hacer clic en cada tab, se renderiza la subvista correspondiente dentro de `#panel-analytics`.

### Dashboard de Bodi — `renderBodiAnalytics(from, to)`

**KPIs (fila superior):**
| Métrica | Cálculo |
|---|---|
| Total conversaciones | `count(*)` |
| Tasa de resolución | `resolved=true` / conversaciones con respuesta |
| Tasa de abandono | `status='abandoned'` / total |
| Redirigidos a soporte | `support_redirected=true` |
| Sin resolver | `resolved=false` |

**Gráficas:**
- **Bar chart** — conversaciones por módulo (`topic`), mismos colores que el resto del dashboard
- **Donut chart** — distribución de sentimiento (positivo/neutro/negativo)
- **Heatmap hora × día** — grid CSS 7 columnas (lun–dom) × 24 filas (0–23h), celda coloreada por conteo. Color: `rgba(233, 33, 41, opacity)` donde opacity = conteo/máximo

**Tabla "Conversaciones sin resolver":**
- Columnas: Fecha, Módulo, Sentimiento, Mensajes (expandible)
- `resolved=false`, ordenado por `started_at DESC`
- Al expandir, muestra los mensajes del array `messages` en formato simple

**Tabla "Conversaciones recientes":**
- Columnas: Fecha, Módulo, Sentimiento, Estado, Resuelto, Duración
- Todos los registros en el rango de fecha, paginados de 20 en 20

### CSV — Dashboard de Bodi

Botón "Exportar CSV" genera descarga con:

| Campo | Fuente |
|---|---|
| ID conversación | `id` |
| Session ID | `session_id` |
| Fecha inicio | `started_at` |
| Fecha fin | `ended_at` |
| Duración (min) | `(ended_at - started_at) / 60000` |
| Módulo | `topic` |
| Sentimiento | `sentiment` |
| Resuelto | `resolved` (Sí/No/Sin respuesta) |
| Estado | `status` |
| Redirigido a soporte | `support_redirected` |
| Mensajes (JSON) | `messages` serializado |

### CSV — Dashboard de Lecciones (adición al existente)

Botón "Exportar CSV" en el panel Analytics de Lecciones genera descarga de `analytics_events` con:

| Campo | Fuente |
|---|---|
| Fecha | `created_at` |
| Tipo de evento | `event_type` |
| ID lección | `payload.lesson_id` |
| Título lección | `payload.lesson_title` |
| Categoría | `payload.category` |
| Puntaje | `payload.score` (solo exam_pass/exam_fail) |
| Término búsqueda | `payload.term` (solo lesson_search) |
| Resultados búsqueda | `payload.results_count` (solo lesson_search) |
| Modo | `mode` |
| Session ID | `session_id` |

### Función `exportCSV(rows, filename, columns)`

Utilidad compartida usada por ambos dashboards:
```javascript
function exportCSV(rows, filename, columns) {
  const header = columns.map(c => c.label).join(',');
  const body = rows.map(row =>
    columns.map(c => {
      const v = c.getValue(row);
      return typeof v === 'string' && (v.includes(',') || v.includes('"') || v.includes('\n'))
        ? `"${v.replace(/"/g, '""')}"`
        : String(v ?? '');
    }).join(',')
  ).join('\n');
  const blob = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
```

El `﻿` (BOM) asegura que Google Sheets y Excel interpreten correctamente el UTF-8.

---

## Nota sobre sendBeacon y Supabase

`sendBeacon` no permite headers custom (como `apikey`). Dos opciones para el abandono:
1. **Endpoint n8n proxy** (`POST /webhook/bodi-abandon`) — recibe `{ conversationId }`, hace PATCH a Supabase server-side. Más robusto.
2. **Supabase Edge Function** — función serverless que acepta el body sin headers de autenticación y valida por otro medio. Más complejo de configurar.

**Recomendación:** Opción 1 (n8n proxy). Ya tenemos n8n corriendo, añadir un webhook simple es trivial.

---

## Archivos a modificar / crear

| Archivo | Cambio |
|---|---|
| `ChatBot/chat.js` | Logging completo + botones Sí/No + sendBeacon |
| `js/admin.js` | Selector subvista + `renderBodiAnalytics()` + `exportCSV()` + CSV en lecciones |
| n8n workflow `dZGuYJbRbG6h8aqv` | Prompt JSON + Formatear respuesta + Normalizar intención topic |
| Supabase | Crear tabla `bodi_conversations` + RLS + índices |
| n8n workflow (nuevo webhook) | `POST /webhook/bodi-abandon` para capturar abandono |
