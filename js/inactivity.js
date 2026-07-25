// Sub-proyecto B — lógica pura del rescate por inactividad del chat.
// Import-safe (sin DOM, sin timers): el temporizador y el separador viven en
// assistant.js. Acá solo vive lo que se puede testear en aislamiento.

const AVISO_MIN_DEFAULT  = 5
const CIERRE_MIN_DEFAULT = 30

// Lee los minutos de app_settings y los devuelve en ms. Convención del
// proyecto: clave ausente, vacía o no numérica ⇒ default (nunca reventar).
// El 0 es asimétrico y a propósito:
// - aviso  = 0 apaga el aviso (es el modo documentado de desactivarlo).
// - cierre = 0 es inválido: el barrido marcaría abandonada TODA conversación
//   viva, e isStaleConversation con umbral falsy devolvería false para siempre
//   (guardia del navegador apagado ⇒ resurrección garantizada). Cae al default,
//   igual que el mínimo 1 del admin y el `value::int > 0` del guardia SQL. Un
//   '0' puede llegar por fuera de la UI (editor de Supabase, SQL directo).
export function inactivitySettings(rows) {
  const map = Object.fromEntries((rows || []).map(r => [r.key, r.value]))
  const minutes = (key, fallback, ceroValido) => {
    const raw = map[key]
    if (typeof raw !== 'string' || !/^\d+$/.test(raw.trim())) return fallback
    const n = parseInt(raw.trim(), 10)
    if (n === 0 && !ceroValido) return fallback
    return n
  }
  return {
    avisoMs:  minutes('inactividad_aviso_min',  AVISO_MIN_DEFAULT,  true)  * 60000,
    cierreMs: minutes('inactividad_cierre_min', CIERRE_MIN_DEFAULT, false) * 60000,
  }
}

// true si el hueco desde la última actividad ya alcanzó el umbral de cierre:
// el cron pudo haberla marcado como abandonada, así que NO hay que escribirle
// encima (la resucitaría con mensajes nuevos). Se arranca fila nueva.
export function isStaleConversation(lastActivityMs, nowMs, cierreMs) {
  if (!lastActivityMs || !cierreMs) return false
  return (nowMs - lastActivityMs) >= cierreMs
}
