// js/inv-chat.js — el conversor de inventario como una conversación con BolBot.
//
// Cada paso es una pregunta del bot con botones o un archivo adjunto; lo que el
// cliente responde aparece como su propia burbuja. Los textos los arma el código
// (sin IA, sin tokens) y los archivos nunca salen del navegador.
import { crearSesion, ETIQUETA_TIPO } from './inv-sesion.js'
import { CAMPOS } from './inv-origen.js'

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const letraColumna = i => { let s = '', n = i; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 } while (n >= 0); return s }
const CANCELADO = Symbol('cancelado')
const pausa = ms => new Promise(r => setTimeout(r, ms))

const INTRO_HTML = '¡Claro! Te ayudo a pasar tu inventario a Bold POS en 4 pasos: tu plantilla de Bold, tu archivo de productos, una revisión rápida y la descarga. <b>Tus archivos no salen de tu computador.</b>'
// Lo que queda en el historial de la conversación (texto plano).
export const TEXTO_INTRO = INTRO_HTML.replace(/<[^>]+>/g, '')

// `host`: función que devuelve el contenedor de mensajes del chat. `alDesplazar`:
// pide al chat que baje al último mensaje. Resuelve cuando termina la conversación.
export async function iniciarConversacion({ host, alDesplazar = () => {} }) {
  const sesion = crearSesion()
  const caja = () => host()
  let ancla = null

  // La conversación muere sola si el cliente limpia el chat a la mitad.
  const vivo = () => { if (!ancla?.isConnected) throw CANCELADO }

  function añadir(el) { caja().appendChild(el); alDesplazar(); return el }

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
  function chips(b, opciones) {
    return new Promise(resolver => {
      const fila = document.createElement('div')
      fila.className = 'inv-acciones'
      for (const o of opciones) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'inv-chipbtn'
        btn.textContent = o.texto
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

  // ---------- Paso 1: plantilla(s) de Bold ----------
  async function pasoPlantillas() {
    let b = await bot(`Primero necesito <b>la plantilla de tu cuenta de Bold POS</b>. Cada cuenta tiene la suya: ahí vienen tu sucursal, tus categorías y tus impuestos. Puedes subir la de <b>inventariables</b>, la de <b>no inventariables</b> o las dos juntas.`)
    for (;;) {
      const files = await pedirArchivos(b, { boton: 'Subir plantilla de Bold', accept: '.xlsx', multiple: true })
      vivo()
      const errores = []
      for (const f of files) {
        const r = await sesion.agregarPlantilla(f)
        if (r.error) { errores.push(r.error); continue }
        const { info } = r
        await bot(`✅ Plantilla de <b>${ETIQUETA_TIPO[info.tipo]}</b>${info.sucursal ? ` de <b>${esc(info.sucursal)}</b>` : ''}. Tiene <b>${info.listas.categorias.length}</b> categorías${info.tieneIsv ? ' y trae la columna de impuesto (ISV)' : ''}.`, { demora: 300 })
      }
      for (const e of errores) await bot(`⚠️ ${esc(e)}`, { demora: 300 })
      const tipos = Object.keys(sesion.estado.plantillas)
      if (!tipos.length) { b = await bot('Súbeme una plantilla que hayas descargado desde Bold POS para continuar.'); continue }
      if (tipos.length === 1) {
        const otra = tipos[0] === 'inventariable' ? 'no inventariables' : 'inventariables'
        const q = await bot(`¿Vas a cargar también ítems <b>${otra}</b> (por ejemplo servicios)?`)
        const r = await chips(q, [{ texto: `Sí, subir la de ${otra}`, valor: 'otra' }, { texto: 'No, seguir con esta', valor: 'seguir' }])
        vivo()
        if (r === 'otra') { b = await bot(`Perfecto, súbela cuando quieras.`); continue }
      }
      return
    }
  }

  // ---------- Paso 2: archivo de productos ----------
  async function pasoOrigen() {
    let b = await bot('Ahora el <b>archivo con tus productos</b>: el Excel o CSV de tu sistema anterior (Alegra, Siigo, un Excel propio…). Si viene de Alegra, exporta el listado de ítems a Excel.')
    for (;;) {
      const [file] = await pedirArchivos(b, { boton: 'Subir archivo de productos', accept: '.xlsx,.xls,.csv' })
      vivo()
      const r = await sesion.cargarOrigen(file)
      if (r.error) { b = await bot(`⚠️ ${esc(r.error)} Prueba con otro archivo.`); continue }
      await bot(`Encontré <b>${r.total}</b> producto(s) en la hoja «${esc(r.hoja)}».`)
      return
    }
  }

  // ---------- Paso 3: columnas ----------
  function listaMapeo() {
    const { mapeo, encabezados } = sesion.estado.origen
    const lineas = CAMPOS.filter(c => mapeo[c.id] !== undefined)
      .map(c => `<li>${esc(c.etiqueta)} ← «${esc(encabezados[mapeo[c.id]].replace(/\s+/g, ' ').trim())}»</li>`)
    return `<ul class="inv-lista">${lineas.join('')}</ul>`
  }

  function editorMapeo(b) {
    return new Promise(resolver => {
      const { encabezados, mapeo, filas } = sesion.estado.origen
      const muestra = col => { for (const f of filas) { const v = f[col]; if (String(v ?? '').trim() !== '') return String(v) } return '' }
      const opciones = sel => ['<option value="">— no usar —</option>'].concat(
        encabezados.map((h, i) => h.trim() === '' ? '' : `<option value="${i}" ${sel === i ? 'selected' : ''}>${letraColumna(i)} · ${esc(h.replace(/\s+/g, ' ').trim().slice(0, 40))}</option>`)).join('')
      const caja = document.createElement('div')
      caja.className = 'inv-editor'
      caja.innerHTML = CAMPOS.map(c => `<label class="inv-campo"><span>${esc(c.etiqueta)}${c.obligatorio ? ' *' : ''}</span>
        <select data-campo="${c.id}">${opciones(mapeo[c.id])}</select><small></small></label>`).join('') +
        '<div class="inv-acciones"><button type="button" class="inv-chipbtn inv-chipbtn-fuerte">Listo</button></div>'
      const ejemplo = () => caja.querySelectorAll('.inv-campo').forEach(l => {
        const v = l.querySelector('select').value
        l.querySelector('small').textContent = v === '' ? '' : `Ej.: ${muestra(Number(v)).slice(0, 36)}`
      })
      ejemplo()
      caja.addEventListener('change', e => {
        const campo = e.target.dataset.campo
        if (!campo) return
        if (e.target.value === '') delete mapeo[campo]; else mapeo[campo] = Number(e.target.value)
        ejemplo()
      })
      caja.querySelector('button').addEventListener('click', () => { caja.querySelector('.inv-acciones').remove(); caja.querySelectorAll('select').forEach(s => { s.disabled = true }); usuario('Listo, ya corregí las columnas'); resolver() })
      b.appendChild(caja)
      alDesplazar()
    })
  }

  async function pasoColumnas() {
    for (;;) {
      const completo = sesion.mapeoCompleto()
      const b = await bot(`Así entendí tus columnas:${listaMapeo()}${completo ? '' : '<b>Me falta el nombre o el precio de venta.</b> Indícame cuáles son.'}`)
      if (completo) {
        const r = await chips(b, [{ texto: 'Se ve bien ✅', valor: 'ok' }, { texto: 'Corregir columnas', valor: 'corregir' }])
        vivo()
        if (r === 'ok') return
      }
      await editorMapeo(b)
      vivo()
    }
  }

  // ---------- Paso 4: preguntas que dependen de la cuenta y del archivo ----------
  async function pasoPreguntas() {
    // Facturación electrónica: decide si la plantilla lleva la columna de impuesto.
    const trae = sesion.tieneIsv()
    const qIsv = await bot(`¿Tu cuenta tiene <b>facturación electrónica</b> habilitada? ${trae ? 'Tu plantilla trae la columna de impuesto (ISV), así que parece que sí.' : 'Tu plantilla no trae la columna de impuesto (ISV).'}`)
    const conIsv = (await chips(qIsv, [{ texto: 'Sí', valor: true }, { texto: 'No', valor: false }]))
    vivo()
    sesion.estado.opciones.isv = conIsv
    if (conIsv && !trae) await bot('Entonces descarga de nuevo tu plantilla desde Bold POS (con la facturación electrónica activa) y súbela otra vez; por ahora no puedo llenar el impuesto sin esa columna. Seguimos con lo demás.')
    if (!conIsv && trae) await bot('Entendido: dejaré la columna de impuesto vacía.')

    let r = sesion.recalcular()
    if (r.pendienteInventariable) {
      const q = await bot('Tu archivo no dice qué productos llevan control de existencias. ¿Tus productos son <b>inventariables</b>?')
      sesion.estado.opciones.inventariable = await chips(q, [{ texto: 'Sí, controlo existencias', valor: 'si' }, { texto: 'No, son servicios', valor: 'no' }])
      vivo()
      r = sesion.recalcular()
    }

    for (const u of r.unidadesSinMapa) {
      const unidades = sesion.plantillaReferencia().listas.unidades
      const q = await bot(`No reconozco la unidad de medida «${esc(u)}». ¿Cuál es en Bold POS?`)
      sesion.estado.opciones.unidades[u] = await chips(q, unidades.slice(0, 8).map(x => ({ texto: x, valor: x })))
      vivo()
    }
    r = sesion.recalcular()

    if (r.categoriasFaltantes.length) {
      const q = await bot(`Estas <b>${r.categoriasFaltantes.length}</b> categoría(s) no existen todavía en tu Bold POS, y Bold no importa ítems de una categoría que no exista. Créalas antes de importar:<pre class="inv-cats">${esc(r.categoriasFaltantes.join('\n'))}</pre>`)
      let b = q
      for (;;) {
        const acc = await chips(b, [{ texto: 'Copiar categorías', valor: 'copiar' }, { texto: 'Enviar todo a “General”', valor: 'general' }, { texto: 'Ya las creé, continuar', valor: 'seguir' }])
        vivo()
        if (acc === 'copiar') {
          try { await navigator.clipboard.writeText(r.categoriasFaltantes.join('\n')) } catch { /* sin portapapeles: la lista está a la vista */ }
          b = await bot('Copiadas ✅ Pégalas al crearlas en Bold POS (una por línea).', { demora: 250 })
          continue
        }
        if (acc === 'general') sesion.estado.opciones.categoriasAGeneral = true
        break
      }
      r = sesion.recalcular()
    }
  }

  // ---------- Resultado ----------
  async function pasoResultado() {
    const r = sesion.estado.resultado
    const tipos = Object.keys(r.salidas).filter(t => r.salidas[t].length)
    const lista = (titulo, items) => items.length ? `<details class="inv-detalle"><summary>${items.length} ${titulo}</summary><ul>${
      items.slice(0, 100).map(i => `<li>${i.fila ? `Fila ${i.fila}: ` : ''}${esc(i.mensaje)}</li>`).join('')}${items.length > 100 ? '<li>…</li>' : ''}</ul></details>` : ''
    const texto = r.total
      ? `¡Listo! 🎉 Armé <b>${r.total}</b> producto(s)${r.errores.length ? `; <b>${r.errores.length}</b> fila(s) tienen errores y no se incluyen` : ''}.`
      : 'No pude armar ningún producto con lo que me diste.'
    const b = await bot(`${texto}${lista('error(es): estas filas no se incluyen', r.errores)}${lista('aviso(s) para revisar', r.avisos)}
      ${r.total ? '<p class="inv-nota">Descarga la plantilla e impórtala en Bold POS.</p>' : ''}`, { demora: 700 })
    const fila = document.createElement('div')
    fila.className = 'inv-acciones'
    for (const t of tipos) {
      const btn = document.createElement('button')
      btn.type = 'button'; btn.className = 'inv-chipbtn inv-chipbtn-fuerte'
      btn.textContent = `⬇️ Plantilla de ${ETIQUETA_TIPO[t]} (${r.salidas[t].length})`
      btn.addEventListener('click', async () => { btn.disabled = true; await sesion.descargar(t); btn.disabled = false })
      fila.appendChild(btn)
    }
    b.appendChild(fila)
    alDesplazar()
    const sig = await chips(b, [{ texto: 'Empezar de nuevo', valor: 'otra' }])
    vivo()
    if (sig === 'otra') {
      await bot('Claro, empecemos de nuevo.')
      return iniciarConversacion({ host, alDesplazar })
    }
  }

  try {
    await bot(INTRO_HTML)
    await pasoPlantillas()
    await pasoOrigen()
    await pasoColumnas()
    await pasoPreguntas()
    await pasoResultado()
  } catch (e) {
    if (e === CANCELADO) return
    console.error('[inventario] conversación interrumpida:', e)
    await bot('Algo salió mal y no pude seguir. Recarga la página e inténtalo de nuevo.')
  }
}
