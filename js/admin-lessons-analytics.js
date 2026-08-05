// js/admin-lessons-analytics.js
// Pestaña Lecciones del analytics (3 capas: Impacto / Requiere tu atención /
// Exploración). Consume RPCs pre-agregadas; nada de bajar filas crudas. Las
// piezas FRONT (% leída completa, abandono de lectura) dependen de ①b y se
// muestran como 'próximamente'.
import {
  fetchLessonsSummary, fetchCourseFunnel, fetchZombieLessons,
} from './analytics-api.js'
import {
  computeLessonKpis, selectTrapLessons, zeroResultSearches, mergeLessonTable, selectNotFinished,
} from './lessons-analytics.js'
import {
  rangeControlsHtml, wireRangeControls, computeRange, kpiCard,
} from './analytics-ui.js'
import { escapeHtml, exportCSV } from './utils.js'

const deltaHtml = (d) => {
  if (d == null) return `<span class="text-[11px] text-[var(--black-40)]">— vs previo</span>`
  const up = d >= 0
  const color = up ? 'var(--success-150)' : 'var(--error-100)'
  return `<span class="text-[11px] font-bold" style="color:${color}">${up ? '▲' : '▼'} ${Math.abs(d)}% vs previo</span>`
}

export async function renderLessonsAnalytics(from = null, to = null) {
  const el = document.getElementById('analytics-content')
  if (!el) return
  if (!from || !to) { const r = computeRange('30d', new Date()); from = r.from; to = r.to }
  const prevFrom = new Date(from); const prevTo = new Date(to)
  const span = to - from
  prevFrom.setTime(from.getTime() - span); prevTo.setTime(from.getTime())
  el.innerHTML = `<p class="text-[var(--black-40)] text-sm p-4">Cargando…</p>`

  let summary, funnel, zombies
  try {
    [summary, funnel, zombies] = await Promise.all([
      fetchLessonsSummary(from, to, prevFrom, prevTo),
      fetchCourseFunnel(from, to),
      fetchZombieLessons(from, to, 2),
    ])
  } catch (e) {
    el.innerHTML = `<p class="text-[var(--error-100)] text-sm p-4">Error: ${escapeHtml(e.message)}</p>`
    return
  }

  const kpi = computeLessonKpis(summary, funnel)
  const traps = selectTrapLessons(summary.exams)
  const zeroSearches = zeroResultSearches(summary.searches)
  const table = mergeLessonTable(summary.top_lessons, summary.exams, summary.reading || [])
  const notFinished = selectNotFinished(summary.reading || [])

  // ── ① Impacto ──────────────────────────────────────────────────────────────
  const kcard = (label, value, delta) => `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
      <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mb-1">${label}</p>
      <p class="text-2xl font-black text-[var(--black-100)]">${value}</p>
      <div class="mt-1">${delta}</div>
    </div>`
  const impacto = `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      ${kcard('Visitas', kpi.visits, deltaHtml(kpi.visitsDelta))}
      ${kcard('Estudiantes en curso', kpi.newStudents, deltaHtml(kpi.newStudentsDelta))}
      ${kpiCard('% que termina el curso', kpi.completionPct == null ? '—' : kpi.completionPct + '%', 'certificados ÷ entraron al curso')}
      ${kpiCard('Certificados', kpi.certificates)}
    </div>`

  // ── ② Requiere tu atención ──────────────────────────────────────────────────
  const trapCard = traps.length ? `
    <div class="bg-white rounded-2xl border-l-4 border-[var(--error-100)] border border-[var(--blue-10)] p-4">
      <p class="text-sm font-bold text-[var(--black-100)]">🔴 Lecciones "trampa" <span class="text-[11px] font-normal text-[var(--black-60)]">— alta reprobación → reescribir</span></p>
      ${traps.map(t => `<div class="flex justify-between items-center mt-2 text-xs">
        <span class="text-[var(--black-100)] font-semibold truncate mr-2">${escapeHtml(t.lesson)}</span>
        <span class="shrink-0 text-[var(--error-100)] font-bold">${t.pass_pct}% aprueba · ${t.total} exámenes</span></div>`).join('')}
    </div>` : ''
  const zombieCard = zombies.length ? `
    <div class="bg-white rounded-2xl border-l-4 border-[var(--warning-150)] border border-[var(--blue-10)] p-4">
      <p class="text-sm font-bold text-[var(--black-100)]">👻 Lecciones "zombie" <span class="text-[11px] font-normal text-[var(--black-60)]">— activas casi sin visitas → despublicar/promocionar</span></p>
      ${zombies.slice(0, 6).map(z => `<div class="flex justify-between items-center mt-2 text-xs">
        <span class="text-[var(--black-100)] font-semibold truncate mr-2">${escapeHtml(z.titulo)}</span>
        <span class="shrink-0 text-[var(--black-60)]">${z.visits} visita(s)</span></div>`).join('')}
    </div>` : ''
  const zeroCard = zeroSearches.length ? `
    <div class="bg-white rounded-2xl border-l-4 border-[var(--warning-150)] border border-[var(--blue-10)] p-4">
      <p class="text-sm font-bold text-[var(--black-100)]">🔎 Búsquedas sin resultado <span class="text-[11px] font-normal text-[var(--black-60)]">— demanda de contenido inexistente → crear lección</span></p>
      ${zeroSearches.map(s => `<div class="flex justify-between items-center mt-2 text-xs">
        <span class="text-[var(--black-100)] font-semibold truncate mr-2">"${escapeHtml(s.term)}"</span>
        <span class="shrink-0 text-[var(--warning-150)] font-bold">${s.zero_count} sin resultado</span></div>`).join('')}
    </div>` : ''
  const soonCard = notFinished.length ? `
    <div class="bg-white rounded-2xl border-l-4 border-[var(--warning-150)] border border-[var(--blue-10)] p-4">
      <p class="text-sm font-bold text-[var(--black-100)]">📉 Se abren pero no se terminan <span class="text-[11px] font-normal text-[var(--black-60)]">— baja lectura completa → acortar/mejorar el inicio</span></p>
      ${notFinished.map(r => `<div class="flex justify-between items-center mt-2 text-xs">
        <span class="text-[var(--black-100)] font-semibold truncate mr-2">${escapeHtml(r.lesson)}</span>
        <span class="shrink-0 text-[var(--warning-150)] font-bold">${r.completion_pct}% leída · ${r.reads} lecturas</span></div>`).join('')}
    </div>` : ''
  const atencionCards = [trapCard, zombieCard, zeroCard].filter(Boolean).join('')
  const atencion = `
    <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mt-6 mb-2">Requiere tu atención</p>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
      ${atencionCards || '<p class="text-xs text-[var(--black-40)]">Sin señales en el rango.</p>'}
      ${soonCard}
    </div>`

  // ── ③ Exploración ───────────────────────────────────────────────────────────
  const stages = [
    ['Entró al curso', funnel.entered], ['Abrió lección', funnel.opened_lesson],
    ['Presentó examen', funnel.took_exam], ['Aprobó', funnel.approved], ['Certificado', funnel.certificate],
  ]
  const base = funnel.entered || 0
  const funnelHtml = `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
      <p class="text-sm font-bold text-[var(--black-100)] mb-3">Embudo del curso</p>
      ${stages.map(([label, n]) => {
        const pct = base ? Math.round(100 * (n || 0) / base) : 0
        return `<div class="mb-2">
          <div class="flex justify-between text-xs mb-0.5"><span class="text-[var(--black-60)]">${label}</span><span class="font-bold text-[var(--black-100)]">${n || 0} <span class="text-[var(--black-40)]">(${pct}%)</span></span></div>
          <div class="h-2 rounded-full bg-[var(--black-10)]"><div class="h-2 rounded-full bg-[var(--blue-100)]" style="width:${pct}%"></div></div>
        </div>`
      }).join('')}
    </div>`

  const maxV = Math.max(1, ...(summary.visits_by_day || []).map(d => d.count))
  const trendHtml = `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
      <p class="text-sm font-bold text-[var(--black-100)] mb-3">Visitas por día</p>
      <div class="flex items-end gap-1" style="height:120px">
        ${(summary.visits_by_day || []).map(d => `<div class="flex-1 bg-[var(--blue-100)] rounded-t" style="height:${Math.round(120 * d.count / maxV)}px" title="${d.day}: ${d.count}"></div>`).join('') || '<span class="text-xs text-[var(--black-40)]">Sin datos</span>'}
      </div>
    </div>`

  const tableHtml = `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
      <div class="flex justify-between items-center mb-3">
        <p class="text-sm font-bold text-[var(--black-100)]">Lecciones</p>
        <button id="lessons-export" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--coral-100)] text-white">⬇ Exportar</button>
      </div>
      <table class="w-full text-xs">
        <thead><tr class="text-left text-[var(--black-40)] uppercase text-[10px]">
          <th class="pb-2">Lección</th><th class="pb-2 text-right">Visitas</th><th class="pb-2 text-right">% aprueban</th>
          <th class="pb-2 text-right">% leída</th>
        </tr></thead>
        <tbody>
          ${table.map(r => `<tr class="border-t border-[var(--blue-10)]">
            <td class="py-1.5 text-[var(--black-100)] font-semibold">${escapeHtml(r.lesson)}</td>
            <td class="py-1.5 text-right">${r.visits}</td>
            <td class="py-1.5 text-right">${r.pass_pct == null ? '—' : r.pass_pct + '%'}</td>
            <td class="py-1.5 text-right ${r.read_pct == null ? 'text-[var(--black-40)]' : ''}">${r.read_pct == null ? '—' : r.read_pct + '%'}</td>
          </tr>`).join('') || '<tr><td colspan="4" class="py-2 text-[var(--black-40)]">Sin datos</td></tr>'}
        </tbody>
      </table>
    </div>`

  el.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      ${rangeControlsHtml('lessons', from, to)}
    </div>
    <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mb-2">Impacto</p>
    ${impacto}
    ${atencion}
    <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mt-6 mb-2">Exploración</p>
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
      ${funnelHtml}
      ${trendHtml}
    </div>
    <div class="mt-3">${tableHtml}</div>`

  wireRangeControls(el, 'lessons', (f, t) => renderLessonsAnalytics(f, t))
  el.querySelector('#lessons-export')?.addEventListener('click', () => {
    exportCSV(table, 'lecciones.csv', [
      { label: 'Lección', getValue: r => r.lesson },
      { label: 'Visitas', getValue: r => r.visits },
      { label: '% aprueban', getValue: r => r.pass_pct ?? '' },
    ])
  })
}
