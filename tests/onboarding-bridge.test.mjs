import test from 'node:test'
import assert from 'node:assert/strict'
import { destinoContenedor } from '../js/bold-context.js'
import { mensajeCerrar, mensajeNavegar, cerrarRecorrido, irAMisItems } from '../js/onboarding-bridge.js'
import { crearTelemetria } from '../js/onboarding-telemetry.js'

test('destinoContenedor', () => {
  const suelto = {}; suelto.parent = suelto
  assert.equal(destinoContenedor(suelto), null)
  const enBold = { parent: {}, document: { location: { ancestorOrigins: ['https://pos.bold.co'] } } }
  assert.equal(destinoContenedor(enBold), 'https://pos.bold.co')
  const enOtro = { parent: {}, document: { location: { ancestorOrigins: ['https://evil.example'] } } }
  assert.equal(destinoContenedor(enOtro), null)
  assert.equal(destinoContenedor({ parent: {}, document: { location: {} } }), '*')
})

test('cerrarRecorrido envía el mensaje a Bold', () => {
  const sent = []
  const win = { parent: { postMessage: (m, o) => sent.push([m, o]) }, document: { location: { ancestorOrigins: ['https://pos.stg.bold.co'] } } }
  assert.equal(cerrarRecorrido(win, 'skip', { desdeAyuda: false }), 'mensaje')
  assert.deepEqual(sent, [[{ type: 'academia:onboarding-close', v: 1, reason: 'skip' }, 'https://pos.stg.bold.co']])
})

test('desde Ayuda vuelve al portal', () => {
  const win = { location: { href: '/onboarding' }, parent: null }; win.parent = win
  assert.equal(cerrarRecorrido(win, 'complete', { desdeAyuda: true }), 'portal'); assert.equal(win.location.href, '/')
})

test('cerrarRecorrido: sin contenedor conocido queda "suelto"', () => {
  const win = {}; win.parent = win
  assert.equal(cerrarRecorrido(win, 'skip', { desdeAyuda: false }), 'suelto')
})

test('mensajeCerrar y mensajeNavegar arman la forma exacta del mensaje', () => {
  assert.deepEqual(mensajeCerrar('no_aplica'), { type: 'academia:onboarding-close', v: 1, reason: 'no_aplica' })
  assert.deepEqual(mensajeNavegar('items'), { type: 'academia:navigate', v: 1, to: 'items' })
})

test('irAMisItems: manda el mensaje de navegación al contenedor conocido', () => {
  const sent = []
  const win = { parent: { postMessage: (m, o) => sent.push([m, o]) }, document: { location: { ancestorOrigins: ['https://pos.bold.co'] } } }
  assert.equal(irAMisItems(win), 'mensaje')
  assert.deepEqual(sent, [[{ type: 'academia:navigate', v: 1, to: 'items' }, 'https://pos.bold.co']])
})

test('irAMisItems: sin contenedor conocido queda "suelto"', () => {
  const win = {}; win.parent = win
  assert.equal(irAMisItems(win), 'suelto')
})

test('telemetría arma el payload', () => {
  const calls = []; const t = crearTelemetria({ track: (e, p) => calls.push([e, p]), getRunId: () => 'r1', getAccountId: () => null })
  t.pasoCompleto('venta')
  assert.deepEqual(calls[0], ['onboarding_step_complete', { run_id: 'r1', step: 'venta', vertical: 'retail' }])
})

test('telemetría: inicio y fin omiten step, e incluyen account_id cuando existe', () => {
  const calls = []
  const t = crearTelemetria({ track: (e, p) => calls.push([e, p]), getRunId: () => 'r1', getAccountId: () => '42' })
  t.inicio()
  t.fin()
  assert.deepEqual(calls[0], ['onboarding_start', { run_id: 'r1', vertical: 'retail', account_id: '42' }])
  assert.deepEqual(calls[1], ['onboarding_complete', { run_id: 'r1', vertical: 'retail', account_id: '42' }])
})
