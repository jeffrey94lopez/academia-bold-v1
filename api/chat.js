export const config = { runtime: 'edge' }

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const N8N_URL = process.env.N8N_WEBHOOK_URL
  const N8N_KEY = process.env.N8N_API_KEY
  if (!N8N_URL || !N8N_KEY) return new Response('Not configured', { status: 500 })

  try {
    const body = await req.json()
    const upstream = await fetch(N8N_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': N8N_KEY },
      body: JSON.stringify(body),
    })
    const data = await upstream.json()
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Upstream error' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
