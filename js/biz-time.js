// Zona horaria de negocio y helpers para trabajar con fechas ancladas a ella.
//
// Los dashboards de analytics mandan instantes (toISOString) a las RPC, y las
// RPC agrupan en hora de negocio. Si los rangos se armaran con la hora local del
// navegador del admin, "Hoy" cubriría un día distinto al que corta la base:
// desde Honduras (UTC-6) el día del admin va de 1am a 12:59am hora de Bogotá.
// Estos helpers construyen los instantes desde el reloj de pared de BIZ_TZ.
// Import-safe (sin DOM) → testeable con node:test.

export const BIZ_TZ = 'America/Bogota'

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: BIZ_TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
})

// Reloj de pared en la zona de negocio para un instante dado.
export function bizParts(date) {
  const p = {}
  for (const { type, value } of partsFmt.formatToParts(date)) p[type] = value
  return {
    year: +p.year, month: +p.month, day: +p.day,
    // hour12:false devuelve "24" para la medianoche en algunos motores.
    hour: +p.hour % 24, minute: +p.minute, second: +p.second,
  }
}

// Offset de BIZ_TZ respecto a UTC, en ms, para un instante dado. Se calcula
// desde el propio Intl en vez de hardcodear -5, así un cambio de reglas de la
// zona no deja los rangos corridos.
function offsetMs(ms) {
  const p = bizParts(new Date(ms))
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.floor(ms / 1000) * 1000 - asUTC
}

// Instante que corresponde a un reloj de pared de la zona de negocio. Acepta
// día/mes fuera de rango (Date.UTC los normaliza), así que bizDate(y, m, d - 6)
// es "hace 6 días" sin cuentas de milisegundos.
export function bizDate(year, month, day, hour = 0, minute = 0, second = 0, ms = 0) {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second, ms)
  return new Date(wall + offsetMs(wall))
}

// Medianoche y fin del día (en BIZ_TZ) del día al que pertenece el instante.
export function bizStartOfDay(date) {
  const p = bizParts(date)
  return bizDate(p.year, p.month, p.day)
}
export function bizEndOfDay(date) {
  const p = bizParts(date)
  return bizDate(p.year, p.month, p.day, 23, 59, 59, 999)
}

// Día de semana (0=Dom … 6=Sáb) en la zona de negocio.
const dowFmt = new Intl.DateTimeFormat('en-US', { timeZone: BIZ_TZ, weekday: 'short' })
const DOW_IDX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
export function bizDow(date) {
  return DOW_IDX[dowFmt.format(date)]
}

// 'YYYY-MM-DD' del día de negocio (lo que espera un <input type="date">).
// Ojo: toISOString() NO sirve para esto — el fin del día en Bogotá cae en el
// día siguiente en UTC.
export function fmtBizDay(date) {
  const p = bizParts(date)
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`
}

// Parsea 'YYYY-MM-DD' como día de negocio. Devuelve null si no es válido.
export function parseBizDay(str, { endOfDay = false } = {}) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || '').trim())
  if (!m) return null
  const [, y, mo, d] = m
  const date = endOfDay
    ? bizDate(+y, +mo, +d, 23, 59, 59, 999)
    : bizDate(+y, +mo, +d)
  return isNaN(date) ? null : date
}
