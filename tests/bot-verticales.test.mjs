import test from 'node:test'
import assert from 'node:assert/strict'
import { modeloVerticales, VERTICALES } from '../js/bot-verticales.js'

const datos = {
  retail:        { total: 10, resolved: 6, unresolved: 2, ambiguous: 2 },
  restaurantes:  { total: 4,  resolved: 1, unresolved: 3, ambiguous: 0 },
  sin_vertical:  { total: 20, resolved: 5, unresolved: 5, ambiguous: 10 },
}

test('modeloVerticales: devuelve SIEMPRE las dos verticales, en orden', () => {
  // Fijas a propósito: un recuadro que desaparece cuando no hay datos deja al
  // lector sin saber si es cero o si se rompió algo.
  const m = modeloVerticales(datos)
  assert.deepEqual(m.map(v => v.clave), ['retail', 'restaurantes'])
  assert.deepEqual(VERTICALES.map(v => v.clave), ['retail', 'restaurantes'])
})

test('modeloVerticales: no mezcla la porción sin vertical en ninguna de las dos', () => {
  // `sin_vertical` son las conversaciones que llegaron sin contexto de Bold.
  // Repartirlas o sumarlas inventaría datos.
  const [retail, rest] = modeloVerticales(datos)
  assert.equal(retail.total, 10)
  assert.equal(rest.total, 4)
})

test('modeloVerticales: el porcentaje de resueltas excluye las ambiguas', () => {
  // Mismo criterio que el "Resolución real" de la cabecera: una ambigua no es
  // un resultado, y contarla como fracaso castiga al bot por una evaluación
  // que no concluyó.
  const [retail] = modeloVerticales(datos)
  assert.equal(retail.resueltas, 6)
  assert.equal(retail.noResueltas, 2)
  assert.equal(retail.ambiguas, 2)
  assert.equal(retail.pctResueltas, 75)   // 6 de 8, no 6 de 10
})

test('modeloVerticales: los anchos de la barra suman 100 cuando hay resultados', () => {
  const [, rest] = modeloVerticales(datos)
  assert.equal(rest.pctBarra.resueltas + rest.pctBarra.noResueltas, 100)
})

test('modeloVerticales: una vertical sin datos da ceros, no se cae', () => {
  const m = modeloVerticales({ retail: { total: 3, resolved: 3, unresolved: 0, ambiguous: 0 } })
  const rest = m[1]
  assert.equal(rest.total, 0)
  assert.equal(rest.resueltas, 0)
  assert.equal(rest.pctBarra.resueltas, 0)
})

test('modeloVerticales: sin base, el porcentaje es null y NO 0', () => {
  // 0% dice "ninguna se resolvió". null dice "todavía no hay con qué decirlo".
  // Pintarlos igual es fabricar una mala noticia.
  const [retail] = modeloVerticales({ retail: { total: 5, resolved: 0, unresolved: 0, ambiguous: 5 } })
  assert.equal(retail.pctResueltas, null)
  assert.equal(retail.total, 5)
})

test('modeloVerticales: tolera que la RPC no traiga la clave', () => {
  for (const entrada of [null, undefined, {}, 'raro']) {
    const m = modeloVerticales(entrada)
    assert.equal(m.length, 2)
    assert.equal(m[0].total, 0)
    assert.equal(m[0].pctResueltas, null)
  }
})

test('modeloVerticales: valores no numéricos cuentan como cero', () => {
  const [retail] = modeloVerticales({ retail: { total: 'x', resolved: null, unresolved: undefined } })
  assert.equal(retail.total, 0)
  assert.equal(retail.resueltas, 0)
})
