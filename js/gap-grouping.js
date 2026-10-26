// Agrupa los vacíos de la bandeja por categoría para pintarlos en secciones
// colapsables. Import-safe: sin DOM y sin supabase.
//
// Por qué ordena por CANTIDAD DE VACÍOS y no por preguntas: las secciones
// existen para mostrar dónde se acumula el trabajo. Una categoría con 5 vacíos
// de una pregunta cada uno es más trabajo que una con un vacío de 9.

const SIN_CATEGORIA = 'Sin categoría'

function nombreCategoria(v) {
  const c = String(v?.categoria ?? '').trim()
  return c || SIN_CATEGORIA
}

export function agruparPorCategoria(vacios, { abrirTop = 2 } = {}) {
  const lista = Array.isArray(vacios) ? vacios : []
  if (!lista.length) return []

  const porCat = new Map()
  for (const v of lista) {
    const cat = nombreCategoria(v)
    if (!porCat.has(cat)) porCat.set(cat, [])
    porCat.get(cat).push(v)
  }

  const grupos = [...porCat.entries()].map(([categoria, vs]) => ({
    categoria,
    total: vs.length,
    // Dentro del grupo mandan los más preguntados: es el mismo criterio con el
    // que la bandeja ordena todo lo demás.
    vacios: [...vs].sort((a, b) => (Number(b?.preguntas_total) || 0) - (Number(a?.preguntas_total) || 0)),
  }))

  // El desempate alfabético no es cosmético: sin él, dos categorías del mismo
  // tamaño se intercambian entre repintados y el usuario pierde dónde iba.
  grupos.sort((a, b) => b.total - a.total || a.categoria.localeCompare(b.categoria))

  return grupos.map((g, i) => ({ ...g, abierto: i < abrirTop }))
}
