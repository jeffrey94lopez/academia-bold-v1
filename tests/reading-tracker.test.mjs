// tests/reading-tracker.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { createReadingTracker } from '../js/reading-tracker.js'

function fakeContainer({ scrollTop = 0, clientHeight = 400, scrollHeight = 1000 } = {}) {
  const c = {
    scrollTop, clientHeight, scrollHeight,
    _handlers: {},
    addEventListener(ev, fn) { c._handlers[ev] = fn },
    removeEventListener(ev, fn) { if (c._handlers[ev] === fn) delete c._handlers[ev] },
    _fireScroll() { c._handlers.scroll && c._handlers.scroll() },
    _hasScrollListener() { return !!c._handlers.scroll },
  }
  return c
}

// now inyectable: devuelve valores de una lista en orden.
function fakeNow(values) {
  let i = 0
  return () => values[Math.min(i++, values.length - 1)]
}

test('start→flush emite un lesson_read con el payload correcto', () => {
  const emitted = []
  const track = (type, payload) => emitted.push({ type, payload })
  const tr = createReadingTracker({ track, now: fakeNow([1000, 7000]) })
  const c = fakeContainer({ scrollTop: 0, clientHeight: 500, scrollHeight: 500 }) // cabe → 100%
  tr.start(c, { lesson_id: 'L1', lesson_title: 'Uno', category: 'Cat', vertical: 'retail', plataforma: 'web' })
  tr.flush('tab')
  assert.equal(emitted.length, 1)
  assert.equal(emitted[0].type, 'lesson_read')
  assert.deepEqual(emitted[0].payload, {
    lesson_id: 'L1', lesson_title: 'Uno', category: 'Cat', vertical: 'retail', plataforma: 'web',
    max_scroll_pct: 100, dwell_ms: 6000, completed: true,
  })
})

test('el scroll actualiza max_scroll_pct', () => {
  const emitted = []
  const track = (type, payload) => emitted.push({ type, payload })
  const tr = createReadingTracker({ track, now: fakeNow([0, 6000]) })
  const c = fakeContainer({ scrollTop: 0, clientHeight: 400, scrollHeight: 1000 }) // arranca 40%
  tr.start(c, { lesson_id: 'L2' })
  c.scrollTop = 300; c._fireScroll() // 70%
  c.scrollTop = 100; c._fireScroll() // 50% (no baja el max)
  tr.flush('switch')
  assert.equal(emitted[0].payload.max_scroll_pct, 70)
})

test('completed=false si el tiempo es corto aunque el scroll llegue al final', () => {
  const emitted = []
  const track = (type, payload) => emitted.push({ type, payload })
  const tr = createReadingTracker({ track, now: fakeNow([1000, 3000]) }) // dwell 2000
  const c = fakeContainer({ scrollTop: 0, clientHeight: 500, scrollHeight: 500 })
  tr.start(c, { lesson_id: 'L3' })
  tr.flush('tab')
  assert.equal(emitted[0].payload.completed, false)
})

test('start dos veces emite el lesson_read de la primera lección', () => {
  const emitted = []
  const track = (type, payload) => emitted.push({ type, payload })
  const tr = createReadingTracker({ track, now: fakeNow([1000, 8000, 8000, 9000]) })
  const c1 = fakeContainer({ scrollTop: 0, clientHeight: 500, scrollHeight: 500 })
  const c2 = fakeContainer()
  tr.start(c1, { lesson_id: 'A' })
  tr.start(c2, { lesson_id: 'B' }) // flush implícito de A
  assert.equal(emitted.length, 1)
  assert.equal(emitted[0].payload.lesson_id, 'A')
})

test('flush sin start no emite nada; flush doble tampoco duplica', () => {
  const emitted = []
  const track = (type, payload) => emitted.push({ type, payload })
  const tr = createReadingTracker({ track, now: fakeNow([1000, 7000]) })
  tr.flush('tab')
  assert.equal(emitted.length, 0)
  const c = fakeContainer()
  tr.start(c, { lesson_id: 'X' })
  tr.flush('tab')
  tr.flush('tab')
  assert.equal(emitted.length, 1)
})

test('flush quita el listener de scroll (no se acumulan)', () => {
  const tr = createReadingTracker({ track: () => {}, now: fakeNow([1000, 7000]) })
  const c = fakeContainer()
  tr.start(c, { lesson_id: 'Y' })
  assert.equal(c._hasScrollListener(), true)
  tr.flush('tab')
  assert.equal(c._hasScrollListener(), false)
  assert.equal(tr.isActive(), false)
})
