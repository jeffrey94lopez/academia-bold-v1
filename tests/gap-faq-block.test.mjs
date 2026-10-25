import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFaqBlock, contenidoConFaq, contenidoConFaqCon, contenidoConFaqInfo, normalizarPregunta } from '../js/gap-faq-block.js'

test('buildFaqBlock: arma el bloque con la forma de bot_faq v2', () => {
  const b = buildFaqBlock({
    pregunta: '  ¿Cómo cierro caja?  ',
    variaciones: ['como cierro la caja', '  ', 'cierre de caja'],
    respuesta: 'Ve al módulo Caja y presiona Cerrar.',
  })
  assert.deepEqual(b, {
    type: 'bot_faq',
    pregunta: '¿Cómo cierro caja?',
    variaciones: 'como cierro la caja\ncierre de caja',
    respuesta: 'Ve al módulo Caja y presiona Cerrar.',
    mostrar_acordeon: false,
  })
})

test('buildFaqBlock: acepta variaciones como texto con saltos de línea', () => {
  const b = buildFaqBlock({ pregunta: 'P', variaciones: 'una\n\ndos\n', respuesta: 'R' })
  assert.equal(b.variaciones, 'una\ndos')
})

test('buildFaqBlock: sin pregunta o sin respuesta devuelve null', () => {
  assert.equal(buildFaqBlock({ pregunta: '', respuesta: 'R' }), null)
  assert.equal(buildFaqBlock({ pregunta: 'P', respuesta: '   ' }), null)
  assert.equal(buildFaqBlock({}), null)
})

test('contenidoConFaq: agrega el bloque al final de un contenido JSON', () => {
  const raw = JSON.stringify([{ type: 'step', text: '<p>uno</p>' }])
  const faq = buildFaqBlock({ pregunta: 'P', respuesta: 'R' })
  const out = JSON.parse(contenidoConFaq(raw, faq))
  assert.equal(out.length, 2)
  assert.equal(out[0].type, 'step')
  assert.equal(out[1].type, 'bot_faq')
})

test('contenidoConFaq: el HTML legacy se preserva como bloque html', () => {
  const raw = '<p>lección vieja escrita a mano</p>'
  const out = JSON.parse(contenidoConFaq(raw, buildFaqBlock({ pregunta: 'P', respuesta: 'R' })))
  assert.equal(out.length, 2)
  assert.equal(out[0].type, 'html')
  assert.equal(out[0].html, raw)
  assert.equal(out[1].type, 'bot_faq')
})

test('contenidoConFaq: un contenido vacío da una lección de un solo bloque', () => {
  for (const raw of ['', '   ', null, undefined]) {
    const out = JSON.parse(contenidoConFaq(raw, buildFaqBlock({ pregunta: 'P', respuesta: 'R' })))
    assert.equal(out.length, 1)
    assert.equal(out[0].type, 'bot_faq')
  }
})

test('contenidoConFaq: nunca pierde bloques que ya existían', () => {
  const previos = [
    { type: 'step', text: '<p>a</p>' },
    { type: 'image', url: 'u', label: 'l' },
    { type: 'bot_nota', content: 'ojo' },
  ]
  const out = JSON.parse(contenidoConFaq(JSON.stringify(previos), buildFaqBlock({ pregunta: 'P', respuesta: 'R' })))
  assert.equal(out.length, 4)
  assert.deepEqual(out.slice(0, 3), previos)
})

test('contenidoConFaq: convive con un bot_faq que ya existía', () => {
  const previos = [{ type: 'bot_faq', pregunta: 'otra', variaciones: '', respuesta: 'x', mostrar_acordeon: false }]
  const out = JSON.parse(contenidoConFaq(JSON.stringify(previos), buildFaqBlock({ pregunta: 'P', respuesta: 'R' })))
  assert.equal(out.length, 2)
  assert.equal(out[0].pregunta, 'otra')
  assert.equal(out[1].pregunta, 'P')
})

test('contenidoConFaq: sin bloque válido lanza en vez de escribir basura', () => {
  assert.throws(() => contenidoConFaq('[]', null), /bloque/)
})

test('contenidoConFaq: un array vacío válido ("[]") no es un fallo de parseo', () => {
  // Una lección a la que le borraron todos los bloques tiene contenido = "[]".
  for (const raw of ['[]', '  []  ', '\n[]\n']) {
    const out = JSON.parse(contenidoConFaq(raw, buildFaqBlock({ pregunta: 'P', respuesta: 'R' })))
    assert.equal(out.length, 1)
    assert.equal(out[0].type, 'bot_faq')
  }
})

test('contenidoConFaq: lanza si el crudo traía algo y el parseo no produjo bloques', () => {
  const faq = buildFaqBlock({ pregunta: 'P', respuesta: 'R' })
  const parseRoto = () => []   // un parseo que pierde contenido sin avisar
  for (const raw of ['<p>algo</p>', '[1, 2', '{"type":"step"}']) {
    assert.throws(() => contenidoConFaqCon(raw, faq, parseRoto), /no se pudo parsear/)
  }
  // ...pero un '[]' legítimo pasa aunque el parseo devuelva [].
  assert.doesNotThrow(() => contenidoConFaqCon('[]', faq, parseRoto))
})

test('contenidoConFaq: un parseo que pierde bloques SIGUE lanzando', () => {
  // El guard es defensa en profundidad contra un parser que todavía no falla.
  // Un crudo con bloques adentro cuyo parseo devuelva [] es pérdida de datos,
  // no un array vacío legítimo.
  const parseRoto = () => []
  const faq = buildFaqBlock({ pregunta: 'P', respuesta: 'R' })
  assert.throws(() => contenidoConFaqCon('[{"type":"step"}]', faq, parseRoto), /no se pudo parsear/)
})

// ── Una FAQ ya escrita se reemplaza, no se duplica ───────────────────────────

test('contenidoConFaq: sin bot_faq previo, agrega al final', () => {
  const raw = JSON.stringify([{ type: 'step', text: '<p>a</p>' }])
  const out = JSON.parse(contenidoConFaq(raw, buildFaqBlock({ pregunta: 'P', respuesta: 'R' })))
  assert.equal(out.length, 2)
  assert.equal(out[1].pregunta, 'P')
})

test('contenidoConFaq: un bot_faq con la misma pregunta se reemplaza EN SU POSICIÓN', () => {
  const previos = [
    { type: 'bot_faq', pregunta: '¿Cómo cierro caja?', variaciones: '', respuesta: 'vieja', mostrar_acordeon: false },
    { type: 'step', text: '<p>a</p>' },
    { type: 'bot_nota', content: 'ojo' },
  ]
  const nuevo = buildFaqBlock({ pregunta: '¿Cómo cierro caja?', respuesta: 'nueva' })
  const out = JSON.parse(contenidoConFaq(JSON.stringify(previos), nuevo))
  assert.equal(out.length, 3, 'no agrega un bloque más')
  assert.equal(out[0].type, 'bot_faq')
  assert.equal(out[0].respuesta, 'nueva', 'quedó en la posición 0, no al final')
  assert.deepEqual(out.slice(1), previos.slice(1))
})

test('contenidoConFaq: un bot_faq con otra pregunta convive (se agrega)', () => {
  const previos = [{ type: 'bot_faq', pregunta: 'otra', variaciones: '', respuesta: 'x', mostrar_acordeon: false }]
  const out = JSON.parse(contenidoConFaq(JSON.stringify(previos), buildFaqBlock({ pregunta: 'P', respuesta: 'R' })))
  assert.equal(out.length, 2)
  assert.equal(out[0].respuesta, 'x')
  assert.equal(out[1].pregunta, 'P')
})

test('contenidoConFaq: la comparación ignora mayúsculas y espacios de más', () => {
  const previos = [{ type: 'bot_faq', pregunta: '  ¿Cómo   CIERRO caja? ', variaciones: '', respuesta: 'vieja', mostrar_acordeon: false }]
  const nuevo = buildFaqBlock({ pregunta: '¿cómo cierro caja?', respuesta: 'nueva' })
  const out = JSON.parse(contenidoConFaq(JSON.stringify(previos), nuevo))
  assert.equal(out.length, 1)
  assert.equal(out[0].respuesta, 'nueva')
  assert.equal(out[0].pregunta, '¿cómo cierro caja?', 'el bloque nuevo reemplaza al viejo completo')
})

test('contenidoConFaq: solo reemplaza bloques bot_faq, no otros tipos con el mismo texto', () => {
  const previos = [{ type: 'bot_nota', pregunta: 'P', content: 'ojo' }]
  const out = JSON.parse(contenidoConFaq(JSON.stringify(previos), buildFaqBlock({ pregunta: 'P', respuesta: 'R' })))
  assert.equal(out.length, 2)
})

test('contenidoConFaq: si ya había dos duplicados, reemplaza el primero y no borra el otro', () => {
  const dup = { type: 'bot_faq', pregunta: 'P', variaciones: '', respuesta: 'v', mostrar_acordeon: false }
  const out = JSON.parse(contenidoConFaq(JSON.stringify([dup, { ...dup, respuesta: 'w' }]),
    buildFaqBlock({ pregunta: 'P', respuesta: 'nueva' })))
  assert.equal(out.length, 2)
  assert.equal(out[0].respuesta, 'nueva')
  assert.equal(out[1].respuesta, 'w')
})

test('contenidoConFaqInfo: informa si reemplazó o agregó', () => {
  const faq = buildFaqBlock({ pregunta: 'P', respuesta: 'R' })
  assert.equal(contenidoConFaqInfo('[]', faq).reemplazada, false)
  const raw = JSON.stringify([{ type: 'bot_faq', pregunta: 'p', respuesta: 'x' }])
  const r = contenidoConFaqInfo(raw, faq)
  assert.equal(r.reemplazada, true)
  assert.equal(JSON.parse(r.contenido).length, 1)
})

test('normalizarPregunta: trim, minúsculas y espacios colapsados', () => {
  assert.equal(normalizarPregunta('  ¿Cómo   CIERRO\tcaja? '), '¿cómo cierro caja?')
  assert.equal(normalizarPregunta(null), '')
})
