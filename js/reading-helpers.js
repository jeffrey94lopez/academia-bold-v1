// Lógica pura de la telemetría de lectura: profundidad de scroll y regla de
// "lectura completa". Sin DOM ni supabase → testeable en Node.

export function scrollPct(scrollTop, clientHeight, scrollHeight) {
  // Si el contenido cabe sin scroll, se considera visto por completo.
  if (!scrollHeight || scrollHeight <= clientHeight) return 100
  const pct = Math.round((scrollTop + clientHeight) / scrollHeight * 100)
  return Math.max(0, Math.min(100, pct))
}

export function isRead({ maxScrollPct, dwellMs } = {}, { minScrollPct = 90, minDwellMs = 5000 } = {}) {
  return (maxScrollPct ?? 0) >= minScrollPct && (dwellMs ?? 0) >= minDwellMs
}
