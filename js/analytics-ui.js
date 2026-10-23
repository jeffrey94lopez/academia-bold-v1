// Helpers de UI compartidos por las vistas de analytics (shell, bot, exec, lecciones).
// Rango de fechas (presets + calendario), tarjeta KPI y nota "se afina con LLM".
import { bizParts, bizDate, fmtBizDay, parseBizDay } from './biz-time.js'
import { escapeHtml } from './utils.js'

// Los cortes son días de la zona de negocio, no del navegador del admin: "Hoy"
// es el día calendario de Bogotá, el mismo con el que agrupan las RPC.
export function computeRange(preset, now) {
  const { year, month, day } = bizParts(now)
  const todayEnd = bizDate(year, month, day, 23, 59, 59, 999)
  const daysAgo = n => bizDate(year, month, day - n)
  switch (preset) {
    case 'today': return { from: daysAgo(0), to: todayEnd }
    case '7d':    return { from: daysAgo(6), to: todayEnd }
    case '30d':   return { from: daysAgo(29), to: todayEnd }
    case 'month': return { from: bizDate(year, month, 1), to: todayEnd }
    case 'year':  return { from: bizDate(year, 1, 1), to: todayEnd }
    default:      return { from: daysAgo(29), to: todayEnd }
  }
}

const PRESETS = [['today', 'Hoy'], ['7d', '7 días'], ['30d', '30 días'], ['month', 'Este mes'], ['year', 'Este año']]
const fmtDate = fmtBizDay

// Detecta qué preset corresponde al rango actual (para resaltarlo). null = rango
// personalizado elegido en el calendario.
function activePreset(from, to) {
  if (!from || !to) return null
  const now = new Date()
  const f = fmtDate(from), t = fmtDate(to)
  for (const [key] of PRESETS) {
    const r = computeRange(key, now)
    if (fmtDate(r.from) === f && fmtDate(r.to) === t) return key
  }
  return null
}

const RANGE_ON = 'bg-[var(--blue-100)] text-white'
const RANGE_OFF = 'bg-[var(--black-10)] text-[var(--black-60)] hover:bg-[var(--blue-10)]'

export function rangeControlsHtml(idPrefix, from, to) {
  const active = activePreset(from, to)
  const presetBtns = PRESETS.map(([key, label]) => `
    <button class="${idPrefix}-preset px-3 py-1.5 rounded-lg text-xs font-bold ${key === active ? RANGE_ON : RANGE_OFF}" data-preset="${key}">${label}</button>`).join('')
  return `
  <div class="flex flex-wrap items-center gap-2">
    ${presetBtns}
    <div class="relative">
      <button id="${idPrefix}-cal-btn" class="px-3 py-1.5 rounded-lg text-xs font-bold ${active === null ? RANGE_ON : RANGE_OFF}">📅 Rango</button>
      <div id="${idPrefix}-cal-dropdown" class="hidden absolute z-20 mt-1 p-3 bg-white rounded-xl border border-[var(--blue-10)] shadow-lg flex flex-col gap-2">
        <label class="text-[10px] font-bold text-[var(--black-40)] uppercase">Desde
          <input id="${idPrefix}-from-input" type="date" value="${fmtDate(from)}" class="block mt-1 px-2 py-1 rounded border border-[var(--blue-20)] text-xs"></label>
        <label class="text-[10px] font-bold text-[var(--black-40)] uppercase">Hasta
          <input id="${idPrefix}-to-input" type="date" value="${fmtDate(to)}" class="block mt-1 px-2 py-1 rounded border border-[var(--blue-20)] text-xs"></label>
        <button id="${idPrefix}-apply-btn" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--blue-100)] text-white">Aplicar</button>
      </div>
    </div>
  </div>`
}

export function wireRangeControls(container, idPrefix, onRange) {
  const now = new Date()
  container.querySelectorAll(`.${idPrefix}-preset`).forEach(btn => {
    btn.addEventListener('click', () => {
      const { from, to } = computeRange(btn.dataset.preset, now)
      onRange(from, to)
    })
  })
  const calBtn = container.querySelector(`#${idPrefix}-cal-btn`)
  const calDrop = container.querySelector(`#${idPrefix}-cal-dropdown`)
  if (calBtn && calDrop) {
    calBtn.addEventListener('click', e => { e.stopPropagation(); calDrop.classList.toggle('hidden') })
    document.addEventListener('click', () => calDrop.classList.add('hidden'), { once: true })
  }
  container.querySelector(`#${idPrefix}-apply-btn`)?.addEventListener('click', () => {
    // El <input type="date"> da 'YYYY-MM-DD' sin zona: es un día de negocio, no
    // uno UTC ni uno del navegador.
    const f = parseBizDay(container.querySelector(`#${idPrefix}-from-input`).value)
    const t = parseBizDay(container.querySelector(`#${idPrefix}-to-input`).value, { endOfDay: true })
    if (!f || !t || f > t) return
    onRange(f, t)
  })
}

export function kpiCard(label, value, sub = '') {
  return `
  <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
    <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mb-1">${label}</p>
    <p class="text-2xl font-black text-[var(--black-100)]">${value}</p>
    ${sub ? `<p class="text-[11px] text-[var(--black-60)] mt-1">${sub}</p>` : ''}
  </div>`
}

// Barra apilada genérica con los conteos DENTRO de cada segmento. Interna: la
// comparten sentimentBar, frictionBar y lifecycleBar, que solo difieren en colores y
// etiquetas. Devuelve solo la barra (sin margen); el consumidor la envuelve
// con su propio spacing.
function stackedBar(segments) {
  const total = segments.reduce((sum, s) => sum + s.count, 0) || 1
  const seg = s => `
      <div class="flex items-center justify-center ${s.colorClass} ${s.textClass} text-[10px] font-bold overflow-hidden whitespace-nowrap" style="width:${Math.round(100 * s.count / total)}%" title="${s.count} ${s.label}">${s.count > 0 ? s.count : ''}</div>`
  return `
    <div class="flex h-5 rounded-full overflow-hidden">${segments.map(seg).join('')}
    </div>`
}

// Sentimiento (pos/neu/neg), reusada por el Resumen ejecutivo y el dashboard
// BolBot.
export function sentimentBar(sentiment) {
  const s = sentiment || {}
  return stackedBar([
    { count: s.positivo || 0, label: 'positivas', colorClass: 'bg-[var(--success-150)]', textClass: 'text-white' },
    { count: s.neutro   || 0, label: 'neutras',   colorClass: 'bg-[var(--black-10)]',    textClass: 'text-[var(--black-60)]' },
    { count: s.negativo || 0, label: 'negativas', colorClass: 'bg-[var(--error-100)]',   textClass: 'text-white' },
  ])
}

// Fricción: en cuántas conversaciones el bot NO pudo resolver por su cuenta.
// Reemplaza al sentimiento como métrica de cabecera — ver la migración
// update_analytics_bot_summary_friccion.sql para el porqué. Los buckets son
// excluyentes (no_info gana sobre soporte), así que la barra suma el total.
export function frictionBar(friction) {
  const f = friction || {}
  return stackedBar([
    { count: f.sin     || 0, label: 'sin fricción',           colorClass: 'bg-[var(--success-150)]', textClass: 'text-white' },
    { count: f.no_info || 0, label: 'el bot no tuvo la info', colorClass: 'bg-[var(--error-100)]',   textClass: 'text-white' },
    { count: f.support || 0, label: 'derivadas a soporte',    colorClass: 'bg-[var(--warning-150)]', textClass: 'text-white' },
  ])
}

// Cómo terminan las conversaciones. en_curso NO es segmento: se excluye del
// total (son las vivas de la ventana de cierre) y el consumidor lo muestra
// como nota al pie.
export function lifecycleBar(lifecycle) {
  const l = lifecycle || {}
  return stackedBar([
    { count: l.cerrada_cliente || 0, label: 'cerradas por el cliente', colorClass: 'bg-[var(--success-150)]', textClass: 'text-white' },
    { count: l.abandonada      || 0, label: 'abandonadas',             colorClass: 'bg-[var(--black-10)]',    textClass: 'text-[var(--black-60)]' },
    { count: l.escalada        || 0, label: 'escaladas a soporte',     colorClass: 'bg-[var(--warning-150)]', textClass: 'text-white' },
  ])
}

// Tarjeta de embudo: una barra por etapa, % sobre la PRIMERA etapa (no sobre la
// anterior) para que la caída total se lea de un vistazo. Es el markup que
// tenía inline el embudo del curso del dashboard de Lecciones (borrado en
// a85ab0a); se saca acá para que cualquier embudo se vea igual. `titulo` y las
// etiquetas son constantes del código: no se escapan.
export function funnelCardHtml(titulo, etapas) {
  const base = etapas[0]?.[1] || 0
  return `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
      <p class="text-sm font-bold text-[var(--black-100)] mb-3">${titulo}</p>
      ${etapas.map(([label, n]) => {
        const pct = base ? Math.round(100 * (n || 0) / base) : 0
        return `<div class="mb-2">
          <div class="flex justify-between text-xs mb-0.5"><span class="text-[var(--black-60)]">${label}</span><span class="font-bold text-[var(--black-100)]">${n || 0} <span class="text-[var(--black-40)]">(${pct}%)</span></span></div>
          <div class="h-2 rounded-full bg-[var(--black-10)]"><div class="h-2 rounded-full bg-[var(--blue-100)]" style="width:${pct}%"></div></div>
        </div>`
      }).join('')}
    </div>`
}

// Pasos numerados del recorrido (js/onboarding-steps.js, sin bienvenida ni
// cierre) con la etiqueta que ve el admin. No se importa PASOS de allá para no
// acoplar el admin al módulo de la página del recorrido.
const PASOS_RECORRIDO = [
  ['crear_item', 'Creó el ítem'],
  ['ver_items', 'Vio sus productos'],
  ['venta', 'Hizo la venta'],
  ['gasto', 'Registró el gasto'],
  ['facturas', 'Vio facturas'],
  ['inventario', 'Vio inventario'],
]
// Saltar y abrir el bot también se puede en la bienvenida y en el cierre, que
// no son etapas del embudo pero sí aparecen en los desgloses por paso.
const PASOS_DESGLOSE = [['bienvenida', 'Bienvenida'], ...PASOS_RECORRIDO, ['cierre', 'Cierre']]
const ETIQUETA_PASO = Object.fromEntries(PASOS_DESGLOSE)

// Desglose "paso → n". Las claves salen de payload.step, que escribe el
// navegador del cliente (analytics_events acepta inserts de anon): un paso
// desconocido se muestra escapado, nunca como HTML.
function porPasoHtml(titulo, porPaso) {
  const entradas = Object.entries(porPaso || {}).filter(([, n]) => n > 0)
  const orden = k => { const i = PASOS_DESGLOSE.findIndex(([id]) => id === k); return i < 0 ? 99 : i }
  entradas.sort((a, b) => orden(a[0]) - orden(b[0]))
  const filas = entradas.map(([k, n]) => `
        <div class="flex justify-between text-xs"><span class="text-[var(--black-60)]">${escapeHtml(ETIQUETA_PASO[k] || k)}</span><span class="font-bold text-[var(--black-100)]">${Number(n) || 0}</span></div>`).join('')
  return `
      <div>
        <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mb-1">${titulo}</p>
        ${filas || '<p class="text-xs text-[var(--black-40)]">—</p>'}
      </div>`
}

// Tarjeta "Recorrido guiado" del dashboard de Lecciones. `funnel` es la salida
// de analytics_onboarding_funnel, o null cuando la RPC falló (p. ej. todavía no
// se corrió la migración): en ese caso, y con 0 corridas, estado vacío.
export function onboardingFunnelHtml(funnel) {
  if (!funnel || !funnel.started) {
    return `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
      <p class="text-sm font-bold text-[var(--black-100)] mb-1">Recorrido guiado</p>
      <p class="text-xs text-[var(--black-40)]">Sin datos del recorrido todavía.</p>
    </div>`
  }
  const steps = funnel.steps || {}
  const etapas = [
    ['Empezó', funnel.started],
    ...PASOS_RECORRIDO.map(([id, label]) => [label, steps[id]]),
    ['Terminó', funnel.completed],
  ]
  return `
    <div class="flex flex-col gap-3">
      ${funnelCardHtml('Recorrido guiado', etapas)}
      <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4 grid grid-cols-2 gap-4">
        ${porPasoHtml('Saltaron en:', funnel.skipped_by_step)}
        ${porPasoHtml('Abrieron el bot en:', funnel.bot_by_step)}
      </div>
    </div>`
}
