// js/inv-numeros.js — lectura tolerante de números, textos y códigos que vienen
// de archivos de otros sistemas (Alegra, Siigo, Excel propio…).
//
// Módulo puro, sin DOM. Lo usan inv-origen.js e inv-convertir.js.

// Minúsculas, sin tildes, sin signos y con espacios simples: para comparar
// encabezados, categorías y unidades sin que importe cómo las escribió el cliente.
export function normalizar(v) {
  return String(v ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const cuenta = (s, ch) => s.split(ch).length - 1

// Convierte "5000,000000", "1.234,50", "1,234.50", "$ 5.950" o un número real.
// `formato`: 'auto' | 'punto' (el punto es decimal) | 'coma' (la coma es decimal).
// En 'auto', un único separador con exactamente 3 dígitos detrás se toma como
// miles ("5.950" → 5950): es el caso común en precios; si no, es decimal.
export function parseNumero(v, formato = 'auto') {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v == null) return null
  let s = String(v).trim().replace(/[^\d.,-]/g, '')
  const negativo = s.startsWith('-')
  s = s.replace(/-/g, '')
  if (s === '' || !/\d/.test(s)) return null

  const comas = cuenta(s, ','), puntos = cuenta(s, '.')
  let decimal = null
  if (formato === 'coma') decimal = ','
  else if (formato === 'punto') decimal = '.'
  else if (comas && puntos) decimal = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.'
  else if (comas + puntos > 0) {
    const sep = comas ? ',' : '.'
    if (cuenta(s, sep) === 1) {
      const cola = s.length - s.indexOf(sep) - 1
      if (cola !== 3 || /^0[.,]/.test(s)) decimal = sep
    }
  }

  const entero = decimal ? s.split(decimal)[0] : s
  const fraccion = decimal ? s.split(decimal).slice(1).join('') : ''
  const limpio = entero.replace(/[.,]/g, '') + (fraccion ? '.' + fraccion.replace(/[.,]/g, '') : '')
  const n = Number(limpio)
  if (!Number.isFinite(n)) return null
  return negativo ? -n : n
}

// "Sí"/"No" en las formas que suelen traer los archivos.
export function parseSiNo(v) {
  const s = normalizar(v)
  if (['si', 's', 'yes', 'y', 'true', '1', 'x', 'verdadero'].includes(s)) return true
  if (['no', 'n', 'false', '0', 'falso'].includes(s)) return false
  return null
}

// Un impuesto puede venir como 19, "19%", "IVA - 19.00%", "16-Impoconsumo 8%",
// "Exento". Devuelve el porcentaje o null si no hay forma de saberlo.
export function parseImpuesto(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v ?? '').trim()
  if (!s) return null
  if (/exento|excluido/i.test(s) && !/\d/.test(s)) return 0
  const conPct = s.match(/(\d+(?:[.,]\d+)?)\s*%/)
  const cualquiera = conPct || s.match(/(\d+(?:[.,]\d+)?)/)
  return cualquiera ? parseNumero(cualquiera[1], 'auto') ?? null : null
}

// Los códigos son texto: un código de barras como número entero se escribe sin
// notación científica. Si Excel ya lo convirtió ("7.50123E+12") el dato original
// se perdió y se avisa con `danado`.
export function aCodigo(v) {
  if (v == null || v === '') return { texto: '', danado: false }
  if (typeof v === 'number') {
    const texto = Number.isInteger(v) ? v.toLocaleString('fullwide', { useGrouping: false }) : String(v)
    return { texto, danado: false }
  }
  const texto = String(v).trim()
  return { texto, danado: /^\d+(?:[.,]\d+)?e\+?\d+$/i.test(texto) }
}

export function aTexto(v) {
  return v == null ? '' : String(v).trim()
}
