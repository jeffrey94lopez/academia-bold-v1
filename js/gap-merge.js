// Validación y avisos de "fusionar dos vacíos". Import-safe: sin DOM y sin
// supabase.
//
// Las mismas reglas viven en la RPC fusionar_vacios, que es la que manda porque
// es transaccional. Este módulo existe para no gastar un viaje al servidor y,
// sobre todo, para decir ANTES del clic qué se va a perder.
//
// La asimetría que sorprende: el ORIGEN se borra. Por eso un vacío resuelto no
// puede ser origen (se llevaría su `leccion_id`, el único enlace a contenido
// que alguien escribió), pero sí puede ser destino.

const ESTADOS_LEGIBLES = {
  pendiente: 'pendiente',
  solicitud: 'solicitud',
  resuelto: 'resuelto',
  descartado: 'descartado',
}

const legible = e => ESTADOS_LEGIBLES[e] || e || 'sin estado'
const texto = s => String(s ?? '').trim()

export function validarFusion(origen, destino) {
  if (!destino?.id) return { ok: false, motivo: 'sin_destino' }
  if (origen?.id === destino.id) return { ok: false, motivo: 'mismo_vacio' }
  if (origen?.estado === 'resuelto') return { ok: false, motivo: 'origen_resuelto' }
  return { ok: true }
}

// Lo que la persona tiene que saber antes de fusionar. Nada de esto impide la
// fusión: son pérdidas aceptables, pero no silenciosas.
export function avisosFusion(origen, destino) {
  const avisos = []

  if (origen?.estado && origen.estado !== 'pendiente') {
    const nota = texto(origen.nota_descarte)
    avisos.push(`Este vacío está marcado como ${legible(origen.estado)}: esa marca` +
      `${nota ? ` y su nota («${nota}»)` : ''} se pierden al fusionarlo.`)
  }

  if (destino?.estado && destino.estado !== 'pendiente') {
    avisos.push(destino.estado === 'resuelto'
      ? 'El destino ya está resuelto: las preguntas van a contar como llegadas después de resolverlo, que es la señal de "resuelto pero siguen preguntando".'
      : `El destino está ${legible(destino.estado)}: las preguntas quedan ahí, fuera de pendientes.`)
  }

  // Una clasificación ausente es "sin clasificar", no "otra": avisar de una
  // diferencia que no existe entrena a ignorar los avisos.
  for (const [campo, nombre] of [['categoria', 'categoría'], ['vertical', 'vertical']]) {
    const a = texto(origen?.[campo]), b = texto(destino?.[campo])
    if (a && b && a !== b) {
      avisos.push(`La ${nombre} es distinta: queda la del destino («${b}»).`)
    }
  }

  return avisos
}
