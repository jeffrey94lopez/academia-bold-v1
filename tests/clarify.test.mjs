import test from 'node:test'
import assert from 'node:assert/strict'
import { nextClarifyCount, chatRequestBody, shouldAskResolution } from '../js/clarify.js'

test('shouldAskResolution: true solo en respuesta normal (ni repregunta ni soporte)', () => {
  assert.equal(shouldAskResolution({}), true)
  assert.equal(shouldAskResolution({ asked_clarification: false, support_redirected: false }), true)
})

test('shouldAskResolution: false cuando el bot repreguntó', () => {
  assert.equal(shouldAskResolution({ asked_clarification: true }), false)
})

test('shouldAskResolution: false cuando derivó a soporte', () => {
  assert.equal(shouldAskResolution({ support_redirected: true }), false)
})

test('shouldAskResolution: false cuando el bot no tiene información (knowledge_gap)', () => {
  assert.equal(shouldAskResolution({ knowledge_gap: true }), false)
})

test('shouldAskResolution: tolera data null/undefined (no muestra botones)', () => {
  assert.equal(shouldAskResolution(null), false)
  assert.equal(shouldAskResolution(undefined), false)
})

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

test('chatRequestBody: sin contexto de Bold el payload no cambia de forma', () => {
  const base = { message: 'hola', history: [], faqContext: [], clarifyCount: 0,
                 seleccion: { vertical: 'retail', plataforma: 'web' } }
  assert.deepEqual(chatRequestBody(base), chatRequestBody({ ...base, contexto: null }))
  assert.equal('account_id' in chatRequestBody(base), false)
})

test('chatRequestBody: con contexto agrega account_id y business_name (y nada del usuario)', () => {
  const body = chatRequestBody({
    message: 'hola', history: [], faqContext: [], clarifyCount: 0,
    seleccion: { vertical: 'restaurantes', plataforma: 'mobile' },
    contexto: {
      accountId: '7993', businessName: 'Pollos',
      user: { name: 'Ana', email: 'ana@comercio.com' },
    },
  })
  assert.equal(body.account_id, '7993')
  assert.equal(body.business_name, 'Pollos')
  // El correo del usuario NO viaja al bot ni al LLM (ver doc §7.4).
  assert.equal(JSON.stringify(body).includes('ana@comercio.com'), false)
})
