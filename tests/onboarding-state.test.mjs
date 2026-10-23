import test from 'node:test'
import assert from 'node:assert/strict'
import {
  IMPUESTOS, formatCOP, parseMonto, precioTotal,
  crearEstadoInicial, validarItem, crearItem, agregarLinea, cambiarCantidad,
  totalesVenta, pagarVenta, validarGasto, crearGasto,
  CATEGORIAS_GASTO, METODOS_PAGO, movimientosInventario,
  EJEMPLO_ITEM, EJEMPLO_GASTO,
} from '../js/onboarding-state.js'

test('precioTotal y formatCOP como Bold', () => {
  assert.equal(precioTotal(20000, 'iva19'), 23800)
  assert.equal(precioTotal(20000, 'exento'), 20000)
  assert.equal(formatCOP(23800), '$ 23,800')
  assert.equal(formatCOP(1428000), '$ 1,428,000')
})

test('parseMonto', () => {
  for (const s of ['20000', '20,000', '20.000', 20000]) assert.equal(parseMonto(s), 20000)
  for (const s of ['', 'abc', '-5', '0', null]) assert.equal(parseMonto(s), null)
})

test('validarItem exige obligatorios y existencias > 0', () => {
  const r = validarItem({ nombre: '  ', precioBase: 'abc', impuesto: '', existencias: '0' })
  assert.equal(r.ok, false)
  assert.equal(r.errores.nombre, 'Este campo es requerido')
  assert.equal(r.errores.precioBase, 'Ingresa un valor mayor a 0')
  assert.equal(r.errores.impuesto, 'Este campo es requerido')
  assert.equal(r.errores.existencias, 'Ingresa un valor mayor a 0')
})

test('venta del ejemplo del spec: 2 líneas de 20.000 + IVA 19%', () => {
  let s = crearItem(crearEstadoInicial('r1'), { nombre: 'Camiseta', precioBase: '20000', impuesto: 'iva19', existencias: '10' })
  s = agregarLinea(agregarLinea(s))
  assert.equal(s.ventaLineas.length, 2)
  assert.deepEqual(totalesVenta(s), { totalItems: 2, subtotal: 40000, impuesto: 7600, total: 47600 })
  s = pagarVenta(s, 50000)
  assert.equal(s.venta.numero, 'DEMO-0001')
  assert.deepEqual(movimientosInventario(s), [
    { tipo: 'Entrada', cantidad: 10, existencia: 10 },
    { tipo: 'Salida', cantidad: -2, existencia: 8 },
  ])
})

test('no se vende más de lo que hay', () => {
  let s = crearItem(crearEstadoInicial('r1'), { nombre: 'X', precioBase: '1000', impuesto: 'exento', existencias: '1' })
  s = agregarLinea(agregarLinea(s))
  assert.equal(s.ventaLineas.length, 1)
  assert.equal(s.topeAlcanzado, true)
  assert.equal(cambiarCantidad(s, 0, 5).ventaLineas[0].cantidad, 1)
})

test('validarGasto', () => {
  assert.equal(validarGasto({ metodo: 'Efectivo', categoria: 'Servicios públicos', valor: '50000' }).ok, true)
  assert.equal(validarGasto({ metodo: '', categoria: '', valor: '' }).errores.valor, 'Este campo es requerido')
})

test('IMPUESTOS trae los labels y porcentajes exactos del spec', () => {
  assert.deepEqual(IMPUESTOS, [
    { id: 'exento', label: 'Exento', pct: 0 },
    { id: 'iva5', label: 'IVA - 5.00%', pct: 5 },
    { id: 'iva19', label: 'IVA - 19.00%', pct: 19 },
    { id: 'excluido', label: 'Excluido', pct: 0 },
    { id: 'inc8', label: 'INC - 8.00%', pct: 8 },
  ])
})

test('crearEstadoInicial arranca en bienvenida, sin avance', () => {
  const s = crearEstadoInicial('r1')
  assert.deepEqual(s, {
    v: 1, runId: 'r1', step: 'bienvenida', sub: 0, completed: false,
    item: null, ventaLineas: [], venta: null, gasto: null,
  })
})

test('crearItem guarda el ítem demo con código fijo y costo opcional', () => {
  const s = crearItem(crearEstadoInicial('r1'), {
    nombre: '  Camiseta básica  ', precioBase: '20.000', impuesto: 'iva19', costo: '12000', existencias: '10',
  })
  assert.deepEqual(s.item, {
    nombre: 'Camiseta básica', categoria: 'General', precioBase: 20000, impuesto: 'iva19',
    costo: 12000, existencias: 10, codigo: 'I-DEMO-0001', activo: true,
  })
})

test('crearItem sin costo guarda costo null y recorta nombres largos a 80', () => {
  const s = crearItem(crearEstadoInicial('r1'), {
    nombre: 'a'.repeat(100), precioBase: '20000', impuesto: 'iva19', existencias: '10',
  })
  assert.equal(s.item.costo, null)
  assert.equal(s.item.nombre.length, 80)
})

test('agregarLinea es inmutable: no muta el estado recibido', () => {
  const s0 = crearItem(crearEstadoInicial('r1'), EJEMPLO_ITEM)
  const s1 = agregarLinea(s0)
  assert.equal(s0.ventaLineas.length, 0)
  assert.equal(s1.ventaLineas.length, 1)
  assert.notEqual(s0, s1)
})

test('pagarVenta registra fecha ISO y el método Efectivo del demo', () => {
  let s = crearItem(crearEstadoInicial('r1'), EJEMPLO_ITEM)
  s = agregarLinea(s)
  s = pagarVenta(s, 50000)
  assert.equal(s.venta.metodo, 'Efectivo')
  assert.equal(s.venta.recibido, 50000)
  assert.equal(new Date(s.venta.fecha).toISOString(), s.venta.fecha)
})

test('crearGasto arma el número de turno fijo y toma los valores del demo', () => {
  const s = crearGasto(crearEstadoInicial('r1'), EJEMPLO_GASTO)
  assert.deepEqual(s.gasto, {
    numero: 1, metodo: 'Efectivo', categoria: 'Servicios públicos', valor: 50000,
    observaciones: 'Recibo de luz', turno: true, fecha: s.gasto.fecha,
  })
  assert.equal(new Date(s.gasto.fecha).toISOString(), s.gasto.fecha)
})

test('CATEGORIAS_GASTO y METODOS_PAGO exactos del spec', () => {
  assert.deepEqual(CATEGORIAS_GASTO, [
    'Servicios públicos', 'Transporte', 'Nómina', 'Aseo', 'Mantenimiento y reparaciones', 'Arriendo',
  ])
  assert.deepEqual(METODOS_PAGO, ['Bold', 'Efectivo', 'Credibanco', 'Nequi', 'Sistecredito', 'QR'])
})

test('EJEMPLO_ITEM y EJEMPLO_GASTO traen los valores exactos del brief', () => {
  assert.deepEqual(EJEMPLO_ITEM, {
    nombre: 'Camiseta básica', precioBase: '20000', impuesto: 'iva19', costo: '12000', existencias: '10',
  })
  assert.deepEqual(EJEMPLO_GASTO, {
    metodo: 'Efectivo', categoria: 'Servicios públicos', valor: '50000', observaciones: 'Recibo de luz',
  })
})
