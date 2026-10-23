import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeRange, sentimentBar, lifecycleBar, frictionBar, funnelCardHtml, onboardingFunnelHtml,
} from '../js/analytics-ui.js'
import { fmtBizDay } from '../js/biz-time.js'

// 20:30 UTC del 20 de julio = 3:30pm del 20 en Bogotá. Instante fijo para que
// el resultado no dependa de la zona de la máquina que corre los tests.
const now = new Date('2026-07-20T20:30:00Z')

// Los rangos se anclan al día de Bogotá, así que se verifican con fmtBizDay y
// con el instante exacto (medianoche = 05:00Z, fin de día = 04:59:59.999Z).
test('computeRange today: medianoche a fin de día de hoy, en Bogotá', () => {
  const { from, to } = computeRange('today', now)
  assert.equal(from.toISOString(), '2026-07-20T05:00:00.000Z')
  assert.equal(to.toISOString(), '2026-07-21T04:59:59.999Z')
  assert.equal(fmtBizDay(from), '2026-07-20')
  assert.equal(fmtBizDay(to), '2026-07-20')
})

test('computeRange today: desde un navegador al oeste sigue siendo el día de Bogotá', () => {
  // 01:30 UTC del 21 = 8:30pm del 20 en Bogotá (y 7:30pm del 20 en Honduras).
  const { from, to } = computeRange('today', new Date('2026-07-21T01:30:00Z'))
  assert.equal(from.toISOString(), '2026-07-20T05:00:00.000Z')
  assert.equal(to.toISOString(), '2026-07-21T04:59:59.999Z')
})

test('computeRange 7d: desde hace 6 días 00:00 hasta hoy fin de día', () => {
  const { from, to } = computeRange('7d', now)
  assert.equal(fmtBizDay(from), '2026-07-14')
  assert.equal(from.toISOString(), '2026-07-14T05:00:00.000Z')
  assert.equal(fmtBizDay(to), '2026-07-20')
})

test('computeRange 30d: desde hace 29 días', () => {
  const { from } = computeRange('30d', now)
  assert.equal(fmtBizDay(from), '2026-06-21')
})

test('computeRange month: primer día del mes actual', () => {
  const { from } = computeRange('month', now)
  assert.equal(fmtBizDay(from), '2026-07-01')
})

test('computeRange year: 1 de enero del año actual', () => {
  const { from } = computeRange('year', now)
  assert.equal(fmtBizDay(from), '2026-01-01')
})

test('muestra los tres conteos dentro de la barra', () => {
  const html = sentimentBar({ positivo: 12, neutro: 5, negativo: 3 })
  assert.match(html, />12</)
  assert.match(html, />5</)
  assert.match(html, />3</)
})

test('calcula los anchos sobre el total', () => {
  const html = sentimentBar({ positivo: 2, neutro: 1, negativo: 1 })
  assert.match(html, /width:50%/)
  assert.match(html, /width:25%/)
})

test('base cero: no lanza y produce anchos 0%', () => {
  let html
  assert.doesNotThrow(() => { html = sentimentBar({ positivo: 0, neutro: 0, negativo: 0 }) })
  assert.match(html, /width:0%/)
})

test('entrada indefinida no lanza', () => {
  assert.doesNotThrow(() => sentimentBar(undefined))
})

test('lifecycleBar muestra los tres conteos dentro de la barra', () => {
  const html = lifecycleBar({ cerrada_cliente: 120, abandonada: 45, escalada: 18 })
  assert.match(html, />120</)
  assert.match(html, />45</)
  assert.match(html, />18</)
})

test('lifecycleBar excluye en_curso del cálculo de anchos', () => {
  const html = lifecycleBar({ cerrada_cliente: 2, abandonada: 1, escalada: 1, en_curso: 96 })
  assert.match(html, /width:50%/)
  assert.match(html, /width:25%/)
  assert.doesNotMatch(html, />96</)
})

test('lifecycleBar con base cero no lanza y produce anchos 0%', () => {
  let html
  assert.doesNotThrow(() => { html = lifecycleBar({ cerrada_cliente: 0, abandonada: 0, escalada: 0 }) })
  assert.match(html, /width:0%/)
})

test('lifecycleBar con entrada indefinida no lanza', () => {
  assert.doesNotThrow(() => lifecycleBar(undefined))
})

// --- Fricción (reemplaza al sentimiento como métrica de cabecera) ---

test('frictionBar apila los tres buckets con sus conteos', () => {
  const html = frictionBar({ sin: 148, no_info: 54, support: 32, pct: 37, total: 234 })
  assert.match(html, />148</)
  assert.match(html, />54</)
  assert.match(html, />32</)
})

test('frictionBar calcula anchos sobre el total de los buckets', () => {
  const html = frictionBar({ sin: 2, no_info: 1, support: 1 })
  assert.match(html, /width:50%/)
  assert.match(html, /width:25%/)
})

test('frictionBar sin datos no lanza y da anchos 0%', () => {
  let html
  assert.doesNotThrow(() => { html = frictionBar({ sin: 0, no_info: 0, support: 0 }) })
  assert.match(html, /width:0%/)
})

test('frictionBar con entrada indefinida no lanza', () => {
  assert.doesNotThrow(() => frictionBar(undefined))
})

test('funnelCardHtml calcula % sobre la primera etapa', () => {
  const html = funnelCardHtml('Recorrido guiado', [['Empezó', 10], ['Terminó', 4]])
  assert.ok(html.includes('Recorrido guiado')); assert.ok(html.includes('(40%)')); assert.ok(html.includes('(100%)'))
})

test('funnelCardHtml con base 0 no divide por cero', () => {
  assert.ok(funnelCardHtml('X', [['A', 0], ['B', 0]]).includes('(0%)'))
})

test('funnelCardHtml trata conteos ausentes como 0', () => {
  const html = funnelCardHtml('X', [['A', 5], ['B', undefined]])
  assert.ok(html.includes('0 <span class="text-[var(--black-40)]">(0%)</span>'))
})

const FUNNEL = {
  started: 10,
  steps: { crear_item: 8, ver_items: 7, venta: 6, gasto: 5, facturas: 4, inventario: 4 },
  completed: 4,
  skipped_by_step: { venta: 2 },
  bot_by_step: { crear_item: 3 },
}

test('onboardingFunnelHtml arma las 8 etapas en orden con % sobre Empezó', () => {
  const html = onboardingFunnelHtml(FUNNEL)
  const etapas = ['Empezó', 'Creó el ítem', 'Vio sus productos', 'Hizo la venta',
    'Registró el gasto', 'Vio facturas', 'Vio inventario', 'Terminó']
  let pos = -1
  for (const e of etapas) {
    const i = html.indexOf(e)
    assert.ok(i > pos, `"${e}" debe aparecer después de la etapa anterior`)
    pos = i
  }
  assert.ok(html.includes('(80%)')) // crear_item 8/10
  assert.ok(html.includes('Recorrido guiado'))
})

test('onboardingFunnelHtml lista saltos y bot por paso con su etiqueta', () => {
  const html = onboardingFunnelHtml(FUNNEL)
  assert.ok(html.includes('Saltaron en:'))
  assert.ok(html.includes('Abrieron el bot en:'))
  assert.match(html, /Hizo la venta[^<]*<\/span>\s*<span[^>]*>2</)
  assert.match(html, /Creó el ítem[^<]*<\/span>\s*<span[^>]*>3</)
})

test('onboardingFunnelHtml sin datos (RPC ausente o 0 corridas) muestra estado vacío', () => {
  assert.ok(onboardingFunnelHtml(null).includes('Sin datos del recorrido todavía'))
  assert.ok(onboardingFunnelHtml({ started: 0, steps: {} }).includes('Sin datos del recorrido todavía'))
})

test('onboardingFunnelHtml escapa pasos desconocidos (payload lo escribe el cliente)', () => {
  const html = onboardingFunnelHtml({ ...FUNNEL, skipped_by_step: { '<img src=x onerror=alert(1)>': 1 } })
  assert.ok(!html.includes('<img'))
  assert.ok(html.includes('&lt;img'))
})
