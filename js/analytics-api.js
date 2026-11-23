// Capa de acceso a las RPCs de analytics. Devuelve el jsonb agregado por el
// servidor; los dashboards (② y ③) consumen estas funciones y no tocan
// analytics_events / bodi_conversations directamente.
//
// Las funciones son async y resuelven el cliente Supabase de forma perezosa
// (import dinámico) A PROPÓSITO: js/supabase.js importa supabase-js desde una
// URL CDN (https://…). Un `import { supabase }` a nivel de módulo cargaría esa
// URL al importar este archivo y rompe el runner de tests de Node
// (ERR_UNSUPPORTED_ESM_URL_SCHEME). NO lo conviertas de vuelta a import
// estático / funciones síncronas. Para los consumidores no cambia nada:
// devuelven Promise<object> y se usan con await.

let supabaseInstance = null

// loader inyectable solo para tests; en producción usa el import dinámico real.
export async function getSupabaseClient(loader = () => import('./supabase.js')) {
  if (!supabaseInstance) {
    const { supabase } = await loader()
    supabaseInstance = supabase
  }
  return supabaseInstance
}

// Solo para tests: limpia el singleton cacheado entre casos.
export function _resetAnalyticsClientCache() {
  supabaseInstance = null
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

// % de conversaciones fuera del horario de atención (Lun–Vie 8am–5pm, Sáb
// 8am–12m, Dom cerrado; hora de Bogotá) y, de esas, % resueltas.
export async function fetchOffHours(from, to, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'analytics_off_hours', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  })
}

export async function fetchBotTrend(months = 6, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'analytics_bot_trend', { p_months: months })
}

export async function fetchBotConversations(from, to, filters = {}, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'analytics_bot_conversations', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_status: filters.status ?? null,
    p_sentiment: filters.sentiment ?? null,
    p_support: filters.support ?? null,
    p_category: filters.category ?? null,
    p_search: filters.search ?? null,
    p_limit: filters.limit ?? null,
    p_lifecycle: filters.lifecycle ?? null,
    p_no_info: filters.no_info ?? null,
    // Solo se manda cuando hay filtro: PostgREST empareja la función por el
    // CONJUNTO de nombres de parámetros, así que mandar p_vertical antes de que
    // corra add_vertical_analytics_bot.sql dejaría al explorador sin función
    // que llamar. Omitirlo mantiene el dashboard funcionando con la RPC vieja.
    ...(filters.vertical ? { p_vertical: filters.vertical } : {}),
    ...(filters.account_id ? { p_account_id: filters.account_id } : {}),
  })
}

// Comercios del rango, de más a menos conversaciones. Solo cuentas
// identificadas: ver el comentario de analytics_bot_comercios.
// Uso de las herramientas de BolBot (conversor de inventario y generador de códigos).
// `env`: 'prod' o 'sandbox'; comparten base y no se mezclan.
export async function fetchHerramientas(from, to, env = 'prod', client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'analytics_herramientas', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_env: env,
  })
}

// Costo y aceptación del purgador con IA del conversor. Si la migración todavía no
// está aplicada la RPC no existe y esto rechaza: quien llama lo atrapa por su cuenta.
export async function fetchHerramientasIA(from, to, env = 'prod', client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'analytics_herramientas_ia', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_env: env,
  })
}

// Topes de la IA (últimas 24 h, no depende del período). RPC analytics_herramientas_ia_topes.
export async function fetchHerramientasIATopes(env = 'prod', client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'analytics_herramientas_ia_topes', { p_env: env })
}

export async function fetchComercios(from, to, limit = 200, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'analytics_bot_comercios', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_limit: limit,
  })
}

export async function fetchContentGaps(from, to, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'analytics_content_gaps', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  })
}
