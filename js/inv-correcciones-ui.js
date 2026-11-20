// js/inv-correcciones-ui.js — ventanas del chat para corregir, por fases, lo que
// el archivo del cliente trae mal (nombre, precio, costo, existencia).
//
// Capa delgada de DOM: la lógica (validar, armar `opciones`) vive en
// inv-correcciones.js. Todo lo dinámico (nombres, motivos con el texto original
// del cliente) pasa por `esc` antes de entrar al HTML.

import {
  FASES, ETIQUETA_CAMPO, validarValor, pendientesDeFase, esColumnaCompleta,
  pagina, conCorreccion, conCeros, conOmitidas, conValorColumna, descripcionMotivo,
} from './inv-correcciones.js'

const NUMERICOS = new Set(['costo', 'existencia'])  // admiten "dejar en 0"
const PLURAL = { nombre: 'nombres', precioTotal: 'precios de venta', costo: 'costos', existencia: 'existencias' }

export function crearVentanasCorreccion({ sesion, bot, chips, usuario, vivo, alDesplazar, esc, telemetria }) {
  const estado = sesion.estado
  const minuscula = campo => ETIQUETA_CAMPO[campo].toLowerCase()
  const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
  const reportar = (codigo, campo, filas) => telemetria.error('correcciones', codigo, { campo, filas })
  let contadorEditores = 0

  // "Poner el mismo valor a todas": pide un número. Resuelve con el valor, o null si vuelve atrás.
  function pedirNumero(b, campo) {
    const n = ++contadorEditores
    return new Promise(resolver => {
      const caja = document.createElement('div')
      caja.className = 'inv-corr-editor'
      caja.innerHTML = `<label class="inv-campo" for="inv-corr-valor-${n}"><span>Valor para toda la columna de ${esc(minuscula(campo))}</span>
          <input class="inv-entrada" id="inv-corr-valor-${n}" type="text" inputmode="decimal" autocomplete="off" placeholder="0"
            aria-label="${esc('Valor para ' + minuscula(campo))}"></label>
        <small class="inv-corr-error" role="alert"></small>
        <div class="inv-acciones"><button type="button" class="inv-chipbtn inv-chipbtn-fuerte" data-accion="ok">Aplicar</button>
        <button type="button" class="inv-chipbtn" data-accion="volver">Volver</button></div>`
      const entrada = caja.querySelector('input')
      const error = caja.querySelector('.inv-corr-error')
      const cerrar = () => caja.remove()
      const aplicar = () => {
        const v = validarValor(campo, entrada.value, estado.opciones.formatoNumero)
        if (!v.ok) {
          error.textContent = 'Escribe un número de 0 en adelante.'
          entrada.setAttribute('aria-invalid', 'true')
          entrada.focus()
          return
        }
        cerrar()
        usuario(`Poner ${v.valor} en todas`)
        resolver(v.valor)
      }
      caja.querySelector('[data-accion="ok"]').addEventListener('click', aplicar)
      entrada.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); aplicar() } })
      caja.querySelector('[data-accion="volver"]').addEventListener('click', () => { cerrar(); resolver(null) })
      b.appendChild(caja)
      alDesplazar()
      entrada.focus({ preventScroll: true })
    })
  }

  // Una pregunta cuando la columna entera no trae dato.
  // → 'reupload' | 'resuelto' | 'lista' (el cliente quiere corregir fila por fila)
  async function columnaCompleta(campo, lista) {
    const numerico = NUMERICOS.has(campo)
    const b = await bot(`Tu archivo no trae <b>${esc(minuscula(campo))}</b>.${numerico ? ' ¿Qué hago?' : ' Sin eso no puedo armar tus productos.'}`)
    const opciones = numerico
      ? [{ texto: 'Dejar todas en 0', valor: 'ceros' }, { texto: 'Poner el mismo valor a todas', valor: 'mismo' }, { texto: 'Subir otro archivo', valor: 'reupload' }]
      : [{ texto: 'Subir otro archivo', valor: 'reupload' }, { texto: 'Corregirlos aquí', valor: 'lista' }]
    for (;;) {
      const r = await chips(b, opciones)
      vivo()
      if (r === 'reupload') { reportar('correccion_reupload', campo, lista.length); return 'reupload' }
      if (r === 'lista') return 'lista'
      if (r === 'ceros') {
        estado.opciones = conValorColumna(estado.opciones, campo, 0)
        estado.decisiones.ceros[campo] += lista.length
        reportar('correccion_ceros', campo, lista.length)
        return 'resuelto'
      }
      const valor = await pedirNumero(b, campo)
      vivo()
      if (valor === null) continue
      estado.opciones = conValorColumna(estado.opciones, campo, valor)
      estado.decisiones.valorComun[campo] = { valor, filas: lista.length }
      reportar('correccion_corrigio', campo, lista.length)
      return 'resuelto'
    }
  }

  // Lista de filas sueltas (hasta 50 por ronda), con campo y control propio por línea.
  // → 'reupload' si el cliente prefiere subir otro archivo; si no, resuelve sin valor.
  async function filasSueltas(campo, lista, { sinAtajo = false } = {}) {
    const visibles = pagina(lista)
    const numerico = NUMERICOS.has(campo)
    const etiquetaControl = numerico ? 'En 0' : 'Omitir'
    const atajo = numerico ? 'Dejar todos en 0' : 'Omitir todas estas filas'
    const hay = visibles.length
    const dato = minuscula(campo)
    const n = ++contadorEditores
    const b = await bot(`Encontré <b>${lista.length}</b> ${esc(lista.length === 1 ? dato : PLURAL[campo])} que no puedo usar tal cual. Escribe el valor correcto o elige qué hacer.${
      lista.length > hay ? ` <span class="inv-nota">Te los muestro de ${hay} en ${hay}.</span>` : ''}`)
    return new Promise(resolver => {
      const caja = document.createElement('div')
      caja.className = 'inv-corr-editor'
      const lineas = visibles.map((p, i) => {
        const nombre = String(p.nombre ?? '').trim() || '(sin nombre)'
        const texto = `Fila ${p.fila} · ${nombre} — ${descripcionMotivo(p)}`
        return `<div class="inv-corr-linea" data-linea="${i}">
          <label class="inv-corr-texto" for="inv-corr-${n}-${i}">${esc(texto)}</label>
          <div class="inv-corr-control">
            <input class="inv-entrada" id="inv-corr-${n}-${i}" type="text" data-fila="${esc(p.fila)}" data-campo="${esc(campo)}"
              ${numerico || campo === 'precioTotal' ? 'inputmode="decimal"' : ''} autocomplete="off"
              placeholder="${campo === 'nombre' ? 'Nombre del producto' : '0'}" aria-label="${esc(`${ETIQUETA_CAMPO[campo]} de la fila ${p.fila}`)}">
            <button type="button" class="inv-ia-sacar" data-control="${i}" aria-pressed="false">${esc(etiquetaControl)}</button>
          </div>
          <small class="inv-corr-error" role="alert"></small>
        </div>`
      }).join('')
      caja.innerHTML = `<div class="inv-corr-lista">${lineas}</div>
        <small class="inv-corr-error inv-corr-general" role="alert"></small>
        <div class="inv-acciones"><button type="button" class="inv-chipbtn inv-chipbtn-fuerte" data-accion="listo">Listo</button>
        ${sinAtajo ? "" : `<button type="button" class="inv-chipbtn" data-accion="atajo">${esc(atajo)}</button>`}
        <button type="button" class="inv-chipbtn" data-accion="reupload">Subir otro archivo</button></div>`
      const general = caja.querySelector('.inv-corr-general')
      const marcados = new Set()  // líneas con "En 0" / "Omitir" activo

      const cerrar = resumen => {
        caja.querySelector('.inv-acciones').remove()
        caja.querySelectorAll('input, button').forEach(el => { el.disabled = true })
        usuario(resumen)
      }

      caja.addEventListener('click', e => {
        const btn = e.target.closest('[data-control]')
        if (!btn) return
        const i = Number(btn.dataset.control)
        const activo = !marcados.has(i)
        if (activo) marcados.add(i); else marcados.delete(i)
        btn.setAttribute('aria-pressed', String(activo))
        const entrada = caja.querySelector(`#inv-corr-${n}-${i}`)
        entrada.disabled = activo
        if (activo) { entrada.value = ''; entrada.removeAttribute('aria-invalid') }
        const linea = btn.closest('.inv-corr-linea')
        linea.classList.toggle('inv-corr-marcada', activo)
        linea.querySelector('.inv-corr-error').textContent = ''
      })

      caja.querySelector('[data-accion="listo"]').addEventListener('click', () => {
        const valores = []
        const malas = []
        visibles.forEach((p, i) => {
          if (marcados.has(i)) return
          const entrada = caja.querySelector(`#inv-corr-${n}-${i}`)
          const v = validarValor(campo, entrada.value, estado.opciones.formatoNumero)
          const aviso = entrada.closest('.inv-corr-linea').querySelector('.inv-corr-error')
          if (v.ok) { valores.push({ p, valor: v.valor }); aviso.textContent = ''; entrada.removeAttribute('aria-invalid'); return }
          malas.push(entrada)
          aviso.textContent = campo === 'nombre' ? 'Escribe un nombre.' : 'Escribe un número de 0 en adelante.'
          entrada.setAttribute('aria-invalid', 'true')
        })
        if (malas.length) {
          general.textContent = `Falta resolver ${malas.length}. ${campo === 'nombre' ? 'Escribe un nombre' : 'Escribe un número de 0 en adelante'} o ${numerico ? 'pulsa «En 0»' : 'pulsa «Omitir»'} en cada línea.`
          malas[0].focus()
          return
        }
        general.textContent = ''
        const marcadas = [...marcados].map(i => visibles[i])
        let opts = estado.opciones
        for (const { p, valor } of valores) opts = conCorreccion(opts, p.fila, campo, valor)
        if (marcadas.length) opts = numerico ? conCeros(opts, marcadas) : conOmitidas(opts, marcadas.map(p => p.fila))
        estado.opciones = opts
        estado.decisiones.corregidos += valores.length
        if (marcadas.length) {
          if (numerico) estado.decisiones.ceros[campo] += marcadas.length
          else estado.decisiones.omitidas += marcadas.length
        }
        if (valores.length) reportar('correccion_corrigio', campo, valores.length)
        if (marcadas.length) reportar(numerico ? 'correccion_ceros' : 'correccion_omitio', campo, marcadas.length)
        const partes = []
        if (valores.length) partes.push(plural(valores.length, 'corregido', 'corregidos'))
        if (marcadas.length) partes.push(numerico ? `${marcadas.length} en 0` : plural(marcadas.length, 'omitida', 'omitidas'))
        cerrar(`Listo: ${partes.join(' y ')}`)
        resolver()
      })

      // El atajo aplica a TODOS los pendientes del campo, no solo a los visibles.
      caja.querySelector('[data-accion="atajo"]')?.addEventListener('click', () => {
        if (numerico) {
          estado.opciones = conCeros(estado.opciones, lista)
          estado.decisiones.ceros[campo] += lista.length
          reportar('correccion_ceros', campo, lista.length)
        } else {
          estado.opciones = conOmitidas(estado.opciones, lista.map(p => p.fila))
          estado.decisiones.omitidas += lista.length
          reportar('correccion_omitio', campo, lista.length)
        }
        cerrar(atajo)
        resolver()
      })

      // Salida siempre disponible: el cliente puede cambiar de archivo en vez de corregir aquí.
      caja.querySelector('[data-accion="reupload"]').addEventListener('click', () => {
        reportar('correccion_reupload', campo, lista.length)
        cerrar('Subir otro archivo')
        resolver('reupload')
      })

      b.appendChild(caja)
      alDesplazar()
      caja.querySelector('.inv-entrada')?.focus({ preventScroll: true })
    })
  }

  // → 'ok' | 'reupload'
  async function correr() {
    for (const campo of FASES) {
      let r = sesion.recalcular()
      let abierta = false
      let directa = false  // el cliente pidió "Corregirlos aquí" en nombre/precio
      while (pendientesDeFase(r, campo).length) {
        const lista = pendientesDeFase(r, campo)
        if (!abierta) { abierta = true; reportar('correccion_pendientes', campo, lista.length) }
        let paso = 'lista'
        if (esColumnaCompleta(r, campo) && !directa) {
          paso = await columnaCompleta(campo, lista)
          if (paso === 'reupload') return 'reupload'
          if (paso === 'lista') directa = true
        }
        if (paso === 'lista') {
          // Columna entera vacía en nombre/precio: omitir todo dejaría 0 productos, no se ofrece.
          const salida = await filasSueltas(campo, lista, { sinAtajo: directa && !NUMERICOS.has(campo) })
          vivo()
          if (salida === 'reupload') return 'reupload'
        }
        r = sesion.recalcular()
        // Una ronda siempre debe resolver las filas que mostró; si no, es un error de programación.
        if (paso === 'lista' && pendientesDeFase(r, campo).length >= lista.length) {
          throw new Error(`correccion_sin_progreso:${campo}`)
        }
      }
    }
    return 'ok'
  }

  return { correr }
}
