import test from 'node:test'
import assert from 'node:assert/strict'
import { parseLessonBlocks } from '../js/lesson-blocks.js'

test('formato moderno: devuelve el array de bloques tal cual', () => {
  const blocks = [{ type: 'step', text: 'uno' }, { type: 'image', url: 'https://x/f.png' }]
  const out = parseLessonBlocks(JSON.stringify(blocks))
  assert.deepEqual(out, blocks)
})

test('legacy: el HTML crudo se vuelve un solo bloque html con el contenido exacto', () => {
  const raw = '<p>hola</p><ul><li>uno</li></ul>'
  assert.deepEqual(parseLessonBlocks(raw), [{ type: 'html', html: raw }])
})

test('JSON válido que no es array: se preserva como bloque html, no se descarta', () => {
  for (const raw of ['{}', '"texto"', '42', 'null']) {
    assert.deepEqual(parseLessonBlocks(raw), [{ type: 'html', html: raw }], raw)
  }
})

test('vacíos: devuelven [] sin inventar bloques', () => {
  assert.deepEqual(parseLessonBlocks(null), [])
  assert.deepEqual(parseLessonBlocks(undefined), [])
  assert.deepEqual(parseLessonBlocks(''), [])
  assert.deepEqual(parseLessonBlocks('   '), [])
})

test('array recibido directamente (rama defensiva): se devuelve, no se descarta', () => {
  const blocks = [{ type: 'step', text: 'x' }]
  assert.equal(parseLessonBlocks(blocks), blocks)
})

test('no-string que tampoco es array: []', () => {
  assert.deepEqual(parseLessonBlocks(42), [])
  assert.deepEqual(parseLessonBlocks({ type: 'step' }), [])
})

test('array vacío legítimo: [] y no un bloque html con el texto "[]"', () => {
  assert.deepEqual(parseLessonBlocks('[]'), [])
})
