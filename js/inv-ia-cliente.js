// js/inv-ia-cliente.js — cliente del purgador con IA (Spec 2).
//
// Habla con POST /api/purgar (servidor, Task 5) con timeout y gate. Nunca
// lanza: todo resultado es { ok: true, mapeo } o { ok: false, codigo }.
import { armarPedido, validarRespuesta, LIMITES } from './inv-ia.js'

const CLAVE = 'inventario_ia_activa'

const falla = (codigo) => ({ ok: false, codigo })

// Gate del navegador. Settings se importa de forma dinámica para que los tests
// (y cualquier import en Node) no arrastren Supabase.
// OJO: app_settings guarda texto, y aquí "clave ausente" significa APAGADO.
// Es a propósito lo contrario de la convención del repo (ausente ⇒ habilitado):
// una función que gasta cuota de IA no debe encenderse sola.
// El ajuste se lee por env (prod en produccion), asi que encenderla en sandbox no la
// enciende en produccion.
export async function iaActiva({
  cargar = async (keys) => (await import('./settings.js')).loadSettings(keys),
} = {}) {
  try {
    const s = await cargar([CLAVE])
    return s?.[CLAVE] === 'true'
  } catch {
    return false
  }
}

export async function pedirIA(
  { modo, categorias, existentes, unidades, runId, accountId },
  { fetch: f = globalThis.fetch, timeoutMs = 60000, activa } = {},
) {
  if (activa === false) return falla('ia_desactivada')

  const pedido = armarPedido({ modo, categorias, existentes, unidades })
  if (!pedido) {
    // Null puede ser "lista demasiado grande" o "nada que hacer" (lista
    // principal vacía). Solo lo primero es un error reportable; lo segundo el
    // chat lo salta en silencio y no va a telemetría.
    const grande = [categorias, existentes, unidades].some(
      (l) => Array.isArray(l) && l.length > LIMITES.maxElementos,
    )
    return falla(grande ? 'ia_lista_grande' : 'ia_sin_datos')
  }

  const body = { ...pedido, run_id: runId }
  if (accountId !== undefined) body.account_id = accountId

  const ctrl = new AbortController()
  let vencio = false
  const timer = setTimeout(() => { vencio = true; ctrl.abort() }, timeoutMs)
  try {
    const res = await f('/api/purgar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    if (res.status !== 200) return falla('ia_fallo')
    const json = await res.json()
    if (json?.desactivado === true) return falla('ia_desactivada')
    return validarRespuesta(pedido, json?.resultado)
  } catch {
    return falla(vencio ? 'ia_timeout' : 'ia_fallo')
  } finally {
    clearTimeout(timer) // sin handles colgados
  }
}
