// Política de sanitizado del HTML legacy de las lecciones: decide QUÉ se
// permite. La mecánica de recorrer el DOM vive en js/block-renderer.js.
// Import-safe (sin DOM): es lo que hace testeable la parte con criterio.
//
// Contexto: el bloque `html` (contenido viejo escrito a mano por un admin) se
// pinta con innerHTML. La CSP de vercel.json ya bloquea scripts inline, pero un
// atributo como onerror no es un script inline y pasaría igual.
//
// Criterio general: ante la duda, conservar el CONTENIDO y descartar el
// atributo. Este cambio no puede romper lecciones viejas.

// Etiquetas que puede haber escrito a mano un admin en una lección.
const PERMITIDAS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'small', 'sub', 'sup',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'code', 'pre', 'span', 'div', 'a', 'img', 'hr',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
])

// Estas se borran CON su contenido: lo que hay adentro no es texto de la
// lección. El resto de las no permitidas se desenvuelve (se pierde la etiqueta,
// se conserva el texto), así un tag raro no borra media lección.
const BORRAR_CON_CONTENIDO = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'form', 'input',
  'button', 'select', 'textarea', 'link', 'meta', 'svg', 'math',
])

// Atributos válidos en cualquier etiqueta permitida. `style` NO está: no
// ejecuta JS en navegadores actuales, pero permite tapar la UI del portal con
// un position:fixed, y ninguna lección lo necesita.
const GENERICOS = new Set(['class', 'title', 'id'])

const POR_ETIQUETA = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan']),
}

const ESQUEMAS_OK = ['http:', 'https:', 'mailto:', 'tel:']

export function isAllowedTag(tag) {
  if (typeof tag !== 'string' || !tag) return false
  return PERMITIDAS.has(tag.toLowerCase())
}

export function isDroppedWithContent(tag) {
  if (typeof tag !== 'string' || !tag) return false
  return BORRAR_CON_CONTENIDO.has(tag.toLowerCase())
}

export function isAllowedAttr(tag, attr) {
  if (typeof tag !== 'string' || !tag) return false
  if (typeof attr !== 'string' || !attr) return false
  const t = tag.toLowerCase()
  const a = attr.toLowerCase()
  // Los manejadores de eventos son EL vector real: <img src=x onerror=...>
  // pasa cualquier CSP de scripts inline porque es un atributo.
  if (a.startsWith('on')) return false
  if (GENERICOS.has(a)) return true
  return POR_ETIQUETA[t]?.has(a) === true
}

// Quita espacios y caracteres de control (todo lo que sea <= 0x20). Se hace
// solo para decidir; el valor original no se toca. Los navegadores ignoran
// esos caracteres dentro del esquema, así que "java\nscript:" sí ejecuta.
// Escrito con charCodeAt y no con un rango de regex a propósito: un rango
// ingenuo tipo [\s -] barre además !"#$%&'()*+,- y rompe URLs válidas.
function sinEspaciosNiControl(value) {
  let out = ''
  for (const c of value) {
    if (c.charCodeAt(0) > 0x20) out += c
  }
  return out
}

// ¿Se puede poner este valor en un href o un src?
// Sin esquema (rutas relativas, anclas) es seguro. Con esquema, solo los de la
// lista blanca, más data: cuando es una imagen.
export function isSafeUrlValue(value) {
  if (typeof value !== 'string') return false
  const limpio = sinEspaciosNiControl(value)
  if (!limpio) return false
  const bajo = limpio.toLowerCase()
  if (bajo.startsWith('data:')) return bajo.startsWith('data:image/')
  const dosPuntos = limpio.indexOf(':')
  const barra = limpio.indexOf('/')
  if (dosPuntos === -1) return true
  // Un ':' después de la primera '/' no es un esquema: "a/b:c" es relativa.
  if (barra !== -1 && barra < dosPuntos) return true
  return ESQUEMAS_OK.includes(bajo.slice(0, dosPuntos + 1))
}
