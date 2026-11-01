import test from 'node:test'
import assert from 'node:assert/strict'
import { modeloAtencion, modeloUso, filasVerticales } from '../js/home-model.js'

test('modeloAtencion: pasa los cuatro contadores de la bandeja', () => {
  const m = modeloAtencion({ pendientes: 42, incidentes: 14, solicitudes: 6, resueltos_que_vuelven: 3 })
  assert.deepEqual(m, { pendientes: 42, incidentes: 14, solicitudes: 6, vuelven: 3 })
})

test('modeloAtencion: un dato que falta es null, NUNCA 0', () => {
  // Es la regla de toda esta pantalla. Un cero inventado por una consulta que
  // falló es indistinguible de un cero real, y así fue como "Conversaciones
  // hoy" pasó semanas en cero sin que nadie lo notara.
  const m = modeloAtencion(null)
  assert.deepEqual(m, { pendientes: null, incidentes: null, solicitudes: null, vuelven: null })
  assert.equal(modeloAtencion({ pendientes: 0 }).pendientes, 0, 'un cero REAL sí pasa')
})

test('modeloUso: aperturas y conversaciones salen tal cual', () => {
  const m = modeloUso({ kpis: { visits: 346 }, top_lessons: [] }, { kpis: { total: 91 } })
  assert.equal(m.aperturas, 346)
  assert.equal(m.conversaciones, 91)
})

test('modeloUso: las lecciones abiertas se suman SIN restar las visitas', () => {
  // La resta existía porque el portal abría una lección sola en cada visita.
  // Desde que eso se quitó, cada apertura ya es voluntaria: restar daría de
  // menos y la tarjeta tendería a cero.
  const m = modeloUso({ kpis: { visits: 346 }, top_lessons: [{ count: 347 }, { count: 8 }, { count: 6 }] }, {})
  assert.equal(m.lecciones, 361)
})

test('modeloUso: sin datos todo es null', () => {
  const m = modeloUso(null, null)
  assert.deepEqual(m, { aperturas: null, conversaciones: null, lecciones: null })
})

test('modeloUso: sin top_lessons no inventa lecciones', () => {
  const m = modeloUso({ kpis: { visits: 346 } }, {})
  assert.equal(m.aperturas, 346)
  assert.equal(m.lecciones, null)
})

const BOT = { kpis: { by_vertical: {
  retail:       { total: 73, resolved: 35, unresolved: 34, no_info: 16 },
  restaurantes: { total: 8,  resolved: 4,  unresolved: 4,  no_info: 4 },
} } }
const LECCIONES = [
  { vertical: 'retail' }, { vertical: 'retail' }, { vertical: 'ambas' },
  { vertical: 'restaurantes' }, { vertical: null },
]

test('filasVerticales: una fila por vertical, en orden', () => {
  const f = filasVerticales(BOT, LECCIONES)
  assert.deepEqual(f.map(x => x.clave), ['retail', 'restaurantes'])
  assert.equal(f[0].nombre, 'Retail')
})

test('filasVerticales: el porcentaje excluye las ambiguas', () => {
  const [retail] = filasVerticales(BOT, LECCIONES)
  assert.equal(retail.conversaciones, 73)
  assert.equal(retail.pctResueltas, 51)   // 35 de 69, no de 73
  assert.equal(retail.sinContenido, 16)
})

test('filasVerticales: "propias" NO cuenta las de ambas', () => {
  // Es el número que responde "¿restaurantes está peor atendido?". Contar las
  // 'ambas' como propias lo taparía: restaurantes pasaría de 1 a 2 y retail
  // de 2 a 3, y la brecha real se diluye.
  const f = filasVerticales(BOT, LECCIONES)
  assert.equal(f[0].propias, 2)
  assert.equal(f[1].propias, 1)
})

test('filasVerticales: sin base, el porcentaje es null y no 0%', () => {
  const f = filasVerticales({ kpis: { by_vertical: { retail: { total: 3, resolved: 0, unresolved: 0 } } } }, [])
  assert.equal(f[0].pctResueltas, null)
  assert.equal(f[0].conversaciones, 3)
})

test('filasVerticales: sin datos del bot, los números son null pero las filas existen', () => {
  // La tabla tiene que seguir mostrando las lecciones propias aunque falle la
  // consulta del bot: son dos fuentes distintas y una no debe tapar a la otra.
  const f = filasVerticales(null, LECCIONES)
  assert.equal(f.length, 2)
  assert.equal(f[0].conversaciones, null)
  assert.equal(f[0].propias, 2)
})
