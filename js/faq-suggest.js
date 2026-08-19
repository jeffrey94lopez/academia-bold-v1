// Normaliza y deduplica preguntas candidatas para el campo Variaciones de una
// FAQ (vienen de conversaciones reales que el bot no pudo responder).
// Import-safe (sin DOM/supabase) → testeable con node:test.
export function dedupeQuestions(list, { minLen = 5, max = 20 } = {}) {
  const seen = new Set()
  const out = []
  for (const raw of list || []) {
    const q = String(raw || '').trim().replace(/\s+/g, ' ')
    if (q.length < minLen) continue
    const key = q.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(q)
    if (out.length >= max) break
  }
  return out
}

// Primer mensaje del usuario en una conversación (fallback cuando no hay summary).
export function firstUserMessage(messages) {
  const arr = Array.isArray(messages) ? messages : []
  const m = arr.find(x => x && String(x.role || '').toLowerCase() === 'user')
  return m && m.content ? String(m.content) : ''
}
