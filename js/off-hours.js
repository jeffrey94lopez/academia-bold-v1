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

// -------- Franjas del mapa de horario --------
// El mapa de 7×24 celdas es exacto pero hay que descifrarlo: para saber qué
// hora es una celda hay que contar columnas. Estas franjas agrupan el día en
// 4 bloques que SE DERIVAN del horario de atención, no están quemados: así
// cada bloque cae entero dentro o entero fuera del horario y se puede pintar
// de un solo color sin mentir. Si mañana cambia BUSINESS_HOURS, los cortes se
// mueven solos.
export function bandsFromSchedule(schedule = BUSINESS_HOURS) {
  const [open, close] = schedule[1] || [8, 17]
  const mid = Math.min(Math.max(open, 12), close)   // corte del mediodía, sin salirse del horario
  const bands = []
  if (open > 0) bands.push({ key: 'antes', label: 'Antes de abrir', from: 0, to: open })
  bands.push({ key: 'manana', label: 'Mañana', from: open, to: mid })
  if (mid < close) bands.push({ key: 'tarde', label: 'Tarde', from: mid, to: close })
  if (close < 24) bands.push({ key: 'despues', label: 'Después de cerrar', from: close, to: 24 })
  return bands
}

// Agrega las celdas {dow, hour, count} del heatmap en la rejilla día × franja.
// Devuelve, por día: los totales de cada franja y si esa franja se atiende ese
// día (el sábado cierra al mediodía, el domingo no abre).
export function bandStats(cells, { schedule = BUSINESS_HOURS } = {}) {
  const bands = bandsFromSchedule(schedule)
  const idxOf = h => bands.findIndex(b => h >= b.from && h < b.to)
  const rows = Array.from({ length: 7 }, (_, dow) => ({
    dow,
    counts: bands.map(() => 0),
    // Una franja cuenta como "fuera" solo si NINGUNA de sus horas se atiende.
    off: bands.map(b => {
      for (let h = b.from; h < b.to; h++) if (!isOffHour(dow, h, schedule)) return false
      return true
    }),
  }))
  let total = 0
  for (const c of cells || []) {
    const i = idxOf(Number(c.hour))
    const row = rows[Number(c.dow)]
    if (i < 0 || !row) continue
    const n = Number(c.count) || 0
    row.counts[i] += n
    total += n
  }
  let max = 0
  let top = null
  for (const row of rows) {
    row.counts.forEach((n, i) => {
      if (n > max) { max = n; top = { dow: row.dow, band: bands[i], count: n, off: row.off[i] } }
    })
  }
  return { bands, rows, max, top, total }
}
