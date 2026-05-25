import { supabase } from './supabase.js'

const N8N_URL = 'https://n8n.mplasesores.com/webhook/bold-pos-chat'

const FALLBACK_CHIPS = [
  '¿Cómo proceso un pago?',
  '¿Qué es el datafono Bold?',
  '¿Cómo hago un reembolso?',
  '¿Cómo configuro mi cuenta?',
]

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

let history = JSON.parse(localStorage.getItem('bold_chat_history') || '[]')

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

function renderBubble(role, content) {
  if (role === 'user') {
    return `<div class="flex justify-end"><div class="msg-user text-sm">${escapeHtml(content)}</div></div>`
  }
  const wide = hasMedia(content)
  return `<div class="flex justify-start"><div class="${wide ? 'msg-bot-wide' : 'msg-bot'} text-sm">${renderMarkdown(content)}</div></div>`
}

function escapeHtml(text) {
  if (!text) return ''
  return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function hasMedia(text) {
  return /!\[[^\]]*\]\(https?:/.test(text) ||
    /\]\(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//.test(text)
}

function renderMarkdown(text) {
  if (!text) return ''

  // 1. Imágenes: ![alt](url)
  text = text.replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, (_, alt, url) => {
    const safeAlt = escapeHtml(alt)
    const safeUrl = escapeHtml(url)
    return `<div class="my-2 text-center">
      <img src="${safeUrl}" alt="${safeAlt}" class="chat-img" onclick="openLightbox('${safeUrl}')" title="Clic para ampliar">
      ${safeAlt ? `<p class="text-[10px] text-slate-400 mt-1 italic">${safeAlt}</p>` : ''}
    </div>`
  })

  // 2. Videos YouTube: [texto](youtube-url)
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})[^)]*)\)/g,
    (_, label, _url, videoId) => `<div class="my-2">
      <p class="text-xs font-bold mb-1.5 flex items-center gap-1">▶ ${escapeHtml(label)}</p>
      <div class="chat-video-wrap"><iframe src="https://www.youtube.com/embed/${videoId}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>
    </div>`
  )

  // 3. Links regulares: [texto](url)
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener" class="text-[#E92129] underline font-semibold hover:opacity-75">$1</a>')

  // 4. Negritas: **texto**
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')

  // 5. Saltos de línea
  text = text.replace(/\n/g, '<br>')

  return text
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

  appendBubble('user', text)
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
  if (role === 'user') {
    div.innerHTML = `<div class="msg-user text-sm">${escapeHtml(content)}</div>`
  } else {
    const wide = hasMedia(content)
    div.innerHTML = `<div class="${wide ? 'msg-bot-wide' : 'msg-bot'} text-sm">${renderMarkdown(content)}</div>`
  }
  box.appendChild(div)
}

function openLightbox(url) {
  let lb = document.getElementById('chatImgLightbox')
  if (!lb) {
    lb = document.createElement('div')
    lb.id = 'chatImgLightbox'
    lb.onclick = () => lb.classList.remove('open')
    document.body.appendChild(lb)
  }
  lb.innerHTML = `<img src="${url}" alt="">`
  lb.classList.add('open')
}

renderAssistant()
