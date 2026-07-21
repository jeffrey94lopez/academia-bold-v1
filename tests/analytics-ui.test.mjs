import test from 'node:test'
import assert from 'node:assert/strict'
import { computeRange } from '../js/analytics-ui.js'

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
