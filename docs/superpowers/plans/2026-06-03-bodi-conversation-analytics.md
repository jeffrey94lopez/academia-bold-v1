# Bodi Conversation Analytics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar conversaciones del chatbot Bodi en Supabase, añadir botones Sí/No de resolución al chat, y mostrar un dashboard de analytics de conversaciones en el panel admin con exportación CSV en ambos dashboards.

**Architecture:** `chat.js` crea/actualiza filas en `bodi_conversations` vía Supabase REST. n8n devuelve `topic` y `sentiment` en cada respuesta. `admin.js` agrega un selector Lecciones/Bodi dentro del panel Analytics existente y una función `renderBodiAnalytics()` con KPIs, heatmap, gráficas y tabla de sin resolver.

**Tech Stack:** Vanilla JS, Supabase REST API (sin SDK en ChatBot), n8n REST API, CSS grid para heatmap.

**Credenciales:**
- n8n API key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjOGFlYjcwZS01NzM4LTRkODktYWE0NS0zNzllNmU4ZDI0ZWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiODQ5NjdmNmYtNDYyMC00YTIyLTk3YjQtMWU2NmRiYzBlYjhjIiwiaWF0IjoxNzgwNDYxOTI5fQ.EgfEX_SetSpfUBArbKK3iUP1VliaxiMj6IHEqt33zHM`
- n8n URL: `https://n8n.mplasesores.com`
- Workflow ID: `dZGuYJbRbG6h8aqv`
- Supabase URL: `https://tczcngfhuendmldafbrc.supabase.co`
- Supabase anon key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjemNuZ2ZodWVuZG1sZGFmYnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzQ0OTIsImV4cCI6MjA5NTMxMDQ5Mn0.YuKwq-ooL9noU6FXDDPzJbaj-h7rhZli1s4Zji-uCXQ`

---

## File Structure

| Archivo | Cambio |
|---|---|
| `ChatBot/chat.js` | Logging + botones Sí/No + abandono |
| `ChatBot/index.html` | CSS para botones de resolución |
| `js/admin.js` | Selector tabs + `renderBodiAnalytics()` + `exportCSV()` + CSV lecciones |
| Supabase (manual SQL) | Crear tabla `bodi_conversations` + RLS + índices |
| n8n workflow `dZGuYJbRbG6h8aqv` | Actualizar 4 nodos vía script Node.js |
| n8n nuevo workflow | Webhook `bodi-abandon` para capturar cierres de tab |

---

## Task 1: Supabase — Crear tabla bodi_conversations

**Files:**
- Manual: ejecutar SQL en Supabase dashboard → SQL Editor

- [ ] **Paso 1: Ejecutar SQL en el Supabase SQL Editor**

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

CREATE INDEX idx_bodi_conv_status ON bodi_conversations (status, started_at DESC);
CREATE INDEX idx_bodi_conv_topic  ON bodi_conversations (topic, started_at DESC);
CREATE INDEX idx_bodi_conv_date   ON bodi_conversations (started_at DESC);

ALTER TABLE bodi_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert" ON bodi_conversations
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update" ON bodi_conversations
  FOR UPDATE TO anon USING (true);

CREATE POLICY "auth_select" ON bodi_conversations
  FOR SELECT TO authenticated USING (true);
```

- [ ] **Paso 2: Verificar que la tabla existe**

En Supabase SQL Editor:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'bodi_conversations' ORDER BY ordinal_position;
```

Expected: 10 filas con las columnas `id, session_id, started_at, ended_at, messages, topic, sentiment, support_redirected, resolved, status`.

- [ ] **Paso 3: Commit**

```bash
git commit --allow-empty -m "chore: Supabase bodi_conversations table created (manual SQL step)"
```

---

## Task 2: n8n — Actualizar nodos del workflow principal

Actualiza 4 nodos del workflow `dZGuYJbRbG6h8aqv` en un solo script:
1. `normalizar-intencion-001` → añade `topic` al output
2. `construir-prompt-001` → añade instrucción JSON al system prompt
3. `186d72ad-fc26-4053-b9a4-b4e37eda0d2e` → Formatear respuesta: parsea JSON + devuelve metadata
4. `5bf3bf34-26af-442e-8fa5-4bc9ac346a16` → Respond to Webhook: expone topic, sentiment, support_redirected

**Files:**
- Create: `C:/Users/jeffr/AppData/Local/Temp/patch_bodi_n8n.js`

- [ ] **Paso 1: Escribir el archivo de patch**

Crear `C:/Users/jeffr/AppData/Local/Temp/patch_bodi_n8n.js` con este contenido exacto:

```javascript
const https = require('https');

const N8N_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjOGFlYjcwZS01NzM4LTRkODktYWE0NS0zNzllNmU4ZDI0ZWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiODQ5NjdmNmYtNDYyMC00YTIyLTk3YjQtMWU2NmRiYzBlYjhjIiwiaWF0IjoxNzgwNDYxOTI5fQ.EgfEX_SetSpfUBArbKK3iUP1VliaxiMj6IHEqt33zHM';
const WF_ID = 'dZGuYJbRbG6h8aqv';

function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'n8n.mplasesores.com',
      path: '/api/v1' + path,
      method,
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch(e) { resolve(d); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function main() {
  console.log('Fetching workflow...');
  const wf = await apiRequest('GET', '/workflows/' + WF_ID);
  if (!wf.nodes) { console.error('Error fetching workflow:', JSON.stringify(wf)); process.exit(1); }
  console.log('Got', wf.nodes.length, 'nodes, versionId:', wf.versionId);

  // --- 1. Normalizar intención: add topic ---
  const normalizar = wf.nodes.find(n => n.id === 'normalizar-intencion-001');
  if (!normalizar) { console.error('Node normalizar-intencion-001 not found'); process.exit(1); }
  normalizar.parameters.jsCode =
    "const raw = ($json.choices?.[0]?.message?.content || '').trim();\n" +
    "const modules = ['Ventas', 'Inventario', 'Ingresos', 'Egresos', 'Contactos', 'Configuración'];\n" +
    "const categoria = modules.includes(raw) ? raw : null;\n" +
    "const branch = categoria ? 'modulo' : (raw === 'soporte' ? 'soporte' : 'desconocido');\n" +
    "const wb = $('Validar input y token').first().json;\n" +
    "return [{ json: { branch, categoria, topic: categoria || branch, message: wb.message, history: wb.history || [] } }];";
  console.log('Patched: Normalizar intencion');

  // --- 2. Construir prompt: add JSON response instruction ---
  const construir = wf.nodes.find(n => n.id === 'construir-prompt-001');
  if (!construir) { console.error('Node construir-prompt-001 not found'); process.exit(1); }
  // Replace the closing ].join('\n') with an extra JSON instruction line
  const oldEnding = "  'DOCUMENTACIÓN:',\n  combinedDocs\n].join('\\n');";
  const newEnding =
    "  'DOCUMENTACIÓN:',\n" +
    "  combinedDocs,\n" +
    "  '',\n" +
    "  'FORMATO DE RESPUESTA OBLIGATORIO: Responde Únicament en JSON sin markdown ni bloques de código: {\"reply\":\"<texto para el usuario>\",\"sentiment\":\"neutro\"} — sentiment debe ser positivo, neutro o negativo según el tono del mensaje del usuario.'\n" +
    "].join('\\n');";
  if (!construir.parameters.jsCode.includes(oldEnding)) {
    console.error('Could not find expected ending in Construir prompt jsCode');
    console.log('Current ending:', construir.parameters.jsCode.slice(-200));
    process.exit(1);
  }
  construir.parameters.jsCode = construir.parameters.jsCode.replace(oldEnding, newEnding);
  console.log('Patched: Construir prompt');

  // --- 3. Formatear respuesta: parse JSON + return metadata ---
  const formatear = wf.nodes.find(n => n.id === '186d72ad-fc26-4053-b9a4-b4e37eda0d2e');
  if (!formatear) { console.error('Node formatear-respuesta not found'); process.exit(1); }
  formatear.parameters.jsCode =
    "var raw = $json.choices?.[0]?.message?.content ?? $json.message?.content ?? $json.response ?? '';\n" +
    "var parsed;\n" +
    "try { parsed = JSON.parse(raw); } catch(_) { parsed = null; }\n" +
    "var reply = parsed ? (parsed.reply || raw) : raw;\n" +
    "var sentiment = (parsed && parsed.sentiment) ? parsed.sentiment : 'neutro';\n" +
    "var supportRedirected = reply.includes('573171109500');\n" +
    "var wb = $('Normalizar intención').first().json;\n" +
    "var topic = wb.topic || wb.categoria || wb.branch || 'desconocido';\n" +
    "return [{ json: { response: reply, topic: topic, sentiment: sentiment, support_redirected: supportRedirected } }];";
  console.log('Patched: Formatear respuesta');

  // --- 4. Respond to Webhook: expose all fields ---
  const respond = wf.nodes.find(n => n.id === '5bf3bf34-26af-442e-8fa5-4bc9ac346a16');
  if (!respond) { console.error('Node respond-to-webhook not found'); process.exit(1); }
  respond.parameters.responseBody =
    '={{ { response: $json.response, topic: $json.topic, sentiment: $json.sentiment, support_redirected: $json.support_redirected } }}';
  console.log('Patched: Respond to Webhook');

  // --- Deploy ---
  console.log('Deploying...');
  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: { executionOrder: wf.settings?.executionOrder || 'v1' }
  };
  const result = await apiRequest('PUT', '/workflows/' + WF_ID, payload);
  if (result.id) {
    console.log('SUCCESS — new versionId:', result.versionId);
  } else {
    console.error('FAILED:', JSON.stringify(result));
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Paso 2: Ejecutar el script**

```bash
node "C:/Users/jeffr/AppData/Local/Temp/patch_bodi_n8n.js"
```

Expected output:
```
Fetching workflow...
Got 16 nodes, versionId: <some-uuid>
Patched: Normalizar intencion
Patched: Construir prompt
Patched: Formatear respuesta
Patched: Respond to Webhook
Deploying...
SUCCESS — new versionId: <new-uuid>
```

- [ ] **Paso 3: Verificar el cambio en producción**

```bash
curl -s -X POST https://n8n.mplasesores.com/webhook/bold-pos-chat \
  -H "Content-Type: application/json" \
  -H "x-api-key: BoldBodi-2026-K9xMvP7q" \
  -d '{"message":"como proceso una venta","history":[]}'
```

Expected: respuesta JSON con campos `response`, `topic`, `sentiment`, `support_redirected`:
```json
{
  "response": "Para procesar una venta en Bold POS...",
  "topic": "Ventas",
  "sentiment": "neutro",
  "support_redirected": false
}
```

- [ ] **Paso 4: Commit**

```bash
git add "C:/Users/jeffr/AppData/Local/Temp/patch_bodi_n8n.js"
git commit -m "feat(n8n): add topic/sentiment/support_redirected to Bodi webhook response"
```

---

## Task 3: n8n — Crear webhook de abandono

Nuevo workflow n8n de 2 nodos: recibe `{ conversationId }` vía POST y hace PATCH a Supabase.

**Files:**
- Create: `C:/Users/jeffr/AppData/Local/Temp/create_abandon_webhook.js`

- [ ] **Paso 1: Escribir el script de creación**

Crear `C:/Users/jeffr/AppData/Local/Temp/create_abandon_webhook.js`:

```javascript
const https = require('https');

const N8N_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjOGFlYjcwZS01NzM4LTRkODktYWE0NS0zNzllNmU4ZDI0ZWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiODQ5NjdmNmYtNDYyMC00YTIyLTk3YjQtMWU2NmRiYzBlYjhjIiwiaWF0IjoxNzgwNDYxOTI5fQ.EgfEX_SetSpfUBArbKK3iUP1VliaxiMj6IHEqt33zHM';
const SUPABASE_URL = 'https://tczcngfhuendmldafbrc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjemNuZ2ZodWVuZG1sZGFmYnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzQ0OTIsImV4cCI6MjA5NTMxMDQ5Mn0.YuKwq-ooL9noU6FXDDPzJbaj-h7rhZli1s4Zji-uCXQ';

function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'n8n.mplasesores.com',
      path: '/api/v1' + path,
      method,
      headers: {
        'X-N8N-API-KEY': N8N_API_KEY,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const req = https.request(options, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(d); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const workflow = {
  name: "Bodi — Registrar abandono",
  nodes: [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "bodi-abandon",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "bodi-abandon-webhook",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [0, 0],
      "webhookId": "bodi-abandon-webhook-id"
    },
    {
      "parameters": {
        "jsCode":
          "var conversationId = $json.body?.conversationId;\n" +
          "if (!conversationId) return [{ json: { ok: false, error: 'missing conversationId' } }];\n" +
          "return [{ json: { conversationId } }];"
      },
      "id": "bodi-abandon-validate",
      "name": "Validar input",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [220, 0]
    },
    {
      "parameters": {
        "method": "PATCH",
        "url": "=" + "{{ '" + SUPABASE_URL + "/rest/v1/bodi_conversations?id=eq.' + $json.conversationId }}",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            { "name": "apikey", "value": SUPABASE_ANON_KEY },
            { "name": "Authorization", "value": "Bearer " + SUPABASE_ANON_KEY },
            { "name": "Content-Type", "value": "application/json" }
          ]
        },
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            { "name": "status", "value": "abandoned" },
            { "name": "ended_at", "value": "={{ new Date().toISOString() }}" }
          ]
        },
        "options": {}
      },
      "id": "bodi-abandon-patch",
      "name": "PATCH Supabase",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [440, 0]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ { ok: true } }}",
        "options": {}
      },
      "id": "bodi-abandon-respond",
      "name": "Respond",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [660, 0]
    }
  ],
  connections: {
    "Webhook": { "main": [[{ "node": "Validar input", "type": "main", "index": 0 }]] },
    "Validar input": { "main": [[{ "node": "PATCH Supabase", "type": "main", "index": 0 }]] },
    "PATCH Supabase": { "main": [[{ "node": "Respond", "type": "main", "index": 0 }]] }
  },
  settings: { executionOrder: "v1" },
  active: true
};

async function main() {
  console.log('Creating abandon webhook workflow...');
  const result = await apiRequest('POST', '/workflows', workflow);
  if (result.id) {
    console.log('Created workflow ID:', result.id);
    // Activate
    const activated = await apiRequest('POST', '/workflows/' + result.id + '/activate');
    console.log('Activated:', activated.active);
    console.log('Webhook URL: https://n8n.mplasesores.com/webhook/bodi-abandon');
  } else {
    console.error('Failed:', JSON.stringify(result));
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Paso 2: Ejecutar el script**

```bash
node "C:/Users/jeffr/AppData/Local/Temp/create_abandon_webhook.js"
```

Expected:
```
Creating abandon webhook workflow...
Created workflow ID: <uuid>
Activated: true
Webhook URL: https://n8n.mplasesores.com/webhook/bodi-abandon
```

- [ ] **Paso 3: Verificar el webhook**

```bash
curl -s -X POST https://n8n.mplasesores.com/webhook/bodi-abandon \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"00000000-0000-0000-0000-000000000000"}'
```

Expected: `{"ok":true}` (el PATCH fallará porque el UUID no existe, pero el webhook responde).

- [ ] **Paso 4: Commit**

```bash
git commit --allow-empty -m "feat(n8n): create bodi-abandon webhook for tab-close tracking"
```

---

## Task 4: chat.js — Logging de conversaciones + botones Sí/No + abandono

**Files:**
- Modify: `ChatBot/chat.js`
- Modify: `ChatBot/index.html`

- [ ] **Paso 1: Reemplazar `ChatBot/chat.js` completo**

```javascript
const chatBox = document.getElementById('chat-box');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const newChatBtn = document.getElementById('new-chat');
const typingIndicator = document.getElementById('typing');

const N8N_WEBHOOK_URL = 'https://n8n.mplasesores.com/webhook/bold-pos-chat';
const SUPABASE_URL = 'https://tczcngfhuendmldafbrc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjemNuZ2ZodWVuZG1sZGFmYnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzQ0OTIsImV4cCI6MjA5NTMxMDQ5Mn0.YuKwq-ooL9noU6FXDDPzJbaj-h7rhZli1s4Zji-uCXQ';
const ABANDON_URL = 'https://n8n.mplasesores.com/webhook/bodi-abandon';

let history = JSON.parse(localStorage.getItem('bold_history')) || [];
let conversationId = null;

window.onload = () => {
    if (history.length > 0) {
        history.forEach(msg => appendMsg(msg.role === 'user' ? 'user' : 'bot', msg.content));
    }
};

async function createConversation() {
    const sessionId = localStorage.getItem('bold_session_id') || crypto.randomUUID();
    localStorage.setItem('bold_session_id', sessionId);
    try {
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
        conversationId = row?.id || null;
    } catch (_) { conversationId = null; }
}

async function upsertConversation(patch) {
    if (!conversationId) return;
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/bodi_conversations?id=eq.${conversationId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify(patch)
        });
    } catch (_) {}
}

async function resolveConversation(resolved, btnsEl) {
    btnsEl.remove();
    await upsertConversation({
        resolved,
        status: 'completed',
        ended_at: new Date().toISOString()
    });
    conversationId = null;
}

async function sendMessage(text = null) {
    const message = text || userInput.value.trim();
    if (!message) return;

    if (!conversationId) await createConversation();

    appendMsg('user', message);
    userInput.value = '';
    typingIndicator.style.display = 'block';

    try {
        const response = await fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': 'BoldBodi-2026-K9xMvP7q' },
            body: JSON.stringify({ message, history })
        });

        const data = await response.json();
        typingIndicator.style.display = 'none';

        const reply = data.response || 'No pude procesar tu pregunta. Intenta de nuevo.';
        appendMsg('bot', reply, true);
        history.push({ role: 'user', content: message });
        history.push({ role: 'assistant', content: reply });
        localStorage.setItem('bold_history', JSON.stringify(history.slice(-20)));

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

window.addEventListener('beforeunload', () => {
    if (!conversationId) return;
    navigator.sendBeacon(
        ABANDON_URL,
        new Blob([JSON.stringify({ conversationId })], { type: 'application/json' })
    );
});

function quickQuery(q) { sendMessage(q); }
sendBtn.onclick = () => sendMessage();
userInput.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };
newChatBtn.onclick = () => {
    localStorage.removeItem('bold_history');
    conversationId = null;
    location.reload();
};
```

- [ ] **Paso 2: Agregar CSS para botones de resolución en `ChatBot/index.html`**

Insertar justo antes del tag `</style>` (línea 161 en el archivo actual):

```css
        .resolution-btns {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 6px 0 0 4px;
            flex-wrap: wrap;
        }

        .resolution-label {
            font-size: 0.8rem;
            color: var(--text-muted);
        }

        .res-btn {
            background: #252525;
            border: 1px solid #555;
            color: var(--text-main);
            padding: 5px 14px;
            border-radius: 20px;
            cursor: pointer;
            font-size: 0.8rem;
            transition: background 0.15s;
        }

        .res-yes:hover { background: #1a3a1a; border-color: #4a9a4a; color: #7dd87d; }
        .res-no:hover  { background: #3a1a1a; border-color: #9a4a4a; color: #d87d7d; }
```

- [ ] **Paso 3: Verificar manualmente en el navegador**

1. Abrir `ChatBot/index.html` en el navegador (o la URL de producción)
2. Enviar un mensaje: "¿Cómo proceso una venta?"
3. Verificar que aparecen los botones "✓ Sí" y "✗ No" debajo de la respuesta de Bodi
4. Abrir Supabase → Table Editor → `bodi_conversations`
5. Verificar que existe una fila con `status='active'` y `messages` con el intercambio
6. Hacer clic en "✓ Sí"
7. Verificar que la fila en Supabase ahora tiene `resolved=true`, `status='completed'`

- [ ] **Paso 4: Verificar abandono**

1. Abrir el chat, enviar un mensaje (sin responder Sí/No)
2. Cerrar el tab
3. En Supabase, verificar que la fila tiene `status='abandoned'`

- [ ] **Paso 5: Commit**

```bash
git add ChatBot/chat.js ChatBot/index.html
git commit -m "feat(chatbot): conversation logging to Supabase + resolution buttons + abandonment tracking"
```

---

## Task 5: admin.js — Función exportCSV + CSV en Lecciones

**Files:**
- Modify: `js/admin.js` (agregar al final del archivo)

- [ ] **Paso 1: Agregar `exportCSV` al final de `js/admin.js`**

Al final del archivo `js/admin.js` (después de la última función), agregar:

```javascript
function exportCSV(rows, filename, columns) {
  const header = columns.map(c => c.label).join(',')
  const body = rows.map(row =>
    columns.map(c => {
      const v = c.getValue(row)
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s
    }).join(',')
  ).join('\n')
  const blob = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
```

- [ ] **Paso 2: Agregar botón CSV al panel Analytics de Lecciones**

En `js/admin.js`, función `renderAnalyticsPanel` (línea ~1058), localizar la línea:
```javascript
      <h2 class="text-lg font-black">Analytics</h2>
```

Reemplazar con:
```javascript
      <div class="flex items-center gap-3">
        <h2 class="text-lg font-black">Analytics</h2>
        <div class="flex gap-2 text-xs font-bold border border-slate-200 rounded-xl overflow-hidden">
          <button id="analytics-tab-lecciones" class="px-3 py-1.5 bg-[#E92129] text-white">Lecciones</button>
          <button id="analytics-tab-bodi" class="px-3 py-1.5 text-slate-500 hover:bg-slate-50">Bodi</button>
        </div>
      </div>
```

- [ ] **Paso 3: Agregar botón "Exportar CSV" en el header del Analytics de Lecciones**

En `renderAnalyticsPanel`, localizar el cierre del div del header (justo antes de `</div>` que cierra el `flex items-center justify-between`). Añadir el botón CSV junto a los presets. Localizar la línea:
```javascript
      </div>
    </div>

    <div class="grid grid-cols-4 gap-4 mb-5">
```

Reemplazar la primera `</div>\n    </div>` de ese bloque por (agrega el botón antes del cierre):
```javascript
        <button id="analytics-export-csv" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 hover:border-slate-300">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          CSV
        </button>
      </div>
    </div>

    <div class="grid grid-cols-4 gap-4 mb-5">
```

- [ ] **Paso 4: Conectar el botón CSV y los tabs en el event listener**

En `renderAnalyticsPanel`, después de las líneas que conectan `.analytics-preset`, añadir:

```javascript
  el.querySelector('#analytics-export-csv')?.addEventListener('click', () => {
    exportCSV(ev, `lecciones-analytics-${fmtDate(from)}-${fmtDate(to)}.csv`, [
      { label: 'Fecha',             getValue: r => new Date(r.created_at).toLocaleString('es-CO') },
      { label: 'Tipo de evento',    getValue: r => r.event_type },
      { label: 'ID lección',        getValue: r => r.payload?.lesson_id || '' },
      { label: 'Título lección',    getValue: r => r.payload?.lesson_title || '' },
      { label: 'Categoría',         getValue: r => r.payload?.category || '' },
      { label: 'Puntaje',           getValue: r => r.payload?.score ?? '' },
      { label: 'Término búsqueda',  getValue: r => r.payload?.term || '' },
      { label: 'Resultados',        getValue: r => r.payload?.results_count ?? '' },
      { label: 'Modo',              getValue: r => r.mode || '' },
      { label: 'Session ID',        getValue: r => r.session_id || '' }
    ])
  })

  el.querySelector('#analytics-tab-bodi')?.addEventListener('click', () => {
    renderBodiAnalytics(from, to)
  })

  el.querySelector('#analytics-tab-lecciones')?.addEventListener('click', () => {
    renderAnalyticsPanel(from, to)
  })
```

- [ ] **Paso 5: Verificar manualmente**

1. Abrir admin.html, ir a Analytics
2. Verificar que aparecen los tabs "Lecciones" y "Bodi"
3. Verificar que el botón "CSV" descarga un archivo `.csv`
4. Abrir el CSV en Excel o Google Sheets, verificar que las columnas son correctas

- [ ] **Paso 6: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): exportCSV utility + CSV button on Lecciones analytics + Bodi tab selector"
```

---

## Task 6: admin.js — renderBodiAnalytics()

**Files:**
- Modify: `js/admin.js` (agregar función al final, antes de `exportCSV`)

- [ ] **Paso 1: Agregar función `renderBodiAnalytics` al final de `js/admin.js` (antes de `exportCSV`)**

```javascript
async function renderBodiAnalytics(from = null, to = null) {
  const now = new Date()
  if (!from) { from = new Date(now); from.setHours(0, 0, 0, 0) }
  if (!to)   { to   = new Date(now); to.setHours(23, 59, 59, 999) }

  const el = document.getElementById('panel-analytics')
  if (!el) return
  el.innerHTML = '<p class="text-slate-400 text-sm p-6">Cargando analytics de Bodi...</p>'

  const { data: convs, error } = await supabase
    .from('bodi_conversations')
    .select('*')
    .gte('started_at', from.toISOString())
    .lte('started_at', to.toISOString())
    .order('started_at', { ascending: false })

  if (error) { el.innerHTML = '<p class="text-red-400 text-sm p-6">Error al cargar datos de Bodi.</p>'; return }

  const rows = convs || []
  const total = rows.length
  const withAnswer = rows.filter(r => r.resolved !== null)
  const resolved = rows.filter(r => r.resolved === true).length
  const unresolved = rows.filter(r => r.resolved === false)
  const abandoned = rows.filter(r => r.status === 'abandoned').length
  const support = rows.filter(r => r.support_redirected).length
  const resolvedPct = withAnswer.length ? Math.round(resolved / withAnswer.length * 100) : 0
  const abandonedPct = total ? Math.round(abandoned / total * 100) : 0

  // Topic counts
  const topicCounts = {}
  rows.forEach(r => { const t = r.topic || 'desconocido'; topicCounts[t] = (topicCounts[t] || 0) + 1 })
  const topicEntries = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])
  const maxTopic = Math.max(...topicEntries.map(e => e[1]), 1)

  // Sentiment counts
  const sentMap = { positivo: 0, neutro: 0, negativo: 0 }
  rows.forEach(r => { if (r.sentiment && sentMap[r.sentiment] !== undefined) sentMap[r.sentiment]++ })

  // Heatmap data: heat[dayIndex_Mon0][hour] = count
  const heat = Array.from({ length: 7 }, () => new Array(24).fill(0))
  rows.forEach(r => {
    const d = new Date(r.started_at)
    const dayMon = (d.getDay() + 6) % 7  // 0=Mon ... 6=Sun
    const hour = d.getHours()
    heat[dayMon][hour]++
  })
  const maxHeat = Math.max(...heat.flat(), 1)
  const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  // Heatmap cells: iterate hour by hour, for each hour show 7 days
  let heatCells = dayNames.map(d =>
    `<div class="text-[9px] text-slate-500 text-center font-bold">${d}</div>`
  ).join('')
  for (let h = 0; h < 24; h++) {
    for (let d = 0; d < 7; d++) {
      const count = heat[d][h]
      const opacity = count ? (0.12 + 0.88 * count / maxHeat).toFixed(2) : '0'
      heatCells += `<div style="background:rgba(233,33,41,${opacity});border-radius:2px" title="${dayNames[d]} ${String(h).padStart(2,'0')}:00 — ${count} conv." class="w-full aspect-square"></div>`
    }
  }
  // Hour labels: one per row on the left (every 4 hours)
  let heatWithLabels = `<div class="grid gap-0.5" style="grid-template-columns:28px 1fr">
    <div></div>
    <div class="grid gap-0.5" style="grid-template-columns:repeat(7,1fr)">${heatCells}</div>
  </div>`

  const fmtDate = d => d.toISOString().split('T')[0]
  const now2 = new Date()
  const todayStart = new Date(now2); todayStart.setHours(0,0,0,0)
  const todayEnd   = new Date(now2); todayEnd.setHours(23,59,59,999)
  function daysAgo(n) { const d = new Date(todayStart); d.setDate(d.getDate()-n); return d }
  function preset(label, f, t) {
    return `<button class="bodi-preset px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
      data-from="${f.toISOString()}" data-to="${t.toISOString()}">${label}</button>`
  }

  el.innerHTML = `
    <div class="flex items-center justify-between mb-5 flex-wrap gap-3">
      <div class="flex items-center gap-3">
        <h2 class="text-lg font-black">Analytics</h2>
        <div class="flex gap-2 text-xs font-bold border border-slate-200 rounded-xl overflow-hidden">
          <button id="bodi-tab-lecciones" class="px-3 py-1.5 text-slate-500 hover:bg-slate-50">Lecciones</button>
          <button id="bodi-tab-bodi" class="px-3 py-1.5 bg-[#E92129] text-white">Bodi</button>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        ${preset('Hoy', todayStart, todayEnd)}
        ${preset('7 días', daysAgo(6), todayEnd)}
        ${preset('30 días', daysAgo(29), todayEnd)}
        <button id="bodi-export-csv" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 hover:border-slate-300">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          CSV
        </button>
      </div>
    </div>

    <div class="grid grid-cols-5 gap-3 mb-5">
      ${[
        ['Total conv.', total],
        ['Resueltas', resolvedPct + '%'],
        ['Abandonadas', abandonedPct + '%'],
        ['A soporte', support],
        ['Sin resolver', unresolved.length]
      ].map(([label, val]) => `
        <div class="bg-white rounded-2xl border border-slate-100 p-4">
          <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">${label}</p>
          <p class="text-2xl font-black text-slate-900">${val}</p>
        </div>`).join('')}
    </div>

    <div class="grid gap-4 mb-5" style="grid-template-columns:2fr 1fr">
      <div class="bg-white rounded-2xl border border-slate-100 p-4">
        <p class="text-xs font-bold text-slate-800 mb-3">Conversaciones por módulo</p>
        ${topicEntries.length === 0
          ? '<p class="text-slate-400 text-xs">Sin datos en el período</p>'
          : topicEntries.map(([t, c]) => `
            <div class="mb-2">
              <div class="flex justify-between mb-0.5">
                <span class="text-xs text-slate-700">${t}</span>
                <span class="text-xs font-bold text-[#E92129]">${c}</span>
              </div>
              <div class="h-1.5 bg-slate-100 rounded-full">
                <div class="h-1.5 bg-[#E92129] rounded-full" style="width:${Math.round(c/maxTopic*100)}%"></div>
              </div>
            </div>`).join('')}
      </div>
      <div class="bg-white rounded-2xl border border-slate-100 p-4">
        <p class="text-xs font-bold text-slate-800 mb-3">Sentimiento</p>
        ${[['Positivo','positivo','#22c55e'],['Neutro','neutro','#94a3b8'],['Negativo','negativo','#ef4444']].map(([label, key, color]) => {
          const cnt = sentMap[key]
          const pct = total ? Math.round(cnt / total * 100) : 0
          return `<div class="mb-2.5">
            <div class="flex justify-between mb-0.5">
              <span class="text-xs text-slate-700">${label}</span>
              <span class="text-xs font-bold" style="color:${color}">${pct}%</span>
            </div>
            <div class="h-1.5 bg-slate-100 rounded-full">
              <div class="h-1.5 rounded-full" style="width:${pct}%;background:${color}"></div>
            </div>
          </div>`
        }).join('')}
        ${total === 0 ? '<p class="text-[10px] text-slate-400 mt-2">Sin datos</p>' : ''}
      </div>
    </div>

    <div class="bg-white rounded-2xl border border-slate-100 p-4 mb-5">
      <p class="text-xs font-bold text-slate-800 mb-3">Mapa de calor — hora × día de la semana</p>
      <div class="grid gap-0.5 overflow-x-auto" style="grid-template-columns:repeat(7,1fr);max-width:420px">
        ${heatCells}
      </div>
      <p class="text-[10px] text-slate-400 mt-2">Cada celda = una hora. Más rojo = más conversaciones.</p>
    </div>

    <div class="bg-white rounded-2xl border border-slate-100 overflow-hidden mb-5">
      <div class="px-4 py-3 border-b border-slate-100">
        <p class="text-xs font-bold text-slate-800">Conversaciones sin resolver (${unresolved.length})</p>
      </div>
      ${unresolved.length === 0
        ? '<p class="text-slate-400 text-xs p-4">Ninguna — ¡todo resuelto!</p>'
        : unresolved.slice(0, 20).map(r => `
          <div class="border-b border-slate-50 last:border-0">
            <button class="bodi-expand w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center justify-between gap-2"
              data-id="${r.id}">
              <div class="flex items-center gap-3 min-w-0">
                <span class="text-xs text-slate-500 shrink-0">${new Date(r.started_at).toLocaleDateString('es-CO')}</span>
                <span class="text-xs font-bold text-slate-700 truncate">${r.topic || '—'}</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full ${r.sentiment === 'negativo' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'}">${r.sentiment || '—'}</span>
              </div>
              <svg class="w-3.5 h-3.5 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="bodi-messages hidden px-4 pb-3 space-y-1.5" data-id="${r.id}">
              ${(r.messages || []).map(m => `
                <div class="text-xs ${m.role === 'user' ? 'text-blue-700 bg-blue-50' : 'text-slate-700 bg-slate-50'} rounded-lg px-3 py-1.5">
                  <span class="font-bold">${m.role === 'user' ? 'Usuario' : 'Bodi'}:</span> ${escapeHtml(m.content)}
                </div>`).join('')}
            </div>
          </div>`).join('')}
    </div>

    <div class="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-100">
        <p class="text-xs font-bold text-slate-800">Conversaciones recientes</p>
      </div>
      ${rows.length === 0
        ? '<p class="text-slate-400 text-xs p-4">Sin conversaciones en el período</p>'
        : `<table class="w-full border-collapse text-xs">
          <thead><tr class="border-b border-slate-100">
            <th class="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase">Fecha</th>
            <th class="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase">Módulo</th>
            <th class="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase">Sentimiento</th>
            <th class="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase">Estado</th>
            <th class="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase">Resuelto</th>
          </tr></thead>
          <tbody>
            ${rows.slice(0, 50).map(r => {
              const dur = r.ended_at ? Math.round((new Date(r.ended_at) - new Date(r.started_at)) / 60000) : null
              return `<tr class="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                <td class="px-4 py-2 text-slate-600">${new Date(r.started_at).toLocaleString('es-CO', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}</td>
                <td class="px-4 py-2 font-medium text-slate-700">${r.topic || '—'}</td>
                <td class="px-4 py-2 text-slate-500">${r.sentiment || '—'}</td>
                <td class="px-4 py-2">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === 'completed' ? 'bg-green-50 text-green-700' : r.status === 'abandoned' ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-500'}">${r.status}</span>
                </td>
                <td class="px-4 py-2 font-bold ${r.resolved === true ? 'text-green-600' : r.resolved === false ? 'text-red-500' : 'text-slate-400'}">
                  ${r.resolved === true ? 'Sí' : r.resolved === false ? 'No' : '—'}
                </td>
              </tr>`
            }).join('')}
          </tbody>
        </table>`}
    </div>
  `

  el.querySelectorAll('.bodi-preset').forEach(btn => {
    btn.addEventListener('click', () => renderBodiAnalytics(new Date(btn.dataset.from), new Date(btn.dataset.to)))
  })

  el.querySelector('#bodi-export-csv')?.addEventListener('click', () => {
    exportCSV(rows, `bodi-conversaciones-${fmtDate(from)}-${fmtDate(to)}.csv`, [
      { label: 'ID',                 getValue: r => r.id },
      { label: 'Session ID',         getValue: r => r.session_id },
      { label: 'Fecha inicio',       getValue: r => new Date(r.started_at).toLocaleString('es-CO') },
      { label: 'Fecha fin',          getValue: r => r.ended_at ? new Date(r.ended_at).toLocaleString('es-CO') : '' },
      { label: 'Duración (min)',      getValue: r => r.ended_at ? Math.round((new Date(r.ended_at) - new Date(r.started_at)) / 60000) : '' },
      { label: 'Módulo',             getValue: r => r.topic || '' },
      { label: 'Sentimiento',        getValue: r => r.sentiment || '' },
      { label: 'Resuelto',           getValue: r => r.resolved === true ? 'Sí' : r.resolved === false ? 'No' : 'Sin respuesta' },
      { label: 'Estado',             getValue: r => r.status },
      { label: 'Soporte',            getValue: r => r.support_redirected ? 'Sí' : 'No' },
      { label: 'Mensajes (JSON)',     getValue: r => JSON.stringify(r.messages || []) }
    ])
  })

  el.querySelector('#bodi-tab-lecciones')?.addEventListener('click', () => renderAnalyticsPanel(from, to))
  el.querySelector('#bodi-tab-bodi')?.addEventListener('click', () => renderBodiAnalytics(from, to))

  el.querySelectorAll('.bodi-expand').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id
      const msgs = el.querySelector(`.bodi-messages[data-id="${id}"]`)
      if (msgs) msgs.classList.toggle('hidden')
    })
  })
}
```

- [ ] **Paso 2: Verificar manualmente en el navegador**

1. Abrir admin.html → Analytics
2. Hacer clic en el tab "Bodi"
3. Verificar que el dashboard renderiza sin errores en consola
4. Verificar que aparecen los 5 KPIs, el bar chart de módulos, el donut de sentimiento, el heatmap y las tablas
5. Si hay conversaciones en Supabase (del Task 4), verificar que los números son correctos
6. Hacer clic en "CSV" y verificar que descarga un archivo con las columnas correctas
7. Hacer clic en una conversación sin resolver y verificar que se expanden los mensajes
8. Hacer clic en "Lecciones" y verificar que regresa al dashboard original

- [ ] **Paso 3: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): Bodi conversation analytics dashboard with KPIs, heatmap, sentiment, CSV export"
```

---

## Self-Review

### Spec coverage
- ✅ Tabla `bodi_conversations` con todos los campos → Task 1
- ✅ n8n devuelve topic + sentiment → Task 2
- ✅ n8n webhook de abandono → Task 3
- ✅ chat.js: createConversation + upsertConversation + botones Sí/No → Task 4
- ✅ Captura de abandono con sendBeacon → Task 4
- ✅ exportCSV utility → Task 5
- ✅ Selector tabs Lecciones/Bodi → Tasks 5 y 6
- ✅ CSV en dashboard de Lecciones → Task 5
- ✅ KPIs, bar chart módulos, donut sentimiento, heatmap, tabla sin resolver, CSV → Task 6

### Notas importantes
- El `sendBeacon` en chat.js llama al endpoint n8n `bodi-abandon` (creado en Task 3), no directamente a Supabase — esto evita el problema de headers custom con `sendBeacon`.
- El heatmap CSS usa `grid-template-columns: repeat(7, 1fr)` con 7+168 celdas (7 headers + 24*7 datos), iterando por hora y luego por día.
- `resolveConversation` pone `conversationId = null` — el siguiente mensaje del usuario inicia una nueva conversación en Supabase.
- `exportCSV` usa BOM (`﻿`) para que Google Sheets y Excel interpreten UTF-8 correctamente.
