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
        <div class="flex items-center gap-3">
          <button id="refreshApp" class="text-xs text-[var(--black-60)] hover:text-[var(--blue-100)] font-bold flex items-center gap-1" title="Actualizar la app">
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Actualizar
          </button>
          <button id="clearChat" class="text-xs text-[var(--black-60)] hover:text-[var(--blue-100)] font-bold flex items-center gap-1">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Limpiar
          </button>
        </div>
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
  // First pass: extract [IMAGEN], [VIDEO], [LINK] markers embedded in text segments
  const extracted = []
  const markerRe = /\[(IMAGEN|VIDEO|LINK)\s+url="([^"]+)"(?:\s+(?:caption|label)="([^"]*)")?\]/g
  for (const seg of segments) {
    if (seg.type !== 'text' || !seg.content) { extracted.push(seg); continue }
    let content = seg.content
    if (!markerRe.test(content)) { extracted.push(seg); continue }
    markerRe.lastIndex = 0
    let last = 0, m
    while ((m = markerRe.exec(content)) !== null) {
      const textBefore = content.slice(last, m.index).replace(/\n+$/, '').trim()
      if (textBefore) extracted.push({ type: 'text', content: textBefore })
      const [, kind, url, extra] = m
      if (kind === 'IMAGEN') extracted.push({ type: 'image', url, caption: extra || '' })
      else if (kind === 'VIDEO') extracted.push({ type: 'video', url, label: extra || '' })
      else extracted.push({ type: 'link', url, label: extra || url })
      last = m.index + m[0].length
    }
    const textAfter = content.slice(last).replace(/^\n+/, '').trim()
    if (textAfter) extracted.push({ type: 'text', content: textAfter })
  }
  // Second pass: collapse consecutive media (no two images back-to-back)
  const out = []
  for (const seg of extracted) {
    const prev = out[out.length - 1]
    const isMedia = seg.type === 'image' || seg.type === 'video'
    const prevIsMedia = prev && (prev.type === 'image' || prev.type === 'video')
    if (isMedia && prevIsMedia) { out.push({ type: 'text', content: '' }); }
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
      flushText()
      const safeUrl = escapeHtml(seg.url)
      const safeAlt = escapeHtml(seg.caption || '')
      const wrap = document.createElement('div')
      wrap.className = 'flex justify-start'
      const d = document.createElement('div')
      d.className = 'my-2 w-full'
      d.innerHTML = `<img src="${safeUrl}" alt="${safeAlt}" class="chat-img" onclick="openLightbox('${safeUrl}', '${safeAlt}')" title="Clic para ampliar">
        ${safeAlt ? `<p class="text-[10px] text-[var(--black-60)] mt-1 italic">${safeAlt}</p>` : ''}`
      const loadedImg = d.querySelector('img')
      if (loadedImg) loadedImg.addEventListener('load', scrollToBottom)
      wrap.appendChild(d)
      box.appendChild(wrap)
      scrollToBottom()
    } else if (seg.type === 'video' && seg.url) {
      flushText()
      let videoId = null
      try {
        const u = new URL(seg.url)
        if (u.hostname.includes('youtube.com') && u.searchParams.get('v')) videoId = u.searchParams.get('v')
        else if (u.hostname === 'youtu.be') videoId = u.pathname.slice(1)
      } catch (_) {}
      if (videoId) {
        const safeLabel = escapeHtml(seg.label || '')
        const wrap = document.createElement('div')
        wrap.className = 'flex justify-start'
        const d = document.createElement('div')
        d.className = 'my-2'
        d.innerHTML = `${safeLabel ? `<p class="text-xs font-bold mb-1.5">▶ ${safeLabel}</p>` : ''}
          <div class="chat-video-wrap"><iframe src="https://www.youtube.com/embed/${videoId}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`
        wrap.appendChild(d)
        box.appendChild(wrap)
        scrollToBottom()
      }
    } else if (seg.type === 'link' && seg.url) {
      flushText()
      const safeUrl = escapeHtml(seg.url)
      const safeLabel = escapeHtml(seg.label || seg.url)
      const wrap = document.createElement('div')
      wrap.className = 'flex justify-start'
      const d = document.createElement('div')
      d.className = 'my-2'
      d.innerHTML = `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="chat-link-btn">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        ${safeLabel}
      </a>`
      wrap.appendChild(d)
      box.appendChild(wrap)
      scrollToBottom()
    }
  }
  flushText()
}

function appendSupportCTA() {
  const box = document.getElementById('chatMessages')
  if (!box) return
  document.querySelectorAll('.support-cta').forEach(el => el.remove())
  const cta = document.createElement('div')
  cta.className = 'support-cta flex justify-start px-1 pb-1'
  cta.innerHTML = `
    <a href="https://api.whatsapp.com/send?phone=573171109500&text=Hola%20,%20necesito%20su%20ayuda%20en%20Bold%20POS."
       target="_blank" rel="noopener noreferrer"
       class="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white shadow-sm"
       style="background:#25d366;">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.857L0 24l6.335-1.51A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.793 9.793 0 01-5.012-1.374l-.36-.213-3.732.889.936-3.623-.234-.372A9.775 9.775 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
      Hablar con Soporte Bold POS
    </a>`
  box.appendChild(cta)
  scrollToBottom()
}

function appendResolutionButtons() {
  const box = document.getElementById('chatMessages')
  if (!box) return
  document.querySelectorAll('.resolution-btns').forEach(el => el.remove())
  const btns = document.createElement('div')
  btns.className = 'resolution-btns'
  btns.innerHTML = `
    <p class="resolution-label">¿Logré resolver tu duda?</p>
    <div class="resolution-actions">
      <button class="res-btn res-yes">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd"/></svg>
        Sí, gracias
      </button>
      <button class="res-btn res-no">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/></svg>
        Necesito más ayuda
      </button>
    </div>
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
  const clearBtn   = document.getElementById('clearChat')
  const refreshBtn = document.getElementById('refreshApp')

  refreshBtn.addEventListener('click', () => {
    // Force reload bypassing browser cache
    window.location.href = window.location.origin + window.location.pathname + '?v=' + Date.now()
  })

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
    let segments = data.segments?.length ? data.segments : null
    // If no segments but reply contains [IMAGEN]/[VIDEO] markers, synthesize segments
    if (!segments && /\[(IMAGEN|VIDEO|LINK)\s+url=/.test(reply)) {
      segments = [{ type: 'text', content: reply }]
    }
    if (segments) {
      appendSegments(segments)
    } else {
      appendBubble('bot', reply)
      if (data.media?.length) appendMedia(data.media)
    }
    if (data.support_redirected) appendSupportCTA()
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
