// Lógica pura de "¿debo recargar?" — sin imports para poder testearla en Node.

export function computeReloadAction({ currentVersion, newVersion, busy }) {
  if (!currentVersion || !newVersion) return 'none'
  if (newVersion === currentVersion) return 'none'
  return busy ? 'defer' : 'reload'
}

export function isNearBottom(el, tolerance = 40) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= tolerance
}
