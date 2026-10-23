// js/onboarding-flow.js — qué le pasa al recorrido con cada acción del cliente.
//
// Módulo puro, sin DOM: el controlador (js/onboarding.js) solo traduce eventos
// del navegador a estas funciones y pinta el resultado. Aquí vive la regla de
// "qué reductor corre con qué clic" para poder probarla en Node; en el
// controlador solo queda lo que necesita el navegador (foco, timers, storage).
//
// El borrador (lo que el cliente va escribiendo en los formularios) viaja
// dentro del estado como `estado.borrador`, para que recargar a mitad de un
// formulario no le borre lo que escribió. cargarAvance tolera la clave extra.

import {
  IMPUESTOS, EJEMPLO_ITEM, EJEMPLO_GASTO, validarItem, crearItem, validarGasto, crearGasto,
  agregarLinea, cambiarCantidad, pagarVenta, totalesVenta, parseMonto, precioTotal, formatCOP,
} from './onboarding-state.js'
import { SUBPASOS, PASOS, TOTAL_PASOS, avanzar, subpasoActual, numeroPaso } from './onboarding-steps.js'

export const AVISO_FUERA = 'En este recorrido no vamos aquí'
export const TOAST_ITEM = 'El ítem fue creado exitosamente'
export const TOAST_GASTO = 'Se ha creado el gasto exitosamente'

// name del campo → clave de error que devuelven validarItem/validarGasto. La
// validación de un campo suelto reusa esos validadores para que el mensaje y
// la regla sean exactamente los mismos que al tocar "Crear".
const CAMPOS = {
  'f-nombre': ['item', 'nombre'],
  'f-precio-base': ['item', 'precioBase'],
  'f-impuesto': ['item', 'impuesto'],
  'f-existencias': ['item', 'existencias'],
  'g-metodo': ['gasto', 'metodo'],
  'g-categoria': ['gasto', 'categoria'],
  'g-valor': ['gasto', 'valor'],
}

export function claveError(nombre) {
  return CAMPOS[nombre]?.[1] ?? null
}

export function campoValido(nombre, valor) {
  const def = CAMPOS[nombre]
  if (!def) return true
  const [form, clave] = def
  // validarItem rechaza un impuesto vacío pero no uno inventado; el select
  // solo ofrece los reales, pero el borrador viene de localStorage.
  if (nombre === 'f-impuesto' && !IMPUESTOS.some(i => i.id === valor)) return false
  const { errores } = form === 'item' ? validarItem({ [clave]: valor }) : validarGasto({ [clave]: valor })
  return !errores[clave]
}

function borradorDe(estado) {
  return estado.borrador ?? {}
}

function conBorrador(estado, cambios) {
  return { ...estado, borrador: { ...borradorDe(estado), ...cambios } }
}

function sinClaves(estado, claves) {
  const b = { ...borradorDe(estado) }
  for (const k of claves) delete b[k]
  return { ...estado, borrador: b }
}

export function pantallaActual(estado) {
  if (estado.step === 'bienvenida' || estado.step === 'cierre') return estado.step
  return subpasoActual(estado)?.pantalla ?? 'cierre'
}

/**
 * Avanza los subpasos que el borrador ya cumple: campos válidos y el switch de
 * existencias ya encendido. Sin esto, quien llena el precio antes que el
 * nombre queda trabado en una burbuja que pide algo que ya hizo. Se detiene en
 * cualquier burbuja explicativa: esas las cierra el cliente con "Siguiente".
 */
export function ponerseAlDia(estado) {
  let e = estado
  for (let i = 0; i < 20; i++) {
    const s = subpasoActual(e)
    if (!s) return e
    const b = borradorDe(e)
    let siguiente = e
    if (s.avanza === 'campo' && campoValido(s.ancla, b[s.ancla])) {
      siguiente = avanzar(e, { tipo: 'campo', ancla: s.ancla, valido: true })
    } else if (s.ancla === 'f-existencias-toggle' && b['f-existencias-toggle'] === 'on') {
      siguiente = avanzar(e, { tipo: 'click', ancla: s.ancla })
    }
    if (siguiente === e) return e
    e = siguiente
  }
  return e
}

/** Guarda lo que el cliente escribe, sin avanzar (avanzar es al confirmar). */
export function escribirCampo(estado, nombre, valor) {
  return conBorrador(estado, { [nombre]: valor })
}

/**
 * El cliente terminó de editar un campo (change/Enter): avanza si es el que
 * pedía la burbuja y quedó válido. Se avanza al confirmar y no en cada tecla
 * porque, con la primera letra del nombre, la burbuja saltaría al precio
 * mientras todavía escribe.
 */
export function confirmarCampo(estado, nombre) {
  const valido = campoValido(nombre, borradorDe(estado)[nombre])
  return ponerseAlDia(avanzar(estado, { tipo: 'campo', ancla: nombre, valido }))
}

/**
 * Precio total del formulario de ítem mientras el cliente escribe ("23,800",
 * sin signo, como el campo calculado de Bold); '' si falta precio o impuesto.
 */
export function precioTotalBorrador(borrador = {}) {
  const base = parseMonto(borrador['f-precio-base'])
  const imp = IMPUESTOS.find(i => i.id === borrador['f-impuesto'])
  return base !== null && imp ? precioTotal(base, imp.id).toLocaleString('en-US') : ''
}

/** Cantidad escrita en una línea del carrito; vacío o no numérico no cambia nada. */
export function escribirCantidad(estado, idx, texto) {
  const n = parseInt(String(texto).trim(), 10)
  if (!Number.isFinite(n) || !estado.ventaLineas[idx]) return estado
  return cambiarCantidad(estado, idx, n)
}

/**
 * "Siguiente" de la burbuja. Solo cierra la burbuja explicativa que está a la
 * vista: avanzar() con 'siguiente' avanza cualquier subpaso de tipo info, así
 * que un clic tardío de una burbuja vieja no debe colarse.
 */
export function siguiente(estado, ancla) {
  const s = subpasoActual(estado)
  if (!s || s.ancla !== ancla || s.avanza !== 'info') return estado
  return ponerseAlDia(avanzar(estado, { tipo: 'siguiente' }))
}

export function empezar(estado) {
  if (estado.step !== 'bienvenida') return estado
  return { ...estado, step: PASOS[1], sub: 0 }
}

function vacioOInvalido(nombre, valor) {
  return valor === undefined || valor === null || String(valor).trim() === '' || !campoValido(nombre, valor)
}

/**
 * "Usar ejemplo": completa solo lo que está vacío o inválido (lo que el
 * cliente ya escribió es suyo y es lo que va a ver en el resto del recorrido)
 * y avanza las burbujas de campos que ya quedaron cumplidas.
 */
export function usarEjemplo(estado) {
  const pantalla = pantallaActual(estado)
  const b = borradorDe(estado)
  const cambios = {}
  const poner = (nombre, valor) => { if (vacioOInvalido(nombre, b[nombre])) cambios[nombre] = valor }
  if (pantalla === 'item-crear') {
    poner('f-nombre', EJEMPLO_ITEM.nombre)
    poner('f-precio-base', EJEMPLO_ITEM.precioBase)
    poner('f-impuesto', EJEMPLO_ITEM.impuesto)
    if (!b['f-costo']) cambios['f-costo'] = EJEMPLO_ITEM.costo
    poner('f-existencias', EJEMPLO_ITEM.existencias)
    cambios['f-existencias-toggle'] = 'on'
  } else if (pantalla === 'gasto-crear') {
    poner('g-metodo', EJEMPLO_GASTO.metodo)
    poner('g-categoria', EJEMPLO_GASTO.categoria)
    poner('g-valor', EJEMPLO_GASTO.valor)
    if (!b['g-observaciones']) cambios['g-observaciones'] = EJEMPLO_GASTO.observaciones
  } else {
    return estado
  }
  return ponerseAlDia(conBorrador(estado, cambios))
}

// Lleva el subpaso hasta `ancla` si está más adelante dentro del paso actual.
// Sirve a los botones "Crear": si el formulario ya está completo y válido, el
// cliente puede guardar aunque no haya cerrado todas las burbujas explicativas.
function saltarA(estado, ancla) {
  const idx = (SUBPASOS[estado.step] ?? []).findIndex(s => s.ancla === ancla)
  if (idx < 0 || idx < estado.sub) return null
  return { ...estado, sub: idx }
}

const CAMPOS_ITEM = ['f-nombre', 'f-precio-base', 'f-impuesto', 'f-costo', 'f-existencias', 'f-existencias-toggle']
const CAMPOS_GASTO = ['g-metodo', 'g-categoria', 'g-valor', 'g-observaciones']

function crearItemDesdeBorrador(estado) {
  const enCurso = saltarA(estado, 'btn-crear-item')
  if (!enCurso) return { estado, aviso: AVISO_FUERA }
  const b = borradorDe(estado)
  const conExistencias = b['f-existencias-toggle'] === 'on'
  const draft = {
    nombre: b['f-nombre'], precioBase: b['f-precio-base'], impuesto: b['f-impuesto'],
    costo: b['f-costo'], existencias: conExistencias ? b['f-existencias'] : '',
  }
  const { ok, errores } = validarItem(draft)
  if (!ok) {
    // El error de existencias quedaría debajo de un campo deshabilitado:
    // se enciende el switch para que el cliente lo pueda corregir.
    const e = errores.existencias && !conExistencias ? conBorrador(estado, { 'f-existencias-toggle': 'on' }) : estado
    return { estado: e, errores }
  }
  // Fecha de creación: la fila de Entrada del flujo de inventario la muestra;
  // sin ella saldría la hora de cada pintado, posterior a la venta.
  const conItem = crearItem(enCurso, draft)
  const creado = sinClaves({ ...conItem, item: { ...conItem.item, creado: new Date().toISOString() } }, CAMPOS_ITEM)
  return { estado: avanzar(creado, { tipo: 'click', ancla: 'btn-crear-item' }), errores: {}, toast: TOAST_ITEM }
}

function crearGastoDesdeBorrador(estado) {
  const enCurso = saltarA(estado, 'btn-crear-gasto')
  if (!enCurso) return { estado, aviso: AVISO_FUERA }
  const b = borradorDe(estado)
  const draft = { metodo: b['g-metodo'], categoria: b['g-categoria'], valor: b['g-valor'], observaciones: b['g-observaciones'] }
  const { ok, errores } = validarGasto(draft)
  if (!ok) return { estado, errores }
  const creado = sinClaves(crearGasto(enCurso, draft), CAMPOS_GASTO)
  return { estado: avanzar(creado, { tipo: 'click', ancla: 'btn-crear-gasto' }), errores: {}, toast: TOAST_GASTO }
}

function alternarExistencias(estado) {
  const encendido = borradorDe(estado)['f-existencias-toggle'] === 'on'
  let e = conBorrador(estado, { 'f-existencias-toggle': encendido ? '' : 'on' })
  if (!encendido) return ponerseAlDia(avanzar(e, { tipo: 'click', ancla: 'f-existencias-toggle' }))
  // Apagarlo deshabilita el campo de existencias: si la burbuja estaba ahí,
  // vuelve al switch para no pedir algo que no se puede escribir.
  if (subpasoActual(e)?.ancla === 'f-existencias') {
    e = { ...e, sub: SUBPASOS[e.step].findIndex(s => s.ancla === 'f-existencias-toggle') }
  }
  return e
}

function pagar(estado) {
  const { total } = totalesVenta(estado)
  const escrito = borradorDe(estado).recibido
  const recibido = escrito === undefined ? total : parseMonto(escrito)
  if (recibido === null || recibido < total) {
    return { estado, aviso: 'El valor recibido tiene que cubrir el total de la venta.' }
  }
  const pagado = sinClaves(pagarVenta(estado, recibido), ['recibido'])
  return { estado: avanzar(pagado, { tipo: 'click', ancla: 'btn-pagar' }) }
}

/**
 * Clic en un `[data-action]` de la réplica. Devuelve
 * `{ estado, errores?, aviso?, toast?, tope? }`:
 * - `errores` (si viene) reemplaza los errores visibles del formulario;
 * - `aviso` es un mensaje corto, `toast` la confirmación tipo Bold;
 * - `tope` dice que la venta se topó en las existencias. Se devuelve aparte
 *   y `topeAlcanzado` NO queda en el estado: el reductor nunca lo limpia, y
 *   guardado haría que el aviso siguiera saliendo en cada re-render.
 */
export function aplicarAccion(estado, accion, datos = {}) {
  switch (accion) {
    case 'usar-ejemplo':
      return { estado: usarEjemplo(estado), errores: {} }
    case 'f-existencias-toggle':
      return { estado: alternarExistencias(estado) }
    case 'opcion-rapida': {
      const valor = Number(datos.valor)
      if (!Number.isFinite(valor)) return { estado }
      return { estado: conBorrador(estado, { recibido: valor.toLocaleString('en-US') }) }
    }
    case 'cambiar-cantidad':
      // Es la casilla de cantidad: se maneja al escribir, no al hacer clic.
      return { estado }
    case 'producto-cliente': {
      const { topeAlcanzado, ...siguienteEstado } = agregarLinea(estado)
      return {
        estado: avanzar(siguienteEstado, { tipo: 'click', ancla: accion }),
        tope: Boolean(topeAlcanzado),
      }
    }
    case 'btn-vender':
      if (!estado.ventaLineas.length) return { estado, aviso: 'Toca tu producto para agregarlo antes de vender.' }
      break
    case 'btn-pagar':
      return pagar(estado)
    case 'btn-crear-item':
      return crearItemDesdeBorrador(estado)
    case 'btn-crear-gasto':
      return crearGastoDesdeBorrador(estado)
    case 'fuera-de-ruta':
      return { estado, aviso: AVISO_FUERA }
    default:
      break
  }
  // Ruling A: las anclas del menú (y cualquier otro clic con ancla) solo
  // cuentan cuando son lo que pide la burbuja; si no, son "fuera de ruta".
  const s = subpasoActual(estado)
  if (!s || s.avanza !== 'click' || s.ancla !== accion) return { estado, aviso: AVISO_FUERA }
  return { estado: ponerseAlDia(avanzar(estado, { tipo: 'click', ancla: accion })) }
}

/**
 * Efectos de pasar de `antes` a `despues`: qué pasos se completaron (para la
 * telemetría) y si se llegó al cierre (marca `completed` una sola vez).
 */
export function transicion(antes, despues) {
  const eventos = []
  let estado = despues
  if (antes.step !== despues.step && numeroPaso(antes.step) !== null) {
    eventos.push({ tipo: 'pasoCompleto', step: antes.step })
  }
  if (despues.step === 'cierre' && !despues.completed) {
    estado = { ...despues, completed: true }
    eventos.push({ tipo: 'fin' })
  }
  return { estado, eventos }
}

/**
 * Frases del resumen de la pantalla de cierre, en texto plano (quien las
 * pinte las escapa: el nombre del ítem lo escribió el cliente). Solo lo que de
 * verdad hizo; un estado a medias no inventa ventas ni gastos.
 */
export function resumenCierre(estado) {
  const frases = []
  const it = estado.item
  if (it) frases.push(`Creaste el ítem "${it.nombre}" con precio de venta de ${formatCOP(precioTotal(it.precioBase, it.impuesto))}.`)
  if (estado.venta) {
    const { totalItems } = totalesVenta(estado)
    frases.push(`Vendiste ${totalItems} ${totalItems === 1 ? 'unidad' : 'unidades'} por ${formatCOP(estado.venta.total)} en efectivo.`)
  }
  if (estado.gasto) frases.push(`Registraste un gasto de ${formatCOP(estado.gasto.valor)} en ${estado.gasto.categoria}.`)
  if (it && typeof it.existenciasFinal === 'number') {
    frases.push(`Viste en el flujo de inventario cómo tus existencias pasaron de ${it.existencias} a ${it.existenciasFinal}.`)
  }
  return frases
}

/** Fracción recorrida (0..1) para la barra de progreso. */
export function progreso(estado) {
  if (estado.step === 'cierre' || estado.completed) return 1
  const n = numeroPaso(estado.step)
  if (n === null) return 0
  const total = SUBPASOS[estado.step].length
  return Math.min(1, ((n - 1) + estado.sub / total) / TOTAL_PASOS)
}
