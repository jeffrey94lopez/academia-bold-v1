# Academia Bold V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruir Academia Bold POS desde cero como una app web pública de 3 secciones (Asistente IA, Lecciones, Recursos) con Supabase como backend y Vercel como hosting.

**Architecture:** App de una sola página (`index.html`) con navegación entre 3 secciones renderizadas con JS vanilla. Supabase provee base de datos, autenticación del admin y storage de archivos. Cada responsabilidad vive en su propio archivo JS.

**Tech Stack:** HTML, CSS, JavaScript vanilla, Tailwind CSS (CDN), Lucide Icons (CDN), Supabase JS SDK (CDN), Vercel

---

## Mapa de Archivos

| Archivo | Responsabilidad |
|---------|----------------|
| `index.html` | Shell principal: navegación + contenedores de las 3 secciones |
| `admin.html` | Panel admin: login + CRUD de contenido |
| `css/style.css` | Estilos custom (animaciones, chat bubbles, lo que Tailwind no cubre) |
| `js/supabase.js` | Inicializa el cliente Supabase, exporta `supabase` |
| `js/auth.js` | Login/logout del admin via Supabase Auth |
| `js/assistant.js` | Lógica del chat: envío a n8n, renderizado de mensajes, historial |
| `js/lessons.js` | Carga lecciones desde Supabase, renderiza tarjetas y detalle |
| `js/resources.js` | Carga glosario y material de apoyo desde Supabase |
| `js/admin.js` | CRUD de lecciones, glosario y material desde el panel admin |
| `vercel.json` | Configuración de rutas para Vercel |

---

## Task 1: Configurar Supabase

**Files:**
- No code files — configuración en el dashboard de Supabase

- [ ] **Step 1: Crear proyecto en Supabase**

  Ve a https://supabase.com → "New project"
  - Nombre: `academia-bold`
  - Región: más cercana (US East o similar)
  - Guarda la contraseña de la DB

- [ ] **Step 2: Crear tabla `lecciones`**

  En Supabase → SQL Editor, ejecuta:

  ```sql
  create table lecciones (
    id uuid default gen_random_uuid() primary key,
    titulo text not null,
    descripcion text not null,
    contenido text not null,
    orden int not null default 0,
    created_at timestamptz default now()
  );
  ```

- [ ] **Step 3: Crear tabla `glosario`**

  ```sql
  create table glosario (
    id uuid default gen_random_uuid() primary key,
    termino text not null,
    definicion text not null
  );
  ```

- [ ] **Step 4: Crear tabla `material_apoyo`**

  ```sql
  create table material_apoyo (
    id uuid default gen_random_uuid() primary key,
    titulo text not null,
    tipo text not null check (tipo in ('pdf', 'link', 'video')),
    url text not null
  );
  ```

- [ ] **Step 5: Configurar Row Level Security (RLS)**

  ```sql
  -- Habilitar RLS en las 3 tablas
  alter table lecciones enable row level security;
  alter table glosario enable row level security;
  alter table material_apoyo enable row level security;

  -- Lectura pública para todos
  create policy "Lectura publica lecciones" on lecciones for select using (true);
  create policy "Lectura publica glosario" on glosario for select using (true);
  create policy "Lectura publica material" on material_apoyo for select using (true);

  -- Escritura solo para admin autenticado
  create policy "Admin insert lecciones" on lecciones for insert with check (auth.role() = 'authenticated');
  create policy "Admin update lecciones" on lecciones for update using (auth.role() = 'authenticated');
  create policy "Admin delete lecciones" on lecciones for delete using (auth.role() = 'authenticated');

  create policy "Admin insert glosario" on glosario for insert with check (auth.role() = 'authenticated');
  create policy "Admin update glosario" on glosario for update using (auth.role() = 'authenticated');
  create policy "Admin delete glosario" on glosario for delete using (auth.role() = 'authenticated');

  create policy "Admin insert material" on material_apoyo for insert with check (auth.role() = 'authenticated');
  create policy "Admin update material" on material_apoyo for update using (auth.role() = 'authenticated');
  create policy "Admin delete material" on material_apoyo for delete using (auth.role() = 'authenticated');
  ```

- [ ] **Step 6: Crear bucket de Storage**

  En Supabase → Storage → "New bucket"
  - Nombre: `material`
  - Public bucket: ✅ activado

  Luego en SQL Editor:
  ```sql
  create policy "Lectura publica storage" on storage.objects for select using (bucket_id = 'material');
  create policy "Admin upload storage" on storage.objects for insert with check (bucket_id = 'material' and auth.role() = 'authenticated');
  create policy "Admin delete storage" on storage.objects for delete using (bucket_id = 'material' and auth.role() = 'authenticated');
  ```

- [ ] **Step 7: Crear usuario admin**

  En Supabase → Authentication → Users → "Add user"
  - Email: tu email de admin
  - Password: una contraseña segura
  - Guárdala, no se puede recuperar después

- [ ] **Step 8: Copiar credenciales**

  En Supabase → Settings → API:
  - Copia `Project URL`
  - Copia `anon public key`
  - Las necesitarás en el Task 2

- [ ] **Step 9: Insertar datos de prueba**

  ```sql
  insert into lecciones (titulo, descripcion, contenido, orden) values
  ('¿Qué es Bold POS?', 'Introducción al sistema de punto de venta Bold', '<p>Bold POS es un sistema de punto de venta que permite procesar pagos con tarjeta de crédito y débito...</p>', 1),
  ('Procesando tu primer pago', 'Aprende a realizar tu primera transacción', '<p>Para procesar un pago, sigue estos pasos...</p>', 2);

  insert into glosario (termino, definicion) values
  ('POS', 'Point of Sale — sistema de punto de venta para procesar pagos'),
  ('Datafono', 'Dispositivo físico que lee tarjetas de crédito y débito'),
  ('Reversión', 'Cancelación de una transacción ya procesada');
  ```

---

## Task 2: Estructura base del proyecto

**Files:**
- Create: `js/supabase.js`
- Create: `css/style.css`
- Create: `vercel.json`
- Create: `assets/` (carpeta vacía)

- [ ] **Step 1: Crear estructura de carpetas**

  ```bash
  mkdir -p "js" "css" "assets"
  ```

- [ ] **Step 2: Crear `js/supabase.js`**

  Reemplaza `TU_SUPABASE_URL` y `TU_ANON_KEY` con los valores del Task 1 Step 8.

  ```js
  import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

  const SUPABASE_URL = 'TU_SUPABASE_URL'
  const SUPABASE_ANON_KEY = 'TU_ANON_KEY'

  export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  ```

- [ ] **Step 3: Crear `css/style.css`**

  ```css
  /* Chat bubbles */
  .msg-user {
    background: #E92129;
    color: white;
    border-radius: 18px 18px 4px 18px;
    padding: 10px 16px;
    max-width: 75%;
    align-self: flex-end;
    word-break: break-word;
  }

  .msg-bot {
    background: #f1f5f9;
    color: #1e293b;
    border-radius: 18px 18px 18px 4px;
    padding: 10px 16px;
    max-width: 75%;
    align-self: flex-start;
    word-break: break-word;
  }

  .dark .msg-bot {
    background: #1e293b;
    color: #f1f5f9;
  }

  /* Typing indicator */
  .typing-dot {
    width: 8px;
    height: 8px;
    background: #94a3b8;
    border-radius: 50%;
    animation: typingBounce 1.2s infinite;
  }

  .typing-dot:nth-child(2) { animation-delay: 0.2s; }
  .typing-dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes typingBounce {
    0%, 60%, 100% { transform: translateY(0); }
    30% { transform: translateY(-6px); }
  }

  /* Fade in para secciones */
  .section-enter {
    animation: fadeSlide 0.25s ease;
  }

  @keyframes fadeSlide {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* Lesson card hover */
  .lesson-card {
    transition: border-color 0.15s, transform 0.15s;
  }
  .lesson-card:hover {
    border-color: #E92129;
    transform: translateY(-2px);
  }

  /* Scrollbar custom */
  .custom-scroll::-webkit-scrollbar { width: 4px; }
  .custom-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
  .dark .custom-scroll::-webkit-scrollbar-thumb { background: #334155; }
  ```

- [ ] **Step 4: Crear `vercel.json`**

  ```json
  {
    "rewrites": [
      { "source": "/admin", "destination": "/admin.html" }
    ]
  }
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add js/ css/ vercel.json
  git commit -m "feat: project structure and base files"
  ```

---

## Task 3: Shell principal `index.html`

**Files:**
- Create: `index.html`

- [ ] **Step 1: Crear `index.html` con navegación y contenedores**

  ```html
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Academia Bold POS</title>
    <meta name="description" content="Plataforma oficial de capacitación Bold POS">
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <link rel="stylesheet" href="css/style.css">
    <script>
      tailwind.config = {
        darkMode: 'class',
        theme: { extend: { colors: { boldRed: '#E92129' } } }
      }
    </script>
  </head>
  <body class="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 h-screen flex flex-col overflow-hidden">

    <!-- Header -->
    <header class="h-14 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between px-4 shrink-0 bg-white dark:bg-slate-900 z-10">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 bg-[#E92129] rounded-xl flex items-center justify-center text-white font-black italic text-base shadow">B</div>
        <div class="leading-none">
          <p class="font-black text-base uppercase tracking-tighter">Bold <span class="text-[#E92129] text-sm">POS</span></p>
          <p class="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Academia Oficial</p>
        </div>
      </div>
      <button id="themeToggle" class="p-2 rounded-full bg-slate-100 dark:bg-slate-800 hover:scale-110 transition-transform">
        <i data-lucide="moon" id="iconMoon" class="w-4 h-4"></i>
        <i data-lucide="sun" id="iconSun" class="w-4 h-4 hidden"></i>
      </button>
    </header>

    <!-- Main content -->
    <main class="flex-1 overflow-hidden relative">
      <div id="section-assistant" class="absolute inset-0 section-enter"></div>
      <div id="section-lessons" class="absolute inset-0 section-enter hidden"></div>
      <div id="section-resources" class="absolute inset-0 section-enter hidden"></div>
    </main>

    <!-- Bottom nav (móvil) / Top tabs (escritorio) -->
    <nav class="h-16 border-t border-slate-100 dark:border-slate-800 flex items-center justify-around bg-white dark:bg-slate-900 shrink-0 md:hidden">
      <button data-tab="assistant" class="nav-tab flex flex-col items-center gap-1 text-[10px] font-bold text-[#E92129]">
        <i data-lucide="bot" class="w-5 h-5"></i>
        <span>Asistente</span>
      </button>
      <button data-tab="lessons" class="nav-tab flex flex-col items-center gap-1 text-[10px] font-bold text-slate-400">
        <i data-lucide="book-open" class="w-5 h-5"></i>
        <span>Lecciones</span>
      </button>
      <button data-tab="resources" class="nav-tab flex flex-col items-center gap-1 text-[10px] font-bold text-slate-400">
        <i data-lucide="library" class="w-5 h-5"></i>
        <span>Recursos</span>
      </button>
    </nav>

    <!-- Desktop sidebar -->
    <div class="hidden md:flex md:fixed md:left-0 md:top-14 md:h-[calc(100vh-3.5rem)] md:w-56 md:border-r md:border-slate-100 md:dark:border-slate-800 md:bg-white md:dark:bg-slate-900 md:flex-col md:p-3 md:gap-1 md:z-10">
      <button data-tab="assistant" class="nav-tab-desk flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-[#E92129] bg-red-50 dark:bg-red-950/30">
        <i data-lucide="bot" class="w-4 h-4"></i> Asistente IA
      </button>
      <button data-tab="lessons" class="nav-tab-desk flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800">
        <i data-lucide="book-open" class="w-4 h-4"></i> Lecciones
      </button>
      <button data-tab="resources" class="nav-tab-desk flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800">
        <i data-lucide="library" class="w-4 h-4"></i> Recursos
      </button>
      <div class="mt-auto pt-3 border-t border-slate-100 dark:border-slate-800">
        <a href="admin.html" class="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
          <i data-lucide="settings" class="w-4 h-4"></i> Admin
        </a>
      </div>
    </div>

    <!-- Desktop content offset -->
    <style>
      @media (min-width: 768px) {
        main { margin-left: 14rem; }
      }
    </style>

    <script type="module">
      import './js/assistant.js'
      import './js/lessons.js'
      import './js/resources.js'

      // Theme toggle
      const html = document.documentElement
      const toggle = document.getElementById('themeToggle')
      const moon = document.getElementById('iconMoon')
      const sun = document.getElementById('iconSun')

      if (localStorage.theme === 'dark') {
        html.classList.add('dark')
        moon.classList.add('hidden')
        sun.classList.remove('hidden')
      }

      toggle.addEventListener('click', () => {
        html.classList.toggle('dark')
        const isDark = html.classList.contains('dark')
        localStorage.theme = isDark ? 'dark' : 'light'
        moon.classList.toggle('hidden', isDark)
        sun.classList.toggle('hidden', !isDark)
      })

      // Tab navigation
      function switchTab(tab) {
        document.querySelectorAll('[id^="section-"]').forEach(s => s.classList.add('hidden'))
        document.getElementById(`section-${tab}`).classList.remove('hidden')

        // Mobile nav
        document.querySelectorAll('.nav-tab').forEach(b => {
          const active = b.dataset.tab === tab
          b.classList.toggle('text-[#E92129]', active)
          b.classList.toggle('text-slate-400', !active)
        })

        // Desktop nav
        document.querySelectorAll('.nav-tab-desk').forEach(b => {
          const active = b.dataset.tab === tab
          b.classList.toggle('text-[#E92129]', active)
          b.classList.toggle('bg-red-50', active)
          b.classList.toggle('dark:bg-red-950/30', active)
          b.classList.toggle('text-slate-500', !active)
        })
      }

      document.querySelectorAll('[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab))
      })

      lucide.createIcons()
    </script>
  </body>
  </html>
  ```

- [ ] **Step 2: Verificar en navegador**

  Abre `index.html` en el navegador (doble clic o con Live Server en VS Code).
  Verifica:
  - Header con logo Bold visible
  - 3 botones en nav inferior (móvil) o barra lateral (escritorio)
  - Hacer clic entre tabs cambia el tab activo (rojo)
  - Tema claro/oscuro funciona

- [ ] **Step 3: Commit**

  ```bash
  git add index.html
  git commit -m "feat: main shell with navigation and theme toggle"
  ```

---

## Task 4: Asistente IA

**Files:**
- Create: `js/assistant.js`
- Modify: `index.html` (contenedor `#section-assistant`)

- [ ] **Step 1: Crear `js/assistant.js`**

  ```js
  const N8N_URL = 'https://n8n.mplasesores.com/webhook/bold-pos-chat'

  const QUICK_QUERIES = [
    '¿Cómo proceso un pago?',
    '¿Qué es el datafono Bold?',
    '¿Cómo hago un reembolso?',
    '¿Cómo configuro mi cuenta?',
  ]

  let history = JSON.parse(localStorage.getItem('bold_chat_history') || '[]')

  function renderAssistant() {
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
              <p class="text-sm font-black">Asistente Bold POS</p>
              <p class="text-[10px] text-green-500 font-bold flex items-center gap-1">
                <span class="w-1.5 h-1.5 bg-green-500 rounded-full inline-block"></span> En línea
              </p>
            </div>
          </div>
          <button id="clearChat" class="text-xs text-slate-400 hover:text-[#E92129] font-bold flex items-center gap-1">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Limpiar
          </button>
        </div>

        <!-- Messages -->
        <div id="chatMessages" class="flex-1 overflow-y-auto custom-scroll p-4 flex flex-col gap-3">
          ${history.length === 0 ? `
            <div class="text-center mt-8">
              <div class="w-16 h-16 bg-red-50 dark:bg-red-950/30 rounded-full flex items-center justify-center mx-auto mb-3">
                <i data-lucide="bot" class="w-8 h-8 text-[#E92129]"></i>
              </div>
              <p class="font-bold text-slate-700 dark:text-slate-300 text-sm">¡Hola! Soy tu asistente Bold POS</p>
              <p class="text-slate-400 text-xs mt-1">Pregúntame cualquier cosa sobre el sistema</p>
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
          ${QUICK_QUERIES.map(q => `
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

  function renderBubble(role, content) {
    return role === 'user'
      ? `<div class="flex justify-end"><div class="msg-user text-sm">${escapeHtml(content)}</div></div>`
      : `<div class="flex justify-start"><div class="msg-bot text-sm">${content}</div></div>`
  }

  function escapeHtml(text) {
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  }

  function scrollToBottom() {
    const box = document.getElementById('chatMessages')
    if (box) box.scrollTop = box.scrollHeight
  }

  function bindAssistantEvents() {
    const input = document.getElementById('chatInput')
    const sendBtn = document.getElementById('sendBtn')
    const clearBtn = document.getElementById('clearChat')

    input.addEventListener('input', () => {
      input.style.height = 'auto'
      input.style.height = input.scrollHeight + 'px'
    })

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage(input.value.trim())
      }
    })

    sendBtn.addEventListener('click', () => sendMessage(input.value.trim()))

    clearBtn.addEventListener('click', () => {
      localStorage.removeItem('bold_chat_history')
      history = []
      renderAssistant()
    })

    document.querySelectorAll('.quick-query').forEach(btn => {
      btn.addEventListener('click', () => sendMessage(btn.textContent))
    })
  }

  async function sendMessage(text) {
    if (!text) return

    const input = document.getElementById('chatInput')
    input.value = ''
    input.style.height = 'auto'

    document.getElementById('quickQueries')?.classList.add('hidden')

    appendBubble('user', escapeHtml(text))
    history.push({ role: 'user', content: text })

    const typing = document.getElementById('typingIndicator')
    typing.classList.remove('hidden')
    scrollToBottom()

    try {
      const res = await fetch(N8N_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history })
      })
      const data = await res.json()
      typing.classList.add('hidden')

      const reply = data.response || 'No pude procesar tu pregunta. Intenta de nuevo.'
      appendBubble('bot', reply)
      history.push({ role: 'assistant', content: reply })
      localStorage.setItem('bold_chat_history', JSON.stringify(history.slice(-20)))
    } catch {
      typing.classList.add('hidden')
      appendBubble('bot', 'Error de conexión. Verifica tu internet e intenta de nuevo.')
    }

    scrollToBottom()
  }

  function appendBubble(role, content) {
    const box = document.getElementById('chatMessages')
    const div = document.createElement('div')
    div.className = role === 'user' ? 'flex justify-end' : 'flex justify-start'
    div.innerHTML = role === 'user'
      ? `<div class="msg-user text-sm">${content}</div>`
      : `<div class="msg-bot text-sm">${content}</div>`
    box.appendChild(div)
  }

  renderAssistant()
  ```

- [ ] **Step 2: Verificar en navegador**

  Recarga `index.html`.
  Verifica:
  - Sección Asistente muestra avatar, texto de bienvenida y 4 sugerencias rápidas
  - Al hacer clic en una sugerencia se envía el mensaje (aparece burbuja roja)
  - Aparece indicador de escritura (3 puntos animados)
  - Llega respuesta del bot (burbuja gris)
  - El botón "Limpiar" borra el historial y vuelve a la pantalla de bienvenida

- [ ] **Step 3: Commit**

  ```bash
  git add js/assistant.js
  git commit -m "feat: AI assistant with n8n webhook and chat history"
  ```

---

## Task 5: Sección Lecciones

**Files:**
- Create: `js/lessons.js`

- [ ] **Step 1: Crear `js/lessons.js`**

  ```js
  import { supabase } from './supabase.js'

  async function renderLessons() {
    const container = document.getElementById('section-lessons')
    container.innerHTML = `
      <div class="h-full overflow-y-auto custom-scroll p-4">
        <h2 class="text-lg font-black mb-4">Lecciones</h2>
        <div id="lessonsGrid" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="text-slate-400 text-sm col-span-2 text-center py-8">Cargando lecciones...</div>
        </div>
      </div>
      <!-- Modal detalle -->
      <div id="lessonModal" class="hidden fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
        <div class="bg-white dark:bg-slate-900 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">
          <div class="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <h3 id="modalTitle" class="font-black text-base"></h3>
            <button id="closeModal" class="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
              <i data-lucide="x" class="w-5 h-5"></i>
            </button>
          </div>
          <div id="modalContent" class="overflow-y-auto custom-scroll p-4 prose prose-sm dark:prose-invert max-w-none flex-1"></div>
        </div>
      </div>
    `

    const { data: lessons, error } = await supabase
      .from('lecciones')
      .select('*')
      .order('orden')

    const grid = document.getElementById('lessonsGrid')

    if (error || !lessons?.length) {
      grid.innerHTML = '<p class="text-slate-400 text-sm col-span-2 text-center py-8">No hay lecciones disponibles aún.</p>'
      return
    }

    grid.innerHTML = lessons.map((l, i) => `
      <button data-id="${l.id}" class="lesson-card text-left p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:shadow-md">
        <span class="inline-block text-[10px] font-black text-[#E92129] bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-full mb-2">Lección ${i + 1}</span>
        <p class="font-black text-sm mb-1">${escapeHtml(l.titulo)}</p>
        <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">${escapeHtml(l.descripcion)}</p>
        <p class="text-[10px] font-bold text-[#E92129] mt-2 flex items-center gap-1">
          Leer lección <i data-lucide="arrow-right" class="w-3 h-3"></i>
        </p>
      </button>
    `).join('')

    lucide.createIcons()

    // Modal events
    grid.querySelectorAll('.lesson-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const lesson = lessons.find(l => l.id === btn.dataset.id)
        document.getElementById('modalTitle').textContent = lesson.titulo
        document.getElementById('modalContent').innerHTML = lesson.contenido
        document.getElementById('lessonModal').classList.remove('hidden')
      })
    })

    document.getElementById('closeModal').addEventListener('click', () => {
      document.getElementById('lessonModal').classList.add('hidden')
    })

    document.getElementById('lessonModal').addEventListener('click', e => {
      if (e.target === document.getElementById('lessonModal')) {
        document.getElementById('lessonModal').classList.add('hidden')
      }
    })
  }

  function escapeHtml(text) {
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  }

  renderLessons()
  ```

- [ ] **Step 2: Verificar en navegador**

  Navega a la sección "Lecciones".
  Verifica:
  - Muestra las 2 lecciones de prueba insertadas en Task 1
  - Al hacer clic en una tarjeta abre el modal con el contenido
  - El modal se cierra con el botón X o haciendo clic afuera

- [ ] **Step 3: Commit**

  ```bash
  git add js/lessons.js
  git commit -m "feat: lessons section with Supabase and detail modal"
  ```

---

## Task 6: Sección Recursos (Glosario + Material)

**Files:**
- Create: `js/resources.js`

- [ ] **Step 1: Crear `js/resources.js`**

  ```js
  import { supabase } from './supabase.js'

  let activeSubTab = 'glossary'

  async function renderResources() {
    const container = document.getElementById('section-resources')
    container.innerHTML = `
      <div class="h-full flex flex-col overflow-hidden">
        <div class="px-4 pt-4 pb-2 shrink-0">
          <h2 class="text-lg font-black mb-3">Recursos</h2>
          <div class="flex gap-2">
            <button id="tabGlossary" class="sub-tab px-4 py-1.5 rounded-full text-xs font-bold bg-[#E92129] text-white">Glosario</button>
            <button id="tabMaterial" class="sub-tab px-4 py-1.5 rounded-full text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800">Material de apoyo</button>
          </div>
        </div>

        <div id="subGlossary" class="flex-1 overflow-y-auto custom-scroll px-4 pb-4">
          <div class="mb-3">
            <input id="searchGlossary" type="text" placeholder="Buscar término..."
              class="w-full px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-[#E92129]">
          </div>
          <div id="glossaryList" class="space-y-2">
            <p class="text-slate-400 text-sm text-center py-8">Cargando glosario...</p>
          </div>
        </div>

        <div id="subMaterial" class="hidden flex-1 overflow-y-auto custom-scroll px-4 pb-4">
          <div id="materialList" class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <p class="text-slate-400 text-sm text-center py-8 col-span-2">Cargando material...</p>
          </div>
        </div>
      </div>
    `

    await Promise.all([loadGlossary(), loadMaterial()])
    bindResourceEvents()
  }

  async function loadGlossary() {
    const { data, error } = await supabase.from('glosario').select('*').order('termino')
    const list = document.getElementById('glossaryList')

    if (error || !data?.length) {
      list.innerHTML = '<p class="text-slate-400 text-sm text-center py-8">No hay términos en el glosario aún.</p>'
      return
    }

    const render = (items) => {
      list.innerHTML = items.map(g => `
        <div class="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800/50">
          <p class="font-black text-sm text-[#E92129]">${escapeHtml(g.termino)}</p>
          <p class="text-xs text-slate-600 dark:text-slate-400 mt-0.5">${escapeHtml(g.definicion)}</p>
        </div>
      `).join('')
    }

    render(data)

    document.getElementById('searchGlossary').addEventListener('input', e => {
      const q = e.target.value.toLowerCase()
      render(data.filter(g => g.termino.toLowerCase().includes(q) || g.definicion.toLowerCase().includes(q)))
    })
  }

  async function loadMaterial() {
    const { data, error } = await supabase.from('material_apoyo').select('*')
    const list = document.getElementById('materialList')

    if (error || !data?.length) {
      list.innerHTML = '<p class="text-slate-400 text-sm text-center py-8 col-span-2">No hay material disponible aún.</p>'
      return
    }

    const iconMap = { pdf: 'file-text', link: 'link', video: 'play-circle' }
    const colorMap = { pdf: 'text-red-500', link: 'text-blue-500', video: 'text-purple-500' }

    list.innerHTML = data.map(m => `
      <a href="${m.url}" target="_blank" rel="noopener"
        class="flex items-center gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-[#E92129] transition-colors group">
        <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
          <i data-lucide="${iconMap[m.tipo] || 'file'}" class="w-5 h-5 ${colorMap[m.tipo] || 'text-slate-500'}"></i>
        </div>
        <div class="min-w-0">
          <p class="font-bold text-sm truncate group-hover:text-[#E92129] transition-colors">${escapeHtml(m.titulo)}</p>
          <p class="text-[10px] font-bold text-slate-400 uppercase">${m.tipo}</p>
        </div>
        <i data-lucide="external-link" class="w-4 h-4 text-slate-300 ml-auto shrink-0"></i>
      </a>
    `).join('')

    lucide.createIcons()
  }

  function bindResourceEvents() {
    document.getElementById('tabGlossary').addEventListener('click', () => switchSubTab('glossary'))
    document.getElementById('tabMaterial').addEventListener('click', () => switchSubTab('material'))
  }

  function switchSubTab(tab) {
    activeSubTab = tab
    document.getElementById('subGlossary').classList.toggle('hidden', tab !== 'glossary')
    document.getElementById('subMaterial').classList.toggle('hidden', tab !== 'material')
    document.getElementById('tabGlossary').className = `sub-tab px-4 py-1.5 rounded-full text-xs font-bold ${tab === 'glossary' ? 'bg-[#E92129] text-white' : 'text-slate-500 bg-slate-100 dark:bg-slate-800'}`
    document.getElementById('tabMaterial').className = `sub-tab px-4 py-1.5 rounded-full text-xs font-bold ${tab === 'material' ? 'bg-[#E92129] text-white' : 'text-slate-500 bg-slate-100 dark:bg-slate-800'}`
  }

  function escapeHtml(text) {
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  }

  renderResources()
  ```

- [ ] **Step 2: Verificar en navegador**

  Navega a la sección "Recursos".
  Verifica:
  - Sub-tab Glosario muestra los 3 términos de prueba
  - El buscador filtra en tiempo real
  - Sub-tab Material de apoyo funciona (puede estar vacío si no agregaste datos)
  - Cambiar entre sub-tabs funciona correctamente

- [ ] **Step 3: Commit**

  ```bash
  git add js/resources.js
  git commit -m "feat: resources section with glossary search and materials"
  ```

---

## Task 7: Panel Admin — Login y estructura

**Files:**
- Create: `admin.html`
- Create: `js/auth.js`

- [ ] **Step 1: Crear `js/auth.js`**

  ```js
  import { supabase } from './supabase.js'

  export async function requireAuth() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      showLogin()
      return false
    }
    return true
  }

  export function showLogin() {
    document.getElementById('loginScreen').classList.remove('hidden')
    document.getElementById('adminApp').classList.add('hidden')

    document.getElementById('loginForm').addEventListener('submit', async e => {
      e.preventDefault()
      const email = document.getElementById('loginEmail').value
      const password = document.getElementById('loginPassword').value
      const errEl = document.getElementById('loginError')

      const { error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        errEl.textContent = 'Credenciales incorrectas'
        errEl.classList.remove('hidden')
      } else {
        location.reload()
      }
    })
  }

  export async function logout() {
    await supabase.auth.signOut()
    location.href = 'index.html'
  }
  ```

- [ ] **Step 2: Crear `admin.html`**

  ```html
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Admin — Academia Bold POS</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <link rel="stylesheet" href="css/style.css">
    <script>tailwind.config = { theme: { extend: { colors: { boldRed: '#E92129' } } } }</script>
  </head>
  <body class="bg-slate-50 text-slate-900 min-h-screen">

    <!-- Login screen -->
    <div id="loginScreen" class="hidden fixed inset-0 bg-slate-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-3xl p-8 shadow-xl w-full max-w-sm">
        <div class="w-12 h-12 bg-[#E92129] rounded-2xl flex items-center justify-center text-white font-black italic text-2xl mx-auto mb-4">B</div>
        <h1 class="text-xl font-black text-center mb-1">Panel Admin</h1>
        <p class="text-slate-400 text-sm text-center mb-6">Academia Bold POS</p>
        <form id="loginForm" class="space-y-3">
          <input id="loginEmail" type="email" placeholder="Email" required
            class="w-full px-4 py-3 bg-slate-50 rounded-2xl text-sm border-2 border-slate-100 outline-none focus:border-[#E92129]">
          <input id="loginPassword" type="password" placeholder="Contraseña" required
            class="w-full px-4 py-3 bg-slate-50 rounded-2xl text-sm border-2 border-slate-100 outline-none focus:border-[#E92129]">
          <p id="loginError" class="hidden text-red-500 text-xs text-center"></p>
          <button type="submit" class="w-full bg-[#E92129] text-white py-3 rounded-2xl font-black text-sm hover:scale-[1.02] transition-transform shadow">
            Entrar
          </button>
        </form>
      </div>
    </div>

    <!-- Admin app -->
    <div id="adminApp" class="hidden">
      <header class="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 bg-[#E92129] rounded-xl flex items-center justify-center text-white font-black italic">B</div>
          <p class="font-black text-sm uppercase tracking-tighter">Admin <span class="text-[#E92129]">Panel</span></p>
        </div>
        <div class="flex items-center gap-3">
          <a href="index.html" class="text-xs font-bold text-slate-400 hover:text-slate-700 flex items-center gap-1">
            <i data-lucide="external-link" class="w-3.5 h-3.5"></i> Ver sitio
          </a>
          <button id="logoutBtn" class="text-xs font-bold text-slate-400 hover:text-red-500 flex items-center gap-1">
            <i data-lucide="log-out" class="w-3.5 h-3.5"></i> Salir
          </button>
        </div>
      </header>

      <div class="flex">
        <!-- Sidebar -->
        <nav class="w-48 bg-white border-r border-slate-100 min-h-[calc(100vh-57px)] p-3 space-y-1 shrink-0">
          <button data-panel="lessons" class="admin-nav w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-[#E92129] bg-red-50">
            <i data-lucide="book-open" class="w-4 h-4"></i> Lecciones
          </button>
          <button data-panel="glossary" class="admin-nav w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50">
            <i data-lucide="book" class="w-4 h-4"></i> Glosario
          </button>
          <button data-panel="material" class="admin-nav w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50">
            <i data-lucide="paperclip" class="w-4 h-4"></i> Material
          </button>
        </nav>

        <!-- Panels -->
        <main class="flex-1 p-6">
          <div id="panel-lessons"></div>
          <div id="panel-glossary" class="hidden"></div>
          <div id="panel-material" class="hidden"></div>
        </main>
      </div>
    </div>

    <script type="module" src="js/admin.js"></script>
  </body>
  </html>
  ```

- [ ] **Step 3: Verificar en navegador**

  Abre `admin.html`.
  Verifica:
  - Muestra el formulario de login
  - Con credenciales incorrectas aparece el mensaje de error
  - Con las credenciales correctas del admin (Task 1 Step 7) muestra el panel vacío
  - El botón "Salir" redirige a `index.html`

- [ ] **Step 4: Commit**

  ```bash
  git add admin.html js/auth.js
  git commit -m "feat: admin login with Supabase Auth"
  ```

---

## Task 8: Panel Admin — CRUD completo

**Files:**
- Create: `js/admin.js`

- [ ] **Step 1: Crear `js/admin.js`**

  ```js
  import { supabase } from './supabase.js'
  import { requireAuth, logout } from './auth.js'

  async function init() {
    const ok = await requireAuth()
    if (!ok) return

    document.getElementById('loginScreen').classList.add('hidden')
    document.getElementById('adminApp').classList.remove('hidden')
    document.getElementById('logoutBtn').addEventListener('click', logout)

    await renderLessonsPanel()
    lucide.createIcons()

    document.querySelectorAll('.admin-nav').forEach(btn => {
      btn.addEventListener('click', () => switchPanel(btn.dataset.panel))
    })
  }

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
  }

  // ── LECCIONES ──────────────────────────────────────
  async function renderLessonsPanel() {
    const el = document.getElementById('panel-lessons')
    const { data } = await supabase.from('lecciones').select('*').order('orden')

    el.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-black">Lecciones</h2>
        <button id="addLesson" class="bg-[#E92129] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:scale-105 transition-transform">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i> Nueva lección
        </button>
      </div>
      <div id="lessonsList" class="space-y-3">
        ${(data || []).map(l => `
          <div class="bg-white rounded-2xl border border-slate-100 p-4 flex items-start justify-between gap-4">
            <div class="min-w-0">
              <p class="font-bold text-sm">${escapeHtml(l.titulo)}</p>
              <p class="text-xs text-slate-500 mt-0.5 line-clamp-1">${escapeHtml(l.descripcion)}</p>
            </div>
            <div class="flex gap-2 shrink-0">
              <button data-id="${l.id}" class="edit-lesson p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                <i data-lucide="edit-2" class="w-4 h-4"></i>
              </button>
              <button data-id="${l.id}" class="del-lesson p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-500">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
        `).join('') || '<p class="text-slate-400 text-sm">No hay lecciones. Crea la primera.</p>'}
      </div>
      <!-- Modal lección -->
      <div id="lessonFormModal" class="hidden fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div class="bg-white rounded-2xl w-full max-w-lg p-6">
          <h3 id="lessonFormTitle" class="font-black text-base mb-4">Nueva lección</h3>
          <form id="lessonForm" class="space-y-3">
            <input type="hidden" id="lessonId">
            <input id="lessonTitulo" placeholder="Título" required
              class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
            <input id="lessonDescripcion" placeholder="Descripción corta" required
              class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
            <textarea id="lessonContenido" placeholder="Contenido (HTML permitido)" rows="6" required
              class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129] resize-y"></textarea>
            <input id="lessonOrden" type="number" placeholder="Orden (ej: 1)" required
              class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
            <div class="flex gap-2 pt-1">
              <button type="button" id="cancelLessonForm" class="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-500">Cancelar</button>
              <button type="submit" class="flex-1 py-2.5 rounded-xl bg-[#E92129] text-white text-sm font-bold">Guardar</button>
            </div>
          </form>
        </div>
      </div>
    `
    lucide.createIcons()

    document.getElementById('addLesson').addEventListener('click', () => openLessonForm())
    document.querySelectorAll('.edit-lesson').forEach(b => b.addEventListener('click', async () => {
      const { data } = await supabase.from('lecciones').select('*').eq('id', b.dataset.id).single()
      openLessonForm(data)
    }))
    document.querySelectorAll('.del-lesson').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta lección?')) return
      await supabase.from('lecciones').delete().eq('id', b.dataset.id)
      renderLessonsPanel()
    }))
    document.getElementById('cancelLessonForm').addEventListener('click', () => {
      document.getElementById('lessonFormModal').classList.add('hidden')
    })
    document.getElementById('lessonForm').addEventListener('submit', async e => {
      e.preventDefault()
      const id = document.getElementById('lessonId').value
      const payload = {
        titulo: document.getElementById('lessonTitulo').value,
        descripcion: document.getElementById('lessonDescripcion').value,
        contenido: document.getElementById('lessonContenido').value,
        orden: parseInt(document.getElementById('lessonOrden').value),
      }
      if (id) {
        await supabase.from('lecciones').update(payload).eq('id', id)
      } else {
        await supabase.from('lecciones').insert(payload)
      }
      document.getElementById('lessonFormModal').classList.add('hidden')
      renderLessonsPanel()
    })
  }

  function openLessonForm(lesson = null) {
    document.getElementById('lessonFormTitle').textContent = lesson ? 'Editar lección' : 'Nueva lección'
    document.getElementById('lessonId').value = lesson?.id || ''
    document.getElementById('lessonTitulo').value = lesson?.titulo || ''
    document.getElementById('lessonDescripcion').value = lesson?.descripcion || ''
    document.getElementById('lessonContenido').value = lesson?.contenido || ''
    document.getElementById('lessonOrden').value = lesson?.orden || ''
    document.getElementById('lessonFormModal').classList.remove('hidden')
  }

  // ── GLOSARIO ───────────────────────────────────────
  async function renderGlossaryPanel() {
    const el = document.getElementById('panel-glossary')
    const { data } = await supabase.from('glosario').select('*').order('termino')

    el.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-black">Glosario</h2>
        <button id="addTerm" class="bg-[#E92129] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:scale-105 transition-transform">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i> Nuevo término
        </button>
      </div>
      <div class="space-y-2">
        ${(data || []).map(g => `
          <div class="bg-white rounded-xl border border-slate-100 p-3 flex items-start justify-between gap-3">
            <div>
              <p class="font-bold text-sm text-[#E92129]">${escapeHtml(g.termino)}</p>
              <p class="text-xs text-slate-500 mt-0.5">${escapeHtml(g.definicion)}</p>
            </div>
            <div class="flex gap-1 shrink-0">
              <button data-id="${g.id}" data-term="${escapeHtml(g.termino)}" data-def="${escapeHtml(g.definicion)}" class="edit-term p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                <i data-lucide="edit-2" class="w-4 h-4"></i>
              </button>
              <button data-id="${g.id}" class="del-term p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-500">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
        `).join('') || '<p class="text-slate-400 text-sm">No hay términos aún.</p>'}
      </div>
      <!-- Inline form -->
      <div id="termForm" class="hidden mt-4 bg-white rounded-2xl border border-slate-200 p-4">
        <input type="hidden" id="termId">
        <input id="termTermino" placeholder="Término" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129] mb-2">
        <textarea id="termDefinicion" placeholder="Definición" rows="2" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129] resize-none mb-2"></textarea>
        <div class="flex gap-2">
          <button id="cancelTerm" class="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-500">Cancelar</button>
          <button id="saveTerm" class="flex-1 py-2 rounded-xl bg-[#E92129] text-white text-sm font-bold">Guardar</button>
        </div>
      </div>
    `
    lucide.createIcons()

    document.getElementById('addTerm').addEventListener('click', () => {
      document.getElementById('termId').value = ''
      document.getElementById('termTermino').value = ''
      document.getElementById('termDefinicion').value = ''
      document.getElementById('termForm').classList.remove('hidden')
    })
    document.querySelectorAll('.edit-term').forEach(b => b.addEventListener('click', () => {
      document.getElementById('termId').value = b.dataset.id
      document.getElementById('termTermino').value = b.dataset.term
      document.getElementById('termDefinicion').value = b.dataset.def
      document.getElementById('termForm').classList.remove('hidden')
    }))
    document.querySelectorAll('.del-term').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este término?')) return
      await supabase.from('glosario').delete().eq('id', b.dataset.id)
      renderGlossaryPanel()
    }))
    document.getElementById('cancelTerm').addEventListener('click', () => {
      document.getElementById('termForm').classList.add('hidden')
    })
    document.getElementById('saveTerm').addEventListener('click', async () => {
      const id = document.getElementById('termId').value
      const payload = {
        termino: document.getElementById('termTermino').value,
        definicion: document.getElementById('termDefinicion').value,
      }
      if (id) {
        await supabase.from('glosario').update(payload).eq('id', id)
      } else {
        await supabase.from('glosario').insert(payload)
      }
      renderGlossaryPanel()
    })
  }

  // ── MATERIAL ───────────────────────────────────────
  async function renderMaterialPanel() {
    const el = document.getElementById('panel-material')
    const { data } = await supabase.from('material_apoyo').select('*')

    el.innerHTML = `
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-black">Material de apoyo</h2>
        <button id="addMaterial" class="bg-[#E92129] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:scale-105 transition-transform">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i> Agregar
        </button>
      </div>
      <div class="space-y-2">
        ${(data || []).map(m => `
          <div class="bg-white rounded-xl border border-slate-100 p-3 flex items-center justify-between gap-3">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="text-xs font-black uppercase text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">${m.tipo}</span>
              <p class="font-bold text-sm truncate">${escapeHtml(m.titulo)}</p>
            </div>
            <div class="flex gap-1 shrink-0">
              <button data-id="${m.id}" data-titulo="${escapeHtml(m.titulo)}" data-tipo="${m.tipo}" data-url="${escapeHtml(m.url)}" class="edit-mat p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
                <i data-lucide="edit-2" class="w-4 h-4"></i>
              </button>
              <button data-id="${m.id}" class="del-mat p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-500">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            </div>
          </div>
        `).join('') || '<p class="text-slate-400 text-sm">No hay material aún.</p>'}
      </div>
      <!-- Form -->
      <div id="matForm" class="hidden mt-4 bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
        <input type="hidden" id="matId">
        <input id="matTitulo" placeholder="Título del recurso"
          class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
        <select id="matTipo" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129] bg-white">
          <option value="pdf">PDF</option>
          <option value="link">Link</option>
          <option value="video">Video</option>
        </select>
        <input id="matUrl" placeholder="URL del recurso"
          class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
        <p class="text-xs text-slate-400">Para subir un archivo: ve a Supabase → Storage → bucket "material" → Upload, luego pega la URL pública aquí.</p>
        <div class="flex gap-2">
          <button id="cancelMat" class="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-500">Cancelar</button>
          <button id="saveMat" class="flex-1 py-2 rounded-xl bg-[#E92129] text-white text-sm font-bold">Guardar</button>
        </div>
      </div>
    `
    lucide.createIcons()

    document.getElementById('addMaterial').addEventListener('click', () => {
      document.getElementById('matId').value = ''
      document.getElementById('matTitulo').value = ''
      document.getElementById('matTipo').value = 'pdf'
      document.getElementById('matUrl').value = ''
      document.getElementById('matForm').classList.remove('hidden')
    })
    document.querySelectorAll('.edit-mat').forEach(b => b.addEventListener('click', () => {
      document.getElementById('matId').value = b.dataset.id
      document.getElementById('matTitulo').value = b.dataset.titulo
      document.getElementById('matTipo').value = b.dataset.tipo
      document.getElementById('matUrl').value = b.dataset.url
      document.getElementById('matForm').classList.remove('hidden')
    }))
    document.querySelectorAll('.del-mat').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este material?')) return
      await supabase.from('material_apoyo').delete().eq('id', b.dataset.id)
      renderMaterialPanel()
    }))
    document.getElementById('cancelMat').addEventListener('click', () => {
      document.getElementById('matForm').classList.add('hidden')
    })
    document.getElementById('saveMat').addEventListener('click', async () => {
      const id = document.getElementById('matId').value
      const payload = {
        titulo: document.getElementById('matTitulo').value,
        tipo: document.getElementById('matTipo').value,
        url: document.getElementById('matUrl').value,
      }
      if (id) {
        await supabase.from('material_apoyo').update(payload).eq('id', id)
      } else {
        await supabase.from('material_apoyo').insert(payload)
      }
      renderMaterialPanel()
    })
  }

  function escapeHtml(text) {
    if (!text) return ''
    return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }

  init()
  ```

- [ ] **Step 2: Verificar en navegador**

  Inicia sesión en `admin.html` y verifica:
  - Panel Lecciones: crear una nueva lección, verifica que aparece en la lista, editarla, eliminarla
  - Panel Glosario: agregar término, editar, eliminar
  - Panel Material: agregar un link externo, editar, eliminar
  - Los cambios se reflejan en `index.html` al recargar

- [ ] **Step 3: Commit**

  ```bash
  git add js/admin.js
  git commit -m "feat: admin CRUD for lessons, glossary, and materials"
  ```

---

## Task 9: Despliegue en Vercel

**Files:**
- No code changes — configuración en Vercel dashboard

- [ ] **Step 1: Push final al repo**

  ```bash
  git push origin master
  ```

- [ ] **Step 2: Conectar Vercel**

  - Ve a https://vercel.com → "Add New Project"
  - Importa el repo `jeffrey94lopez/academia-bold-v1`
  - Framework Preset: **Other**
  - Root Directory: dejar vacío (raíz del repo)
  - Haz clic en **Deploy**

- [ ] **Step 3: Verificar deploy**

  - Vercel te da una URL tipo `academia-bold-v1.vercel.app`
  - Abre la URL y verifica que las 3 secciones cargan correctamente
  - Verifica que el Asistente IA responde
  - Verifica que las lecciones y glosario aparecen con los datos de Supabase

- [ ] **Step 4: Deploy automático configurado**

  Desde este punto, cada `git push origin master` despliega automáticamente.

---

## Resumen de orden de ejecución

1. Task 1 — Supabase setup (manual, ~20 min)
2. Task 2 — Estructura base y archivos JS/CSS
3. Task 3 — Shell `index.html`
4. Task 4 — Asistente IA
5. Task 5 — Lecciones
6. Task 6 — Recursos
7. Task 7 — Admin login
8. Task 8 — Admin CRUD
9. Task 9 — Deploy Vercel
