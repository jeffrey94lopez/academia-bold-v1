import { test } from 'node:test'
import assert from 'node:assert/strict'

// Cada test importa una instancia fresca del módulo (query-string distinta)
// porque storage.js detecta localStorage al cargar y Node cachea por URL.

function throwingStorage() {
  const boom = () => { throw new DOMException('blocked', 'SecurityError') }
  return { getItem: boom, setItem: boom, removeItem: boom }
}

function workingStorage() {
  const m = new Map()
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k),
    _map: m,
  }
}

test('sin localStorage global: funciona con fallback en memoria', async () => {
  globalThis.localStorage = undefined
  const s = await import('../js/storage.js?caso=1')
  assert.equal(s.storageGet('x'), null)
  s.storageSet('x', 'hola')
  assert.equal(s.storageGet('x'), 'hola')
  s.storageRemove('x')
  assert.equal(s.storageGet('x'), null)
})

test('localStorage lanza SecurityError: nunca propaga, usa memoria', async () => {
  globalThis.localStorage = throwingStorage()
  const s = await import('../js/storage.js?caso=2')
  assert.doesNotThrow(() => s.storageSet('k', 'v'))
  assert.equal(s.storageGet('k'), 'v')
  assert.doesNotThrow(() => s.storageRemove('k'))
  assert.equal(s.storageGet('k'), null)
})

test('localStorage funcional: lee y escribe en localStorage real', async () => {
  const fake = workingStorage()
  globalThis.localStorage = fake
  const s = await import('../js/storage.js?caso=3')
  s.storageSet('tema', 'dark')
  assert.equal(fake._map.get('tema'), 'dark')
  assert.equal(s.storageGet('tema'), 'dark')
  s.storageRemove('tema')
  assert.equal(fake._map.has('tema'), false)
  assert.equal(s.storageGet('tema'), null)
})

test('setItem falla en runtime (quota): cae a memoria y la lectura es coherente', async () => {
  const fake = workingStorage()
  globalThis.localStorage = fake
  const s = await import('../js/storage.js?caso=4')
  fake.setItem = () => { throw new DOMException('quota', 'QuotaExceededError') }
  assert.doesNotThrow(() => s.storageSet('h', '[1,2]'))
  assert.equal(s.storageGet('h'), '[1,2]')
})
