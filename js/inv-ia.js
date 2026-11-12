// js/inv-ia.js — módulo puro del purgador con IA (Spec 2).
//
// Arma el pedido que se manda a la IA (Gemini vía n8n) y valida de forma
// estricta su respuesta: si algo no cuadra se descarta TODA la respuesta.
// Sin DOM ni red.
import { sanear } from './inv-saneamiento.js'
import { normalizar } from './inv-numeros.js'
import { UNIDADES_CANONICAS_BOLD } from './inv-plantilla-sintetica.js'

export const LIMITES = { maxElementos: 300, maxLargo: 80 }

const INVALIDA = { ok: false, codigo: 'ia_respuesta_invalida' }

// Recorta, quita vacíos y deduplica por normalización (gana la primera).
function limpiar(lista) {
  const vistos = new Set()
  const out = []
  for (const v of lista || []) {
    const s = String(v ?? '').trim().slice(0, LIMITES.maxLargo)
    const n = normalizar(s)
    if (!n || vistos.has(n)) continue
    vistos.add(n)
    out.push(s)
  }
  return out
}

export function armarPedido({ modo, categorias = [], existentes = [], unidades = [] }) {
  const p = {
    modo,
    categorias: limpiar(categorias),
    existentes: limpiar(existentes),
    unidades: limpiar(unidades),
  }
  if ([p.categorias, p.existentes, p.unidades].some(l => l.length > LIMITES.maxElementos)) return null
  const principal = modo === 'unidades' ? p.unidades : p.categorias
  return principal.length ? p : null
}

function validarGrupos(pedido, respuesta) {
  const grupos = respuesta?.grupos
  if (!Array.isArray(grupos)) return INVALIDA
  const existentes = new Set(pedido.existentes)
  const permitidos = new Set([...pedido.categorias, ...existentes])
  const vistos = new Set()
  const mapeo = Object.create(null)
  for (const g of grupos) {
    if (!g || typeof g.nombre !== 'string' || !Array.isArray(g.miembros) || !g.miembros.length) return INVALIDA
    if (!g.nombre || sanear(g.nombre) !== g.nombre) return INVALIDA
    let existente = null
    for (const m of g.miembros) {
      if (typeof m !== 'string' || !permitidos.has(m) || vistos.has(m)) return INVALIDA
      vistos.add(m)
      if (existentes.has(m)) {
        if (existente !== null) return INVALIDA // dos existentes en un grupo
        existente = m
      }
    }
    if (existente !== null && g.nombre !== existente) return INVALIDA
    if (pedido.modo === 'categorias' && existente === null && !g.miembros.includes(g.nombre)) return INVALIDA
    for (const m of g.miembros) mapeo[m] = g.nombre
  }
  if (!pedido.categorias.every(c => vistos.has(c))) return INVALIDA
  return { ok: true, mapeo }
}

function validarUnidades(pedido, respuesta) {
  const u = respuesta?.unidades
  if (!u || typeof u !== 'object' || Array.isArray(u)) return INVALIDA
  const mapeo = Object.create(null)
  for (const x of pedido.unidades) {
    if (!Object.hasOwn(u, x)) return INVALIDA
    const v = u[x]
    if (v !== null && !UNIDADES_CANONICAS_BOLD.includes(v)) return INVALIDA
    mapeo[x] = v
  }
  return { ok: true, mapeo }
}

export function validarRespuesta(pedido, respuesta) {
  try {
    return pedido.modo === 'unidades' ? validarUnidades(pedido, respuesta) : validarGrupos(pedido, respuesta)
  } catch {
    return INVALIDA
  }
}

export function resumenGrupos(mapeo) {
  const por = new Map()
  for (const [miembro, nombre] of Object.entries(mapeo)) {
    if (!por.has(nombre)) por.set(nombre, [])
    por.get(nombre).push(miembro)
  }
  return [...por.entries()]
    .map(([nombre, miembros]) => ({
      nombre,
      miembros,
      cambia: !(miembros.length === 1 && miembros[0] === nombre),
    }))
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)))
}

export function huboCambios(mapeo) {
  return resumenGrupos(mapeo).some(g => g.cambia)
}

// ── Helpers de la conversación (Task 6): composición y correcciones ──

const propio = (m, k) => m != null && Object.hasOwn(m, k)

// Firma de lo que se le pediría a la IA: si al re-subir el archivo las listas son
// las mismas, el chat reaplica las decisiones anteriores en vez de volver a preguntar.
export function firmaIA({ categorias = [], existentes = [], unidades = [] } = {}) {
  return JSON.stringify([categorias, existentes, unidades])
}

// Deja en el mapeo solo las claves de `claves` (p. ej. las categorías del archivo,
// sin las existentes de Bold que la IA también devuelve). Una clave que la IA no
// devolvió (p. ej. recortada al armar el pedido) se queda con su propio nombre.
export function filtrarMapeo(mapeo, claves) {
  const out = Object.create(null)
  for (const k of claves) out[k] = propio(mapeo, k) ? mapeo[k] : k
  return out
}

// Compone dos pasadas: base (canónica → grupo1) y encima (grupo1 → grupo2) da
// canónica → grupo2. Lo que `encima` no conoce se queda con el valor de `base`.
export function componerMapeos(base, encima) {
  const out = Object.create(null)
  for (const k of Object.keys(base)) {
    const v = base[k]
    out[k] = propio(encima, v) ? encima[v] : v
  }
  return out
}

// Correcciones del cliente sobre una propuesta: `nombres` renombra grupos
// ({ nombreViejo → nombreNuevo }, saneado; vacío = se queda el viejo) y `sacados`
// saca miembros de su grupo (quedan solos, con su propio nombre).
export function corregirMapeo(mapeo, { nombres = {}, sacados = [] } = {}) {
  const fuera = new Set(sacados)
  const out = Object.create(null)
  for (const k of Object.keys(mapeo)) {
    if (fuera.has(k)) { out[k] = k; continue }
    const g = mapeo[k]
    const nuevo = propio(nombres, g) ? sanear(nombres[g]).slice(0, LIMITES.maxLargo) : ''
    out[k] = nuevo || g
  }
  return out
}

// Cuántos nombres distintos quedan tras aplicar el mapeo.
export function cuantosQuedan(mapeo) {
  return new Set(Object.values(mapeo)).size
}
