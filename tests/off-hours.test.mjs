import test from 'node:test'
import assert from 'node:assert/strict'
import { offHoursStats, isOffHour, BUSINESS_HOURS } from '../js/off-hours.js'

test('isOffHour: Lun–Vie atiende 8am–5pm', () => {
  for (const d of [1, 2, 3, 4, 5]) {
    assert.equal(isOffHour(d, 7), true)    // 7am → fuera
    assert.equal(isOffHour(d, 8), false)   // 8am → dentro
    assert.equal(isOffHour(d, 16), false)  // 4pm → dentro
    assert.equal(isOffHour(d, 17), true)   // 5pm → fuera
  }
})

test('isOffHour: sábado atiende 8am–12m', () => {
  assert.equal(isOffHour(6, 7), true)
  assert.equal(isOffHour(6, 8), false)
  assert.equal(isOffHour(6, 11), false)
  assert.equal(isOffHour(6, 12), true)   // mediodía del sábado ya es fuera
  assert.equal(isOffHour(6, 15), true)
})

test('isOffHour: domingo cerrado todo el día', () => {
  for (let h = 0; h < 24; h++) assert.equal(isOffHour(0, h), true)
})

test('offHoursStats: cuenta según el horario de cada día', () => {
  const cells = [
    { dow: 1, hour: 3, count: 5 },   // lun 3am  → fuera
    { dow: 1, hour: 8, count: 10 },  // lun 8am  → dentro
    { dow: 1, hour: 16, count: 4 },  // lun 4pm  → dentro
    { dow: 1, hour: 17, count: 6 },  // lun 5pm  → fuera
    { dow: 6, hour: 9, count: 3 },   // sáb 9am  → dentro
    { dow: 6, hour: 14, count: 7 },  // sáb 2pm  → fuera
    { dow: 0, hour: 10, count: 5 },  // dom 10am → fuera
  ]
  const r = offHoursStats(cells)
  assert.equal(r.total, 40)
  assert.equal(r.off, 23)          // 5 + 6 + 7 + 5
  assert.equal(r.pct, 58)          // round(100*23/40)
})

test('offHoursStats: sin datos → 0', () => {
  assert.deepEqual(offHoursStats([]), { off: 0, total: 0, pct: 0 })
  assert.deepEqual(offHoursStats(null), { off: 0, total: 0, pct: 0 })
})

test('offHoursStats: acepta un horario distinto', () => {
  const cells = [{ dow: 1, hour: 7, count: 2 }, { dow: 1, hour: 9, count: 2 }]
  const schedule = { ...BUSINESS_HOURS, 1: [9, 18] }
  assert.equal(offHoursStats(cells, { schedule }).off, 2)
})
