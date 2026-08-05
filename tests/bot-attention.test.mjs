import test from 'node:test'
import assert from 'node:assert/strict'
import { pickContentToReinforce, rankAttention } from '../js/bot-attention.js'

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

test('rankAttention: prioriza contenido faltante, luego baja resolución, ordena por volumen', () => {
  const byCat = [
    { category: 'Facturación/Cuenta', total: 20, resolved_pct: 40, negative_pct: 10, support_pct: 20 },
    { category: 'Inventario', total: 15, resolved_pct: 80, negative_pct: 35, support_pct: 20 },
    { category: 'Ventas', total: 12, resolved_pct: 90, negative_pct: 5, support_pct: 50 },
    { category: 'Reportes', total: 2, resolved_pct: 10, negative_pct: 90, support_pct: 90 }, // bajo volumen → fuera
    { category: 'Contactos', total: 30, resolved_pct: 95, negative_pct: 5, support_pct: 5 }, // sin problema → fuera
  ]
  const gaps = [{ category: 'Facturación/Cuenta', total: 8, has_lesson: false }]
  const r = rankAttention(byCat, gaps, { limit: 4 })
  assert.deepEqual(r.map(x => [x.category, x.problem, x.action]), [
    ['Facturación/Cuenta', 'contenido-faltante', 'crear'],
    ['Inventario', 'negativo', 'revisar'],
    ['Ventas', 'escala', 'reforzar'],
  ])
  assert.equal(r[0].detail, '8 sin lección')
})

test('rankAttention: baja resolución marca extraStatus no_resuelta', () => {
  const r = rankAttention([{ category: 'X', total: 10, resolved_pct: 30, negative_pct: 0, support_pct: 0 }], [])
  assert.equal(r[0].problem, 'baja-resolucion')
  assert.equal(r[0].extraStatus, 'no_resuelta')
})

test('rankAttention: sin categorías con problema devuelve []', () => {
  assert.deepEqual(rankAttention([{ category: 'X', total: 50, resolved_pct: 99, negative_pct: 0, support_pct: 0 }], []), [])
})
