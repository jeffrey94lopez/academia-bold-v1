import {
  fetchBotSummary, fetchBotTrend, fetchLessonsSummary, fetchContentGaps,
} from './analytics-api.js'
import {
  rangeControlsHtml, wireRangeControls, computeRange, kpiCard, llmNote,
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
  const hero = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      ${kpiCard('Conversaciones', k.total)}
      ${kpiCard('Resolución real ' + llmNote(), (k.resolved_pct ?? 0) + '%')}
      ${kpiCard('Resuelto sin soporte', (k.resolved_without_support_pct ?? 0) + '%', `${k.total - k.support} sin humano`)}
      ${kpiCard('Sentimiento neto', (k.sentiment_net > 0 ? '+' : '') + (k.sentiment_net ?? 0))}
    </div>`

  const lessonsMini = `
    <div class="grid grid-cols-3 gap-3 mt-3">
      ${kpiCard('Estudiantes en curso', lk.new_students)}
      ${kpiCard('Visitas', lk.visits)}
      ${kpiCard('Certificados', lk.cert_views)}
    </div>`

  const maxConv = Math.max(1, ...trend.map(t => t.conversations))
  const trendBars = trend.map(t => `
    <div class="flex flex-col items-center gap-1 flex-1">
      <div class="w-full flex items-end justify-center" style="height:80px">
        <div class="w-6 bg-[var(--blue-100)] rounded-t" style="height:${Math.round(80 * t.conversations / maxConv)}px" title="${t.conversations} conv · ${t.resolved_pct ?? '—'}% resuelto"></div>
      </div>
      <span class="text-[9px] text-[var(--black-40)]">${t.month.slice(5)}</span>
    </div>`).join('')

  const gapItems = gaps.slice(0, 3).map(g => `
    <div class="flex gap-2 p-2 rounded-lg bg-[var(--background-page)] border-l-2 border-[var(--warning-150)] mb-2">
      <span>${g.has_lesson ? '🔴' : '🔗'}</span>
      <div><p class="text-xs font-bold text-[var(--black-100)]">${escapeHtml(g.category)} (${g.total})</p>
        <p class="text-[11px] text-[var(--black-60)]">${g.has_lesson ? `resuelve ${g.resolved_pct ?? '—'}% — revisar lección` : 'sin lección — oportunidad de contenido'}</p></div>
    </div>`).join('') || '<p class="text-xs text-[var(--black-40)]">Sin huecos en el rango.</p>'

  el.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      ${rangeControlsHtml('exec', from, to)}
      <button id="exec-export" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--coral-100)] text-white">⬇ Exportar resumen</button>
    </div>
    <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mb-2">El BolBot</p>
    ${hero}
    <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mt-6 mb-2">Formación / lecciones</p>
    ${lessonsMini}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-6">
      <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-3">
        <p class="text-sm font-bold text-[var(--black-100)] mb-2">Volumen del bot (6 meses)</p>
        <div class="flex items-end gap-1">${trendBars || '<span class="text-xs text-[var(--black-40)]">Sin datos</span>'}</div>
      </div>
      <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-3">
        <p class="text-sm font-bold text-[var(--black-100)] mb-2">Insights bot ↔ lecciones ${llmNote()}</p>
        ${gapItems}
      </div>
    </div>`

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
