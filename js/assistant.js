import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js'
import { escapeHtml } from './utils.js'

const N8N_URL     = '/api/chat'
const ABANDON_URL = 'https://n8n.mplasesores.com/webhook/bodi-abandon'

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

let history         = JSON.parse(localStorage.getItem('bold_chat_history') || '[]')
let conversationId  = null
let _creating       = false
let sessionMessages = []

async function createConversation() {
  if (_creating) return
  _creating = true
  const sessionId = localStorage.getItem('bold_session_id') || crypto.randomUUID()
  localStorage.setItem('bold_session_id', sessionId)
  const id = crypto.randomUUID()
  try {
    const { error } = await supabase
      .from('bodi_conversations')
      .insert({ id, session_id: sessionId, messages: [], status: 'active' })
    if (error) throw new Error(error.message)
    conversationId = id
  } catch (e) {
    console.warn('[bolbot POS] createConversation failed:', e.message)
    conversationId = null
  } finally {
    _creating = false
  }
}

async function upsertConversation(patch) {
  if (!conversationId) return
  try {
    await fetch(
      `${SUPABASE_URL}/rest/v1/bodi_conversations?id=eq.${conversationId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Prefer': 'return=minimal',
          'x-student-id': localStorage.getItem('bold_session_id') || ''
        },
        body: JSON.stringify(patch)
      }
    )
  } catch (_) {}
}

async function resolveConversation(resolved, btnsEl) {
  btnsEl.remove()
  appendBubble('bot', resolved
    ? '¡Me alegra haber podido ayudarte! Escríbeme cuando tengas otra duda.'
    : 'Entendido. Para una ayuda más detallada puedes contactar a [Soporte Bold POS](https://api.whatsapp.com/send?phone=573171109500&text=Hola%20,%20necesito%20su%20ayuda%20en%20Bold%20POS.).')
  await upsertConversation({ resolved, status: 'completed', ended_at: new Date().toISOString() })
  conversationId  = null
  sessionMessages = []
}

window.addEventListener('beforeunload', () => {
  if (!conversationId) return
  navigator.sendBeacon(ABANDON_URL, new Blob([JSON.stringify({ conversationId })], { type: 'application/json' }))
})

// ── Render ────────────────────────────────────────────────────────────────────

async function renderAssistant() {
  const chips = await loadChips()
  const container = document.getElementById('section-assistant')
  container.innerHTML = `
    <div class="flex flex-col h-full">
      <!-- Chat header -->
      <div class="px-4 py-3 border-b border-[var(--blue-10)] flex items-center justify-between shrink-0">
        <div class="flex items-center">
          <img src="assets/bolbot%20pos%20light.png" alt="bolbot POS" class="h-9 w-auto" />
        </div>
        <button id="clearChat" class="text-xs text-[var(--black-60)] hover:text-[var(--blue-100)] font-bold flex items-center gap-1">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Limpiar
        </button>
      </div>

      <!-- Messages -->
      <div id="chatMessages" class="flex-1 overflow-y-auto custom-scroll p-4 flex flex-col gap-3">
        ${history.length === 0 ? `
          <div class="flex justify-start">
            <div class="msg-bot text-sm">¡Hola! Soy bolbot POS, el asistente virtual de Bold POS 👋 Estoy aquí para ayudarte con cualquier duda sobre la plataforma. ¿En qué te puedo ayudar hoy?</div>
          </div>
        ` : history.map(m => renderBubble(m.role, m.content)).join('')}
      </div>

      <!-- Typing indicator -->
      <div id="typingIndicator" class="hidden px-4 pb-2">
        <div class="flex items-center gap-1.5 bg-[var(--background-page)] rounded-2xl px-4 py-3 w-fit">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
        </div>
      </div>

      <!-- Quick queries -->
      <div id="quickQueries" class="px-4 pb-2 flex gap-2 overflow-x-auto shrink-0 ${history.length > 0 ? 'hidden' : ''}">
        ${chips.map(q => `
          <button class="quick-query shrink-0 text-xs font-bold px-3 py-1.5 rounded-full border border-[var(--blue-20)] hover:border-[var(--blue-100)] transition-colors whitespace-nowrap">${escapeHtml(q)}</button>
        `).join('')}
      </div>

      <!-- Input -->
      <div class="px-4 py-3 border-t border-[var(--blue-10)] shrink-0">
        <div class="flex gap-2 items-end">
          <textarea
            id="chatInput"
            rows="1"
            placeholder="Escribe tu pregunta sobre Bold POS..."
            class="flex-1 resize-none bg-[var(--background-page)] px-4 py-2.5 text-sm max-h-28 overflow-y-auto"
          ></textarea>
          <button id="sendBtn" class="w-10 h-10 flex items-center justify-center shrink-0 hover:scale-105 transition-transform">
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

function hasMedia(text) {
  return /!\[[^\]]*\]\(https?:/.test(text) ||
    /\]\(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//.test(text)
}

function renderMarkdown(text) {
  if (!text) return ''

  text = text.replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, (_, alt, url) => {
    const safeAlt = escapeHtml(alt)
    const safeUrl = escapeHtml(url)
    return `<div class="my-2 text-center">
      <img src="${safeUrl}" alt="${safeAlt}" class="chat-img" onclick="openLightbox('${safeUrl}')" title="Clic para ampliar">
      ${safeAlt ? `<p class="text-[10px] text-[var(--black-60)] mt-1 italic">${safeAlt}</p>` : ''}
    </div>`
  })

  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})[^)]*)\)/g,
    (_, label, _url, videoId) => `<div class="my-2">
      <p class="text-xs font-bold mb-1.5 flex items-center gap-1">▶ ${escapeHtml(label)}</p>
      <div class="chat-video-wrap"><iframe src="https://www.youtube.com/embed/${videoId}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>
    </div>`
  )

  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener" class="text-[var(--blue-100)] underline font-semibold hover:opacity-75">$1</a>')

  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/\n/g, '<br>')

  return text
}

function scrollToBottom() {
  const box = document.getElementById('chatMessages')
  if (box) box.scrollTop = box.scrollHeight
}

// ── Media y botones resolución ────────────────────────────────────────────────

function appendMedia(mediaItems) {
  const box = document.getElementById('chatMessages')
  if (!box || !mediaItems?.length) return
  const wrap = document.createElement('div')
  wrap.className = 'chat-media-block'

  mediaItems.forEach(item => {
    if (item.type === 'image' && item.url) {
      const safeUrl = escapeHtml(item.url)
      const safeAlt = escapeHtml(item.caption || '')
      const d = document.createElement('div')
      d.className = 'my-2'
      d.innerHTML = `<img src="${safeUrl}" alt="${safeAlt}" class="chat-img" onclick="openLightbox('${safeUrl}', '${safeAlt}')" title="Clic para ampliar">
        ${safeAlt ? `<p class="text-[10px] text-[var(--black-60)] mt-1 italic">${safeAlt}</p>` : ''}`
      wrap.appendChild(d)
    } else if (item.type === 'video' && item.url) {
      let videoId = null
      try {
        const u = new URL(item.url)
        if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) videoId = u.searchParams.get('v')
        else if (u.hostname === 'youtu.be') videoId = u.pathname.slice(1)
      } catch (_) {}
      if (!videoId) return
      const safeLabel = escapeHtml(item.label || '')
      const d = document.createElement('div')
      d.className = 'my-2'
      d.innerHTML = `${safeLabel ? `<p class="text-xs font-bold mb-1.5">▶ ${safeLabel}</p>` : ''}
        <div class="chat-video-wrap"><iframe src="https://www.youtube.com/embed/${videoId}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`
      wrap.appendChild(d)
    }
  })

  if (wrap.children.length) {
    box.appendChild(wrap)
    scrollToBottom()
  }
}

function normalizeSegments(segments) {
  const out = []
  for (const seg of segments) {
    const prev = out[out.length - 1]
    const isMedia = seg.type === 'image' || seg.type === 'video'
    const prevIsMedia = prev && (prev.type === 'image' || prev.type === 'video')
    if (isMedia && prevIsMedia) continue
    out.push(seg)
  }
  return out
}

function appendSegments(segments) {
  const box = document.getElementById('chatMessages')
  if (!box || !Array.isArray(segments)) return
  segments = normalizeSegments(segments)
  let textBuffer = []
  let hadText = false

  function flushText() {
    if (!textBuffer.length) return
    const content = textBuffer.join('\n\n')
    const div = document.createElement('div')
    div.className = 'flex justify-start'
    div.innerHTML = `<div class="msg-bot text-sm">${renderMarkdown(content)}</div>`
    box.appendChild(div)
    textBuffer = []
    scrollToBottom()
  }

  for (const seg of segments) {
    if (seg.type === 'text' && seg.content) {
      hadText = true
      textBuffer.push(seg.content)
    } else if (seg.type === 'image' && seg.url) {
      if (!hadText) continue
      flushText()
      const safeUrl = escapeHtml(seg.url)
      const safeAlt = escapeHtml(seg.caption || '')
      const d = document.createElement('div')
      d.className = 'chat-media-block'
      d.innerHTML = `<img src="${safeUrl}" alt="${safeAlt}" class="chat-img" onclick="openLightbox('${safeUrl}', '${safeAlt}')" title="Clic para ampliar">
        ${safeAlt ? `<p class="text-[10px] text-[var(--black-60)] mt-1 italic">${safeAlt}</p>` : ''}`
      box.appendChild(d)
      scrollToBottom()
    } else if (seg.type === 'video' && seg.url) {
      if (!hadText) continue
      flushText()
      let videoId = null
      try {
        const u = new URL(seg.url)
        if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) videoId = u.searchParams.get('v')
        else if (u.hostname === 'youtu.be') videoId = u.pathname.slice(1)
      } catch (_) {}
      if (videoId) {
        const safeLabel = escapeHtml(seg.label || '')
        const d = document.createElement('div')
        d.className = 'chat-media-block'
        d.innerHTML = `${safeLabel ? `<p class="text-xs font-bold mb-1.5">▶ ${safeLabel}</p>` : ''}
          <div class="chat-video-wrap"><iframe src="https://www.youtube.com/embed/${videoId}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`
        box.appendChild(d)
        scrollToBottom()
      }
    }
  }
  flushText()
}

function appendResolutionButtons() {
  const box = document.getElementById('chatMessages')
  if (!box) return
  document.querySelectorAll('.resolution-btns').forEach(el => el.remove())
  const btns = document.createElement('div')
  btns.className = 'resolution-btns'
  btns.innerHTML = `
    <span class="resolution-label">¿Logré resolver tu duda?</span>
    <button class="res-btn res-yes">✓ Sí</button>
    <button class="res-btn res-no">✗ No</button>
  `
  btns.querySelector('.res-yes').onclick = () => resolveConversation(true, btns)
  btns.querySelector('.res-no').onclick  = () => resolveConversation(false, btns)
  box.appendChild(btns)
  scrollToBottom()
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

window.openLightbox = function(url, caption = '') {
  let lb = document.getElementById('chatImgLightbox')
  if (!lb) {
    lb = document.createElement('div')
    lb.id = 'chatImgLightbox'
    document.body.appendChild(lb)
  }
  lb.innerHTML = `
    <div id="lb-backdrop"></div>
    <div id="lb-content">
      <img src="${url}" alt="${escapeHtml(caption)}">
      ${caption ? `<p id="lb-caption">${escapeHtml(caption)}</p>` : ''}
      <div id="lb-actions">
        <button id="lb-download">⬇ Descargar</button>
        <button id="lb-close">✕ Cerrar</button>
      </div>
    </div>`
  lb.classList.add('open')
  lb.querySelector('#lb-backdrop').onclick = () => lb.classList.remove('open')
  lb.querySelector('#lb-close').onclick    = () => lb.classList.remove('open')
  lb.querySelector('#lb-download').onclick = () => downloadImage(url, caption || 'imagen')
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { lb.classList.remove('open'); document.removeEventListener('keydown', esc) }
  })
}

async function downloadImage(url, name) {
  try {
    const res  = await fetch(url)
    const blob = await res.blob()
    const ext  = blob.type.split('/')[1] || 'jpg'
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = name.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.' + ext
    a.click()
    URL.revokeObjectURL(a.href)
  } catch (_) {
    window.open(url, '_blank')
  }
}

// ── Events ────────────────────────────────────────────────────────────────────

function bindAssistantEvents() {
  const input    = document.getElementById('chatInput')
  const sendBtn  = document.getElementById('sendBtn')
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
    conversationId  = null
    sessionMessages = []
    history         = []
    renderAssistant()
  })

  document.querySelectorAll('.quick-query').forEach(btn => {
    btn.addEventListener('click', () => sendMessage(btn.textContent))
  })
}

// ── Send message ──────────────────────────────────────────────────────────────

async function sendMessage(text) {
  if (!text) return

  if (!conversationId) await createConversation()

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
    const res  = await fetch(N8N_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history })
    })
    const data = await res.json()
    typing.classList.add('hidden')

    const reply = data.response || 'No pude procesar tu pregunta. Intenta de nuevo.'
    if (data.segments?.length) {
      appendSegments(data.segments)
    } else {
      appendBubble('bot', reply)
      if (data.media?.length) appendMedia(data.media)
    }
    appendResolutionButtons()

    history.push({ role: 'assistant', content: reply })
    localStorage.setItem('bold_chat_history', JSON.stringify(history.slice(-20)))
    sessionMessages.push({ role: 'user', content: text })
    sessionMessages.push({ role: 'assistant', content: reply })

    await upsertConversation({
      messages: sessionMessages,
      topic: data.topic || null,
      sentiment: data.sentiment ?? 'neutro',
      support_redirected: data.support_redirected || false,
      lessons_used: data.lessons_used || []
    })
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

renderAssistant().catch(err => console.error('[bolbot POS] Failed to render assistant:', err))
