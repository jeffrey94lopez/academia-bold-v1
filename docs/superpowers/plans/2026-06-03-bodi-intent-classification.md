# Bodi — Clasificación de Intención Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el flujo de Google Doc + cache por clasificación de intención: Bodi detecta el módulo, busca solo las lecciones relevantes en Supabase, o clarifica si la pregunta es vaga, o manda a soporte si hay un bug.

**Architecture:** El workflow n8n se reconstruye completamente. La autenticación por token (`x-api-key`) se conserva. El Google Doc y el sistema de cache se eliminan. El nuevo flujo usa dos IF nodes en cascada para rutear a 3 ramas (módulo, desconocido, soporte) y todas convergen en "Formatear respuesta". Los cambios son solo en n8n — cero cambios en el frontend.

**Tech Stack:** n8n (workflow via REST API), OpenAI gpt-4o-mini, Supabase REST API, curl, node.js (para validar JSON)

**Credenciales en uso:**
- n8n API key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjOGFlYjcwZS01NzM4LTRkODktYWE0NS0zNzllNmU4ZDI0ZWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiODQ5NjdmNmYtNDYyMC00YTIyLTk3YjQtMWU2NmRiYzBlYjhjIiwiaWF0IjoxNzgwNDYxOTI5fQ.EgfEX_SetSpfUBArbKK3iUP1VliaxiMj6IHEqt33zHM`
- n8n workflow ID: `dZGuYJbRbG6h8aqv`
- Webhook token: `BoldBodi-2026-K9xMvP7q`
- Supabase URL: `https://tczcngfhuendmldafbrc.supabase.co`
- Supabase anon key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjemNuZ2ZodWVuZG1sZGFmYnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzQ0OTIsImV4cCI6MjA5NTMxMDQ5Mn0.YuKwq-ooL9noU6FXDDPzJbaj-h7rhZli1s4Zji-uCXQ`
- OpenAI credential id en n8n: `DGC36ZkqZ6GRAz10` (nombre: "OpenAI account")

---

## Flujo resultante

```
Webhook → Validar input y token → Clasificar intención (gpt-4o-mini) → Normalizar intención
  → Router módulo? (IF branch=modulo)
      [true]  → Buscar lecciones (Supabase) → Construir prompt → OpenAI Chat (gpt-4o-mini) ─┐
      [false] → Router soporte? (IF branch=soporte)                                           │
                  [true]  → Respuesta soporte ────────────────────────────────────────────────┤
                  [false] → Clarificar (gpt-4o-mini) ─────────────────────────────────────────┤
                                                                                              ↓
                                                                               Formatear respuesta → Respond
Error Trigger → Respuesta de error
```

---

## File Structure

| Cambio | Detalle |
|--------|---------|
| `workflow_bodi_intent.json` (temp) | Archivo temporal con el JSON del workflow completo |
| n8n workflow `dZGuYJbRbG6h8aqv` | Se reemplaza vía PUT a la API de n8n |
| Frontend | Sin cambios — sigue enviando `{ message, history }` con `x-api-key` |

---

## Task 1: Construir el JSON del workflow

**Files:**
- Create: `workflow_bodi_intent.json` (temp, en la raíz del proyecto)

- [ ] **Paso 1: Escribir el archivo JSON**

Crea `workflow_bodi_intent.json` en la raíz del proyecto con este contenido exacto:

```json
{
  "name": "Bold POS Chat",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "bold-pos-chat",
        "responseMode": "responseNode",
        "options": {}
      },
      "id": "58ad28ee-f910-48e5-8424-d5bfc51971c9",
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 2,
      "position": [-400, 0],
      "webhookId": "bold-pos-chat-wh-001"
    },
    {
      "parameters": {
        "jsCode": "const body = $input.first().json.body;\nconst token = $input.first().json.headers?.['x-api-key'];\nif (!token || token !== 'BoldBodi-2026-K9xMvP7q') {\n  throw new Error('Unauthorized');\n}\nreturn [{ json: body }];"
      },
      "id": "validate-input-001",
      "name": "Validar input y token",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [-176, 0]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://api.openai.com/v1/chat/completions",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "openAiApi",
        "sendBody": true,
        "contentType": "raw",
        "rawContentType": "application/json",
        "body": "={{ JSON.stringify({ model: 'gpt-4o-mini', temperature: 0, max_tokens: 20, messages: [{ role: 'system', content: 'Eres un clasificador de intención para Bold POS. Dado el mensaje del usuario, responde ÚNICAMENTE con una de estas palabras: Ventas | Inventario | Ingresos | Egresos | Contactos | Configuración | desconocido | soporte. Usa soporte cuando el usuario reporte que algo no funciona, tiene un error o bug. Usa desconocido cuando no puedas determinar el módulo. Sin explicaciones. Solo la palabra.' }, { role: 'user', content: $json.message }] }) }}",
        "options": {}
      },
      "id": "clasificar-intencion-001",
      "name": "Clasificar intención",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [48, 0],
      "credentials": {
        "openAiApi": {
          "id": "DGC36ZkqZ6GRAz10",
          "name": "OpenAI account"
        }
      }
    },
    {
      "parameters": {
        "jsCode": "const raw = ($json.choices?.[0]?.message?.content || '').trim();\nconst modules = ['Ventas', 'Inventario', 'Ingresos', 'Egresos', 'Contactos', 'Configuración'];\nconst categoria = modules.includes(raw) ? raw : null;\nconst branch = categoria ? 'modulo' : (raw === 'soporte' ? 'soporte' : 'desconocido');\nconst wb = $('Validar input y token').first().json;\nreturn [{ json: { branch, categoria, message: wb.message, history: wb.history || [] } }];"
      },
      "id": "normalizar-intencion-001",
      "name": "Normalizar intención",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [272, 0]
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict",
            "version": 1
          },
          "conditions": [
            {
              "id": "cond-modulo",
              "leftValue": "={{ $json.branch }}",
              "rightValue": "modulo",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "router-modulo-001",
      "name": "Router módulo?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [496, 0]
    },
    {
      "parameters": {
        "conditions": {
          "options": {
            "caseSensitive": true,
            "leftValue": "",
            "typeValidation": "strict",
            "version": 1
          },
          "conditions": [
            {
              "id": "cond-soporte",
              "leftValue": "={{ $json.branch }}",
              "rightValue": "soporte",
              "operator": {
                "type": "string",
                "operation": "equals"
              }
            }
          ],
          "combinator": "and"
        },
        "options": {}
      },
      "id": "router-soporte-001",
      "name": "Router soporte?",
      "type": "n8n-nodes-base.if",
      "typeVersion": 2,
      "position": [720, 120]
    },
    {
      "parameters": {
        "method": "GET",
        "url": "={{ 'https://tczcngfhuendmldafbrc.supabase.co/rest/v1/lecciones?select=titulo,categoria,contenido&categoria=eq.' + $json.categoria + '&activo=eq.true&order=orden' }}",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "apikey",
              "value": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjemNuZ2ZodWVuZG1sZGFmYnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzQ0OTIsImV4cCI6MjA5NTMxMDQ5Mn0.YuKwq-ooL9noU6FXDDPzJbaj-h7rhZli1s4Zji-uCXQ"
            },
            {
              "name": "Authorization",
              "value": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjemNuZ2ZodWVuZG1sZGFmYnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzQ0OTIsImV4cCI6MjA5NTMxMDQ5Mn0.YuKwq-ooL9noU6FXDDPzJbaj-h7rhZli1s4Zji-uCXQ"
            }
          ]
        },
        "options": {}
      },
      "id": "buscar-lecciones-001",
      "name": "Buscar lecciones",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [720, -140]
    },
    {
      "parameters": {
        "jsCode": "function lessonToText(lesson) {\n  var text = '## ' + lesson.titulo + '\\n';\n  try {\n    var blocks = typeof lesson.contenido === 'string' ? JSON.parse(lesson.contenido) : lesson.contenido;\n    if (Array.isArray(blocks)) {\n      var steps = blocks.filter(function(b) { return b.type === 'step' && b.text; });\n      if (steps.length) {\n        text += 'Pasos:\\n';\n        steps.forEach(function(b, i) { text += (i + 1) + '. ' + b.text + '\\n'; });\n      }\n    } else {\n      text += String(lesson.contenido || '').replace(/<[^>]+>/g, '') + '\\n';\n    }\n  } catch (_) {\n    text += String(lesson.contenido || '').replace(/<[^>]+>/g, '') + '\\n';\n  }\n  return text;\n}\n\nvar first = $input.first().json;\nvar lessons = Array.isArray(first) ? first : $input.all().map(function(i) { return i.json; });\n\nvar docContent = lessons.length\n  ? lessons.map(lessonToText).join('\\n---\\n')\n  : 'No hay lecciones disponibles para este módulo en este momento.';\n\nvar wb = $('Normalizar intención').first().json;\nvar history = (wb.history || []).slice(-10);\nvar message = wb.message;\nvar now = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' });\n\nvar systemPrompt = [\n  'Fecha actual: ' + now + '.',\n  'Eres Bodi, el asistente virtual de Bold POS. Ayudas a los usuarios con dudas y procesos de la plataforma.',\n  '',\n  'Tono: Profesional pero cálido. Claro, directo y amable.',\n  '',\n  'Reglas:',\n  '1. Solo Bold POS: Si la pregunta no tiene relación con Bold POS, di: Solo puedo ayudarte con temas de Bold POS.',\n  '2. Sin información: Si no tienes info suficiente, redirige: [Soporte Bold POS](https://api.whatsapp.com/send?phone=573171109500&text=Hola%20,%20necesito%20su%20ayuda%20en%20Bold%20POS.)',\n  '3. Transparencia: Si preguntan si eres IA, di que eres Bodi, asistente de IA de Bold POS.',\n  '4. Brevedad: Máximo 3-4 párrafos. Ofrece profundizar si el tema lo requiere.',\n  '',\n  'DOCUMENTACIÓN DEL MÓDULO:',\n  docContent\n].join('\\n');\n\nreturn [{ json: { messages: [\n  { role: 'system', content: systemPrompt },\n  ...history,\n  { role: 'user', content: message }\n] } }];"
      },
      "id": "construir-prompt-001",
      "name": "Construir prompt",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [944, -140]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://api.openai.com/v1/chat/completions",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "openAiApi",
        "sendBody": true,
        "contentType": "raw",
        "rawContentType": "application/json",
        "body": "={{ JSON.stringify({ model: 'gpt-4o-mini', messages: $json.messages, temperature: 0.3, max_tokens: 800 }) }}",
        "options": {}
      },
      "id": "b4ec26c3-381e-4d75-9c65-58ebd779d88b",
      "name": "OpenAI Chat",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [1168, -140],
      "credentials": {
        "openAiApi": {
          "id": "DGC36ZkqZ6GRAz10",
          "name": "OpenAI account"
        }
      }
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://api.openai.com/v1/chat/completions",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "openAiApi",
        "sendBody": true,
        "contentType": "raw",
        "rawContentType": "application/json",
        "body": "={{ JSON.stringify({ model: 'gpt-4o-mini', temperature: 0.4, max_tokens: 120, messages: [{ role: 'system', content: 'Eres Bodi, asistente de Bold POS. El usuario hizo una pregunta poco específica sobre la plataforma. Genera UNA sola pregunta corta, amigable y conversacional para aclarar si su duda es sobre Ventas, Inventario, Ingresos, Egresos, Contactos o Configuración. Basa la pregunta en lo que dijo el usuario para que se sienta natural, no como un menú. Sin listas. Solo la pregunta.' }, { role: 'user', content: $json.message }] }) }}",
        "options": {}
      },
      "id": "clarificar-001",
      "name": "Clarificar",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [944, 120],
      "credentials": {
        "openAiApi": {
          "id": "DGC36ZkqZ6GRAz10",
          "name": "OpenAI account"
        }
      }
    },
    {
      "parameters": {
        "jsCode": "return [{ json: { response: 'Parece que tienes un problema con el funcionamiento de la plataforma. Para este caso te recomiendo contactar directamente al equipo de soporte de Bold POS:\\n\\n[Soporte Bold POS · +57 317 110 9500](https://api.whatsapp.com/send?phone=573171109500&text=Hola%20,%20necesito%20su%20ayuda%20en%20Bold%20POS.)\\n\\nEllos podrán revisar el error directamente en tu cuenta.' } }];"
      },
      "id": "respuesta-soporte-001",
      "name": "Respuesta soporte",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [944, 280]
    },
    {
      "parameters": {
        "jsCode": "const text = $json.choices?.[0]?.message?.content ?? $json.message?.content ?? $json.response ?? '';\nreturn [{ json: { response: text } }];"
      },
      "id": "186d72ad-fc26-4053-b9a4-b4e37eda0d2e",
      "name": "Formatear respuesta",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [1392, 0]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ { response: $json.response } }}",
        "options": {}
      },
      "id": "5bf3bf34-26af-442e-8fa5-4bc9ac346a16",
      "name": "Respond to Webhook",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [1616, 0]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ { response: 'En este momento tengo problemas técnicos. Intenta de nuevo en unos minutos o escríbenos al soporte: https://api.whatsapp.com/send?phone=573171109500' } }}",
        "options": {
          "responseCode": 500
        }
      },
      "id": "error-response-001",
      "name": "Respuesta de error",
      "type": "n8n-nodes-base.respondToWebhook",
      "typeVersion": 1,
      "position": [1168, 480]
    },
    {
      "parameters": {},
      "id": "error-trigger-001",
      "name": "Error Trigger",
      "type": "n8n-nodes-base.errorTrigger",
      "typeVersion": 1,
      "position": [944, 480]
    }
  ],
  "pinData": {},
  "connections": {
    "Webhook": {
      "main": [[{"node": "Validar input y token", "type": "main", "index": 0}]]
    },
    "Validar input y token": {
      "main": [[{"node": "Clasificar intención", "type": "main", "index": 0}]]
    },
    "Clasificar intención": {
      "main": [[{"node": "Normalizar intención", "type": "main", "index": 0}]]
    },
    "Normalizar intención": {
      "main": [[{"node": "Router módulo?", "type": "main", "index": 0}]]
    },
    "Router módulo?": {
      "main": [
        [{"node": "Buscar lecciones", "type": "main", "index": 0}],
        [{"node": "Router soporte?", "type": "main", "index": 0}]
      ]
    },
    "Router soporte?": {
      "main": [
        [{"node": "Respuesta soporte", "type": "main", "index": 0}],
        [{"node": "Clarificar", "type": "main", "index": 0}]
      ]
    },
    "Buscar lecciones": {
      "main": [[{"node": "Construir prompt", "type": "main", "index": 0}]]
    },
    "Construir prompt": {
      "main": [[{"node": "OpenAI Chat", "type": "main", "index": 0}]]
    },
    "OpenAI Chat": {
      "main": [[{"node": "Formatear respuesta", "type": "main", "index": 0}]]
    },
    "Clarificar": {
      "main": [[{"node": "Formatear respuesta", "type": "main", "index": 0}]]
    },
    "Respuesta soporte": {
      "main": [[{"node": "Formatear respuesta", "type": "main", "index": 0}]]
    },
    "Formatear respuesta": {
      "main": [[{"node": "Respond to Webhook", "type": "main", "index": 0}]]
    },
    "Error Trigger": {
      "main": [[{"node": "Respuesta de error", "type": "main", "index": 0}]]
    }
  },
  "settings": {
    "executionOrder": "v1",
    "errorWorkflow": ""
  }
}
```

- [ ] **Paso 2: Validar que el JSON es válido**

```bash
node -e "const fs=require('fs'); try { JSON.parse(fs.readFileSync('workflow_bodi_intent.json','utf8')); console.log('JSON válido'); } catch(e) { console.error('Error:', e.message); }"
```

Resultado esperado: `JSON válido`

---

## Task 2: Desplegar en n8n y verificar

**Files:**
- Modify (via API): n8n workflow `dZGuYJbRbG6h8aqv`
- Delete: `workflow_bodi_intent.json`

- [ ] **Paso 1: PUT a la API de n8n**

```bash
curl -s -X PUT "https://n8n.mplasesores.com/api/v1/workflows/dZGuYJbRbG6h8aqv" \
  -H "X-N8N-API-KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjOGFlYjcwZS01NzM4LTRkODktYWE0NS0zNzllNmU4ZDI0ZWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiODQ5NjdmNmYtNDYyMC00YTIyLTk3YjQtMWU2NmRiYzBlYjhjIiwiaWF0IjoxNzgwNDYxOTI5fQ.EgfEX_SetSpfUBArbKK3iUP1VliaxiMj6IHEqt33zHM" \
  -H "Content-Type: application/json" \
  -d @workflow_bodi_intent.json 2>&1 | head -c 300
```

Resultado esperado: la respuesta empieza con `{"updatedAt":"...","name":"Bold POS Chat",...}` y **no** contiene `"message":"...error..."`.

Si sale `"request/body/active is read-only"`: elimina el campo `active` del JSON con `node -e "const fs=require('fs'); const w=JSON.parse(fs.readFileSync('workflow_bodi_intent.json','utf8')); delete w.active; fs.writeFileSync('workflow_bodi_intent.json', JSON.stringify(w,null,2)); console.log('ok')"` y reintenta el PUT.

- [ ] **Paso 2: Verificar que los nodos nuevos están en la respuesta**

```bash
curl -s "https://n8n.mplasesores.com/api/v1/workflows/dZGuYJbRbG6h8aqv" \
  -H "X-N8N-API-KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjOGFlYjcwZS01NzM4LTRkODktYWE0NS0zNzllNmU4ZDI0ZWMiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiODQ5NjdmNmYtNDYyMC00YTIyLTk3YjQtMWU2NmRiYzBlYjhjIiwiaWF0IjoxNzgwNDYxOTI5fQ.EgfEX_SetSpfUBArbKK3iUP1VliaxiMj6IHEqt33zHM" | node -e "let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{ const o=JSON.parse(d); console.log(o.nodes.map(n=>n.name).join(', ')); })"
```

Resultado esperado (15 nodos):
```
Webhook, Validar input y token, Clasificar intención, Normalizar intención, Router módulo?, Router soporte?, Buscar lecciones, Construir prompt, OpenAI Chat, Clarificar, Respuesta soporte, Formatear respuesta, Respond to Webhook, Respuesta de error, Error Trigger
```

- [ ] **Paso 3: Eliminar el archivo temporal y hacer commit**

```bash
rm workflow_bodi_intent.json
git add -A
git commit -m "feat: Bodi — clasificación de intención y búsqueda por módulo en Supabase"
```

---

## Task 3: Probar las 3 ramas

- [ ] **Paso 1: Probar rama módulo (pregunta sobre Ventas)**

```bash
curl -s -X POST "https://n8n.mplasesores.com/webhook/bold-pos-chat" \
  -H "Content-Type: application/json" \
  -H "x-api-key: BoldBodi-2026-K9xMvP7q" \
  -d '{"message": "como cierro el turno de ventas?", "history": []}'
```

Resultado esperado: respuesta con pasos del cierre de turno (contenido de la lección de Ventas). No debe mencionar lecciones de Inventario ni otros módulos.

- [ ] **Paso 2: Probar rama desconocido (pregunta vaga)**

```bash
curl -s -X POST "https://n8n.mplasesores.com/webhook/bold-pos-chat" \
  -H "Content-Type: application/json" \
  -H "x-api-key: BoldBodi-2026-K9xMvP7q" \
  -d '{"message": "tengo un problema", "history": []}'
```

Resultado esperado: Bodi hace UNA pregunta conversacional para aclarar el módulo (no una lista de opciones).

- [ ] **Paso 3: Probar rama soporte (reporte de bug)**

```bash
curl -s -X POST "https://n8n.mplasesores.com/webhook/bold-pos-chat" \
  -H "Content-Type: application/json" \
  -H "x-api-key: BoldBodi-2026-K9xMvP7q" \
  -d '{"message": "la app no me deja cobrar, sale un error", "history": []}'
```

Resultado esperado: respuesta fija con el link de WhatsApp al soporte de Bold POS.

- [ ] **Paso 4: Verificar que el token rechaza solicitudes sin autenticación**

```bash
curl -s -X POST "https://n8n.mplasesores.com/webhook/bold-pos-chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "hola", "history": []}'
```

Resultado esperado: `{"message":"Workflow execution failed"}` — el nodo de validación lanza error y activa el Error Trigger.
