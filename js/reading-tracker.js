// js/reading-tracker.js
// Rastrea la lectura de la lección activa (scroll + tiempo) y emite un único
// evento 'lesson_read' al abandonarla. track y now se inyectan → testeable sin
// DOM real ni supabase. El listener de scroll se QUITA al hacer flush para no
// acumularlos al cambiar de lección (misma clase de bug que el realtime #7).
import { scrollPct, isRead } from './reading-helpers.js'

export function createReadingTracker({ track, now }) {
  let active = null // { container, meta, openedAt, maxScrollPct, onScroll }

  function readPct(container) {
    return scrollPct(container.scrollTop, container.clientHeight, container.scrollHeight)
  }

  const api = {
    start(container, meta) {
      if (active) api.flush('switch')
      const state = { container, meta, openedAt: now(), maxScrollPct: readPct(container), onScroll: null }
      state.onScroll = () => {
        const p = readPct(container)
        if (p > state.maxScrollPct) state.maxScrollPct = p
      }
      container.addEventListener('scroll', state.onScroll)
      active = state
    },
    flush(reason) {
      if (!active) return
      const dwellMs = now() - active.openedAt
      const completed = isRead({ maxScrollPct: active.maxScrollPct, dwellMs })
      active.container.removeEventListener('scroll', active.onScroll)
      track('lesson_read', {
        ...active.meta,
        max_scroll_pct: active.maxScrollPct,
        dwell_ms: dwellMs,
        completed,
      })
      active = null
    },
    isActive() { return active !== null },
  }
  return api
}
