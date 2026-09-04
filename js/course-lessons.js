// course-lessons.js — qué lecciones forman el curso.
//
// Una sola definición, porque estaba escrita dos veces: el portal la aplicaba
// bien (activa + con examen) y el panel de resultados del admin usaba TODAS las
// lecciones como denominador, así que un estudiante que terminaba el curso
// mostraba 6/37 y nunca llegaba al 100%.
//
// `examen` viene de una columna jsonb, pero puede llegar como string si algo lo
// serializó antes (mismo doble formato que sufre `contenido`), así que se
// aceptan las dos formas y un JSON roto devuelve null en vez de lanzar.

export function parseExamen(leccion) {
  try {
    const e = typeof leccion?.examen === 'string' ? JSON.parse(leccion.examen) : leccion?.examen
    return Array.isArray(e?.preguntas) && e.preguntas.length > 0 ? e : null
  } catch {
    return null
  }
}

export function esDelCurso(leccion) {
  return leccion?.active === true && parseExamen(leccion) !== null
}

export function leccionesDelCurso(lecciones) {
  return (lecciones || []).filter(esDelCurso)
}
