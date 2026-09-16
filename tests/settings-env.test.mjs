import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveAppEnv, mergeSettings, APP_ENV } from '../js/env.js'

// ── resolveAppEnv ─────────────────────────────────────────────────────────
// Manda la señal del build (BUILD_ENV, que escribe el buildCommand de
// vercel.json). El hostname es solo la segunda red para el caso de que ese
// paso no haya corrido.

test('resolveAppEnv: el build de produccion manda, venga del hostname que venga', () => {
  // Cada deploy de produccion estrena una URL …-<hash>-….vercel.app que nadie
  // puede enumerar. Este es el caso que el allowlist de hostnames no cubria.
  assert.equal(resolveAppEnv('prod', 'academia-bold-v1-9f2ab3c-jeffreymartinezhn-projects.vercel.app'), 'prod')
  assert.equal(resolveAppEnv('prod', 'academia.localizadoc.com'), 'prod')
  assert.equal(resolveAppEnv('prod', 'localhost'), 'prod')
})

test('resolveAppEnv: una preview usa el nombre de su rama', () => {
  assert.equal(
    resolveAppEnv('sandbox', 'academia-bold-v1-git-sandbox-jeffreymartinezhn-projects.vercel.app'),
    'sandbox')
  assert.equal(resolveAppEnv('feature/v2', 'academia-bold-v1-git-feature-v2.vercel.app'), 'feature/v2')
})

// La red de seguridad: si el paso del build no corrio, build-env.js queda en su
// placeholder 'sandbox' — y produccion NO puede terminar leyendo los toggles
// del sandbox solo por eso. Los tres hostnames sirven master.
test('resolveAppEnv: sin señal del build, los hostnames de produccion fuerzan prod', () => {
  assert.equal(resolveAppEnv('sandbox', 'academia.localizadoc.com'), 'prod')
  assert.equal(resolveAppEnv('sandbox', 'academia-bold-v1.vercel.app'), 'prod')
  assert.equal(resolveAppEnv('sandbox', 'academia-bold-v1-git-master-jeffreymartinezhn-projects.vercel.app'), 'prod')
})

test('resolveAppEnv: localhost y lo desconocido caen en sandbox', () => {
  assert.equal(resolveAppEnv('sandbox', 'localhost'), 'sandbox')
  assert.equal(resolveAppEnv('sandbox', ''), 'sandbox')
  assert.equal(resolveAppEnv('sandbox', 'academia.localizadoc.com.evil.test'), 'sandbox')
  assert.equal(resolveAppEnv('', ''), 'sandbox')          // buildEnv vacio
  assert.equal(resolveAppEnv(undefined, ''), 'sandbox')
})

test('APP_ENV: importado sin DOM y con el placeholder del repo resuelve a sandbox', () => {
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
