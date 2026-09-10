import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fetchLessonsSummary, fetchBotSummary, fetchCourseFunnel, fetchBotTrend,
  getSupabaseClient, _resetAnalyticsClientCache,
  fetchBotConversations, fetchContentGaps, fetchZombieLessons,
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

test('getSupabaseClient resuelve vía loader y cachea el singleton', async () => {
  _resetAnalyticsClientCache()
  let calls = 0
  const fake = { rpc() {} }
  const loader = () => { calls++; return Promise.resolve({ supabase: fake }) }
  const a = await getSupabaseClient(loader)
  const b = await getSupabaseClient(loader)
  assert.equal(a, fake)
  assert.equal(b, fake)
  assert.equal(calls, 1) // solo carga una vez (cache)
  _resetAnalyticsClientCache()
})

test('fetchBotConversations mapea filtros a params (undefined -> null)', async () => {
  const cap = {}
  const from = new Date('2026-06-01T00:00:00Z')
  const to = new Date('2026-06-30T00:00:00Z')
  await fetchBotConversations(from, to, { status: 'no_resuelta', support: true }, fakeClient(cap))
  assert.equal(cap.name, 'analytics_bot_conversations')
  assert.equal(cap.params.p_from, from.toISOString())
  assert.equal(cap.params.p_status, 'no_resuelta')
  assert.equal(cap.params.p_support, true)
  assert.equal(cap.params.p_sentiment, null)
  assert.equal(cap.params.p_category, null)
  assert.equal(cap.params.p_search, null)
  assert.equal(cap.params.p_no_info, null)
})

test('fetchBotConversations sin filtros manda todos null y limit por defecto', async () => {
  const cap = {}
  await fetchBotConversations(new Date('2026-06-01T00:00:00Z'), new Date('2026-06-30T00:00:00Z'), {}, fakeClient(cap))
  assert.equal(cap.params.p_status, null)
  assert.equal(cap.params.p_limit, null)
  assert.equal(cap.params.p_no_info, null)
})

test('fetchBotConversations pasa el filtro "sin contenido" como p_no_info', async () => {
  const cap = {}
  await fetchBotConversations(new Date('2026-06-01T00:00:00Z'), new Date('2026-06-30T00:00:00Z'),
    { no_info: true }, fakeClient(cap))
  assert.equal(cap.params.p_no_info, true)
})

test('fetchContentGaps usa analytics_content_gaps', async () => {
  const cap = {}
  await fetchContentGaps(new Date('2026-06-01T00:00:00Z'), new Date('2026-06-30T00:00:00Z'), fakeClient(cap))
  assert.equal(cap.name, 'analytics_content_gaps')
  assert.equal(cap.params.p_from, new Date('2026-06-01T00:00:00Z').toISOString())
})

test('fetchZombieLessons llama la RPC con fechas ISO y p_max_visits', async () => {
  const cap = {}
  const from = new Date('2026-07-01T00:00:00Z')
  const to = new Date('2026-07-31T23:59:59Z')
  await fetchZombieLessons(from, to, 3, fakeClient(cap))
  assert.equal(cap.name, 'analytics_zombie_lessons')
  assert.equal(cap.params.p_from, from.toISOString())
  assert.equal(cap.params.p_to, to.toISOString())
  assert.equal(cap.params.p_max_visits, 3)
})

test('fetchZombieLessons usa p_max_visits=2 por defecto', async () => {
  const cap = {}
  await fetchZombieLessons(new Date('2026-07-01T00:00:00Z'), new Date('2026-07-31T00:00:00Z'), undefined, fakeClient(cap))
  assert.equal(cap.params.p_max_visits, 2)
})
