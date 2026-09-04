// course-order.js — orden de las lecciones dentro de la pestaña Curso.
//
// El curso no puede ordenarse por `orden`: esa columna es relativa a la
// categoría (hay varias lecciones con orden = 1 en categorías distintas), así
// que sin desempate quedan en un orden arbitrario. `curso_orden` le da al curso
// su propia secuencia, independiente del listado del portal.
//
// Las lecciones sin `curso_orden` caen al final y se ordenan entre ellas por
// `orden` y luego por título. Eso mantiene el comportamiento anterior mientras
// la columna no exista o no esté poblada.

const AL_FINAL = Number.POSITIVE_INFINITY

function clave(valor) {
  // Ojo: Number(null) es 0, no NaN. Sin este guardia una lección con
  // curso_orden = null se colaría al principio del curso.
  if (valor === null || valor === undefined || valor === '') return AL_FINAL
  const n = Number(valor)
  return Number.isFinite(n) ? n : AL_FINAL
}

export function ordenarCurso(lecciones) {
  return [...lecciones].sort((a, b) =>
    clave(a.curso_orden) - clave(b.curso_orden) ||
    clave(a.orden) - clave(b.orden) ||
    String(a.titulo || '').localeCompare(String(b.titulo || ''), 'es')
  )
}
