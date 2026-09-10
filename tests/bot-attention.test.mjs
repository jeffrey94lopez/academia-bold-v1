import test from 'node:test'
import assert from 'node:assert/strict'
import { rankAttention } from '../js/bot-attention.js'

test('rankAttention: prioriza contenido faltante, luego baja resolución, ordena por volumen', () => {
  const byCat = [
    { category: 'Facturación/Cuenta', total: 20, resolved_pct: 40, no_info_pct: 10, support_pct: 20 },
    { category: 'Inventario', total: 15, resolved_pct: 80, no_info_pct: 35, support_pct: 20 },
    { category: 'Ventas', total: 12, resolved_pct: 90, no_info_pct: 5, support_pct: 50 },
    { category: 'Reportes', total: 2, resolved_pct: 10, no_info_pct: 90, support_pct: 90 }, // bajo volumen → fuera
    { category: 'Contactos', total: 30, resolved_pct: 95, no_info_pct: 5, support_pct: 5 }, // sin problema → fuera
  ]
  const gaps = [{ category: 'Facturación/Cuenta', total: 8, has_lesson: false }]
  const r = rankAttention(byCat, gaps, { limit: 4 })
  assert.deepEqual(r.map(x => [x.category, x.problem, x.action]), [
    ['Facturación/Cuenta', 'contenido-faltante', 'crear'],
    ['Inventario', 'sin-informacion', 'reforzar'],
    ['Ventas', 'escala', 'reforzar'],
  ])
  assert.equal(r[0].detail, '8 sin lección')
})

test('rankAttention: baja resolución marca extraStatus no_resuelta', () => {
  const r = rankAttention([{ category: 'X', total: 10, resolved_pct: 30, no_info_pct: 0, support_pct: 0 }], [])
  assert.equal(r[0].problem, 'baja-resolucion')
  assert.equal(r[0].extraStatus, 'no_resuelta')
})

test('rankAttention: sin categorías con problema devuelve []', () => {
  assert.deepEqual(rankAttention([{ category: 'X', total: 50, resolved_pct: 99, no_info_pct: 0, support_pct: 0 }], []), [])
})

test('rankAttention: excluye "Otro" (catch-all) aunque tenga gap o problema', () => {
  const byCat = [
    { category: 'Otro', total: 40, resolved_pct: 30, no_info_pct: 50, support_pct: 60 },
    { category: 'Sin categoría', total: 20, resolved_pct: 10, no_info_pct: 0, support_pct: 0 },
    { category: 'Inventario', total: 10, resolved_pct: 40, no_info_pct: 0, support_pct: 0 },
  ]
  const gaps = [{ category: 'Otro', total: 40, has_lesson: false }]
  const r = rankAttention(byCat, gaps)
  assert.deepEqual(r.map(x => x.category), ['Inventario'])
})
