import test from 'node:test'
import assert from 'node:assert/strict'
import { offHoursStats, isOffHour, BUSINESS_HOURS, bandsFromSchedule, bandStats } from '../js/off-hours.js'

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

// -------- Franjas del mapa de horario (opción A) --------

test('bandsFromSchedule: las 4 franjas salen del horario, no están quemadas', () => {
  const b = bandsFromSchedule()
  assert.deepEqual(b.map(x => [x.key, x.from, x.to]), [
    ['antes', 0, 8],
    ['manana', 8, 12],
    ['tarde', 12, 17],
    ['despues', 17, 24],
  ])
})

test('bandsFromSchedule: si cambia el horario, se mueven los cortes', () => {
  const schedule = { ...BUSINESS_HOURS, 1: [9, 18] }
  const b = bandsFromSchedule(schedule)
  assert.deepEqual(b.map(x => [x.from, x.to]), [[0, 9], [9, 12], [12, 18], [18, 24]])
})

test('bandsFromSchedule: horario que cierra antes del mediodía no deja franja vacía', () => {
  const schedule = { ...BUSINESS_HOURS, 1: [8, 11] }
  const b = bandsFromSchedule(schedule)
  assert.deepEqual(b.map(x => [x.key, x.from, x.to]), [
    ['antes', 0, 8],
    ['manana', 8, 11],
    ['despues', 11, 24],
  ])
})

test('bandStats: suma las horas de cada franja por día', () => {
  const cells = [
    { dow: 1, hour: 3, count: 5 },    // lun antes de abrir
    { dow: 1, hour: 8, count: 10 },   // lun mañana
    { dow: 1, hour: 11, count: 2 },   // lun mañana
    { dow: 1, hour: 16, count: 4 },   // lun tarde
    { dow: 1, hour: 20, count: 6 },   // lun después de cerrar
  ]
  const r = bandStats(cells)
  const lun = r.rows.find(x => x.dow === 1)
  assert.deepEqual(lun.counts, [5, 12, 4, 6])
  assert.equal(r.rows.length, 7)
})

test('bandStats: marca dentro/fuera según el día, no solo la hora', () => {
  const r = bandStats([])
  const at = (dow, key) => {
    const row = r.rows.find(x => x.dow === dow)
    return row.off[r.bands.findIndex(b => b.key === key)]
  }
  assert.equal(at(1, 'manana'), false)   // lun 8–12 → se atiende
  assert.equal(at(1, 'tarde'), false)    // lun 12–17 → se atiende
  assert.equal(at(1, 'antes'), true)
  assert.equal(at(1, 'despues'), true)
  assert.equal(at(6, 'manana'), false)   // sáb 8–12 → se atiende
  assert.equal(at(6, 'tarde'), true)     // sáb cierra al mediodía
  for (const b of r.bands) assert.equal(at(0, b.key), true)  // domingo cerrado
})

test('bandStats: top es la franja con más conversaciones', () => {
  const cells = [
    { dow: 1, hour: 9, count: 4 },
    { dow: 3, hour: 20, count: 9 },
    { dow: 5, hour: 13, count: 7 },
  ]
  const r = bandStats(cells)
  assert.equal(r.top.dow, 3)
  assert.equal(r.top.band.key, 'despues')
  assert.equal(r.top.count, 9)
  assert.equal(r.max, 9)
})

test('bandStats: sin datos → sin top y max 0', () => {
  const r = bandStats([])
  assert.equal(r.top, null)
  assert.equal(r.max, 0)
  assert.equal(r.total, 0)
})

test('bandStats: ignora celdas con hora inválida', () => {
  const r = bandStats([{ dow: 1, hour: 99, count: 3 }, { dow: 1, hour: 9, count: 2 }])
  assert.equal(r.total, 2)
})
