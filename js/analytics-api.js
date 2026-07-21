// Capa de acceso a las RPCs de analytics. Devuelve el jsonb agregado por el
// servidor; los dashboards (② y ③) consumen estas funciones y no tocan
// analytics_events / bodi_conversations directamente.

let supabaseInstance = null

async function getSupabaseClient() {
  if (!supabaseInstance) {
    const { supabase } = await import('./supabase.js')
    supabaseInstance = supabase
  }
  return supabaseInstance
}

async function callRpc(client, name, params) {
  const { data, error } = await client.rpc(name, params)
  if (error) throw new Error(`${name}: ${error.message}`)
  return data
}

export async function fetchLessonsSummary(from, to, prevFrom, prevTo, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'analytics_lessons_summary', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_prev_from: prevFrom.toISOString(),
    p_prev_to: prevTo.toISOString(),
  })
}

export async function fetchBotSummary(from, to, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'analytics_bot_summary', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  })
}

export async function fetchCourseFunnel(from, to, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'analytics_course_funnel', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  })
}

export async function fetchBotTrend(months = 6, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'analytics_bot_trend', { p_months: months })
}
