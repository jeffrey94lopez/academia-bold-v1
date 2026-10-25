// js/onboarding-screens-items.js — HOME, Lista de ítems, Crear ítem y Flujo
// de inventario de la réplica de Bold POS. Cada pantalla: estado → HTML.

import {
  IMPUESTOS, formatCOP, parseMonto, precioTotal, movimientosInventario,
} from './onboarding-state.js'
import {
  t, miles, fechaHora, ICO, FUERA, SUCURSAL, NEGOCIO, error, etiqueta, input, select,
  campo, switchVisual, boton, encabezado, botonEjemplo,
} from './onboarding-screens-ui.js'

// Ítems de relleno para que la lista se vea como una cuenta real.
export const ITEMS_RELLENO = [
  { codigo: 'I-DEMO-0002', nombre: 'Cable cargador', precio: 14280, existencia: 25 },
  { codigo: 'I-DEMO-0003', nombre: 'Gaseosa 400 ml', precio: 3500, existencia: 48 },
  { codigo: 'I-DEMO-0004', nombre: 'Cuaderno argollado', precio: 8900, existencia: 30 },
  { codigo: 'I-DEMO-0005', nombre: 'Audífonos', precio: 45000, existencia: 12 },
]

export function existenciaActual(item) {
  return typeof item.existenciasFinal === 'number' ? item.existenciasFinal : item.existencias
}

export function inicio() {
  const tarjeta = (titulo, valor) => `<div class="onb-card onb-kpi"><span>${t(titulo)}</span><strong>${t(valor)}</strong></div>`
  return `<div class="onb-pagina">
  ${encabezado(`Hola, ${NEGOCIO}`)}
  <p class="onb-sub">Este es el resumen de tu negocio hoy.</p>
  <div class="onb-kpis">${tarjeta('Ventas del día', '$ 0')}${tarjeta('Gastos del día', '$ 0')}${tarjeta('Facturas emitidas', '0')}${tarjeta('Ítems activos', '4')}</div>
  <div class="onb-card onb-vacio">Cuando empieces a vender, aquí verás tus ventas por hora y tus ítems más vendidos.</div>
</div>`
}

function filaItem({ codigo, nombre, precio, existencia, cliente }) {
  const onb = a => (cliente ? ` data-onb="${a}"` : '')
  const editar = cliente ? 'data-action="btn-editar"' : FUERA
  return `<tr class="onb-fila-item${cliente ? ' onb-fila-cliente' : ''}"${onb('fila-item-cliente')}>
  <td class="onb-muted">${t(codigo)}</td>
  <td><strong>${t(nombre)}</strong></td>
  <td class="onb-muted">—</td>
  <td>${t(formatCOP(precio))}</td>
  <td>${t(miles(existencia))} Unidades</td>
  <td>Producto</td>
  <td>${switchVisual(true, cliente ? 'data-onb="switch-activo" data-action="switch-activo"' : FUERA)}</td>
  <td><button type="button" class="onb-icon-btn" ${editar}${onb('btn-editar')} aria-label="Editar">${ICO.lapiz}</button></td>
</tr>`
}

export function itemsLista(estado) {
  const filas = []
  if (estado.item) {
    const it = estado.item
    filas.push(filaItem({
      codigo: it.codigo, nombre: it.nombre, precio: precioTotal(it.precioBase, it.impuesto),
      existencia: existenciaActual(it), cliente: true,
    }))
  }
  for (const r of ITEMS_RELLENO) filas.push(filaItem(r))
  const total = filas.length
  return `<div class="onb-pagina">
  ${encabezado('Lista de ítems', boton('Nuevo ítem', { accion: 'btn-nuevo-item', ancla: 'btn-nuevo-item', icono: ICO.mas }))}
  <div class="onb-filtros">
    <label class="onb-buscador" data-onb="buscador-items">${ICO.lupa}<input class="onb-input-limpio" type="text" placeholder="Buscar por nombre, código o referencia"></label>
    <div class="onb-filtro">Todas las categorías ${ICO.caret}</div>
    <div class="onb-filtro">Estado ${ICO.caret}</div>
  </div>
  <p class="onb-mostrando">Mostrando ${total} de ${total}</p>
  <div class="onb-card onb-tabla-wrap"><table class="onb-tabla">
    <thead><tr><th>Código</th><th>Nombre/Descripción</th><th>Referencia</th><th>Precio</th><th data-onb="col-existencia">Existencia</th><th>Tipo</th><th>Activo</th><th></th></tr></thead>
    <tbody>${filas.join('')}</tbody>
  </table></div>
</div>`
}

const ERROR_ITEM = { 'f-nombre': 'nombre', 'f-precio-base': 'precioBase', 'f-impuesto': 'impuesto', 'f-existencias': 'existencias' }

function totalBorrador(b) {
  const base = parseMonto(b['f-precio-base'])
  const imp = IMPUESTOS.find(i => i.id === b['f-impuesto'])
  return base !== null && imp ? miles(precioTotal(base, imp.id)) : ''
}

export function itemCrear(estado, errores, b) {
  const err = ancla => error(errores, ERROR_ITEM[ancla])
  const inv = ancla => Boolean(errores?.[ERROR_ITEM[ancla]])
  const conExistencias = b['f-existencias-toggle'] === 'on'
  const botones = botonEjemplo()
    + boton('Cancelar', { clase: 'onb-btn-secundario' })
    + boton('Crear ítem', { accion: 'btn-crear-item', ancla: 'btn-crear-item' })

  const general = `<section class="onb-card onb-form">
  <h2 class="onb-h2">Información general</h2>
  ${campo(etiqueta('Nombre del ítem', true) + input({ ancla: 'f-nombre', valor: b['f-nombre'], placeholder: 'Ej: Camiseta básica', invalido: inv('f-nombre') }) + err('f-nombre'))}
  ${campo(etiqueta('Categoría', true) + `<div class="onb-fila-campo">${select({ opciones: [{ value: 'General', label: 'General' }], valor: 'General', disabled: true })}<span class="onb-link" ${FUERA}>Agregar</span></div>`)}
  ${campo(etiqueta('Descripción') + `<textarea class="onb-input onb-textarea" placeholder="Escribe la descripción del ítem"></textarea>`)}
  <div class="onb-grid-2">
    ${campo(etiqueta('Código') + input({ placeholder: 'Bold lo genera al guardar' }))}
    ${campo(etiqueta('Unidad', true) + select({ opciones: [{ value: 'Unidades', label: 'Unidades' }], valor: 'Unidades', disabled: true }))}
  </div>
  ${campo(etiqueta('Referencia') + input({ placeholder: 'Ingresa una referencia' }) + '<p class="onb-ayuda">Aparece en el comprobante de venta</p>')}
</section>`

  const precio = `<section class="onb-card onb-form">
  <h2 class="onb-h2">Precio total de venta</h2>
  <div class="onb-precio-fila">
    ${campo(etiqueta('Precio base', true) + input({ ancla: 'f-precio-base', valor: b['f-precio-base'], placeholder: 'Ej: 20000', invalido: inv('f-precio-base'), modo: 'numeric' }) + err('f-precio-base'))}
    <span class="onb-operador">+</span>
    ${campo(etiqueta('Impuesto', true) + select({ ancla: 'f-impuesto', opciones: IMPUESTOS.map(i => ({ value: i.id, label: i.label })), valor: b['f-impuesto'] || '', placeholder: 'Ej: IVA - 19.00%', invalido: inv('f-impuesto') }) + err('f-impuesto'))}
    <span class="onb-operador">=</span>
    ${campo(etiqueta('Precio total de venta', true) + `<div class="onb-input onb-input-calculado" data-onb="f-total">${t(totalBorrador(b))}</div>`)}
  </div>
  ${campo(etiqueta('Costo') + input({ ancla: 'f-costo', valor: b['f-costo'], placeholder: 'Ej: 12000', modo: 'numeric' }) + '<p class="onb-ayuda">Ingresa el valor que te cuesta este ítem</p>')}
  <hr class="onb-hr">
  ${campo(etiqueta('Listas de precios') + switchVisual(false, FUERA))}
</section>`

  // Ruling B: una sola sucursal ficticia, marcada sola al activar existencias.
  const disponibilidad = `<section class="onb-card onb-form">
  <div class="onb-imagen">${ICO.imagen}</div>
  <button type="button" class="onb-btn onb-btn-gris" ${FUERA}>${ICO.mas}Agregar imagen</button>
</section>
<section class="onb-card onb-form">
  <h2 class="onb-h2">Disponibilidad</h2>
  <p class="onb-label">Ítem con existencias (Unidades)</p>
  <button type="button" class="onb-switch-btn" data-onb="f-existencias-toggle" data-action="f-existencias-toggle" aria-pressed="${conExistencias}">${switchVisual(conExistencias)}</button>
  <p class="onb-ayuda">Al activar, puedes agregar la disponibilidad del ítem por sucursal.</p>
  <div class="onb-sucursales${conExistencias ? '' : ' onb-bloqueado'}">
    <p class="onb-h3">Sucursales con disponibilidad <span class="onb-req">*</span></p>
    <label class="onb-check"><input type="checkbox" disabled${conExistencias ? ' checked' : ''}> ${t(SUCURSAL)}</label>
    ${campo(etiqueta('Existencias (Unidades)', true) + input({ ancla: 'f-existencias', valor: b['f-existencias'], placeholder: 'Ej: 10', invalido: inv('f-existencias'), disabled: !conExistencias, modo: 'numeric' }) + err('f-existencias'))}
  </div>
</section>`

  return `<div class="onb-pagina">
  ${encabezado('Crear ítem', botones, { atras: true })}
  <div class="onb-form-layout"><div class="onb-form-col">${general}${precio}</div><div class="onb-form-lado">${disponibilidad}</div></div>
</div>`
}

export function flujo(estado) {
  const it = estado.item
  const movs = movimientosInventario(estado)
  const fechaBase = estado.venta?.fecha
  // Bold lista lo más reciente arriba: la salida por la venta antes que la entrada.
  const filas = movs.slice().reverse().map(m => {
    const salida = m.tipo === 'Salida'
    const ancla = salida ? 'ledger-salida' : 'ledger-entrada'
    return `<tr class="${salida ? 'onb-fila-roja' : ''}" data-onb="${ancla}">
  <td>${t(fechaHora(salida ? fechaBase : it.creado))}</td>
  <td>${t(it.nombre)}</td>
  <td>${t(it.categoria)}</td>
  <td>${t(m.tipo)}</td>
  <td>${t(miles(m.cantidad))} Unidades</td>
  <td>${t(SUCURSAL)}</td>
  <td>${t(formatCOP(it.costo ?? 0))}</td>
  <td>${t(miles(m.existencia))} Unidades</td>
  <td>Tú</td>
</tr>`
  })
  const cuerpo = filas.length
    ? filas.join('')
    : '<tr><td colspan="9" class="onb-vacio">Todavía no hay movimientos de inventario.</td></tr>'
  return `<div class="onb-pagina">
  ${encabezado('Flujo de inventario')}
  <div class="onb-filtros">
    <div class="onb-filtro">Todas las sucursales ${ICO.caret}</div>
    <div class="onb-filtro">Todos los ítems ${ICO.caret}</div>
    <div class="onb-filtro">Últimos 90 días ${ICO.calendario}</div>
  </div>
  <div class="onb-centro">${boton('IMPRIMIR', { clase: 'onb-btn-navy onb-btn-chico' })}${boton('EXPORTAR', { clase: 'onb-btn-chico' })}</div>
  <p class="onb-mostrando">Mostrando ${movs.length} de ${movs.length}</p>
  <div class="onb-card onb-tabla-wrap"><table class="onb-tabla">
    <thead><tr><th>Fecha</th><th>Producto</th><th>Categoría</th><th>Transacción</th><th>Cantidad</th><th>Sucursal</th><th>Costo</th><th>Existencia</th><th>Usuario</th></tr></thead>
    <tbody>${cuerpo}</tbody>
  </table></div>
</div>`
}
