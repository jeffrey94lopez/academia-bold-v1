// Reemplaza una URL por otra dentro del `contenido` de una lección.
// Import-safe (sin DOM, sin supabase): la I/O vive en admin.js.
//
// La columna `contenido` guarda DOS formatos: un string JSON con el array de
// bloques (el moderno) y HTML crudo escrito a mano (el legacy; ver
// js/lessons.js:178-183). Por eso este helper trabaja sobre el TEXTO CRUDO y no
// sobre la estructura parseada: un solo camino sirve para los dos, y ninguna
// rama puede producir contenido vacío.

function parseaComoJson(s) {
  try {
    JSON.parse(s)
    return true
  } catch (_) {
    return false
  }
}

// Devuelve el contenido nuevo, o null para NO escribir la fila. Nunca devuelve
// vacío: o preserva todo lo que había con la URL cambiada, o null.
export function remapContentUrl(raw, oldUrl, newUrl) {
  if (typeof raw !== 'string' || !raw) return null
  if (typeof oldUrl !== 'string' || !oldUrl) return null
  if (typeof newUrl !== 'string' || !newUrl) return null
  if (!raw.includes(oldUrl)) return null
  const next = raw.split(oldUrl).join(newUrl)
  // Fail-closed: si el original era JSON válido, el resultado también tiene que
  // serlo. Cubre una URL nueva con comillas o backslashes que lo invalidarían.
  if (parseaComoJson(raw) && !parseaComoJson(next)) return null
  return next
}
