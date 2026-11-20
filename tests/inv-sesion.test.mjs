// Tests de inv-sesion focalizados en agregarPlantillaSintetica. Para los
// métodos existentes (agregarPlantilla, cargarOrigen, recalcular) ya están
// los tests de los módulos que usan (inv-plantilla, inv-origen, inv-convertir).
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { crearSesion } from '../js/inv-sesion.js'

const XLSX = createRequire(import.meta.url)('../vendor/xlsx.full.min.js')

// Para que inv-sesion pueda usar SheetJS en tests (donde no hay <script> para
// cargarlo), lo ponemos en globalThis.
globalThis.XLSX = XLSX

const bytesBase = nombre => fs.readFileSync(
  new URL(`../vendor/${nombre}`, import.meta.url))

function mockFetch({ falla = 0 } = {}) {
  let llamadas = 0
  globalThis.fetch = async (url) => {
    llamadas++
    if (llamadas <= falla) throw new Error('simulada')
    const nombre = url.toString().split('/').pop()
    return {
      ok: true,
      arrayBuffer: async () => bytesBase(nombre),
    }
  }
  return () => llamadas
}

test('agregarPlantillaSintetica: fetch OK, guarda ambos tipos', async () => {
  mockFetch()
  const sesion = crearSesion()
  const r = await sesion.agregarPlantillaSintetica({ warehouseId: '9999', conFE: true })
  assert.equal(r.ok, true)
  assert.ok(sesion.estado.plantillas.inventariable)
  assert.ok(sesion.estado.plantillas.noinventariable)
  assert.equal(sesion.estado.plantillas.inventariable.info.sucursal, 'Sucursal-9999')
  assert.equal(sesion.estado.plantillas.inventariable.info.tieneIsv, true)
})

test('agregarPlantillaSintetica: retry — falla 1 vez, responde al segundo intento', async () => {
  const contar = mockFetch({ falla: 1 })
  const sesion = crearSesion()
  const r = await sesion.agregarPlantillaSintetica({ warehouseId: '1', conFE: false })
  assert.equal(r.ok, true)
  assert.ok(contar() > 2)  // al menos 2 intentos en algún archivo
})

test('agregarPlantillaSintetica: falla 2 veces → devuelve error fetch_fallo', async () => {
  mockFetch({ falla: 99 })
  const sesion = crearSesion()
  const r = await sesion.agregarPlantillaSintetica({ warehouseId: '1', conFE: false })
  assert.equal(r.ok, undefined)
  assert.equal(r.codigo, 'fetch_fallo')
  assert.deepEqual(sesion.estado.plantillas, {})
})

// Una fila con datos solo en columnas que no son de producto (una nota suelta en
// la columna de IVA) no es un producto: no debe inflar el "Encontré N producto(s)".
test('cargarOrigen: el total no cuenta filas sin nombre, código, precio ni costo', async () => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Código', 'Nombre', 'Costo', 'Precio', 'IVA'],
    ['A1', 'Camisa', 10, 20, 19],
    ['', '', '', '', ''],
    ['', '', '', '', 'nota suelta'],
    ['A2', 'Pantalón', 15, 30, ''],
  ]), 'Productos')
  const bytes = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const archivo = { name: 'productos.xlsx', arrayBuffer: async () => bytes }
  const r = await crearSesion().cargarOrigen(archivo)
  assert.equal(r.error, undefined)
  assert.equal(r.total, 2)
})

test('cargarOrigen: reinicia categoriasIA pero conserva estado.ia', async () => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Código', 'Nombre', 'Costo', 'Precio'], ['A1', 'Camisa', 10, 20],
  ]), 'Productos')
  const bytes = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const archivo = { name: 'p.xlsx', arrayBuffer: async () => bytes }
  const sesion = crearSesion()
  assert.equal(sesion.estado.opciones.categoriasIA, null)
  assert.deepEqual(sesion.estado.ia, { firma: null, decisiones: {} })
  sesion.estado.opciones.categoriasIA = { A: 'B' }
  sesion.estado.ia.firma = 'f1'
  await sesion.cargarOrigen(archivo)
  assert.equal(sesion.estado.opciones.categoriasIA, null)
  assert.equal(sesion.estado.ia.firma, 'f1')
})

test('cargarOrigen: reinicia correcciones, omitidas, valorPorColumna y decisiones', async () => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Código', 'Nombre', 'Costo', 'Precio'], ['A1', 'Camisa', 10, 20],
  ]), 'Productos')
  const bytes = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const archivo = { name: 'p.xlsx', arrayBuffer: async () => bytes }
  const sesion = crearSesion()
  const { estado } = sesion
  assert.deepEqual(estado.opciones.correcciones, {})
  assert.deepEqual(estado.opciones.omitidas, [])
  assert.deepEqual(estado.opciones.valorPorColumna, {})
  assert.deepEqual(estado.decisiones, { ceros: { costo: 0, existencia: 0 }, omitidas: 0, corregidos: 0, valorComun: {} })
  estado.opciones.correcciones = { 5: { costo: 3 } }
  estado.opciones.omitidas = [7]
  estado.opciones.valorPorColumna = { costo: 1 }
  estado.decisiones = { ceros: { costo: 2, existencia: 4 }, omitidas: 1, corregidos: 3, valorComun: { costo: { valor: 1, filas: 5 }, existencia: { valor: 2, filas: 3 } } }
  estado.ia.firma = 'f1'
  await sesion.cargarOrigen(archivo)
  assert.deepEqual(estado.opciones.correcciones, {})
  assert.deepEqual(estado.opciones.omitidas, [])
  assert.deepEqual(estado.opciones.valorPorColumna, {})
  assert.deepEqual(estado.decisiones, { ceros: { costo: 0, existencia: 0 }, omitidas: 0, corregidos: 0, valorComun: {} })
  assert.equal(estado.ia.firma, 'f1')
})

test('cargarOrigen: al cargar otro archivo borra el IVA elegido pero conserva isv', async () => {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Código', 'Nombre', 'Costo', 'Precio'], ['A1', 'Camisa', 10, 20],
  ]), 'Productos')
  const bytes = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const sesion = crearSesion()
  const { opciones } = sesion.estado
  opciones.ivaStrategy = 'todos_igual'; opciones.ivaGeneral = 15; opciones.isv = true
  const r = await sesion.cargarOrigen({ name: 'p.xlsx', arrayBuffer: async () => bytes })
  assert.ok(!r.error)
  assert.equal(opciones.ivaStrategy, undefined)
  assert.equal(opciones.ivaGeneral, undefined)
  assert.equal(opciones.isv, true)
})

test('cargarOrigen: una carga fallida no toca el IVA elegido', async () => {
  const sesion = crearSesion()
  const { opciones } = sesion.estado
  opciones.ivaStrategy = 'por_fila'; opciones.ivaGeneral = 18; opciones.isv = true
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x'], ['y']]), 'Hoja')
  const bytes = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const sinTabla = await sesion.cargarOrigen({ name: 'a.xlsx', arrayBuffer: async () => bytes })
  assert.equal(sinTabla.codigo, 'sin_tabla')
  const ilegible = await sesion.cargarOrigen({ name: 'b.xlsx', arrayBuffer: async () => { throw new Error('x') } })
  assert.equal(ilegible.codigo, 'archivo_ilegible')
  assert.equal(opciones.ivaStrategy, 'por_fila')
  assert.equal(opciones.ivaGeneral, 18)
  assert.equal(opciones.isv, true)
})
