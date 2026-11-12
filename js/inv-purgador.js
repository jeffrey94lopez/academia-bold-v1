// js/inv-purgador.js — dedup heurístico de listas de categorías o unidades.
//
// Spec 1 (acá): solo heurístico — normalizar + colapsar duplicados exactos
// post-sanitización + singular/plural. Sin IA. Preserva el casing/tildes de
// la canónica elegida (la forma más larga; empate = primera en aparecer).
//
// Spec 2 (futuro): recibe una lista ya purgada por acá y le aplica agrupación
// semántica con Vertex/Gemini sobre las canónicas, con cache por cuenta en
// Supabase. Esa pasada no toca este módulo — se agrega encima.
import { sanear } from './inv-saneamiento.js'
import { normalizar } from './inv-numeros.js'

// Dos formas se consideran la misma si una es el "plural" de la otra, con -s o -es.
// Reusa la raíz que ya usa inv-convertir.js:33.
const raiz = s => normalizar(s).replace(/(es|s)$/, '')

export function purgar(lista) {
  const entradas = lista
    .map(v => ({ original: v, saneado: sanear(v) }))
    .filter(e => e.saneado.length > 0)

  // Paso 1: dedup exacto por normalización. Para cada grupo, la canónica es la
  // forma más larga; empate → primera en entrar (mantiene orden de aparición).
  const porNorm = new Map()
  let duplicadosExactos = 0
  for (const e of entradas) {
    const n = normalizar(e.saneado)
    if (!porNorm.has(n)) porNorm.set(n, e.saneado)
    else {
      duplicadosExactos++
      const actual = porNorm.get(n)
      if (e.saneado.length > actual.length) porNorm.set(n, e.saneado)
    }
  }

  // Paso 2: colapsar singular/plural. Cada raíz queda con una única canónica
  // (la más larga de las que comparten raíz).
  const porRaiz = new Map()
  let singularesPlurales = 0
  for (const canonica of porNorm.values()) {
    const r = raiz(canonica)
    if (!porRaiz.has(r)) porRaiz.set(r, canonica)
    else {
      singularesPlurales++
      const actual = porRaiz.get(r)
      if (canonica.length > actual.length) porRaiz.set(r, canonica)
    }
  }

  // Paso 3: armar mapeo original → canónica final. Para cada entrada, su
  // canónica es la del grupo de la raíz de su saneado.
  const limpiasSet = new Set(porRaiz.values())
  const mapeo = {}
  for (const e of entradas) {
    const r = raiz(e.saneado)
    mapeo[e.original] = porRaiz.get(r)
  }

  const limpias = [...limpiasSet].sort((a, b) =>
    normalizar(a).localeCompare(normalizar(b)))

  return {
    limpias,
    mapeo,
    informe: { duplicados_exactos: duplicadosExactos, singulares_plurales: singularesPlurales },
  }
}
