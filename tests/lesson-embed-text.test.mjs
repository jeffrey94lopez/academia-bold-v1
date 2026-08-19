import test from 'node:test'
import assert from 'node:assert/strict'
import { lessonToEmbedText } from '../js/lesson-embed-text.js'

test('lessonToEmbedText: incluye título, categoría y el texto de los pasos', () => {
  const t = lessonToEmbedText('Cerrar caja', 'Reportes', [
    { type: 'step', text: '<b>Ve</b> a Reportes&nbsp;y cierra' },
  ])
  assert.match(t, /Titulo: Cerrar caja/)
  assert.match(t, /Categoria: Reportes/)
  assert.match(t, /Ve a Reportes y cierra/)
})

test('lessonToEmbedText: embebe TODOS los bloques bot_* (regresión del bug de recuperación)', () => {
  const t = lessonToEmbedText('X', 'Ventas', [
    { type: 'bot_nota', content: 'NOTA_AAA' },
    { type: 'bot_advertencia', content: 'ADVERTENCIA_BBB' },
    { type: 'bot_pasos', content: 'PASOS_CCC' },
    { type: 'bot_relacionado', content: 'RELACIONADO_DDD' },
    { type: 'bot_faq', content: 'FAQ_EEE' },
  ])
  // Antes solo entraban nota y faq; ahora deben entrar los cinco.
  for (const needle of ['NOTA_AAA', 'ADVERTENCIA_BBB', 'PASOS_CCC', 'RELACIONADO_DDD', 'FAQ_EEE']) {
    assert.ok(t.includes(needle), `falta ${needle} en el texto embebido`)
  }
})

test('lessonToEmbedText: bot_faq estructurado embebe pregunta + variaciones + respuesta', () => {
  const t = lessonToEmbedText('X', 'Ventas', [{
    type: 'bot_faq',
    pregunta: 'PREG_BASE_AAA',
    variaciones: 'VARIACION_BBB',
    respuesta: 'RESP_CCC',
    mostrar_acordeon: true,
  }])
  for (const needle of ['PREG_BASE_AAA', 'VARIACION_BBB', 'RESP_CCC']) {
    assert.ok(t.includes(needle), `falta ${needle}`)
  }
})

test('lessonToEmbedText: bot_faq viejo (content) sigue embebiéndose', () => {
  const t = lessonToEmbedText('X', 'Ventas', [{ type: 'bot_faq', content: 'FAQ_LEGACY_DDD' }])
  assert.ok(t.includes('FAQ_LEGACY_DDD'))
})

test('lessonToEmbedText: incluye el campo notas de la lección', () => {
  const t = lessonToEmbedText('X', 'Ventas', [{ type: 'step', text: 'paso' }], 'NOTA_DE_LECCION_ZZZ')
  assert.ok(t.includes('NOTA_DE_LECCION_ZZZ'), 'las notas deben entrar al embedding')
})

test('lessonToEmbedText: notas vacías/nulas no agregan la etiqueta Notas', () => {
  assert.ok(!lessonToEmbedText('X', 'Y', [], '   ').includes('Notas:'))
  assert.ok(!lessonToEmbedText('X', 'Y', [], null).includes('Notas:'))
})

test('lessonToEmbedText: bloque bot sin content no rompe ni agrega ruido', () => {
  const t = lessonToEmbedText('X', 'Ventas', [{ type: 'bot_pasos' }])
  assert.equal(t, 'Titulo: X\nCategoria: Ventas\n')
})

test('lessonToEmbedText: trunca a 8000 caracteres', () => {
  const t = lessonToEmbedText('X', 'Y', [{ type: 'bot_nota', content: 'a'.repeat(9000) }])
  assert.equal(t.length, 8000)
})
