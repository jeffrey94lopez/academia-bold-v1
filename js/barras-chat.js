// js/barras-chat.js — generador de códigos de barras y QR como conversación con BolBot.
//
// Pregunta qué quiere crear, de dónde salen los códigos (pegados, de un Excel o
// creados aquí), cómo imprimirlos y entrega vista previa + impresión + descarga.
// Sin IA ni tokens; los datos no salen del navegador.
import { crearBase, esc, CANCELADO } from './chat-base.js'
import { FORMATOS_BARRAS, PAPELES, TAMAÑOS, validarBarras, parsearEntrada, interpretarFilas, nombresDeFilas } from './barras.js'
import { FORMATOS_CODIGO, crearGeneradorCodigos } from './inv-codigos.js'
import { cargarXlsx } from './inv-sesion.js'
import { leerLibro } from './inv-excel.js'
import { telemetriaReal } from './herramientas-telemetria.js'
import { cargarLib, etiquetaSvg, imprimir, descargarZip, guardar, papelPorId } from './barras-render.js'

export const TEXTO_INTRO_CODIGOS = 'Te ayudo a crear códigos de barras o QR listos para imprimir. Tus datos no salen de tu computador.'

// Qué tamaño de dibujo le queda bien a cada papel.
const TAMAÑO_SUGERIDO = { hoja: 'mediano', 'etq-50-30': 'mediano', 'etq-38-25': 'chico', 'etq-100-50': 'grande', 'ticket-80': 'mediano', 'ticket-58': 'chico' }
const COPIAS = [1, 2, 5, 10]
const sn = [{ texto: 'Sí', valor: true }, { texto: 'No', valor: false }]
const recomendada = (lista, id, texto = x => x.etiqueta) => {
  const i = lista.findIndex(x => x.id === id)
  return [lista[i], ...lista.filter((_, j) => j !== i)].map((x, k) => ({ texto: texto(x) + (k === 0 ? ' (recomendado)' : ''), detalle: x.detalle, valor: x.id }))
}

async function filasDeArchivo(file) {
  const XLSX = await cargarXlsx()
  const { hojas } = leerLibro(XLSX, await file.arrayBuffer(), { csv: /\.csv$/i.test(file.name) })
  const nombre = Object.keys(hojas).find(n => hojas[n].some(f => f.some(c => String(c ?? '').trim() !== '')))
  return nombre ? hojas[nombre] : []
}
const esTxt = f => /\.txt$/i.test(f.name)

async function itemsDeArchivo(file) {
  return esTxt(file) ? parsearEntrada(await file.text()) : interpretarFilas(await filasDeArchivo(file))
}
async function nombresDeArchivo(file) {
  return esTxt(file) ? (await file.text()).split(/\r?\n/).map(l => l.trim()).filter(Boolean) : nombresDeFilas(await filasDeArchivo(file))
}

// `items`: [{ codigo, texto }] si ya los tienes (p. ej. del conversor de inventario).
// `nombres`: productos sin código, para crearles uno aquí. `via`: desde dónde arrancó
// (chat o inventario), para la métrica.
export async function iniciarCodigos({ host, alDesplazar = () => {}, items = null, nombres = null, via = 'chat', telemetria = telemetriaReal('codigos') }) {
  const base = crearBase({ host, alDesplazar })
  const { bot, chips, pedirArchivos, pedirCampos, vivo } = base
  let origenDatos = items ? 'inventario' : null
  const estado = { tipo: 'barras', items, formato: 'CODE128', papel: PAPELES[0], tamaño: TAMAÑOS[1], mostrarNumero: true, mostrarNombre: true, copias: 1 }

  // ---------- Qué crear ----------
  async function pasoTipo() {
    const b = await bot('¿Qué quieres crear?')
    estado.tipo = await chips(b, [
      { texto: 'Código de barras', detalle: 'Para tus productos: el lector de la caja lo lee al vender.', valor: 'barras' },
      { texto: 'Código QR', detalle: 'Para tu menú, un enlace o un pago: se lee con la cámara del celular.', valor: 'qr' },
    ])
    vivo()
  }

  // ---------- De dónde salen los códigos ----------
  async function pegar(b, { etiqueta, placeholder }) {
    const v = await pedirCampos(b, {
      campos: [{ id: 't', etiqueta, tipo: 'area', placeholder, requerido: true }],
      resumen: v => `Pegué ${v.t.split(/\r?\n/).filter(l => l.trim()).length} línea(s)`,
    })
    vivo()
    return v.t
  }

  async function nombresPegadosOSubidos() {
    const q = await bot('Dime los nombres de tus productos y le creo un código a cada uno.')
    const como = await chips(q, [{ texto: 'Pegar los nombres', valor: 'pegar' }, { texto: 'Subir un Excel o CSV', valor: 'subir' }])
    vivo()
    for (;;) {
      if (como === 'pegar') {
        const t = await pegar(q, { etiqueta: 'Un nombre por línea', placeholder: 'Arroz Roa 1kg\nLeche Colanta 1L\nAceite Girasoli 900ml' })
        const lista = t.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
        if (lista.length) return lista
      } else {
        const [f] = await pedirArchivos(q, { boton: 'Subir lista de productos', accept: '.xlsx,.xls,.csv,.txt' })
        vivo()
        let lista = []
        try { lista = await nombresDeArchivo(f) } catch { /* se avisa abajo */ }
        if (lista.length) return lista
      }
      telemetria.error('datos', 'datos_vacios')
      await bot('No encontré nombres ahí. Prueba de nuevo: un nombre por línea, o una columna llamada «Nombre».', { demora: 250 })
    }
  }

  async function crearCodigos(lista) {
    const todos = lista.length
    const q = await bot(`Voy a crear <b>${todos}</b> código(s). ¿Con qué estilo?${estado.tipo === 'barras' ? ' Si vas a imprimir códigos de barras, el <b>numérico de 13 dígitos</b> es el más seguro.' : ''}`)
    const formato = await chips(q, FORMATOS_CODIGO.map(f => ({ texto: f.etiqueta, detalle: f.detalle, valor: f.id })))
    vivo()
    const opciones = { formato, prefijo: '', inicio: 1, relleno: 3 }
    if (formato === 'personalizado') {
      const b = await bot('Cuéntame cómo quieres que empiecen. Por ejemplo, con prefijo <b>TIENDA</b> y número inicial <b>001</b> salen TIENDA-001, TIENDA-002…')
      const v = await pedirCampos(b, {
        campos: [
          { id: 'prefijo', etiqueta: 'Prefijo (opcional)', placeholder: 'TIENDA' },
          { id: 'inicio', etiqueta: 'Número inicial', placeholder: '001', valor: '001', requerido: true },
        ],
        resumen: v => `${v.prefijo ? `${v.prefijo}-` : ''}${v.inicio}`,
      })
      vivo()
      opciones.prefijo = v.prefijo
      opciones.inicio = parseInt(v.inicio, 10) || 1
      opciones.relleno = /^\d+$/.test(v.inicio) ? v.inicio.length : 3
    }
    const g = crearGeneradorCodigos(opciones)
    const items = lista.map(n => ({ codigo: g(n), texto: n }))
    telemetria.paso('codigos_creados')
    const b = await bot(`✅ Listo, creé <b>${items.length}</b> código(s). Por ejemplo, <code>${esc(items[0].codigo)}</code> para «${esc(items[0].texto)}».
      <p class="inv-nota">Guarda esta lista: son los códigos de tus productos. Puedes pegarlos en la columna <b>Código</b> de la plantilla de Bold POS.</p>`)
    const fila = document.createElement('div')
    fila.className = 'inv-acciones'
    const btn = document.createElement('button')
    btn.type = 'button'; btn.className = 'inv-chipbtn'; btn.textContent = '⬇️ Descargar lista en Excel'
    btn.addEventListener('click', async () => {
      const XLSX = await cargarXlsx()
      const libro = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['Código', 'Nombre'], ...items.map(i => [i.codigo, i.texto])]), 'Códigos')
      guardar(new Blob([XLSX.write(libro, { type: 'array', bookType: 'xlsx' })], { type: 'application/octet-stream' }), 'Códigos de productos.xlsx')
      telemetria.fin('lista_codigos', { cantidad: items.length })
    })
    fila.appendChild(btn); b.appendChild(fila)
    alDesplazar()
    return items
  }

  async function pasoDatos() {
    if (estado.items?.length) return
    if (nombres?.length) { origenDatos = 'inventario_crear'; estado.items = await crearCodigos(nombres); return }
    const barras = estado.tipo === 'barras'
    const opciones = [
      { texto: 'Escribirlos o pegarlos', detalle: barras ? 'Un código por línea.' : 'Un enlace o texto por línea.', valor: 'pegar' },
      { texto: 'Subir un Excel o CSV', detalle: 'Con una columna de código y, si quieres, otra con el nombre.', valor: 'subir' },
    ]
    if (barras) opciones.push({ texto: 'No tengo códigos, créalos tú', detalle: 'Te los invento a partir de los nombres de tus productos.', valor: 'crear' })
    const q = await bot(barras ? '¿De dónde tomo los códigos?' : '¿Qué debe contener cada QR? Puede ser el enlace de tu menú, tu WhatsApp, un texto…')
    const como = await chips(q, opciones)
    vivo()
    if (como === 'crear') { origenDatos = 'crear'; estado.items = await crearCodigos(await nombresPegadosOSubidos()); return }
    origenDatos = como
    for (;;) {
      let items = []
      if (como === 'pegar') {
        const t = await pegar(q, {
          etiqueta: barras ? 'Un código por línea' : 'Un enlace o texto por línea',
          placeholder: barras ? '7701234567890;Leche Colanta 1L\n7709876543210;Arroz Roa 1kg' : 'https://wa.me/50499999999;WhatsApp\nhttps://mi-negocio.com/menu;Menú',
        })
        items = parsearEntrada(t)
      } else {
        const [f] = await pedirArchivos(q, { boton: 'Subir archivo', accept: '.xlsx,.xls,.csv,.txt' })
        vivo()
        try { items = await itemsDeArchivo(f) } catch { /* se avisa abajo */ }
      }
      if (items.length) {
        estado.items = items
        const conNombre = items.filter(i => i.texto).length
        await bot(`Encontré <b>${items.length}</b> ${barras ? 'código(s)' : 'QR por crear'}${conNombre ? ` (${conNombre} con nombre)` : ''}. Por ejemplo: <code>${esc(items[0].codigo.slice(0, 40))}</code>.`, { demora: 300 })
        return
      }
      telemetria.error('datos', 'datos_vacios')
      await bot('No encontré ningún dato ahí. Prueba otra vez: un código por línea, o un Excel con una columna «Código».', { demora: 250 })
    }
  }

  // ---------- Formato del código de barras ----------
  async function pasoFormato() {
    const todos13 = estado.items.every(i => /^\d{13}$/.test(i.codigo) && validarBarras('EAN13', i.codigo).valido)
    for (;;) {
      const b = await bot(`¿Con qué tipo de código de barras los imprimo? ${todos13 ? 'Tus códigos tienen 13 dígitos válidos: <b>EAN-13</b> es lo más natural.' : 'Si no estás seguro, elige <b>Code 128</b>: funciona con cualquier código.'}`)
      estado.formato = await chips(b, recomendada(FORMATOS_BARRAS, todos13 ? 'EAN13' : 'CODE128'))
      vivo()
      const malos = estado.items.filter(i => !validarBarras(estado.formato, i.codigo).valido)
      if (!malos.length) return
      const f = FORMATOS_BARRAS.find(x => x.id === estado.formato)
      telemetria.error('formato', 'formato_invalido', { cantidad: malos.length, formato: estado.formato })
      const cuantos = malos.length === estado.items.length ? (malos.length === 1 ? 'Tu código no sirve' : `Los <b>${malos.length}</b> códigos no sirven`) : `<b>${malos.length}</b> de tus ${estado.items.length} códigos no sirven`
      const q = await bot(`${cuantos} para ${f.etiqueta}. Por ejemplo «${esc(malos[0].codigo)}»: ${esc(validarBarras(estado.formato, malos[0].codigo).mensaje)}`)
      const acc = await chips(q, [
        { texto: 'Usar Code 128 para todos', valor: '128' },
        { texto: 'Elegir otro formato', valor: 'otro' },
        { texto: 'Omitir los que no sirven', valor: 'omitir' },
      ])
      vivo()
      if (acc === '128') { estado.formato = 'CODE128'; return }
      if (acc === 'omitir') {
        // Solo se descartan si queda alguno: con la lista vacía no habría nada que imprimir.
        const validos = estado.items.filter(i => validarBarras(estado.formato, i.codigo).valido)
        if (validos.length) { estado.items = validos; return }
        await bot('Ninguno sirve con ese formato. Elijamos otro.', { demora: 250 })
      }
    }
  }

  // ---------- Papel, tamaño y detalles ----------
  async function pasoDiseño() {
    const b = await bot('¿En qué los vas a imprimir? Si tienes impresora de etiquetas, elige el tamaño de tu rollo; si no, una hoja normal sirve.')
    estado.papel = papelPorId(await chips(b, PAPELES.map(p => ({ texto: p.etiqueta, detalle: p.detalle, valor: p.id }))))
    vivo()

    const t = await bot('¿Qué tan grande quieres cada código?')
    const idTam = await chips(t, recomendada(TAMAÑOS, TAMAÑO_SUGERIDO[estado.papel.id], x => x.etiqueta))
    estado.tamaño = TAMAÑOS.find(x => x.id === idTam)
    vivo()

    if (estado.tipo === 'barras') {
      const q = await bot('¿Muestro el número debajo de las barras?')
      estado.mostrarNumero = await chips(q, sn)
      vivo()
    }
    if (estado.items.some(i => i.texto)) {
      const q = await bot(`¿Muestro el ${estado.tipo === 'barras' ? 'nombre del producto' : 'nombre'} sobre el código?`)
      estado.mostrarNombre = await chips(q, sn)
      vivo()
    }
    const c = await bot('¿Cuántas copias de cada uno?')
    const n = await chips(c, [...COPIAS.map(x => ({ texto: String(x), valor: x })), { texto: 'Otra cantidad', valor: 0 }])
    vivo()
    if (n) estado.copias = n
    else {
      const b2 = await bot('Escribe la cantidad de copias:', { demora: 250 })
      const v = await pedirCampos(b2, { campos: [{ id: 'n', etiqueta: 'Copias', tipo: 'number', valor: '1', requerido: true }], resumen: v => `${v.n} copias` })
      vivo()
      estado.copias = Math.min(500, Math.max(1, parseInt(v.n, 10) || 1))
    }
  }

  // ---------- Resultado ----------
  async function pasoResultado() {
    try { await cargarLib(estado.tipo === 'qr' ? 'qr' : 'barras') } catch (e) { telemetria.error('resultado', 'libreria_no_carga'); await bot(`⚠️ ${esc(e.message)}`); return 'terminar' }
    const piezas = [], fallos = []
    const o = { formato: estado.formato, tamaño: estado.tamaño, mostrarNumero: estado.mostrarNumero, mostrarNombre: estado.mostrarNombre }
    for (const it of estado.items) {
      try { piezas.push({ codigo: it.codigo, svg: etiquetaSvg(estado.tipo, it, o) }) } catch (e) { fallos.push({ it, e }) }
    }
    if (fallos.length) telemetria.error('resultado', 'dibujo_fallo', { cantidad: fallos.length })
    if (!piezas.length) { telemetria.error('resultado', 'sin_resultado'); await bot('No pude dibujar ninguno con esos datos. Revisa los códigos e intentemos de nuevo.'); return 'cambiar' }
    const total = piezas.length * estado.copias
    telemetria.paso('resultado')
    const datosFin = () => ({
      tipo: estado.tipo, formato: estado.tipo === 'barras' ? estado.formato : null, papel: estado.papel.id,
      tamano: estado.tamaño.id, cantidad: piezas.length, copias: estado.copias, origen_datos: origenDatos,
    })
    const b = await bot(`¡Listo! 🎉 Armé <b>${piezas.length}</b> ${estado.tipo === 'qr' ? 'QR' : 'código(s) de barras'}${estado.copias > 1 ? `, <b>${estado.copias}</b> copias de cada uno: <b>${total}</b> en total` : ''}.${fallos.length ? ` <b>${fallos.length}</b> no se pudieron dibujar (${esc(fallos[0].it.codigo.slice(0, 30))}…).` : ''}
      <div class="inv-muestra">${piezas.slice(0, 6).map(p => `<div class="inv-et-vista">${p.svg}</div>`).join('')}</div>
      ${piezas.length > 6 ? `<p class="inv-nota">Mostrando 6 de ${piezas.length}.</p>` : ''}
      <p class="inv-nota">Al imprimir, en la ventana que se abre elige tu impresora y el tamaño real (100 %).</p>`, { demora: 700 })
    const fila = document.createElement('div')
    fila.className = 'inv-acciones'
    const imp = document.createElement('button')
    imp.type = 'button'; imp.className = 'inv-chipbtn inv-chipbtn-fuerte'; imp.textContent = `🖨️ Imprimir (${total})`
    imp.addEventListener('click', () => { imprimir(piezas.flatMap(p => Array(estado.copias).fill(p.svg)), estado.papel); telemetria.fin('impresion', datosFin()) })
    const zip = document.createElement('button')
    zip.type = 'button'; zip.className = 'inv-chipbtn'; zip.textContent = '⬇️ Descargar imágenes'
    zip.addEventListener('click', async () => {
      zip.disabled = true
      try { await descargarZip(piezas); telemetria.fin('zip', datosFin()) } catch (e) { telemetria.error('resultado', 'descarga_fallo'); await bot(`⚠️ ${esc(e.message)}`, { demora: 250 }) }
      zip.disabled = false
    })
    fila.append(imp, zip)
    b.appendChild(fila)
    alDesplazar()
    return chips(b, [{ texto: 'Cambiar opciones', valor: 'cambiar' }, { texto: 'Crear otros códigos', valor: 'otros' }, { texto: 'Terminar', valor: 'terminar' }])
  }

  try {
    telemetria.inicio(via)
    await bot(TEXTO_INTRO_CODIGOS)
    await pasoTipo()
    await pasoDatos(); telemetria.paso('datos')
    for (;;) {
      if (estado.tipo === 'barras') { await pasoFormato(); telemetria.paso('formato') }
      await pasoDiseño(); telemetria.paso('diseno')
      const sig = await pasoResultado()
      vivo()
      if (sig === 'otros') { await bot('Claro, empecemos con otros.', { demora: 250 }); return iniciarCodigos({ host, alDesplazar, via: 'reinicio' }) }
      if (sig === 'terminar') { await bot('Perfecto. Si necesitas más códigos, escríbeme «crear códigos de barras» o «crear un QR».', { demora: 250 }); return }
      await bot('Cambiemos las opciones.', { demora: 250 })
    }
  } catch (e) {
    if (e === CANCELADO) return
    console.error('[códigos] conversación interrumpida:', e)
    telemetria.error('desconocido', 'excepcion')
    await bot('Algo salió mal y no pude seguir. Recarga la página e inténtalo de nuevo.')
  }
}
