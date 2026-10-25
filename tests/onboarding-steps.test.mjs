import test from 'node:test'
import assert from 'node:assert/strict'
import {
  PASOS, SUBPASOS, TOTAL_PASOS, numeroPaso, avanzar, subpasoActual,
} from '../js/onboarding-steps.js'
import { crearEstadoInicial } from '../js/onboarding-state.js'

test('PASOS trae el orden exacto del spec', () => {
  assert.deepEqual(PASOS, [
    'bienvenida', 'crear_item', 'ver_items', 'venta', 'gasto', 'facturas', 'inventario', 'cierre',
  ])
})

test('numeroPaso', () => {
  assert.equal(numeroPaso('crear_item'), 1)
  assert.equal(numeroPaso('ver_items'), 2)
  assert.equal(numeroPaso('venta'), 3)
  assert.equal(numeroPaso('gasto'), 4)
  assert.equal(numeroPaso('facturas'), 5)
  assert.equal(numeroPaso('inventario'), 6)
  assert.equal(numeroPaso('bienvenida'), null)
  assert.equal(numeroPaso('cierre'), null)
  assert.equal(TOTAL_PASOS, 6)
})

test('avanzar solo con el evento esperado', () => {
  const s0 = { ...crearEstadoInicial('r'), step: 'crear_item', sub: 0 }
  assert.equal(avanzar(s0, { tipo: 'click', ancla: 'otro' }), s0)
  assert.equal(avanzar(s0, { tipo: 'click', ancla: 'menu-items' }).sub, 1)
  const sNombre = { ...s0, sub: 2 }
  assert.equal(avanzar(sNombre, { tipo: 'campo', ancla: 'f-nombre', valido: false }), sNombre)
  assert.equal(avanzar(sNombre, { tipo: 'campo', ancla: 'f-nombre', valido: true }).sub, 3)
})

test('un campo correcto pero con otra ancla no avanza (identidad)', () => {
  const s = { ...crearEstadoInicial('r'), step: 'crear_item', sub: 2 }
  assert.equal(avanzar(s, { tipo: 'campo', ancla: 'f-precio-base', valido: true }), s)
})

test('un subpaso info avanza con siguiente', () => {
  const s = { ...crearEstadoInicial('r'), step: 'crear_item', sub: 5 }
  assert.equal(SUBPASOS.crear_item[5].avanza, 'info')
  assert.equal(avanzar(s, { tipo: 'click', ancla: 'f-total' }), s)
  assert.equal(avanzar(s, { tipo: 'siguiente', ancla: 'f-total' }).sub, 6)
})

test('el último subpaso pasa al siguiente paso', () => {
  const ult = SUBPASOS.crear_item.length - 1
  const s = avanzar({ ...crearEstadoInicial('r'), step: 'crear_item', sub: ult }, { tipo: 'click', ancla: 'btn-crear-item' })
  assert.equal(s.step, 'ver_items')
  assert.equal(s.sub, 0)
})

test('el último subpaso de inventario pasa a cierre sin marcar completed', () => {
  const ult = SUBPASOS.inventario.length - 1
  const ultimaAncla = SUBPASOS.inventario[ult].ancla
  const s = avanzar({ ...crearEstadoInicial('r'), step: 'inventario', sub: ult }, { tipo: 'siguiente', ancla: ultimaAncla })
  assert.equal(s.step, 'cierre')
  assert.equal(s.sub, 0)
  assert.equal(s.completed, false)
})

test('avanzar en bienvenida o cierre devuelve el mismo estado (sin subpasos)', () => {
  const sBienvenida = crearEstadoInicial('r')
  assert.equal(avanzar(sBienvenida, { tipo: 'click', ancla: 'cualquiera' }), sBienvenida)
  const sCierre = { ...crearEstadoInicial('r'), step: 'cierre', sub: 0 }
  assert.equal(avanzar(sCierre, { tipo: 'siguiente', ancla: 'cualquiera' }), sCierre)
})

test('toda ancla de SUBPASOS tiene texto', () => {
  for (const p of Object.values(SUBPASOS)) for (const sp of p) assert.ok(sp.texto?.length > 0, sp.ancla)
})

test('SUBPASOS trae las anclas, pantallas y tipos exactos del spec', () => {
  const resumen = Object.fromEntries(
    Object.entries(SUBPASOS).map(([paso, subs]) => [paso, subs.map(s => [s.ancla, s.pantalla, s.avanza])]),
  )
  assert.deepEqual(resumen, {
    crear_item: [
      ['menu-items', 'inicio', 'click'],
      ['btn-nuevo-item', 'items-lista', 'click'],
      ['f-nombre', 'item-crear', 'campo'],
      ['f-precio-base', 'item-crear', 'campo'],
      ['f-impuesto', 'item-crear', 'campo'],
      ['f-total', 'item-crear', 'info'],
      ['f-costo', 'item-crear', 'info'],
      ['f-existencias-toggle', 'item-crear', 'click'],
      ['f-existencias', 'item-crear', 'campo'],
      ['btn-crear-item', 'item-crear', 'click'],
    ],
    ver_items: [
      ['fila-item-cliente', 'items-lista', 'info'],
      ['col-existencia', 'items-lista', 'info'],
      ['switch-activo', 'items-lista', 'info'],
      ['btn-editar', 'items-lista', 'info'],
      ['buscador-items', 'items-lista', 'info'],
    ],
    venta: [
      ['btn-nueva-venta', 'items-lista', 'click'],
      ['producto-cliente', 'pos', 'click'],
      ['carrito-lineas', 'pos', 'info'],
      ['btn-vender', 'pos', 'click'],
      ['metodo-efectivo', 'pago', 'click'],
      ['opciones-rapidas', 'pago-efectivo', 'info'],
      ['btn-pagar', 'pago-efectivo', 'click'],
      ['venta-completada', 'venta-ok', 'info'],
    ],
    gasto: [
      ['menu-egresos', 'venta-ok', 'click'],
      ['btn-nuevo-gasto', 'gastos-lista', 'click'],
      ['g-metodo', 'gasto-crear', 'campo'],
      ['g-categoria', 'gasto-crear', 'campo'],
      ['g-valor', 'gasto-crear', 'campo'],
      ['g-turno', 'gasto-crear', 'info'],
      ['btn-crear-gasto', 'gasto-crear', 'click'],
      ['gasto-detalle', 'gasto-detalle', 'info'],
    ],
    facturas: [
      ['menu-ingresos', 'gasto-detalle', 'click'],
      ['filtros-facturas', 'facturas-lista', 'info'],
      ['factura-cliente', 'facturas-lista', 'click'],
      ['factura-detalle', 'factura-detalle', 'info'],
    ],
    inventario: [
      ['menu-flujo', 'factura-detalle', 'click'],
      ['ledger-entrada', 'flujo', 'info'],
      ['ledger-salida', 'flujo', 'info'],
    ],
  })
})

test('subpasoActual devuelve el subpaso con su texto', () => {
  const s = { ...crearEstadoInicial('r'), step: 'crear_item', sub: 0 }
  assert.deepEqual(subpasoActual(s), SUBPASOS.crear_item[0])
})

test('subpasoActual es null en bienvenida y cierre', () => {
  assert.equal(subpasoActual(crearEstadoInicial('r')), null)
  assert.equal(subpasoActual({ ...crearEstadoInicial('r'), step: 'cierre', sub: 0 }), null)
})

test('subpasoActual es null si sub se pasa del final', () => {
  const s = { ...crearEstadoInicial('r'), step: 'inventario', sub: SUBPASOS.inventario.length }
  assert.equal(subpasoActual(s), null)
})
