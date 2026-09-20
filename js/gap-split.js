// Validación y aritmética de "dividir un vacío". Import-safe.
//
// Las mismas reglas viven en la RPC dividir_vacio, que es la que manda porque
// es transaccional. Este módulo existe para dos cosas: deshabilitar el botón
// antes de un viaje perdido, y poder probar las reglas a fondo sin base.
//
// La regla que más sorprende: seleccionar TODAS las preguntas se rechaza. Mover
// todo no divide nada — deja el vacío original con cero preguntas, huérfano en
// la bandeja. Si lo que está mal es el título, se edita el título.

function clasificar(preguntas, seleccionIds) {
  const lista = Array.isArray(preguntas) ? preguntas : []
  const sel = new Set(Array.isArray(seleccionIds) ? seleccionIds : [])
  const conocidos = new Set(lista.map(p => p.id))

  for (const id of sel) if (!conocidos.has(id)) return { motivo: 'pregunta_ajena' }
  if (sel.size === 0) return { motivo: 'seleccion_vacia' }
  if (sel.size === lista.length) return { motivo: 'seleccion_total' }

  return {
    motivo: null,
    seSeparan: lista.filter(p => sel.has(p.id)),
    quedan: lista.filter(p => !sel.has(p.id)),
  }
}

export function validarDivision(preguntas, seleccionIds) {
  const { motivo } = clasificar(preguntas, seleccionIds)
  return motivo ? { ok: false, motivo } : { ok: true }
}

function resumen(grupo) {
  const fechas = grupo.map(p => p.created_at).filter(Boolean).sort()
  return {
    preguntas_total: grupo.length,
    primera_vez: fechas[0] ?? null,
    ultima_vez: fechas[fechas.length - 1] ?? null,
  }
}

export function contadoresTrasDividir(preguntas, seleccionIds) {
  const { motivo, seSeparan, quedan } = clasificar(preguntas, seleccionIds)
  if (motivo) throw new Error(motivo)

  // El ancla del vacío nuevo es la pregunta más antigua de las seleccionadas:
  // la misma regla con la que nace cualquier vacío. El ancla del ORIGINAL no se
  // toca (decisión 3 de la spec).
  const masAntigua = [...seSeparan].sort((a, b) =>
    String(a.created_at).localeCompare(String(b.created_at)))[0]

  return {
    original: resumen(quedan),
    nuevo: resumen(seSeparan),
    anclaPreguntaId: masAntigua.id,
  }
}
