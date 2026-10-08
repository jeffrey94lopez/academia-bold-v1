// Construye el bloque bot_faq con el que se resuelve un vacío, y el `contenido`
// nuevo de la lección destino.
//
// Import-safe (sin DOM, sin supabase): la lectura y la escritura de
// `lecciones.contenido` viven en el llamador, que DEBE releer la lección justo
// antes de escribir.
//
// Por qué existe este módulo: escribir `contenido` desde un segundo lugar es la
// clase de bug que ya vació lecciones (ver el spec de integridad de contenido
// del 2026-07-27). La propiedad que sostiene todo es que contenidoConFaq nunca
// devuelve menos bloques de los que había: si el crudo traía algo y el parseo
// da vacío, lanza en vez de escribir.
import { parseLessonBlocks } from './lesson-blocks.js'

export function buildFaqBlock({ pregunta, variaciones, respuesta, mostrarAcordeon = false } = {}) {
  const p = String(pregunta ?? '').trim()
  const r = String(respuesta ?? '').trim()
  if (!p || !r) return null

  const lista = Array.isArray(variaciones)
    ? variaciones
    : String(variaciones ?? '').split('\n')

  return {
    type: 'bot_faq',
    pregunta: p,
    variaciones: lista.map(v => String(v ?? '').trim()).filter(Boolean).join('\n'),
    respuesta: r,
    mostrar_acordeon: !!mostrarAcordeon,
  }
}

export function contenidoConFaq(rawContenido, faqBlock) {
  if (!faqBlock || faqBlock.type !== 'bot_faq') {
    throw new Error('contenidoConFaq: se esperaba un bloque bot_faq válido')
  }
  const blocks = parseLessonBlocks(rawContenido)

  // parseLessonBlocks solo devuelve [] para entradas vacías. Si el crudo traía
  // algo y acá hay [], el parseo falló de una forma que no previmos y estamos a
  // un JSON.stringify de borrar la lección. Lanzar es la única salida segura.
  const traiaAlgo = typeof rawContenido === 'string' && rawContenido.trim().length > 0
  if (traiaAlgo && blocks.length === 0) {
    throw new Error('contenidoConFaq: el contenido no se pudo parsear; abortado para no vaciar la lección')
  }

  return JSON.stringify([...blocks, faqBlock])
}
