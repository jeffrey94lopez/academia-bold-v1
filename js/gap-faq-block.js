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

// ¿El crudo es literalmente un array JSON VACÍO? '[]' lo es: es una lección a la
// que le borraron todos los bloques, y resolver un vacío sobre ella es legítimo.
// Un array con bloques adentro NO cuenta: si su parseo da [], es pérdida de datos.
function esArrayVacioJson(raw) {
  try { const p = JSON.parse(raw); return Array.isArray(p) && p.length === 0 } catch (_) { return false }
}

// Forma canónica de una pregunta para compararla: trim, minúsculas y espacios
// colapsados. Dos preguntas que solo difieren en eso son la misma FAQ.
export function normalizarPregunta(p) {
  return String(p ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

// Solo para tests: con el parser real la rama del guard es inalcanzable, porque
// parseLessonBlocks solo devuelve [] para entradas vacías. No se usa en
// producción; pasarle un parser por error desactivaría el guard.
export function contenidoConFaqInfoCon(rawContenido, faqBlock, parse) {
  if (!faqBlock || faqBlock.type !== 'bot_faq') {
    throw new Error('contenidoConFaq: se esperaba un bloque bot_faq válido')
  }
  const blocks = parse(rawContenido)

  // parseLessonBlocks solo devuelve [] para entradas vacías y para un array JSON
  // vacío. Si el crudo traía algo que NO era un array vacío válido y acá hay [],
  // el parseo falló de una forma que no previmos y estamos a un JSON.stringify
  // de borrar la lección. Lanzar es la única salida segura.
  const traiaAlgo = typeof rawContenido === 'string' && rawContenido.trim().length > 0
  if (traiaAlgo && blocks.length === 0 && !esArrayVacioJson(rawContenido)) {
    throw new Error('contenidoConFaq: el contenido no se pudo parsear; abortado para no vaciar la lección')
  }

  // Appendear a ciegas duplica la FAQ en la lección por cuatro caminos distintos,
  // todos alcanzables: re-resolver un vacío ya resuelto, dos admins con el mismo
  // vacío abierto, un cierre fallido seguido de navegación, o cerrar el navegador
  // entre el UPDATE de `lecciones` y el cierre del vacío. Por eso, si ya hay un
  // bot_faq con la misma pregunta, se reemplaza en su posición. Solo el primero:
  // los demás (si ya había duplicados) no se tocan, porque no son nuestros.
  const clave = normalizarPregunta(faqBlock.pregunta)
  const idx = clave
    ? blocks.findIndex(b => b?.type === 'bot_faq' && normalizarPregunta(b.pregunta) === clave)
    : -1

  const resultado = idx === -1
    ? [...blocks, faqBlock]
    : blocks.map((b, i) => (i === idx ? faqBlock : b))
  return { contenido: JSON.stringify(resultado), reemplazada: idx !== -1 }
}

export function contenidoConFaqCon(rawContenido, faqBlock, parse) {
  return contenidoConFaqInfoCon(rawContenido, faqBlock, parse).contenido
}

// Igual que contenidoConFaq, pero dice si reemplazó una FAQ existente.
export function contenidoConFaqInfo(rawContenido, faqBlock) {
  return contenidoConFaqInfoCon(rawContenido, faqBlock, parseLessonBlocks)
}

export function contenidoConFaq(rawContenido, faqBlock) {
  return contenidoConFaqInfo(rawContenido, faqBlock).contenido
}
