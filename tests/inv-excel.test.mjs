// Prueba de punta a punta con los archivos reales (tests/fixtures): plantillas de
// Bold de una cuenta demo y el export de Alegra. Usa SheetJS de vendor/.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { leerLibro, escribirPlantilla } from '../js/inv-excel.js'
import { leerPlantilla } from '../js/inv-plantilla.js'
import { elegirHoja } from '../js/inv-origen.js'
import { convertir } from '../js/inv-convertir.js'

const XLSX = createRequire(import.meta.url)('../vendor/xlsx.full.min.js')
const abrir = nombre => leerLibro(XLSX, fs.readFileSync(new URL(`./fixtures/${nombre}`, import.meta.url)))

test('plantillas reales de Bold: se leen con su sucursal y listas', () => {
  const inv = leerPlantilla(abrir('bold-inventariables.xlsx').hojas)
  const noInv = leerPlantilla(abrir('bold-no-inventariables.xlsx').hojas)
  assert.equal(inv.tipo, 'inventariable')
  assert.equal(inv.sucursal, 'Sucursal-2611 - Sucursal Principal')
  assert.equal(noInv.tipo, 'noinventariable')
  assert.ok(inv.listas.categorias.includes('General'))
  assert.ok(inv.listas.impuestos.includes('IVA-19'))
})

test('Alegra real → plantilla inventariable escrita y releída', () => {
  const plantilla = abrir('bold-inventariables.xlsx')
  const info = leerPlantilla(plantilla.hojas)
  const origen = abrir('alegra-export.xlsx')
  const hoja = elegirHoja(origen.hojas)
  // El export de Alegra no trae existencia y el motor ya no la inventa en 0: se la agregamos.
  const colEx = origen.hojas[hoja.nombre][hoja.fila].length
  const filas = origen.hojas[hoja.nombre].slice(hoja.fila + 1).map(f => { const c = [...f]; c[colEx] = 5; return c })

  const r = convertir({ filas, mapeo: { ...hoja.mapeo, existencia: colEx }, plantillas: { inventariable: info } })
  assert.equal(r.errores.length, 0)
  assert.equal(r.salidas.inventariable.length, 1)
  assert.equal(r.salidas.inventariable[0].nombre, 'Coca Cola 600ml')
  assert.equal(r.salidas.inventariable[0].precioTotal, 5950)

  escribirPlantilla(XLSX, plantilla.wb, info, r.salidas.inventariable)
  const releido = XLSX.read(XLSX.write(plantilla.wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' })
  const filasOut = XLSX.utils.sheet_to_json(releido.Sheets[info.hoja], { header: 1, raw: true, defval: '' })

  assert.equal(filasOut[2][8], 'Existencia Inicial en Sucursal-2611 - Sucursal Principal', 'el encabezado con el ID se conserva')
  assert.equal(filasOut[3][1], 'Coca Cola 600ml')
  assert.equal(filasOut[3][7], 5950)
  assert.equal(filasOut.length, 4, 'las filas de ejemplo de la plantilla desaparecen')
  assert.ok(releido.SheetNames.includes('Instrucciones'), 'las demás hojas se conservan')
})
