import test from 'node:test'
import assert from 'node:assert/strict'
import { renderPantalla, PANTALLAS } from '../js/onboarding-screens.js'
import { SUBPASOS } from '../js/onboarding-steps.js'
import {
  crearEstadoInicial, crearItem, agregarLinea, pagarVenta, crearGasto,
} from '../js/onboarding-state.js'

const base = () => crearItem(crearEstadoInicial('r'), { nombre: '<img src=x onerror=alert(1)>', precioBase: '20000', impuesto: 'iva19', existencias: '10' })
test('cada ancla de SUBPASOS existe en su pantalla', () => {
  let s = pagarVenta(agregarLinea(base()), 23800)
  s = crearGasto(s, { metodo: 'Efectivo', categoria: 'Servicios públicos', valor: '50000' })
  for (const lista of Object.values(SUBPASOS)) for (const sp of lista)
    assert.ok(renderPantalla(sp.pantalla, s).includes(`data-onb="${sp.ancla}"`), `${sp.pantalla}:${sp.ancla}`)
})
test('el nombre del cliente sale escapado', () => {
  const html = renderPantalla('items-lista', base())
  assert.ok(!html.includes('<img src=x')); assert.ok(html.includes('&lt;img'))
})
test('montos con formato Bold y aviso de práctica', () => {
  const html = renderPantalla('pos', agregarLinea(base()))
  assert.ok(html.includes('Vender $ 23,800'))
  assert.ok(html.includes('Modo práctica'))
})
test('errores bajo el campo', () => {
  assert.ok(renderPantalla('item-crear', base(), { nombre: 'Este campo es requerido' }).includes('onb-error'))
})

// --- Extras del controlador (borrador, ítem nulo, escape en todas) ---

const completo = () => {
  let s = pagarVenta(agregarLinea(agregarLinea(base())), 47600)
  s = crearGasto(s, { metodo: 'Efectivo', categoria: 'Servicios públicos', valor: '50000', observaciones: '<b>luz</b>' })
  return s
}

test('item-crear vuelve a pintar el borrador y calcula el precio total', () => {
  const html = renderPantalla('item-crear', crearEstadoInicial('r'), {}, {
    'f-nombre': 'Camiseta "azul"', 'f-precio-base': '20000', 'f-impuesto': 'iva19',
    'f-costo': '12000', 'f-existencias-toggle': 'on', 'f-existencias': '10',
  })
  assert.ok(html.includes('value="Camiseta &quot;azul&quot;"'))
  assert.ok(html.includes('value="20000"'))
  assert.ok(html.includes('value="12000"'))
  assert.ok(html.includes('value="10"'))
  assert.match(html, /<option value="iva19" selected>/)
  assert.ok(html.includes('23,800'))
  assert.ok(html.includes('Mi negocio - Principal'))
})

test('item-crear sin precio válido no inventa total', () => {
  const html = renderPantalla('item-crear', crearEstadoInicial('r'), {}, { 'f-precio-base': 'abc', 'f-impuesto': 'iva19' })
  assert.ok(!html.includes('NaN'))
})

test('gasto-crear vuelve a pintar el borrador', () => {
  const html = renderPantalla('gasto-crear', crearEstadoInicial('r'), { valor: 'Ingresa un valor mayor a 0' }, {
    'g-metodo': 'Efectivo', 'g-categoria': 'Transporte', 'g-valor': '-5', 'g-observaciones': '<script>',
  })
  assert.match(html, /<option value="Efectivo" selected>/)
  assert.match(html, /<option value="Transporte" selected>/)
  assert.ok(html.includes('value="-5"'))
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(html.includes('onb-error'))
})

test('ninguna pantalla se rompe con el estado inicial (item null)', () => {
  const s = crearEstadoInicial('r')
  for (const p of PANTALLAS) assert.equal(typeof renderPantalla(p, s), 'string', p)
})

test('items-lista sin ítem del cliente muestra solo los 4 de relleno', () => {
  const html = renderPantalla('items-lista', crearEstadoInicial('r'))
  assert.ok(!html.includes('data-onb="fila-item-cliente"'))
  assert.equal((html.match(/class="onb-fila-item"/g) || []).length, 4)
  assert.ok(html.includes('Cable cargador') && html.includes('$ 14,280'))
})

test('el nombre sale escapado en todas las pantallas', () => {
  const s = completo()
  for (const p of PANTALLAS) {
    const html = renderPantalla(p, s)
    assert.ok(!html.includes('<img src=x'), p)
    assert.ok(!html.includes('<b>luz</b>'), p)
  }
})

test('menú: anclas propias y el resto fuera de ruta', () => {
  const html = renderPantalla('inicio', crearEstadoInicial('r'))
  for (const a of ['menu-items', 'menu-egresos', 'menu-ingresos', 'menu-flujo'])
    assert.ok(html.includes(`data-onb="${a}" data-action="${a}"`), a)
  assert.ok(html.includes('data-action="fuera-de-ruta"'))
  for (const t of ['HOME', 'PUNTO DE VENTA', 'INGRESOS', 'EGRESOS', 'ÍTEMS', 'Clientes', 'Proveedores', 'Reportes', 'Ajustes', 'Ayuda'])
    assert.ok(html.includes(t), t)
})

test('pago muestra los 8 métodos y formularios traen usar-ejemplo', () => {
  const html = renderPantalla('pago', agregarLinea(base()))
  for (const m of ['Bold', 'Efectivo', 'Credibanco', 'Nequi', 'Sistecredito', 'QR', 'Mixto', 'Crédito'])
    assert.ok(html.includes(m), m)
  assert.ok(renderPantalla('item-crear', base()).includes('data-action="usar-ejemplo"'))
  assert.ok(renderPantalla('gasto-crear', base()).includes('data-action="usar-ejemplo"'))
})

test('historiales con números demo y existencia resultante', () => {
  const s = completo()
  assert.ok(renderPantalla('facturas-lista', s).includes('DEMO-0001'))
  const det = renderPantalla('factura-detalle', s)
  for (const t of ['Aceptada', 'Contado', 'Pagada', '$ 47,600']) assert.ok(det.includes(t), t)
  assert.ok(renderPantalla('gasto-detalle', s).includes('Gasto No. 1'))
  const flujo = renderPantalla('flujo', s)
  assert.ok(flujo.includes('8 Unidades') && flujo.includes('-2 Unidades'))
})
