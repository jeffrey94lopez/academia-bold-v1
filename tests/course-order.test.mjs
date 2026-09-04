import test from 'node:test'
import assert from 'node:assert/strict'
import { ordenarCurso } from '../js/course-order.js'

const titulos = ls => ordenarCurso(ls).map(l => l.titulo)

test('ordenarCurso: ordena por curso_orden ascendente', () => {
  const lecciones = [
    { titulo: 'Cierre', curso_orden: 6, orden: 2 },
    { titulo: 'Apertura', curso_orden: 1, orden: 1 },
    { titulo: 'Venta', curso_orden: 4, orden: 4 },
  ]
  assert.deepEqual(titulos(lecciones), ['Apertura', 'Venta', 'Cierre'])
})

test('ordenarCurso: las lecciones sin curso_orden van al final', () => {
  const lecciones = [
    { titulo: 'Suelta', curso_orden: null, orden: 1 },
    { titulo: 'Apertura', curso_orden: 1, orden: 1 },
  ]
  assert.deepEqual(titulos(lecciones), ['Apertura', 'Suelta'])
})

test('ordenarCurso: curso_orden ausente (columna todavía sin migrar) también va al final', () => {
  const lecciones = [
    { titulo: 'Legacy', orden: 1 },
    { titulo: 'Apertura', curso_orden: 1, orden: 1 },
  ]
  assert.deepEqual(titulos(lecciones), ['Apertura', 'Legacy'])
})

test('ordenarCurso: sin curso_orden en ninguna, desempata por orden', () => {
  const lecciones = [
    { titulo: 'Cierre', orden: 2 },
    { titulo: 'Apertura', orden: 1 },
    { titulo: 'Venta', orden: 4 },
  ]
  assert.deepEqual(titulos(lecciones), ['Apertura', 'Cierre', 'Venta'])
})

test('ordenarCurso: con el mismo orden, desempata por título', () => {
  const lecciones = [
    { titulo: 'Registro de gastos', orden: 1 },
    { titulo: 'Apertura de turno', orden: 1 },
    { titulo: 'Creación de ítems', orden: 1 },
  ]
  assert.deepEqual(titulos(lecciones), ['Apertura de turno', 'Creación de ítems', 'Registro de gastos'])
})

test('ordenarCurso: no muta el arreglo que recibe', () => {
  const lecciones = [
    { titulo: 'Cierre', curso_orden: 6 },
    { titulo: 'Apertura', curso_orden: 1 },
  ]
  ordenarCurso(lecciones)
  assert.deepEqual(lecciones.map(l => l.titulo), ['Cierre', 'Apertura'])
})

test('ordenarCurso: un arreglo vacío no revienta', () => {
  assert.deepEqual(ordenarCurso([]), [])
})
