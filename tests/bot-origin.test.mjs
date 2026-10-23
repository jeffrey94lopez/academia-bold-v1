import test from 'node:test'
import assert from 'node:assert/strict'
import { setBotOrigin, getBotOrigin } from '../js/bot-origin.js'

test('getBotOrigin: por defecto no hay origen ni paso (el portal no cambia)', () => {
  assert.deepEqual(getBotOrigin(), { origin: null, step: null })
})

test('setBotOrigin: guarda origen y paso, y se puede volver a limpiar', () => {
  setBotOrigin('onboarding', 'crear_item')
  assert.deepEqual(getBotOrigin(), { origin: 'onboarding', step: 'crear_item' })
  setBotOrigin('onboarding', 'venta')
  assert.deepEqual(getBotOrigin(), { origin: 'onboarding', step: 'venta' })
  setBotOrigin(null, null)
  assert.deepEqual(getBotOrigin(), { origin: null, step: null })
})

test('getBotOrigin devuelve una copia: mutarla no cambia el estado', () => {
  setBotOrigin('onboarding', 'gasto')
  const o = getBotOrigin()
  o.step = 'otro'
  assert.equal(getBotOrigin().step, 'gasto')
  setBotOrigin(null, null)
})

test('setBotOrigin: un origen desconocido o vacío se trata como sin origen', () => {
  setBotOrigin('portal', 'x')
  assert.deepEqual(getBotOrigin(), { origin: null, step: null })
  setBotOrigin('onboarding', '')
  assert.deepEqual(getBotOrigin(), { origin: 'onboarding', step: null })
  setBotOrigin(null, null)
})
