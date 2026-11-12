import test from 'node:test'
import assert from 'node:assert/strict'
import { mapearColumnas, detectarEncabezado, elegirHoja } from '../js/inv-origen.js'

const ALEGRA_EXPORT = ['Tipo', 'Ítem inventariable', 'Ítem con variantes', 'Venta en negativo', 'Nombre',
  'Código del producto o servicio', 'Referencia', 'Unidad de medida', 'Categoría', 'Descripción',
  'Costo inicial', 'Precio base', 'Impuesto', 'Precio total', 'Precio: General', 'Código cuenta contable',
  'Cuenta contable', 'Código cuenta de inventario', 'Cuenta de inventario',
  'Código cuenta de costo de venta', 'Cuenta de costo de venta']

const ALEGRA_IMPORT = ['Nombre        (Requerido)', 'Precio Total     (Requerido)', 'Precio Base      (Automático)',
  'Unidad de Medida (Requerido)', 'Costo unitario (Requerido para inventariables)',
  'Cantidad inicial en bodega Principal (Requerido para inventariables)', 'Descripción        (Opcional)',
  'Referencia         (Opcional)', 'Nombre impuesto (Opcional)', 'Porcentaje impuesto (Opcional)',
  'Cuenta de ingresos (Opcional)', 'Cuenta de inventario (Opcional)', 'Cuenta de costo de venta (Opcional)',
  'Venta en negativo\n(Opcional)']

const SIIGO = ['Tipo de Producto (obligatorio)', 'Categoría de Inventarios / Servicios (obligatorio)',
  'Código del Producto (obligatorio)', 'Nombre del Producto / Servicio (obligatorio)',
  '¿Inventariable? (obligatorio)', 'Visible en facturas de venta', 'Código Impuesto Cargo',
  '¿Incluye IVA en Precio de Venta?', 'Precio de venta 1', 'Precio de venta 2']

test('export de Alegra: columnas reales, sin confundir códigos fiscales ni cuentas', () => {
  const m = mapearColumnas(ALEGRA_EXPORT)
  assert.equal(m.tipo, 0)
  assert.equal(m.inventariable, 1)
  assert.equal(m.nombre, 4)
  assert.equal(m.referencia, 6)
  assert.equal(m.unidad, 7)
  assert.equal(m.categoria, 8)
  assert.equal(m.descripcion, 9)
  assert.equal(m.costo, 10)
  assert.equal(m.precioBase, 11)
  assert.equal(m.impuesto, 12)
  assert.equal(m.precioTotal, 13)
  assert.equal(m.codigo, undefined, 'el código DIAN no es el código del producto')
  assert.equal(m.existencia, undefined, 'el export de Alegra no trae existencias')
})

test('plantilla de importación de Alegra', () => {
  const m = mapearColumnas(ALEGRA_IMPORT)
  assert.equal(m.nombre, 0)
  assert.equal(m.precioTotal, 1)
  assert.equal(m.precioBase, 2)
  assert.equal(m.unidad, 3)
  assert.equal(m.costo, 4)
  assert.equal(m.existencia, 5)
  assert.equal(m.impuesto, 9)
})

test('modelo personalizado tipo Siigo', () => {
  const m = mapearColumnas(SIIGO)
  assert.equal(m.tipo, 0)
  assert.equal(m.categoria, 1)
  assert.equal(m.codigo, 2)
  assert.equal(m.nombre, 3)
  assert.equal(m.inventariable, 4)
  assert.equal(m.impuesto, 6)
  assert.equal(m.precioTotal, 8)
})

test('detectarEncabezado salta filas de título y elegirHoja escoge la hoja con datos', () => {
  const filas = [['Mi inventario 2026'], [], ['Producto', 'Precio', 'Cantidad'], ['Lápiz', 500, 10]]
  const enc = detectarEncabezado(filas)
  assert.equal(enc.fila, 2)
  assert.deepEqual([enc.mapeo.nombre, enc.mapeo.precioTotal, enc.mapeo.existencia], [0, 1, 2])
  assert.equal(elegirHoja({ Notas: [['hola']], Datos: filas }).nombre, 'Datos')
  assert.equal(detectarEncabezado([['a', 'b'], ['c', 'd']]), null)
})
