// Verticales de producto y plataforma: metadatos, selección persistida y
// filtrado. Compartido por portal (lessons.js), admin y bot (assistant.js).

import { storageGet, storageSet } from './storage.js'

export const VERTICALES = [
  { key: 'retail',       label: 'Retail',       icon: 'store' },
  { key: 'restaurantes', label: 'Restaurantes', icon: 'utensils' },
]

export const PLATAFORMAS = [
  { key: 'web',    label: 'Web' },
  { key: 'mobile', label: 'Mobile' },
]

const V_KEYS = VERTICALES.map(v => v.key)
const P_KEYS = PLATAFORMAS.map(p => p.key)

// Tercer valor de la columna `vertical`: el contenido que sirve para las dos.
// A propósito NO está en VERTICALES: esa lista son las verticales seleccionables
// (el portal pinta una tarjeta por cada una y setSeleccion solo acepta esas).
// 'ambas' es una marca de contenido, no una selección posible del usuario.
export const AMBAS = { key: 'ambas', label: 'Ambas', icon: 'layers' }

// Las 3 opciones que un admin puede marcar en un formulario de contenido.
export const VERTICALES_CONTENIDO = [...VERTICALES, AMBAS]

/**
 * ¿Este contenido aplica a esta vertical? Es la ÚNICA definición de esa regla
 * en el frontend; la misma condición está replicada en SQL dentro de
 * match_lessons. Si cambias una, cambia la otra.
 *
 * Tolerante a propósito con la vertical ausente: en `lecciones` la columna
 * vieja podía venir vacía, y un `select` parcial que no traiga la columna no
 * debería esconder contenido.
 */
export function aplicaA(item, vertical) {
  const v = item?.vertical || 'retail'
  return v === AMBAS.key || v === vertical
}

export function getSeleccion() {
  const v = storageGet('bold_vertical')
  const p = storageGet('bold_plataforma')
  return {
    vertical:   V_KEYS.includes(v) ? v : 'retail',
    plataforma: P_KEYS.includes(p) ? p : 'web',
  }
}

export function setSeleccion({ vertical, plataforma } = {}) {
  if (V_KEYS.includes(vertical))   storageSet('bold_vertical', vertical)
  if (P_KEYS.includes(plataforma)) storageSet('bold_plataforma', plataforma)
}

export function filtrarPorSeleccion(lecciones, { vertical, plataforma }) {
  return (lecciones || []).filter(l =>
    aplicaA(l, vertical) &&
    (l.plataforma || 'web') === plataforma)
}

// Metadatos de una vertical de CONTENIDO (las 2 seleccionables más 'ambas').
function metaVertical(vertical) {
  const key = vertical || 'retail'
  return key === AMBAS.key
    ? AMBAS
    : VERTICALES.find(x => x.key === key) || VERTICALES[0]
}

// Solo el nombre, sin plataforma: las FAQ y los términos del glosario no tienen
// plataforma, así que `etiqueta()` les sobraría la mitad.
export function labelVertical(vertical) {
  return metaVertical(vertical).label
}

export function etiqueta(l) {
  const v = metaVertical(l.vertical)
  const p = PLATAFORMAS.find(x => x.key === (l.plataforma || 'web')) || PLATAFORMAS[0]
  return { icon: v.icon, texto: `${v.label} · ${p.label}` }
}

// --- Visibilidad configurable por app_settings ---
// Convención existente en el proyecto (ver js/admin.js wireToggle): clave
// ausente o valor distinto de 'false' = habilitado.
function habilitado(settings, key) {
  if (!settings) return true
  return settings[key] !== 'false'
}

export function verticalHabilitada(settings, vertical) {
  return habilitado(settings, `vertical_${vertical}_enabled`)
}

export function plataformasHabilitadas(settings, vertical) {
  return P_KEYS.filter(p => habilitado(settings, `plataforma_${vertical}_${p}_enabled`))
}

export function verticalesVisibles(lecciones, settings) {
  const ls = lecciones || []
  return V_KEYS.filter(v => {
    if (!verticalHabilitada(settings, v)) return false
    const plats = plataformasHabilitadas(settings, v)
    return ls.some(l => aplicaA(l, v) && plats.includes(l.plataforma || 'web'))
  })
}

export function resolverSeleccion(lecciones, settings, seleccion = {}) {
  const visibles = verticalesVisibles(lecciones, settings)
  const { vertical, plataforma } = seleccion
  if (visibles.includes(vertical) &&
      plataformasHabilitadas(settings, vertical).includes(plataforma)) {
    return { vertical, plataforma }
  }
  if (visibles.length === 0) return seleccion

  const v = visibles[0]
  const plats = plataformasHabilitadas(settings, v)
  const ls = lecciones || []
  const conLecciones = plats.find(p =>
    ls.some(l => aplicaA(l, v) && (l.plataforma || 'web') === p))
  return { vertical: v, plataforma: conLecciones || plats[0] }
}
