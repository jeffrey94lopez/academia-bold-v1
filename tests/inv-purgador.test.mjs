import test from 'node:test'
import assert from 'node:assert/strict'
import { purgar } from '../js/inv-purgador.js'

test('purgar: lista vacía', () => {
  const r = purgar([])
  assert.deepEqual(r.limpias, [])
  assert.deepEqual(r.mapeo, {})
  assert.equal(r.informe.duplicados_exactos, 0)
  assert.equal(r.informe.singulares_plurales, 0)
})

test('purgar: dedup exacto normalizado (mayúsculas, tildes, espacios)', () => {
  const r = purgar(['CAMISA', 'camisa', 'Camisa ', 'Cámisa'])
  assert.equal(r.limpias.length, 1)
  assert.equal(r.mapeo['CAMISA'], r.limpias[0])
  assert.equal(r.mapeo['camisa'], r.limpias[0])
  assert.equal(r.mapeo['Camisa '], r.limpias[0])
  assert.equal(r.mapeo['Cámisa'], r.limpias[0])
  assert.equal(r.informe.duplicados_exactos, 3) // 4 entradas, 3 merges
})

test('purgar: canónica = forma más larga', () => {
  const r = purgar(['Camisa', 'camisa HOMBRE'])
  assert.equal(r.limpias.length, 2)
  assert.ok(r.limpias.includes('camisa HOMBRE'))
  assert.ok(r.limpias.includes('Camisa'))
})

test('purgar: canónica cuando empatan es la primera en entrar (conserva orden)', () => {
  const r = purgar(['Camisa', 'camisa'])
  // Ambas normalizadas = 'camisa'. Empatan en longitud. Canónica: la primera.
  assert.equal(r.limpias[0], 'Camisa')
})

test('purgar: singular/plural en castellano (-s / -es)', () => {
  const r = purgar(['Camisa', 'Camisas', 'Pantalón', 'Pantalones'])
  assert.equal(r.limpias.length, 2)
  assert.ok(r.limpias.includes('Camisas'))   // la forma más larga
  assert.ok(r.limpias.includes('Pantalones'))
  assert.equal(r.informe.singulares_plurales, 2)
})

test('purgar: saneamiento integrado antes de normalizar', () => {
  // Café°5 → Café#5; Café#5 ya existe tal cual.
  const r = purgar(['Café°5', 'Café#5'])
  assert.equal(r.limpias.length, 1)
})

test('purgar: null/undefined/string vacío se filtran', () => {
  const r = purgar([null, undefined, '', '   ', 'Camisa'])
  assert.equal(r.limpias.length, 1)
  assert.equal(r.limpias[0], 'Camisa')
})

test('purgar: orden de la salida es alfabético por canónica', () => {
  const r = purgar(['Zapato', 'Bebida', 'Camisa'])
  assert.deepEqual(r.limpias, ['Bebida', 'Camisa', 'Zapato'])
})
