import {
  fetchBotSummary, fetchBotTrend, fetchLessonsSummary, fetchContentGaps,
} from './analytics-api.js'
import {
  rangeControlsHtml, wireRangeControls, computeRange, kpiCard, sentimentBar,
} from './analytics-ui.js'
import { escapeHtml, exportCSV } from './utils.js'

export async function renderExecAnalytics(from = null, to = null) {
  const el = document.getElementById('analytics-content')
  if (!el) return
  if (!from || !to) { const r = computeRange('30d', new Date()); from = r.from; to = r.to }
  const prevFrom = new Date(from); const prevTo = new Date(to)
  const span = to - from
  prevFrom.setTime(from.getTime() - span); prevTo.setTime(from.getTime())
  el.innerHTML = `<p class="text-[var(--black-40)] text-sm p-4">Cargando…</p>`

  let bot, trend, lessons, gaps
  try {
    [bot, trend, lessons, gaps] = await Promise.all([
      fetchBotSummary(from, to),
      fetchBotTrend(6),
      fetchLessonsSummary(from, to, prevFrom, prevTo),
      fetchContentGaps(from, to),
    ])
  } catch (e) {
    el.innerHTML = `<p class="text-[var(--error-100)] text-sm p-4">Error: ${escapeHtml(e.message)}</p>`
    return
  }

  const k = bot.kpis
  const lk = lessons.kpis
  const sinHumano = (k.total ?? 0) - (k.support ?? 0)

  // Titular de impacto — la historia que la pestaña operativa no cuenta.
  const headline = `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-5">
      <div class="flex flex-wrap items-end gap-x-10 gap-y-4">
        <div>
          <p class="text-4xl font-black text-[var(--blue-100)] leading-none">${k.total ?? 0}</p>
          <p class="text-xs text-[var(--black-60)] mt-1">conversaciones atendidas</p>
        </div>
        <div>
          <p class="text-4xl font-black text-[var(--success-150)] leading-none">${sinHumano} <span class="text-lg font-bold">(${k.resolved_without_support_pct ?? 0}%)</span></p>
          <p class="text-xs text-[var(--black-60)] mt-1">resueltas por el bot sin intervención humana</p>
        </div>
        <div>
          <p class="text-4xl font-black text-[var(--black-40)] leading-none">${k.support ?? 0}</p>
          <p class="text-xs text-[var(--black-60)] mt-1">pasaron a un agente</p>
        </div>
      </div>
    </div>`

  // Tendencia 6 meses — protagonista (BolBot no la muestra).
  const maxConv = Math.max(1, ...trend.map(t => t.conversations))
  const trendBars = trend.map(t => `
    <div class="flex flex-col items-center gap-1 flex-1">
      <span class="text-[10px] text-[var(--black-60)] font-bold">${t.conversations}</span>
      <div class="w-full flex items-end justify-center" style="height:120px">
        <div class="w-8 bg-[var(--blue-100)] rounded-t" style="height:${Math.round(120 * t.conversations / maxConv)}px" title="${t.month}: ${t.conversations} conversaciones"></div>
      </div>
      <span class="text-[10px] text-[var(--black-40)]">${t.month.slice(5)}</span>
    </div>`).join('')
  const trendPanel = `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
      <p class="text-sm font-bold text-[var(--black-100)] mb-3">Conversaciones por mes (6 meses)</p>
      <div class="flex items-end gap-2">${trendBars || '<span class="text-xs text-[var(--black-40)]">Sin datos</span>'}</div>
    </div>`

  // Satisfacción — con barra (conteos dentro) y base explícita.
  const s = k.sentiment
  const satPanel = `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
      <p class="text-sm font-bold text-[var(--black-100)]">Satisfacción</p>
      <p class="text-[11px] text-[var(--black-40)] mb-2">sentimiento neto = % positivas − % negativas</p>
      <p class="text-3xl font-black text-[var(--black-100)] leading-none">${k.sentiment_net > 0 ? '+' : ''}${k.sentiment_net ?? 0}</p>
      <div class="mt-3">${sentimentBar(s)}</div>
    </div>`

  // Insights bot↔lecciones — exclusivo del Resumen, partido en dos bloques.
  const gapItem = g => `
    <div class="flex gap-2 p-2 rounded-lg bg-[var(--background-page)] border-l-2 border-[var(--warning-150)] mb-2">
      <span>${g.has_lesson ? '🔴' : '🔗'}</span>
      <div><p class="text-xs font-bold text-[var(--black-100)]">${escapeHtml(g.category)} (${g.total})</p>
        <p class="text-[11px] text-[var(--black-60)]">${g.has_lesson ? `resuelve ${g.resolved_pct ?? '—'}% — revisar lección` : 'sin lección — oportunidad de contenido'}</p></div>
    </div>`
  const sinLeccion = gaps.filter(g => !g.has_lesson).slice(0, 4)
  const conLeccion = gaps.filter(g => g.has_lesson).slice(0, 4)
  const insightsBlock = (title, items, empty) => `
    <p class="text-[11px] font-bold text-[var(--black-40)] uppercase tracking-wide mb-1 mt-2">${title}</p>
    ${items.length ? items.map(gapItem).join('') : `<p class="text-xs text-[var(--black-40)]">${empty}</p>`}`
  const insightsPanel = `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
      <p class="text-sm font-bold text-[var(--black-100)] mb-2">Insights bot ↔ lecciones</p>
      ${insightsBlock('🔗 Huecos de contenido', sinLeccion, 'Sin huecos en el rango.')}
      ${insightsBlock('🔴 Lecciones a revisar', conLeccion, 'Sin lecciones que revisar.')}
    </div>`

  // Formación — compacto abajo.
  const lessonsMini = `
    <div class="grid grid-cols-3 gap-3">
      ${kpiCard('Estudiantes en curso', lk.new_students ?? 0)}
      ${kpiCard('Certificados', lk.cert_views ?? 0)}
      ${kpiCard('Visitas', lk.visits ?? 0)}
    </div>`

  el.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      ${rangeControlsHtml('exec', from, to)}
      <button id="exec-export" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--coral-100)] text-white">⬇ Exportar resumen</button>
    </div>
    <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mb-2">El BolBot este mes</p>
    ${headline}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
      ${trendPanel}
      ${satPanel}
    </div>
    <div class="mt-3">${insightsPanel}</div>
    <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mt-6 mb-2">Formación / lecciones</p>
    ${lessonsMini}`

  wireRangeControls(el, 'exec', (f, t) => renderExecAnalytics(f, t))
  el.querySelector('#exec-export')?.addEventListener('click', () => {
    exportCSV(gaps, 'resumen-gaps.csv', [
      { label: 'Categoría', getValue: r => r.category },
      { label: 'Consultas', getValue: r => r.total },
      { label: 'Resolución %', getValue: r => r.resolved_pct ?? '' },
      { label: 'Tiene lección', getValue: r => r.has_lesson ? 'Sí' : 'No' },
    ])
  })
}
