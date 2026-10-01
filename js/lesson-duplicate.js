// Duplicar una lección hacia la otra vertical. Lógica PURA (sin DOM ni
// supabase) para poder probarla con node:test; el cableado del botón vive en
// js/admin.js.
//
// La copia se abre en el editor como lección NUEVA (sin id), así que el
// guardado normal hace INSERT y de paso corre el log de actividad y los
// borradores. Nada se escribe en la base hasta que el admin le da Guardar.

// Convención del repo (ver js/vertical.js): vertical ausente o desconocida
// cuenta como retail. OJO: 'ambas' es un valor CONOCIDO y aun así cae en el
// else de abajo (devuelve 'restaurantes'), lo cual no significa nada: una
// lección 'ambas' ya está en las dos verticales. Por eso existe
// puedeDuplicarse() aparte; quien arme un botón de duplicar debe consultarla.
export function otraVertical(vertical) {
  return vertical === 'restaurantes' ? 'retail' : 'restaurantes'
}

// Duplicar una lección 'ambas' no significa nada: ya sirve a las dos verticales,
// y otraVertical('ambas') devolvería 'restaurantes' por el else del ternario.
export function puedeDuplicarse(leccion) {
  return (leccion?.vertical || 'retail') !== 'ambas'
}

// Campos que el formulario de lecciones sabe leer (ver openLessonForm).
// La lista es explícita a propósito: así la copia no arrastra embedding,
// created_at ni la columna deprecada dispositivo.
export function construirCopia(leccion) {
  const l = leccion || {}
  return {
    titulo: `${l.titulo || ''} (copia)`,
    descripcion: l.descripcion,
    contenido: l.contenido,          // tal cual: parseLessonBlocks decide cómo leerlo
    notas: l.notas,
    categoria: l.categoria,
    orden: l.orden,
    plataforma: l.plataforma,
    examen: l.examen,
    vertical: otraVertical(l.vertical),
    curso_orden: null,               // al final del curso, sin pelear el puesto del original
  }
}

// Una copia nace oculta: el texto viene escrito para la otra vertical y no
// debería llegar a los estudiantes hasta que alguien lo adapte. El formulario
// no expone `active`, así que el ajuste se hace acá, sobre el payload.
export function prepararPayload(payload, esDuplicado) {
  return esDuplicado ? { ...payload, active: false } : payload
}
