// js/onboarding-screens.js — réplica de las pantallas de Bold POS retail para
// el recorrido guiado. Funciones puras estado → HTML; el controlador (Task 6)
// conecta los eventos por `data-action` y posa las burbujas sobre `data-onb`.
//
// Cada pantalla vive en su módulo (items, venta, historial) para que, cuando
// Bold cambie su UI, el ajuste quede en un solo lugar. Este archivo solo
// decide qué pantalla va y en qué sección del menú.

import { shell } from './onboarding-screens-ui.js'
import { inicio, itemsLista, itemCrear, flujo } from './onboarding-screens-items.js'
import { pos, pago, pagoEfectivo, ventaOk } from './onboarding-screens-venta.js'
import {
  gastosLista, gastoCrear, gastoDetalle, facturasLista, facturaDetalle,
} from './onboarding-screens-historial.js'

export { shell } from './onboarding-screens-ui.js'

// nombre → [render(estado, errores, borrador), sección activa del menú]
const PANTALLA = {
  'inicio': [inicio, 'home'],
  'items-lista': [itemsLista, 'items:lista'],
  'item-crear': [itemCrear, 'items:lista'],
  'pos': [pos, 'pv'],
  'pago': [pago, 'pv'],
  'pago-efectivo': [pagoEfectivo, 'pv'],
  'venta-ok': [ventaOk, 'pv'],
  'gastos-lista': [gastosLista, 'egresos:gastos'],
  'gasto-crear': [gastoCrear, 'egresos:gastos'],
  'gasto-detalle': [gastoDetalle, 'egresos:gastos'],
  'facturas-lista': [facturasLista, 'ingresos:facturas'],
  'factura-detalle': [facturaDetalle, 'ingresos:facturas'],
  'flujo': [flujo, 'items:flujo'],
}

export const PANTALLAS = Object.keys(PANTALLA)

// borrador: valores en curso de los formularios, por name del campo
// (f-nombre, f-precio-base, …, g-observaciones, recibido), para re-pintar sin
// perder lo que el cliente escribió.
export function renderPantalla(nombre, estado, errores = {}, borrador = {}) {
  const entrada = PANTALLA[nombre]
  if (!entrada) throw new Error(`Pantalla desconocida: ${nombre}`)
  const [render, menu] = entrada
  return shell(render(estado, errores || {}, borrador || {}), menu)
}
