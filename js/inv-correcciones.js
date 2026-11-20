// js/inv-correcciones.js — valida lo que el cliente escribe al corregir su
// inventario y arma las `opciones` de convertir() a partir de sus decisiones.
//
// Módulo puro, sin DOM ni red. Los helpers `con*` devuelven una copia de
// `opciones` y nunca mutan la original.

import { parseNumero } from './inv-numeros.js'
import { sanear } from './inv-saneamiento.js'

export const FASES = ['nombre', 'precioTotal', 'costo', 'existencia']
export const ETIQUETA_CAMPO = {
  nombre: 'Nombre',
  precioTotal: 'Precio de venta',
  costo: 'Costo',
  existencia: 'Existencia',
}
export const TAMANO_PAGINA = 50

// Nombre: se sanea y no puede quedar vacío. Números: 0 es válido; vacío,
// negativo o no numérico no lo son (un campo en blanco nunca vale 0).
export function validarValor(campo, texto, formato = 'auto') {
  if (campo === 'nombre') {
    const nombre = sanear(texto)
    return nombre ? { ok: true, valor: nombre } : { ok: false }
  }
  const n = parseNumero(texto, formato)
  return n !== null && n >= 0 ? { ok: true, valor: n } : { ok: false }
}

export function pendientesDeFase(r, campo) {
  return (r?.pendientes ?? []).filter(p => p.campo === campo)
}

export function esColumnaCompleta(r, campo) {
  return (r?.columnasSinDato ?? []).includes(campo)
}

export function siguienteFase(r) {
  return FASES.find(campo => pendientesDeFase(r, campo).length > 0) ?? null
}

export function pagina(lista) {
  return lista.slice(0, TAMANO_PAGINA)
}

function copiarCorrecciones(opciones) {
  const copia = {}
  const origen = opciones?.correcciones ?? {}
  for (const fila of Object.keys(origen)) {
    if (Object.hasOwn(origen, fila)) copia[fila] = { ...origen[fila] }
  }
  return copia
}

export function conCorreccion(opciones, fila, campo, valor) {
  const correcciones = copiarCorrecciones(opciones)
  correcciones[fila] = { ...(correcciones[fila] ?? {}), [campo]: valor }
  return { ...opciones, correcciones }
}

// Pone 0 en cada pendiente de la lista (todas, no solo la página visible).
export function conCeros(opciones, pendientes) {
  const correcciones = copiarCorrecciones(opciones)
  for (const p of pendientes) {
    correcciones[p.fila] = { ...(correcciones[p.fila] ?? {}), [p.campo]: 0 }
  }
  return { ...opciones, correcciones }
}

export function conOmitidas(opciones, filas) {
  const omitidas = [...(opciones?.omitidas ?? [])]
  for (const f of filas) {
    const n = Number(f)
    if (Number.isFinite(n) && !omitidas.includes(n)) omitidas.push(n)
  }
  return { ...opciones, omitidas }
}

export function conValorColumna(opciones, campo, valor) {
  return { ...opciones, valorPorColumna: { ...(opciones?.valorPorColumna ?? {}), [campo]: valor } }
}

export function descripcionMotivo(p) {
  const etiqueta = ETIQUETA_CAMPO[p.campo] ?? p.campo
  if (p.motivo === 'vacio') return `${etiqueta} está vacío`
  const original = String(p.original ?? '').replace(/^-/, '−')
  if (p.motivo === 'negativo') return `${etiqueta} es ${p.campo === "existencia" ? "negativa" : "negativo"} (${original})`
  return `${etiqueta} no es un número (${original})`
}
