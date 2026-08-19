import test from 'node:test'
import assert from 'node:assert/strict'
import { dedupeQuestions, firstUserMessage } from '../js/faq-suggest.js'

test('dedupeQuestions: dedup case-insensitive y normaliza espacios', () => {
  const r = dedupeQuestions(['Cómo cierro caja', 'cómo   cierro caja', 'Otra pregunta larga'])
  assert.deepEqual(r, ['Cómo cierro caja', 'Otra pregunta larga'])
})

test('dedupeQuestions: filtra vacías/muy cortas y respeta el máximo', () => {
  assert.deepEqual(dedupeQuestions(['', '  ', 'hi', null]), [])
  const many = Array.from({ length: 30 }, (_, i) => `pregunta numero ${i}`)
  assert.equal(dedupeQuestions(many, { max: 5 }).length, 5)
})

test('firstUserMessage: toma el primer mensaje con role user', () => {
  assert.equal(firstUserMessage([{ role: 'assistant', content: 'hola' }, { role: 'user', content: 'mi duda' }]), 'mi duda')
  assert.equal(firstUserMessage(null), '')
  assert.equal(firstUserMessage([{ role: 'assistant', content: 'x' }]), '')
})
