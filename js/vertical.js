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
    (l.vertical || 'retail') === vertical &&
    (l.plataforma || 'web') === plataforma)
}

export function etiqueta(l) {
  const v = VERTICALES.find(x => x.key === (l.vertical || 'retail')) || VERTICALES[0]
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

export function plataformasHabilitadas(settings, vertical) {
  return P_KEYS.filter(p => habilitado(settings, `plataforma_${vertical}_${p}_enabled`))
}

export function verticalesVisibles(lecciones, settings) {
  const ls = lecciones || []
  return V_KEYS.filter(v => {
    if (!habilitado(settings, `vertical_${v}_enabled`)) return false
    const plats = plataformasHabilitadas(settings, v)
    return ls.some(l =>
      (l.vertical || 'retail') === v &&
      plats.includes(l.plataforma || 'web'))
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
    ls.some(l => (l.vertical || 'retail') === v && (l.plataforma || 'web') === p))
  return { vertical: v, plataforma: conLecciones || plats[0] }
}
