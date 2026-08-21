// % de conversaciones que entran FUERA del horario laboral, calculado desde el
// heatmap del dashboard (celdas {dow, hour, count} ya en hora de negocio,
// America/Tegucigalpa). Import-safe → testeable con node:test.
//
// Horario laboral por defecto [8, 17) = 8am–5pm. "Fuera de horario" = hora < 8
// o hora >= 17 (es decir, de 5pm hasta las 8am), cualquier día.
export function offHoursStats(cells, { startHour = 8, endHour = 17 } = {}) {
  let total = 0
  let off = 0
  for (const c of cells || []) {
    const n = Number(c.count) || 0
    total += n
    const h = Number(c.hour)
    if (h < startHour || h >= endHour) off += n
  }
  return { off, total, pct: total ? Math.round((100 * off) / total) : 0 }
}
