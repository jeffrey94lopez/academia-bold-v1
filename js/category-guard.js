// Decide si se puede borrar una categoría a partir del resultado de contar sus
// lecciones (el objeto { count, error } que devuelve una query de supabase).
//
// Bug #10: el borrado hacía `const { count } = await ...; if (count > 0)` e
// ignoraba el `error`. Si la query fallaba, `count` venía null y `null > 0` es
// false → la categoría se borraba igual y dejaba lecciones huérfanas (siguen
// apuntando a una categoría que ya no existe). La regla ahora: ante error o
// conteo desconocido NO se borra.
//
// Import-safe (sin dependencias): por eso es testeable en Node.

export function evaluarBorradoCategoria(resultadoConteo = {}) {
  const { count, error } = resultadoConteo
  if (error) return { permitido: false, razon: 'error' }
  if (typeof count !== 'number' || Number.isNaN(count)) {
    return { permitido: false, razon: 'desconocido' }
  }
  if (count > 0) return { permitido: false, razon: 'con-lecciones', count }
  return { permitido: true, razon: 'ok', count: 0 }
}
