// Lógica pura de la card "Contenido por reforzar" del dashboard BolBot.
// Import-safe en Node: sin DOM. Testeable con node:test.
//
// Elige la categoría más urgente de reforzar por falta de contenido: rankea
// by_category por no_info (señal determinista de A) y cruza con gaps
// (content_gaps) para saber si ya existe lección → crear vs reforzar.
export function pickContentToReinforce(byCategory, gaps) {
  const ranked = (byCategory || [])
    .filter(c => (c.no_info || 0) > 0)
    .sort((a, b) => (b.no_info || 0) - (a.no_info || 0))
  const top = ranked[0]
  if (!top) return null
  const gap = (gaps || []).find(g => g.category === top.category)
  const hasLesson = gap ? gap.has_lesson === true : false
  return {
    category: top.category,
    noInfo: top.no_info,
    supportPct: top.support_pct ?? 0,
    hasLesson,
    action: hasLesson ? 'reinforce' : 'create',
  }
}
