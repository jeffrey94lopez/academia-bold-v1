// "¿Qué vacíos pendientes ya tienen contenido?" — modelo de la franja.
// Import-safe: sin DOM y sin supabase.
//
// Lo que esta lista significa, y lo que NO:
//   · SÍ: hay contenido parecido al ancla del vacío, así que vale la pena
//     volver a probarlo.
//   · NO: que el bot lo responda. De 9 vacíos de Hardware con contenido cerca,
//     3 seguían fallando (2026-10-31).
//   · NO: cuál es la lección. Medido contra los 10 vacíos ya cerrados, el mejor
//     match eligió la lección equivocada en 3 de 6. Por eso el panel no nombra
//     una lección: la persona la elige en el detalle.

const num = v => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function modeloCobertura(payload) {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
  const crudos = Array.isArray(p.cubiertos) ? p.cubiertos : []

  const cubiertos = crudos
    .filter(Boolean)
    // jsonb devuelve `numeric` como string, y un "0.72" sin convertir se
    // ordena alfabéticamente y rompe cualquier comparación.
    .map(c => ({ ...c, similitud: num(c.similitud), preguntas_total: num(c.preguntas_total) }))
    .sort((a, b) => b.similitud - a.similitud)

  return {
    umbral: num(p.umbral),
    revisados: num(p.revisados),
    sinEmbedding: num(p.sin_embedding),
    cubiertos,
    hay: cubiertos.length > 0,
  }
}
