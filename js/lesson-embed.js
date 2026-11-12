// Dispara el re-embebido de una lección (o de un ítem de FAQ/glosario) vía
// /api/embed, que reenvía a n8n con la clave del lado del servidor. Vive aparte
// de js/admin.js porque lo necesitan dos consumidores (el editor de lecciones y
// la bandeja de vacíos), y un import entre ellos sería circular.
//
// Ninguna URL ni clave de n8n vive en el cliente: /api/embed exige la sesión de
// Supabase del admin (Authorization: Bearer <access token>).
//
// No es import-safe (hace fetch), así que no lleva test propio: lo que sí es
// puro —armar el texto a embeber— ya vive en js/lesson-embed-text.js.
//
// Embebe TODOS los bloques bot_* (no solo nota y faq) para que el bot pueda
// recuperar lecciones cuya respuesta vive en Advertencia/Pasos/Relacionado.
import { supabase } from './supabase.js'
import { lessonToEmbedText } from './lesson-embed-text.js'

// id: uuid de la lección, o 'faq_<id>' / 'glosario_<id>'. Devuelve true si se indexó.
export async function embedTexto(id, text) {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (!token) return false
    const res = await fetch('/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ lessonId: id, text })
    })
    return res.ok
  } catch (_) { return false }
}

export async function embedLesson(lessonId, titulo, categoria, blocks, notas) {
  try {
    return await embedTexto(lessonId, lessonToEmbedText(titulo, categoria, blocks, notas))
  } catch (_) { return false }
}
