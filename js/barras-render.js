// js/barras-render.js — dibuja, imprime y descarga códigos de barras y QR.
//
// Todo se dibuja como SVG (una sola vía para vista previa, impresión y descarga) y
// ocurre en el navegador. Las librerías se cargan solo cuando alguien las necesita.
import { PAPELES } from './barras.js'

const LIBS = {
  barras: ['https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js', () => globalThis.JsBarcode],
  qr: ['https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js', () => globalThis.qrcode],
  zip: ['https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', () => globalThis.JSZip],
}
const cargas = {}
export function cargarLib(nombre) {
  const [src, global] = LIBS[nombre]
  if (global()) return Promise.resolve(global())
  cargas[nombre] ??= new Promise((ok, fallo) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = () => ok(global())
    s.onerror = () => { delete cargas[nombre]; fallo(new Error('No se pudo cargar la herramienta de códigos. Revisa tu conexión.')) }
    document.head.appendChild(s)
  })
  return cargas[nombre]
}

const escXml = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

// → { inner, ancho, alto } del código solo (sin el texto del producto).
function dibujarCodigo(tipo, dato, o) {
  if (tipo === 'qr') {
    const qr = globalThis.qrcode(0, 'M')
    qr.addData(String(dato))
    qr.make()
    const n = qr.getModuleCount()
    const margen = 4
    const celda = Math.max(1, Math.floor(o.tamaño.qr / (n + margen * 2)))
    const lado = (n + margen * 2) * celda
    let d = ''
    for (let f = 0; f < n; f++) for (let c = 0; c < n; c++) {
      if (qr.isDark(f, c)) d += `M${(c + margen) * celda},${(f + margen) * celda}h${celda}v${celda}h-${celda}z`
    }
    return { inner: `<rect width="${lado}" height="${lado}" fill="#fff"/><path d="${d}" fill="#000"/>`, ancho: lado, alto: lado }
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  globalThis.JsBarcode(svg, String(dato), {
    format: o.formato, width: o.tamaño.barra, height: o.tamaño.alto, displayValue: o.mostrarNumero,
    fontSize: o.tamaño.fuente + 4, margin: 8, background: '#ffffff', lineColor: '#000000', fontColor: '#000000',
  })
  return { inner: svg.innerHTML, ancho: parseFloat(svg.getAttribute('width')), alto: parseFloat(svg.getAttribute('height')) }
}

// Etiqueta completa (nombre + código) como texto SVG.
// o: { formato, tamaño, mostrarNumero, mostrarNombre }. Lanza si el dato no sirve.
export function etiquetaSvg(tipo, item, o) {
  const { inner, ancho, alto } = dibujarCodigo(tipo, item.codigo, o)
  const conTexto = o.mostrarNombre && item.texto
  const fs = o.tamaño.fuente + 2
  const altoTexto = conTexto ? Math.ceil(fs * 1.9) : 0
  const maxCar = Math.max(6, Math.floor(ancho / (fs * 0.58)))
  const texto = conTexto ? (item.texto.length > maxCar ? `${item.texto.slice(0, maxCar - 1)}…` : item.texto) : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto + altoTexto}" viewBox="0 0 ${ancho} ${alto + altoTexto}">`
    + `<rect width="${ancho}" height="${alto + altoTexto}" fill="#fff"/>`
    + (texto ? `<text x="${ancho / 2}" y="${fs + 4}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="${fs}" fill="#000">${escXml(texto)}</text>` : '')
    + `<g transform="translate(0,${altoTexto})">${inner}</g></svg>`
}

export const papelPorId = id => PAPELES.find(p => p.id === id) ?? PAPELES[0]

// Imprime en este mismo documento: se inserta la hoja de impresión, el CSS de
// impresión esconde todo lo demás (css/inventario.css) y se limpia al terminar.
export function imprimir(svgs, papel) {
  const raiz = document.createElement('div')
  raiz.id = 'inv-impresion'
  raiz.className = papel.ancho ? 'inv-imp-etiquetas' : 'inv-imp-hoja'
  raiz.innerHTML = svgs.map(s => `<div class="inv-et">${s}</div>`).join('')
  const estilo = document.createElement('style')
  estilo.textContent = papel.ancho
    ? `@page { size: ${papel.ancho}mm ${papel.alto}mm; margin: 0 } #inv-impresion .inv-et { width: ${papel.ancho}mm; height: ${papel.alto}mm } #inv-impresion svg { max-width: ${papel.ancho - 4}mm; max-height: ${papel.alto - 4}mm }`
    : '@page { margin: 10mm }'
  document.body.classList.add('inv-imprimiendo')
  document.body.append(raiz, estilo)
  const limpiar = () => { raiz.remove(); estilo.remove(); document.body.classList.remove('inv-imprimiendo'); window.removeEventListener('afterprint', limpiar) }
  window.addEventListener('afterprint', limpiar)
  setTimeout(() => window.print(), 80)
}

// SVG → PNG (a escala 3 para que quede nítido al imprimir). Usa data: porque la
// política de seguridad del portal no permite imágenes blob:.
function svgAPng(svg, escala = 3) {
  return new Promise((ok, fallo) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.width * escala; c.height = img.height * escala
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0, c.width, c.height)
      c.toBlob(b => (b ? ok(b) : fallo(new Error('No se pudo crear la imagen.'))), 'image/png')
    }
    img.onerror = () => fallo(new Error('No se pudo crear la imagen.'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

const nombreSeguro = (s, i) => `${String(s).replace(/[^a-z0-9._-]+/gi, '_').slice(0, 60) || 'codigo'}-${i + 1}`

// Un ZIP con un PNG y un SVG por cada código distinto.
export async function descargarZip(piezas) {
  const JSZip = await cargarLib('zip')
  const zip = new JSZip()
  for (const [i, p] of piezas.entries()) {
    const base = nombreSeguro(p.codigo, i)
    zip.file(`${base}.svg`, p.svg)
    zip.file(`${base}.png`, await svgAPng(p.svg))
  }
  guardar(await zip.generateAsync({ type: 'blob' }), 'codigos.zip')
}

export function guardar(blob, nombre) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}
