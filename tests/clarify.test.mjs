import test from 'node:test'
import assert from 'node:assert/strict'
import { nextClarifyCount, chatRequestBody } from '../js/clarify.js'

test('nextClarifyCount incrementa cuando la respuesta pidió aclaración', () => {
  assert.equal(nextClarifyCount(0, { asked_clarification: true }), 1)
  assert.equal(nextClarifyCount(1, { asked_clarification: true }), 2)
})

test('nextClarifyCount reinicia a 0 en respuesta final', () => {
  assert.equal(nextClarifyCount(2, { asked_clarification: false }), 0)
  assert.equal(nextClarifyCount(2, {}), 0)
  assert.equal(nextClarifyCount(2, null), 0)
  assert.equal(nextClarifyCount(1, undefined), 0)
})

test('nextClarifyCount normaliza current inválido a 0 antes de decidir', () => {
  assert.equal(nextClarifyCount(-3, { asked_clarification: true }), 1)
  assert.equal(nextClarifyCount(NaN, { asked_clarification: true }), 1)
  assert.equal(nextClarifyCount(undefined, { asked_clarification: true }), 1)
  assert.equal(nextClarifyCount(2.5, { asked_clarification: true }), 1)
})

test('chatRequestBody incluye clarify_count y esparce la selección', () => {
  const body = chatRequestBody({
    message: 'hola',
    history: [{ role: 'user', content: 'hola' }],
    faqContext: [{ q: 'a' }],
    clarifyCount: 2,
    seleccion: { vertical: 'retail', plataforma: 'web' },
  })
  assert.deepEqual(body, {
    message: 'hola',
    history: [{ role: 'user', content: 'hola' }],
    faq_context: [{ q: 'a' }],
    clarify_count: 2,
    vertical: 'retail',
    plataforma: 'web',
  })
})
