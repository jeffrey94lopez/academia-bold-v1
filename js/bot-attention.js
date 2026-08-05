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

// Lista priorizada de categorías con problema. Reemplaza el uso disperso
// (pickContentToReinforce + negCat) por un solo ranking.
export function rankAttention(byCategory, gaps, {
  minVolume = 3, maxResolvedPct = 50, minNegativePct = 30, minSupportPct = 40, limit = 4,
} = {}) {
  const gapByCat = new Map((gaps || []).filter(g => g.has_lesson === false).map(g => [g.category, g]))
  const items = []
  for (const c of byCategory || []) {
    if ((c.total ?? 0) < minVolume) continue
    let it = null
    if (gapByCat.has(c.category)) {
      it = { problem: 'contenido-faltante', action: 'crear', detail: `${gapByCat.get(c.category).total} sin lección`, score: (c.total ?? 0) * 2 }
    } else if (c.resolved_pct != null && c.resolved_pct < maxResolvedPct) {
      it = { problem: 'baja-resolucion', action: 'revisar', detail: `${c.resolved_pct}% resolución`, score: c.total, extraStatus: 'no_resuelta' }
    } else if ((c.negative_pct ?? 0) >= minNegativePct) {
      it = { problem: 'negativo', action: 'revisar', detail: `${c.negative_pct}% negativo`, score: c.total }
    } else if ((c.support_pct ?? 0) >= minSupportPct) {
      it = { problem: 'escala', action: 'reforzar', detail: `${c.support_pct}% a soporte`, score: c.total }
    }
    if (it) items.push({ category: c.category, ...it })
  }
  return items.sort((a, b) => b.score - a.score).slice(0, limit)
}
