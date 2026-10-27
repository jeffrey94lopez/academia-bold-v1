import test from 'node:test'
import assert from 'node:assert/strict'
import { leerPlantilla } from '../js/inv-plantilla.js'
import { convertir, mapearUnidad, mapearImpuesto } from '../js/inv-convertir.js'
import { mapearColumnas } from '../js/inv-origen.js'

// Lo mismo que trae la plantilla real de Bold (ver tests/fixtures).
const INSTRUCCIONES = [
  ['Listado de impuestos:', 'Listado de Unidades:', 'Categorias:', 'Listas de precios:'],
  ['EXENTO', 'Unidades', 'General'], ['IVA-5', 'Metros', 'Restaurante'], ['IVA-19', 'Libras', 'Bebidas'],
  ['EXCLUIDO', 'Kilogramos', 'Platos Fuertes'], ['INC-8', 'Par', 'Complementos'], ['', 'Galones', 'Postres'], ['', 'Gramos', 'Agencia IT'],
]
const hojasInv = (extra = []) => ({
  'Item Inventariable': [
    ['** Revisa la hoja Instrucciones'], ['', '', '** Ver instrucciones'],
    ['Codigo', 'Nombre* (aparece en venta)', 'Categoria*', 'Referencia (Opcional / aparece en venta)',
      'Descripcion (Opcional)', 'Unidad de medida*', 'Precio Costo*', 'Precio Venta Total*',
      'Existencia Inicial en Sucursal-2611 - Sucursal Principal', ...extra],
    ['MM929100', 'MAGIC MOUSE', 'General', '', '', 'Unidades', 98000, 100000, 1],
  ],
  Instrucciones: INSTRUCCIONES,
  'Item con Variantes': [['Código Variante', 'Nombre Ítem*']],
})
const hojasNoInv = () => ({
  'Item No Inventariable': [
    [''], [''],
    ['Codigo', 'Nombre* (aparece en venta)', 'Categoria*', 'Referencia (Opcional / aparece en venta)',
      'Descripcion (Opcional)', 'Unidad de medida*', 'Precio Costo*', 'Precio Venta Total*'],
  ],
  Instrucciones: INSTRUCCIONES,
})

test('leerPlantilla: tipo, sucursal, listas y columnas', () => {
  const p = leerPlantilla(hojasInv())
  assert.equal(p.tipo, 'inventariable')
  assert.equal(p.hoja, 'Item Inventariable')
  assert.equal(p.filaEncabezado, 2)
  assert.equal(p.sucursal, 'Sucursal-2611 - Sucursal Principal')
  assert.equal(p.tieneIsv, false)
  assert.deepEqual(p.listas.impuestos, ['EXENTO', 'IVA-5', 'IVA-19', 'EXCLUIDO', 'INC-8'])
  assert.equal(p.listas.categorias.length, 7)
  assert.equal(p.columnas.find(c => c.campo === 'existencia').idx, 8)
  assert.equal(leerPlantilla(hojasNoInv()).tipo, 'noinventariable')
  assert.equal(leerPlantilla({ Datos: [['a']] }), null)
})

test('leerPlantilla detecta la columna ISV (última) cuando hay facturación electrónica', () => {
  const p = leerPlantilla(hojasInv(['ISV']))
  assert.equal(p.tieneIsv, true)
  assert.equal(p.columnas.at(-1).campo, 'isv')
})

test('mapearUnidad y mapearImpuesto', () => {
  const u = ['Unidades', 'Metros', 'Libras', 'Kilogramos', 'Par']
  assert.equal(mapearUnidad('Unidad', u), 'Unidades')
  assert.equal(mapearUnidad('UND', u), 'Unidades')
  assert.equal(mapearUnidad('kg', u), 'Kilogramos')
  assert.equal(mapearUnidad('Caja', u), null)
  assert.equal(mapearUnidad('Caja', [...u, 'Cajas']), 'Cajas')
  assert.equal(mapearUnidad('Metro', u), 'Metros')
  const t = ['EXENTO', 'IVA-5', 'IVA-19', 'EXCLUIDO', 'INC-8']
  assert.equal(mapearImpuesto(19, t), 'IVA-19')
  assert.equal(mapearImpuesto(0, t), 'EXENTO')
  assert.equal(mapearImpuesto(8, t), 'INC-8')
  assert.equal(mapearImpuesto(7, t), null)
})

const ALEGRA = ['Tipo', 'Ítem inventariable', 'Nombre', 'Referencia', 'Unidad de medida', 'Categoría',
  'Costo inicial', 'Precio base', 'Impuesto', 'Precio total']
const alegraFila = (o = {}) =>
  ['Producto', 'Si', 'Coca Cola 600ml', '', 'Unidad', '', '350050,000000', '5000,000000', '19', '5950']
    .map((v, i) => o[i] ?? v)

test('Alegra → plantilla inventariable (sin ISV)', () => {
  const r = convertir({
    filas: [alegraFila()], mapeo: mapearColumnas(ALEGRA),
    plantillas: { inventariable: leerPlantilla(hojasInv()) },
  })
  assert.equal(r.errores.length, 0)
  assert.deepEqual(r.salidas.inventariable[0], {
    codigo: '', nombre: 'Coca Cola 600ml', categoria: 'General', referencia: '', descripcion: '',
    unidad: 'Unidades', costo: 350050, precioTotal: 5950, existencia: 0,
  })
  const msgs = r.avisos.map(a => a.mensaje).join('|')
  assert.match(msgs, /sin existencia/)
  assert.match(msgs, /sin categoría/)
})

test('con ISV: el 19 se traduce a la opción de la plantilla del cliente', () => {
  const r = convertir({
    filas: [alegraFila()], mapeo: mapearColumnas(ALEGRA),
    plantillas: { inventariable: leerPlantilla(hojasInv(['ISV'])) },
  })
  assert.equal(r.salidas.inventariable[0].isv, 'IVA-19')
})

test('servicio → no inventariable; falta la plantilla → error claro', () => {
  const servicio = alegraFila({ 0: 'Servicio', 1: 'No', 2: 'Instalación' })
  const solo = convertir({ filas: [servicio], mapeo: mapearColumnas(ALEGRA), plantillas: { inventariable: leerPlantilla(hojasInv()) } })
  assert.equal(solo.total, 0)
  assert.match(solo.errores[0].mensaje, /no subiste esa plantilla/)
  const ambas = convertir({
    filas: [servicio], mapeo: mapearColumnas(ALEGRA),
    plantillas: { inventariable: leerPlantilla(hojasInv()), noinventariable: leerPlantilla(hojasNoInv()) },
  })
  assert.equal(ambas.salidas.noinventariable.length, 1)
  assert.equal('existencia' in ambas.salidas.noinventariable[0], false)
})

test('categorías que no existen en Bold se listan; opción de enviarlas a General', () => {
  const base = {
    filas: [alegraFila({ 5: 'Ropa Dama' }), alegraFila({ 5: 'ropa dama', 2: 'Otro' }), alegraFila({ 5: 'bebidas', 2: 'Jugo' })],
    mapeo: mapearColumnas(ALEGRA), plantillas: { inventariable: leerPlantilla(hojasInv()) },
  }
  const r = convertir(base)
  assert.deepEqual(r.categoriasFaltantes, ['Ropa Dama'])
  assert.equal(r.salidas.inventariable[2].categoria, 'Bebidas', 'respeta la ortografía de la plantilla')
  const g = convertir({ ...base, opciones: { categoriasAGeneral: true } })
  assert.deepEqual(g.categoriasFaltantes, [])
  assert.equal(g.salidas.inventariable[0].categoria, 'General')
})

test('unidades desconocidas se piden al cliente y se aplican', () => {
  const filas = [alegraFila({ 4: 'Caja' })]
  const plantillas = { inventariable: leerPlantilla(hojasInv()) }
  assert.deepEqual(convertir({ filas, mapeo: mapearColumnas(ALEGRA), plantillas }).unidadesSinMapa, ['Caja'])
  const r = convertir({ filas, mapeo: mapearColumnas(ALEGRA), plantillas, opciones: { unidades: { Caja: 'Par' } } })
  assert.deepEqual(r.unidadesSinMapa, [])
  assert.equal(r.salidas.inventariable[0].unidad, 'Par')
})

test('errores por fila: sin nombre y precio inválido; filas vacías se ignoran', () => {
  const r = convertir({
    filas: [alegraFila({ 2: ' ' }), alegraFila({ 7: '', 9: 'abc' }), ['', '', '', '', '', '', '', '', '', '']],
    mapeo: mapearColumnas(ALEGRA), plantillas: { inventariable: leerPlantilla(hojasInv()) },
  })
  assert.equal(r.errores.length, 2)
  assert.equal(r.total, 0)
})

test('sin columna de inventariable ni existencia: pregunta; la respuesta decide', () => {
  const mapeo = mapearColumnas(['Producto', 'Precio'])
  const plantillas = { inventariable: leerPlantilla(hojasInv()), noinventariable: leerPlantilla(hojasNoInv()) }
  const filas = [['Lápiz', 500]]
  assert.equal(convertir({ filas, mapeo, plantillas }).pendienteInventariable, true)
  const si = convertir({ filas, mapeo, plantillas, opciones: { inventariable: 'si' } })
  assert.equal(si.pendienteInventariable, false)
  assert.equal(si.salidas.inventariable.length, 1)
})

test('solo precio base + impuesto: calcula el total', () => {
  const mapeo = mapearColumnas(['Nombre', 'Precio base', 'Impuesto', 'Existencia'])
  const r = convertir({ filas: [['X', 1000, 19, 5]], mapeo, plantillas: { inventariable: leerPlantilla(hojasInv()) } })
  assert.equal(r.salidas.inventariable[0].precioTotal, 1190)
  assert.equal(r.salidas.inventariable[0].existencia, 5)
})

test('códigos duplicados y dañados por Excel generan aviso', () => {
  const mapeo = mapearColumnas(['Código', 'Nombre', 'Precio', 'Existencia'])
  const r = convertir({
    filas: [['A1', 'Uno', 1, 1], ['A1', 'Dos', 1, 1], ['7.5E+12', 'Tres', 1, 1]],
    mapeo, plantillas: { inventariable: leerPlantilla(hojasInv()) },
  })
  const msgs = r.avisos.map(a => a.mensaje).join('|')
  assert.match(msgs, /ya está en la fila 1/)
  assert.match(msgs, /notación científica/)
})
