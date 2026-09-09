// % de conversaciones que entran FUERA del horario laboral, calculado desde el
// heatmap del dashboard (celdas {dow, hour, count} ya en hora de negocio).
// Import-safe → testeable con node:test.

// La zona horaria de negocio vive en biz-time.js (BIZ_TZ). Las celdas del
// heatmap ya llegan agrupadas en esa zona desde la RPC.
//
// Horario de atención por día de semana (dow: 0=Dom … 6=Sáb), [inicio, fin)
// en horas locales de BIZ_TZ. Lun–Vie 8am–5pm, Sáb 8am–12m, Dom cerrado.
export const BUSINESS_HOURS = {
  0: null,
  1: [8, 17],
  2: [8, 17],
  3: [8, 17],
  4: [8, 17],
  5: [8, 17],
  6: [8, 12],
}

// Una celda del heatmap cae fuera de horario si su día no atiende (domingo) o
// si su hora queda fuera de la ventana de ese día.
export function isOffHour(dow, hour, schedule = BUSINESS_HOURS) {
  const win = schedule[Number(dow)]
  if (!win) return true
  const h = Number(hour)
  return h < win[0] || h >= win[1]
}

export function offHoursStats(cells, { schedule = BUSINESS_HOURS } = {}) {
  let total = 0
  let off = 0
  for (const c of cells || []) {
    const n = Number(c.count) || 0
    total += n
    if (isOffHour(c.dow, c.hour, schedule)) off += n
  }
  return { off, total, pct: total ? Math.round((100 * off) / total) : 0 }
}
