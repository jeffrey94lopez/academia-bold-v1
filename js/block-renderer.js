import { renderStepText } from './step-formatter.js'
import { getYouTubeId } from './utils.js'

export function renderBlocks(blocks) {
  if (!Array.isArray(blocks)) return document.createDocumentFragment()
  const frag = document.createDocumentFragment()
  let stepCount = 0

  for (const block of blocks) {
    if (block.type?.startsWith('bot_')) continue  // invisible to students

    if (block.type === 'step') {
      stepCount++
      const wrap = document.createElement('div')
      wrap.style.cssText = 'display:flex;gap:10px;align-items:flex-start;margin-bottom:14px'
      const circle = document.createElement('div')
      circle.style.cssText = 'width:24px;height:24px;background:var(--blue-100);border-radius:50%;color:white;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px'
      circle.textContent = stepCount
      const raw = block.text != null ? String(block.text) : ''
      const textEl = document.createElement(/<(ol|ul|li|div|h[1-6])/i.test(raw) ? 'div' : 'p')
      textEl.style.cssText = 'font-size:13px;color:#334155;margin:3px 0 0;line-height:1.6'
      if (/<[a-z]/i.test(raw)) {
        textEl.innerHTML = raw
      } else {
        textEl.appendChild(renderStepText(raw))
      }
      wrap.append(circle, textEl)
      frag.append(wrap)

    } else if (block.type === 'image') {
      let validUrl = false
      try { new URL(block.url); validUrl = true } catch (_) {}
      if (validUrl && !/^https?:\/\//i.test(block.url)) validUrl = false
      if (!validUrl) continue
      const wrap = document.createElement('div')
      wrap.style.cssText = 'border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:14px'
      const img = document.createElement('img')
      img.src = block.url
      img.alt = block.caption || ''
      img.style.cssText = 'width:100%;display:block'
      wrap.append(img)
      if (block.caption) {
        const cap = document.createElement('p')
        cap.style.cssText = 'font-size:11px;color:#94a3b8;margin:0;padding:8px 12px;background:#fff;border-top:1px solid #f1f5f9'
        cap.textContent = block.caption
        wrap.append(cap)
      }
      frag.append(wrap)

    } else if (block.type === 'video') {
      const videoId = getYouTubeId(block.url)

      const wrap = document.createElement('div')
      wrap.style.cssText = 'margin-bottom:14px'

      // Si el link no es de YouTube (o no se pudo extraer el ID), mostrar un
      // botón al video en lugar de omitirlo en silencio.
      if (!videoId) {
        if (!block.url) continue
        const a = document.createElement('a')
        a.href = block.url
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        a.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:9999px;border:1.5px solid var(--blue-100);color:var(--blue-100);font-size:12px;font-weight:700;text-decoration:none'
        a.textContent = '▶ ' + (block.label || 'Ver video')
        wrap.append(a)
        frag.append(wrap)
        continue
      }

      const iframe = document.createElement('iframe')
      iframe.src = `https://www.youtube.com/embed/${videoId}`
      iframe.setAttribute('allowfullscreen', '')
      iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture')
      iframe.setAttribute('loading', 'lazy')
      iframe.style.cssText = 'width:100%;aspect-ratio:16/9;border:0;border-radius:10px;display:block'
      wrap.append(iframe)

      if (block.label) {
        const cap = document.createElement('p')
        cap.style.cssText = 'font-size:11px;color:#94a3b8;margin:6px 0 0'
        cap.textContent = block.label
        wrap.append(cap)
      }

      frag.append(wrap)

    } else if (block.type === 'link') {
      let validUrl = false
      try { new URL(block.url); validUrl = true } catch (_) {}
      if (validUrl && !/^https?:\/\//i.test(block.url)) validUrl = false
      if (!validUrl) continue
      const a = document.createElement('a')
      a.href = block.url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.style.cssText = 'display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;text-decoration:none;margin-bottom:14px'
      const icon = document.createElement('div')
      icon.style.cssText = 'width:32px;height:32px;background:#eff6ff;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0'
      icon.textContent = '🔗'
      const labelEl = document.createElement('p')
      labelEl.style.cssText = 'font-size:12px;font-weight:700;color:#1e293b;margin:0;flex:1'
      labelEl.textContent = block.label || block.url
      const arrow = document.createElement('span')
      arrow.style.cssText = 'color:#cbd5e1;font-size:14px'
      arrow.textContent = '→'
      a.append(icon, labelEl, arrow)
      frag.append(a)
    }
  }

  return frag
}
