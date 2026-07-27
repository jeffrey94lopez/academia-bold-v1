import { parseLessonBlocks } from './lesson-blocks.js'

function htmlToWhatsApp(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent

  const tag = node.tagName?.toLowerCase()
  const children = () => Array.from(node.childNodes).map(htmlToWhatsApp).join('')

  if (tag === 'strong' || tag === 'b') return `*${children()}*`
  if (tag === 'em'     || tag === 'i') return `_${children()}_`
  if (tag === 'u') return children()
  if (tag === 'br') return '\n'
  if (tag === 'p') {
    const inner = children()
    return inner === '' ? '' : inner + '\n'
  }
  if (tag === 'ul') {
    return Array.from(node.querySelectorAll(':scope > li'))
      .map(li => '• ' + Array.from(li.childNodes).map(htmlToWhatsApp).join('') + '\n')
      .join('')
  }
  if (tag === 'ol') {
    return Array.from(node.querySelectorAll(':scope > li'))
      .map((li, i) => `${i + 1}. ` + Array.from(li.childNodes).map(htmlToWhatsApp).join('') + '\n')
      .join('')
  }
  return children()
}

function htmlStepToWhatsApp(html) {
  const div = document.createElement('div')
  div.innerHTML = html
  return htmlToWhatsApp(div).replace(/\n+$/, '')
}

export function lessonToWhatsApp(lesson) {
  const lines = []
  lines.push(`*${lesson.titulo}*`)
  if (lesson.descripcion) lines.push(`_${lesson.descripcion}_`)
  lines.push('')

  const blocks = parseLessonBlocks(lesson.contenido)

  let stepNum = 0
  for (const b of blocks) {
    if (!b.type || b.type.startsWith('bot_')) continue
    if (b.type === 'step' && b.text) {
      stepNum++
      const isHtml = /<[a-z]/i.test(b.text)
      const text = isHtml ? htmlStepToWhatsApp(b.text) : b.text
      lines.push(`${stepNum}. ${text}`)
    } else if (b.type === 'html' && b.html) {
      // Contenido legacy: se convierte con el mismo traductor que los steps
      // con HTML, pero sin numerarlo (no es un paso).
      lines.push(htmlStepToWhatsApp(String(b.html)))
    } else if (b.type === 'video' && b.url) {
      const label = b.label ? `${b.label}: ` : ''
      lines.push(`▶ ${label}${b.url}`)
    } else if (b.type === 'link' && b.url) {
      const label = b.label || b.url
      lines.push(`🔗 ${label}: ${b.url}`)
    } else if (b.type === 'image' && b.caption) {
      lines.push(`🖼 ${b.caption}`)
    }
  }

  return lines.join('\n').trim()
}

export async function copyLessonToWhatsApp(lesson, feedbackEl) {
  const text = lessonToWhatsApp(lesson)
  try {
    await navigator.clipboard.writeText(text)
    if (feedbackEl) {
      const orig = feedbackEl.textContent
      feedbackEl.textContent = '¡Copiado!'
      setTimeout(() => { feedbackEl.textContent = orig }, 2000)
    }
  } catch (_) {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    if (feedbackEl) {
      const orig = feedbackEl.textContent
      feedbackEl.textContent = '¡Copiado!'
      setTimeout(() => { feedbackEl.textContent = orig }, 2000)
    }
  }
}
