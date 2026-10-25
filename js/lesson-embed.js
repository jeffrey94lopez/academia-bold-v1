// Dispara el re-embebido de una lección contra el webhook de n8n. Vive aparte
// de js/admin.js porque lo necesitan dos consumidores (el editor de lecciones y
// la bandeja de vacíos), y un import entre ellos sería circular.
//
// No es import-safe (hace fetch), así que no lleva test propio: lo que sí es
// puro —armar el texto a embeber— ya vive en js/lesson-embed-text.js.
//
// Embebe TODOS los bloques bot_* (no solo nota y faq) para que el bot pueda
// recuperar lecciones cuya respuesta vive en Advertencia/Pasos/Relacionado.
import { lessonToEmbedText } from './lesson-embed-text.js'

export const EMBED_WEBHOOK = 'https://n8n.mplasesores.com/webhook/embed-lesson'
export const EMBED_TOKEN   = 'BoldBodi-2026-K9xMvP7q'

export async function embedLesson(lessonId, titulo, categoria, blocks, notas) {
  try {
    const text = lessonToEmbedText(titulo, categoria, blocks, notas)
    const res = await fetch(EMBED_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': EMBED_TOKEN },
      body: JSON.stringify({ lessonId, text })
    })
    return res.ok
  } catch (_) { return false }
}
