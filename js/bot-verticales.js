// Modelo de los dos recuadros por vertical del dashboard del bot.
// Import-safe: sin DOM y sin supabase, igual que js/bot-attention.js.
//
// Las dos verticales son fijas y siempre se devuelven. Un recuadro que
// desaparece cuando no hay datos deja al lector sin saber si el número es cero
// o si algo se rompió.
//
// Lo que NO hace: tocar la porción `sin_vertical` que trae la RPC. Son las
// conversaciones que llegaron sin contexto de Bold (el iframe no mandó quién
// era el comercio). Repartirlas entre retail y restaurantes, o sumarlas a
// cualquiera de las dos, sería inventar datos.

export const VERTICALES = [
  { clave: 'retail', nombre: 'Retail' },
  { clave: 'restaurantes', nombre: 'Restaurantes' },
]

const num = v => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function modeloVerticales(byVertical) {
  const datos = byVertical && typeof byVertical === 'object' ? byVertical : {}

  return VERTICALES.map(({ clave, nombre }) => {
    const d = datos[clave] && typeof datos[clave] === 'object' ? datos[clave] : {}
    const resueltas = num(d.resolved)
    const noResueltas = num(d.unresolved)

    // La base excluye las ambiguas, igual que el "Resolución real" de la
    // cabecera: una ambigua no es un resultado, y contarla como fracaso
    // castigaría al bot por una evaluación que no concluyó.
    const conResultado = resueltas + noResueltas

    return {
      clave,
      nombre,
      total: num(d.total),
      resueltas,
      noResueltas,
      ambiguas: num(d.ambiguous),
      conResultado,
      // null, no 0: "0%" afirma que ninguna se resolvió, y sin base eso es
      // fabricar una mala noticia.
      pctResueltas: conResultado ? Math.round(100 * resueltas / conResultado) : null,
      pctBarra: {
        resueltas: conResultado ? Math.round(100 * resueltas / conResultado) : 0,
        noResueltas: conResultado ? 100 - Math.round(100 * resueltas / conResultado) : 0,
      },
    }
  })
}
