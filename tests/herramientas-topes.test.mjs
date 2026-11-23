import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { armarVistaTopes, topesHtml } from '../js/herramientas-vista.js'
import { fetchHerramientasIATopes } from '../js/analytics-api.js'

const base = { usadas_24h: 100, tope_diario: 500, ip_max_24h: 6, tope_ip: 30, ia_activa: true }

test('armarVistaTopes: porcentajes enteros y números', () => {
  const v = armarVistaTopes(base)
  assert.equal(v.usadas, 100); assert.equal(v.topeDiario, 500)
  assert.equal(v.ipMax, 6); assert.equal(v.topeIp, 30)
  assert.equal(v.pctDiario, 20); assert.equal(v.pctIp, 20)
  assert.equal(v.nivelDiario, 'ok'); assert.equal(v.nivelIp, 'ok')
  assert.equal(v.iaActiva, true)
})

test('armarVistaTopes: el porcentaje se topa en 100', () => {
  const v = armarVistaTopes({ ...base, usadas_24h: 750, ip_max_24h: 90 })
  assert.equal(v.pctDiario, 100); assert.equal(v.pctIp, 100)
})

test('armarVistaTopes: tope en cero no divide por cero', () => {
  const v = armarVistaTopes({ ...base, tope_diario: 0, tope_ip: 0 })
  assert.equal(v.pctDiario, 0); assert.equal(v.pctIp, 0)
})

test('armarVistaTopes: niveles en 79, 80, 99, 100 y 150 por ciento', () => {
  const nivel = pct => armarVistaTopes({ ...base, usadas_24h: pct, tope_diario: 100 }).nivelDiario
  assert.equal(nivel(79), 'ok'); assert.equal(nivel(80), 'alerta')
  assert.equal(nivel(99), 'alerta'); assert.equal(nivel(100), 'agotado'); assert.equal(nivel(150), 'agotado')
  assert.equal(armarVistaTopes({ ...base, ip_max_24h: 24, tope_ip: 30 }).nivelIp, 'alerta')
  assert.equal(armarVistaTopes({ ...base, ip_max_24h: 30, tope_ip: 30 }).nivelIp, 'agotado')
})

test('armarVistaTopes: entrada nula o vacía da una vista vacía', () => {
  for (const d of [null, undefined, {}]) {
    const v = armarVistaTopes(d)
    assert.equal(v.usadas, 0); assert.equal(v.pctDiario, 0); assert.equal(v.pctIp, 0)
    assert.equal(v.nivelDiario, 'ok'); assert.equal(v.iaActiva, false)
  }
})

test('armarVistaTopes: textos numéricos se convierten y basura vale cero', () => {
  const v = armarVistaTopes({ usadas_24h: '250', tope_diario: '500', ip_max_24h: 'abc', tope_ip: '30', ia_activa: 'x' })
  assert.equal(v.usadas, 250); assert.equal(v.pctDiario, 50); assert.equal(v.ipMax, 0)
})

test('armarVistaTopes: iaActiva solo es true con true o el texto true', () => {
  assert.equal(armarVistaTopes({ ia_activa: true }).iaActiva, true)
  assert.equal(armarVistaTopes({ ia_activa: 'true' }).iaActiva, true)
  for (const x of [false, 'false', null, undefined, 1, 'si']) assert.equal(armarVistaTopes({ ia_activa: x }).iaActiva, false)
})

test('fetchHerramientasIATopes llama a la RPC con el entorno y falla con su nombre', async () => {
  let llamada
  const client = { rpc: async (n, p) => { llamada = { n, p }; return { data: base, error: null } } }
  const r = await fetchHerramientasIATopes('sandbox', client)
  assert.equal(llamada.n, 'analytics_herramientas_ia_topes')
  assert.deepEqual(llamada.p, { p_env: 'sandbox' })
  assert.equal(r.tope_diario, 500)
  await assert.rejects(fetchHerramientasIATopes('prod', { rpc: async () => ({ data: null, error: { message: 'x' } }) }), /analytics_herramientas_ia_topes/)
})

test('topesHtml: sin datos muestra el aviso y con tope alcanzado avisa que la IA está apagada', () => {
  assert.match(topesHtml(null), /Sin datos de topes todavía/)
  const h = topesHtml(armarVistaTopes({ ...base, usadas_24h: 500 }))
  assert.match(h, /Llamadas a Gemini hoy: 500 de 500/)
  assert.match(h, /IP más activa: 6 de 30/)
  assert.match(h, /Tope alcanzado: la IA está apagada hasta que se liberen llamadas de las últimas 24 h/)
  assert.match(h, /IA encendida/)
  assert.match(h, /Siempre las últimas 24 h, sin importar el período/)
  const soloIp = topesHtml(armarVistaTopes({ ...base, usadas_24h: 10, ip_max_24h: 30 }))
  assert.match(soloIp, /Una IP llegó a su tope: solo esa IP queda sin IA/)
  assert.doesNotMatch(soloIp, /la IA está apagada hasta/)
  const ok = topesHtml(armarVistaTopes({ ...base, ia_activa: false }))
  assert.doesNotMatch(ok, /Tope alcanzado/)
  assert.match(ok, /IA apagada \(interruptor inventario_ia_activa\)/)
})

test('la tarjeta de topes usa su propia promesa independiente', () => {
  const src = readFileSync(new URL('../js/admin-herramientas-analytics.js', import.meta.url), 'utf8')
  assert.match(src, /fetchHerramientasIATopes\(APP_ENV\)\.then\(armarVistaTopes, \(\) => null\)/)
  assert.match(src, /Topes de la IA \(últimas 24 h\)/)
})

test('la migración de topes mantiene los privilegios cerrados', () => {
  const sql = readFileSync(new URL('../supabase/migrations/update_analytics_herramientas_ia_topes.sql', import.meta.url), 'utf8').toLowerCase()
  assert.match(sql, /security definer/)
  assert.match(sql, /set search_path = public/)
  assert.match(sql, /revoke\s+execute on function public\.analytics_herramientas_ia_topes\(text\) from public, anon/)
  assert.match(sql, /grant\s+execute on function public\.analytics_herramientas_ia_topes\(text\) to authenticated/)
  assert.doesNotMatch(sql, /to anon|to public/)
})
