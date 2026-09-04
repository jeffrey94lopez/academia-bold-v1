// course-progress.js — el progreso de un estudiante, lección por lección.
//
// La columna `progreso` de progreso_estudiantes es un JSON indexado por id de
// lección: { "<id>": { completado: true, puntaje: 85, fecha: "2026-09-04" } }.
// Lo escribe markLessonComplete (js/course.js) al aprobar un examen.
//
// Este módulo lo cruza con las lecciones del curso para que el admin pueda ver
// CUÁLES aprobó y no solo cuántas. Ojo con dos cosas que el cruce resuelve:
// las claves del JSON son strings aunque el id no lo sea, y el JSON conserva
// lecciones que ya no forman parte del curso (si les quitaron el examen), que
// no deben contar.

export function detalleProgreso(progreso, leccionesCurso) {
  const p = progreso || {}
  return (leccionesCurso || []).map((leccion, i) => {
    const entrada = p[String(leccion.id)]
    const completado = entrada?.completado === true
    return {
      n: i + 1,
      id: String(leccion.id),
      titulo: leccion.titulo || '',
      completado,
      puntaje: completado ? (entrada.puntaje ?? null) : null,
      fecha: completado ? (entrada.fecha ?? null) : null,
    }
  })
}

export function resumenProgreso(detalle) {
  const hechas = (detalle || []).filter(d => d.completado)
  const total = (detalle || []).length
  return {
    done: hechas.length,
    total,
    pct: total ? Math.round((hechas.length / total) * 100) : 0,
    // Promedio de las aprobadas. No puede bajar de 70 porque
    // markLessonComplete solo escribe cuando el estudiante aprueba.
    avg: hechas.length ? Math.round(hechas.reduce((s, d) => s + (d.puntaje || 0), 0) / hechas.length) : 0,
  }
}
