// Quién escribió, detrás de una conversación. Import-safe: sin DOM y sin
// supabase.
//
// Bold manda `user.name` dentro del `bold:context` y js/assistant.js lo guarda
// en la columna `user_name` (nunca el correo: ver el comentario ahí).
//
// Medido el 2026-11-06, antes de pintarlo: de las conversaciones que traen
// contexto de Bold, el 100% trae nombre (82/82 y 49/49 en las dos semanas que
// lleva existiendo la columna, creada el 2026-10-26). O sea que una fila con
// comercio y sin nombre es la excepción, no lo normal — por eso vale una
// columna propia y no un dato escondido en el detalle.
//
// OJO con el porcentaje global: contra TODAS las conversaciones da 41%, pero
// ese número no significa nada. Las de antes del 2026-10-26 no podían tener
// nombre porque la columna no existía, y las de fuera del POS no traen
// contexto. La base correcta es "las que traen account_id, desde que la columna
// existe".
//
// El formato que llega es "Nombre - Apellido": Bold concatena con ese guion los
// dos campos de su propia pantalla. Crudo, el guion parece un error nuestro.

// 28 caracteres entran al lado del comercio sin romper el renglón: el nombre
// completo más largo que se vio ("ANGELA MARIA GARCIA AGUIRRE") mide 27.
const MAX = 28

export function nombreUsuario(fila) {
  const nombre = String(fila?.user_name ?? '')
    // SOLO el guion rodeado de espacios. Uno pegado es parte del nombre
    // ("Jean-Paul"), y romperlo sería escribir mal el nombre de una persona.
    .replace(/\s+-\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!nombre) return { texto: '', completo: '', identificado: false }

  return {
    texto: nombre.length > MAX ? `${nombre.slice(0, MAX)}…` : nombre,
    // Entero, para el title: cortar también acá dejaría el dato inalcanzable.
    completo: nombre,
    identificado: true,
  }
}
