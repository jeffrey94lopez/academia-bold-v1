// js/inv-codigos.js — crea códigos para productos que no traen uno.
//
// Módulo puro. Los códigos nunca se repiten entre sí ni con los que el cliente ya
// tenía: si un candidato está en uso, se salta al siguiente número.
import { normalizar } from './inv-numeros.js'

// Dígito de control de un EAN-13 (recibe los 12 primeros dígitos).
export function digitoEan13(doce) {
  let s = 0
  for (let i = 0; i < 12; i++) s += Number(doce[i]) * (i % 2 ? 3 : 1)
  return (10 - (s % 10)) % 10
}

// Dígito de control de un UPC-A (recibe los 11 primeros dígitos).
export function digitoUpc(once) {
  let s = 0
  for (let i = 0; i < 11; i++) s += Number(once[i]) * (i % 2 ? 1 : 3)
  return (10 - (s % 10)) % 10
}

export const FORMATOS_CODIGO = [
  { id: 'ean', etiqueta: 'Numérico de 13 dígitos', detalle: 'Se lee con cualquier lector y sirve para imprimir código de barras EAN-13.' },
  { id: 'nombre', etiqueta: 'Letras del nombre + número', detalle: 'Fácil de reconocer a simple vista.' },
  { id: 'personalizado', etiqueta: 'Mi propio prefijo + número', detalle: 'Tú eliges cómo empieza y desde qué número.' },
]

const sigla = nombre => (normalizar(nombre).replace(/ /g, '').slice(0, 3).toUpperCase() || 'PRD').padEnd(3, 'X')

function armar(formato, n, nombre, { prefijo, relleno }) {
  if (formato === 'ean') {
    // El prefijo 200–299 lo reserva GS1 para uso interno de cada tienda: no choca con productos de fábrica.
    const doce = `200${String(n).padStart(9, '0')}`
    return doce + digitoEan13(doce)
  }
  if (formato === 'nombre') return `${sigla(nombre)}-${String(n).padStart(relleno, '0')}`
  return `${prefijo ? `${prefijo}-` : ''}${String(n).padStart(relleno, '0')}`
}

// → función (nombre) => código nuevo. `existentes`: códigos que ya están en uso.
export function crearGeneradorCodigos({ formato, prefijo = '', inicio = 1, relleno = 3 }, existentes = []) {
  const opciones = { prefijo: String(prefijo).trim(), relleno }
  const usados = new Set(existentes)
  let n = formato === 'personalizado' ? inicio : 1
  return nombre => {
    for (;;) {
      const codigo = armar(formato, n++, nombre, opciones)
      if (!usados.has(codigo)) { usados.add(codigo); return codigo }
    }
  }
}
