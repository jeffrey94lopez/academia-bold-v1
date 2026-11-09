// js/inv-intencion.js — ¿está hablando de cargar o crear productos en Bold POS?
// Detección local por palabras: no gasta tokens ni espera a n8n. Si da que sí, BolBot
// pregunta primero cómo quiere hacerlo (inv-camino.js) y recién después responde.
import { normalizar } from './inv-numeros.js'

// Cargar en bloque o crear uno a uno: los dos caminos empiezan igual.
const VERBO = /\b(subir|subo|subiendo|cargar|cargo|cargando|importar|importo|importando|migrar|migro|pasar|traer|convertir|llenar|armar|crear|creo|creando|agregar|agrego|agregando|anadir|anado|registrar|registro|ingresar|ingreso|meter|meto|monto|montar)\b/
const OBJETO = /\b(inventario|productos?|articulos?|items?|catalogo|mercancia|plantilla|excel|archivo)\b/
// Frases completas que sin verbo también hablan de esto.
const FRASES = [
  /plantilla de (items|productos|inventario)/,
  /(importacion|carga|creacion) (masiva )?de (items|productos|inventario)/,
  /creacion (individual )?de (un )?items?/,
  /\b(lo|los|la|las) paso a bold\b/,
  /(de|desde) (alegra|siigo|world office|excel)\b.*\b(bold|inventario|productos)/,
]
// Otros temas que comparten palabras: ajustes y movimientos de inventario, variantes,
// listas de precios, ventas, compras, o un error que ya ocurrió (eso lo atiende el bot).
const NO_ES = /\b(ajuste|ajustes|ajustar|variante|variantes|lista de precios|listas de precios|venta|ventas|vender|factura|facturas|facturar|compra|compras|reporte|reportes|traslado|conteo|error|falla|fallo|cliente|clientes|usuario|usuarios)\b/

export function esIntencionInventario(texto) {
  const t = normalizar(texto)
  if (!t || t.length > 200) return false
  if (NO_ES.test(t)) return false
  if (FRASES.some(r => r.test(t))) return true
  return VERBO.test(t) && OBJETO.test(t)
}
