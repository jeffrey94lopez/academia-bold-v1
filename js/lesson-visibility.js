// Visibilidad de lecciones por entorno de deploy.
//
// `lecciones.active` es UNA columna en una tabla compartida por todos los
// deploys, así que ocultar una lección desde el admin del sandbox la ocultaba
// también en el portal real. Mismo problema que tenían los toggles de módulos,
// resuelto con el mismo modelo (ver js/env.js): producción es la base y cada
// entorno no-prod anota solo lo que cambió, en la tabla leccion_visibilidad.
//
// Producción sigue viviendo en `lecciones.active` y NADIE de fuera de prod la
// escribe. Por eso en 'prod' esto es una función identidad: si mañana se
// revierte, no hay nada que migrar de vuelta.
//
// Import-safe (sin DOM, sin red): la lectura vive en js/settings.js.

// Devuelve una copia de las lecciones con su `active` resuelto para `env`.
// No muta la entrada: los llamadores guardan la lista original para otras
// vistas (el admin pinta las ocultas en gris, no las quita).
export function aplicarVisibilidad(lecciones, overrides, env) {
  const ls = lecciones || []
  if (env === 'prod') return ls.slice()

  const porId = new Map()
  for (const o of overrides || []) {
    if (o.env === env) porId.set(o.leccion_id, o.active)
  }
  if (porId.size === 0) return ls.slice()

  return ls.map(l => porId.has(l.id) ? { ...l, active: porId.get(l.id) } : l)
}

// Filtra lo que un estudiante puede ver. Solo `false` esconde: NULL cuenta como
// habilitada, igual que `l.active === false` en el resto del front y que
// `active IS NOT FALSE` en match_lessons. Una fila vieja sin el valor seteado
// no desaparece sin querer.
export function visibles(lecciones) {
  return (lecciones || []).filter(l => l.active !== false)
}
