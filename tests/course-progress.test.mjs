import test from 'node:test'
import assert from 'node:assert/strict'
import { detalleProgreso, resumenProgreso } from '../js/course-progress.js'

// Lecciones del curso, ya ordenadas por curso_orden.
const CURSO = [
  { id: 'a', titulo: 'Apertura de turno' },
  { id: 'b', titulo: 'Creación de ítems' },
  { id: 'c', titulo: 'Cierre de turno' },
]

test('detalleProgreso: una entrada por lección del curso, en orden y numeradas', () => {
  const d = detalleProgreso({}, CURSO)
  assert.deepEqual(d.map(x => [x.n, x.titulo]), [
    [1, 'Apertura de turno'],
    [2, 'Creación de ítems'],
    [3, 'Cierre de turno'],
  ])
})

test('detalleProgreso: trae puntaje y fecha de las aprobadas', () => {
  const d = detalleProgreso({ b: { completado: true, puntaje: 85, fecha: '2026-09-04' } }, CURSO)
  assert.deepEqual(d[1], { n: 2, id: 'b', titulo: 'Creación de ítems', completado: true, puntaje: 85, fecha: '2026-09-04' })
})

test('detalleProgreso: una lección sin progreso queda pendiente y sin puntaje', () => {
  const d = detalleProgreso({ b: { completado: true, puntaje: 85 } }, CURSO)
  assert.deepEqual(d[0], { n: 1, id: 'a', titulo: 'Apertura de turno', completado: false, puntaje: null, fecha: null })
})

test('detalleProgreso: completado false no cuenta como aprobada', () => {
  const d = detalleProgreso({ a: { completado: false, puntaje: 40 } }, CURSO)
  assert.equal(d[0].completado, false)
  assert.equal(d[0].puntaje, null)
})

test('detalleProgreso: ignora progreso de lecciones que no son del curso', () => {
  const d = detalleProgreso({ zzz: { completado: true, puntaje: 100 } }, CURSO)
  assert.equal(d.filter(x => x.completado).length, 0)
  assert.equal(d.length, 3)
})

test('detalleProgreso: compara ids como string (las claves del JSON siempre lo son)', () => {
  const d = detalleProgreso({ 7: { completado: true, puntaje: 90 } }, [{ id: 7, titulo: 'Numérica' }])
  assert.equal(d[0].completado, true)
})

test('detalleProgreso: aguanta null y undefined', () => {
  assert.deepEqual(detalleProgreso(null, null), [])
  assert.equal(detalleProgreso(undefined, CURSO).length, 3)
})

test('resumenProgreso: cuenta, porcentaje y promedio de las aprobadas', () => {
  const d = detalleProgreso({
    a: { completado: true, puntaje: 80 },
    b: { completado: true, puntaje: 90 },
  }, CURSO)
  assert.deepEqual(resumenProgreso(d), { done: 2, total: 3, pct: 67, avg: 85 })
})

test('resumenProgreso: sin lecciones no divide por cero', () => {
  assert.deepEqual(resumenProgreso([]), { done: 0, total: 0, pct: 0, avg: 0 })
})

test('resumenProgreso: sin aprobadas el promedio es 0', () => {
  assert.deepEqual(resumenProgreso(detalleProgreso({}, CURSO)), { done: 0, total: 3, pct: 0, avg: 0 })
})
