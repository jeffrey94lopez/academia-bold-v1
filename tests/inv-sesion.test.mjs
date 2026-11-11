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
