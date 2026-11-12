// Proxy de la indexacion de lecciones (y de FAQ/glosario) hacia n8n.
// Antes el navegador llamaba directo al webhook embed-lesson con la clave de n8n
// en el bundle: cualquiera podia leerla y esa clave protege TODOS los webhooks.
// Ahora la clave vive solo aca (N8N_API_KEY) y el pedido exige una sesion valida
// de Supabase. Nunca expone la URL ni la clave de n8n, ni devuelve el cuerpo del
// upstream.
//
// Autorizacion: el registro esta deshabilitado y todo usuario autenticado es
// admin por diseno, asi que una sesion valida alcanza.

// Valores PUBLICOS (los mismos de js/supabase.js, que ya viajan al navegador).
// Se duplican porque js/supabase.js importa el SDK desde un CDN https://, que el
// runtime Node de Vercel no puede cargar. Si cambian alla, cambiarlos aca.
const SUPABASE_URL = 'https://tczcngfhuendmldafbrc.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjemNuZ2ZodWVuZG1sZGFmYnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzQ0OTIsImV4cCI6MjA5NTMxMDQ5Mn0.YuKwq-ooL9noU6FXDDPzJbaj-h7rhZli1s4Zji-uCXQ'

const RUTA_UPSTREAM = '/webhook/embed-lesson'
const ID_VALIDO = /^(faq_|glosario_)?[A-Za-z0-9-]{1,64}$/
const MAX_TEXTO = 100000
const MAX_CUERPO = 200 * 1024
const MAX_TOKEN = 4096
const AUTH_TIMEOUT_MS = 5000
const TIMEOUT_MS = 30000

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

// Valida el body; deja solo { lessonId, text }.
export function validarPedido(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false }
  const { lessonId, text } = body
  if (typeof lessonId !== 'string' || !ID_VALIDO.test(lessonId)) return { ok: false }
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXTO) return { ok: false }
  return { ok: true, limpio: { lessonId, text } }
}

// Extrae el access token de "Authorization: Bearer <token>" (o null).
export function tokenBearer(headers) {
  const m = /^Bearer\s+(\S+)$/i.exec((headers.get('authorization') || '').trim())
  if (!m || m[1].length > MAX_TOKEN) return null
  return m[1]
}

// Verifica el token contra Supabase Auth. Cualquier cosa distinta de 200 con id → false.
async function sesionValida(token) {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    })
    if (r.status !== 200) return false
    const u = await r.json()
    // Un usuario anonimo de Supabase (si algun dia se habilita) no es admin.
    return !!(u && typeof u.id === 'string' && u.id && u.is_anonymous !== true)
  } catch {
    return false
  }
}

export async function POST(request) {
  // Vercel ya responde 405 a metodos sin handler exportado; esto es defensa extra.
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const base = process.env.N8N_WEBHOOK_URL
  const key = process.env.N8N_API_KEY
  let url
  try {
    // Mismo host de n8n que el webhook del chat: no hace falta otra variable.
    url = base && key ? new URL(RUTA_UPSTREAM, base).href : null
  } catch {
    url = null
  }
  if (!url) return json({ error: 'Not configured' }, 500)

  const token = tokenBearer(request.headers)
  if (!token || !(await sesionValida(token))) return json({ error: 'Unauthorized' }, 401)

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
      body: JSON.stringify(v.limpio),
      signal: request.signal
        ? AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)])
        : AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!upstream.ok) return json({ error: 'Upstream error' }, 502)
    return json({ ok: true })
  } catch {
    return json({ error: 'Upstream error' }, 502)
  }
}
