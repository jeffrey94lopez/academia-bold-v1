// js/live-updates.js
// Mantiene la sesión al día: recarga ante deploys nuevos (poll a /version.json)
// y refresca contenido vía Supabase Realtime (se agrega en startRealtime).
import { computeReloadAction } from './reload-policy.js'
import { supabase } from './supabase.js'
import { loadFaqContext, rerenderChips } from './assistant.js'
import { refreshResources } from './resources.js'

const VERSION_POLL_MS = 60_000
const DEFER_CHECK_MS  = 2_000

let bootVersion   = null
let reloadPending = false

async function fetchVersion() {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()).v || null
  } catch { return null }
}

// Ocupado = respuesta del bot en curso, animación de escritura corriendo,
// o texto sin enviar en el input. Se detecta por DOM para no acoplar módulos.
function botIsBusy() {
  const typing = document.getElementById('typingIndicator')
  if (typing && !typing.classList.contains('hidden')) return true
  if (document.querySelector('.tw-running')) return true
  const input = document.getElementById('chatInput')
  if (input && input.value.trim()) return true
  return false
}

function doReload() {
  window.location.href = window.location.origin + window.location.pathname + '?v=' + Date.now()
}

function armDeferredReload() {
  if (reloadPending) return
  reloadPending = true
  const t = setInterval(() => {
    if (!botIsBusy()) { clearInterval(t); doReload() }
  }, DEFER_CHECK_MS)
}

async function startVersionWatcher() {
  bootVersion = await fetchVersion()
  setInterval(async () => {
    if (reloadPending) return
    const v = await fetchVersion()
    // Si el fetch de arranque falló (red o dev local), adoptar la primera
    // versión vista como base en lugar de quedar apagado toda la sesión.
    if (!bootVersion) { bootVersion = v; return }
    const action = computeReloadAction({ currentVersion: bootVersion, newVersion: v, busy: botIsBusy() })
    if (action === 'reload') doReload()
    else if (action === 'defer') armDeferredReload()
  }, VERSION_POLL_MS)
}

function debounce(fn, ms) {
  let t
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms) }
}

// Debounce de 1.5 s: si el admin guarda varias filas seguidas, un solo refresh.
// (`lecciones` no se suscribe aquí: lessons.js ya tiene su propio canal.)
const onFaqChange   = debounce(() => { loadFaqContext(); refreshResources().catch(() => {}) }, 1500)
const onChipsChange = debounce(() => { rerenderChips().catch(() => {}) }, 1500)

function startRealtime() {
  let retryScheduled = false // el callback de status se dispara en cada reintento fallido; reprogramar solo una vez
  const channel = supabase.channel('live-content')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'preguntas_frecuentes' }, onFaqChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_sugerencias' }, onChipsChange)
    .subscribe(status => {
      if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !retryScheduled) {
        retryScheduled = true
        console.warn('[live-updates] Realtime desconectado, reintento en 30 s')
        setTimeout(() => { supabase.removeChannel(channel); startRealtime() }, 30_000)
      }
    })
}

export function startLiveUpdates() {
  startVersionWatcher()
  startRealtime()
}
