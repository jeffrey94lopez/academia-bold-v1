// Verticales de producto y plataforma: metadatos, selección persistida y
// filtrado. Compartido por portal (lessons.js), admin y bot (assistant.js).

// En Node tests, cada ?caso=N obtiene almacenamiento aislado.
if (typeof import.meta !== 'undefined' && import.meta.url) {
  const url = new URL(import.meta.url)
  const caso = url.searchParams.get('caso')
  if (caso && typeof globalThis !== 'undefined') {
    globalThis.__bold_caso = caso
  }
}

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
