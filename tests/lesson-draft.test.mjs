import test from 'node:test'
import assert from 'node:assert/strict'
import {
  draftKey, isMeaningfulDraft, buildDraft, shouldOfferRestore, relTime,
} from '../js/lesson-draft.js'

test('draftKey: nuevas comparten "new", existentes usan su id', () => {
  assert.equal(draftKey(''), 'bold_lesson_draft_new')
  assert.equal(draftKey(null), 'bold_lesson_draft_new')
  assert.equal(draftKey('807d3bb9'), 'bold_lesson_draft_807d3bb9')
})

test('isMeaningfulDraft: vacío = false, con cualquier contenido = true', () => {
  assert.equal(isMeaningfulDraft(null), false)
  assert.equal(isMeaningfulDraft({ titulo: '', descripcion: '', notas: '', blocks: [], questions: [] }), false)
  assert.equal(isMeaningfulDraft({ titulo: '  ' }), false)          // solo espacios
  assert.equal(isMeaningfulDraft({ titulo: 'Punto de venta' }), true)
  assert.equal(isMeaningfulDraft({ blocks: [{ type: 'step' }] }), true)
  assert.equal(isMeaningfulDraft({ questions: [{ pregunta: 'x' }] }), true)
})

test('buildDraft: sella savedAt y normaliza defaults', () => {
  const d = buildDraft({ titulo: 'T', blocks: [{ type: 'step' }] }, 1000)
  assert.equal(d.savedAt, 1000)
  assert.equal(d.titulo, 'T')
  assert.equal(d.vertical, 'retail')      // default
  assert.equal(d.plataforma, 'web')       // default
  assert.deepEqual(d.questions, [])        // default array
  assert.equal(d.orden, '')                // default
})

test('shouldOfferRestore: contenido y no vencido', () => {
  const now = 10_000_000
  assert.equal(shouldOfferRestore(null, now), false)
  assert.equal(shouldOfferRestore({ titulo: '', blocks: [] }, now), false)   // vacío
  assert.equal(shouldOfferRestore({ titulo: 'X', savedAt: now - 1000 }, now), true)
  // vencido (más de 7 días)
  const viejo = now - (8 * 24 * 60 * 60 * 1000)
  assert.equal(shouldOfferRestore({ titulo: 'X', savedAt: viejo }, now), false)
  // sin savedAt pero con contenido → se ofrece igual
  assert.equal(shouldOfferRestore({ titulo: 'X' }, now), true)
})

test('relTime: buckets en español', () => {
  assert.equal(relTime(5_000), 'hace un momento')
  assert.equal(relTime(90_000), 'hace 1 min')
  assert.equal(relTime(2 * 60 * 60 * 1000), 'hace 2 h')
  assert.equal(relTime(3 * 24 * 60 * 60 * 1000), 'hace 3 d')
  assert.equal(relTime(-1), '')
})
