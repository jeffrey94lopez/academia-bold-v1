import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeReloadAction, isNearBottom } from '../js/reload-policy.js'

test('misma versión → none', () => {
  assert.equal(computeReloadAction({ currentVersion: 'abc', newVersion: 'abc', busy: false }), 'none')
})

test('sin versión conocida o sin versión nueva → none (poll deshabilitado/fallido)', () => {
  assert.equal(computeReloadAction({ currentVersion: null, newVersion: 'abc', busy: false }), 'none')
  assert.equal(computeReloadAction({ currentVersion: 'abc', newVersion: null, busy: false }), 'none')
})

test('versión nueva y bot libre → reload', () => {
  assert.equal(computeReloadAction({ currentVersion: 'abc', newVersion: 'def', busy: false }), 'reload')
})

test('versión nueva pero bot ocupado → defer', () => {
  assert.equal(computeReloadAction({ currentVersion: 'abc', newVersion: 'def', busy: true }), 'defer')
})

test('isNearBottom con tolerancia por defecto (40px)', () => {
  assert.equal(isNearBottom({ scrollHeight: 1000, scrollTop: 900, clientHeight: 100 }), true)   // exacto al fondo
  assert.equal(isNearBottom({ scrollHeight: 1000, scrollTop: 865, clientHeight: 100 }), true)   // a 35px
  assert.equal(isNearBottom({ scrollHeight: 1000, scrollTop: 800, clientHeight: 100 }), false)  // a 100px
})
