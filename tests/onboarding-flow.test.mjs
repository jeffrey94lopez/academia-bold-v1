import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AVISO_FUERA, TOAST_ITEM, TOAST_GASTO, aplicarAccion, campoValido, confirmarCampo, empezar,
  escribirCampo, escribirCantidad, pantallaActual, ponerseAlDia, precioTotalBorrador, progreso,
  resumenCierre, siguiente, transicion, usarEjemplo,
} from '../js/onboarding-flow.js'
import { crearEstadoInicial } from '../js/onboarding-state.js'
import { SUBPASOS, subpasoActual } from '../js/onboarding-steps.js'
import { posicionBurbuja } from '../js/onboarding-guide.js'

const en = (step, ancla, extra = {}) => ({
  ...crearEstadoInicial('r'), step, sub: SUBPASOS[step].findIndex(s => s.ancla === ancla), ...extra,
})
const anclaDe = e => subpasoActual(e)?.ancla

const ITEM = { nombre: 'Hamburguesa', precioBase: 15000, impuesto: 'inc8', costo: null, existencias: 5, codigo: 'I-DEMO-0001', categoria: 'General', activo: true }

test('empezar lleva de bienvenida al primer subpaso de crear_item', () => {
  const e = empezar(crearEstadoInicial('r'))
  assert.equal(e.step, 'crear_item')
  assert.equal(anclaDe(e), 'menu-items')
  assert.equal(pantallaActual(e), 'inicio')
})

test('campoValido reusa las reglas de validarItem/validarGasto', () => {
  assert.equal(campoValido('f-nombre', ''), false)
  assert.equal(campoValido('f-nombre', 'Hamburguesa'), true)
  assert.equal(campoValido('f-precio-base', '15.000'), true)
  assert.equal(campoValido('f-precio-base', '-5'), false)
  assert.equal(campoValido('f-impuesto', 'inc8'), true)
  assert.equal(campoValido('f-impuesto', 'inventado'), false)
  assert.equal(campoValido('f-existencias', '0'), false)
  assert.equal(campoValido('g-valor', 'abc'), false)
  assert.equal(campoValido('g-observaciones', ''), true)
})

test('escribir no avanza; confirmar el campo pedido y válido sí', () => {
  const e0 = en('crear_item', 'f-nombre')
  const e1 = escribirCampo(e0, 'f-nombre', 'H')
  assert.equal(anclaDe(e1), 'f-nombre')
  assert.equal(e1.borrador['f-nombre'], 'H')
  assert.equal(anclaDe(confirmarCampo(e1, 'f-nombre')), 'f-precio-base')
  // Vacío no avanza.
  assert.equal(anclaDe(confirmarCampo(escribirCampo(e0, 'f-nombre', '  '), 'f-nombre')), 'f-nombre')
})

test('ponerseAlDia avanza los campos ya llenos fuera de orden y para en las burbujas info', () => {
  let e = en('crear_item', 'f-nombre')
  e = escribirCampo(e, 'f-precio-base', '15.000')
  e = escribirCampo(e, 'f-impuesto', 'inc8')
  e = confirmarCampo(escribirCampo(e, 'f-nombre', 'Hamburguesa'), 'f-nombre')
  assert.equal(anclaDe(e), 'f-total')
})

test('siguiente solo cierra la burbuja info que está a la vista', () => {
  const e = en('crear_item', 'f-total')
  assert.equal(siguiente(e, 'f-costo'), e)
  assert.equal(anclaDe(siguiente(e, 'f-total')), 'f-costo')
  const campo = en('crear_item', 'f-nombre')
  assert.equal(siguiente(campo, 'f-nombre'), campo)
})

test('switch de existencias: encender avanza, y con existencias llenas salta al botón Crear', () => {
  let e = en('crear_item', 'f-existencias-toggle')
  e = aplicarAccion(e, 'f-existencias-toggle').estado
  assert.equal(e.borrador['f-existencias-toggle'], 'on')
  assert.equal(anclaDe(e), 'f-existencias')
  // Apagarlo con la burbuja en existencias vuelve al switch.
  const apagado = aplicarAccion(e, 'f-existencias-toggle').estado
  assert.equal(apagado.borrador['f-existencias-toggle'], '')
  assert.equal(anclaDe(apagado), 'f-existencias-toggle')
})

test('usar ejemplo completa lo vacío, respeta lo escrito y avanza hasta la primera burbuja info', () => {
  let e = escribirCampo(en('crear_item', 'f-nombre'), 'f-nombre', 'Hamburguesa')
  const { estado, errores } = aplicarAccion(e, 'usar-ejemplo')
  assert.deepEqual(errores, {})
  assert.equal(estado.borrador['f-nombre'], 'Hamburguesa')
  assert.equal(estado.borrador['f-precio-base'], '20000')
  assert.equal(estado.borrador['f-existencias-toggle'], 'on')
  assert.equal(anclaDe(estado), 'f-total')
  // Al cerrar las dos burbujas info, el switch y las existencias ya están: queda en Crear ítem.
  e = siguiente(siguiente(estado, 'f-total'), 'f-costo')
  assert.equal(anclaDe(e), 'btn-crear-item')

  const g = usarEjemplo(en('gasto', 'g-metodo'))
  assert.equal(g.borrador['g-metodo'], 'Efectivo')
  assert.equal(anclaDe(g), 'g-turno')
})

test('crear ítem con nombre vacío: errores, no avanza ni crea', () => {
  let e = en('crear_item', 'btn-crear-item')
  e = { ...e, borrador: { 'f-precio-base': '15000', 'f-impuesto': 'inc8', 'f-existencias-toggle': 'on', 'f-existencias': '5' } }
  const r = aplicarAccion(e, 'btn-crear-item')
  assert.equal(r.errores.nombre, 'Este campo es requerido')
  assert.equal(r.estado.item, null)
  assert.equal(anclaDe(r.estado), 'btn-crear-item')
  assert.equal(r.toast, undefined)
})

test('error de existencias con el switch apagado enciende el switch', () => {
  const e = { ...en('crear_item', 'f-existencias-toggle'), borrador: { 'f-nombre': 'X', 'f-precio-base': '1', 'f-impuesto': 'exento' } }
  const r = aplicarAccion(e, 'btn-crear-item')
  assert.ok(r.errores.existencias)
  assert.equal(r.estado.borrador['f-existencias-toggle'], 'on')
})

test('crear ítem válido: crea, limpia el borrador, avanza a ver_items y avisa con toast', () => {
  const e = { ...en('crear_item', 'f-total'), borrador: { 'f-nombre': 'Hamburguesa', 'f-precio-base': '15.000', 'f-impuesto': 'inc8', 'f-existencias-toggle': 'on', 'f-existencias': '5' } }
  const r = aplicarAccion(e, 'btn-crear-item')
  assert.equal(r.toast, TOAST_ITEM)
  assert.deepEqual(r.errores, {})
  assert.equal(r.estado.item.nombre, 'Hamburguesa')
  assert.equal(r.estado.item.existencias, 5)
  assert.ok(!Number.isNaN(Date.parse(r.estado.item.creado)))
  assert.equal(r.estado.step, 'ver_items')
  assert.equal(r.estado.borrador['f-nombre'], undefined)
})

test('precio total en vivo: 15.000 + INC 8% = 16,200', () => {
  assert.equal(precioTotalBorrador({ 'f-precio-base': '15.000', 'f-impuesto': 'inc8' }), '16,200')
  assert.equal(precioTotalBorrador({ 'f-precio-base': '15000' }), '')
})

test('Ruling A: un ancla del menú que no es la pedida es fuera de ruta', () => {
  const e = en('crear_item', 'menu-items')
  const r = aplicarAccion(e, 'menu-egresos')
  assert.equal(r.aviso, AVISO_FUERA)
  assert.equal(r.estado, e)
  assert.equal(anclaDe(aplicarAccion(e, 'menu-items').estado), 'btn-nuevo-item')
  assert.equal(aplicarAccion(e, 'fuera-de-ruta').aviso, AVISO_FUERA)
})

test('producto con tope: no agrega, avisa y no deja topeAlcanzado en el estado', () => {
  let e = en('venta', 'producto-cliente', { item: { ...ITEM, existencias: 1 } })
  let r = aplicarAccion(e, 'producto-cliente')
  assert.equal(r.tope, false)
  assert.equal(r.estado.ventaLineas.length, 1)
  assert.equal(anclaDe(r.estado), 'carrito-lineas')
  r = aplicarAccion(r.estado, 'producto-cliente')
  assert.equal(r.tope, true)
  assert.equal(r.estado.ventaLineas.length, 1)
  assert.equal('topeAlcanzado' in r.estado, false)
})

test('cantidad escrita se topa en la existencia; texto vacío no cambia nada', () => {
  const e = en('venta', 'carrito-lineas', { item: ITEM, ventaLineas: [{ cantidad: 1 }] })
  assert.equal(escribirCantidad(e, 0, '9').ventaLineas[0].cantidad, 5)
  assert.equal(escribirCantidad(e, 0, ''), e)
})

test('pagar: recibido menor al total avisa; por defecto paga el total y avanza', () => {
  const base = en('venta', 'btn-pagar', { item: ITEM, ventaLineas: [{ cantidad: 1 }] })
  const corto = aplicarAccion({ ...base, borrador: { recibido: '1,000' } }, 'btn-pagar')
  assert.ok(corto.aviso)
  assert.equal(corto.estado.venta, null)
  const ok = aplicarAccion(base, 'btn-pagar')
  assert.equal(ok.estado.venta.total, 16200)
  assert.equal(ok.estado.item.existenciasFinal, 4)
  assert.equal(anclaDe(ok.estado), 'venta-completada')
  // Opción rápida guarda el monto en el borrador.
  assert.equal(aplicarAccion(base, 'opcion-rapida', { valor: '20000' }).estado.borrador.recibido, '20,000')
})

test('crear gasto válido avanza al detalle con toast', () => {
  const e = { ...en('gasto', 'g-turno'), borrador: { 'g-metodo': 'Efectivo', 'g-categoria': 'Aseo', 'g-valor': '50.000' } }
  const r = aplicarAccion(e, 'btn-crear-gasto')
  assert.equal(r.toast, TOAST_GASTO)
  assert.equal(r.estado.gasto.valor, 50000)
  assert.equal(anclaDe(r.estado), 'gasto-detalle')
  const vacio = aplicarAccion(en('gasto', 'btn-crear-gasto'), 'btn-crear-gasto')
  assert.equal(vacio.errores.valor, 'Este campo es requerido')
})

test('transicion: paso completo al cambiar de paso, y fin una sola vez al llegar al cierre', () => {
  const a = en('crear_item', 'btn-crear-item')
  const b = { ...a, step: 'ver_items', sub: 0 }
  assert.deepEqual(transicion(a, b).eventos, [{ tipo: 'pasoCompleto', step: 'crear_item' }])
  assert.deepEqual(transicion(a, a).eventos, [])
  const ultimo = en('inventario', 'ledger-salida')
  const t1 = transicion(ultimo, { ...ultimo, step: 'cierre', sub: 0 })
  assert.equal(t1.estado.completed, true)
  assert.deepEqual(t1.eventos, [{ tipo: 'pasoCompleto', step: 'inventario' }, { tipo: 'fin' }])
  assert.deepEqual(transicion(t1.estado, t1.estado).eventos, [])
  // Empezar desde la bienvenida no cuenta como paso completo.
  const ini = crearEstadoInicial('r')
  assert.deepEqual(transicion(ini, empezar(ini)).eventos, [])
})

test('progreso y resumen de cierre', () => {
  assert.equal(progreso(crearEstadoInicial('r')), 0)
  assert.equal(progreso({ ...crearEstadoInicial('r'), step: 'ver_items', sub: 0 }), 1 / 6)
  assert.equal(progreso({ ...crearEstadoInicial('r'), step: 'cierre', sub: 0 }), 1)
  const e = { ...crearEstadoInicial('r'), item: { ...ITEM, existenciasFinal: 4 }, ventaLineas: [{ cantidad: 1 }], venta: { total: 16200 }, gasto: { valor: 50000, categoria: 'Aseo' } }
  const frases = resumenCierre(e)
  assert.equal(frases.length, 4)
  assert.match(frases[0], /Hamburguesa.*\$ 16,200/)
  assert.match(frases[3], /de 5 a 4/)
  assert.deepEqual(resumenCierre(crearEstadoInicial('r')), [])
})

test('posicionBurbuja: derecha si cabe; si no, el lado con más espacio y dentro de la ventana', () => {
  const vista = { width: 1440, height: 800 }
  const b = { width: 280, height: 100 }
  const der = posicionBurbuja({ top: 100, left: 20, width: 140, height: 30 }, b, vista)
  assert.equal(der.lado, 'derecha')
  assert.equal(der.left, 20 + 140 + 14)
  const izq = posicionBurbuja({ top: 300, left: 1200, width: 200, height: 30 }, b, vista)
  assert.equal(izq.lado, 'izquierda')
  // Ancla que llena la ventana: igual queda dentro.
  const grande = posicionBurbuja({ top: 0, left: 0, width: 1440, height: 800 }, b, vista)
  assert.ok(grande.left >= 12 && grande.left + b.width <= vista.width - 12)
  assert.ok(grande.top >= 12 && grande.top + b.height <= vista.height - 12)
  // La flecha nunca se sale de la burbuja.
  assert.ok(der.flecha >= 14 && der.flecha <= b.height - 14)
})
