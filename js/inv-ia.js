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
  const mapeo = {}
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
  const mapeo = {}
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
