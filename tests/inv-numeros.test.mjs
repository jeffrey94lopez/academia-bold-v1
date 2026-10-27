import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizar, parseNumero, parseSiNo, parseImpuesto, aCodigo } from '../js/inv-numeros.js'

test('normalizar quita tildes, signos y mayúsculas', () => {
  assert.equal(normalizar('  ¿Inventariable? (obligatorio) '), 'inventariable obligatorio')
  assert.equal(normalizar('Categoría'), 'categoria')
})

test('parseNumero: formatos de Alegra, Siigo y Excel', () => {
  assert.equal(parseNumero('5000,000000'), 5000)
  assert.equal(parseNumero('350050,000000'), 350050)
  assert.equal(parseNumero('1.234,50'), 1234.5)
  assert.equal(parseNumero('1,234.50'), 1234.5)
  assert.equal(parseNumero('$ 5.950'), 5950)
  assert.equal(parseNumero('5,950'), 5950)
  assert.equal(parseNumero('12.5'), 12.5)
  assert.equal(parseNumero('0.500'), 0.5)
  assert.equal(parseNumero(5000), 5000)
  assert.equal(parseNumero('-3,5'), -3.5)
  for (const v of ['', 'abc', null, undefined, '--']) assert.equal(parseNumero(v), null)
})

test('parseNumero: formato forzado resuelve la ambigüedad', () => {
  assert.equal(parseNumero('5.950', 'punto'), 5.95)
  assert.equal(parseNumero('5.950', 'coma'), 5950)
  assert.equal(parseNumero('1,234', 'coma'), 1.234)
})

test('parseSiNo', () => {
  for (const v of ['Si', 'SÍ', 'yes', 'X', 1]) assert.equal(parseSiNo(v), true)
  for (const v of ['No', 'NO', 'false', 0]) assert.equal(parseSiNo(v), false)
  assert.equal(parseSiNo('quizás'), null)
})

test('parseImpuesto', () => {
  assert.equal(parseImpuesto(19), 19)
  assert.equal(parseImpuesto('19'), 19)
  assert.equal(parseImpuesto('IVA - 19.00%'), 19)
  assert.equal(parseImpuesto('16-Impoconsumo 8%'), 8)
  assert.equal(parseImpuesto('Exento'), 0)
  assert.equal(parseImpuesto(''), null)
  assert.equal(parseImpuesto('abc'), null)
})

test('aCodigo: enteros largos sin notación científica; avisa si Excel ya los dañó', () => {
  assert.deepEqual(aCodigo(7501234567890), { texto: '7501234567890', danado: false })
  assert.deepEqual(aCodigo(' AB-12 '), { texto: 'AB-12', danado: false })
  assert.equal(aCodigo('7.50123E+12').danado, true)
  assert.deepEqual(aCodigo(''), { texto: '', danado: false })
})
