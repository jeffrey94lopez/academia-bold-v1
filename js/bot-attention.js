// Lógica pura de "Qué atender ahora" del dashboard BolBot.
// Import-safe en Node: sin DOM. Testeable con node:test.
//
// Lista priorizada de categorías con problema. Reemplaza el uso disperso
// (pickContentToReinforce + negCat) por un solo ranking.
export function rankAttention(byCategory, gaps, {
  minVolume = 3, maxResolvedPct = 50, minNoInfoPct = 30, minSupportPct = 40, limit = 4,
  exclude = ['Otro', 'Sin categoría'],
} = {}) {
  // "Otro" es el cajón de sastre del clasificador: no representa una categoría
  // real de lección, así que nunca es candidato a "contenido faltante" ni a
  // ninguna acción de la lista.
  const skip = new Set(exclude)
  const gapByCat = new Map((gaps || []).filter(g => g.has_lesson === false).map(g => [g.category, g]))
  const items = []
  for (const c of byCategory || []) {
    if (skip.has(c.category)) continue
    if ((c.total ?? 0) < minVolume) continue
    let it = null
    if (gapByCat.has(c.category)) {
      it = { problem: 'contenido-faltante', action: 'crear', detail: `${gapByCat.get(c.category).total} sin lección`, score: (c.total ?? 0) * 2 }
    } else if (c.resolved_pct != null && c.resolved_pct < maxResolvedPct) {
      it = { problem: 'baja-resolucion', action: 'revisar', detail: `${c.resolved_pct}% resolución`, score: c.total, extraStatus: 'no_resuelta' }
    } else if ((c.no_info_pct ?? 0) >= minNoInfoPct) {
      // Antes esta regla miraba negative_pct. El sentimiento resultó ser ruido
      // de LLM (ver update_analytics_bot_summary_friccion.sql), así que nunca
      // volvía a disparar. no_info_pct es señal medida y apunta a lo mismo que
      // la acción sugiere: falta contenido en esta categoría.
      it = { problem: 'sin-informacion', action: 'reforzar', detail: `${c.no_info_pct}% sin info`, score: c.total }
    } else if ((c.support_pct ?? 0) >= minSupportPct) {
      it = { problem: 'escala', action: 'reforzar', detail: `${c.support_pct}% a soporte`, score: c.total }
    }
    if (it) items.push({ category: c.category, ...it })
  }
  return items.sort((a, b) => b.score - a.score).slice(0, limit)
}
