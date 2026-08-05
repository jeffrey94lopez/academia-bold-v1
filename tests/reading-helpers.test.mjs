import test from 'node:test'
import assert from 'node:assert/strict'
import { scrollPct, isRead } from '../js/reading-helpers.js'

test('scrollPct: contenido que cabe sin scroll cuenta como 100', () => {
  assert.equal(scrollPct(0, 500, 500), 100)
  assert.equal(scrollPct(0, 500, 400), 100) // scrollHeight < clientHeight
  assert.equal(scrollPct(0, 0, 0), 100)     // sin dimensiones
})

test('scrollPct: a media altura', () => {
  assert.equal(scrollPct(0, 400, 1000), 40)     // (0+400)/1000
  assert.equal(scrollPct(300, 400, 1000), 70)   // (300+400)/1000
})

test('scrollPct: al fondo llega a 100 y no se pasa', () => {
  assert.equal(scrollPct(600, 400, 1000), 100)
  assert.equal(scrollPct(9999, 400, 1000), 100) // clamp
})

test('isRead: ≥90% y ≥5s es lectura completa', () => {
  assert.equal(isRead({ maxScrollPct: 90, dwellMs: 5000 }), true)
  assert.equal(isRead({ maxScrollPct: 100, dwellMs: 10000 }), true)
})

test('isRead: falla si falta scroll o tiempo', () => {
  assert.equal(isRead({ maxScrollPct: 89, dwellMs: 5000 }), false)
  assert.equal(isRead({ maxScrollPct: 100, dwellMs: 4999 }), false)
  assert.equal(isRead({ maxScrollPct: 0, dwellMs: 0 }), false)
})

test('isRead: umbrales configurables', () => {
  assert.equal(isRead({ maxScrollPct: 50, dwellMs: 1000 }, { minScrollPct: 50, minDwellMs: 1000 }), true)
})
