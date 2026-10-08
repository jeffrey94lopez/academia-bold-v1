import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFaqBlock, contenidoConFaq } from '../js/gap-faq-block.js'

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
