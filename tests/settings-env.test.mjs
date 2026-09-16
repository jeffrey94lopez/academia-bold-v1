import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveEnv, mergeSettings, APP_ENV } from '../js/env.js'

// ── resolveEnv ────────────────────────────────────────────────────────────

test('resolveEnv: el dominio de producción es prod', () => {
  assert.equal(resolveEnv('academia.localizadoc.com'), 'prod')
})

test('resolveEnv: la preview de Vercel del sandbox es sandbox', () => {
  assert.equal(
    resolveEnv('academia-bold-v1-git-sandbox-jeffreymartinezhn-projects.vercel.app'),
    'sandbox')
})

test('resolveEnv: localhost es sandbox', () => {
  assert.equal(resolveEnv('localhost'), 'sandbox')
})

// El lado inocuo del allowlist: lo desconocido NUNCA escribe en producción.
// Cubre también el import en Node, donde no hay `location` y el hostname es ''.
test('resolveEnv: un host desconocido cae en sandbox, no en prod', () => {
  assert.equal(resolveEnv(''), 'sandbox')
  assert.equal(resolveEnv('academia.localizadoc.com.evil.test'), 'sandbox')
  assert.equal(resolveEnv('staging.academia.localizadoc.com'), 'sandbox')
})

test('APP_ENV: importado sin DOM resuelve a sandbox', () => {
  assert.equal(APP_ENV, 'sandbox')
})

// ── mergeSettings ─────────────────────────────────────────────────────────

const filas = [
  { key: 'bot_enabled',   value: 'true',  env: 'prod' },
  { key: 'curso_enabled', value: 'false', env: 'prod' },
  { key: 'curso_enabled', value: 'true',  env: 'sandbox' },
]

test('mergeSettings: el sandbox hereda las claves que no tocó', () => {
  assert.equal(mergeSettings(filas, 'sandbox').bot_enabled, 'true')
})

test('mergeSettings: la fila del sandbox pisa la de prod', () => {
  assert.equal(mergeSettings(filas, 'sandbox').curso_enabled, 'true')
})

// El caso que motivó todo esto: un switch movido en el sandbox no puede
// cambiar lo que ve el portal real, ni siquiera si la fila llega en el mismo
// payload (realtime reparte a todos los suscriptores).
test('mergeSettings: en prod la fila del sandbox se ignora', () => {
  const m = mergeSettings(filas, 'prod')
  assert.equal(m.curso_enabled, 'false')
  assert.equal(m.bot_enabled, 'true')
})

test('mergeSettings: el orden de las filas no cambia el resultado', () => {
  const alreves = [...filas].reverse()
  assert.deepEqual(mergeSettings(alreves, 'sandbox'), mergeSettings(filas, 'sandbox'))
  assert.deepEqual(mergeSettings(alreves, 'prod'),    mergeSettings(filas, 'prod'))
})

test('mergeSettings: sin filas devuelve mapa vacío', () => {
  assert.deepEqual(mergeSettings([], 'sandbox'), {})
  assert.deepEqual(mergeSettings(null, 'sandbox'), {})
  assert.deepEqual(mergeSettings(undefined, 'prod'), {})
})
