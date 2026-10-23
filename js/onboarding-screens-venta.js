// js/onboarding-screens-venta.js — Nueva venta (POS), Método de pago,
// Efectivo y Venta Completada. Como en Bold, el pago y la confirmación son un
// panel lateral sobre el POS oscurecido; el menú queda clicable.

import { IMPUESTOS, formatCOP, precioTotal, totalesVenta, parseMonto } from './onboarding-state.js'
import { t, miles, ICO, FUERA, input, boton } from './onboarding-screens-ui.js'
import { ITEMS_RELLENO } from './onboarding-screens-items.js'

// Mismo orden y nombres que el panel "Método de pago" real (8 opciones).
export const METODOS_PAGO_VENTA = ['Bold', 'Efectivo', 'Credibanco', 'Nequi', 'Sistecredito', 'QR', 'Mixto', 'Crédito']

function etiquetaImpuesto(id) {
  return IMPUESTOS.find(i => i.id === id)?.label ?? 'Impuesto'
}

function tarjetaProducto({ codigo, nombre, precio }, cliente) {
  const attrs = cliente ? 'data-onb="producto-cliente" data-action="producto-cliente"' : FUERA
  return `<button type="button" class="onb-producto${cliente ? ' onb-producto-cliente' : ''}" ${attrs}>
  <span class="onb-producto-precio">${t(formatCOP(precio))}</span>
  <span class="onb-producto-img">${ICO.etiqueta}</span>
  <span class="onb-producto-nombre">${t(codigo)} - ${t(nombre)}</span>
</button>`
}

function lineaCarrito(item, linea, idx) {
  const pct = IMPUESTOS.find(i => i.id === item.impuesto)?.pct ?? 0
  return `<div class="onb-linea">
  <input class="onb-input onb-cantidad" type="text" inputmode="numeric" name="cantidad" data-action="cambiar-cantidad" data-idx="${idx}" value="${t(linea.cantidad)}" aria-label="Cantidad">
  <div class="onb-linea-info"><strong>${t(item.nombre)}</strong><span>${t(item.codigo)}</span><small>Descuento: 0 % / Impuesto: ${t(pct)} %</small></div>
  <strong class="onb-linea-precio">${t(formatCOP(precioTotal(item.precioBase, item.impuesto) * linea.cantidad))}</strong>
  <button type="button" class="onb-icon-btn onb-borrar" ${FUERA} aria-label="Quitar">${ICO.basura}</button>
</div>`
}

function carrito(estado) {
  const { totalItems, subtotal, impuesto, total } = totalesVenta(estado)
  const item = estado.item
  const lineas = item && estado.ventaLineas.length
    ? estado.ventaLineas.map((l, i) => lineaCarrito(item, l, i)).join('')
    : '<p class="onb-vacio">Toca un producto para agregarlo a la venta.</p>'
  const tope = estado.topeAlcanzado && item
    ? `<p class="onb-aviso">Solo tienes ${t(miles(item.existencias))} unidades en existencia.</p>`
    : ''
  return `<aside class="onb-carrito">
  <div class="onb-grid-2">
    <div class="onb-campo"><label class="onb-label">Resolución <span class="onb-req">*</span></label><div class="onb-input onb-input-fijo">Resolución DEMO - 18760000001</div></div>
    <div class="onb-campo"><label class="onb-label">Lista de precios <span class="onb-req">*</span></label><div class="onb-input onb-input-fijo">$ General</div></div>
  </div>
  <div class="onb-input onb-input-fijo">${ICO.clientes} Consumidor final</div>
  <div class="onb-lineas" data-onb="carrito-lineas">${lineas}${tope}</div>
  <div class="onb-totales">
    <div class="onb-vaciar"><span ${FUERA}>VACIAR</span></div>
    <p><span>Total ítems ${t(totalItems)}</span></p>
    <p><span>Subtotal</span><span>${t(formatCOP(subtotal))}</span></p>
    <p><span>Descuento</span><span></span></p>
    <p><span>${t(item ? etiquetaImpuesto(item.impuesto) : 'Impuesto')}</span><span>${t(formatCOP(impuesto))}</span></p>
  </div>
  <button type="button" class="onb-btn onb-btn-primario onb-btn-vender" data-onb="btn-vender" data-action="btn-vender">Vender ${t(formatCOP(total))}</button>
</aside>`
}

export function pos(estado) {
  const productos = []
  if (estado.item) {
    const it = estado.item
    productos.push(tarjetaProducto({ codigo: it.codigo, nombre: it.nombre, precio: precioTotal(it.precioBase, it.impuesto) }, true))
  }
  for (const r of ITEMS_RELLENO) productos.push(tarjetaProducto(r, false))
  return `<div class="onb-pos">
  <section class="onb-pos-izq">
    <div class="onb-pos-barra"><span class="onb-orden">Orden #1 ${ICO.caret}</span><span class="onb-link" ${FUERA}>${ICO.mas}Agregar orden</span></div>
    <label class="onb-buscador">${ICO.lupa}<input class="onb-input-limpio" type="text" placeholder="Buscar por nombre, código, descripción o referencia..."></label>
    <div class="onb-productos">${productos.join('')}</div>
  </section>
  ${carrito(estado)}
</div>`
}

function resumenVenta(estado) {
  const { subtotal, impuesto, total } = totalesVenta(estado)
  return `<section class="onb-panel">
  <h2 class="onb-panel-titulo">Resumen de venta</h2>
  <p class="onb-total-grande">${t(formatCOP(total))}</p>
  <div class="onb-totales">
    <p><span>Subtotal</span><span>${t(formatCOP(subtotal))}</span></p>
    <p><span>Descuento - 0 %</span><span>$ 0</span></p>
    <p><span>${t(etiquetaImpuesto(estado.item?.impuesto))}</span><span>${t(formatCOP(impuesto))}</span></p>
    <p class="onb-total-fila"><span>Total</span><span>${t(formatCOP(total))}</span></p>
  </div>
</section>`
}

// Panel lateral sobre el POS. `pie` son los botones de abajo.
function drawer(estado, contenido, pie, ancho = 'onb-drawer-ancho') {
  return `<div class="onb-con-drawer">${pos(estado)}<div class="onb-velo"></div>
<aside class="onb-drawer ${ancho}"><div class="onb-drawer-cuerpo">${contenido}</div><div class="onb-drawer-pie">${pie}</div></aside></div>`
}

function iconoMetodo(nombre) {
  return `<span class="onb-metodo-ico">${t(nombre.slice(0, 2).toUpperCase())}</span>`
}

export function pago(estado) {
  const metodos = METODOS_PAGO_VENTA.map(m => {
    const attrs = m === 'Efectivo' ? 'data-onb="metodo-efectivo" data-action="metodo-efectivo"' : FUERA
    return `<button type="button" class="onb-metodo" ${attrs}>${iconoMetodo(m)}<span>${t(m)}</span></button>`
  }).join('')
  const panel = `${resumenVenta(estado)}
<section class="onb-panel">
  <h2 class="onb-panel-titulo onb-chico">Método de pago</h2>
  <div class="onb-metodos">${metodos}</div>
  <h3 class="onb-panel-titulo onb-chico">Datos opcionales</h3>
  <div class="onb-campo"><label class="onb-label">Fecha Vencimiento</label>${input({ valor: new Date().toISOString().slice(0, 10), readonly: true })}</div>
  <div class="onb-campo"><label class="onb-label">Vendedor</label>${input({ placeholder: 'Buscar...' })}</div>
  <div class="onb-campo"><label class="onb-label">Notas</label><textarea class="onb-input onb-textarea" placeholder="Ingresa una nota o referencia que aparecerá impresa en la factura"></textarea></div>
</section>`
  const pie = boton('Cancelar', { clase: 'onb-btn-secundario' }) + boton('Pagar', { clase: 'onb-btn-primario onb-btn-apagado' })
  return drawer(estado, panel, pie)
}

export function opcionesRapidas(total) {
  const decena = Math.ceil(total / 10000) * 10000
  const cien = Math.ceil(total / 100000) * 100000
  const valores = [total, decena, decena + 10000, cien > decena + 10000 ? cien : cien + 100000]
  return [...new Set(valores)]
}

export function pagoEfectivo(estado, borrador) {
  const { total } = totalesVenta(estado)
  const recibido = borrador.recibido ?? miles(total)
  const recibidoNum = parseMonto(recibido)
  const chips = opcionesRapidas(total).map(v =>
    `<button type="button" class="onb-chip${v === recibidoNum ? ' onb-chip-activo' : ''}" data-action="opcion-rapida" data-valor="${v}">${t(formatCOP(v))}</button>`).join('')
  const panel = `${resumenVenta(estado)}
<section class="onb-panel">
  <h2 class="onb-panel-titulo onb-chico"><button type="button" class="onb-atras" ${FUERA} aria-label="Volver">${ICO.atras}</button>Efectivo</h2>
  ${input({ ancla: 'recibido', valor: recibido, modo: 'numeric' })}
  <p class="onb-centro"><span class="onb-link" ${FUERA}>Cambiar método de pago</span></p>
  <p class="onb-label-suave">Opciones Rápidas</p>
  <div class="onb-chips" data-onb="opciones-rapidas">${chips}</div>
</section>`
  const pie = boton('Cancelar', { clase: 'onb-btn-secundario' }) + boton('Pagar', { accion: 'btn-pagar', ancla: 'btn-pagar' })
  return drawer(estado, panel, pie)
}

export function ventaOk(estado) {
  const total = estado.venta?.total ?? totalesVenta(estado).total
  const contenido = `<div class="onb-venta-ok" data-onb="venta-completada">
  <h2 class="onb-panel-titulo onb-chico onb-centro">Venta Completada</h2>
  <span class="onb-check-ok">${ICO.check}</span>
  <p class="onb-total-grande onb-centro">${t(formatCOP(total))}</p>
  <div class="onb-campo"><label class="onb-label">Escribe un correo electrónico</label><div class="onb-fila-campo">${input({ placeholder: 'correo@ejemplo.com' })}<span class="onb-link" ${FUERA}>${ICO.correo}Enviar</span></div></div>
  <div class="onb-campo"><label class="onb-label">Escribe el número de teléfono del cliente</label><div class="onb-fila-campo">${input({ placeholder: 'Ingrese el número de teléfono' })}<span class="onb-link" ${FUERA}>Enviar</span></div></div>
  <p class="onb-centro onb-negrita">o busca en tus contactos guardados en WhatsApp</p>
  <p class="onb-centro"><span class="onb-link" ${FUERA}>Abrir caja registradora</span></p>
</div>`
  const pie = boton('Imprimir factura', { clase: 'onb-btn-secundario' }) + boton('Nueva venta')
  return drawer(estado, contenido, pie, 'onb-drawer-angosto')
}
