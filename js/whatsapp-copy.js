export function lessonToWhatsApp(lesson) {
  const lines = []
  lines.push(`*${lesson.titulo}*`)
  if (lesson.descripcion) lines.push(`_${lesson.descripcion}_`)
  lines.push('')

  let blocks = []
  try {
    const p = JSON.parse(lesson.contenido)
    if (Array.isArray(p)) blocks = p
  } catch (_) {}

  let stepNum = 0
  for (const b of blocks) {
    if (!b.type || b.type.startsWith('bot_')) continue
    if (b.type === 'step' && b.text) {
      stepNum++
      lines.push(`${stepNum}. ${b.text}`)
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
