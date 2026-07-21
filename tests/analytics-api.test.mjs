import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fetchLessonsSummary, fetchBotSummary, fetchCourseFunnel, fetchBotTrend,
} from '../js/analytics-api.js'

function fakeClient(captured) {
  return {
    rpc(name, params) {
      captured.name = name
      captured.params = params
      return Promise.resolve({ data: { ok: true, name }, error: null })
    },
  }
}

function errorClient() {
  return { rpc() { return Promise.resolve({ data: null, error: { message: 'boom' } }) } }
}

test('fetchLessonsSummary llama la RPC con fechas ISO y devuelve data', async () => {
  const cap = {}
  const from = new Date('2026-06-01T00:00:00Z')
  const to = new Date('2026-06-30T23:59:59Z')
  const pf = new Date('2026-05-01T00:00:00Z')
  const pt = new Date('2026-05-31T23:59:59Z')
  const data = await fetchLessonsSummary(from, to, pf, pt, fakeClient(cap))
  assert.equal(cap.name, 'analytics_lessons_summary')
  assert.equal(cap.params.p_from, from.toISOString())
  assert.equal(cap.params.p_prev_to, pt.toISOString())
  assert.deepEqual(data, { ok: true, name: 'analytics_lessons_summary' })
})

test('fetchBotSummary usa analytics_bot_summary', async () => {
  const cap = {}
  const from = new Date('2026-06-01T00:00:00Z')
  const to = new Date('2026-06-30T00:00:00Z')
  await fetchBotSummary(from, to, fakeClient(cap))
  assert.equal(cap.name, 'analytics_bot_summary')
  assert.equal(cap.params.p_from, from.toISOString())
})

test('fetchCourseFunnel usa analytics_course_funnel', async () => {
  const cap = {}
  await fetchCourseFunnel(new Date('2026-06-01T00:00:00Z'), new Date('2026-06-30T00:00:00Z'), fakeClient(cap))
  assert.equal(cap.name, 'analytics_course_funnel')
})

test('fetchBotTrend pasa p_months', async () => {
  const cap = {}
  await fetchBotTrend(6, fakeClient(cap))
  assert.equal(cap.name, 'analytics_bot_trend')
  assert.equal(cap.params.p_months, 6)
})

test('lanza Error cuando la RPC devuelve error', async () => {
  await assert.rejects(
    () => fetchBotSummary(new Date(), new Date(), errorClient()),
    /boom/,
  )
})
