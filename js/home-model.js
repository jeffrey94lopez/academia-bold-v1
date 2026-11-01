// Modelo del Inicio del admin. Import-safe: sin DOM y sin supabase.
//
// Inicio dejó de contar inventario (cuántas lecciones, cuántas FAQs) y pasó a
// contar atención: qué hay que atender, por dónde entra la gente, y si una
// vertical está peor servida que la otra.
//
// La regla que atraviesa todo el archivo: **un dato que falta vale null, nunca
// 0**. Un cero inventado por una consulta que falló es indistinguible de un
// cero real, y así fue como "Conversaciones hoy" pasó semanas en cero sin que
// nadie lo notara. La pantalla pinta "—" cuando ve null.

// null si no es un número, a diferencia del `num` de los otros módulos. Acá el
// default seguro es "no sé", no "cero".
const n = v => {
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

export function modeloAtencion(salud) {
  const s = salud && typeof salud === 'object' ? salud : {}
  return {
    pendientes:  n(s.pendientes),
    incidentes:  n(s.incidentes),
    solicitudes: n(s.solicitudes),
    vuelven:     n(s.resueltos_que_vuelven),
  }
}

export function modeloUso(lecciones, bot) {
  const l = lecciones && typeof lecciones === 'object' ? lecciones : {}
  const b = bot && typeof bot === 'object' ? bot : {}
  const aperturas = n(l.kpis?.visits)

  // Lecciones abiertas, sin restarle nada. Antes esto restaba las visitas,
  // porque el portal abría una lección sola en cada visita y había que
  // descontarla para ver la lectura voluntaria. Desde que eso se quitó
  // (js/lessons.js), CADA apertura ya es voluntaria y la resta daría de menos.
  //
  // Durante los primeros 30 días después del cambio el número viene inflado
  // por las aperturas automáticas que quedaron en el histórico; se corrige
  // solo cuando la ventana las deja atrás.
  const opens = Array.isArray(l.top_lessons)
    ? l.top_lessons.reduce((a, t) => a + (n(t?.count) ?? 0), 0)
    : null

  return {
    aperturas,
    conversaciones: n(b.kpis?.total),
    lecciones: opens,
  }
}

const VERTICALES = [
  { clave: 'retail', nombre: 'Retail' },
  { clave: 'restaurantes', nombre: 'Restaurantes' },
]

export function filasVerticales(bot, leccionesRows) {
  const porVertical = bot?.kpis?.by_vertical
  const lecciones = Array.isArray(leccionesRows) ? leccionesRows : []

  return VERTICALES.map(({ clave, nombre }) => {
    const d = porVertical?.[clave]
    const resueltas = n(d?.resolved)
    const noResueltas = n(d?.unresolved)
    // Base sin ambiguas, igual que el "Resolución real" del dashboard: una
    // ambigua no es un resultado y contarla como fracaso castiga al bot por
    // una evaluación que no concluyó.
    const conResultado = (resueltas ?? 0) + (noResueltas ?? 0)

    return {
      clave,
      nombre,
      conversaciones: n(d?.total),
      pctResueltas: (d && conResultado) ? Math.round(100 * resueltas / conResultado) : null,
      sinContenido: n(d?.no_info),
      // Las 'ambas' NO cuentan como propias a propósito: contarlas taparía
      // justo la brecha que este número existe para mostrar.
      propias: lecciones.filter(x => x?.vertical === clave).length,
    }
  })
}
