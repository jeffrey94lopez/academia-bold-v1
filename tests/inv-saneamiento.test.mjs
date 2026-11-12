import test from 'node:test'
import assert from 'node:assert/strict'
import { sanear } from '../js/inv-saneamiento.js'

test('sanear: reemplaza acento grave por apóstrofe', () => {
  assert.equal(sanear('Café`especial'), "Café'especial")
})

test('sanear: reemplaza acento agudo suelto por apóstrofe', () => {
  assert.equal(sanear('Café´especial'), "Café'especial")
})

test('sanear: reemplaza grado por numeral', () => {
  assert.equal(sanear('Tasa °18'), 'Tasa #18')
})

test('sanear: elimina llaves, pipe, porcentaje, interrogaciones y signos de exclamación', () => {
  assert.equal(sanear('{Promoción}'), 'Promoción')
  assert.equal(sanear('¡Hola!'), 'Hola')
  assert.equal(sanear('A%B?C'), 'ABC')
})

test('sanear: colapsa espacios dejados por caracteres borrados', () => {
  assert.equal(sanear('A | B'), 'A B')
})

test('sanear: trim en los extremos', () => {
  assert.equal(sanear('   hola   '), 'hola')
})

test('sanear: queda vacío si el string era solo caracteres prohibidos', () => {
  assert.equal(sanear('¡!?%'), '')
  assert.equal(sanear('   '), '')
})

test('sanear: preserva tildes normales dentro de palabras', () => {
  assert.equal(sanear('canción'), 'canción')
  assert.equal(sanear('Panadería'), 'Panadería')
})

test('sanear: null/undefined → cadena vacía (no explota)', () => {
  assert.equal(sanear(null), '')
  assert.equal(sanear(undefined), '')
})

test('sanear: números y letras no-latinas pasan sin modificar', () => {
  assert.equal(sanear('ABC123 xyz'), 'ABC123 xyz')
})

test('sanear: el pipe separa palabras, así que se cambia por un espacio', () => {
  assert.equal(sanear('Ferretería|varios'), 'Ferretería varios')
  assert.equal(sanear('A|B'), 'A B')
  assert.equal(sanear('A | B'), 'A B')
})
