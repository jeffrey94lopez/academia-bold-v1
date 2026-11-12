import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { crearTelemetriaHerramienta, ERRORES, PASOS, ETIQUETAS_PASO } from '../js/herramientas-telemetria.js'
import { armarVista, armarVistaIA } from '../js/herramientas-vista.js'
import { fetchHerramientas, fetchHerramientasIA } from '../js/analytics-api.js'

function crear(extra = {}) {
  const eventos = []
  const t = crearTelemetriaHerramienta({
    track: (tipo, p) => eventos.push({ tipo, p }), tool: 'inventario', runId: 'r1', env: 'sandbox',
    getContexto: () => ({ accountId: 9548, businessName: 'Tienda Luz', vertical: 'retail' }), ...extra,
  })
  return { t, eventos }
}

test('los eventos llevan herramienta, corrida, entorno y la identidad del comercio', () => {
  const { t, eventos } = crear()
  t.inicio('chat')
  t.fin('descarga', { productos: 3 })
  assert.deepEqual(eventos.map(e => e.tipo), ['tool_start', 'tool_complete'])
  assert.deepEqual(eventos[0].p, { tool: 'inventario', run_id: 'r1', env: 'sandbox', account_id: '9548', business_name: 'Tienda Luz', vertical: 'retail', via: 'chat' })
  assert.equal(eventos[1].p.productos, 3)
})

test('sin contexto de Bold no se inventa identidad', () => {
  const { t, eventos } = crear({ getContexto: () => null })
  t.inicio()
  assert.equal('account_id' in eventos[0].p, false)
  assert.equal('business_name' in eventos[0].p, false)
})

test('cada paso se cuenta una sola vez por conversación', () => {
  const { t, eventos } = crear()
  t.paso('plantillas'); t.paso('plantillas'); t.paso('origen')
  assert.deepEqual(eventos.map(e => e.p.paso), ['plantillas', 'origen'])
})

test('un código de error desconocido se guarda como "otro"', () => {
  const { t, eventos } = crear()
  t.error('origen', 'sin_tabla'); t.error('origen', 'algo_raro', { filas: 2 })
  assert.equal(eventos[0].p.codigo, 'sin_tabla')
  assert.equal(eventos[1].p.codigo, 'otro')
  assert.equal(eventos[1].p.filas, 2)
})

test('ia: cada llamada es un evento tool_ia con run_id, sin deduplicar y solo con campos permitidos', () => {
  const { t, eventos } = crear()
  t.ia('categorias', 'acepto', { n_entrada: 48, n_salida: 12, texto: 'Coca Cola' })
  t.ia('categorias', 'acepto', { n_entrada: 48, n_salida: 12 })
  t.ia('unidades', 'fallo', { n_entrada: 5, n_salida: 0, codigo: 'ia_timeout' })
  assert.deepEqual(eventos.map(e => e.tipo), ['tool_ia', 'tool_ia', 'tool_ia'])
  assert.equal(eventos[0].p.run_id, 'r1')
  assert.equal(eventos[0].p.etapa, 'categorias')
  assert.equal(eventos[0].p.decision, 'acepto')
  assert.equal(eventos[0].p.n_entrada, 48)
  assert.equal(eventos[0].p.n_salida, 12)
  assert.equal('texto' in eventos[0].p, false)
  assert.equal('codigo' in eventos[0].p, false)
  assert.equal(eventos[2].p.codigo, 'ia_timeout')
})

test('los códigos de error de la IA tienen explicación para el admin', () => {
  for (const c of ['ia_fallo', 'ia_respuesta_invalida', 'ia_timeout', 'ia_lista_grande']) assert.ok(c in ERRORES, c)
})

// Evita el error silencioso: un código nuevo en el chat que nadie etiquetó caería en "Otro".
test('todo código de error que emite el código tiene explicación y todo paso tiene etiqueta', () => {
  const leer = f => readFileSync(new URL(`../js/${f}`, import.meta.url), 'utf8')
  const usados = new Set()
  for (const f of ['inv-chat.js', 'barras-chat.js']) {
    for (const m of leer(f).matchAll(/telemetria\.error\(\s*'[a-z_]+'\s*,\s*'([a-z_]+)'/g)) usados.add(m[1])
  }
  for (const f of ['inv-sesion.js', 'inv-convertir.js']) {
    for (const m of leer(f).matchAll(/(?:codigo: |, )'((?:plantilla|archivo|sin|filas)_[a-z_]+)'/g)) usados.add(m[1])
  }
  assert.ok(usados.size >= 12, `se esperaban varios códigos, hay ${usados.size}`)
  for (const c of usados) assert.ok(c in ERRORES, `falta explicación para el código "${c}"`)
  const pasos = new Set()
  for (const f of ['inv-chat.js', 'barras-chat.js']) {
    for (const m of leer(f).matchAll(/telemetria\.paso\('([a-z_]+)'\)/g)) pasos.add(m[1])
  }
  for (const p of [...Object.values(PASOS).flat(), ...pasos]) assert.ok(p in ETIQUETAS_PASO, `falta etiqueta del paso "${p}"`)
})

test('armarVista: embudo, errores, elecciones y estado de cada comercio', () => {
  const v = armarVista({
    herramientas: {
      inventario: {
        corridas: 10, comercios: 4, visitantes: 6, sin_identificar: 3, terminaron: 4, comercios_terminaron: 2, productos: 120, crearon_codigos: 1,
        pasos: [{ paso: 'plantillas', corridas: 8 }, { paso: 'origen', corridas: 6 }, { paso: 'resultado', corridas: 5 }],
        errores: [{ paso: 'plantillas', codigo: 'plantilla_invalida', veces: 5, corridas: 4, comercios: 2, filas: null }, { paso: 'x', codigo: 'inventado', veces: 1, corridas: 1, comercios: 0, filas: 7 }],
        acciones: [{ accion: 'descarga', corridas: 4 }],
      },
      codigos: {
        corridas: 2, terminaron: 1,
        elecciones: [{ campo: 'tipo', valor: 'qr', corridas: 1 }, { campo: 'papel', valor: 'etq-50-30', corridas: 1 }, { campo: 'origen_datos', valor: 'crear', corridas: 1 }, { campo: 'raro', valor: 'x', corridas: 1 }],
      },
    },
    comercios: [
      { account_id: '9548', business_name: 'Tienda Luz', vertical: 'retail', ultimo: '2026-10-30T10:00:00Z',
        herramientas: { inventario: { corridas: 2, terminadas: 1, rango_paso: 5 }, codigos: { corridas: 1, terminadas: 0, rango_paso: 2 } } },
    ],
  })
  const inv = v.herramientas[0]
  assert.equal(inv.pctTerminaron, 40)
  assert.deepEqual(inv.embudo.map(f => [f.clave, f.n, f.pct]), [
    ['inicio', 10, 100], ['plantillas', 8, 80], ['origen', 6, 60], ['columnas', 0, 0], ['preguntas', 0, 0], ['resultado', 5, 50], ['fin', 4, 40]])
  assert.equal(inv.errores[0].etiqueta, ERRORES.plantilla_invalida)
  assert.equal(inv.errores[1].etiqueta, ERRORES.otro)
  assert.equal(inv.errores[1].filas, 7)
  assert.equal(inv.sinIdentificar, 3)
  const cod = v.herramientas[1]
  assert.deepEqual(cod.elecciones.map(g => g.campo), ['tipo', 'papel', 'origen_datos'])
  assert.equal(cod.elecciones[0].items[0].etiqueta, 'QR')
  assert.equal(cod.elecciones[1].items[0].etiqueta, 'Etiqueta 50 × 30 mm')
  const c = v.comercios[0]
  assert.equal(c.texto, 'Tienda Luz')
  assert.deepEqual(c.inventario, { texto: 'Terminó', ok: true, corridas: 2 })
  assert.equal(c.codigos.ok, false)
  assert.match(c.codigos.texto, /Eligió el formato de barras/)
  assert.equal(v.comerciosTerminaron, 1)
})

test('armarVista con respuesta vacía no revienta', () => {
  const v = armarVista(null)
  assert.equal(v.herramientas.length, 2)
  assert.equal(v.herramientas[0].embudo[0].n, 0)
  assert.equal(v.comercios.length, 0)
})

test('fetchHerramientas llama la RPC con fechas y entorno', async () => {
  const cap = {}
  const client = { rpc: (name, params) => { cap.name = name; cap.params = params; return Promise.resolve({ data: { ok: 1 }, error: null }) } }
  const from = new Date('2026-10-01T00:00:00Z'), to = new Date('2026-10-30T00:00:00Z')
  assert.deepEqual(await fetchHerramientas(from, to, 'sandbox', client), { ok: 1 })
  assert.equal(cap.name, 'analytics_herramientas')
  assert.deepEqual(cap.params, { p_from: from.toISOString(), p_to: to.toISOString(), p_env: 'sandbox' })
})

// ---------- Tarjeta de IA del conversor ----------
const IA_COMPLETA = {
  llamadas: 40, cache_pct: 25, tokens_entrada: 12000, tokens_salida: 3000,
  costo_usd: 0.0456, costo_por_conversion: 0.0012, costo_por_descarga: 0.0034,
  decisiones: {
    categorias: { acepto: 6, corrigio: 2, originales: 1, fallo: 1 },
    unidades: { acepto: 3, corrigio: 0, originales: 0, fallo: 0 },
    simplificar: { acepto: 1, corrigio: 1, originales: 2, fallo: 0 },
  },
}

test('armarVistaIA: datos completos con montos a 4 decimales y totales por etapa', () => {
  const v = armarVistaIA(IA_COMPLETA)
  assert.equal(v.llamadas, 40)
  assert.equal(v.cachePct, 25)
  assert.equal(v.tokensEntrada, 12000)
  assert.equal(v.tokensSalida, 3000)
  assert.equal(v.costoTotal, 'US$ 0.0456')
  assert.equal(v.costoPorConversion, 'US$ 0.0012')
  assert.equal(v.costoPorDescarga, 'US$ 0.0034')
  assert.deepEqual(v.decisiones.map(d => d.etapa), ['categorias', 'unidades', 'simplificar'])
  assert.deepEqual(v.decisiones[0], { etapa: 'categorias', etiqueta: 'Categorías', acepto: 6, corrigio: 2, originales: 1, fallo: 1, total: 10 })
  assert.equal(v.decisiones[1].total, 3)
  assert.equal(v.decisiones[2].total, 4)
})

test('armarVistaIA: costo null se marca sin precio configurado', () => {
  const v = armarVistaIA({ ...IA_COMPLETA, costo_usd: null, costo_por_conversion: null, costo_por_descarga: null })
  assert.equal(v.costoTotal, null)
  assert.equal(v.costoPorConversion, null)
  assert.equal(v.costoPorDescarga, null)
  assert.equal(v.llamadas, 40)
})

test('armarVistaIA: sin llamadas todo es cero y no divide por cero', () => {
  for (const data of [{ llamadas: 0, cache_pct: 0 }, null, undefined, {}]) {
    const v = armarVistaIA(data)
    assert.equal(v.llamadas, 0)
    assert.equal(v.cachePct, 0)
    assert.equal(v.tokensEntrada, 0)
    assert.equal(v.costoTotal, null)
    assert.equal(v.decisiones.length, 3)
    for (const d of v.decisiones) assert.deepEqual([d.acepto, d.corrigio, d.originales, d.fallo, d.total], [0, 0, 0, 0, 0])
  }
})

test('fetchHerramientasIA llama a la RPC con rango y entorno', async () => {
  let llamada
  const client = { rpc: async (n, p) => { llamada = { n, p }; return { data: IA_COMPLETA, error: null } } }
  const r = await fetchHerramientasIA(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-31T00:00:00Z'), 'sandbox', client)
  assert.equal(llamada.n, 'analytics_herramientas_ia')
  assert.deepEqual(llamada.p, { p_from: '2026-01-01T00:00:00.000Z', p_to: '2026-01-31T00:00:00.000Z', p_env: 'sandbox' })
  assert.equal(r.llamadas, 40)
  await assert.rejects(fetchHerramientasIA(new Date(), new Date(), 'sandbox', { rpc: async () => ({ data: null, error: { message: 'x' } }) }), /analytics_herramientas_ia/)
})

test('los fallos de la IA del purgador llegan a tool_error con códigos explicados', () => {
  const src = readFileSync(new URL('../js/inv-chat.js', import.meta.url), 'utf8')
  assert.match(src, /telemetria\.error\('ia_' \+ etapa, res\.codigo\)/)
  assert.match(src, /CORTAN_IA = new Set\(\['ia_timeout', 'ia_fallo'\]\)/)
  for (const c of ['ia_fallo', 'ia_respuesta_invalida', 'ia_timeout', 'ia_lista_grande']) assert.ok(c in ERRORES, c)
})
