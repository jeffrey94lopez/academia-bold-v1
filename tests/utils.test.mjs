import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getYouTubeId, slugify, isStaff } from '../js/utils.js'

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

// isStaff lee window.location.search y localStorage; en Node no existen, así
// que se montan mínimos antes de importar nada que los use.
function conEntorno({ search = '', store = {} } = {}) {
  globalThis.window = { location: { search } }
  globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: k => { delete store[k] },
  }
  return store
}

test('isStaff: sin parámetro ni marca guardada es false', () => {
  conEntorno()
  assert.equal(isStaff(), false)
})

test('isStaff: ?staff=1 activa y queda recordado', () => {
  const store = conEntorno({ search: '?staff=1' })
  assert.equal(isStaff(), true)
  assert.equal(store.bold_staff, '1')
  conEntorno({ search: '', store })
  assert.equal(isStaff(), true)
})

test('isStaff: ?staff=0 lo apaga', () => {
  const store = conEntorno({ search: '?staff=0', store: { bold_staff: '1' } })
  assert.equal(isStaff(), false)
  assert.equal(store.bold_staff, undefined)
})

test('isStaff: un entorno sin window devuelve false en vez de lanzar', () => {
  delete globalThis.window
  delete globalThis.localStorage
  assert.equal(isStaff(), false)
})
