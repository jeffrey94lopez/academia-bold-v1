// Capa de acceso a las RPCs de la bandeja de vacíos. El panel consume estas
// funciones y no toca bot_vacios / bot_vacios_preguntas directamente (no
// podría: esas tablas tienen RLS sin policies).
//
// El cliente se resuelve con import dinámico perezoso A PROPÓSITO, igual que en
// js/analytics-api.js: js/supabase.js importa supabase-js desde una URL CDN, y
// un import estático rompe el runner de Node con ERR_UNSUPPORTED_ESM_URL_SCHEME.
// NO lo conviertas a import estático.

let supabaseInstance = null

export async function getSupabaseClient(loader = () => import('./supabase.js')) {
  if (!supabaseInstance) {
    const { supabase } = await loader()
    supabaseInstance = supabase
  }
  return supabaseInstance
}

// Solo para tests.
export function _resetGapsClientCache() { supabaseInstance = null }

// Lanza ante error. supabase-js devuelve { error } sin lanzar, y un error
// tragado acá se vuelve "0 vacíos pendientes" en pantalla: una avería que
// parece una buena noticia.
async function callRpc(client, name, params) {
  const { data, error } = await client.rpc(name, params)
  if (error) throw new Error(`${name}: ${error.message}`)
  return data
}

export async function fetchVacios(filtros = {}, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'analytics_bot_vacios', {
    // `'estado' in filtros` y no `?? 'pendiente'`: un null EXPLÍCITO significa
    // "todos los estados" (lo que necesita el selector de destino de una
    // fusión), y `??` lo confundiría con "no pasaste nada".
    p_estado: 'estado' in filtros ? filtros.estado : 'pendiente',
    p_vertical: filtros.vertical ?? null,
    p_categoria: filtros.categoria ?? null,
    p_limit: filtros.limit ?? 100,
  })
}

export async function fetchVacioDetalle(vacioId, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'analytics_bot_vacio_detalle', { p_vacio_id: vacioId })
}

export async function fetchVaciosSalud(client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'analytics_vacios_salud', {})
}

export async function resolverVacio(vacioId, leccionId, email, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'resolver_vacio', {
    p_vacio_id: vacioId, p_leccion_id: leccionId, p_email: email,
  })
}

export async function descartarVacio(vacioId, motivo, nota, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'descartar_vacio', {
    p_vacio_id: vacioId, p_motivo: motivo, p_nota: nota ?? null,
  })
}

// Marca el vacío como pedido de producto. NO es un descarte: sigue contado y
// visible en su propia pestaña. La nota (cómo funciona hoy) es opcional.
export async function marcarSolicitud(vacioId, nota, email, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'marcar_solicitud', {
    p_vacio_id: vacioId, p_nota: nota ?? null, p_email: email ?? null,
  })
}

export async function dividirVacio(vacioId, preguntaIds, titulo, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'dividir_vacio', {
    p_vacio_id: vacioId, p_pregunta_ids: preguntaIds, p_titulo: titulo,
  })
}

// Mueve TODAS las preguntas del origen al destino y borra el origen. Devuelve
// el total de preguntas que queda en el destino.
export async function fusionarVacios(origenId, destinoId, client) {
  if (!client) client = await getSupabaseClient()
  return callRpc(client, 'fusionar_vacios', {
    p_origen: origenId, p_destino: destinoId,
  })
}
