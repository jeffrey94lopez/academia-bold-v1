import { renderStepText } from './step-formatter.js'
import { getYouTubeId } from './utils.js'
import { isAllowedTag, isDroppedWithContent, isAllowedAttr, isSafeUrlValue } from './html-policy.js'

// Pinta HTML legacy dentro de `container` aplicando la política de
// js/html-policy.js. La política decide qué se permite; acá está solo la
// mecánica: parsear en un documento inerte, recorrer y limpiar.
//
// Se parsea con DOMParser y no con innerHTML sobre un div: en un documento
// inerte las imágenes no se piden y los onerror no corren mientras se limpia.
export function sanitizeInto(container, html) {
  const doc = new DOMParser().parseFromString(String(html), 'text/html')

  const limpiar = nodo => {
    for (const hijo of [...nodo.childNodes]) {
      if (hijo.nodeType === 8) { hijo.remove(); continue }  // comentarios
      if (hijo.nodeType !== 1) continue                     // texto: se deja
      const tag = hijo.tagName.toLowerCase()

      if (isDroppedWithContent(tag)) { hijo.remove(); continue }

      if (!isAllowedTag(tag)) {
        // Etiqueta desconocida: se desenvuelve para no perder el texto.
        limpiar(hijo)
        hijo.replaceWith(...hijo.childNodes)
        continue
      }

      for (const attr of [...hijo.attributes]) {
        const nombre = attr.name.toLowerCase()
        if (!isAllowedAttr(tag, nombre)) { hijo.removeAttribute(attr.name); continue }
        // href/src con un valor peligroso: se cae el atributo, no el elemento.
        if ((nombre === 'href' || nombre === 'src') && !isSafeUrlValue(attr.value)) {
          hijo.removeAttribute(attr.name)
        }
      }

      if (tag === 'a' && hijo.hasAttribute('href')) {
        hijo.setAttribute('target', '_blank')
        hijo.setAttribute('rel', 'noopener noreferrer')
      }

      limpiar(hijo)
    }
  }

  limpiar(doc.body)
  container.append(...doc.body.childNodes)
}

// Acordeón nativo (<details>) para un bloque bot_faq marcado como visible.
// textContent en todo → sin riesgo de inyección; sin JS (details nativo).
function faqAccordion(block) {
  const pregunta = (block.pregunta || 'Pregunta frecuente').trim()
  const respuesta = String(block.respuesta || block.content || '')
  const details = document.createElement('details')
  details.style.cssText = 'border:1px solid var(--blue-10);border-radius:10px;margin-bottom:14px;background:#fff;overflow:hidden'
  const summary = document.createElement('summary')
  summary.style.cssText = 'cursor:pointer;padding:12px 14px;font-size:13px;font-weight:700;color:#1e293b'
  summary.textContent = '❓ ' + pregunta
  details.append(summary)
  const body = document.createElement('div')
  body.style.cssText = 'padding:0 14px 12px;font-size:13px;color:#334155;line-height:1.6'
  respuesta.split(/\n+/).map(s => s.trim()).filter(Boolean).forEach(par => {
    const p = document.createElement('p')
    p.style.cssText = 'margin:0 0 8px'
    p.textContent = par
    body.append(p)
  })
  details.append(body)
  return details
}

export function renderBlocks(blocks) {
  if (!Array.isArray(blocks)) return document.createDocumentFragment()
  const frag = document.createDocumentFragment()
  let stepCount = 0

  for (const block of blocks) {
    // bot_faq: solo se muestra al estudiante si se marcó el acordeón; el resto
    // de bloques bot_* siempre invisibles.
    if (block.type === 'bot_faq') {
      if (block.mostrar_acordeon && (block.pregunta || block.respuesta || block.content)) frag.append(faqAccordion(block))
      continue
    }
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

    } else if (block.type === 'html') {
      // Contenido legacy: HTML crudo escrito a mano. Se pinta sin decoración,
      // exactamente como lo hacía js/lessons.js antes de unificar el parseo.
      // NO se convierte a `step`: eso le agregaría un círculo numerado y
      // cambiaría el aspecto de la lección para el alumno.
      const raw = block.html != null ? String(block.html) : ''
      if (!raw) continue
      const wrap = document.createElement('div')
      wrap.style.cssText = 'margin-bottom:14px'
      // Sanitizado, no innerHTML crudo: lo escribe un admin, pero un onerror
      // en un atributo pasa la CSP igual (ver js/html-policy.js).
      sanitizeInto(wrap, raw)
      frag.append(wrap)

    } else if (block.type === 'image') {
      let validUrl = false
      try { new URL(block.url); validUrl = true } catch (_) {}
      if (validUrl && !/^https?:\/\//i.test(block.url)) validUrl = false
      if (!validUrl) continue
      const wrap = document.createElement('div')
      wrap.style.cssText = 'border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:14px;background:#fff'
      // Tamaño medio para convivir con el texto; clic abre el lightbox a
      // pantalla completa (definido globalmente en assistant.js).
      const img = document.createElement('img')
      img.src = block.url
      img.alt = block.caption || ''
      img.title = 'Clic para ampliar'
      img.loading = 'lazy'
      img.style.cssText = 'max-height:340px;max-width:100%;display:block;margin:0 auto;cursor:zoom-in'
      img.addEventListener('click', () => window.openLightbox?.(block.url, block.caption || ''))
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
