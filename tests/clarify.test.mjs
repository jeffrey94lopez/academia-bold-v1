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
    supports_cross: true,
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

test('chatRequestBody manda la vertical y las FAQ tal cual las recibe', () => {
  const faqs = [{ pregunta: 'a', respuesta: 'b' }]
  const body = chatRequestBody({
    message: 'hola', history: [], faqContext: faqs, clarifyCount: 0,
    seleccion: { vertical: 'restaurantes', plataforma: 'web' },
  })
  assert.equal(body.vertical, 'restaurantes')
  assert.equal(body.plataforma, 'web')
  assert.deepEqual(body.faq_context, faqs)
})

test('chatRequestBody: cross_vertical_accepted solo cuando se pasa', () => {
  const base = { message: 'hola', history: [], faqContext: [], clarifyCount: 0,
                 seleccion: { vertical: 'retail', plataforma: 'web' } }
  assert.equal('cross_vertical_accepted' in chatRequestBody(base), false)

  const con = chatRequestBody({ ...base, cruceAceptado: 'abc-123' })
  assert.equal(con.cross_vertical_accepted, 'abc-123')
})

test('chatRequestBody: un cruceAceptado vacío no ensucia el body', () => {
  const base = { message: 'hola', history: [], faqContext: [], clarifyCount: 0,
                 seleccion: { vertical: 'retail', plataforma: 'web' } }
  assert.equal('cross_vertical_accepted' in chatRequestBody({ ...base, cruceAceptado: null }), false)
  assert.equal('cross_vertical_accepted' in chatRequestBody({ ...base, cruceAceptado: '' }), false)
})

test('chatRequestBody: siempre declara supports_cross, pase lo que pase', () => {
  const base = { message: 'hola', history: [], faqContext: [], clarifyCount: 0,
                 seleccion: { vertical: 'retail', plataforma: 'web' } }
  // Las tres combinaciones que importan. La del medio es la que atrapa un
  // `if (!cruceAceptado)`, que dejaria a n8n sin la puerta justo en el turno
  // de aceptacion.
  assert.equal(chatRequestBody(base).supports_cross, true)
  assert.equal(chatRequestBody({ ...base, cruceAceptado: 'abc-123' }).supports_cross, true)
  assert.equal(chatRequestBody({ ...base, contexto: { accountId: '1', businessName: 'X' } }).supports_cross, true)
})

test('shouldAskResolution: no pregunta en el turno del cruce', () => {
  assert.equal(shouldAskResolution({ cross_vertical: { leccion_id: 'x', titulo: 'T', vertical: 'restaurantes' } }), false)
})

test('shouldAskResolution: sigue preguntando en una respuesta normal', () => {
  assert.equal(shouldAskResolution({ response: 'ok' }), true)
})

test('chatRequestBody: manda conversation_id cuando la conversación ya existe', () => {
  // Sin esto, n8n no puede ligar el vacío que registra con la conversación que
  // lo produjo, y el detalle de la bandeja se queda sin "ver conversación".
  const body = chatRequestBody({
    message: 'hola', history: [], faqContext: [], clarifyCount: 0,
    seleccion: { vertical: 'retail', plataforma: 'web' },
    conversationId: 'c0ffee00-0000-4000-8000-000000000000',
  })
  assert.equal(body.conversation_id, 'c0ffee00-0000-4000-8000-000000000000')
})

test('chatRequestBody: omite conversation_id mientras la conversación no existe', () => {
  // La fila de bodi_conversations se crea de forma asíncrona: en el primer
  // turno el POST al bot puede salir antes. Mandar null haría que n8n intente
  // una FK contra una fila inexistente; omitirlo deja que la RPC lo resuelva.
  const base = { message: 'hola', history: [], faqContext: [], clarifyCount: 0,
                 seleccion: { vertical: 'retail', plataforma: 'web' } }
  for (const v of [null, undefined, '']) {
    assert.equal('conversation_id' in chatRequestBody({ ...base, conversationId: v }), false)
  }
})
