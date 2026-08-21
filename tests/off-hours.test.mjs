import test from 'node:test'
import assert from 'node:assert/strict'
import { offHoursStats } from '../js/off-hours.js'

test('offHoursStats: cuenta fuera de [8,17) = antes de 8am o desde 5pm', () => {
  const cells = [
    { dow: 1, hour: 3, count: 5 },   // 3am → fuera
    { dow: 1, hour: 8, count: 10 },  // 8am → dentro
    { dow: 1, hour: 16, count: 4 },  // 4pm → dentro
    { dow: 1, hour: 17, count: 6 },  // 5pm → fuera
    { dow: 1, hour: 22, count: 5 },  // 10pm → fuera
  ]
  const r = offHoursStats(cells)
  assert.equal(r.total, 30)
  assert.equal(r.off, 16)          // 5 + 6 + 5
  assert.equal(r.pct, 53)          // round(100*16/30)
})

test('offHoursStats: sin datos → 0', () => {
  assert.deepEqual(offHoursStats([]), { off: 0, total: 0, pct: 0 })
  assert.deepEqual(offHoursStats(null), { off: 0, total: 0, pct: 0 })
})

test('offHoursStats: respeta límites configurables', () => {
  const cells = [{ dow: 0, hour: 7, count: 2 }, { dow: 0, hour: 9, count: 2 }]
  // con horario [9,18): la de las 7 queda fuera, la de las 9 dentro
  assert.equal(offHoursStats(cells, { startHour: 9, endHour: 18 }).off, 2)
})
