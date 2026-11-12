// Proxy del purgador con IA: valida el pedido y lo reenvia a n8n.
// Nunca expone la URL ni la clave de n8n, ni devuelve el input en errores.
import { createHmac } from 'node:crypto'
const MODOS = ['categorias', 'unidades', 'simplificar']
const LISTAS = ['categorias', 'existentes', 'unidades']
const MAX_ELEMENTOS = 300
const MAX_CHARS = 80
const MAX_ID = 64
const MAX_CUERPO = 65536
const TIMEOUT_MS = 55000

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

// Valida y limpia el body; deja solo los campos permitidos.
export function validarPedido(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false }
  if (!MODOS.includes(body.modo)) return { ok: false }
  const limpio = { modo: body.modo }
  for (const k of LISTAS) {
    const v = body[k] ?? []
    if (!Array.isArray(v) || v.length > MAX_ELEMENTOS) return { ok: false }
    for (const e of v) {
      if (typeof e !== 'string' || e.length > MAX_CHARS) return { ok: false }
    }
    limpio[k] = v
  }
  for (const k of ['run_id', 'account_id']) {
    if (body[k] === undefined) continue
    if (typeof body[k] !== 'string' || body[k].length > MAX_ID) return { ok: false }
    limpio[k] = body[k]
  }
  return { ok: true, limpio }
}

// IP del cliente segun Vercel (x-real-ip / primera de x-forwarded-for; en Vercel el cliente
// no puede falsearlas). Solo sale de aca como HMAC con N8N_API_KEY: la IP cruda nunca se
// reenvia ni se registra. Sin IP → null (n8n solo aplica el tope global).
export function hashIp(headers, key) {
  const real = (headers.get('x-real-ip') || '').trim()
  const ip = real || (headers.get('x-forwarded-for') || '').split(',')[0].trim()
  if (!ip || !key) return null
  return createHmac('sha256', key).update(ip).digest('hex')
}

export async function POST(request) {
  // Fail closed: en Vercel solo production y preview. El env de app_settings/analytics sale
  // del servidor: production -> prod; preview y local -> sandbox. En produccion la IA queda
  // apagada hasta que exista inventario_ia_activa='true' con env prod (n8n lo exige).
  const vercelEnv = process.env.VERCEL_ENV
  if (process.env.VERCEL === '1' && vercelEnv !== 'preview' && vercelEnv !== 'production') return json({ error: 'Not found' }, 404)
  const env = vercelEnv === 'production' ? 'prod' : 'sandbox'

  const url = process.env.N8N_PURGA_URL
  const key = process.env.N8N_API_KEY
  if (!url || !key) return json({ error: 'Not configured' }, 500)

  const declarado = Number(request.headers.get('content-length'))
  if (declarado > MAX_CUERPO) return json({ error: 'Bad request' }, 400)

  let body
  try {
    // content-length puede faltar o mentir: se verifica sobre el texto real
    const texto = await request.text()
    if (Buffer.byteLength(texto, 'utf8') > MAX_CUERPO) return json({ error: 'Bad request' }, 400)
    body = JSON.parse(texto)
  } catch {
    return json({ error: 'Bad request' }, 400)
  }

  const v = validarPedido(body)
  if (!v.ok) return json({ error: 'Bad request' }, 400)

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      // Todas las previews usan env sandbox: n8n lee inventario_ia_activa de sandbox (con prod
      // de base), asi que conviene mantener una fila sandbox explicita para no heredar la de prod.
      // ip_hash va DESPUES de validar: validarPedido descarta cualquier ip_hash del cliente.
      body: JSON.stringify({ ...v.limpio, env, ip_hash: hashIp(request.headers, key) }),
      signal: request.signal
        ? AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)])
        : AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!upstream.ok) return json({ error: 'Upstream error' }, 502)
    const data = await upstream.json()
    // Solo la forma conocida; nada mas del upstream llega al cliente
    if (data && data.desactivado === true) return json({ desactivado: true })
    return json({ resultado: data?.resultado, cache: data?.cache === true })
  } catch {
    return json({ error: 'Upstream error' }, 502)
  }
}
