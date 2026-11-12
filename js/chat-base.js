// js/chat-base.js — piezas de conversación compartidas por las herramientas de BolBot
// (conversor de inventario y generador de códigos): burbujas, botones de respuesta,
// adjuntar archivos y mini-formularios dentro de la burbuja.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const CANCELADO = Symbol('cancelado')
export const pausa = ms => new Promise(r => setTimeout(r, ms))

// `host`: función que devuelve el contenedor de mensajes del chat. `alDesplazar`:
// pide al chat que baje al último mensaje.
export function crearBase({ host, alDesplazar = () => {} }) {
  let ancla = null

  // La conversación muere sola si el cliente limpia el chat a la mitad.
  const vivo = () => { if (!ancla?.isConnected) throw CANCELADO }

  function añadir(el) { host().appendChild(el); alDesplazar(); return el }

  function burbuja(clase, html) {
    const fila = document.createElement('div')
    fila.className = clase === 'user' ? 'flex justify-end' : 'flex justify-start'
    fila.innerHTML = `<div class="${clase === 'user' ? 'msg-user' : 'msg-bot-wide'} text-sm inv-aparece">${html}</div>`
    return añadir(fila)
  }

  // Burbuja del bot, con los tres puntitos un instante antes (se siente conversación).
  async function bot(html, { demora = 450 } = {}) {
    if (ancla) vivo()
    const escribiendo = document.createElement('div')
    escribiendo.className = 'flex justify-start'
    escribiendo.innerHTML = '<div class="flex items-center gap-1.5 bg-[var(--background-page)] rounded-2xl px-4 py-3 w-fit"><span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span></div>'
    añadir(escribiendo)
    await pausa(demora)
    const fila = burbuja('bot', html)
    escribiendo.remove()
    ancla ??= fila
    return fila.firstElementChild
  }

  const usuario = texto => burbuja('user', esc(texto))

  // Botones de respuesta rápida dentro de la burbuja `b`. Resuelve con el valor
  // elegido, deja la elección como burbuja del cliente y quita los botones.
  // Cada opción puede traer `detalle`: una línea gris bajo el texto.
  function chips(b, opciones) {
    return new Promise(resolver => {
      const fila = document.createElement('div')
      fila.className = 'inv-acciones'
      for (const o of opciones) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'inv-chipbtn'
        if (o.detalle) btn.innerHTML = `${esc(o.texto)}<small class="inv-chipdetalle">${esc(o.detalle)}</small>`
        else btn.textContent = o.texto
        btn.addEventListener('click', () => { fila.remove(); usuario(o.texto); resolver(o.valor) })
        fila.appendChild(btn)
      }
      b.appendChild(fila)
      alDesplazar()
    })
  }

  // Botón para adjuntar archivo (también acepta arrastrar y soltar sobre la burbuja).
  function pedirArchivos(b, { boton, accept, multiple = false }) {
    return new Promise(resolver => {
      const fila = document.createElement('div')
      fila.className = 'inv-acciones'
      const input = document.createElement('input')
      input.type = 'file'; input.accept = accept; input.multiple = multiple; input.hidden = true
      const btn = document.createElement('button')
      btn.type = 'button'; btn.className = 'inv-chipbtn inv-chipbtn-fuerte'; btn.textContent = `📎 ${boton}`
      const listo = files => {
        if (!files.length) return
        fila.remove(); b.classList.remove('inv-soltar')
        usuario(`📎 ${[...files].map(f => f.name).join(', ')}`)
        resolver([...files])
      }
      btn.addEventListener('click', () => input.click())
      input.addEventListener('change', () => listo(input.files))
      b.addEventListener('dragover', e => { e.preventDefault(); b.classList.add('inv-soltar') })
      b.addEventListener('dragleave', () => b.classList.remove('inv-soltar'))
      b.addEventListener('drop', e => { e.preventDefault(); listo(e.dataTransfer.files) })
      fila.append(btn, input)
      b.appendChild(fila)
      alDesplazar()
    })
  }

  // Mini-formulario en la burbuja. campos: [{ id, etiqueta, tipo: 'text'|'number'|'area',
  // placeholder, valor, requerido }]. Resuelve con { id: valor }.
  function pedirCampos(b, { campos, boton = 'Listo', resumen }) {
    return new Promise(resolver => {
      const caja = document.createElement('div')
      caja.className = 'inv-editor'
      caja.innerHTML = campos.map(c => `<label class="inv-campo"><span>${esc(c.etiqueta)}${c.requerido ? ' *' : ''}</span>${
        c.tipo === 'area'
          ? `<textarea class="inv-entrada" data-id="${c.id}" rows="6" placeholder="${esc(c.placeholder ?? '')}">${esc(c.valor ?? '')}</textarea>`
          : `<input class="inv-entrada" data-id="${c.id}" type="${c.tipo === 'number' ? 'number' : 'text'}" ${c.tipo === 'number' ? 'min="1" inputmode="numeric"' : ''} placeholder="${esc(c.placeholder ?? '')}" value="${esc(c.valor ?? '')}">`
      }<small></small></label>`).join('') +
        `<div class="inv-acciones"><button type="button" class="inv-chipbtn inv-chipbtn-fuerte">${esc(boton)}</button></div>`
      caja.querySelector('button').addEventListener('click', () => {
        const valores = {}
        let falta = null
        for (const c of campos) {
          const el = caja.querySelector(`[data-id="${c.id}"]`)
          valores[c.id] = el.value.trim()
          const aviso = el.closest('.inv-campo').querySelector('small')
          aviso.textContent = c.requerido && !valores[c.id] ? 'Este dato es necesario.' : ''
          if (c.requerido && !valores[c.id]) falta ??= el
        }
        if (falta) { falta.focus(); return }
        caja.querySelector('.inv-acciones').remove()
        caja.querySelectorAll('.inv-entrada').forEach(el => { el.disabled = true })
        usuario(resumen ? resumen(valores) : Object.values(valores).filter(Boolean).join(' · '))
        resolver(valores)
      })
      b.appendChild(caja)
      alDesplazar()
      caja.querySelector('.inv-entrada')?.focus({ preventScroll: true })
    })
  }

  return { bot, usuario, chips, pedirArchivos, pedirCampos, vivo, burbuja, añadir, alDesplazar }
}
