import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  FASES, ETIQUETA_CAMPO, TAMANO_PAGINA, validarValor, pendientesDeFase, esColumnaCompleta,
  siguienteFase, pagina, conCorreccion, conCeros, conOmitidas, conValorColumna, descripcionMotivo,
} from '../js/inv-correcciones.js'

const pend = (fila, campo, motivo = 'vacio', original = '') => ({ fila, nombre: 'X', campo, motivo, original })
const muchos = (n, campo) => Array.from({ length: n }, (_, i) => pend(i + 2, campo))

test('constantes', () => {
  assert.deepEqual(FASES, ['nombre', 'precioTotal', 'costo', 'existencia'])
  assert.equal(ETIQUETA_CAMPO.precioTotal, 'Precio de venta')
  assert.equal(TAMANO_PAGINA, 50)
})

test('validarValor: nombre', () => {
  assert.deepEqual(validarValor('nombre', ' Lápiz  {x} '), { ok: true, valor: 'Lápiz x' })
  assert.deepEqual(validarValor('nombre', '   '), { ok: false })
  assert.deepEqual(validarValor('nombre', '{}'), { ok: false })
})

test('validarValor: números', () => {
  assert.deepEqual(validarValor('costo', '25000'), { ok: true, valor: 25000 })
  assert.deepEqual(validarValor('existencia', '0'), { ok: true, valor: 0 })
  assert.deepEqual(validarValor('precioTotal', '0'), { ok: true, valor: 0 })
  for (const t of ['-1', 'abc', '', '   ', null, undefined]) {
    assert.deepEqual(validarValor('costo', t), { ok: false }, String(t))
  }
  assert.deepEqual(validarValor('costo', '1,5', 'coma'), { ok: true, valor: 1.5 })
  assert.deepEqual(validarValor('costo', '1.500', 'auto'), { ok: true, valor: 1500 })
})

test('pendientesDeFase y esColumnaCompleta', () => {
  const r = { pendientes: [pend(2, 'costo'), pend(3, 'existencia'), pend(4, 'costo')], columnasSinDato: ['costo'] }
  assert.deepEqual(pendientesDeFase(r, 'costo').map(p => p.fila), [2, 4])
  assert.equal(esColumnaCompleta(r, 'costo'), true)
  assert.equal(esColumnaCompleta(r, 'existencia'), false)
})

test('siguienteFase respeta el orden', () => {
  assert.equal(siguienteFase({ pendientes: [pend(2, 'existencia'), pend(3, 'precioTotal')] }), 'precioTotal')
  assert.equal(siguienteFase({ pendientes: [] }), null)
})

test('pagina corta a 50', () => {
  const lista = muchos(120, 'costo')
  const p = pagina(lista)
  assert.equal(p.length, 50)
  assert.deepEqual(p, lista.slice(0, 50))
})

test('conCeros aplica a todas las filas, no solo a la pagina, sin mutar', () => {
  const op = { correcciones: { 2: { nombre: 'A' } }, omitidas: [1] }
  const copia = structuredClone(op)
  const lista = muchos(120, 'costo')
  const nuevo = conCeros(op, lista)
  assert.equal(pagina(lista).length, 50)
  for (const p of lista) assert.equal(nuevo.correcciones[p.fila].costo, 0)
  assert.equal(nuevo.correcciones[2].nombre, 'A')
  assert.deepEqual(op, copia)
})

test('conCorreccion copia y no muta', () => {
  const op = { correcciones: { 5: { costo: 1 } } }
  const copia = structuredClone(op)
  const nuevo = conCorreccion(op, 5, 'existencia', 3)
  assert.deepEqual(nuevo.correcciones[5], { costo: 1, existencia: 3 })
  assert.deepEqual(op, copia)
  assert.deepEqual(conCorreccion({}, 7, 'nombre', 'Z').correcciones[7], { nombre: 'Z' })
})

test('conOmitidas agrega numeros sin duplicar y no muta', () => {
  const op = { omitidas: [3] }
  const nuevo = conOmitidas(op, [3, '4', 4, 5])
  assert.deepEqual(nuevo.omitidas, [3, 4, 5])
  assert.deepEqual(op.omitidas, [3])
  assert.deepEqual(conOmitidas({}, [2]).omitidas, [2])
})

test('conValorColumna fija el valor sin mutar', () => {
  const op = { valorPorColumna: { costo: 9 } }
  const nuevo = conValorColumna(op, 'existencia', 0)
  assert.deepEqual(nuevo.valorPorColumna, { costo: 9, existencia: 0 })
  assert.deepEqual(op.valorPorColumna, { costo: 9 })
})

test('descripcionMotivo', () => {
  assert.equal(descripcionMotivo(pend(2, 'existencia', 'negativo', -4)), 'Existencia es negativa (−4)')
  assert.equal(descripcionMotivo(pend(2, 'costo', 'vacio')), 'Costo está vacío')
  assert.equal(descripcionMotivo(pend(2, 'precioTotal', 'invalido', 'abc')), 'Precio de venta no es un número (abc)')
})
