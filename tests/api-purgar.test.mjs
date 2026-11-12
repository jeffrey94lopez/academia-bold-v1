import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { POST, validarPedido, hashIp } from '../api/purgar.js'

const ENV_ORIG = { ...process.env }
const FETCH_ORIG = globalThis.fetch
let llamadas

beforeEach(() => {
  process.env.N8N_PURGA_URL = 'https://n8n.ejemplo.test/webhook/secreto'
  process.env.N8N_API_KEY = 'clave-secreta'
  delete process.env.VERCEL_ENV
  llamadas = []
  globalThis.fetch = async (url, opts) => {
    llamadas.push({ url, opts })
    return new Response(JSON.stringify({ resultado: { ok: 1 }, cache: false }), { status: 200 })
  }
})
afterEach(() => {
  process.env = { ...ENV_ORIG }
  globalThis.fetch = FETCH_ORIG
})

const pedir = (body, headers = {}) =>
  POST(new Request('https://x.test/api/purgar', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))
const base = { modo: 'categorias', categorias: ['a', 'b'], run_id: 'r1' }

test('produccion responde 404 sin llamar a n8n', async () => {
  process.env.VERCEL_ENV = 'production'
  const r = await pedir(base)
  assert.equal(r.status, 404)
  assert.equal(llamadas.length, 0)
})

test('sin configuracion responde 500', async () => {
  delete process.env.N8N_PURGA_URL
  const r = await pedir(base)
  assert.equal(r.status, 500)
})

test('reenvia solo campos permitidos y env lo pone el servidor', async () => {
  process.env.VERCEL_ENV = 'preview'
  const r = await pedir({ ...base, x: 'extra', env: 'prod' })
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), { resultado: { ok: 1 }, cache: false })
  const enviado = JSON.parse(llamadas[0].opts.body)
  assert.equal(enviado.x, undefined)
  assert.equal(enviado.env, 'sandbox')
  assert.deepEqual(enviado.existentes, [])
  assert.equal(llamadas[0].url, process.env.N8N_PURGA_URL)
  assert.equal(llamadas[0].opts.headers['x-api-key'], 'clave-secreta')
})

test('env local tambien es sandbox', async () => {
  await pedir(base)
  assert.equal(JSON.parse(llamadas[0].opts.body).env, 'sandbox')
})

test('301 elementos, elemento de 81 chars y modo desconocido -> 400', async () => {
  assert.equal((await pedir({ ...base, categorias: Array(301).fill('a') })).status, 400)
  assert.equal((await pedir({ ...base, categorias: ['a'.repeat(81)] })).status, 400)
  assert.equal((await pedir({ ...base, modo: 'otro' })).status, 400)
  assert.equal(llamadas.length, 0)
})

test('JSON invalido -> 400', async () => {
  assert.equal((await pedir('{no es json')).status, 400)
})

test('content-length > 64 KB -> 400', async () => {
  assert.equal((await pedir(base, { 'content-length': '70000' })).status, 400)
})

test('cuerpo > 64 KB sin content-length veraz -> 400', async () => {
  const grande = JSON.stringify({ ...base, relleno: 'a'.repeat(70000) })
  assert.equal((await pedir(grande, { 'content-length': '10' })).status, 400)
  assert.equal(llamadas.length, 0)
})

test('upstream lanza, no ok o no JSON -> 502 sin filtrar datos', async () => {
  const casos = [
    async () => { throw new Error('https://n8n.ejemplo.test/webhook/secreto') },
    async () => new Response('{}', { status: 500 }),
    async () => new Response('<html>', { status: 200 }),
  ]
  for (const f of casos) {
    globalThis.fetch = f
    const r = await pedir(base)
    assert.equal(r.status, 502)
    const t = await r.text()
    assert.deepEqual(JSON.parse(t), { error: 'Upstream error' })
    assert.ok(!t.includes('n8n'))
  }
})

test('validarPedido: tipos y limites', () => {
  assert.equal(validarPedido(null).ok, false)
  assert.equal(validarPedido([]).ok, false)
  assert.equal(validarPedido({ modo: 'unidades', unidades: [1] }).ok, false)
  assert.equal(validarPedido({ modo: 'unidades', unidades: 'a' }).ok, false)
  assert.equal(validarPedido({ modo: 'unidades', run_id: 5 }).ok, false)
  assert.equal(validarPedido({ modo: 'unidades', account_id: 'a'.repeat(65) }).ok, false)
  const v = validarPedido({ modo: 'simplificar', account_id: 'acc' })
  assert.equal(v.ok, true)
  assert.deepEqual(v.limpio, { modo: 'simplificar', categorias: [], existentes: [], unidades: [], account_id: 'acc' })
})

test('produccion 404 aunque falten las variables de n8n', async () => {
  process.env.VERCEL_ENV = 'production'
  delete process.env.N8N_PURGA_URL
  delete process.env.N8N_API_KEY
  assert.equal((await pedir(base)).status, 404)
})

test('en Vercel sin VERCEL_ENV -> 404; con preview pasa', async () => {
  process.env.VERCEL = '1'
  assert.equal((await pedir(base)).status, 404)
  process.env.VERCEL_ENV = 'preview'
  assert.equal((await pedir(base)).status, 200)
})

test('limite de cuerpo en bytes (multibyte)', async () => {
  const grande = JSON.stringify({ ...base, relleno: 'ñ'.repeat(40000) })
  assert.ok(grande.length < 65536)
  assert.equal((await pedir(grande)).status, 400)
})

test('solo devuelve la forma conocida del upstream', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ resultado: { a: 1 }, cache: true, debug: 'x' }))
  assert.deepEqual(await (await pedir(base)).json(), { resultado: { a: 1 }, cache: true })
  globalThis.fetch = async () => new Response(JSON.stringify({ desactivado: true, debug: 'x' }))
  assert.deepEqual(await (await pedir(base)).json(), { desactivado: true })
})

const hmac = (ip, k = 'clave-secreta') => createHmac('sha256', k).update(ip).digest('hex')

test('ip_hash: HMAC de x-real-ip con N8N_API_KEY; nunca la IP cruda', async () => {
  await pedir(base, { 'x-real-ip': '203.0.113.7' })
  const cuerpo = llamadas[0].opts.body
  assert.equal(JSON.parse(cuerpo).ip_hash, hmac('203.0.113.7'))
  assert.match(JSON.parse(cuerpo).ip_hash, /^[0-9a-f]{64}$/)
  assert.ok(!cuerpo.includes('203.0.113.7'))
  await pedir(base, { 'x-real-ip': '203.0.113.7' })
  assert.equal(JSON.parse(llamadas[1].opts.body).ip_hash, JSON.parse(cuerpo).ip_hash) // determinista
  await pedir(base, { 'x-real-ip': '203.0.113.8' })
  assert.notEqual(JSON.parse(llamadas[2].opts.body).ip_hash, JSON.parse(cuerpo).ip_hash) // distinta por ip
})

test('ip_hash: primera de x-forwarded-for si no hay x-real-ip; null sin headers', async () => {
  await pedir(base, { 'x-forwarded-for': ' 198.51.100.1 , 10.0.0.1' })
  assert.equal(JSON.parse(llamadas[0].opts.body).ip_hash, hmac('198.51.100.1'))
  await pedir(base)
  const enviado = JSON.parse(llamadas[1].opts.body)
  assert.ok('ip_hash' in enviado)
  assert.equal(enviado.ip_hash, null)
  assert.equal(hashIp(new Headers({ 'x-real-ip': '1.2.3.4' }), 'k'), hmac('1.2.3.4', 'k'))
  assert.equal(hashIp(new Headers({ 'x-real-ip': '1.2.3.4' }), ''), null)
})

test('ip_hash del cliente se ignora: lo pone siempre el servidor', async () => {
  const falso = 'f'.repeat(64)
  assert.equal(validarPedido({ ...base, ip_hash: falso }).limpio.ip_hash, undefined)
  await pedir({ ...base, ip_hash: falso })
  assert.equal(JSON.parse(llamadas[0].opts.body).ip_hash, null)
  await pedir({ ...base, ip_hash: falso }, { 'x-real-ip': '203.0.113.9' })
  assert.equal(JSON.parse(llamadas[1].opts.body).ip_hash, hmac('203.0.113.9'))
})
