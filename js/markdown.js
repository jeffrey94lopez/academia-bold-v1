// Render de markdown mínimo para las respuestas del bot. El cuerpo del mensaje
// viene de n8n/LLM → es contenido NO confiable y se pinta con innerHTML, así que
// la regla es: escapar TODO primero y después reconstruir solo los tokens de
// markdown que reconocemos (imagen, video de YouTube, link, negrita, salto).
// Import-safe (solo depende de utils.js): por eso es testeable en Node.
//
// El click para ampliar la imagen NO usa onclick inline: la CSP de vercel.json
// bloquea los manejadores inline. Se marca con data-lightbox y assistant.js lo
// resuelve por delegación de eventos.

import { escapeHtml, getYouTubeId } from './utils.js'

export function renderMarkdown(text) {
  if (!text) return ''

  // 1. Escapar el cuerpo entero. Los delimitadores de markdown (! [ ] ( ) *)
  //    no se ven afectados por escapeHtml, así que los reemplazos de abajo
  //    siguen funcionando; cualquier <, >, ", ' del cuerpo ya queda neutralizado.
  text = escapeHtml(text)

  // 2. Imagen: ![alt](url). alt y url ya vienen escapados del paso 1.
  text = text.replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, (_, alt, url) => {
    return `<div class="my-2 text-center">
      <img src="${url}" alt="${alt}" class="chat-img" data-lightbox="${url}" title="Clic para ampliar">
      ${alt ? `<p class="text-[10px] text-[var(--black-60)] mt-1 italic">${alt}</p>` : ''}
    </div>`
  })

  // 3. Links de YouTube en cualquier formato (watch, youtu.be, shorts, live…);
  //    si no se puede extraer el ID, el link cae al render genérico de <a>.
  //    getYouTubeId valida el ID (^[A-Za-z0-9_-]{6,}$) → seguro en el src.
  text = text.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]*(?:youtube\.com|youtu\.be)[^)]*)\)/g,
    (match, label, url) => {
      // El paso 1 dejó los & como &amp;: deshacerlo solo para parsear la URL.
      const videoId = getYouTubeId(url.replace(/&amp;/g, '&'))
      if (!videoId) return match
      return `<div class="my-2">
      <p class="text-xs font-bold mb-1.5 flex items-center gap-1">▶ ${label}</p>
      <div class="chat-video-wrap"><iframe src="https://www.youtube.com/embed/${videoId}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>
    </div>`
    }
  )

  // 4. Link genérico [texto](url). label y url ya están escapados (paso 1),
  //    y la regex exige https?:// → no entran esquemas como javascript:.
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener" class="text-[var(--blue-100)] underline font-semibold hover:opacity-75">$1</a>')

  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/\n/g, '<br>')

  return text
}
