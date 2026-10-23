// js/onboarding-progress.js — persistencia del avance del recorrido por cuenta.
//
// Módulo puro, sin DOM: recibe `io = { get(k), set(k,v), remove(k) }` (en la
// app, `js/storage.js`). Solo el accountId entra a la clave de localStorage,
// nunca nombre/correo (regla de bold-context.js).
import { PASOS } from './onboarding-steps.js'

export function claveAvance(accountId) {
  return accountId ? `onb_progress:${accountId}` : 'onb_progress'
}

export function cargarAvance(io, accountId) {
  const raw = io.get(claveAvance(accountId))
  if (!raw) return null
  let estado
  try {
    estado = JSON.parse(raw)
  } catch {
    return null
  }
  return estado && estado.v === 1 ? estado : null
}

export function guardarAvance(io, accountId, estado) {
  io.set(claveAvance(accountId), JSON.stringify(estado))
}

// Compara "más avance": completed primero, luego índice en PASOS, luego sub.
function masAvance(a, b) {
  if (a.completed !== b.completed) return a.completed ? a : b
  const ia = PASOS.indexOf(a.step)
  const ib = PASOS.indexOf(b.step)
  if (ia !== ib) return ia > ib ? a : b
  return a.sub >= b.sub ? a : b
}

export function adoptarCuenta(io, accountId, estadoActual) {
  if (!accountId) return estadoActual
  const deCuenta = cargarAvance(io, accountId)
  const ganador = deCuenta ? masAvance(deCuenta, estadoActual) : estadoActual
  guardarAvance(io, accountId, ganador)
  io.remove(claveAvance(null))
  return ganador
}
