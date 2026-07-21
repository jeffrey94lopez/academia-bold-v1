// Helpers de UI compartidos por las vistas de analytics (shell, bot, exec, lecciones).
// Rango de fechas (presets + calendario), tarjeta KPI y nota "se afina con LLM".

export function computeRange(preset, now) {
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999)
  const daysAgo = n => { const d = new Date(todayStart); d.setDate(d.getDate() - n); return d }
  switch (preset) {
    case 'today': return { from: todayStart, to: todayEnd }
    case '7d':    return { from: daysAgo(6), to: todayEnd }
    case '30d':   return { from: daysAgo(29), to: todayEnd }
    case 'month': return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: todayEnd }
    case 'year':  return { from: new Date(now.getFullYear(), 0, 1), to: todayEnd }
    default:      return { from: daysAgo(29), to: todayEnd }
  }
}

const PRESETS = [['today', 'Hoy'], ['7d', '7 días'], ['30d', '30 días'], ['month', 'Este mes'], ['year', 'Este año']]
const fmtDate = d => d.toISOString().split('T')[0]

export function rangeControlsHtml(idPrefix, from, to) {
  const presetBtns = PRESETS.map(([key, label]) => `
    <button class="${idPrefix}-preset px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--black-10)] text-[var(--black-60)] hover:bg-[var(--blue-10)]" data-preset="${key}">${label}</button>`).join('')
  return `
  <div class="flex flex-wrap items-center gap-2">
    ${presetBtns}
    <div class="relative">
      <button id="${idPrefix}-cal-btn" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--black-10)] text-[var(--black-60)] hover:bg-[var(--blue-10)]">📅 Rango</button>
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
    const f = new Date(container.querySelector(`#${idPrefix}-from-input`).value)
    const t = new Date(container.querySelector(`#${idPrefix}-to-input`).value)
    t.setHours(23, 59, 59, 999)
    if (isNaN(f) || isNaN(t) || f > t) return
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

export function llmNote() {
  return `<span class="text-[10px] text-[var(--blue-40)] font-semibold">✨ se afina con LLM</span>`
}
