import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pedirIA, iaActiva } from '../js/inv-ia-cliente.js'

const base = { modo: 'categorias', categorias: ['Cerveza', 'Cervezas'], existentes: [], unidades: [] }
const respOk = { resultado: { grupos: [{ nombre: 'Cerveza', miembros: ['Cerveza', 'Cervezas'] }] }, cache: false }
const fakeOk = (json, status = 200) => async () => ({ status, ok: status === 200, json: async () => json })
// fetch falso que nunca resuelve pero respeta el AbortSignal.
const colgado = (init) => new Promise((_, rej) => {
  init.signal.addEventListener('abort', () => rej(Object.assign(new Error('abortado'), { name: 'AbortError' })))
})

test('ok: devuelve el mapeo validado', async () => {
  const r = await pedirIA(base, { fetch: fakeOk(respOk), activa: true })
  assert.equal(r.ok, true)
  assert.deepEqual({ ...r.mapeo }, { Cerveza: 'Cerveza', Cervezas: 'Cerveza' }) // mapeo tiene prototipo nulo
})

test('envía POST /api/purgar con run_id y account_id', async () => {
  let url, init
  await pedirIA({ ...base, runId: 'r1', accountId: 'a1' }, {
    fetch: async (u, i) => { url = u; init = i; return { status: 200, json: async () => respOk } }, activa: true,
  })
  assert.equal(url, '/api/purgar')
  assert.equal(init.method, 'POST')
  const body = JSON.parse(init.body)
  assert.equal(body.run_id, 'r1')
  assert.equal(body.account_id, 'a1')
  assert.equal(body.modo, 'categorias')
})

test('accountId undefined: el body no trae account_id', async () => {
  let init
  await pedirIA({ ...base, runId: 'r1' }, { fetch: async (u, i) => { init = i; return { status: 200, json: async () => respOk } }, activa: true })
  assert.equal('account_id' in JSON.parse(init.body), false)
})

test('status 500 → ia_fallo', async () => {
  assert.deepEqual(await pedirIA(base, { fetch: fakeOk({}, 500), activa: true }), { ok: false, codigo: 'ia_fallo' })
})

test('fetch que lanza → ia_fallo', async () => {
  const r = await pedirIA(base, { fetch: async () => { throw new Error('red') }, activa: true })
  assert.deepEqual(r, { ok: false, codigo: 'ia_fallo' })
})

test('json ilegible → ia_fallo', async () => {
  const r = await pedirIA(base, { fetch: async () => ({ status: 200, json: async () => { throw new Error('x') } }), activa: true })
  assert.deepEqual(r, { ok: false, codigo: 'ia_fallo' })
})

test('desactivado:true del servidor → ia_desactivada', async () => {
  const r = await pedirIA(base, { fetch: fakeOk({ desactivado: true }), activa: true })
  assert.deepEqual(r, { ok: false, codigo: 'ia_desactivada' })
})

test('fetch colgado con timeoutMs → ia_timeout', async () => {
  const r = await pedirIA(base, { fetch: (u, i) => colgado(i), timeoutMs: 20, activa: true })
  assert.deepEqual(r, { ok: false, codigo: 'ia_timeout' })
})

test('301 categorías → ia_lista_grande sin red', async () => {
  let llamado = false
  const categorias = Array.from({ length: 301 }, (_, i) => `Cat ${i}`)
  const r = await pedirIA({ ...base, categorias }, { fetch: async () => { llamado = true }, activa: true })
  assert.deepEqual(r, { ok: false, codigo: 'ia_lista_grande' })
  assert.equal(llamado, false)
})

test('lista principal vacía → ia_sin_datos sin red', async () => {
  let llamado = false
  const r = await pedirIA({ ...base, categorias: [] }, { fetch: async () => { llamado = true }, activa: true })
  assert.deepEqual(r, { ok: false, codigo: 'ia_sin_datos' })
  assert.equal(llamado, false)
})

test('respuesta inválida → ia_respuesta_invalida', async () => {
  const r = await pedirIA(base, { fetch: fakeOk({ resultado: { grupos: [] } }), activa: true })
  assert.deepEqual(r, { ok: false, codigo: 'ia_respuesta_invalida' })
})

test('activa:false → ia_desactivada sin red', async () => {
  let llamado = false
  const r = await pedirIA(base, { fetch: async () => { llamado = true }, activa: false })
  assert.deepEqual(r, { ok: false, codigo: 'ia_desactivada' })
  assert.equal(llamado, false)
})

test('iaActiva: consulta el ajuste (tambien en prod; sin fila prod queda apagada)', async () => {
  let consultado = false
  const r = await iaActiva({ cargar: async () => { consultado = true; return {} } })
  assert.equal(r, false)
  assert.equal(consultado, true)
})

test('iaActiva: solo la cadena "true" activa; ausente o excepción es false', async () => {
  const con = (v) => iaActiva({ cargar: async () => v })
  assert.equal(await con({ inventario_ia_activa: 'true' }), true)
  assert.equal(await con({ inventario_ia_activa: 'false' }), false)
  assert.equal(await con({}), false)
  assert.equal(await iaActiva({ cargar: async () => { throw new Error('x') } }), false)
})
