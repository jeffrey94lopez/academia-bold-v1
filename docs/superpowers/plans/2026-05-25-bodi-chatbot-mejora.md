# Bodi Chatbot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar el asistente genérico en "Bodi" — con personalidad cálida, mensaje de bienvenida automático, chips de sugerencias gestionados desde Supabase, y CRUD en el panel admin.

**Architecture:** El frontend carga chips desde Supabase `bot_sugerencias` al iniciar, con fallback hardcodeado. El admin panel agrega una nueva pestaña CRUD para las sugerencias. El system prompt de n8n define la personalidad de Bodi (paso manual). No hay backend nuevo — Supabase y n8n ya existen.

**Tech Stack:** HTML/CSS/JavaScript vanilla, Tailwind CSS (CDN), Supabase JS (CDN ESM), Lucide Icons (CDN), n8n webhook

---

## File Structure

| Archivo | Cambio |
|---------|--------|
| `js/assistant.js` | Import supabase, `loadChips()`, header Bodi + badge IA, bienvenida automática |
| `admin.html` | Nueva pestaña "Sugerencias Bot" en sidebar + panel div |
| `js/admin.js` | `renderSuggestionsPanel()`, actualizar `switchPanel()` |
| `n8n` | System prompt manual (Tarea 4) |
| `Supabase` | Tabla `bot_sugerencias` con RLS (Tarea 1 — manual) |

---

## Tarea 1: Crear tabla `bot_sugerencias` en Supabase (manual)

**Archivos:** Supabase Dashboard → SQL Editor

- [ ] **Paso 1: Abrir Supabase SQL Editor**

Ve a https://supabase.com → tu proyecto → SQL Editor → New query

- [ ] **Paso 2: Ejecutar el SQL de creación**

```sql
create table bot_sugerencias (
  id uuid default gen_random_uuid() primary key,
  texto text not null,
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamp with time zone default now()
);

alter table bot_sugerencias enable row level security;

create policy "Public read" on bot_sugerencias
  for select using (true);

create policy "Admin write" on bot_sugerencias
  for all using (auth.role() = 'authenticated');
```

Haz clic en "Run". Debe decir "Success. No rows returned."

- [ ] **Paso 3: Insertar sugerencias iniciales**

```sql
insert into bot_sugerencias (texto, orden, activo) values
  ('¿Cómo proceso un pago?', 1, true),
  ('¿Qué es el datafono Bold?', 2, true),
  ('¿Cómo hago un reembolso?', 3, true),
  ('¿Cómo configuro mi cuenta?', 4, true);
```

- [ ] **Paso 4: Verificar en Table Editor**

Ve a Table Editor → `bot_sugerencias`. Deben aparecer 4 filas con activo = true.

---

## Tarea 2: Actualizar `assistant.js` — Header Bodi + bienvenida + chips dinámicos

**Archivos:**
- Modificar: `js/assistant.js` (completo)

- [ ] **Paso 1: Agregar import de supabase al inicio del archivo**

Reemplaza la línea 1 del archivo (la constante N8N_URL ya está ahí, solo agrega el import antes):

```js
import { supabase } from './supabase.js'

const N8N_URL = 'https://n8n.mplasesores.com/webhook/bold-pos-chat'
```

- [ ] **Paso 2: Reemplazar `QUICK_QUERIES` por `FALLBACK_CHIPS`**

Reemplaza el bloque `const QUICK_QUERIES = [...]` (líneas 3-8):

```js
const FALLBACK_CHIPS = [
  '¿Cómo proceso un pago?',
  '¿Qué es el datafono Bold?',
  '¿Cómo hago un reembolso?',
  '¿Cómo configuro mi cuenta?',
]
```

- [ ] **Paso 3: Agregar función `loadChips()` después de `FALLBACK_CHIPS`**

```js
async function loadChips() {
  try {
    const { data, error } = await supabase
      .from('bot_sugerencias')
      .select('texto')
      .eq('activo', true)
      .order('orden')
    if (error || !data?.length) return FALLBACK_CHIPS
    return data.map(r => r.texto)
  } catch {
    return FALLBACK_CHIPS
  }
}
```

- [ ] **Paso 4: Hacer `renderAssistant()` async y cargar chips**

Reemplaza la firma y el inicio de `renderAssistant()`. El bloque completo de la función queda así:

```js
async function renderAssistant() {
  const chips = await loadChips()
  const container = document.getElementById('section-assistant')
  container.innerHTML = `
    <div class="flex flex-col h-full">
      <!-- Chat header -->
      <div class="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-full bg-[#E92129] flex items-center justify-center shadow">
            <i data-lucide="bot" class="w-5 h-5 text-white"></i>
          </div>
          <div>
            <div class="flex items-center gap-1.5">
              <p class="text-sm font-black">Bodi</p>
              <span class="text-[9px] font-black bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded-full tracking-wide">IA</span>
            </div>
            <p class="text-[10px] text-slate-400 dark:text-slate-500">Asistente Bold POS · IA</p>
          </div>
        </div>
        <button id="clearChat" class="text-xs text-slate-400 hover:text-[#E92129] font-bold flex items-center gap-1">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Limpiar
        </button>
      </div>

      <!-- Messages -->
      <div id="chatMessages" class="flex-1 overflow-y-auto custom-scroll p-4 flex flex-col gap-3">
        ${history.length === 0 ? `
          <div class="flex justify-start">
            <div class="msg-bot text-sm">¡Hola! Soy Bodi, el asistente virtual de Bold POS 👋 Estoy aquí para ayudarte con cualquier duda sobre la plataforma. ¿En qué te puedo ayudar hoy?</div>
          </div>
        ` : history.map(m => renderBubble(m.role, m.content)).join('')}
      </div>

      <!-- Typing indicator -->
      <div id="typingIndicator" class="hidden px-4 pb-2">
        <div class="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-3 w-fit">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
        </div>
      </div>

      <!-- Quick queries -->
      <div id="quickQueries" class="px-4 pb-2 flex gap-2 overflow-x-auto shrink-0 ${history.length > 0 ? 'hidden' : ''}">
        ${chips.map(q => `
          <button class="quick-query shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 hover:border-[#E92129] hover:text-[#E92129] transition-colors whitespace-nowrap">${q}</button>
        `).join('')}
      </div>

      <!-- Input -->
      <div class="px-4 py-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
        <div class="flex gap-2 items-end">
          <textarea
            id="chatInput"
            rows="1"
            placeholder="Escribe tu pregunta sobre Bold POS..."
            class="flex-1 resize-none bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#E92129] max-h-28 overflow-y-auto"
          ></textarea>
          <button id="sendBtn" class="w-10 h-10 bg-[#E92129] rounded-full flex items-center justify-center shrink-0 hover:scale-105 transition-transform shadow">
            <i data-lucide="send" class="w-4 h-4 text-white"></i>
          </button>
        </div>
      </div>
    </div>
  `

  lucide.createIcons()
  scrollToBottom()
  bindAssistantEvents()
}
```

- [ ] **Paso 5: Verificar en el navegador**

Abre `index.html` con Live Server. Ve a la sección del asistente. Debe mostrar:
- Header con "Bodi" + badge "IA" pequeño en gris
- Subtítulo "Asistente Bold POS · IA" (sin el punto verde "En línea")
- Burbuja de bienvenida de Bodi en lugar del ícono centrado
- Chips cargados desde Supabase (si la tabla existe) o fallback

- [ ] **Paso 6: Commit**

```bash
git add js/assistant.js
git commit -m "feat: chatbot Bodi — header, bienvenida y chips dinámicos desde Supabase"
```

---

## Tarea 3: Admin panel — Pestaña "Sugerencias Bot"

**Archivos:**
- Modificar: `admin.html` (líneas 51-68)
- Modificar: `js/admin.js`

### 3A: Agregar nav y panel en `admin.html`

- [ ] **Paso 1: Agregar botón de navegación en el sidebar**

En `admin.html`, localiza el `<nav>` (línea 51). Agrega el botón de "Sugerencias Bot" después del botón de Material (línea 60):

```html
        <button data-panel="suggestions" class="admin-nav w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50">
          <i data-lucide="message-square" class="w-4 h-4"></i> Sugerencias Bot
        </button>
```

- [ ] **Paso 2: Agregar div del panel en `<main>`**

Después de `<div id="panel-material" class="hidden"></div>` (línea 66), agrega:

```html
        <div id="panel-suggestions" class="hidden"></div>
```

### 3B: Agregar `renderSuggestionsPanel()` en `admin.js`

- [ ] **Paso 3: Agregar la función `renderSuggestionsPanel()` antes de `escapeHtml`**

Pega este bloque completo antes de la función `escapeHtml` al final de `admin.js`:

```js
async function renderSuggestionsPanel() {
  const el = document.getElementById('panel-suggestions')
  const { data } = await supabase.from('bot_sugerencias').select('*').order('orden')

  el.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-black">Sugerencias Bot</h2>
        <p class="text-xs text-slate-400 mt-0.5">Máximo 6 activas. Se muestran en el chat de Bodi.</p>
      </div>
      <button id="addSuggestion" class="bg-[#E92129] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:scale-105 transition-transform">
        <i data-lucide="plus" class="w-3.5 h-3.5"></i> Nueva sugerencia
      </button>
    </div>
    <div class="space-y-2">
      ${(data || []).map(s => `
        <div class="bg-white rounded-xl border border-slate-100 p-3 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <span class="text-xs font-black text-slate-300 w-5 text-center">${s.orden}</span>
            <p class="font-bold text-sm truncate">${escapeHtml(s.texto)}</p>
            ${s.activo
              ? '<span class="shrink-0 text-[10px] font-black bg-green-50 text-green-600 px-2 py-0.5 rounded-full">Activo</span>'
              : '<span class="shrink-0 text-[10px] font-black bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">Inactivo</span>'
            }
          </div>
          <div class="flex gap-1 shrink-0">
            <button data-id="${s.id}" data-texto="${escapeHtml(s.texto)}" data-orden="${s.orden}" data-activo="${s.activo}" class="edit-sug p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
              <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
            <button data-id="${s.id}" class="del-sug p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-500">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `).join('') || '<p class="text-slate-400 text-sm">No hay sugerencias. Crea la primera.</p>'}
    </div>
    <div id="sugForm" class="hidden mt-4 bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
      <input type="hidden" id="sugId">
      <input id="sugTexto" placeholder="Texto del chip (max 60 caracteres)" maxlength="60" required
        class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
      <input id="sugOrden" type="number" placeholder="Orden (ej: 1)" required min="0"
        class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
      <label class="flex items-center gap-2 cursor-pointer">
        <input id="sugActivo" type="checkbox" checked class="w-4 h-4 accent-[#E92129]">
        <span class="text-sm font-bold text-slate-700">Activo</span>
      </label>
      <p id="sugError" class="hidden text-red-500 text-xs"></p>
      <div class="flex gap-2">
        <button id="cancelSug" class="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-500">Cancelar</button>
        <button id="saveSug" class="flex-1 py-2 rounded-xl bg-[#E92129] text-white text-sm font-bold">Guardar</button>
      </div>
    </div>
  `
  lucide.createIcons()

  document.getElementById('addSuggestion').addEventListener('click', () => {
    document.getElementById('sugId').value = ''
    document.getElementById('sugTexto').value = ''
    document.getElementById('sugOrden').value = ''
    document.getElementById('sugActivo').checked = true
    document.getElementById('sugError').classList.add('hidden')
    document.getElementById('sugForm').classList.remove('hidden')
  })

  document.querySelectorAll('.edit-sug').forEach(b => b.addEventListener('click', () => {
    document.getElementById('sugId').value = b.dataset.id
    document.getElementById('sugTexto').value = b.dataset.texto
    document.getElementById('sugOrden').value = b.dataset.orden
    document.getElementById('sugActivo').checked = b.dataset.activo === 'true'
    document.getElementById('sugError').classList.add('hidden')
    document.getElementById('sugForm').classList.remove('hidden')
  }))

  document.querySelectorAll('.del-sug').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta sugerencia?')) return
    await supabase.from('bot_sugerencias').delete().eq('id', b.dataset.id)
    renderSuggestionsPanel()
  }))

  document.getElementById('cancelSug').addEventListener('click', () => {
    document.getElementById('sugForm').classList.add('hidden')
  })

  document.getElementById('saveSug').addEventListener('click', async () => {
    const id = document.getElementById('sugId').value
    const texto = document.getElementById('sugTexto').value.trim()
    const orden = parseInt(document.getElementById('sugOrden').value)
    const activo = document.getElementById('sugActivo').checked
    const errorEl = document.getElementById('sugError')

    if (!texto || isNaN(orden)) {
      errorEl.textContent = 'Completa todos los campos requeridos.'
      errorEl.classList.remove('hidden')
      return
    }

    if (activo) {
      const { data: activos } = await supabase
        .from('bot_sugerencias')
        .select('id')
        .eq('activo', true)
      const otrasActivas = (activos || []).filter(s => s.id !== id)
      if (otrasActivas.length >= 6) {
        errorEl.textContent = 'Máximo 6 sugerencias activas. Desactiva una antes de agregar otra.'
        errorEl.classList.remove('hidden')
        return
      }
    }

    errorEl.classList.add('hidden')
    const payload = { texto, orden, activo }
    if (id) {
      await supabase.from('bot_sugerencias').update(payload).eq('id', id)
    } else {
      await supabase.from('bot_sugerencias').insert(payload)
    }
    document.getElementById('sugForm').classList.add('hidden')
    renderSuggestionsPanel()
  })
}
```

- [ ] **Paso 4: Actualizar `switchPanel()` para manejar 'suggestions'**

En la función `switchPanel()` (líneas 20-33 de `admin.js`), agrega al final del bloque de if's:

```js
  if (panel === 'suggestions') renderSuggestionsPanel()
```

El bloque completo de switchPanel queda:
```js
function switchPanel(panel) {
  document.querySelectorAll('[id^="panel-"]').forEach(p => p.classList.add('hidden'))
  document.getElementById(`panel-${panel}`).classList.remove('hidden')
  document.querySelectorAll('.admin-nav').forEach(b => {
    const active = b.dataset.panel === panel
    b.classList.toggle('text-[#E92129]', active)
    b.classList.toggle('bg-red-50', active)
    b.classList.toggle('text-slate-500', !active)
  })

  if (panel === 'lessons') renderLessonsPanel()
  if (panel === 'glossary') renderGlossaryPanel()
  if (panel === 'material') renderMaterialPanel()
  if (panel === 'suggestions') renderSuggestionsPanel()
}
```

- [ ] **Paso 5: Verificar en el navegador**

1. Abre `admin.html` con Live Server
2. Inicia sesión como admin
3. En el sidebar izquierdo debe aparecer "Sugerencias Bot" con un ícono de mensaje
4. Al hacer clic, debe cargar la lista con las 4 sugerencias iniciales
5. Prueba agregar una nueva sugerencia con activo = true
6. Prueba agregar una 7ma sugerencia activa — debe mostrar el mensaje de error "Máximo 6 sugerencias activas"
7. Prueba editar y eliminar

- [ ] **Paso 6: Commit**

```bash
git add admin.html js/admin.js
git commit -m "feat: admin panel — CRUD de sugerencias de Bodi"
```

---

## Tarea 4: Actualizar system prompt en n8n (manual)

**Archivos:** n8n Dashboard → tu workflow de Bold POS chat

- [ ] **Paso 1: Abrir el nodo de AI/OpenAI en n8n**

Ve a https://n8n.mplasesores.com → abre el workflow de Bold POS → haz clic en el nodo que contiene el system prompt (nodo de tipo "AI Agent" o "OpenAI")

- [ ] **Paso 2: Reemplazar el system prompt completo con este texto**

```
Eres Bodi, el asistente virtual de Bold POS. Eres una IA diseñada para ayudar a los usuarios de la plataforma Bold POS con sus dudas y procesos.

**Tono:** Profesional pero cálido. Claro, directo y amable. No uses lenguaje robótico ni excesivamente formal.

**Reglas:**

1. **Solo Bold POS:** Solo respondes preguntas relacionadas con la plataforma Bold POS. Si el usuario pregunta algo fuera del tema, responde exactamente: "Solo puedo ayudarte con temas de Bold POS. ¿Tienes alguna duda sobre la plataforma?"

2. **Referencias a lecciones:** Si tu respuesta está relacionada con una lección disponible en la plataforma, agrégala al final del mensaje así: "Puedes aprender más en la sección Lecciones → [Nombre de la lección]"

3. **Sin información suficiente:** Si no tienes información suficiente para resolver un problema de Bold POS, redirige al soporte con este mensaje: "Para este caso te recomiendo contactar directamente al equipo de soporte: [Soporte Bold POS](https://api.whatsapp.com/send?phone=573171109500&text=Hola%20,%20necesito%20su%20ayuda%20en%20Bold%20POS.)"

4. **Transparencia:** Si el usuario pregunta si eres humano o una IA, responde: "Soy Bodi, un asistente de inteligencia artificial de Bold POS."

5. **Paso a paso:** Cuando una respuesta implica pasos secuenciales (configuración, proceso, tutorial), primero pregunta: "¿Prefieres que te explique todo el proceso de una vez, o paso a paso confirmando cada uno?" — Espera la respuesta. Si elige paso a paso, envía un paso, espera confirmación del usuario, luego continúa con el siguiente.

6. **Brevedad:** Respuestas concisas, máximo 3-4 párrafos. Si el tema requiere más detalle, ofrece profundizar.
```

- [ ] **Paso 3: Guardar y activar el workflow**

Haz clic en "Save" y asegúrate de que el workflow esté activo (toggle verde).

- [ ] **Paso 4: Probar en el chat**

Abre el chat en `index.html` y prueba:
- Pregunta sobre un proceso (ej: "¿cómo hago un reembolso?") → debe preguntar si quieres todo de una vez o paso a paso
- Pregunta algo fuera de tema (ej: "¿cómo está el clima?") → debe redirigir a Bold POS
- Pregunta si es humano → debe decir que es IA
- Pregunta algo que no sabe → debe incluir el link de WhatsApp

---

## Tarea 5: Push a GitHub

- [ ] **Paso 1: Verificar estado**

```bash
git status
git log --oneline -5
```

- [ ] **Paso 2: Push**

```bash
git push origin master
```

Vercel hace deploy automático al detectar el push. Espera ~1 minuto y verifica en producción.
