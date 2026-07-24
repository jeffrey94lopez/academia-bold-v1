import test from 'node:test'
import assert from 'node:assert/strict'
import { pickContentToReinforce } from '../js/bot-attention.js'

const GAPS = [
  { category: 'Impresora', has_lesson: false },
  { category: 'Ventas', has_lesson: true },
]

test('elige la categoría con más no_info', () => {
  const by = [
    { category: 'Ventas', no_info: 2, support_pct: 10 },
    { category: 'Impresora', no_info: 5, support_pct: 40 },
  ]
  const r = pickContentToReinforce(by, GAPS)
  assert.equal(r.category, 'Impresora')
  assert.equal(r.noInfo, 5)
  assert.equal(r.supportPct, 40)
})

test("action 'create' cuando la categoría no tiene lección", () => {
  const by = [{ category: 'Impresora', no_info: 3, support_pct: 0 }]
  const r = pickContentToReinforce(by, GAPS)
  assert.equal(r.hasLesson, false)
  assert.equal(r.action, 'create')
})

test("action 'reinforce' cuando la categoría ya tiene lección", () => {
  const by = [{ category: 'Ventas', no_info: 4, support_pct: 20 }]
  const r = pickContentToReinforce(by, GAPS)
  assert.equal(r.hasLesson, true)
  assert.equal(r.action, 'reinforce')
})

test('categoría ausente en gaps → action create', () => {
  const by = [{ category: 'Reportes', no_info: 1, support_pct: 0 }]
  const r = pickContentToReinforce(by, GAPS)
  assert.equal(r.hasLesson, false)
  assert.equal(r.action, 'create')
})

test('null cuando ninguna categoría tiene no_info > 0', () => {
  const by = [
    { category: 'Ventas', no_info: 0, support_pct: 10 },
    { category: 'Impresora', support_pct: 40 },
  ]
  assert.equal(pickContentToReinforce(by, GAPS), null)
})

test('entradas vacías/indefinidas → null', () => {
  assert.equal(pickContentToReinforce([], []), null)
  assert.equal(pickContentToReinforce(undefined, undefined), null)
})
