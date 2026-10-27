// js/inv-intencion.js — ¿el usuario le está pidiendo a BolBot que pase su inventario
// a la plantilla de Bold? Detección local por palabras: no gasta tokens ni espera a n8n.
import { normalizar } from './inv-numeros.js'

const VERBO = /\b(subir|subo|subiendo|cargar|cargo|cargando|importar|importo|importando|migrar|migro|pasar|traer|convertir|llenar|armar)\b/
const OBJETO = /\b(inventario|productos|articulos|items|catalogo|plantilla|excel|archivo)\b/
// Frases completas que sin verbo también piden esto.
const FRASES = [
  /plantilla de (items|productos|inventario)/,
  /(importacion|carga) (masiva )?de (items|productos|inventario)/,
  /\b(lo|los|la|las) paso a bold\b/,
  /(de|desde) (alegra|siigo|world office|excel)\b.*\b(bold|inventario|productos)/,
]
// "cómo creo un producto" es una duda de uso, no una carga masiva.
const NO_ES = /\b(un producto|un item|un articulo|una categoria|una venta|una factura)\b/

export function esIntencionInventario(texto) {
  const t = normalizar(texto)
  if (!t || t.length > 200) return false
  if (FRASES.some(r => r.test(t))) return true
  if (NO_ES.test(t) && !/\b(inventario|productos|items|articulos)\b/.test(t)) return false
  return VERBO.test(t) && OBJETO.test(t) && /\b(inventario|productos|articulos|items|catalogo|plantilla|excel)\b/.test(t)
}
