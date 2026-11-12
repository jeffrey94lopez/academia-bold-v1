// Pruebas contra los xlsx reales de vendor/ — doble función:
// (1) verificar que construirPlantilla produce la info esperada;
// (2) smoke test: si alguien rota los archivos base mal, falla en CI.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { construirPlantilla } from '../js/inv-plantilla-sintetica.js'

const XLSX = createRequire(import.meta.url)('../vendor/xlsx.full.min.js')
const leerBase = nombre => fs.readFileSync(
  new URL(`../vendor/${nombre}`, import.meta.url))

const baseInv = () => leerBase('bold-plantilla-base-inventariable.xlsx')
const baseNoInv = () => leerBase('bold-plantilla-base-noinventariable.xlsx')

test('construirPlantilla: inventariable sin FE', () => {
  const { info } = construirPlantilla(XLSX, {
    baseBytes: baseInv(), warehouseId: '9999', conFE: false, tipo: 'inventariable',
  })
  assert.equal(info.tipo, 'inventariable')
  assert.equal(info.sucursal, 'Sucursal-9999')
  assert.equal(info.tieneIsv, false)
  assert.deepEqual(info.listas.categorias, ['General'])
  assert.ok(info.listas.unidades.includes('Unidades'))
  assert.equal(info.listas.unidades.length, 15)
  assert.deepEqual(info.listas.impuestos, [])
})

test('construirPlantilla: inventariable con FE', () => {
  const { info } = construirPlantilla(XLSX, {
    baseBytes: baseInv(), warehouseId: '9999', conFE: true, tipo: 'inventariable',
  })
  assert.equal(info.tieneIsv, true)
  assert.deepEqual(info.listas.impuestos, ['EXCLUIDO', 'EXENTO', 'INC-8', 'IVA-5', 'IVA-19'])
})

test('construirPlantilla: no inventariable sin FE', () => {
  const { info } = construirPlantilla(XLSX, {
    baseBytes: baseNoInv(), warehouseId: '9999', conFE: false, tipo: 'noinventariable',
  })
  assert.equal(info.tipo, 'noinventariable')
  assert.equal(info.sucursal, '')  // no-inv no tiene columna de existencia
  assert.equal(info.tieneIsv, false)
  assert.deepEqual(info.listas.categorias, ['General'])
})

test('construirPlantilla: no inventariable con FE inyecta Impuesto*', () => {
  const { info } = construirPlantilla(XLSX, {
    baseBytes: baseNoInv(), warehouseId: '9999', conFE: true, tipo: 'noinventariable',
  })
  assert.equal(info.tieneIsv, true)
})

test('construirPlantilla: bytes vacíos tiran parse_fallo', () => {
  assert.throws(
    () => construirPlantilla(XLSX, {
      baseBytes: new Uint8Array(0), warehouseId: '1', conFE: false, tipo: 'inventariable',
    }),
    /parse_fallo/,
  )
})

test('construirPlantilla: wb devuelto se puede re-serializar', () => {
  const { wb } = construirPlantilla(XLSX, {
    baseBytes: baseInv(), warehouseId: '9999', conFE: true, tipo: 'inventariable',
  })
  // Simula la ruta de descarga: write → read. No debe reventar.
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const copia = XLSX.read(bytes, { type: 'array' })
  assert.ok(copia.SheetNames.includes('Item Inventariable'))
  assert.ok(copia.SheetNames.includes('Instrucciones'))
})
