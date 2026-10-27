// js/inv-excel.js — lectura y escritura de archivos Excel/CSV con SheetJS.
//
// SheetJS (vendor/xlsx.full.min.js) se recibe como argumento para que este
// módulo no dependa de una global y pueda probarse en Node.

// Archivo → { wb, hojas } donde `hojas` es { nombre: filas[][] } con los valores
// crudos (números como número) y las filas vacías incluidas, para que el índice
// de cada fila coincida con su número en Excel menos uno.
export function leerLibro(XLSX, buffer, { csv = false } = {}) {
  const wb = csv
    ? XLSX.read(new TextDecoder('utf-8').decode(buffer), { type: 'string', raw: true })
    : XLSX.read(buffer, { type: 'array' })
  const hojas = {}
  for (const nombre of wb.SheetNames) {
    hojas[nombre] = XLSX.utils.sheet_to_json(wb.Sheets[nombre], { header: 1, raw: true, defval: '', blankrows: true })
  }
  return { wb, hojas }
}

// Borra las filas de ejemplo de la plantilla y escribe las del cliente debajo del
// encabezado, columna por columna según el encabezado de la plantilla. El resto
// del libro (Instrucciones, variantes) queda como vino.
export function escribirPlantilla(XLSX, wb, info, filas) {
  const ws = wb.Sheets[info.hoja]
  for (const clave of Object.keys(ws)) {
    if (clave[0] === '!') continue
    if (XLSX.utils.decode_cell(clave).r > info.filaEncabezado) delete ws[clave]
  }
  const ancho = Math.max(...info.columnas.map(c => c.idx)) + 1
  const aoa = filas.map(f => {
    const fila = new Array(ancho).fill(null)
    for (const col of info.columnas) {
      const v = col.campo === 'extra' ? null : f[col.campo]
      fila[col.idx] = v === '' || v === undefined ? null : v
    }
    return fila
  })
  const origen = { r: info.filaEncabezado + 1, c: 0 }
  XLSX.utils.sheet_add_aoa(ws, aoa, { origin: origen })
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: Math.max(info.filaEncabezado, info.filaEncabezado + aoa.length), c: ancho - 1 },
  })
}

export function descargar(XLSX, wb, nombreArchivo) {
  XLSX.writeFile(wb, nombreArchivo)
}
