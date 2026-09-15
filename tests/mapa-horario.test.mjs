import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBandas, buildHeatmap } from '../js/admin-bot-analytics.js'

const CELLS = [
  { dow: 1, hour: 9, count: 4 },    // lun mañana
  { dow: 3, hour: 20, count: 9 },   // mié después de cerrar
  { dow: 6, hour: 14, count: 2 },   // sáb tarde (ya cerró)
]

test('buildBandas: rotula las franjas en 12h (el heatmap de abajo sigue en 24h)', () => {
  const html = buildBandas(CELLS)
  for (const r of ['12am–8am', '8am–12m', '12m–5pm', '5pm–12am']) assert.ok(html.includes(r), r)
  assert.ok(!html.includes('00:00–08:00'))
  // el heatmap conserva las horas 0–23 y sus bloques hh:00–hh:59
  assert.ok(buildHeatmap(CELLS).includes('Bloque 08:00–08:59'))
})

test('buildBandas: 4 franjas × 7 días con el número dentro de la celda', () => {
  const html = buildBandas(CELLS)
  for (const dia of ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']) assert.match(html, new RegExp(`>${dia}<`))
  for (const franja of ['Antes de abrir', 'Mañana', 'Tarde', 'Después de cerrar']) assert.ok(html.includes(franja))
  assert.equal((html.match(/height:34px/g) || []).length, 28)
  assert.ok(html.includes('>9<') && html.includes('>4<') && html.includes('>2<'))
})

test('buildBandas: el titular nombra el momento más fuerte', () => {
  assert.match(buildBandas(CELLS), /miércoles después de cerrar<\/span> — 9 conversaciones/)
})

test('buildBandas: sin datos no inventa titular', () => {
  const html = buildBandas([])
  assert.ok(!html.includes('El momento más fuerte'))
  assert.equal((html.match(/height:34px/g) || []).length, 28)
})

test('buildBandas: colorea por día, no solo por hora', () => {
  const html = buildBandas(CELLS)
  assert.ok(html.includes('Sáb 12m–5pm — 2 conversaciones (fuera de horario)'))
  assert.ok(html.includes('Lun 8am–12m — 4 conversaciones"'))   // sin "(fuera de horario)"
})

test('buildHeatmap: la franja azul cubre exactamente las horas de atención', () => {
  const html = buildHeatmap(CELLS)
  // 8am–5pm → columnas 9 a 17 de la rejilla de 24 (la 1 es la hora 0)
  assert.ok(html.includes('grid-column:9 / span 9'))
  assert.ok(html.includes('8am–5pm · horario de atención'))
})

test('buildHeatmap: sigue dibujando las 168 celdas de siempre', () => {
  assert.equal((buildHeatmap(CELLS).match(/height:12px/g) || []).length, 168)
})
