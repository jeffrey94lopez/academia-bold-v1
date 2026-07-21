import test from 'node:test'
import assert from 'node:assert/strict'
import { csvCell } from '../js/utils.js'

test('csvCell deja valores simples intactos', () => {
  assert.equal(csvCell('hola'), 'hola')
  assert.equal(csvCell(42), '42')
  assert.equal(csvCell(null), '')
})

test('csvCell entrecomilla comas, comillas y saltos', () => {
  assert.equal(csvCell('a,b'), '"a,b"')
  assert.equal(csvCell('di "hola"'), '"di ""hola"""')
  assert.equal(csvCell('línea1\nlínea2'), '"línea1\nlínea2"')
})

test('csvCell neutraliza fórmulas anteponiendo apóstrofo', () => {
  assert.equal(csvCell('=1+1'), "'=1+1")
  assert.equal(csvCell('+49'), "'+49")
  assert.equal(csvCell('-2'), "'-2")
  assert.equal(csvCell('@cmd'), "'@cmd")
})

test('csvCell neutraliza Y entrecomilla si además hay coma', () => {
  assert.equal(csvCell('=a,b'), '"\'=a,b"')
})
