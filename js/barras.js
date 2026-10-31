// js/barras.js — reglas del generador de códigos de barras y QR (sin DOM).
//
// Validación de cada formato, lectura de lo que el cliente pega o sube, y las
// medidas de papel/etiqueta. El dibujo está en barras-render.js.
import { normalizar } from './inv-numeros.js'
import { digitoEan13, digitoUpc } from './inv-codigos.js'

export const FORMATOS_BARRAS = [
  { id: 'CODE128', etiqueta: 'Code 128', detalle: 'El más común: sirve para cualquier texto o número.' },
  { id: 'EAN13', etiqueta: 'EAN-13', detalle: 'El de los productos de tienda: 12 o 13 dígitos.' },
  { id: 'UPC', etiqueta: 'UPC', detalle: 'El de Estados Unidos: 11 o 12 dígitos.' },
  { id: 'CODE39', etiqueta: 'Code 39', detalle: 'Antiguo: solo mayúsculas, números y - . $ / + %.' },
]

// Medidas en mm de cada hoja/etiqueta. `ancho`/`alto` nulos = hoja completa.
export const PAPELES = [
  { id: 'hoja', etiqueta: 'Hoja carta o A4', detalle: 'Varios códigos por hoja, con líneas para recortar.', ancho: null, alto: null },
  { id: 'etq-50-30', etiqueta: 'Etiqueta 50 × 30 mm', detalle: 'La más usada en tiendas.', ancho: 50, alto: 30 },
  { id: 'etq-38-25', etiqueta: 'Etiqueta 38 × 25 mm', detalle: 'Para productos pequeños.', ancho: 38, alto: 25 },
  { id: 'etq-100-50', etiqueta: 'Etiqueta 100 × 50 mm', detalle: 'Cajas y empaques grandes.', ancho: 100, alto: 50 },
  { id: 'ticket-80', etiqueta: 'Rollo de 80 mm', detalle: 'Impresora de tickets; cada código en su tramo.', ancho: 80, alto: 40 },
  { id: 'ticket-58', etiqueta: 'Rollo de 58 mm', detalle: 'Impresora de tickets angosta.', ancho: 58, alto: 40 },
]

// Cuánto mide el código dibujado (en píxeles del dibujo, no del papel).
export const TAMAÑOS = [
  { id: 'chico', etiqueta: 'Pequeño', barra: 1.5, alto: 50, fuente: 10, qr: 90 },
  { id: 'mediano', etiqueta: 'Mediano', barra: 2, alto: 80, fuente: 12, qr: 120 },
  { id: 'grande', etiqueta: 'Grande', barra: 2.5, alto: 110, fuente: 14, qr: 160 },
]

// → { valido: true } o { valido: false, mensaje }
export function validarBarras(formato, dato) {
  const d = String(dato ?? '')
  if (!d) return { valido: false, mensaje: 'Está vacío.' }
  if (formato === 'EAN13') {
    if (!/^[0-9]{12,13}$/.test(d)) return { valido: false, mensaje: 'EAN-13 debe tener 12 o 13 dígitos.' }
    if (d.length === 13 && Number(d[12]) !== digitoEan13(d)) return { valido: false, mensaje: 'El último dígito (de control) no coincide.' }
  } else if (formato === 'UPC') {
    if (!/^[0-9]{11,12}$/.test(d)) return { valido: false, mensaje: 'UPC debe tener 11 o 12 dígitos.' }
    if (d.length === 12 && Number(d[11]) !== digitoUpc(d)) return { valido: false, mensaje: 'El último dígito (de control) no coincide.' }
  } else if (formato === 'CODE39') {
    if (!/^[A-Z0-9 .$/+%-]+$/.test(d)) return { valido: false, mensaje: 'Code 39 solo admite mayúsculas, números y - . $ / + %.' }
  }
  return { valido: true }
}

// Texto pegado → [{ codigo, texto }]. Cada línea: «código», «código;nombre» o dos
// columnas pegadas desde Excel (separadas por tabulador).
export function parsearEntrada(texto) {
  const items = []
  for (const linea of String(texto ?? '').split(/\r?\n/)) {
    const l = linea.trim()
    if (!l) continue
    const sep = ['\t', ';', ','].find(s => l.includes(s))
    if (!sep) { items.push({ codigo: l, texto: '' }); continue }
    const i = l.indexOf(sep)
    const codigo = l.slice(0, i).trim()
    if (codigo) items.push({ codigo, texto: l.slice(i + 1).split(sep)[0].trim() })
  }
  return items
}

const COL_CODIGO = /codigo|barra|sku|referencia|\bean\b|\bid\b/
const COL_TEXTO = /nombre|descripcion|producto|articulo|item/

// Filas de un Excel → [{ codigo, texto }]. Si la primera fila son títulos
// (Código, Nombre…) los usa; si no, toma la 1.ª columna como código y la 2.ª como texto.
export function interpretarFilas(filas) {
  const limpias = filas.filter(f => f.some(c => String(c ?? '').trim() !== ''))
  if (!limpias.length) return []
  const tit = limpias[0].map(normalizar)
  let cCod = tit.findIndex(t => COL_CODIGO.test(t))
  let cTxt = tit.findIndex(t => COL_TEXTO.test(t))
  const hayTitulos = cCod !== -1 || cTxt !== -1
  if (!hayTitulos) { cCod = 0; cTxt = limpias[0].length > 1 ? 1 : -1 }
  else if (cCod === -1) cCod = cTxt === 0 ? 1 : 0
  const datos = hayTitulos ? limpias.slice(1) : limpias
  return datos
    .map(f => ({ codigo: String(f[cCod] ?? '').trim(), texto: cTxt >= 0 && cTxt !== cCod ? String(f[cTxt] ?? '').trim() : '' }))
    .filter(i => i.codigo)
}

// Lista de nombres (para crearles código): un nombre por línea o la columna Nombre de un Excel.
export function nombresDeFilas(filas) {
  const limpias = filas.filter(f => f.some(c => String(c ?? '').trim() !== ''))
  if (!limpias.length) return []
  const c = limpias[0].map(normalizar).findIndex(t => COL_TEXTO.test(t))
  const datos = c === -1 ? limpias : limpias.slice(1)
  const col = c === -1 ? 0 : c
  return datos.map(f => String(f[col] ?? '').trim()).filter(Boolean)
}
