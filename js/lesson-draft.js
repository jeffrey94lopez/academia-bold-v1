// Autoguardado de borradores del editor de lecciones en localStorage. Lógica
// PURA (sin DOM ni supabase) para poder probarla con node:test. El cableado
// (leer el formulario, escribir en localStorage, pintar la barra de
// restauración) vive en js/admin.js; aquí solo va la lógica de decisión.
//
// Invariante clave: el admin BORRA el borrador cuando el guardado real a la
// base tiene éxito. Por eso "existe un borrador" ⇒ "hay trabajo sin guardar",
// y ofrecer restaurar siempre es correcto (no hace falta comparar contra la BD).

const PREFIX = 'bold_lesson_draft_'

// Clave de localStorage para una lección. Las nuevas (sin id) comparten 'new'.
export function draftKey(id) {
  return PREFIX + (id ? String(id) : 'new')
}

// ¿El borrador tiene algo que valga la pena conservar? Evita ofrecer restaurar
// un formulario recién abierto y vacío.
export function isMeaningfulDraft(d) {
  if (!d) return false
  if ((d.titulo || '').trim()) return true
  if ((d.descripcion || '').trim()) return true
  if ((d.notas || '').trim()) return true
  if (Array.isArray(d.blocks) && d.blocks.length) return true
  if (Array.isArray(d.questions) && d.questions.length) return true
  return false
}

// Construye la foto a guardar, sellada con savedAt (ms epoch). Normaliza tipos
// para que el JSON sea estable.
export function buildDraft(state, now) {
  const s = state || {}
  return {
    titulo: s.titulo || '',
    descripcion: s.descripcion || '',
    notas: s.notas || '',
    orden: s.orden ?? '',
    categoria: s.categoria || '',
    vertical: s.vertical || 'retail',
    plataforma: s.plataforma || 'web',
    blocks: Array.isArray(s.blocks) ? s.blocks : [],
    questions: Array.isArray(s.questions) ? s.questions : [],
    savedAt: now,
  }
}

// ¿Ofrecer restaurar al abrir el editor? Debe tener contenido y no estar
// vencido (por defecto 7 días) para no resucitar borradores muy viejos.
export function shouldOfferRestore(draft, now, maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  if (!isMeaningfulDraft(draft)) return false
  if (typeof draft.savedAt === 'number' && now - draft.savedAt > maxAgeMs) return false
  return true
}

// Tiempo relativo corto en español para el indicador y la barra.
export function relTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) return ''
  const s = Math.floor(ms / 1000)
  if (s < 45) return 'hace un momento'
  const m = Math.floor(s / 60)
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return `hace ${d} d`
}
