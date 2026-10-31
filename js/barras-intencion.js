// js/barras-intencion.js — ¿le piden a BolBot códigos de barras, QR o etiquetas?
// Detección local por palabras: no gasta tokens ni espera a n8n.
import { normalizar } from './inv-numeros.js'

const OBJETO = /\b(codigos? de barras?|codigo qr|codigos qr|qr|etiquetas?)\b/
const VERBO = /\b(crear|creo|generar|genero|hacer|hago|imprimir|imprimo|sacar|armar|necesito|quiero|como)\b/
// «cómo leo un código de barras» es otra pregunta: la lectura es del lector, no de esta herramienta.
const NO_ES = /\b(lector|escaner|escanear|escaneo|leer|leo|pistola)\b/

export function esIntencionCodigos(texto) {
  const t = normalizar(texto)
  if (!t || t.length > 160) return false
  if (NO_ES.test(t)) return false
  if (/\bcodigos? (a|para) (mis |los |cada )?(productos|items|articulos)\b/.test(t)) return true
  return OBJETO.test(t) && VERBO.test(t)
}
