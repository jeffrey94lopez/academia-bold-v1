import test from 'node:test'
import assert from 'node:assert/strict'
import { claveAvance, cargarAvance, guardarAvance, adoptarCuenta } from '../js/onboarding-progress.js'
import { crearEstadoInicial } from '../js/onboarding-state.js'

const mem = () => { const m = new Map(); return { get: k => m.get(k) ?? null, set: (k, v) => m.set(k, v), remove: k => m.delete(k), m } }

test('clave por cuenta', () => {
  assert.equal(claveAvance(null), 'onb_progress'); assert.equal(claveAvance('acc1'), 'onb_progress:acc1')
})

test('JSON corrupto u otra versión → null', () => {
  const io = mem(); io.set('onb_progress', '{nope'); assert.equal(cargarAvance(io, null), null)
  io.set('onb_progress', JSON.stringify({ v: 99 })); assert.equal(cargarAvance(io, null), null)
})

test('ida y vuelta', () => {
  const io = mem(); const s = { ...crearEstadoInicial('r'), step: 'venta', sub: 2 }
  guardarAvance(io, 'a', s); assert.deepEqual(cargarAvance(io, 'a'), s)
})

test('adoptarCuenta migra el avance anónimo', () => {
  const io = mem(); const anon = { ...crearEstadoInicial('r'), step: 'gasto', sub: 1 }
  guardarAvance(io, null, anon)
  const r = adoptarCuenta(io, 'acc', anon)
  assert.equal(r.step, 'gasto'); assert.equal(io.get('onb_progress'), null)
  assert.deepEqual(cargarAvance(io, 'acc'), anon)
})

test('adoptarCuenta conserva el avance mayor de la cuenta', () => {
  const io = mem(); guardarAvance(io, 'acc', { ...crearEstadoInicial('r0'), step: 'facturas', sub: 0 })
  const r = adoptarCuenta(io, 'acc', { ...crearEstadoInicial('r1'), step: 'bienvenida' })
  assert.equal(r.step, 'facturas')
})

test('adoptarCuenta con accountId null/vacío no cambia nada ni escribe', () => {
  const io = mem()
  const estado = { ...crearEstadoInicial('r'), step: 'venta', sub: 1 }
  assert.equal(adoptarCuenta(io, null, estado), estado)
  assert.equal(adoptarCuenta(io, '', estado), estado)
  assert.equal(io.m.size, 0)
})
