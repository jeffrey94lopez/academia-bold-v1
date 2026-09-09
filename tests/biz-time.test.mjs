import test from 'node:test'
import assert from 'node:assert/strict'
import {
  BIZ_TZ, bizParts, bizDate, bizDow, bizStartOfDay, bizEndOfDay, fmtBizDay, parseBizDay,
} from '../js/biz-time.js'

test('zona de negocio: Bogotá', () => {
  assert.equal(BIZ_TZ, 'America/Bogota')
})

test('bizDate arma el instante de un reloj de pared de Bogotá (UTC-5)', () => {
  assert.equal(bizDate(2026, 7, 20).toISOString(), '2026-07-20T05:00:00.000Z')
  assert.equal(bizDate(2026, 7, 20, 23, 59, 59, 999).toISOString(), '2026-07-21T04:59:59.999Z')
})

test('bizDate normaliza días fuera de rango (hace N días, cruzando el mes)', () => {
  assert.equal(fmtBizDay(bizDate(2026, 7, 20 - 29)), '2026-06-21')
  assert.equal(fmtBizDay(bizDate(2026, 1, 1 - 1)), '2025-12-31')
})

test('bizParts lee el reloj de Bogotá, no el del proceso', () => {
  // 02:00 UTC del 21 todavía es el 20 a las 9pm en Bogotá.
  const p = bizParts(new Date('2026-07-21T02:00:00Z'))
  assert.deepEqual([p.year, p.month, p.day, p.hour], [2026, 7, 20, 21])
})

test('bizParts: medianoche de Bogotá es hora 0, no 24', () => {
  assert.equal(bizParts(new Date('2026-07-20T05:00:00Z')).hour, 0)
})

test('bizStartOfDay / bizEndOfDay usan el día de Bogotá', () => {
  const t = new Date('2026-07-21T02:00:00Z')   // 20 de julio, 9pm en Bogotá
  assert.equal(bizStartOfDay(t).toISOString(), '2026-07-20T05:00:00.000Z')
  assert.equal(bizEndOfDay(t).toISOString(), '2026-07-21T04:59:59.999Z')
})

test('fmtBizDay: el fin del día NO se corre al día siguiente (toISOString sí lo haría)', () => {
  const fin = bizEndOfDay(new Date('2026-07-20T15:00:00Z'))
  assert.equal(fin.toISOString().split('T')[0], '2026-07-21')  // lo que hacía antes
  assert.equal(fmtBizDay(fin), '2026-07-20')                   // lo que corresponde
})

test('bizDow: 0=Dom … 6=Sáb en hora de Bogotá', () => {
  assert.equal(bizDow(bizDate(2026, 7, 19)), 0)  // domingo
  assert.equal(bizDow(bizDate(2026, 7, 20)), 1)  // lunes
  assert.equal(bizDow(bizDate(2026, 7, 25)), 6)  // sábado
})

test('parseBizDay lee un <input type="date"> como día de negocio', () => {
  assert.equal(parseBizDay('2026-03-01').toISOString(), '2026-03-01T05:00:00.000Z')
  assert.equal(parseBizDay('2026-03-01', { endOfDay: true }).toISOString(), '2026-03-02T04:59:59.999Z')
})

test('parseBizDay: entrada inválida o vacía → null', () => {
  for (const v of ['', null, undefined, 'ayer', '2026-3-1']) assert.equal(parseBizDay(v), null)
})
