// js/onboarding-screens-historial.js — Gastos (lista, nuevo, detalle) y
// Facturas de Venta (lista, detalle) de la réplica de Bold POS.

import {
  IMPUESTOS, CATEGORIAS_GASTO, METODOS_PAGO, formatCOP, precioTotal, totalesVenta,
} from './onboarding-state.js'
import {
  t, fecha, fechaHora, ICO, FUERA, NEGOCIO, SUCURSAL, error, etiqueta, input, select,
  campo, switchVisual, boton, encabezado, botonEjemplo,
} from './onboarding-screens-ui.js'

const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEPT', 'OCT', 'NOV', 'DIC']

function etiquetaEstado(texto, tono = 'verde') {
  return `<span class="onb-tag onb-tag-${tono}">${t(texto)}</span>`
}

export function gastosLista(estado) {
  const g = estado.gasto
  const filas = g
    ? `<tr><td class="onb-opc"><span class="onb-miniatura">${ICO.imagen}</span></td><td>${t(g.numero)}</td><td class="onb-muted onb-opc">—</td><td>${t(fechaHora(g.fecha))}</td><td>${t(g.categoria)}</td><td>${t(formatCOP(g.valor))}</td><td>${etiquetaEstado('Ingresado')}</td></tr>`
    : '<tr><td colspan="7" class="onb-vacio">Todavía no has registrado gastos.</td></tr>'
  return `<div class="onb-pagina">
  ${encabezado('Gastos', boton('Nuevo gasto', { accion: 'btn-nuevo-gasto', ancla: 'btn-nuevo-gasto', icono: ICO.mas }))}
  <div class="onb-filtros">
    <label class="onb-buscador">${ICO.lupa}<input class="onb-input-limpio" type="text" placeholder="Buscar código del gasto"></label>
    <div class="onb-filtro">${ICO.clientes} Proveedor ${ICO.caret}</div>
  </div>
  <div class="onb-filtros">
    <div class="onb-filtro">${ICO.sucursal} Sucursal ${ICO.caret}</div>
    <div class="onb-filtro">Estado ${ICO.caret}</div>
    <div class="onb-filtro">Fecha del gasto ${ICO.calendario}</div>
  </div>
  <p class="onb-mostrando">Mostrando ${g ? 1 : 0} de ${g ? 1 : 0}</p>
  <div class="onb-card onb-tabla-wrap"><table class="onb-tabla">
    <thead><tr><th class="onb-opc"></th><th>No. Gasto</th><th class="onb-opc">Proveedor</th><th>Fecha del gasto</th><th>Categoría</th><th>Valor total</th><th>Estado</th></tr></thead>
    <tbody>${filas}</tbody>
  </table></div>
</div>`
}

const ERROR_GASTO = { 'g-metodo': 'metodo', 'g-categoria': 'categoria', 'g-valor': 'valor' }

export function gastoCrear(estado, errores, b) {
  const err = a => error(errores, ERROR_GASTO[a])
  const inv = a => Boolean(errores?.[ERROR_GASTO[a]])
  const opciones = lista => lista.map(x => ({ value: x, label: x }))
  const mas = `<span class="onb-mas-cuadro" ${FUERA}>${ICO.mas}</span>`
  const botones = botonEjemplo()
    + boton('Cancelar', { clase: 'onb-btn-secundario' })
    + boton('Crear gasto', { accion: 'btn-crear-gasto', ancla: 'btn-crear-gasto' })
  return `<div class="onb-pagina">
  ${encabezado('Nuevo gasto', botones, { atras: true })}
  <div class="onb-form-layout"><div class="onb-form-col">
    <section class="onb-card onb-form onb-sucursal-card"><small>${t(NEGOCIO)}</small><strong>${t(SUCURSAL)}</strong></section>
    <section class="onb-card onb-form"><div class="onb-grid-2">
      ${campo(etiqueta('Proveedor') + `<div class="onb-fila-campo">${select({ opciones: [], disabled: true })}${mas}</div>`)}
      ${campo(etiqueta('Método de Pago', true) + `<div class="onb-fila-campo">${select({ ancla: 'g-metodo', opciones: opciones(METODOS_PAGO), valor: b['g-metodo'] || '', placeholder: 'Ej: Efectivo', invalido: inv('g-metodo') })}${mas}</div>` + err('g-metodo'))}
      ${campo(etiqueta('Categoría', true) + `<div class="onb-fila-campo">${select({ ancla: 'g-categoria', opciones: opciones(CATEGORIAS_GASTO), valor: b['g-categoria'] || '', placeholder: 'Ej: Servicios públicos', invalido: inv('g-categoria') })}${mas}</div>` + err('g-categoria'))}
      ${campo(etiqueta('Valor del gasto', true) + input({ ancla: 'g-valor', valor: b['g-valor'], placeholder: 'Ej: 50000', invalido: inv('g-valor'), modo: 'numeric' }) + err('g-valor'))}
      ${campo(etiqueta('Fecha del gasto', true) + input({ valor: fecha(), readonly: true }))}
      ${campo(etiqueta('Asociar al turno No. 1') + switchVisual(true, 'data-onb="g-turno"'))}
      ${campo(etiqueta('Observaciones (opcional)') + `<textarea class="onb-input onb-textarea" name="g-observaciones" data-onb="g-observaciones" placeholder="Ej: Recibo de luz">${t(b['g-observaciones'])}</textarea>`)}
      ${campo(etiqueta('Nota interna (opcional)') + '<textarea class="onb-input onb-textarea" placeholder="Agrega comentarios asociados al gasto"></textarea>')}
    </div></section>
  </div><div class="onb-form-lado">
    <section class="onb-card onb-form"><div class="onb-imagen">${ICO.imagen}</div><button type="button" class="onb-btn onb-btn-gris" ${FUERA}>${ICO.mas}Agregar imagen</button></section>
  </div></div>
</div>`
}

export function gastoDetalle(estado) {
  const g = estado.gasto
  if (!g) return `<div class="onb-pagina">${encabezado('Gasto')}<div class="onb-card onb-vacio" data-onb="gasto-detalle">Todavía no has registrado gastos.</div></div>`
  const dato = (k, v) => `<div class="onb-dato"><span>${t(k)}</span><strong>${t(v)}</strong></div>`
  return `<div class="onb-pagina">
  ${encabezado(`Gasto No. ${g.numero}`, etiquetaEstado('Ingresado'), { atras: true })}
  <section class="onb-card onb-form" data-onb="gasto-detalle">
    <div class="onb-grid-2">
      ${dato('Sucursal', SUCURSAL)}${dato('Proveedor', '—')}
      ${dato('Método de Pago', g.metodo)}${dato('Categoría', g.categoria)}
      ${dato('Valor del gasto', formatCOP(g.valor))}${dato('Fecha del gasto', fechaHora(g.fecha))}
      ${dato('Asociado al turno', g.turno ? 'Turno No. 1' : 'No')}${dato('Observaciones', g.observaciones || '—')}
    </div>
  </section>
</div>`
}

const FILTROS_FACTURAS = ['Estado DIAN', 'Forma de Pago', 'Estado de Pago', 'Todos los clientes']

export function facturasLista(estado) {
  const v = estado.venta
  let filas = '<p class="onb-vacio">Todavía no tienes ventas.</p>'
  if (v) {
    const d = new Date(v.fecha)
    filas = `<button type="button" class="onb-factura" data-onb="factura-cliente" data-action="factura-cliente">
  <span class="onb-factura-dia"><strong>${t(d.getDate())}</strong><small>${t(MESES[d.getMonth()])} ${t(d.getFullYear())}</small></span>
  <span class="onb-factura-info"><strong>No. - ${t(v.numero)}</strong><span>Consumidor final</span><span>Fecha de Emisión: ${t(fechaHora(v.fecha))}</span><span>Fecha Vencimiento: ${t(fechaHora(v.fecha))}</span></span>
  <span class="onb-factura-der"><span>${etiquetaEstado('Aceptada')}${etiquetaEstado('Contado')}${etiquetaEstado('Pagada')}</span><strong class="onb-verde">Total: ${t(formatCOP(v.total))}</strong><strong>Saldo: $ 0</strong></span>
</button>`
  }
  return `<div class="onb-pagina">
  ${encabezado('Facturas de Venta', boton('NUEVO', { clase: 'onb-btn-chico' }))}
  <div class="onb-filtros-grid" data-onb="filtros-facturas">
    ${input({ placeholder: 'Buscar por código' })}
    ${FILTROS_FACTURAS.map(f => `<div class="onb-filtro">${t(f)} ${ICO.caret}</div>`).join('')}
    <div class="onb-filtro">Últimos 90 días ${ICO.calendario}</div>
  </div>
  <p class="onb-mostrando">Mostrando ${v ? 1 : 0} de ${v ? 1 : 0}</p>
  <div class="onb-card">${filas}</div>
</div>`
}

export function facturaDetalle(estado) {
  const v = estado.venta
  const it = estado.item
  if (!v || !it) return `<div class="onb-pagina">${encabezado('Factura de Venta')}<div class="onb-card onb-vacio" data-onb="factura-detalle">Todavía no tienes ventas.</div></div>`
  const imp = IMPUESTOS.find(i => i.id === it.impuesto)
  const unitario = precioTotal(it.precioBase, it.impuesto)
  const { totalItems, subtotal, impuesto } = totalesVenta(estado)
  const lineas = estado.ventaLineas.map(l => `<tr><td>${t(l.cantidad)}</td><td><span class="onb-rojo">${t(it.codigo)}</span> - ${t(it.nombre)}</td><td class="onb-opc">${t(formatCOP(it.precioBase))}</td><td class="onb-opc">0 %</td><td class="onb-opc">${t(imp?.label ?? '')}</td><td>${t(formatCOP(unitario * l.cantidad))}</td></tr>`).join('')
  const acciones = ['IMPRIMIR', 'ENVIAR', 'NUEVO', 'VERIFICA EN LA DIAN'].map(a => boton(a, { clase: 'onb-btn-gris onb-btn-mini' })).join('')
  return `<div class="onb-pagina">
  <div class="onb-tags-cab" data-onb="factura-detalle">${etiquetaEstado('Aceptada')}${etiquetaEstado('Contado')}${etiquetaEstado('Pagada')}</div>
  ${encabezado(`Factura de Venta No. ${v.numero}`)}
  <div class="onb-acciones onb-izq">${acciones}</div>
  <div class="onb-factura-cab">
    <div class="onb-muted">Cliente: <span class="onb-rojo">Consumidor final</span><br>Sucursal: ${t(SUCURSAL)}<br>Fecha de Emisión: ${t(fechaHora(v.fecha))}<br>Método de pago: ${t(v.metodo)}<br><br>Cufe: demo-0000-practica-sin-validez-ante-la-dian</div>
    <div class="onb-muted onb-der"><strong>${t(NEGOCIO)}</strong><br>Registrada en Turno No. 1</div>
  </div>
  <div class="onb-card onb-tabla-wrap"><table class="onb-tabla">
    <thead><tr><th>Cantidad</th><th>Item</th><th class="onb-opc">Precio Unit.</th><th class="onb-opc">Descuento</th><th class="onb-opc">Impuesto</th><th>Total</th></tr></thead>
    <tbody>${lineas}</tbody>
  </table><p class="onb-muted onb-pad">Total items: ${t(totalItems)}</p>
  <div class="onb-totales onb-totales-der">
    <p><span>Subtotal</span><span>${t(formatCOP(subtotal))}</span></p>
    <p><span>Descuento</span><span>$ 0</span></p>
    <p><span>${t(imp?.label ?? 'Impuesto')}</span><span>${t(formatCOP(impuesto))}</span></p>
    <p class="onb-total-fila"><span>Total</span><span>${t(formatCOP(v.total))}</span></p>
  </div></div>
  <div class="onb-card onb-tabla-wrap"><p class="onb-centro onb-muted">Recibos</p><table class="onb-tabla">
    <thead><tr><th class="onb-opc">Código</th><th>Estado</th><th>Total</th><th>Método de pago</th><th class="onb-opc">Fecha</th></tr></thead>
    <tbody><tr><td class="onb-rojo onb-opc">1</td><td>${etiquetaEstado('Pagada')}</td><td>${t(formatCOP(v.total))}</td><td>${t(v.metodo)}</td><td class="onb-opc">${t(fechaHora(v.fecha))}</td></tr></tbody>
  </table></div>
</div>`
}
