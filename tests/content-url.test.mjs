import test from 'node:test'
import assert from 'node:assert/strict'
import { remapContentUrl } from '../js/content-url.js'

const OLD = 'https://x.supabase.co/storage/v1/object/public/material/foto.png'
const NEW = 'https://x.supabase.co/storage/v1/object/public/material/carpeta/foto.png'

test('formato moderno: cambia la URL y el resultado sigue siendo JSON válido', () => {
  const raw = JSON.stringify([
    { type: 'text', content: 'hola' },
    { type: 'image', url: OLD, caption: 'pie' },
  ])
  const next = remapContentUrl(raw, OLD, NEW)
  const blocks = JSON.parse(next)
  assert.equal(blocks.length, 2)
  assert.equal(blocks[0].content, 'hola')
  assert.equal(blocks[1].url, NEW)
  assert.equal(blocks[1].caption, 'pie')
})

test('reemplaza TODAS las ocurrencias de la URL', () => {
  const raw = JSON.stringify([
    { type: 'image', url: OLD },
    { type: 'image', url: OLD },
  ])
  const blocks = JSON.parse(remapContentUrl(raw, OLD, NEW))
  assert.equal(blocks[0].url, NEW)
  assert.equal(blocks[1].url, NEW)
})

test('formato legacy: arregla la URL dentro del HTML crudo sin perder el resto', () => {
  const raw = `<p>Mirá la foto</p><img src="${OLD}"><p>fin</p>`
  const next = remapContentUrl(raw, OLD, NEW)
  assert.equal(next, `<p>Mirá la foto</p><img src="${NEW}"><p>fin</p>`)
})

test('sin coincidencia: devuelve null y no se toca la fila', () => {
  const raw = JSON.stringify([{ type: 'text', content: 'sin imágenes' }])
  assert.equal(remapContentUrl(raw, OLD, NEW), null)
})

test('entradas degeneradas devuelven null y no lanzan', () => {
  assert.equal(remapContentUrl(null, OLD, NEW), null)
  assert.equal(remapContentUrl(undefined, OLD, NEW), null)
  assert.equal(remapContentUrl('', OLD, NEW), null)
  assert.equal(remapContentUrl(42, OLD, NEW), null)
  assert.equal(remapContentUrl([{ url: OLD }], OLD, NEW), null)
})

test('URLs inválidas devuelven null (no escribe "undefined" en el contenido)', () => {
  const raw = JSON.stringify([{ type: 'image', url: OLD }])
  assert.equal(remapContentUrl(raw, OLD, undefined), null)
  assert.equal(remapContentUrl(raw, OLD, ''), null)
  assert.equal(remapContentUrl(raw, '', NEW), null)
})

test('fail-closed: si el reemplazo invalidaría el JSON, no escribe', () => {
  const raw = JSON.stringify([{ type: 'image', url: OLD }])
  const roto = 'https://x/"; drop--.png'
  assert.equal(remapContentUrl(raw, OLD, roto), null)
})

test('legacy que no es JSON ni antes ni después: sí se escribe', () => {
  const raw = `<img src="${OLD}">`
  const roto = 'https://x/"raro".png'
  assert.equal(remapContentUrl(raw, OLD, roto), `<img src="${roto}">`)
})
