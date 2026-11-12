import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { POST, validarPedido, tokenBearer } from '../api/embed.js'

const ENV_ORIG = { ...process.env }
const FETCH_ORIG = globalThis.fetch
const AUTH = 'https://tczcngfhuendmldafbrc.supabase.co/auth/v1/user'
const N8N_BASE = 'https://n8n.ejemplo.test/webhook/chat-secreto'
const N8N_EMBED = 'https://n8n.ejemplo.test/webhook/embed-lesson'
const UUID = '3f2b8c1e-9a4d-4e2b-8f1a-0c7d6e5b4a39'
let llamadas, authStatus, upstream

beforeEach(() => {
  process.env.N8N_WEBHOOK_URL = N8N_BASE
  process.env.N8N_API_KEY = 'clave-secreta'
  delete process.env.VERCEL_ENV
  llamadas = []
  authStatus = 200
  upstream = async () => new Response('{"interno":"no debe salir"}', { status: 200 })
  globalThis.fetch = async (url, opts) => {
    llamadas.push({ url, opts })
    if (url === AUTH) {
      return new Response(JSON.stringify(authStatus === 200 ? { id: 'u1' } : { msg: 'bad' }), { status: authStatus })
    }
    return upstream(url, opts)
  }
})
afterEach(() => {
  process.env = { ...ENV_ORIG }
  globalThis.fetch = FETCH_ORIG
})

const pedir = (body, headers = { authorization: 'Bearer tok-valido' }, method = 'POST') =>
  POST(new Request('https://x.test/api/embed', {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: method === 'GET' ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  }))
const base = { lessonId: UUID, text: 'Titulo\nContenido' }
const aN8n = () => llamadas.filter(l => l.url !== AUTH)

test('metodo distinto de POST -> 405', async () => {
  const r = await pedir(undefined, undefined, 'GET')
  assert.equal(r.status, 405)
  assert.equal(llamadas.length, 0)
})

test('sin configuracion -> 500 sin llamar a nadie', async () => {
  delete process.env.N8N_API_KEY
  assert.equal((await pedir(base)).status, 500)
  process.env.N8N_API_KEY = 'clave-secreta'
  delete process.env.N8N_WEBHOOK_URL
  assert.equal((await pedir(base)).status, 500)
  process.env.N8N_WEBHOOK_URL = 'no es url'
  assert.equal((await pedir(base)).status, 500)
  assert.equal(llamadas.length, 0)
})

test('sin bearer o bearer mal formado -> 401 sin llamar a n8n', async () => {
  for (const h of [{}, { authorization: 'tok' }, { authorization: 'Bearer ' }, { authorization: 'Basic abc' }]) {
    const r = await pedir(base, h)
    assert.equal(r.status, 401)
  }
  assert.equal(llamadas.length, 0)
})

test('token invalido (auth no-200) -> 401 sin llamar a n8n', async () => {
  for (const s of [401, 403, 500]) {
    authStatus = s
    assert.equal((await pedir(base)).status, 401)
  }
  assert.equal(aN8n().length, 0)
})

test('auth 200 sin id o auth caida -> 401', async () => {
  globalThis.fetch = async (url) => {
    llamadas.push({ url })
    return new Response('{}', { status: 200 })
  }
  assert.equal((await pedir(base)).status, 401)
  globalThis.fetch = async () => { throw new Error('timeout') }
  assert.equal((await pedir(base)).status, 401)
})

test('verifica el token contra Supabase con apikey y bearer', async () => {
  await pedir(base)
  const a = llamadas[0]
  assert.equal(a.url, AUTH)
  assert.equal(a.opts.headers.Authorization, 'Bearer tok-valido')
  assert.ok(a.opts.headers.apikey)
  assert.ok(a.opts.signal)
})

test('lessonId o text invalidos -> 400 sin llamar a n8n', async () => {
  const malos = [
    { ...base, lessonId: '' },
    { ...base, lessonId: 'a/b' },
    { ...base, lessonId: '../x' },
    { ...base, lessonId: 'x'.repeat(65) },
    { ...base, lessonId: 'otro_123' },
    { ...base, lessonId: 5 },
    { ...base, text: '' },
    { ...base, text: '   ' },
    { ...base, text: 7 },
    { ...base, text: 'a'.repeat(100001) },
    { lessonId: UUID },
    [],
    null,
  ]
  for (const b of malos) assert.equal((await pedir(b)).status, 400, JSON.stringify(b)?.slice(0, 60))
  assert.equal((await pedir('{no es json')).status, 400)
  assert.equal(aN8n().length, 0)
})

test('cuerpo > 200 KB -> 400 (content-length declarado o real)', async () => {
  assert.equal((await pedir(base, { authorization: 'Bearer t', 'content-length': '300000' })).status, 400)
  const grande = JSON.stringify({ ...base, relleno: 'ñ'.repeat(110000) })
  assert.ok(grande.length < 200 * 1024)
  assert.equal((await pedir(grande)).status, 400)
  assert.equal(aN8n().length, 0)
})

test('reenvia solo { lessonId, text } con x-api-key a la URL derivada', async () => {
  const r = await pedir({ ...base, extra: 'x', env: 'prod' })
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), { ok: true })
  const [n] = aN8n()
  assert.equal(n.url, N8N_EMBED)
  assert.equal(n.opts.method, 'POST')
  assert.equal(n.opts.headers['x-api-key'], 'clave-secreta')
  assert.deepEqual(JSON.parse(n.opts.body), base)
  assert.ok(n.opts.signal)
})

test('ids de faq y glosario se aceptan', async () => {
  for (const id of ['faq_' + UUID, 'glosario_' + UUID, 'faq_12', 'glosario_7']) {
    assert.equal((await pedir({ ...base, lessonId: id })).status, 200)
  }
})

test('funciona tambien en produccion', async () => {
  process.env.VERCEL = '1'
  process.env.VERCEL_ENV = 'production'
  assert.equal((await pedir(base)).status, 200)
})

test('upstream no ok o lanza -> 502 sin filtrar URL ni clave', async () => {
  const casos = [
    async () => new Response(N8N_EMBED + ' clave-secreta', { status: 500 }),
    async () => { throw new Error(N8N_EMBED + ' clave-secreta') },
  ]
  for (const f of casos) {
    upstream = f
    const r = await pedir(base)
    assert.equal(r.status, 502)
    const t = await r.text()
    assert.deepEqual(JSON.parse(t), { error: 'Upstream error' })
    assert.ok(!t.includes('n8n') && !t.includes('clave-secreta'))
  }
})

test('ninguna respuesta incluye la URL ni la clave de n8n', async () => {
  const respuestas = [
    await pedir(base),
    await pedir({ ...base, lessonId: '' }),
    await pedir(base, {}),
  ]
  for (const r of respuestas) {
    const t = await r.text()
    assert.ok(!t.includes('n8n') && !t.includes('clave-secreta') && !t.includes('interno'), t)
  }
})

test('validarPedido y tokenBearer', () => {
  assert.equal(validarPedido({ lessonId: UUID, text: 'a'.repeat(100000) }).ok, true)
  assert.deepEqual(validarPedido({ ...base, x: 1 }).limpio, base)
  assert.equal(tokenBearer(new Headers({ authorization: 'Bearer abc' })), 'abc')
  assert.equal(tokenBearer(new Headers({ authorization: 'bearer abc' })), 'abc')
  assert.equal(tokenBearer(new Headers({ authorization: 'Bearer a b' })), null)
  assert.equal(tokenBearer(new Headers({ authorization: 'Bearer ' + 'a'.repeat(4097) })), null)
  assert.equal(tokenBearer(new Headers()), null)
})
