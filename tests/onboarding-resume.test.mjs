import test from 'node:test'
import assert from 'node:assert/strict'
import { modeloTarjeta } from '../js/onboarding-resume.js'
import { crearEstadoInicial } from '../js/onboarding-state.js'

test('modeloTarjeta', () => {
  assert.deepEqual(modeloTarjeta(null), { tipo: 'empezar' })
  assert.deepEqual(modeloTarjeta({ ...crearEstadoInicial('r'), step: 'gasto' }), { tipo: 'continuar', paso: 4, total: 6 })
  assert.deepEqual(modeloTarjeta({ ...crearEstadoInicial('r'), step: 'cierre', completed: true }), { tipo: 'repetir' })
})
