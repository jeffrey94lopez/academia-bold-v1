// Texto que se embebe (vector) de una lección para la búsqueda del bot bolbot POS.
// Import-safe (sin DOM ni supabase) → testeable con node:test.
//
// REGLA CLAVE: debe cubrir el MISMO contenido que el bot puede citar al responder.
// El prompt de n8n ("Construir prompt") renderiza los cinco bloques "Solo para
// bolbot POS" (bot_nota, bot_advertencia, bot_pasos, bot_relacionado, bot_faq).
// Si un bloque del bot no se embebe aquí, su texto no matchea la pregunta del
// usuario y la lección NUNCA se recupera (match_lessons por similitud), aunque
// n8n sabría renderizarlo. Por eso se embeben TODOS los bloques bot_*.
export function lessonToEmbedText(titulo, categoria, blocks, notas) {
  let text = `Titulo: ${titulo}\nCategoria: ${categoria}\n`
  if (Array.isArray(blocks)) {
    blocks.forEach(b => {
      if (b.type === 'step' && b.text)
        text += b.text.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() + '\n'
      else if (b.type === 'html' && b.html)
        // El legacy es una lección entera, no un fragmento: los tags se
        // reemplazan por espacio (no por '') para que <p>a</p><p>b</p> no
        // termine como "ab" en el embedding.
        text += String(b.html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() + '\n'
      else if (b.type === 'bot_faq') {
        // FAQ estructurada: pregunta + variaciones + respuesta alimentan la
        // recuperación (las variaciones son justamente frases alternativas para
        // matchear más consultas). Fallback al formato viejo de texto libre.
        const faq = [b.pregunta, b.variaciones, b.respuesta].filter(Boolean).join('\n') || b.content || ''
        if (faq.trim()) text += faq + '\n'
      }
      else if (typeof b.type === 'string' && b.type.startsWith('bot_') && b.content)
        text += b.content + '\n'
    })
  }
  // El campo "Notas" de la lección también alimenta al bot.
  if (notas && String(notas).trim()) text += `Notas: ${String(notas).trim()}\n`
  return text.slice(0, 8000)
}
