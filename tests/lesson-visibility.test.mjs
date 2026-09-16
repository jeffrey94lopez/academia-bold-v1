import test from 'node:test'
import assert from 'node:assert/strict'
import { aplicarVisibilidad, visibles } from '../js/lesson-visibility.js'

const LECCIONES = [
  { id: 'a', titulo: 'Visible en prod',  active: true },
  { id: 'b', titulo: 'Oculta en prod',   active: false },
  { id: 'c', titulo: 'Sin valor (vieja)', active: null },
]

const OVERRIDES = [
  { leccion_id: 'a', env: 'sandbox',    active: false }, // sandbox la esconde
  { leccion_id: 'b', env: 'sandbox',    active: true  }, // sandbox la muestra
  { leccion_id: 'a', env: 'feature/v2', active: true  }, // otra rama, no aplica
]

const activeDe = (ls) => Object.fromEntries(ls.map(l => [l.id, l.active]))

// ── aplicarVisibilidad ────────────────────────────────────────────────────

// La garantía que sostiene todo lo demás: producción vive en lecciones.active
// y nada de otro entorno la toca, ni siquiera si las filas llegan en el mismo
// payload.
test('en prod la lista sale intacta, con overrides o sin ellos', () => {
  assert.deepEqual(activeDe(aplicarVisibilidad(LECCIONES, OVERRIDES, 'prod')),
    { a: true, b: false, c: null })
})

test('el override del entorno pisa, en los dos sentidos', () => {
  assert.deepEqual(activeDe(aplicarVisibilidad(LECCIONES, OVERRIDES, 'sandbox')),
    { a: false, b: true, c: null })
})

test('una leccion sin override hereda el valor de prod', () => {
  const soloA = OVERRIDES.filter(o => o.leccion_id === 'a' && o.env === 'sandbox')
  assert.deepEqual(activeDe(aplicarVisibilidad(LECCIONES, soloA, 'sandbox')),
    { a: false, b: false, c: null })
})

test('el override de OTRA rama se ignora', () => {
  const otra = [{ leccion_id: 'b', env: 'feature/v2', active: true }]
  assert.deepEqual(activeDe(aplicarVisibilidad(LECCIONES, otra, 'sandbox')),
    { a: true, b: false, c: null })
})

test('no muta la lista original', () => {
  const copia = JSON.parse(JSON.stringify(LECCIONES))
  aplicarVisibilidad(LECCIONES, OVERRIDES, 'sandbox')
  assert.deepEqual(LECCIONES, copia)
})

test('conserva el resto de los campos de la leccion', () => {
  const [a] = aplicarVisibilidad(LECCIONES, OVERRIDES, 'sandbox')
  assert.equal(a.titulo, 'Visible en prod')
  assert.equal(a.id, 'a')
})

test('entradas vacias o nulas no lanzan', () => {
  assert.deepEqual(aplicarVisibilidad(null, null, 'sandbox'), [])
  assert.deepEqual(aplicarVisibilidad([], undefined, 'prod'), [])
  assert.deepEqual(activeDe(aplicarVisibilidad(LECCIONES, [], 'sandbox')),
    { a: true, b: false, c: null })
})

// ── visibles ──────────────────────────────────────────────────────────────
// Convención del proyecto: solo `false` esconde. NULL cuenta como habilitada,
// igual que `l.active === false` en el front y que `active IS NOT FALSE` en
// match_lessons — una fila vieja sin el valor seteado no desaparece sin querer.

test('visibles: solo false esconde; null y true pasan', () => {
  assert.deepEqual(visibles(LECCIONES).map(l => l.id), ['a', 'c'])
})

test('visibles: despues del merge de sandbox cambia el conjunto', () => {
  const merged = aplicarVisibilidad(LECCIONES, OVERRIDES, 'sandbox')
  assert.deepEqual(visibles(merged).map(l => l.id), ['b', 'c'])
})

test('visibles: entrada nula devuelve lista vacia', () => {
  assert.deepEqual(visibles(null), [])
})
