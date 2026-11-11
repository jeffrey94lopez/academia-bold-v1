// js/inv-plantilla-sintetica.js — arma la plantilla Bold que descarga el
// cliente en el camino mono-sucursal, sin que tenga que subir la suya.
//
// Toma un xlsx base de vendor/ (una plantilla "Sin FE" de una cuenta demo), le
// pone el warehouseId del cliente en la columna de existencia, inyecta la
// columna Impuesto* si la cuenta tiene FE, y reescribe la hoja Instrucciones
// para dejar solo los defaults canónicos de Bold (General + 15 unidades + 5
// impuestos). Devuelve { wb, info } igual que leerPlantilla() de inv-plantilla.
//
// XLSX se inyecta como parámetro: el módulo es puro y no toca ni DOM ni red.
// En producción lo llama inv-sesion.agregarPlantillaSintetica, que fetchea el
// base y pasa los bytes acá.
import { leerPlantilla } from './inv-plantilla.js'

export const UNIDADES_CANONICAS_BOLD = [
  'Centímetros', 'Galónes', 'Gramos', 'Kilogramos', 'Libras', 'Litros',
  'Metros', 'Metros cuadrados', 'Metros cúbicos', 'Miligramos', 'Mililitros',
  'Milímetros', 'Onzas', 'Par', 'Unidades',
]
export const IMPUESTOS_CANONICOS_BOLD = ['EXCLUIDO', 'EXENTO', 'INC-8', 'IVA-5', 'IVA-19']

const HOJAS_ITEMS = {
  inventariable: 'Item Inventariable',
  noinventariable: 'Item No Inventariable',
}

export function construirPlantilla(XLSX, { baseBytes, warehouseId, conFE, tipo }) {
  const wb = leer(XLSX, baseBytes)
  const nombreHoja = HOJAS_ITEMS[tipo]
  const hoja = wb.Sheets[nombreHoja]
  if (!hoja) throw new Error(`estructura_cambio: falta hoja "${nombreHoja}"`)
  const instrucciones = wb.Sheets['Instrucciones']
  if (!instrucciones) throw new Error('estructura_cambio: falta hoja "Instrucciones"')

  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: '' })
  const filaEncabezado = filas.findIndex(f =>
    f.some(c => /^codigo/i.test(String(c).trim())) &&
    f.some(c => /^nombre/i.test(String(c).trim())))
  if (filaEncabezado < 0) throw new Error('estructura_cambio: no encontré el encabezado')
  const encabezados = filas[filaEncabezado]

  if (tipo === 'inventariable') renombrarSucursal(encabezados, warehouseId)
  if (conFE) inyectarImpuesto(encabezados, filas, filaEncabezado)

  // Escribir filas modificadas de vuelta a la hoja.
  const nuevaHoja = XLSX.utils.aoa_to_sheet(filas)
  wb.Sheets[nombreHoja] = nuevaHoja

  // Reescribir Instrucciones con las listas canónicas.
  wb.Sheets['Instrucciones'] = XLSX.utils.aoa_to_sheet(construirInstrucciones(conFE))

  // Releer con leerPlantilla para devolver la misma forma que usaría
  // una plantilla subida por el cliente.
  const hojasParaLeer = {
    [nombreHoja]: XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { header: 1, defval: '' }),
    Instrucciones: XLSX.utils.sheet_to_json(wb.Sheets['Instrucciones'], { header: 1, defval: '' }),
  }
  const info = leerPlantilla(hojasParaLeer)
  if (!info) throw new Error('estructura_cambio: leerPlantilla devolvió null')

  return { wb, info }
}

function leer(XLSX, baseBytes) {
  let wb
  try {
    wb = XLSX.read(baseBytes, { type: 'array' })
  } catch {
    throw new Error('parse_fallo: no pude leer el xlsx base')
  }
  // SheetJS no lanza en bytes vacíos/basura: produce un libro con una Sheet1
  // genérica. Si el resultado solo tiene esa hoja de relleno, es parse fallido.
  if (wb.SheetNames.length === 1 && wb.SheetNames[0] === 'Sheet1') {
    throw new Error('parse_fallo: no pude leer el xlsx base')
  }
  return wb
}

function renombrarSucursal(encabezados, warehouseId) {
  const cols = encabezados
    .map((c, i) => [i, String(c ?? '')])
    .filter(([, texto]) => /^existencia inicial en sucursal-/i.test(texto))
  if (cols.length === 0) {
    throw new Error('estructura_cambio: no hay columna de existencia en inventariable')
  }
  if (cols.length > 1) {
    throw new Error(`estructura_cambio: hay ${cols.length} columnas de existencia (esperaba 1)`)
  }
  encabezados[cols[0][0]] = `Existencia Inicial en Sucursal-${warehouseId}`
}

function inyectarImpuesto(encabezados, filas, filaEncabezado) {
  const idx = encabezados.findIndex(c =>
    /^precio venta total/i.test(String(c ?? '').trim()))
  if (idx < 0) throw new Error('estructura_cambio: falta Precio Venta Total* para inyectar Impuesto*')
  // Insertar celda nueva en el header row...
  encabezados.splice(idx + 1, 0, 'Impuesto*')
  // ...y en TODAS las filas de data (para que las columnas se alineen).
  for (let i = 0; i < filas.length; i++) {
    if (i === filaEncabezado) continue
    filas[i].splice(idx + 1, 0, '')
  }
}

function construirInstrucciones(conFE) {
  // Mantiene los títulos originales que trae el base, con las listas limpias.
  // Formato observado en vendor/: encabezado en fila 0, listas en columnas desde fila 1.
  const titulos = conFE
    ? ['Listado de impuestos:', 'Listado de Unidades:', 'Categorias:']
    : ['Listado de Unidades:', 'Categorias:']
  const columnas = conFE
    ? [IMPUESTOS_CANONICOS_BOLD, UNIDADES_CANONICAS_BOLD, ['General']]
    : [UNIDADES_CANONICAS_BOLD, ['General']]
  const maxFilas = Math.max(...columnas.map(c => c.length))
  const data = [titulos]
  for (let i = 0; i < maxFilas; i++) {
    data.push(columnas.map(c => c[i] ?? ''))
  }
  return data
}
