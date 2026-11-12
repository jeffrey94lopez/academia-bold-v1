import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const src = readFileSync(new URL('../js/barras-render.js', import.meta.url), 'utf8')

test('barras-render carga las librerias desde vendor/, no desde un CDN', () => {
  assert.doesNotMatch(src, /jsdelivr|unpkg|cdnjs/)
  const rutas = [...src.matchAll(/'(vendor\/[^']+)'/g)].map(m => m[1])
  assert.equal(rutas.length, 3)
  for (const r of rutas) assert.ok(existsSync(new URL('../' + r, import.meta.url)), r)
})
