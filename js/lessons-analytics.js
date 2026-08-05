// Derivaciones puras de la pestaña Lecciones del analytics. Sin DOM ni supabase
// → testeable en Node. La vista (admin-lessons-analytics.js) solo pinta lo que
// estas funciones devuelven a partir de los jsonb de las RPCs.

export function pctDelta(cur, prev) {
  if (prev == null || prev === 0) return null
  return Math.round(100 * (cur - prev) / prev)
}

export function completionPct(funnel) {
  const entered = funnel?.entered || 0
  const cert = funnel?.certificate || 0
  if (entered === 0) return null
  return Math.round(100 * cert / entered)
}

export function computeLessonKpis(summary, funnel) {
  const k = summary?.kpis || {}
  return {
    visits: k.visits ?? 0,
    visitsDelta: pctDelta(k.visits ?? 0, k.prev_visits),
    newStudents: k.new_students ?? 0,
    newStudentsDelta: pctDelta(k.new_students ?? 0, k.prev_new_students),
    completionPct: completionPct(funnel),
    certificates: k.cert_views ?? 0,
  }
}

export function selectTrapLessons(exams, { minTotal = 5, maxPassPct = 60, limit = 5 } = {}) {
  return (exams || [])
    .filter(e => (e.total ?? 0) >= minTotal && e.pass_pct != null && e.pass_pct <= maxPassPct)
    .sort((a, b) => a.pass_pct - b.pass_pct)
    .slice(0, limit)
}

export function zeroResultSearches(searches, { limit = 8 } = {}) {
  return (searches || [])
    .filter(s => (s.zero_count ?? 0) > 0)
    .sort((a, b) => (b.zero_count ?? 0) - (a.zero_count ?? 0))
    .slice(0, limit)
}

export function mergeLessonTable(topLessons, exams, { limit = 10 } = {}) {
  const passByLesson = new Map((exams || []).map(e => [e.lesson, e.pass_pct]))
  return (topLessons || [])
    .slice(0, limit)
    .map(l => ({
      lesson: l.lesson,
      visits: l.count,
      pass_pct: passByLesson.has(l.lesson) ? passByLesson.get(l.lesson) : null,
    }))
}
