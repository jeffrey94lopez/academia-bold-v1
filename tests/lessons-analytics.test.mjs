import test from 'node:test'
import assert from 'node:assert/strict'
import {
  pctDelta, completionPct, computeLessonKpis,
  selectTrapLessons, zeroResultSearches, mergeLessonTable,
} from '../js/lessons-analytics.js'

test('pctDelta: variación porcentual redondeada', () => {
  assert.equal(pctDelta(120, 100), 20)
  assert.equal(pctDelta(80, 100), -20)
})

test('pctDelta: prev 0 o null devuelve null (no % contra cero)', () => {
  assert.equal(pctDelta(50, 0), null)
  assert.equal(pctDelta(50, null), null)
})

test('completionPct: certificados / entraron al curso', () => {
  assert.equal(completionPct({ entered: 40, certificate: 10 }), 25)
  assert.equal(completionPct({ entered: 0, certificate: 0 }), null)
})

test('computeLessonKpis: arma KPIs con deltas', () => {
  const summary = { kpis: { visits: 300, prev_visits: 250, new_students: 40, prev_new_students: 50, cert_views: 12 } }
  const funnel = { entered: 40, certificate: 10 }
  assert.deepEqual(computeLessonKpis(summary, funnel), {
    visits: 300, visitsDelta: 20,
    newStudents: 40, newStudentsDelta: -20,
    completionPct: 25, certificates: 12,
  })
})

test('selectTrapLessons: baja aprobación con muestra suficiente, peor primero', () => {
  const exams = [
    { lesson: 'A', total: 10, pass_pct: 40 },
    { lesson: 'B', total: 3,  pass_pct: 20 },   // muestra chica → fuera
    { lesson: 'C', total: 20, pass_pct: 90 },   // aprueban → fuera
    { lesson: 'D', total: 8,  pass_pct: 55 },
  ]
  const r = selectTrapLessons(exams, { minTotal: 5, maxPassPct: 60 })
  assert.deepEqual(r.map(x => x.lesson), ['A', 'D'])
})

test('zeroResultSearches: solo con zero_count>0, más frecuentes primero', () => {
  const searches = [
    { term: 'x', count: 5, zero_count: 0 },
    { term: 'y', count: 9, zero_count: 9 },
    { term: 'z', count: 4, zero_count: 2 },
  ]
  assert.deepEqual(zeroResultSearches(searches).map(s => s.term), ['y', 'z'])
})

test('mergeLessonTable: cruza visitas con % aprueban por título', () => {
  const top = [{ lesson: 'A', count: 30 }, { lesson: 'B', count: 10 }]
  const exams = [{ lesson: 'A', pass_pct: 80 }]
  assert.deepEqual(mergeLessonTable(top, exams), [
    { lesson: 'A', visits: 30, pass_pct: 80 },
    { lesson: 'B', visits: 10, pass_pct: null },
  ])
})
