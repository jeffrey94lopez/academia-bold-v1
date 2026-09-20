import test from 'node:test'
import assert from 'node:assert/strict'
import { validarDivision, contadoresTrasDividir } from '../js/gap-split.js'

const PREGUNTAS = [
  { id: 'a', created_at: '2026-09-10T10:00:00Z' },
  { id: 'b', created_at: '2026-09-12T10:00:00Z' },
  { id: 'c', created_at: '2026-09-15T10:00:00Z' },
  { id: 'd', created_at: '2026-09-18T10:00:00Z' },
]

test('validarDivision: selección vacía se rechaza', () => {
  assert.deepEqual(validarDivision(PREGUNTAS, []), { ok: false, motivo: 'seleccion_vacia' })
  assert.deepEqual(validarDivision(PREGUNTAS, null), { ok: false, motivo: 'seleccion_vacia' })
})

test('validarDivision: una pregunta que no es de este vacío se rechaza entera', () => {
  assert.deepEqual(validarDivision(PREGUNTAS, ['a', 'zzz']), { ok: false, motivo: 'pregunta_ajena' })
})

test('validarDivision: seleccionar TODAS se rechaza', () => {
  // Mover todo no divide nada: deja el vacío original con cero preguntas.
  // Si lo que está mal es el título, se edita el título.
  assert.deepEqual(validarDivision(PREGUNTAS, ['a', 'b', 'c', 'd']), { ok: false, motivo: 'seleccion_total' })
})

test('validarDivision: una selección parcial es válida', () => {
  assert.deepEqual(validarDivision(PREGUNTAS, ['b', 'd']), { ok: true })
  assert.deepEqual(validarDivision(PREGUNTAS, ['a']), { ok: true })
})

test('validarDivision: sin preguntas no hay nada que dividir', () => {
  assert.deepEqual(validarDivision([], ['a']), { ok: false, motivo: 'pregunta_ajena' })
})

test('contadoresTrasDividir: reparte totales y fechas entre los dos lados', () => {
  const r = contadoresTrasDividir(PREGUNTAS, ['b', 'd'])
  assert.deepEqual(r.original, {
    preguntas_total: 2,
    primera_vez: '2026-09-10T10:00:00Z',
    ultima_vez: '2026-09-15T10:00:00Z',
  })
  assert.deepEqual(r.nuevo, {
    preguntas_total: 2,
    primera_vez: '2026-09-12T10:00:00Z',
    ultima_vez: '2026-09-18T10:00:00Z',
  })
})

test('contadoresTrasDividir: el ancla del nuevo es la pregunta MÁS ANTIGUA seleccionada', () => {
  // Misma regla con la que nace cualquier vacío: la primera pregunta manda.
  assert.equal(contadoresTrasDividir(PREGUNTAS, ['d', 'b']).anclaPreguntaId, 'b')
  assert.equal(contadoresTrasDividir(PREGUNTAS, ['c']).anclaPreguntaId, 'c')
})

test('contadoresTrasDividir: el orden de entrada no cambia el resultado', () => {
  const a = contadoresTrasDividir(PREGUNTAS, ['b', 'd'])
  const b = contadoresTrasDividir([...PREGUNTAS].reverse(), ['d', 'b'])
  assert.deepEqual(a, b)
})

test('contadoresTrasDividir: una selección inválida lanza', () => {
  assert.throws(() => contadoresTrasDividir(PREGUNTAS, []), /seleccion_vacia/)
  assert.throws(() => contadoresTrasDividir(PREGUNTAS, ['a', 'b', 'c', 'd']), /seleccion_total/)
})
