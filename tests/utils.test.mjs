import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getYouTubeId, slugify } from '../js/utils.js'

test('formatos clásicos: watch?v= y youtu.be', () => {
  assert.equal(getYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
  assert.equal(getYouTubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
  assert.equal(getYouTubeId('https://youtu.be/dQw4w9WgXcQ?t=30'), 'dQw4w9WgXcQ')
})

test('formatos que antes fallaban: shorts, embed, live, m.', () => {
  assert.equal(getYouTubeId('https://www.youtube.com/shorts/AbC123xyz_-'), 'AbC123xyz_-')
  assert.equal(getYouTubeId('https://youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
  assert.equal(getYouTubeId('https://www.youtube.com/live/dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
  assert.equal(getYouTubeId('https://m.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
})

test('URLs sin protocolo', () => {
  assert.equal(getYouTubeId('www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
  assert.equal(getYouTubeId('youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
})

test('no-YouTube o inválido → null', () => {
  assert.equal(getYouTubeId('https://vimeo.com/12345'), null)
  assert.equal(getYouTubeId('https://ejemplo.com/watch?v=dQw4w9WgXcQ'), null)
  assert.equal(getYouTubeId('https://notyoutube.com/watch?v=dQw4w9WgXcQ'), null)
  assert.equal(getYouTubeId(''), null)
  assert.equal(getYouTubeId(null), null)
  assert.equal(getYouTubeId('https://www.youtube.com/'), null)
})

test('slugify: título típico', () => {
  assert.equal(slugify('Cómo cerrar caja en Bold POS'), 'como-cerrar-caja-en-bold-pos')
})

test('slugify: tildes, ñ y signos varios', () => {
  assert.equal(slugify('¿Qué es la reversión de pago?'), 'que-es-la-reversion-de-pago')
  assert.equal(slugify('Configuración de año fiscal'), 'configuracion-de-ano-fiscal')
})

test('slugify: guiones dobles y bordes se recortan', () => {
  assert.equal(slugify('  --Hola   Mundo--  '), 'hola-mundo')
})

test('slugify: vacío o sin caracteres válidos → cadena vacía', () => {
  assert.equal(slugify(''), '')
  assert.equal(slugify(null), '')
  assert.equal(slugify('***'), '')
})
