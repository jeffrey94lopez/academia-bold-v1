// "¿Qué vacíos pendientes ya tienen contenido?" — modelo de la franja.
// Import-safe: sin DOM y sin supabase.
//
// Lo que esta lista significa, y lo que NO: dice que hay una lección parecida
// al ancla del vacío, no que el bot lo responda. El 2026-10-31, de 9 vacíos de
// Hardware con contenido cerca, 3 seguían fallando. Por eso el panel la ofrece
// como sugerencia y el veredicto lo da preguntarle al bot.

const num = v => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function modeloCobertura(payload) {
  const p = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}
  const crudos = Array.isArray(p.cubiertos) ? p.cubiertos : []

  const cubiertos = crudos
    // Sin lección no hay nada que sugerir: el botón escribiría un leccion_id
    // nulo y el texto diría "ciérralo ligándolo a nada".
    .filter(c => c && c.leccion_id)
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
