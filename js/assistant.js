import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js'
import { escapeHtml, getYouTubeId } from './utils.js'
import { renderMarkdown } from './markdown.js'
import { storageGet, storageSet, storageRemove } from './storage.js'
import { typewrite, skipActiveTypewriter } from './typewriter.js'
import { isNearBottom } from './reload-policy.js'
import { getSeleccion } from './vertical.js'
import { nextClarifyCount, chatRequestBody, shouldAskResolution } from './clarify.js'
import { inactivitySettings, isStaleConversation } from './inactivity.js'

const N8N_URL     = '/api/chat'

const FALLBACK_CHIPS = [
  '¿Cómo proceso un pago?',
  '¿Qué es el datafono Bold?',
  '¿Cómo hago un reembolso?',
  '¿Cómo configuro mi cuenta?',
]

let cachedFaqs = []

export async function loadFaqContext() {
  try {
    const { data } = await supabase
      .from('preguntas_frecuentes')
      .select('pregunta, respuesta')
      .order('orden')
      .order('created_at')
    cachedFaqs = data || []
  } catch (_) {
    cachedFaqs = []
  }
}

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

// Toggles administrados desde el admin (claves en app_settings). Convención
// del proyecto: clave ausente o error ⇒ activado (comportamiento histórico).
let chipSettings = { inicio: true, tras_respuesta: true }

export async function loadChipSettings() {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['chips_inicio', 'chips_tras_respuesta'])
    if (error) return
    const map = Object.fromEntries((data || []).map(r => [r.key, r.value]))
    chipSettings = {
      inicio:         map.chips_inicio         !== 'false',
      tras_respuesta: map.chips_tras_respuesta !== 'false',
    }
  } catch (_) { /* mantener valores actuales */ }
}

export async function loadInactivitySettings() {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['inactividad_aviso_min', 'inactividad_cierre_min'])
    if (error) return
    inactivity = inactivitySettings(data)
    // Si el admin acaba de apagar el aviso, matar el temporizador ya armado:
    // si no, el aviso pendiente igual saldría una última vez.
    if (!inactivity.avisoMs) { clearIdleTimer(); return }
    // Si el retraso cambió con un temporizador ya armado, hay que rearmarlo: el
    // setTimeout viejo sigue gobernando (subir 5→60 dispararía a los 5 min y
    // quemaría el aviso único; bajar 60→5 no aplicaría hasta el próximo turno).
    // Camino arm-only a propósito: acá no hubo escritura, así que la marca NO
    // se toca.
    if (idleTimer && !idleNudged) armIdleTimer()
  } catch (_) { /* mantener los defaults */ }
}

// Re-dibuja los chips de sugerencias (visibles también con conversación en
// curso: reaparecen después de cada respuesta del bot).
export async function rerenderChips() {
  const wrap = document.getElementById('quickQueries')
  if (!wrap) return
  const chips = await loadChips()
  wrap.innerHTML = chips.map(q => `
    <button class="quick-query w-full md:w-auto shrink-0 text-xs font-bold px-3 py-2 md:py-1.5 rounded-full border border-[var(--blue-20)] hover:border-[var(--blue-100)] transition-colors whitespace-normal md:whitespace-nowrap">${escapeHtml(q)}</button>
  `).join('')
  wrap.querySelectorAll('.quick-query').forEach(btn => {
    btn.addEventListener('click', () => sendMessage(btn.textContent))
  })
}

let history = []
try { history = JSON.parse(storageGet('bold_chat_history') || '[]') } catch { history = [] }
let conversationId  = null
let _creating       = false
let sessionMessages = []
let clarifyCount    = 0   // indagaciones seguidas del bot en esta sesión (tope 2, ver clarify.js)
let followScroll  = true   // el usuario está al fondo → el scroll acompaña
let skipAll       = false  // "Mostrar todo": revela el resto sin animar
let sending       = false  // evita envíos concurrentes que se pisarían la animación

// Rescate por inactividad (sub-proyecto B). El navegador solo AVISA; el cierre
// lo hace el barrido de pg_cron. Cerrar en cliente fragmentaría una duda real
// en varias filas (al cerrar, el próximo mensaje crea conversación nueva).
let inactivity     = { avisoMs: 5 * 60000, cierreMs: 30 * 60000 }
let lastActivityMs = 0
let idleTimer      = null
let idleNudged     = false   // el aviso sale UNA vez por conversación

async function createConversation() {
  if (_creating) return
  _creating = true
  const sessionId = storageGet('bold_session_id') || crypto.randomUUID()
  storageSet('bold_session_id', sessionId)
  const id = crypto.randomUUID()
  try {
    const { error } = await supabase
      .from('bodi_conversations')
      .insert({ id, session_id: sessionId, messages: [], status: 'active' })
    if (error) throw new Error(error.message)
    conversationId = id
    // El INSERT deja last_activity_at con el default now() de la columna: hay que
    // espejarlo YA. Si quedara en 0, isStaleConversation devolvería false y el
    // guardia estaría ciego durante todo el primer intercambio (y si el fetch al
    // bot falla, el reintento posterior escribiría sobre una fila ya abandonada).
    lastActivityMs = Date.now()
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
          'x-student-id': storageGet('bold_session_id') || ''
        },
        body: JSON.stringify(patch)
      }
    )
  } catch (_) {}
}

async function resolveConversation(resolved, btnsEl) {
  skipAll = false // los mensajes de cierre son cortos: animarlos aunque el usuario haya saltado la respuesta anterior
  btnsEl.remove()
  await appendBotAnimated(resolved
    ? '¡Me alegra haber podido ayudarte! Escríbeme cuando tengas otra duda.'
    : 'Entendido. Para una ayuda más detallada puedes contactar a [Soporte Bold POS](https://api.whatsapp.com/send?phone=573171109500&text=Hola%20,%20necesito%20su%20ayuda%20en%20Bold%20POS.).')
  const nowIso = new Date().toISOString()
  await upsertConversation({ resolved, status: 'completed', ended_at: nowIso, last_activity_at: nowIso })
  clearIdleTimer()
  removeIdleNotice()
  conversationId  = null
  sessionMessages = []
  idleNudged      = false
}

// ── Render ────────────────────────────────────────────────────────────────────

async function renderAssistant() {
  const [chips] = await Promise.all([loadChips(), loadChipSettings(), loadInactivitySettings()])
  const container = document.getElementById('section-assistant')
  container.innerHTML = `
    <div class="flex flex-col h-full relative">
      <!-- Chat header -->
      <div class="px-4 py-3 border-b border-[var(--blue-10)] flex items-center justify-between shrink-0">
        <div class="flex items-center">
          <img src="assets/bolbot%20pos%20light.png" alt="bolbot POS" class="h-9 w-auto" />
        </div>
        <div class="flex items-center gap-3">
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

      <!-- Quick queries: en móvil apiladas en vertical (scroll interno sin barra
           visible si son muchas); en desktop fila horizontal. Reaparecen después
           de cada respuesta del bot. -->
      <div id="quickQueries" class="${chipSettings.inicio ? '' : 'hidden '}px-4 pb-2 flex flex-col md:flex-row gap-2 max-h-44 md:max-h-none overflow-y-auto md:overflow-x-auto no-scrollbar shrink-0">
        ${chips.map(q => `
          <button class="quick-query w-full md:w-auto shrink-0 text-xs font-bold px-3 py-2 md:py-1.5 rounded-full border border-[var(--blue-20)] hover:border-[var(--blue-100)] transition-colors whitespace-normal md:whitespace-nowrap">${escapeHtml(q)}</button>
        `).join('')}
      </div>

      <!-- Input -->
      <div class="px-4 py-3 border-t border-[var(--blue-10)] shrink-0">
        <div class="flex gap-2 items-end">
          <!-- En móvil: texto 16px (evita el zoom de iOS) y más alto; en desktop igual que antes -->
          <textarea
            id="chatInput"
            rows="1"
            placeholder="Escribe tu pregunta sobre Bold POS..."
            class="flex-1 resize-none bg-[var(--background-page)] px-4 py-3 md:py-2.5 text-base md:text-sm max-h-40 overflow-y-auto no-scrollbar"
          ></textarea>
          <button id="sendBtn" class="w-12 h-12 md:w-10 md:h-10 flex items-center justify-center shrink-0 hover:scale-105 transition-transform">
            <i data-lucide="send" class="w-5 h-5 md:w-4 md:h-4 text-white"></i>
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

function scrollToBottom() {
  const box = document.getElementById('chatMessages')
  if (box) box.scrollTop = box.scrollHeight
}

function onTypeTick() {
  if (followScroll) scrollToBottom()
}

function scrollToMessageTop(el) {
  const box = document.getElementById('chatMessages')
  box.scrollTop = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 8
}

function showSkipButton() {
  if (document.getElementById('twSkipBtn')) return
  const btn = document.createElement('button')
  btn.id = 'twSkipBtn'
  btn.textContent = 'Mostrar todo ↓'
  btn.style.cssText = 'position:absolute;bottom:88px;right:16px;z-index:20;background:var(--blue-100);color:#fff;font-size:11px;font-weight:700;padding:6px 12px;border-radius:9999px;box-shadow:0 2px 8px rgba(0,0,0,.18);font-family:var(--font-family);'
  btn.onclick = () => { skipAll = true; skipActiveTypewriter() }
  document.getElementById('section-assistant').firstElementChild.appendChild(btn)
}

function hideSkipButton() {
  document.getElementById('twSkipBtn')?.remove()
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
      d.innerHTML = `<img src="${safeUrl}" alt="${safeAlt}" class="chat-img" data-lightbox="${safeUrl}" data-caption="${safeAlt}" title="Clic para ampliar">
        ${safeAlt ? `<p class="text-[10px] text-[var(--black-60)] mt-1 italic">${safeAlt}</p>` : ''}`
      wrap.appendChild(d)
    } else if (item.type === 'video' && item.url) {
      const videoId = getYouTubeId(item.url)
      if (!videoId) {
        const d = document.createElement('div')
        d.className = 'my-2'
        d.innerHTML = `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="chat-link-btn">▶ ${escapeHtml(item.label || 'Ver video')}</a>`
        wrap.appendChild(d)
        return
      }
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

async function appendSegments(segments) {
  const box = document.getElementById('chatMessages')
  if (!box || !Array.isArray(segments)) return
  segments = normalizeSegments(segments)
  let textBuffer = []

  async function flushText() {
    if (!textBuffer.length) return
    const content = textBuffer.join('\n\n')
    textBuffer = []
    await appendBotAnimated(content)
  }

  for (const seg of segments) {
    if (seg.type === 'text' && seg.content) {
      textBuffer.push(seg.content)
    } else if (seg.type === 'image' && seg.url) {
      await flushText()
      const imgEl = document.createElement('img')
      imgEl.src = seg.url
      imgEl.alt = seg.caption || ''
      imgEl.title = 'Clic para ampliar'
      imgEl.style.cssText = 'display:block;max-width:100%;max-height:220px;width:auto;border-radius:12px;cursor:zoom-in;border:1px solid var(--blue-20);margin-top:6px;'
      imgEl.addEventListener('click', () => window.openLightbox(imgEl.src, imgEl.alt))
      imgEl.addEventListener('load', scrollToBottom)
      const d = document.createElement('div')
      d.style.cssText = 'margin:8px 0;'
      d.appendChild(imgEl)
      if (seg.caption) {
        const cap = document.createElement('p')
        cap.textContent = seg.caption
        cap.style.cssText = 'font-size:10px;color:var(--black-60);margin-top:4px;font-style:italic;font-family:var(--font-family);'
        d.appendChild(cap)
      }
      box.appendChild(d)
      if (!skipAll) {
        d.style.visibility = 'hidden'
        await new Promise(r => setTimeout(r, 150))
        d.style.visibility = ''
      }
      onTypeTick()
    } else if (seg.type === 'video' && seg.url) {
      await flushText()
      const videoId = getYouTubeId(seg.url)
      // Sin ID extraíble (no es YouTube o formato raro): botón al video en
      // lugar de omitirlo en silencio.
      if (!videoId) {
        const wrap = document.createElement('div')
        wrap.className = 'flex justify-start'
        wrap.innerHTML = `<div class="my-2"><a href="${escapeHtml(seg.url)}" target="_blank" rel="noopener noreferrer" class="chat-link-btn">▶ ${escapeHtml(seg.label || 'Ver video')}</a></div>`
        box.appendChild(wrap)
        if (!skipAll) {
          wrap.style.visibility = 'hidden'
          await new Promise(r => setTimeout(r, 150))
          wrap.style.visibility = ''
        }
        onTypeTick()
      } else {
        const iframe = document.createElement('iframe')
        iframe.src = `https://www.youtube.com/embed/${videoId}`
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
        iframe.allowFullscreen = true
        iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none;'
        const videoWrap = document.createElement('div')
        videoWrap.style.cssText = 'position:relative;height:220px;width:min(390px,100%);border-radius:12px;overflow:hidden;margin-top:6px;'
        videoWrap.appendChild(iframe)
        const d = document.createElement('div')
        d.style.cssText = 'margin:8px 0;'
        if (seg.label) {
          const lbl = document.createElement('p')
          lbl.textContent = seg.label
          lbl.style.cssText = 'font-size:12px;font-weight:700;margin-bottom:6px;font-family:var(--font-family);'
          d.appendChild(lbl)
        }
        d.appendChild(videoWrap)
        box.appendChild(d)
        if (!skipAll) {
          d.style.visibility = 'hidden'
          await new Promise(r => setTimeout(r, 150))
          d.style.visibility = ''
        }
        onTypeTick()
      }
    } else if (seg.type === 'link' && seg.url) {
      await flushText()
      // Los links de WhatsApp de soporte se muestran solo como el botón verde
      // de appendSupportCTA (evita duplicar CTA rojo + verde en la escalación).
      if (/api\.whatsapp\.com|wa\.me\//i.test(seg.url)) { appendSupportCTA(); continue }
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
      if (!skipAll) {
        wrap.style.visibility = 'hidden'
        await new Promise(r => setTimeout(r, 150))
        wrap.style.visibility = ''
      }
      onTypeTick()
    }
  }
  await flushText()
}

function appendSupportCTA() {
  const box = document.getElementById('chatMessages')
  if (!box) return
  document.querySelectorAll('.support-cta').forEach(el => el.remove())
  const cta = document.createElement('div')
  cta.className = 'support-cta px-1 pb-1'
  cta.innerHTML = `
    <div class="flex justify-start"><a href="https://api.whatsapp.com/send?phone=573171109500&text=Hola%20,%20necesito%20su%20ayuda%20en%20Bold%20POS."
       target="_blank" rel="noopener noreferrer"
       class="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold text-white shadow-sm"
       style="background:#25d366;">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.122 1.532 5.857L0 24l6.335-1.51A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.793 9.793 0 01-5.012-1.374l-.36-.213-3.732.889.936-3.623-.234-.372A9.775 9.775 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/></svg>
      Hablar con Soporte Bold POS
    </a></div>
    <p class="text-xs text-[var(--black-60)] mt-2">¿Hay algo más en que pueda ayudarte? Escríbeme y con gusto te sigo apoyando 👍</p>`
  box.appendChild(cta)
  if (followScroll) scrollToBottom()
}

// ── Rescate por inactividad ──────────────────────────────────────────────────

function clearIdleTimer() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
}

function removeIdleNotice() {
  document.querySelectorAll('.idle-notice').forEach(el => el.remove())
}

// Arma (o rearma) el temporizador del aviso SIN tocar la marca de actividad.
// Es el camino que hay que usar cuando debe correr un temporizador pero NO hubo
// escritura de last_activity_at (error de red, cambio de settings en caliente):
// adelantar la marca sin escritura dejaría el espejo por delante de la columna y
// el guardia de envío mediría de menos el hueco.
function armIdleTimer() {
  clearIdleTimer()
  if (!inactivity.avisoMs || idleNudged || !conversationId) return
  idleTimer = setTimeout(appendIdleNotice, inactivity.avisoMs)
}

// Marca actividad y rearma el temporizador.
// INVARIANTE: lastActivityMs es el espejo de la columna last_activity_at, así
// que esto solo se llama DESPUÉS de una escritura exitosa que la incluyó, y con
// el mismo instante que se escribió.
function markActivity(atMs = Date.now()) {
  lastActivityMs = atMs
  armIdleTimer()
}

// Separador de sistema. NO se persiste en messages: es UI, no conversación —
// si se guardara contaminaría el historial que se le manda al LLM.
function appendIdleNotice() {
  const box = document.getElementById('chatMessages')
  if (!box || sending) return   // nunca interrumpir una respuesta en curso
  removeIdleNotice()
  idleNudged = true
  const notice = document.createElement('div')
  notice.className = 'idle-notice'
  notice.innerHTML = `
    <div class="idle-divider"><span>⏱ ¿Sigues ahí?</span></div>
    <p class="idle-sub">El chat se cierra solo en un rato</p>
    <div class="idle-actions"><button class="idle-still-here">Sí, sigo aquí</button></div>`
  // El pill EXTIENDE la conversación de verdad; no es solo un "descartar aviso".
  // Si solo quitara el aviso y adelantara la marca, el espejo quedaría por
  // delante de last_activity_at y el próximo mensaje se pegaría encima de una
  // fila que el barrido ya cerró (abandoned con ended_at viejo y mensajes nuevos).
  notice.querySelector('.idle-still-here').onclick = async () => {
    removeIdleNotice()
    if (!conversationId) { clearIdleTimer(); return }
    if (isStaleConversation(lastActivityMs, Date.now(), inactivity.cierreMs)) {
      // Ya venció al momento del clic: el barrido probablemente la cerró. No le
      // escribimos encima; soltamos la fila para que el próximo mensaje abra una
      // nueva. Mismo reset que hace el guardia de sendMessage.
      clearIdleTimer()
      conversationId  = null
      sessionMessages = []
      idleNudged      = false
      return
    }
    // Persistir la extensión y SOLO ENTONCES avanzar el espejo, con el mismo
    // instante que se escribió. (upsertConversation se come los errores: poner
    // la marca después del await es la mejor garantía disponible acá.)
    const nowIso = new Date().toISOString()
    await upsertConversation({ last_activity_at: nowIso })
    markActivity(Date.parse(nowIso))
  }
  box.appendChild(notice)
  if (followScroll) scrollToBottom()
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
  if (followScroll) scrollToBottom()
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

window.openLightbox = function(url, caption = '') {
  let lb = document.getElementById('chatImgLightbox')
  if (!lb) {
    lb = document.createElement('div')
    lb.id = 'chatImgLightbox'
    document.body.appendChild(lb)
  }
  const safeUrl = escapeHtml(url)
  lb.innerHTML = `
    <div id="lb-backdrop"></div>
    <div id="lb-content">
      <img src="${safeUrl}" alt="${escapeHtml(caption)}">
      ${caption ? `<p id="lb-caption">${escapeHtml(caption)}</p>` : ''}
      <div id="lb-actions">
        <a id="lb-open" href="${safeUrl}" target="_blank" rel="noopener noreferrer">↗ Abrir en nueva pestaña</a>
        <button id="lb-close">✕ Cerrar</button>
      </div>
    </div>`
  lb.classList.add('open')
  lb.querySelector('#lb-backdrop').onclick = () => lb.classList.remove('open')
  lb.querySelector('#lb-close').onclick    = () => lb.classList.remove('open')
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { lb.classList.remove('open'); document.removeEventListener('keydown', esc) }
  })
}

// ── Events ────────────────────────────────────────────────────────────────────

function bindAssistantEvents() {
  const input    = document.getElementById('chatInput')
  const sendBtn  = document.getElementById('sendBtn')
  const clearBtn   = document.getElementById('clearChat')

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
    skipActiveTypewriter()
    hideSkipButton()
    storageRemove('bold_chat_history')
    conversationId  = null
    sessionMessages = []
    history         = []
    clarifyCount    = 0
    // Limpiar el chat también termina la conversación actual: igual que en
    // resolveConversation, hay que apagar el rescate por inactividad para no
    // arrastrar un timer/aviso de la conversación que se acaba de borrar.
    clearIdleTimer()
    removeIdleNotice()
    idleNudged      = false
    lastActivityMs  = 0
    renderAssistant()
  })

  document.querySelectorAll('.quick-query').forEach(btn => {
    btn.addEventListener('click', () => sendMessage(btn.textContent))
  })

  const box = document.getElementById('chatMessages')
  box.addEventListener('scroll', () => { followScroll = isNearBottom(box) })
  box.addEventListener('click', e => {
    if (e.target.closest('.tw-running')) { skipAll = true; skipActiveTypewriter() }
    // Lightbox por delegación: las imágenes marcan data-lightbox en vez de un
    // onclick inline (la CSP bloquea los manejadores inline).
    const img = e.target.closest('[data-lightbox]')
    if (img) window.openLightbox(img.dataset.lightbox, img.dataset.caption || '')
  })
}

// ── Send message ──────────────────────────────────────────────────────────────

async function sendMessage(text) {
  if (!text || sending) return
  sending = true

  try {

  // Si el hueco de inactividad superó el umbral de cierre, el barrido pudo
  // haber marcado esta conversación como abandonada: no le escribimos encima
  // (la resucitaría con mensajes nuevos y el dato quedaría mentiroso).
  if (conversationId && isStaleConversation(lastActivityMs, Date.now(), inactivity.cierreMs)) {
    conversationId  = null
    sessionMessages = []
    idleNudged      = false
  }
  clearIdleTimer()
  removeIdleNotice()

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
      body: JSON.stringify(chatRequestBody({
        message: text, history, faqContext: cachedFaqs,
        clarifyCount, seleccion: getSeleccion(),
      }))
    })
    const data = await res.json()
    typing.classList.add('hidden')

    const reply = data.response || 'No pude procesar tu pregunta. Intenta de nuevo.'
    let segments = data.segments?.length ? data.segments : null
    // If no segments but reply contains [IMAGEN]/[VIDEO] markers, synthesize segments
    if (!segments && /\[(IMAGEN|VIDEO|LINK)\s+url=/.test(reply)) {
      segments = [{ type: 'text', content: reply }]
    }
    skipAll = false
    showSkipButton()
    let firstBubbleEl = null
    const box = document.getElementById('chatMessages')
    const markFirst = () => { if (!firstBubbleEl) { firstBubbleEl = box.lastElementChild; scrollToMessageTop(firstBubbleEl); followScroll = isNearBottom(box) } }

    if (segments) {
      const observer = new MutationObserver(() => { markFirst(); observer.disconnect() })
      observer.observe(box, { childList: true })
      try { await appendSegments(segments) } finally { observer.disconnect() }
    } else {
      const p = appendBotAnimated(reply)
      markFirst()
      await p
      if (data.media?.length) appendMedia(data.media)
    }
    hideSkipButton()
    if (data.support_redirected) appendSupportCTA()
    // El botón "¿Logré resolver tu duda?" solo cuando hubo respuesta real:
    // no en repreguntas ni tras derivar a soporte (que trae su propio mensaje).
    if (shouldAskResolution(data)) appendResolutionButtons()
    // Las sugerencias vuelven a aparecer después de cada respuesta del bot
    // solo si el toggle del admin lo permite
    if (chipSettings.tras_respuesta) document.getElementById('quickQueries')?.classList.remove('hidden')

    history.push({ role: 'assistant', content: reply })
    storageSet('bold_chat_history', JSON.stringify(history.slice(-20)))
    sessionMessages.push({ role: 'user', content: text })
    sessionMessages.push({ role: 'assistant', content: reply })
    clarifyCount = nextClarifyCount(clarifyCount, data)

    const nowIso = new Date().toISOString()
    await upsertConversation({
      messages: sessionMessages,
      topic: data.topic || null,
      sentiment: data.sentiment ?? 'neutro',
      support_redirected: data.support_redirected || false,
      lessons_used: data.lessons_used || [],
      bot_no_info: data.knowledge_gap || false,
      bot_asked_clarification: data.asked_clarification || false,
      last_activity_at: nowIso,
    })
    markActivity(Date.parse(nowIso))
  } catch {
    typing.classList.add('hidden')
    hideSkipButton()
    appendBubble('bot', 'Error de conexión. Verifica tu internet e intenta de nuevo.')
    if (chipSettings.tras_respuesta) document.getElementById('quickQueries')?.classList.remove('hidden')
    scrollToBottom()
    // Rearmar el aviso: si no, tras un error de red no saldría ningún aviso hasta
    // el próximo envío exitoso. Arm-only obligatorio: el PATCH no ocurrió, así que
    // la marca no puede avanzar (avanzarla fabricaría una ventana de resurrección).
    armIdleTimer()
  }

  } finally {
    sending = false
  }
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

// Crea la burbuja del bot con el HTML completo y la anima (o la muestra
// entera si el usuario ya pidió "Mostrar todo" en esta respuesta).
async function appendBotAnimated(content) {
  const box = document.getElementById('chatMessages')
  const div = document.createElement('div')
  div.className = 'flex justify-start'
  const wide = hasMedia(content)
  div.innerHTML = `<div class="${wide ? 'msg-bot-wide' : 'msg-bot'} text-sm">${renderMarkdown(content)}</div>`
  box.appendChild(div)
  if (!skipAll) await typewrite(div.firstElementChild, { onTick: onTypeTick })
  return div
}

loadFaqContext()
renderAssistant().catch(err => console.error('[bolbot POS] Failed to render assistant:', err))
