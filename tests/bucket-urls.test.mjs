import test from 'node:test'
import assert from 'node:assert/strict'
import { extractBucketUrls, countReferences, diffBrokenUrls } from '../js/bucket-urls.js'

const P = 'https://x.supabase.co/storage/v1/object/public/material/'
const A = P + 'foto-1700000000000.png'
const B = P + 'carpeta/otra-1700000000001.png'

test('extractBucketUrls: JSON de bloques con dos imágenes devuelve las dos', () => {
  const raw = JSON.stringify([
    { type: 'text', content: 'hola' },
    { type: 'image', url: A, caption: 'pie' },
    { type: 'image', url: B },
  ])
  assert.deepEqual(extractBucketUrls(raw, P), [A, B])
})

test('extractBucketUrls: HTML legacy con img src', () => {
  const raw = `<p>mirá</p><img src="${A}"><p>fin</p>`
  assert.deepEqual(extractBucketUrls(raw, P), [A])
})

test('extractBucketUrls: la misma URL repetida aparece una sola vez', () => {
  const raw = JSON.stringify([{ url: A }, { url: A }])
  assert.deepEqual(extractBucketUrls(raw, P), [A])
})

test('extractBucketUrls: query y hash se recortan', () => {
  const raw = `<img src="${A}?t=123"><img src="${B}#x">`
  assert.deepEqual(extractBucketUrls(raw, P), [A, B])
})

test('extractBucketUrls: texto sin URLs del bucket devuelve []', () => {
  assert.deepEqual(extractBucketUrls('<p>sin imágenes</p>', P), [])
  assert.deepEqual(extractBucketUrls('https://otro-host.com/x.png', P), [])
})

test('extractBucketUrls: entradas degeneradas devuelven [] y no lanzan', () => {
  assert.deepEqual(extractBucketUrls(null, P), [])
  assert.deepEqual(extractBucketUrls(undefined, P), [])
  assert.deepEqual(extractBucketUrls('', P), [])
  assert.deepEqual(extractBucketUrls(42, P), [])
  assert.deepEqual(extractBucketUrls([A], P), [])
})

test('extractBucketUrls: prefijo inválido devuelve []', () => {
  assert.deepEqual(extractBucketUrls(`<img src="${A}">`, ''), [])
  assert.deepEqual(extractBucketUrls(`<img src="${A}">`, null), [])
})

test('extractBucketUrls: el prefijo pelado no cuenta como URL', () => {
  assert.deepEqual(extractBucketUrls(`<img src="${P}">`, P), [])
})

test('countReferences: cuenta filas, no ocurrencias', () => {
  const rows = [
    { contenido: `${A} y otra vez ${A}` },
    { contenido: 'nada' },
    { contenido: A },
  ]
  assert.equal(countReferences(rows, 'contenido', A), 2)
})

test('countReferences: respeta el campo pedido', () => {
  const rows = [{ url: A, contenido: 'nada' }]
  assert.equal(countReferences(rows, 'url', A), 1)
  assert.equal(countReferences(rows, 'contenido', A), 0)
})

test('countReferences: filas sin el campo o con valor no-string no cuentan', () => {
  const rows = [{}, { contenido: null }, { contenido: 42 }, { contenido: A }]
  assert.equal(countReferences(rows, 'contenido', A), 1)
})

test('countReferences: argumentos degenerados devuelven 0', () => {
  assert.equal(countReferences([], 'contenido', A), 0)
  assert.equal(countReferences(null, 'contenido', A), 0)
  assert.equal(countReferences([{ contenido: A }], 'contenido', ''), 0)
})

test('diffBrokenUrls: devuelve solo las ausentes, en orden y sin duplicados', () => {
  assert.deepEqual(diffBrokenUrls([A, B, A], [B]), [A])
})

test('diffBrokenUrls: si están todas devuelve []; si el inventario está vacío devuelve todas', () => {
  assert.deepEqual(diffBrokenUrls([A, B], [A, B]), [])
  assert.deepEqual(diffBrokenUrls([A, B], []), [A, B])
  assert.deepEqual(diffBrokenUrls(null, [A]), [])
})
