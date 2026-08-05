import test from 'node:test'
import assert from 'node:assert/strict'
import { rankAttention } from '../js/bot-attention.js'

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
