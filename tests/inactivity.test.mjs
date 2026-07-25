import test from 'node:test'
import assert from 'node:assert/strict'
import { inactivitySettings, isStaleConversation } from '../js/inactivity.js'

const MIN = 60000

test('lee los minutos configurados y los devuelve en ms', () => {
  const s = inactivitySettings([
    { key: 'inactividad_aviso_min', value: '3' },
    { key: 'inactividad_cierre_min', value: '45' },
  ])
  assert.equal(s.avisoMs, 3 * MIN)
  assert.equal(s.cierreMs, 45 * MIN)
})

test('claves ausentes caen a los defaults 5 y 30', () => {
  const s = inactivitySettings([])
  assert.equal(s.avisoMs, 5 * MIN)
  assert.equal(s.cierreMs, 30 * MIN)
})

test('entrada nula no lanza y da defaults', () => {
  let s
  assert.doesNotThrow(() => { s = inactivitySettings(null) })
  assert.equal(s.avisoMs, 5 * MIN)
  assert.equal(s.cierreMs, 30 * MIN)
})

test('valores inválidos caen al default en vez de reventar', () => {
  for (const bad of ['', '  ', 'treinta', '-5', '2.5', 'NaN']) {
    const s = inactivitySettings([{ key: 'inactividad_cierre_min', value: bad }])
    assert.equal(s.cierreMs, 30 * MIN, `"${bad}" debería caer al default`)
  }
})

test('aviso en 0 apaga el aviso', () => {
  const s = inactivitySettings([{ key: 'inactividad_aviso_min', value: '0' }])
  assert.equal(s.avisoMs, 0)
})

// El 0 en cierre es destructivo (cerraría toda conversación viva) y además
// apagaría el guardia del navegador: cae al default como en admin.js y el SQL.
test('cierre en 0 es inválido y cae al default de 30', () => {
  const s = inactivitySettings([{ key: 'inactividad_cierre_min', value: '0' }])
  assert.equal(s.cierreMs, 30 * MIN)
})

test('isStaleConversation: dentro del umbral es false', () => {
  const now = 1_000_000
  assert.equal(isStaleConversation(now - 10 * MIN, now, 30 * MIN), false)
})

test('isStaleConversation: pasado el umbral es true', () => {
  const now = 1_000_000
  assert.equal(isStaleConversation(now - 40 * MIN, now, 30 * MIN), true)
})

test('isStaleConversation: el borde exacto cuenta como vencida', () => {
  const now = 1_000_000
  assert.equal(isStaleConversation(now - 30 * MIN, now, 30 * MIN), true)
})

test('isStaleConversation: sin última actividad no lanza y es false', () => {
  assert.equal(isStaleConversation(0, 1_000_000, 30 * MIN), false)
  assert.equal(isStaleConversation(undefined, 1_000_000, 30 * MIN), false)
})
