import test from 'node:test'
import assert from 'node:assert/strict'
import { computeRange, sentimentBar } from '../js/analytics-ui.js'

const now = new Date('2026-07-20T15:30:00') // hora local

test('computeRange today: medianoche a fin de día de hoy', () => {
  const { from, to } = computeRange('today', now)
  assert.equal(from.getHours(), 0)
  assert.equal(from.getDate(), 20)
  assert.equal(to.getHours(), 23)
  assert.equal(to.getDate(), 20)
})

test('computeRange 7d: desde hace 6 días 00:00 hasta hoy fin de día', () => {
  const { from, to } = computeRange('7d', now)
  assert.equal(from.getDate(), 14)
  assert.equal(from.getHours(), 0)
  assert.equal(to.getDate(), 20)
})

test('computeRange 30d: desde hace 29 días', () => {
  const { from } = computeRange('30d', now)
  assert.equal(from.getMonth(), 5) // junio (0-based)
  assert.equal(from.getDate(), 21)
})

test('computeRange month: primer día del mes actual', () => {
  const { from } = computeRange('month', now)
  assert.equal(from.getDate(), 1)
  assert.equal(from.getMonth(), 6) // julio
})

test('computeRange year: 1 de enero del año actual', () => {
  const { from } = computeRange('year', now)
  assert.equal(from.getMonth(), 0)
  assert.equal(from.getDate(), 1)
})

test('muestra los tres conteos dentro de la barra', () => {
  const html = sentimentBar({ positivo: 12, neutro: 5, negativo: 3 })
  assert.match(html, />12</)
  assert.match(html, />5</)
  assert.match(html, />3</)
})

test('calcula los anchos sobre el total', () => {
  const html = sentimentBar({ positivo: 2, neutro: 1, negativo: 1 })
  assert.match(html, /width:50%/)
  assert.match(html, /width:25%/)
})

test('base cero: no lanza y produce anchos 0%', () => {
  let html
  assert.doesNotThrow(() => { html = sentimentBar({ positivo: 0, neutro: 0, negativo: 0 }) })
  assert.match(html, /width:0%/)
})

test('entrada indefinida no lanza', () => {
  assert.doesNotThrow(() => sentimentBar(undefined))
})
