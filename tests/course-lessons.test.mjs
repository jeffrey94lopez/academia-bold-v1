import test from 'node:test'
import assert from 'node:assert/strict'
import { parseExamen, esDelCurso, leccionesDelCurso } from '../js/course-lessons.js'

const conExamen = { preguntas: [{ pregunta: '¿?', opciones: ['a', 'b'], correcta: 0 }] }

test('parseExamen: acepta un objeto con preguntas', () => {
  assert.deepEqual(parseExamen({ examen: conExamen }), conExamen)
})

test('parseExamen: acepta el JSON como string (formato legacy)', () => {
  assert.deepEqual(parseExamen({ examen: JSON.stringify(conExamen) }), conExamen)
})

test('parseExamen: null cuando no hay examen', () => {
  assert.equal(parseExamen({ examen: null }), null)
  assert.equal(parseExamen({}), null)
})

test('parseExamen: null cuando el examen no tiene preguntas', () => {
  assert.equal(parseExamen({ examen: { preguntas: [] } }), null)
  assert.equal(parseExamen({ examen: {} }), null)
})

test('parseExamen: un JSON inválido devuelve null en vez de lanzar', () => {
  assert.equal(parseExamen({ examen: '{roto' }), null)
})

test('esDelCurso: activa y con examen', () => {
  assert.equal(esDelCurso({ active: true, examen: conExamen }), true)
})

test('esDelCurso: una lección inactiva no es del curso aunque tenga examen', () => {
  assert.equal(esDelCurso({ active: false, examen: conExamen }), false)
})

test('esDelCurso: una lección activa sin examen no es del curso', () => {
  assert.equal(esDelCurso({ active: true, examen: null }), false)
})

test('leccionesDelCurso: filtra el listado completo', () => {
  const todas = [
    { id: 1, active: true, examen: conExamen },
    { id: 2, active: true, examen: null },
    { id: 3, active: false, examen: conExamen },
    { id: 4, active: true, examen: { preguntas: [] } },
    { id: 5, active: true, examen: JSON.stringify(conExamen) },
  ]
  assert.deepEqual(leccionesDelCurso(todas).map(l => l.id), [1, 5])
})

test('leccionesDelCurso: aguanta null y undefined', () => {
  assert.deepEqual(leccionesDelCurso(null), [])
  assert.deepEqual(leccionesDelCurso(undefined), [])
})
