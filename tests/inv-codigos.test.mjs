import test from 'node:test'
import assert from 'node:assert/strict'
import { digitoEan13, digitoUpc, crearGeneradorCodigos } from '../js/inv-codigos.js'
import { validarBarras, parsearEntrada, interpretarFilas, nombresDeFilas } from '../js/barras.js'
import { esIntencionCodigos } from '../js/barras-intencion.js'
import { convertir } from '../js/inv-convertir.js'
import { leerPlantilla } from '../js/inv-plantilla.js'
import { mapearColumnas } from '../js/inv-origen.js'

test('dígitos de control conocidos', () => {
  assert.equal(digitoEan13('400638133393'), 1) // 4006381333931
  assert.equal(digitoEan13('590123412345'), 7) // 5901234123457
  assert.equal(digitoUpc('03600029145'), 2)     // 036000291452
})

test('generador numérico: 13 dígitos con dígito de control válido y consecutivo', () => {
  const g = crearGeneradorCodigos({ formato: 'ean' })
  const a = g('Arroz'), b = g('Leche')
  assert.equal(a.length, 13)
  assert.ok(a.startsWith('200'))
  assert.equal(Number(a[12]), digitoEan13(a.slice(0, 12)))
  assert.notEqual(a, b)
  assert.equal(validarBarras('EAN13', a).valido, true)
})

test('generador por nombre y personalizado', () => {
  const n = crearGeneradorCodigos({ formato: 'nombre' })
  assert.equal(n('Arroz Roa 1kg'), 'ARR-001')
  assert.equal(n('Ñandú'), 'NAN-002')
  assert.equal(n('  '), 'PRD-003')
  const p = crearGeneradorCodigos({ formato: 'personalizado', prefijo: 'TIENDA', inicio: 15, relleno: 4 })
  assert.equal(p('x'), 'TIENDA-0015')
  assert.equal(p('x'), 'TIENDA-0016')
  assert.equal(crearGeneradorCodigos({ formato: 'personalizado', inicio: 7 })('x'), '007')
})

test('generador salta los códigos que ya existen', () => {
  const g = crearGeneradorCodigos({ formato: 'personalizado', prefijo: 'P', inicio: 1, relleno: 3 }, ['P-001', 'P-002'])
  assert.equal(g('x'), 'P-003')
  assert.equal(g('x'), 'P-004')
})

test('validarBarras por formato', () => {
  assert.equal(validarBarras('CODE128', 'Cualquier cosa 1').valido, true)
  assert.equal(validarBarras('CODE128', '').valido, false)
  assert.equal(validarBarras('EAN13', '12345').valido, false)
  assert.equal(validarBarras('EAN13', '4006381333931').valido, true)
  assert.equal(validarBarras('EAN13', '4006381333932').valido, false)
  assert.equal(validarBarras('EAN13', '400638133393').valido, true)
  assert.equal(validarBarras('UPC', '036000291452').valido, true)
  assert.equal(validarBarras('UPC', '036000291453').valido, false)
  assert.equal(validarBarras('CODE39', 'ABC-123').valido, true)
  assert.equal(validarBarras('CODE39', 'abc').valido, false)
})

test('parsearEntrada: línea simple, punto y coma, coma, tabulador', () => {
  const items = parsearEntrada('A1\n\nB2;Leche Colanta 1L\nC3,Arroz, 1kg\nD4\tAceite\tsobra\n')
  assert.deepEqual(items, [
    { codigo: 'A1', texto: '' },
    { codigo: 'B2', texto: 'Leche Colanta 1L' },
    { codigo: 'C3', texto: 'Arroz' },
    { codigo: 'D4', texto: 'Aceite' },
  ])
})

test('interpretarFilas: con títulos y sin títulos', () => {
  assert.deepEqual(interpretarFilas([['Nombre', 'Código'], ['Arroz', 'A1'], ['', ''], ['Sal', 'S2']]),
    [{ codigo: 'A1', texto: 'Arroz' }, { codigo: 'S2', texto: 'Sal' }])
  assert.deepEqual(interpretarFilas([['A1', 'Arroz'], ['S2', 'Sal']]),
    [{ codigo: 'A1', texto: 'Arroz' }, { codigo: 'S2', texto: 'Sal' }])
  assert.deepEqual(interpretarFilas([[7701], [7702]]), [{ codigo: '7701', texto: '' }, { codigo: '7702', texto: '' }])
})

test('nombresDeFilas: columna Nombre o primera columna', () => {
  assert.deepEqual(nombresDeFilas([['Código', 'Nombre'], ['1', 'Arroz'], ['2', 'Sal']]), ['Arroz', 'Sal'])
  assert.deepEqual(nombresDeFilas([['Arroz'], ['Sal']]), ['Arroz', 'Sal'])
})

test('esIntencionCodigos', () => {
  for (const t of ['quiero generar códigos de barras', 'cómo creo un QR', 'necesito imprimir etiquetas', 'crear código qr para mi menú', 'quiero crear códigos para mis productos'])
    assert.equal(esIntencionCodigos(t), true, t)
  for (const t of ['no me lee el lector el código de barras', 'cómo anulo una factura', 'subir mi inventario', 'hola'])
    assert.equal(esIntencionCodigos(t), false, t)
})

const INSTRUCCIONES = [['Listado de impuestos:', 'Listado de Unidades:', 'Categorias:'], ['EXENTO', 'Unidades', 'General']]
const plantilla = leerPlantilla({
  'Item Inventariable': [
    [''], [''],
    ['Codigo', 'Nombre* (aparece en venta)', 'Categoria*', 'Referencia', 'Descripcion', 'Unidad de medida*', 'Precio Costo*', 'Precio Venta Total*', 'Existencia Inicial en Sucursal-1 - X'],
  ],
  Instrucciones: INSTRUCCIONES,
})

test('convertir: sin código se avisa; si el cliente lo pide se crean sin repetir los existentes', () => {
  const mapeo = mapearColumnas(['Código', 'Nombre', 'Precio', 'Existencia'])
  const filas = [['P-001', 'Uno', 1, 1], ['', 'Dos', 1, 1], ['', 'Tres', 1, 1]]
  const base = { filas, mapeo, plantillas: { inventariable: plantilla } }
  assert.equal(convertir(base).sinCodigo, 2)
  const r = convertir({ ...base, opciones: { codigos: { formato: 'personalizado', prefijo: 'P', inicio: 1, relleno: 3 } } })
  assert.equal(r.sinCodigo, 0)
  assert.equal(r.codigosCreados, 2)
  assert.deepEqual(r.salidas.inventariable.map(i => i.codigo), ['P-001', 'P-002', 'P-003'])
  assert.match(r.avisos.map(a => a.mensaje).join('|'), /2 ítem\(s\) no traían código/)
})

test('convertir: sin columna de código todos reciben uno', () => {
  const r = convertir({
    filas: [['Uno', 1, 1], ['Dos', 1, 1]], mapeo: mapearColumnas(['Nombre', 'Precio', 'Existencia']),
    plantillas: { inventariable: plantilla }, opciones: { codigos: { formato: 'ean' } },
  })
  assert.equal(r.codigosCreados, 2)
  assert.ok(r.salidas.inventariable.every(i => /^200\d{10}$/.test(i.codigo)))
})
