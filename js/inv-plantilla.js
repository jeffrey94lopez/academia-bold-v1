// js/inv-plantilla.js — lee la plantilla de Bold POS que sube el cliente.
//
// Cada plantilla es única por cuenta: el encabezado de existencia lleva el ID de
// la sucursal y la hoja "Instrucciones" trae los impuestos, unidades y categorías
// de ESA cuenta. Por eso no se genera una plantilla propia: se lee la del cliente
// y se la rellena. Módulo puro: recibe las hojas ya convertidas a filas.
import { normalizar } from './inv-numeros.js'

// Encabezados de la hoja de ítems simples → campo (se comparan normalizados).
const ENCABEZADOS = [
  { campo: 'codigo', patron: /^codigo/ },
  { campo: 'nombre', patron: /^nombre/ },
  { campo: 'categoria', patron: /^categoria/ },
  { campo: 'referencia', patron: /^referencia/ },
  { campo: 'descripcion', patron: /^descripcion/ },
  { campo: 'unidad', patron: /^unidad/ },
  { campo: 'costo', patron: /^precio costo/ },
  { campo: 'precioTotal', patron: /^precio venta/ },
  { campo: 'existencia', patron: /^existencia/ },
  { campo: 'isv', patron: /\b(isv|iva|impuesto)\b/ },
]

const LISTAS = [
  { clave: 'impuestos', patron: /impuesto/ },
  { clave: 'unidades', patron: /unidad/ },
  { clave: 'categorias', patron: /categoria/ },
]

// Nombre de la hoja de ítems simples ("Item Inventariable" / "Item No Inventariable").
function hojaDeItems(nombres) {
  return nombres.find(n => /inventariable/i.test(n) && !/variante/i.test(n)) ?? null
}

function leerListas(filas) {
  const listas = { impuestos: [], unidades: [], categorias: [] }
  if (!filas?.length) return listas
  const cabecera = filas[0].map(c => normalizar(c))
  for (const { clave, patron } of LISTAS) {
    const col = cabecera.findIndex(h => patron.test(h))
    if (col < 0) continue
    for (let i = 1; i < filas.length; i++) {
      const v = String(filas[i][col] ?? '').trim()
      if (v) listas[clave].push(v)
    }
  }
  return listas
}

// `hojas`: { nombreHoja: filas[][] } en el orden del libro.
// Devuelve null si el archivo no parece una plantilla de ítems de Bold POS.
export function leerPlantilla(hojas) {
  const nombres = Object.keys(hojas)
  const hoja = hojaDeItems(nombres)
  if (!hoja) return null

  const filas = hojas[hoja]
  const filaEncabezado = filas.findIndex(f =>
    f.some(c => /^codigo/.test(normalizar(c))) && f.some(c => /^nombre/.test(normalizar(c))))
  if (filaEncabezado < 0) return null

  const columnas = []
  filas[filaEncabezado].forEach((texto, idx) => {
    const t = String(texto ?? '').trim()
    if (!t) return
    const n = normalizar(t)
    const regla = ENCABEZADOS.find(r => r.patron.test(n))
    columnas.push({ idx, texto: t, campo: regla ? regla.campo : 'extra' })
  })
  if (!columnas.some(c => c.campo === 'nombre')) return null

  const existencia = columnas.find(c => c.campo === 'existencia')
  const instrucciones = nombres.find(n => /instruccion/i.test(n))
  return {
    tipo: existencia || !/no\s+inventariable/i.test(hoja) ? 'inventariable' : 'noinventariable',
    hoja,
    filaEncabezado,
    columnas,
    tieneIsv: columnas.some(c => c.campo === 'isv'),
    sucursal: existencia ? existencia.texto.replace(/^existencia inicial en\s*/i, '') : '',
    listas: leerListas(instrucciones ? hojas[instrucciones] : []),
  }
}
