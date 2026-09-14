import test from 'node:test'
import assert from 'node:assert/strict'
import { otraVertical, construirCopia, prepararPayload } from '../js/lesson-duplicate.js'

// Lección de ejemplo tal como la devuelve `select('*')` de la tabla lecciones.
function leccionRetail(extra = {}) {
  return {
    id: 'a1b2c3d4-0000-0000-0000-000000000001',
    titulo: 'Cómo cobrar con tarjeta',
    descripcion: 'Pasos para cobrar en el POS',
    contenido: '[{"type":"step","text":"Abre la app"}]',
    notas: 'Nota interna para el bot',
    categoria: 'Ventas',
    orden: 3,
    curso_orden: 7,
    vertical: 'retail',
    plataforma: 'web',
    examen: { preguntas: [{ pregunta: '¿Y?', opciones: ['a', 'b'], correcta: 0 }] },
    active: true,
    bot_active: true,
    embedding: [0.1, 0.2],
    created_at: '2026-01-01T00:00:00Z',
    ...extra,
  }
}

test('otraVertical: retail devuelve restaurantes', () => {
  assert.equal(otraVertical('retail'), 'restaurantes')
})

test('otraVertical: restaurantes devuelve retail', () => {
  assert.equal(otraVertical('restaurantes'), 'retail')
})

// Convención del repo: vertical ausente o desconocida se trata como retail.
test('otraVertical: una vertical ausente cuenta como retail', () => {
  assert.equal(otraVertical(undefined), 'restaurantes')
  assert.equal(otraVertical('marciana'), 'restaurantes')
})

test('construirCopia: no lleva id, para que el guardado haga INSERT', () => {
  assert.equal('id' in construirCopia(leccionRetail()), false)
})

test('construirCopia: el título lleva el sufijo (copia)', () => {
  assert.equal(construirCopia(leccionRetail()).titulo, 'Cómo cobrar con tarjeta (copia)')
})

test('construirCopia: la vertical queda volteada', () => {
  assert.equal(construirCopia(leccionRetail()).vertical, 'restaurantes')
  assert.equal(construirCopia(leccionRetail({ vertical: 'restaurantes' })).vertical, 'retail')
})

// El puesto en el curso es único por lección: la copia va al final (course-order.js)
// en vez de pelear el puesto del original.
test('construirCopia: curso_orden queda vacío', () => {
  assert.equal(construirCopia(leccionRetail()).curso_orden, null)
})

// parseLessonBlocks es quien decide cómo leer el contenido; la copia no debe
// parsear ni reserializar nada (ver lecciones-contenido-doble-formato).
test('construirCopia: el contenido se copia tal cual, sin reprocesar', () => {
  const l = leccionRetail({ contenido: '<p>HTML legacy</p>' })
  assert.equal(construirCopia(l).contenido, '<p>HTML legacy</p>')
})

test('construirCopia: conserva el resto de campos editables', () => {
  const c = construirCopia(leccionRetail())
  assert.equal(c.descripcion, 'Pasos para cobrar en el POS')
  assert.equal(c.notas, 'Nota interna para el bot')
  assert.equal(c.categoria, 'Ventas')
  assert.equal(c.orden, 3)
  assert.equal(c.plataforma, 'web')
  assert.deepEqual(c.examen, { preguntas: [{ pregunta: '¿Y?', opciones: ['a', 'b'], correcta: 0 }] })
})

// El embedding de la copia se genera cuando el admin la termine de adaptar;
// arrastrar el del original la haría visible al bot desde el minuto cero.
test('construirCopia: no arrastra embedding ni metadatos de la fila original', () => {
  const c = construirCopia(leccionRetail())
  assert.equal('embedding' in c, false)
  assert.equal('created_at' in c, false)
  assert.equal('bot_active' in c, false)
})

test('prepararPayload: una copia nace oculta a los estudiantes', () => {
  assert.equal(prepararPayload({ titulo: 'X' }, true).active, false)
})

test('prepararPayload: una lección normal no toca active', () => {
  const p = prepararPayload({ titulo: 'X' }, false)
  assert.equal('active' in p, false)
  assert.equal(p.titulo, 'X')
})

test('prepararPayload: no muta el payload que recibe', () => {
  const original = { titulo: 'X' }
  prepararPayload(original, true)
  assert.equal('active' in original, false)
})
