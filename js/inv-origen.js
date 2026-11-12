// js/inv-origen.js — reconoce las columnas del archivo de productos del cliente.
//
// Dado un arreglo de filas (la hoja ya leída), encuentra la fila de encabezados
// y asigna cada columna a un campo de Bold POS con un diccionario de sinónimos.
// Sin IA y sin red. Módulo puro.
import { normalizar } from './inv-numeros.js'

// Campos que el conversor sabe llenar, en el orden en que se muestran al cliente.
export const CAMPOS = [
  { id: 'codigo', etiqueta: 'Código' },
  { id: 'nombre', etiqueta: 'Nombre', obligatorio: true },
  { id: 'categoria', etiqueta: 'Categoría' },
  { id: 'referencia', etiqueta: 'Referencia' },
  { id: 'descripcion', etiqueta: 'Descripción' },
  { id: 'unidad', etiqueta: 'Unidad de medida' },
  { id: 'costo', etiqueta: 'Precio costo' },
  { id: 'precioTotal', etiqueta: 'Precio de venta total (con impuesto)' },
  { id: 'precioBase', etiqueta: 'Precio base (sin impuesto)' },
  { id: 'impuesto', etiqueta: 'Impuesto' },
  { id: 'existencia', etiqueta: 'Existencia inicial' },
  { id: 'inventariable', etiqueta: '¿Es inventariable?' },
  { id: 'tipo', etiqueta: 'Tipo (producto / servicio)' },
]

// Cada regla se prueba contra el encabezado normalizado (sin tildes, en
// minúsculas). `excluir` descarta falsos amigos: la "cuenta de costo de venta"
// de Alegra no es el costo del producto, ni su "código del producto o servicio"
// (código fiscal de la DIAN) es el código interno.
const REGLAS = [
  { campo: 'inventariable', puntos: 90, patron: /^(es |item |producto |articulo )?inventariable|^maneja inventario|^controla inventario/ },
  { campo: 'tipo', puntos: 80, patron: /^tipo( de (producto|item|articulo|servicio))?\b/, excluir: /impuesto|variante/ },
  { campo: 'nombre', puntos: 100, patron: /^(nombre|producto|articulo|item)$|\bnombre\b/, excluir: /impuesto|variante|cuenta|bodega|categoria|atributo/ },
  { campo: 'codigo', puntos: 90, patron: /^(codigo|cod|sku|plu|codigo de barras|barras|codigo del producto|codigo producto|codigo item|codigo articulo)\b/, excluir: /servicio|cuenta|impuesto|dian|cargo|variante/ },
  { campo: 'categoria', puntos: 90, patron: /categoria|^grupo\b|^linea\b|familia|departamento|clasificacion/, excluir: /cuenta|impuesto|iva/ },
  { campo: 'referencia', puntos: 90, patron: /^referencia|^ref\b/ },
  { campo: 'descripcion', puntos: 70, patron: /descripcion|detalle/, excluir: /nombre|impuesto/ },
  { campo: 'unidad', puntos: 90, patron: /unidad de medida|unidad medida|^unidad\b|^um$|medida/, excluir: /precio|cantidad|existencia|stock/ },
  { campo: 'costo', puntos: 90, patron: /costo|precio de compra|precio compra/, excluir: /cuenta|total venta/ },
  { campo: 'precioBase', puntos: 90, patron: /precio base|sin (iva|impuesto)|^subtotal/, excluir: /cuenta/ },
  { campo: 'precioTotal', puntos: 85, patron: /precio total|precio venta total|precio final|^pvp\b|con (iva|impuesto)|precio de venta|precio venta|^precio$|valor venta|precio publico/, excluir: /cuenta|costo|compra|incluye/ },
  { campo: 'impuesto', puntos: 85, patron: /porcentaje impuesto|^impuesto|^iva\b|^isv\b|\btax\b|codigo impuesto/, excluir: /incluye|cuenta/ },
  { campo: 'existencia', puntos: 90, patron: /existencia|stock|cantidad( inicial)?|saldo|inventario inicial|unidades en/, excluir: /precio|costo|cuenta|unidad de medida/ },
]

// Puntaje de un encabezado para un campo (0 = no corresponde).
function puntaje(encabezadoNorm, regla) {
  if (!encabezadoNorm) return 0
  if (regla.excluir && regla.excluir.test(encabezadoNorm)) return 0
  if (!regla.patron.test(encabezadoNorm)) return 0
  // Más corto = más específico ("nombre" gana a "nombre del producto / servicio").
  return regla.puntos - Math.min(encabezadoNorm.length, 40) / 10
}

// Asigna a cada campo, como máximo, una columna, y cada columna a un campo.
// Devuelve { campo: indiceColumna } con los encabezados de `encabezados`.
export function mapearColumnas(encabezados) {
  const candidatos = []
  encabezados.forEach((h, col) => {
    const n = normalizar(h)
    for (const regla of REGLAS) {
      const p = puntaje(n, regla)
      if (p > 0) candidatos.push({ campo: regla.campo, col, p })
    }
  })
  candidatos.sort((a, b) => b.p - a.p || a.col - b.col)
  const mapeo = {}
  const usadas = new Set()
  for (const c of candidatos) {
    if (mapeo[c.campo] !== undefined || usadas.has(c.col)) continue
    mapeo[c.campo] = c.col
    usadas.add(c.col)
  }
  // Algunos sistemas llaman "descripción" al nombre del producto.
  if (mapeo.nombre === undefined && mapeo.descripcion !== undefined) {
    mapeo.nombre = mapeo.descripcion
    delete mapeo.descripcion
  }
  return mapeo
}

const FILAS_A_REVISAR = 15

// Busca la fila de encabezados: la de las primeras filas con más columnas
// reconocidas. Devuelve { fila, mapeo, encabezados } o null si ninguna sirve.
export function detectarEncabezado(filas) {
  let mejor = null
  for (let i = 0; i < Math.min(filas.length, FILAS_A_REVISAR); i++) {
    const encabezados = filas[i].map(c => String(c ?? ''))
    const mapeo = mapearColumnas(encabezados)
    const aciertos = Object.keys(mapeo).length
    const sirve = mapeo.nombre !== undefined && aciertos >= 2
    if (sirve && (!mejor || aciertos > mejor.aciertos)) mejor = { fila: i, mapeo, encabezados, aciertos }
  }
  return mejor
}

// De varias hojas ({nombre: filas}) elige la que mejor se reconoce.
export function elegirHoja(hojas) {
  let mejor = null
  for (const [nombre, filas] of Object.entries(hojas)) {
    const enc = detectarEncabezado(filas)
    if (enc && (!mejor || enc.aciertos > mejor.aciertos)) mejor = { nombre, ...enc }
  }
  return mejor
}
