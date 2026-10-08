// js/bold-context.js — receptor del contexto del comercio que manda Bold POS.
//
// El portal vive embebido en un iframe dentro de pos.bold.co y, por aislamiento
// de orígenes, no puede leer nada del POS. Bold nos manda por `postMessage` un
// mensaje `bold:context` con la identidad del comercio; con eso autofiltramos
// vertical/plataforma y personalizamos. Ver docs/integracion-bold/.
//
// Si el mensaje no llega (Bold todavía no lo implementó, el usuario abrió el
// portal fuera del POS, etc.) todo sigue funcionando como antes: la selección
// manual guardada en el navegador.

import { storageRemove } from './storage.js'

// Orígenes de los que aceptamos contexto. Son los documentados en el
// requerimiento que se le envió a Bold; ampliar esta lista requiere
// actualizar el doc.
//
// OJO: el CSP del proyecto deja `frame-ancestors *`, o sea que CUALQUIERA
// puede embebernos. Esta lista es, por lo tanto, lo único que impide que un
// sitio arbitrario nos afirme la identidad de un comercio (nombre, cuenta,
// vertical) que después viaja al bot y se guarda en las conversaciones.
// Agregar un origen acá amplía esa superficie: hacerlo solo con dominios de
// Bold y con razón escrita.
//
// `pos.stg.bold.co` es el staging de Bold, agregado el 2026-10-02 porque ahí
// prueban la integración — y su POS de staging embebe nuestra academia de
// PRODUCCIÓN, así que no alcanzaba con aceptarlo fuera de prod.
export const ORIGENES_BOLD = [
  'https://pos.bold.co',
  'https://pos.stg.bold.co',
]

// business_type de Bold → vertical nuestra. Toleramos variantes porque el
// string exacto de restaurantes está pendiente de confirmación de Bold.
const VERTICAL_POR_BUSINESS_TYPE = {
  retail: 'retail', store: 'retail', tienda: 'retail',
  restaurant: 'restaurantes', restaurante: 'restaurantes',
  restaurants: 'restaurantes', restaurantes: 'restaurantes', food: 'restaurantes',
}

const PLATAFORMA_POR_PLATFORM = {
  web: 'web', desktop: 'web',
  mobile: 'mobile', android: 'mobile', ios: 'mobile', app: 'mobile',
}

const MAX_TEXTO = 80

// Claves de una versión anterior que guardaba la identidad en el navegador. Ya
// no se escriben: se borran al arrancar. Guardarla sobrevivía a la sesión y el
// bot terminaba saludando con el nombre del comercio de la prueba anterior.
const CLAVES_LEGADO = [
  'bold_account_id', 'bold_business_name',
  'bold_user_id', 'bold_user_name', 'bold_user_email',
]

export function esOrigenBold(origen) {
  return ORIGENES_BOLD.includes(origen)
}

// Texto de fuente externa: sin saltos ni control chars, colapsado y acotado.
function texto(v) {
  if (v === null || v === undefined) return null
  const s = String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return s ? s.slice(0, MAX_TEXTO) : null
}

function id(v) {
  if (v === null || v === undefined || v === '') return null
  const s = String(v).trim()
  return s && s.length <= 64 ? s : null
}

function correo(v) {
  const s = texto(v)?.toLowerCase()
  return s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null
}

function clave(mapa, v) {
  const s = texto(v)?.toLowerCase()
  return s && Object.prototype.hasOwnProperty.call(mapa, s) ? mapa[s] : null
}

/**
 * Convierte el mensaje crudo de Bold en nuestro contexto. Devuelve `null` si el
 * mensaje no es un `bold:context`. Copia solo los campos que pedimos: si Bold
 * manda de más (un token, por ejemplo) no entra al portal.
 */
export function normalizarContexto(data) {
  if (!data || typeof data !== 'object' || data.type !== 'bold:context') return null
  const u = data.user && typeof data.user === 'object' ? data.user : {}
  return {
    accountId:    id(data.accountId ?? data.account_id ?? data.sub),
    vertical:     clave(VERTICAL_POR_BUSINESS_TYPE, data.businessType ?? data.business_type),
    plataforma:   clave(PLATAFORMA_POR_PLATFORM, data.platform ?? data.plataforma),
    businessName: texto(data.businessName ?? data.business_name),
    user: { id: id(u.id), name: texto(u.name), email: correo(u.email) },
  }
}

/** Selección a aplicar: solo los campos que Bold sí mandó. `null` si ninguno. */
export function seleccionDesdeContexto(ctx) {
  if (!ctx) return null
  const sel = {}
  if (ctx.vertical) sel.vertical = ctx.vertical
  if (ctx.plataforma) sel.plataforma = ctx.plataforma
  return Object.keys(sel).length ? sel : null
}

// ── Estado y suscripción ────────────────────────────────────────────────────

let contexto = null
const suscriptores = new Set()

/**
 * Contexto recibido en ESTA carga del portal, o `null`. A propósito no se
 * recuerda entre visitas: la identidad la manda el POS cada vez que abre el
 * iframe, y recordarla haría que un comercio vea el nombre de otro si comparten
 * navegador (o que quede pegado el de una prueba).
 */
export function getContextoBold() {
  return contexto
}

/**
 * Avisa cuando llegue el contexto. Si ya llegó, el callback corre de una vez:
 * así no importa si el módulo que se suscribe cargó antes o después del
 * mensaje.
 */
export function onContextoBold(cb) {
  suscriptores.add(cb)
  if (contexto) { try { cb(contexto) } catch (e) { console.error('[bold-context]', e) } }
  return () => suscriptores.delete(cb)
}

/** Borra la identidad que guardaban versiones anteriores del portal. */
export function limpiarIdentidadGuardada() {
  CLAVES_LEGADO.forEach(k => storageRemove(k))
}

// ── Arranque: handshake + escucha ───────────────────────────────────────────

const PING_CADA_MS = 2000
const PING_INTENTOS = 5           // ~10 s: si en ese rato Bold no escuchó, no va a escuchar

/**
 * Origen de la ventana que nos embebe, cuando el navegador lo expone
 * (`ancestorOrigins` existe en Chrome/Safari, no en Firefox). Sirve para
 * dirigir el handshake en vez de gritarlo a `'*'`.
 */
function origenDelContenedor(win) {
  try {
    const anc = win.document?.location?.ancestorOrigins
    return anc && anc.length ? anc[0] : null
  } catch { return null }
}

/**
 * Instala la escucha del `bold:context` y avisa al contenedor que ya estamos
 * listos (`academia:ready`), reintentando por si su listener se registra tarde.
 * Idempotente: llamarlo dos veces no duplica nada.
 */
let iniciado = false
export function initBoldContext(win = typeof window !== 'undefined' ? window : null) {
  if (iniciado || !win) return
  iniciado = true
  limpiarIdentidadGuardada()

  win.addEventListener('message', e => {
    if (!esOrigenBold(e.origin)) return          // el navegador fija e.origin
    const ctx = normalizarContexto(e.data)
    if (!ctx) return
    contexto = ctx
    for (const cb of suscriptores) {
      try { cb(ctx) } catch (err) { console.error('[bold-context] suscriptor:', err) }
    }
  })

  // El handshake solo tiene sentido embebidos; suelto, no hay a quién avisar.
  if (win.parent === win) return

  // Si el navegador nos dice quién nos embebe: le hablamos solo a Bold, y a
  // nadie más (cualquiera puede embebernos, pero el handshake no es para ellos).
  // Si no lo dice (Firefox), va a '*': el mensaje no lleva ningún dato.
  const contenedor = origenDelContenedor(win)
  if (contenedor && !esOrigenBold(contenedor)) return
  const destino = contenedor || '*'

  let intentos = 0
  const avisar = () => {
    try { win.parent.postMessage({ type: 'academia:ready', v: 1 }, destino) } catch {}
  }
  avisar()
  const timer = win.setInterval(() => {
    avisar()
    if (++intentos >= PING_INTENTOS || contexto) win.clearInterval(timer)
  }, PING_CADA_MS)
}
