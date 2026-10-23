// js/onboarding-bridge.js — puente entre el recorrido guiado y su contenedor.
//
// El recorrido vive embebido igual que el resto del portal (ver
// js/bold-context.js): no puede llamar a Bold directamente, solo mandarle un
// postMessage al contenedor conocido para que él cierre el modal o navegue.
// Dos excepciones a ese postMessage:
//  - "desde Ayuda" (el portal abrió el recorrido navegando, no en un iframe
//    propio): no hay nadie escuchando un mensaje, hay que volver al portal.
//  - sin contenedor conocido (el recorrido se abrió suelto, fuera de Bold):
//    no queda nada por hacer salvo que la página se lo diga al usuario.

import { destinoContenedor } from './bold-context.js'

export function mensajeCerrar(reason) {
  return { type: 'academia:onboarding-close', v: 1, reason }
}

export function mensajeNavegar(to) {
  return { type: 'academia:navigate', v: 1, to }
}

/**
 * Cierra el recorrido. Devuelve qué pasó, para que la pantalla decida qué
 * mostrar: `'portal'` (ya navegó), `'mensaje'` (se lo pidió a Bold) o
 * `'suelto'` (nadie a quién avisar; la página debe mostrar "ya puedes cerrar
 * esta ventana").
 */
export function cerrarRecorrido(win, reason, { desdeAyuda } = {}) {
  if (desdeAyuda) {
    win.location.href = '/'
    return 'portal'
  }
  const destino = destinoContenedor(win)
  if (destino === null) return 'suelto'
  win.parent.postMessage(mensajeCerrar(reason), destino)
  return 'mensaje'
}

/**
 * Pide ir a "Mis ítems". Abierto desde Ayuda también sirve: el portal mismo
 * vive en un iframe de Bold, así que el mismo postMessage llega.
 */
export function irAMisItems(win) {
  const destino = destinoContenedor(win)
  if (destino === null) return 'suelto'
  win.parent.postMessage(mensajeNavegar('items'), destino)
  return 'mensaje'
}
