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

// Costo y existencia ya no se inventan en 0: los tests que no los miran los traen en el archivo.
const conDatos = (encabezados, filas) => ({
  mapeo: mapearColumnas([...encabezados, 'Costo', 'Existencia']),
  filas: filas.map(f => [...f, 100, 1]),
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

// Igual que Alegra pero con la existencia en el archivo.
const ALEGRA_EX = [...ALEGRA, 'Existencia']
const alegraFilaEx = (o = {}) => [...alegraFila(o), 5]

test('Alegra → plantilla inventariable (sin ISV)', () => {
  const r = convertir({
    filas: [alegraFila()], mapeo: mapearColumnas(ALEGRA),
    plantillas: { inventariable: leerPlantilla(hojasInv()) },
  })
  assert.equal(r.errores.length, 0)
  // Sin columna de existencia no se inventa un 0: la fila queda pendiente.
  assert.equal(r.salidas.inventariable.length, 0)
  assert.deepEqual(r.pendientes.map(p => p.campo), ['existencia'])
  assert.deepEqual(r.columnasSinDato, ['existencia'])
})

test('con ISV: el 19 se traduce a la opción de la plantilla del cliente', () => {
  const r = convertir({
    filas: [alegraFilaEx()], mapeo: mapearColumnas(ALEGRA_EX),
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
    filas: [alegraFilaEx({ 5: 'Ropa Dama' }), alegraFilaEx({ 5: 'ropa dama', 2: 'Otro' }), alegraFilaEx({ 5: 'bebidas', 2: 'Jugo' })],
    mapeo: mapearColumnas(ALEGRA_EX), plantillas: { inventariable: leerPlantilla(hojasInv()) },
  }
  const r = convertir(base)
  assert.deepEqual(r.categoriasFaltantes, ['Ropa Dama'])
  assert.equal(r.salidas.inventariable[2].categoria, 'Bebidas', 'respeta la ortografía de la plantilla')
  const g = convertir({ ...base, opciones: { categoriasAGeneral: true } })
  assert.deepEqual(g.categoriasFaltantes, [])
  assert.equal(g.salidas.inventariable[0].categoria, 'General')
})

test('unidades desconocidas se piden al cliente y se aplican', () => {
  const filas = [alegraFilaEx({ 4: 'Caja' })]
  const plantillas = { inventariable: leerPlantilla(hojasInv()) }
  assert.deepEqual(convertir({ filas, mapeo: mapearColumnas(ALEGRA_EX), plantillas }).unidadesSinMapa, ['Caja'])
  const r = convertir({ filas, mapeo: mapearColumnas(ALEGRA_EX), plantillas, opciones: { unidades: { Caja: 'Par' } } })
  assert.deepEqual(r.unidadesSinMapa, [])
  assert.equal(r.salidas.inventariable[0].unidad, 'Par')
})

test('errores por fila: sin nombre y precio inválido; filas vacías se ignoran', () => {
  const r = convertir({
    filas: [alegraFila({ 2: ' ' }), alegraFila({ 7: '', 9: 'abc' }), ['', '', '', '', '', '', '', '', '', '']],
    mapeo: mapearColumnas(ALEGRA), plantillas: { inventariable: leerPlantilla(hojasInv()) },
  })
  assert.equal(r.errores.length, 0)
  assert.equal(r.total, 0)
  const nombre = r.pendientes.find(p => p.campo === 'nombre')
  assert.deepEqual([nombre.fila, nombre.motivo, nombre.nombre], [1, 'vacio', '(sin nombre)'])
  const precio = r.pendientes.find(p => p.campo === 'precioTotal')
  assert.deepEqual([precio.fila, precio.motivo, precio.original], [2, 'invalido', 'abc'])
})

test('sin columna de inventariable ni existencia: pregunta; la respuesta decide', () => {
  const mapeo = mapearColumnas(['Producto', 'Precio', 'Costo'])
  const plantillas = { inventariable: leerPlantilla(hojasInv()), noinventariable: leerPlantilla(hojasNoInv()) }
  const filas = [['Lápiz', 500, 200]]
  assert.equal(convertir({ filas, mapeo, plantillas }).pendienteInventariable, true)
  const si = convertir({ filas, mapeo, plantillas, opciones: { inventariable: 'si' } })
  assert.equal(si.pendienteInventariable, false)
  assert.equal(si.pendientes.map(p => p.campo).join(), 'existencia') // inventariable pero sin existencia
  const no = convertir({ filas, mapeo, plantillas, opciones: { inventariable: 'no' } })
  assert.equal(no.salidas.noinventariable.length, 1)
})

test('solo precio base + impuesto: calcula el total', () => {
  const mapeo = mapearColumnas(['Nombre', 'Precio base', 'Impuesto', 'Existencia', 'Costo'])
  const r = convertir({ filas: [['X', 1000, 19, 5, 100]], mapeo, plantillas: { inventariable: leerPlantilla(hojasInv()) } })
  assert.equal(r.salidas.inventariable[0].precioTotal, 1190)
  assert.equal(r.salidas.inventariable[0].existencia, 5)
})

test('códigos duplicados y dañados por Excel generan aviso', () => {
  const mapeo = mapearColumnas(['Código', 'Nombre', 'Precio', 'Existencia', 'Costo'])
  const r = convertir({
    filas: [['A1', 'Uno', 1, 1, 1], ['A1', 'Dos', 1, 1, 1], ['7.5E+12', 'Tres', 1, 1, 1]],
    mapeo, plantillas: { inventariable: leerPlantilla(hojasInv()) },
  })
  const msgs = r.avisos.map(a => a.mensaje).join('|')
  assert.match(msgs, /ya está en la fila 1/)
  assert.match(msgs, /notación científica/)
})

test('convertir: aplica sanear a los campos de texto de salida', () => {
  const p = leerPlantilla(hojasInv())
  const encabezados = ['Nombre', 'Precio de venta total', 'Codigo', 'Descripcion', 'Existencia']
  const mapeo = mapearColumnas(encabezados)
  const filas = [
    ['Café`especial {promo}', 12000, 'A°1', '¡Hola! mundo', 5],
  ]
  const r = convertir({ ...conDatos(encabezados, filas), plantillas: { inventariable: p }, opciones: {} })
  const out = r.salidas.inventariable[0]
  assert.equal(out.nombre, "Café'especial promo")
  assert.equal(out.codigo, 'A#1')
  assert.equal(out.descripcion, 'Hola mundo')
})

test('convertir: aplica el purgador a las categorías del archivo', () => {
  const p = leerPlantilla(hojasInv())
  const encabezados = ['Nombre', 'Precio', 'Categoria']
  const mapeo = mapearColumnas(encabezados)
  const filas = [
    ['Camisa A', '10000', 'CAMISA'],
    ['Camisa B', '10000', 'camisa'],
    ['Camisa C', '10000', 'Camisas'],
  ]
  const r = convertir({ ...conDatos(encabezados, filas), plantillas: { inventariable: p }, opciones: { inventariable: 'si' } })
  // Las 3 filas quedan con la misma canónica (singular/plural + case).
  const cats = r.salidas.inventariable.map(x => x.categoria)
  assert.equal(new Set(cats).size, 1)
})

test('convertir: aplica el purgador a las unidades del archivo', () => {
  const p = leerPlantilla(hojasInv())
  const encabezados = ['Nombre', 'Precio', 'Unidad']
  const mapeo = mapearColumnas(encabezados)
  const filas = [
    ['Arroz 500g', '5000', 'Gramos'],
    ['Arroz 1kg',  '9000', 'GRAMOS'],
    ['Arroz 2kg', '17000', 'gramos'],
  ]
  const r = convertir({ ...conDatos(encabezados, filas), plantillas: { inventariable: p }, opciones: { inventariable: 'si' } })
  const unidades = r.salidas.inventariable.map(x => x.unidad)
  assert.equal(new Set(unidades).size, 1)
  // La unidad final es la que matchea con la lista de la plantilla.
  assert.equal(unidades[0], 'Gramos')
})

test('convertir: IVA por_fila sin ivaGeneral → cada fila usa su propio valor', () => {
  const p = leerPlantilla(hojasInv([['Impuesto*']]))
  const encabezados = ['Nombre', 'Precio', 'Impuesto']
  const mapeo = mapearColumnas(encabezados)
  const filas = [
    ['A', '10000', '19'],
    ['B', '10000', '5'],
  ]
  const r = convertir({
    ...conDatos(encabezados, filas), plantillas: { inventariable: p },
    opciones: { isv: true, ivaStrategy: 'por_fila', inventariable: 'si' },
  })
  assert.equal(r.salidas.inventariable[0].isv, 'IVA-19')
  assert.equal(r.salidas.inventariable[1].isv, 'IVA-5')
})

test('convertir: IVA por_fila con ivaGeneral de fallback — Caso C respetar', () => {
  const p = leerPlantilla(hojasInv([['Impuesto*']]))
  const encabezados = ['Nombre', 'Precio', 'Impuesto']
  const mapeo = mapearColumnas(encabezados)
  const filas = [
    ['A', '10000', '5'],    // trae IVA → respeta
    ['B', '10000', ''],     // vacío → cae al general IVA-19
  ]
  const r = convertir({
    ...conDatos(encabezados, filas), plantillas: { inventariable: p },
    opciones: { isv: true, ivaStrategy: 'por_fila', ivaGeneral: 'IVA-19', inventariable: 'si' },
  })
  assert.equal(r.salidas.inventariable[0].isv, 'IVA-5')
  assert.equal(r.salidas.inventariable[1].isv, 'IVA-19')
})

test('convertir: IVA todos_igual → aplica ivaGeneral a todas, ignora el archivo', () => {
  const p = leerPlantilla(hojasInv([['Impuesto*']]))
  const encabezados = ['Nombre', 'Precio', 'Impuesto']
  const mapeo = mapearColumnas(encabezados)
  const filas = [
    ['A', '10000', '5'],
    ['B', '10000', '19'],
  ]
  const r = convertir({
    ...conDatos(encabezados, filas), plantillas: { inventariable: p },
    opciones: { isv: true, ivaStrategy: 'todos_igual', ivaGeneral: 'IVA-19', inventariable: 'si' },
  })
  assert.equal(r.salidas.inventariable[0].isv, 'IVA-19')
  assert.equal(r.salidas.inventariable[1].isv, 'IVA-19')
})

test('convertir: IVA — por_fila sin general y fila vacía → EXENTO (backward compat)', () => {
  const p = leerPlantilla(hojasInv([['Impuesto*']]))
  const encabezados = ['Nombre', 'Precio', 'Impuesto']
  const mapeo = mapearColumnas(encabezados)
  const filas = [['A', '10000', '']]
  const r = convertir({
    ...conDatos(encabezados, filas), plantillas: { inventariable: p },
    opciones: { isv: true, ivaStrategy: 'por_fila', inventariable: 'si' },
  })
  assert.equal(r.salidas.inventariable[0].isv, 'EXENTO')
})

test('convertir: fila con basura solo en columna no mapeada → omitida silenciosa', () => {
  const p = leerPlantilla(hojasInv())
  // "Observaciones" no está en el mapeo del conversor → basura ignorable.
  const encabezados = ['Nombre', 'Precio', 'Observaciones', 'Costo', 'Existencia']
  const mapeo = mapearColumnas(encabezados)
  const filas = [
    ['Producto 1', '10000', 'ok', 100, 1],
    ['', '', '-- Separador de sección --', '', ''],  // basura solo en no-mapeada
    ['Producto 2', '20000', '', 100, 1],
  ]
  const r = convertir({ filas, mapeo, plantillas: { inventariable: p }, opciones: { inventariable: 'si' } })
  assert.equal(r.salidas.inventariable.length, 2)
  // No se contó como error:
  assert.equal(r.errores.length, 0)
  // Y tampoco quedó como pendiente: se omitió en silencio.
  assert.equal(r.pendientes.length, 0)
})

test('convertir: fila con nombre pero sin precio → error (regresión)', () => {
  const p = leerPlantilla(hojasInv())
  const encabezados = ['Nombre', 'Precio', 'Costo', 'Existencia']
  const mapeo = mapearColumnas(encabezados)
  const filas = [
    ['Producto completo', '10000', 5000, 3],
    ['Producto sin precio', '', 5000, 3],
  ]
  const r = convertir({ filas, mapeo, plantillas: { inventariable: p }, opciones: { inventariable: 'si' } })
  assert.equal(r.salidas.inventariable.length, 1)
  assert.equal(r.errores.length, 0)
  assert.equal(r.pendientes.length, 1)
  assert.equal(r.pendientes[0].campo, 'precioTotal')
})

const conv = (encabezados, filas, opciones = { inventariable: 'si' }) =>
  convertir({
    filas, mapeo: mapearColumnas(encabezados), opciones,
    plantillas: { inventariable: leerPlantilla(hojasInv()), noinventariable: leerPlantilla(hojasNoInv()) },
  })
const ENC4 = ['Nombre', 'Precio', 'Costo', 'Existencia']

test('convertir: precio inválido es pendiente, no error ni fila exportada', () => {
  const r = conv(['Nombre', 'Precio', 'Costo'], [['Camisa', 'abc', 5], ['Pan', 1000, 5]], { inventariable: 'no' })
  assert.deepEqual(r.pendientes, [{ fila: 1, nombre: 'Camisa', campo: 'precioTotal', motivo: 'invalido', original: 'abc' }])
  assert.equal(r.errores.length, 0)
  assert.equal(r.salidas.noinventariable.length, 1)
})

test('convertir: motivos vacio / invalido / negativo en precio, costo y existencia', () => {
  const r = conv(ENC4, [['A', '', 5, 1], ['B', -3, 5, 1], ['C', 9, 'x', 1], ['D', 9, -1, 1], ['E', 9, 5, -4], ['F', 9, 5, '']])
  const por = Object.fromEntries(r.pendientes.map(p => [p.nombre, [p.campo, p.motivo]]))
  assert.deepEqual(por, {
    A: ['precioTotal', 'vacio'], B: ['precioTotal', 'negativo'], C: ['costo', 'invalido'],
    D: ['costo', 'negativo'], E: ['existencia', 'negativo'], F: ['existencia', 'vacio'],
  })
  assert.equal(r.total, 0)
})

test('convertir: nada se pone en 0 por su cuenta', () => {
  const r = conv(ENC4, [['G', 9, '', '']])
  assert.equal(r.salidas.inventariable.length, 0)
  assert.doesNotMatch(r.avisos.map(a => a.mensaje).join('|'), /quedaron en 0/)
})

test('convertir: un 0 que viene en el archivo es válido', () => {
  const r = conv(ENC4, [['H', 0, 0, 0]])
  assert.equal(r.pendientes.length, 0)
  const o = r.salidas.inventariable[0]
  assert.deepEqual([o.costo, o.precioTotal, o.existencia], [0, 0, 0])
})

test('convertir: nombre vacío con otros datos es pendiente nombre', () => {
  const r = conv(ENC4, [['  ', 500, 5, 1]])
  assert.equal(r.pendientes.length, 1)
  assert.deepEqual([r.pendientes[0].campo, r.pendientes[0].motivo, r.pendientes[0].nombre], ['nombre', 'vacio', '(sin nombre)'])
})

test('convertir: una fila con dos campos pendientes los reporta ambos', () => {
  const r = conv(ENC4, [['I', 9, '', -2]])
  assert.deepEqual(r.pendientes.map(p => p.campo), ['costo', 'existencia'])
})

test('convertir: columnasSinDato', () => {
  const sin = conv(['Nombre', 'Precio'], [['a', 1], ['b', 2], ['c', 3]])
  assert.ok(sin.columnasSinDato.includes('costo'))
  assert.ok(sin.columnasSinDato.includes('existencia'))
  const con = conv(['Nombre', 'Precio', 'Costo'], [['a', 1, ''], ['b', 2, 4], ['c', 3, '']])
  assert.ok(!con.columnasSinDato.includes('costo'))
  assert.ok(con.columnasSinDato.includes('existencia'))
})

test('convertir: existencia solo cuenta para inventariables', () => {
  const r = conv(['Nombre', 'Precio', 'Costo'], [['a', 1, 2]], { inventariable: 'no' })
  assert.ok(!r.pendientes.some(p => p.campo === 'existencia'))
  assert.ok(!r.columnasSinDato.includes('existencia'))
})

// categoriasIA: el mapeo de la IA se aplica tras el heurístico y antes de validar contra Bold.
const hojasSoloGeneral = () => {
  const h = hojasInv()
  h.Instrucciones = [
    ['Listado de impuestos:', 'Listado de Unidades:', 'Categorias:', 'Listas de precios:'],
    ['EXENTO', 'Unidades', 'General'],
  ]
  return h
}
const baseIA = () => ({
  filas: [alegraFilaEx({ 5: 'BEBIDA FRIA' }), alegraFilaEx({ 5: 'Bebidas', 2: 'Jugo' }), alegraFilaEx({ 5: 'Aseo', 2: 'Jabon' })],
  mapeo: mapearColumnas(ALEGRA_EX), plantillas: { inventariable: leerPlantilla(hojasSoloGeneral()) },
})

test('categoriasIA: agrupa la categoría y la fila sale con el nombre final', () => {
  const r = convertir({ ...baseIA(), opciones: { categoriasIA: { 'BEBIDA FRIA': 'Bebidas' } } })
  assert.equal(r.categoriasFaltantes.length, 2)
  assert.deepEqual([...r.categoriasFaltantes].sort(), ['Aseo', 'Bebidas'])
  assert.equal(r.salidas.inventariable[0].categoria, 'Bebidas')
})

test('categoriasIA: categoriasAGeneral sigue ganando', () => {
  const r = convertir({ ...baseIA(), opciones: { categoriasAGeneral: true, categoriasIA: { 'BEBIDA FRIA': 'Bebidas' } } })
  assert.deepEqual(r.categoriasFaltantes, [])
  assert.ok(r.salidas.inventariable.every(s => s.categoria === 'General'))
})

test('convertir expone categoriasPurgadas y unidadesPurgadas', () => {
  const r = convertir({
    filas: [alegraFila({ 5: 'Camisa' }), alegraFila({ 5: 'Camisas', 2: 'Otra' })],
    mapeo: mapearColumnas(ALEGRA), plantillas: { inventariable: leerPlantilla(hojasSoloGeneral()) },
  })
  assert.equal(r.categoriasPurgadas.length, 1)
  assert.match(r.categoriasPurgadas[0], /^Camisas?$/)
  assert.deepEqual(r.unidadesPurgadas, ['Unidad'])
})

test('categoria "constructor" no rompe con categoriasIA vacio ni con unidades', () => {
  const r = convertir({
    filas: [alegraFilaEx({ 5: 'constructor', 4: 'toString' })],
    mapeo: mapearColumnas(ALEGRA_EX), plantillas: { inventariable: leerPlantilla(hojasSoloGeneral()) },
    opciones: { categoriasIA: {}, unidades: {} },
  })
  assert.equal(r.salidas.inventariable[0].categoria, 'constructor')
})

// Task 2: correcciones, omitidas y valor por columna.
test('convertir: la corrección sustituye al dato del archivo', () => {
  const r = conv(['Nombre', 'Precio', 'Costo'], [['Camisa', 'abc', 5]], { inventariable: 'no', correcciones: { 1: { precioTotal: 25000 } } })
  assert.equal(r.pendientes.length, 0)
  assert.equal(r.salidas.noinventariable[0].precioTotal, 25000)
})

test('convertir: corregir nombre', () => {
  const r = conv(['Nombre', 'Precio', 'Costo'], [['', 500, 5]], { inventariable: 'no', correcciones: { 1: { nombre: 'Lápiz' } } })
  assert.equal(r.pendientes.length, 0)
  assert.equal(r.salidas.noinventariable[0].nombre, 'Lápiz')
})

test('convertir: omitir fila de precio la saca sin pendientes y la lista como error', () => {
  const r = conv(['Nombre', 'Precio'], [['Camisa', 'abc']], { inventariable: 'no', omitidas: [1] })
  assert.equal(r.pendientes.length, 0)
  assert.equal(r.salidas.noinventariable.length, 0)
  assert.equal(r.errores.length, 1)
  assert.equal(r.errores[0].codigo, 'filas_precio')
  assert.equal(r.errores[0].fila, 1)
  assert.match(r.errores[0].mensaje, /omitiste/)
})

test('convertir: omitir fila de nombre usa el código filas_nombre', () => {
  const r = conv(['Nombre', 'Precio'], [['', 500]], { inventariable: 'no', omitidas: [1] })
  assert.equal(r.errores.length, 1)
  assert.equal(r.errores[0].codigo, 'filas_nombre')
})

test('convertir: una fila omitida no genera pendientes de costo ni existencia', () => {
  const r = conv(ENC4, [['J', 'abc', '', '']], { inventariable: 'si', omitidas: [1] })
  assert.equal(r.pendientes.length, 0)
  assert.equal(r.total, 0)
})

test('convertir: omitir una fila sin pendiente de nombre/precio igual queda en el reporte', () => {
  const r = conv(ENC4, [['K', 9, '', 1]], { inventariable: 'si', omitidas: [1] })
  assert.equal(r.pendientes.length, 0)
  assert.equal(r.total, 0)
  assert.equal(r.errores.length, 1)
  assert.equal(r.errores[0].codigo, 'filas_omitida')
  assert.equal(r.errores[0].fila, 1)
  assert.equal(r.errores[0].mensaje, '"K": la omitiste.')
})

test('convertir: valorPorColumna llena solo los vacíos', () => {
  const r = conv(ENC4, [['A', 9, '', 5], ['B', 9, -1, 5]], { inventariable: 'si', valorPorColumna: { costo: 0 } })
  assert.equal(r.salidas.inventariable.length, 1)
  assert.equal(r.salidas.inventariable[0].nombre, 'A')
  assert.equal(r.salidas.inventariable[0].costo, 0)
  assert.deepEqual(r.pendientes.map(p => [p.nombre, p.campo, p.motivo]), [['B', 'costo', 'negativo']])
})

test('convertir: valorPorColumna existencia deja 0 a propósito sin avisos de "quedaron en 0"', () => {
  const r = convertir({
    filas: [alegraFila()], mapeo: mapearColumnas(ALEGRA),
    plantillas: { inventariable: leerPlantilla(hojasInv()) },
    opciones: { valorPorColumna: { existencia: 0 } },
  })
  assert.deepEqual(r.salidas.inventariable[0], {
    codigo: '', nombre: 'Coca Cola 600ml', categoria: 'General', referencia: '', descripcion: '',
    unidad: 'Unidades', costo: 350050, precioTotal: 5950, existencia: 0,
  })
  assert.doesNotMatch(r.avisos.map(a => a.mensaje).join('|'), /quedaron en 0/)
})

test('convertir: una fila con costo y existencia pendientes se resuelve por campo', () => {
  const op = { inventariable: 'si' }
  const uno = conv(ENC4, [['I', 9, '', -2]], { ...op, correcciones: { 1: { costo: 7 } } })
  assert.deepEqual(uno.pendientes.map(p => p.campo), ['existencia'])
  const dos = conv(ENC4, [['I', 9, '', -2]], { ...op, correcciones: { 1: { costo: 7, existencia: 3 } } })
  assert.equal(dos.pendientes.length, 0)
  assert.equal(dos.total, 1)
})

test('convertir: las correcciones se leen con hasOwn (una fila "constructor" no rompe)', () => {
  const r = conv(ENC4, [['A', 9, 1, 1]], { inventariable: 'si', correcciones: {} })
  assert.equal(r.total, 1)
})

test('convertir: un producto llamado "-5" no es pendiente de nombre', () => {
  const r = conv(['Nombre', 'Precio', 'Costo'], [['-5', 100, 5]], { inventariable: 'no' })
  assert.ok(!r.pendientes.some(p => p.campo === 'nombre'))
  assert.equal(r.salidas.noinventariable[0].nombre, '-5')
})

// Purgado: el prefijo numérico de la categoría ("01 - Bebidas") se quita ANTES de unir duplicados.
const ENC5 = ['Nombre', 'Precio', 'Costo', 'Existencia', 'Categoria', 'Unidad']
test('purgado: "01 - Bebidas" y "Bebidas" son la misma categoría', () => {
  const r = conv(ENC5, [['A', 9, 1, 1, '01 - Bebidas', 'Unidad'], ['B', 9, 1, 1, 'Bebidas', 'Unidad'], ['C', 9, 1, 1, '2 - Aseo', 'Unidad']])
  assert.deepEqual(r.salidas.inventariable.map(x => x.categoria), ['Bebidas', 'Bebidas', 'Aseo'])
  assert.deepEqual([...r.categoriasPurgadas].sort(), ['Aseo', 'Bebidas'])
  assert.deepEqual(r.categoriasFaltantes, ['Aseo'])
})

test('purgado: una categoría que es solo prefijo no queda vacía ni se rompe', () => {
  const r = conv(ENC5, [['A', 9, 1, 1, '01 -', 'Unidad']])
  assert.equal(r.total, 1)
})

// Purgado: lo que el cliente omitió no cuenta como categoría ni unidad del archivo.
test('purgado: las filas omitidas no aportan categorías ni unidades', () => {
  const filas = [['A', 9, 1, 1, 'Bebidas', 'Unidad'], ['B', 9, 1, 1, 'Ferretería', 'Cja']]
  const r = conv(ENC5, filas, { inventariable: 'si', omitidas: [2] })
  assert.deepEqual(r.categoriasPurgadas, ['Bebidas'])
  assert.deepEqual(r.unidadesPurgadas, ['Unidad'])
  assert.deepEqual(r.categoriasFaltantes, [])
})
