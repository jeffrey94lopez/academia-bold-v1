// js/onboarding-state.js — estado y reglas de negocio del recorrido guiado.
//
// Módulo puro, sin DOM: lo reutilizan los pasos, las pantallas y el
// controlador del simulador (ver tasks 2-4). Los números y textos de abajo
// (números demo, impuestos, categorías) son los exactos del spec: no
// inventar variantes.

// Impuestos de Bold POS retail, con los labels y porcentajes exactos del
// spec (Global Constraints).
export const IMPUESTOS = [
  { id: 'exento', label: 'Exento', pct: 0 },
  { id: 'iva5', label: 'IVA - 5.00%', pct: 5 },
  { id: 'iva19', label: 'IVA - 19.00%', pct: 19 },
  { id: 'excluido', label: 'Excluido', pct: 0 },
  { id: 'inc8', label: 'INC - 8.00%', pct: 8 },
]

export const CATEGORIAS_GASTO = [
  'Servicios públicos', 'Transporte', 'Nómina', 'Aseo', 'Mantenimiento y reparaciones', 'Arriendo',
]

export const METODOS_PAGO = ['Bold', 'Efectivo', 'Credibanco', 'Nequi', 'Sistecredito', 'QR']

export const EJEMPLO_ITEM = {
  nombre: 'Camiseta básica', precioBase: '20000', impuesto: 'iva19', costo: '12000', existencias: '10',
}

export const EJEMPLO_GASTO = {
  metodo: 'Efectivo', categoria: 'Servicios públicos', valor: '50000', observaciones: 'Recibo de luz',
}

function impuestoPct(impuestoId) {
  return IMPUESTOS.find(i => i.id === impuestoId)?.pct ?? 0
}

// Monto como lo muestra Bold: signo, espacio, coma de miles, sin decimales.
export function formatCOP(n) {
  return `$ ${Math.round(n).toLocaleString('en-US')}`
}

// Acepta lo que un usuario colombiano escribiría: "20000", "20,000" o
// "20.000" (el punto es separador de miles, no decimal). Cualquier otra
// cosa, vacío o ≤0 es inválido.
export function parseMonto(s) {
  if (s === null || s === undefined) return null
  const limpio = String(s).trim().replace(/[.,]/g, '')
  if (!/^\d+$/.test(limpio)) return null
  const n = Number(limpio)
  return n > 0 ? n : null
}

export function precioTotal(base, impuestoId) {
  return Math.round(base * (1 + impuestoPct(impuestoId) / 100))
}

export function crearEstadoInicial(runId) {
  return {
    v: 1, runId, step: 'bienvenida', sub: 0, completed: false,
    item: null, ventaLineas: [], venta: null, gasto: null,
  }
}

function requerido(valor) {
  return valor === null || valor === undefined || String(valor).trim() === ''
}

export function validarItem(draft) {
  const errores = {}
  if (requerido(draft.nombre)) errores.nombre = 'Este campo es requerido'
  if (requerido(draft.precioBase)) errores.precioBase = 'Este campo es requerido'
  else if (parseMonto(draft.precioBase) === null) errores.precioBase = 'Ingresa un valor mayor a 0'
  if (requerido(draft.impuesto)) errores.impuesto = 'Este campo es requerido'
  if (requerido(draft.existencias)) errores.existencias = 'Este campo es requerido'
  else if (parseMonto(draft.existencias) === null) errores.existencias = 'Ingresa un valor mayor a 0'
  return { ok: Object.keys(errores).length === 0, errores }
}

export function crearItem(estado, draft) {
  const costo = parseMonto(draft.costo)
  return {
    ...estado,
    item: {
      nombre: String(draft.nombre).trim().slice(0, 80),
      categoria: 'General',
      precioBase: parseMonto(draft.precioBase),
      impuesto: draft.impuesto,
      costo,
      existencias: parseMonto(draft.existencias),
      codigo: 'I-DEMO-0001',
      activo: true,
    },
  }
}

function unidadesEnVenta(ventaLineas) {
  return ventaLineas.reduce((acc, l) => acc + l.cantidad, 0)
}

// Igual que Bold: cada toque agrega una línea nueva (no suma cantidad a una
// existente), salvo que ya se haya topado en la existencia disponible.
export function agregarLinea(estado) {
  const existencias = estado.item?.existencias ?? 0
  if (unidadesEnVenta(estado.ventaLineas) >= existencias) {
    return { ...estado, topeAlcanzado: true }
  }
  return { ...estado, ventaLineas: [...estado.ventaLineas, { cantidad: 1 }] }
}

export function cambiarCantidad(estado, idx, cantidad) {
  const existencias = estado.item?.existencias ?? 0
  const otras = unidadesEnVenta(estado.ventaLineas.filter((_, i) => i !== idx))
  const tope = Math.max(1, existencias - otras)
  const limitada = Math.max(1, Math.min(cantidad, tope))
  return {
    ...estado,
    ventaLineas: estado.ventaLineas.map((l, i) => (i === idx ? { ...l, cantidad: limitada } : l)),
  }
}

export function totalesVenta(estado) {
  const base = estado.item?.precioBase ?? 0
  const pct = impuestoPct(estado.item?.impuesto)
  let totalItems = 0
  let subtotal = 0
  let impuesto = 0
  for (const linea of estado.ventaLineas) {
    totalItems += linea.cantidad
    subtotal += base * linea.cantidad
    impuesto += Math.round(base * linea.cantidad * pct / 100)
  }
  return { totalItems, subtotal, impuesto, total: subtotal + impuesto }
}

export function pagarVenta(estado, recibido) {
  const { total, totalItems } = totalesVenta(estado)
  const existencias = estado.item?.existencias ?? 0
  return {
    ...estado,
    item: { ...estado.item, existenciasFinal: existencias - totalItems },
    venta: { numero: 'DEMO-0001', metodo: 'Efectivo', recibido, total, fecha: new Date().toISOString() },
  }
}

export function movimientosInventario(estado) {
  if (!estado.item) return []
  const existencias = estado.item.existencias
  const movimientos = [{ tipo: 'Entrada', cantidad: existencias, existencia: existencias }]
  if (typeof estado.item.existenciasFinal === 'number') {
    const vendidos = existencias - estado.item.existenciasFinal
    movimientos.push({ tipo: 'Salida', cantidad: -vendidos, existencia: estado.item.existenciasFinal })
  }
  return movimientos
}

export function validarGasto(draft) {
  const errores = {}
  if (requerido(draft.metodo)) errores.metodo = 'Este campo es requerido'
  if (requerido(draft.categoria)) errores.categoria = 'Este campo es requerido'
  if (requerido(draft.valor)) errores.valor = 'Este campo es requerido'
  else if (parseMonto(draft.valor) === null) errores.valor = 'Ingresa un valor mayor a 0'
  return { ok: Object.keys(errores).length === 0, errores }
}

export function crearGasto(estado, draft) {
  return {
    ...estado,
    gasto: {
      numero: 1,
      metodo: draft.metodo,
      categoria: draft.categoria,
      valor: parseMonto(draft.valor),
      observaciones: draft.observaciones ?? '',
      turno: true,
      fecha: new Date().toISOString(),
    },
  }
}
