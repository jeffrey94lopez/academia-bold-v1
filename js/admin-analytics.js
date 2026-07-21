import { supabase } from './supabase.js'
import { escapeHtml, exportCSV } from './utils.js'
import { rangeControlsHtml, wireRangeControls } from './analytics-ui.js'

export async function renderResultsPanel() {
  const el = document.getElementById('panel-results')
  if (!el) return
  el.innerHTML = '<p class="text-[var(--black-40)] text-sm">Cargando resultados...</p>'

  const [{ data: students, error: studentsError }, { data: lessons, error: lessonsError }] = await Promise.all([
    supabase.from('progreso_estudiantes').select('*').order('created_at', { ascending: false }).limit(500),
    supabase.from('lecciones').select('id'),
  ])

  if (studentsError || lessonsError) { el.innerHTML = '<p class="text-red-400 text-sm">Error al cargar resultados.</p>'; return }
  const totalLessons = lessons?.length || 0

  const completados = (students || []).filter(s => s.completado).length

  el.innerHTML = `
    <div class="mb-4">
      <h2 class="text-lg font-black">Resultados del curso</h2>
      <p class="text-xs text-[var(--black-40)] mt-0.5">${completados} estudiante${completados !== 1 ? 's' : ''} completaron el curso</p>
    </div>
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-[var(--blue-10)]">
            <th class="text-left px-4 py-3 text-xs font-black text-[var(--black-40)] uppercase tracking-wide">Nombre</th>
            <th class="text-left px-4 py-3 text-xs font-black text-[var(--black-40)] uppercase tracking-wide">Progreso</th>
            <th class="text-left px-4 py-3 text-xs font-black text-[var(--black-40)] uppercase tracking-wide">Promedio</th>
            <th class="text-left px-4 py-3 text-xs font-black text-[var(--black-40)] uppercase tracking-wide">Estado</th>
          </tr>
        </thead>
        <tbody>
          ${(students || []).map(s => {
            const entries = Object.values(s.progreso || {}).filter(v => v?.completado)
            const done = entries.length
            const avg = entries.length ? Math.round(entries.reduce((sum, v) => sum + (v.puntaje || 0), 0) / entries.length) : 0
            const badge = s.completado
              ? '<span class="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">Completado</span>'
              : '<span class="px-2 py-0.5 rounded-full bg-[var(--black-10)] text-[var(--black-60)] text-[10px] font-bold">En curso</span>'
            return `<tr class="border-b border-slate-50 last:border-0">
              <td class="px-4 py-3">
                <p class="font-bold">${escapeHtml(s.nombre)} ${escapeHtml(s.apellido)}</p>
                <p class="text-xs text-[var(--black-40)]">${new Date(s.created_at).toLocaleDateString('es-HN')}</p>
              </td>
              <td class="px-4 py-3 text-xs text-[var(--black-60)]">${done}/${totalLessons}</td>
              <td class="px-4 py-3 text-xs font-bold ${avg >= 70 ? 'text-green-600' : 'text-[var(--black-60)]'}">${entries.length ? avg + '%' : '—'}</td>
              <td class="px-4 py-3">${badge}</td>
            </tr>`
          }).join('') || '<tr><td colspan="4" class="px-4 py-6 text-center text-[var(--black-40)] text-sm">Ningún estudiante registrado aún.</td></tr>'}
        </tbody>
      </table>
    </div>
  `
}

export async function renderAnalyticsPanel(from = null, to = null) {
  const now = new Date()
  if (!from) { from = new Date(now); from.setHours(0, 0, 0, 0) }
  if (!to)   { to   = new Date(now); to.setHours(23, 59, 59, 999) }

  const el = document.getElementById('analytics-content')
  if (!el) return
  el.innerHTML = '<p class="text-[var(--black-40)] text-sm">Cargando analytics...</p>'

  const duration = to - from
  const prevFrom = new Date(from - duration)
  const prevTo   = new Date(from - 1)

  const [{ data: events, error }, { data: prevEvents }] = await Promise.all([
    supabase.from('analytics_events').select('*')
      .gte('created_at', from.toISOString()).lte('created_at', to.toISOString()).limit(5000),
    supabase.from('analytics_events').select('event_type,created_at')
      .gte('created_at', prevFrom.toISOString()).lte('created_at', prevTo.toISOString()).limit(5000),
  ])

  if (error) { el.innerHTML = '<p class="text-red-400 text-sm">Error al cargar analytics.</p>'; return }

  const ev = events || []
  const prev = prevEvents || []

  function count(arr, type) { return arr.filter(e => e.event_type === type).length }
  function delta(cur, prv) {
    if (!prv) return ''
    const d = cur - prv
    if (d === 0) return '<span class="text-[var(--black-40)]">sin cambio</span>'
    const sign = d > 0 ? '↑' : '↓'
    const color = d > 0 ? 'text-green-600' : 'text-red-500'
    return `<span class="${color} font-bold">${sign} ${Math.abs(d)}</span>`
  }

  const visits       = count(ev, 'page_view')
  const prevVisits   = count(prev, 'page_view')
  const newStudents  = ev.filter(e => e.event_type === 'mode_selected' && e.payload?.mode === 'course').length
  const prevStudents = prev.filter(e => e.event_type === 'mode_selected' && e.payload?.mode === 'course').length
  const passes       = ev.filter(e => e.event_type === 'exam_pass')
  const avgScore     = passes.length
    ? Math.round(passes.reduce((s, e) => s + (e.payload?.score || 0), 0) / passes.length)
    : 0
  const certViews  = count(ev, 'certificate_view')
  const certPrints = count(ev, 'certificate_print')

  const fmtDate = d => d.toISOString().split('T')[0]

  el.innerHTML = `
    <div class="flex items-center justify-between mb-5 flex-wrap gap-3">
      <h2 class="text-lg font-black">Analytics</h2>
      <div class="flex items-center gap-2 flex-wrap">
        ${rangeControlsHtml('analytics', from, to)}
        <button id="analytics-export-csv" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--blue-20)] text-[var(--black-60)] hover:border-slate-300">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          CSV
        </button>
      </div>
    </div>

    <div class="grid grid-cols-4 gap-4 mb-5">
      <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
        <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mb-1">Visitas</p>
        <p class="text-2xl font-black text-[var(--black-100)]">${visits}</p>
        <p class="text-xs mt-1">${delta(visits, prevVisits)}</p>
      </div>
      <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
        <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mb-1">Nuevos estudiantes</p>
        <p class="text-2xl font-black text-[var(--black-100)]">${newStudents}</p>
        <p class="text-xs mt-1">${delta(newStudents, prevStudents)}</p>
      </div>
      <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
        <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mb-1">Puntaje promedio</p>
        <p class="text-2xl font-black text-[var(--black-100)]">${passes.length ? avgScore + '%' : '—'}</p>
        <p class="text-xs text-[var(--black-40)] mt-1">En exámenes</p>
      </div>
      <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
        <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mb-1">Certificados</p>
        <p class="text-2xl font-black text-[var(--black-100)]">${certViews}</p>
        <p class="text-xs text-[var(--black-40)] mt-1">${certPrints} impresos</p>
      </div>
    </div>

    <div id="analytics-body"></div>
  `

  wireRangeControls(el, 'analytics', (f, t) => renderAnalyticsPanel(f, t))

  el.querySelector('#analytics-export-csv')?.addEventListener('click', () => {
    exportCSV(ev, `lecciones-analytics-${fmtDate(from)}-${fmtDate(to)}.csv`, [
      { label: 'Fecha',             getValue: r => new Date(r.created_at).toLocaleString('es-CO') },
      { label: 'Tipo de evento',    getValue: r => r.event_type },
      { label: 'ID lección',        getValue: r => r.payload?.lesson_id || '' },
      { label: 'Título lección',    getValue: r => r.payload?.lesson_title || '' },
      { label: 'Categoría',         getValue: r => r.payload?.category || '' },
      { label: 'Puntaje',           getValue: r => r.payload?.score ?? '' },
      { label: 'Término búsqueda',  getValue: r => r.payload?.term || '' },
      { label: 'Resultados',        getValue: r => r.payload?.results_count ?? '' },
      { label: 'Modo',              getValue: r => r.payload?.mode || '' },
      { label: 'Session ID',        getValue: r => r.session_id || '' }
    ])
  })

  renderAnalyticsBody(el.querySelector('#analytics-body'), ev, from, to)
}

function renderAnalyticsBody(container, ev, from, to) {
  const days = []
  const cursor = new Date(from); cursor.setHours(0, 0, 0, 0)
  const end = new Date(to); end.setHours(23, 59, 59, 999)
  while (cursor <= end) { days.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1) }

  const pageViews = ev.filter(e => e.event_type === 'page_view')
  const dayCounts = days.map(d => {
    const next = new Date(d); next.setDate(next.getDate() + 1)
    return pageViews.filter(e => { const t = new Date(e.created_at); return t >= d && t < next }).length
  })
  const maxCount = Math.max(...dayCounts, 1)
  const barWidth = Math.max(8, Math.min(32, Math.floor(480 / days.length) - 4))
  const dayLabels = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
  const fmtDay = d => days.length <= 14
    ? dayLabels[d.getDay()]
    : (d.getDate() === 1 || d.getDate() % 5 === 0 ? d.getDate() : '')

  const barsHtml = dayCounts.map((c, i) => {
    const h = Math.round((c / maxCount) * 64)
    return `<div class="flex flex-col items-center gap-1" title="${days[i].toLocaleDateString('es-HN')}: ${c} visitas">
      <div style="height:${h}px;width:${barWidth}px;background:${c === maxCount ? 'var(--blue-100)' : '#fca5a5'};border-radius:3px 3px 0 0;min-height:2px"></div>
      <span class="text-[9px] text-[var(--black-40)]">${fmtDay(days[i])}</span>
    </div>`
  }).join('')

  const modeEvents = ev.filter(e => e.event_type === 'mode_selected')
  const courseCount = modeEvents.filter(e => e.payload?.mode === 'course').length
  const exploreCount = modeEvents.filter(e => e.payload?.mode === 'explore').length
  const modeTotal = courseCount + exploreCount || 1
  const coursePct = Math.round(courseCount / modeTotal * 100)
  const explorePct = 100 - coursePct

  const lessonOpens = ev.filter(e => e.event_type === 'lesson_open')
  const lessonCounts = {}
  lessonOpens.forEach(e => {
    const key = e.payload?.lesson_title || e.payload?.lesson_id || 'Sin título'
    lessonCounts[key] = (lessonCounts[key] || 0) + 1
  })
  const topLessons = Object.entries(lessonCounts).sort((a, b) => b[1] - a[1]).slice(0, 10)

  container.innerHTML = `
    <div class="grid gap-4 mb-5" style="grid-template-columns:2fr 1fr">
      <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
        <p class="text-xs font-bold text-[var(--black-100)] mb-3">Visitas por día</p>
        ${days.length === 0 ? '<p class="text-[var(--black-40)] text-xs">Sin datos en el período</p>' : `
        <div class="flex items-end gap-1 overflow-x-auto" style="height:80px">
          ${barsHtml}
        </div>`}
      </div>
      <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
        <p class="text-xs font-bold text-[var(--black-100)] mb-3">Modo de entrada</p>
        <div class="space-y-2.5">
          <div>
            <div class="flex justify-between mb-1">
              <span class="text-xs font-bold text-[var(--black-100)]">Curso</span>
              <span class="text-xs font-bold text-[var(--blue-100)]">${coursePct}%</span>
            </div>
            <div class="h-1.5 bg-[var(--black-10)] rounded-full">
              <div class="h-1.5 bg-[var(--blue-100)] rounded-full" style="width:${coursePct}%"></div>
            </div>
          </div>
          <div>
            <div class="flex justify-between mb-1">
              <span class="text-xs font-bold text-[var(--black-100)]">Solo explorar</span>
              <span class="text-xs font-bold text-[var(--black-40)]">${explorePct}%</span>
            </div>
            <div class="h-1.5 bg-[var(--black-10)] rounded-full">
              <div class="h-1.5 bg-slate-300 rounded-full" style="width:${explorePct}%"></div>
            </div>
          </div>
        </div>
        ${modeTotal === 1 ? '<p class="text-[10px] text-[var(--black-40)] mt-3">Sin datos en el período</p>' : ''}
      </div>
    </div>

    <div class="bg-white rounded-2xl border border-[var(--blue-10)] overflow-hidden mb-5">
      <div class="px-4 py-3 border-b border-[var(--blue-10)]">
        <p class="text-xs font-bold text-[var(--black-100)]">Lecciones más vistas</p>
      </div>
      ${topLessons.length === 0
        ? '<p class="text-[var(--black-40)] text-xs p-4">Sin datos en el período</p>'
        : topLessons.map(([title, cnt]) => `
          <div class="flex items-center justify-between px-4 py-2.5 border-b border-slate-50 last:border-0">
            <span class="text-xs text-[var(--black-100)]">${escapeHtml(title)}</span>
            <span class="text-xs font-bold text-[var(--blue-100)]">${cnt}</span>
          </div>`).join('')}
    </div>

    <div id="analytics-searches"></div>
    <div id="analytics-exams" class="mt-5"></div>
  `

  renderSearchesSection(container.querySelector('#analytics-searches'), ev)
  renderExamsSection(container.querySelector('#analytics-exams'), ev)
}

function renderSearchesSection(container, ev) {
  const searches = ev.filter(e => e.event_type === 'lesson_search')
  const byTerm = {}
  searches.forEach(e => {
    const term = (e.payload?.term || '').toLowerCase().trim()
    if (!term) return
    if (!byTerm[term]) byTerm[term] = { count: 0, zeroCount: 0, lastAt: e.created_at, totalResults: 0 }
    byTerm[term].count++
    byTerm[term].totalResults += (e.payload?.results_count || 0)
    if ((e.payload?.results_count || 0) === 0) byTerm[term].zeroCount++
    if (e.created_at > byTerm[term].lastAt) byTerm[term].lastAt = e.created_at
  })

  let allTerms = Object.entries(byTerm)
    .map(([term, d]) => ({ term, ...d, avgResults: Math.round(d.totalResults / d.count), noResults: d.zeroCount === d.count }))
    .sort((a, b) => b.count - a.count)

  const PAGE = 20
  let page = 0
  let filterText = ''
  let filterNoResults = false

  function fmtRelTime(iso) {
    if (!iso) return '—'
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60000)
    if (m < 1) return 'ahora'
    if (m < 60) return `hace ${m}m`
    const h = Math.floor(m / 60)
    if (h < 24) return `hace ${h}h`
    return `hace ${Math.floor(h / 24)}d`
  }

  function renderTable() {
    let filtered = allTerms
    if (filterNoResults) filtered = filtered.filter(t => t.noResults)
    if (filterText) filtered = filtered.filter(t => t.term.includes(filterText.toLowerCase()))

    const total = filtered.length
    const noResultsCount = allTerms.filter(t => t.noResults).length
    const paged = filtered.slice(page * PAGE, (page + 1) * PAGE)

    container.innerHTML = `
      <div class="bg-white rounded-2xl border border-[var(--blue-10)] overflow-hidden">
        <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--blue-10)] flex-wrap gap-2">
          <p class="text-xs font-bold text-[var(--black-100)]">Todas las búsquedas</p>
          <div class="flex items-center gap-2">
            <label class="flex items-center gap-1.5 text-[10px] font-bold text-[var(--blue-100)] bg-[var(--blue-10)] px-2.5 py-1 rounded-lg cursor-pointer">
              <input id="srch-no-results" type="checkbox" class="accent-[var(--blue-100)]" ${filterNoResults ? 'checked' : ''}> Solo sin resultados
            </label>
            <input id="srch-filter" type="text" placeholder="🔍 Filtrar término..."
              value="${escapeHtml(filterText)}"
              class="px-2.5 py-1 border border-[var(--blue-20)] rounded-lg text-xs outline-none focus:border-[var(--blue-100)] w-40">
          </div>
        </div>
        ${paged.length === 0
          ? `<p class="text-[var(--black-40)] text-xs p-4">Sin resultados para este filtro</p>`
          : `<table class="w-full border-collapse text-xs">
          <thead>
            <tr class="bg-[var(--background-page)]">
              <th class="text-left px-4 py-2 text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide">Término</th>
              <th class="text-center px-4 py-2 text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide">Búsquedas</th>
              <th class="text-center px-4 py-2 text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide">Resultados prom.</th>
              <th class="text-center px-4 py-2 text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide">Última vez</th>
              <th class="text-center px-4 py-2 text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${paged.map(t => `
              <tr class="border-t border-slate-50 ${t.noResults ? 'bg-[var(--blue-10)]/40' : ''}">
                <td class="px-4 py-2.5 font-semibold ${t.noResults ? 'text-[var(--blue-100)]' : 'text-[var(--black-100)]'}">${escapeHtml(t.term)}</td>
                <td class="px-4 py-2.5 text-center text-[var(--black-60)]">${t.count}</td>
                <td class="px-4 py-2.5 text-center font-bold ${t.noResults ? 'text-[var(--blue-100)]' : 'text-[var(--black-100)]'}">${t.avgResults}</td>
                <td class="px-4 py-2.5 text-center text-[var(--black-40)]">${fmtRelTime(t.lastAt)}</td>
                <td class="px-4 py-2.5 text-center">
                  ${t.noResults
                    ? '<span class="bg-red-100 text-[var(--blue-100)] text-[10px] font-bold px-2 py-0.5 rounded-full">⚠ Sin resultados</span>'
                    : '<span class="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">Con resultados</span>'}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`}
        <div class="flex items-center justify-between px-4 py-2.5 border-t border-[var(--blue-10)]">
          <span class="text-[10px] text-[var(--black-40)]">${total} términos · <span class="text-[var(--blue-100)] font-bold">${noResultsCount} sin resultados</span></span>
          <div class="flex gap-1">
            <button class="srch-prev px-2.5 py-1 border border-[var(--blue-20)] rounded-lg text-[10px] text-[var(--black-60)] ${page === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[var(--background-page)]'}">‹ Anterior</button>
            <button class="srch-next px-2.5 py-1 border border-[var(--blue-20)] rounded-lg text-[10px] text-[var(--black-60)] ${(page + 1) * PAGE >= total ? 'opacity-40 cursor-not-allowed' : 'hover:bg-[var(--background-page)]'}">Siguiente ›</button>
          </div>
        </div>
      </div>
    `

    container.querySelector('#srch-no-results')?.addEventListener('change', e => {
      filterNoResults = e.target.checked; page = 0; renderTable()
    })
    container.querySelector('#srch-filter')?.addEventListener('input', e => {
      filterText = e.target.value; page = 0; renderTable()
    })
    container.querySelector('.srch-prev')?.addEventListener('click', () => {
      if (page > 0) { page--; renderTable() }
    })
    container.querySelector('.srch-next')?.addEventListener('click', () => {
      if ((page + 1) * PAGE < total) { page++; renderTable() }
    })
  }

  renderTable()
}

function renderExamsSection(container, ev) {
  const examEvents = ev.filter(e => e.event_type === 'exam_pass' || e.event_type === 'exam_fail')
  if (examEvents.length === 0) { container.innerHTML = ''; return }

  const byLesson = {}
  examEvents.forEach(e => {
    const key = e.payload?.lesson_title || e.payload?.lesson_id || 'Sin título'
    if (!byLesson[key]) byLesson[key] = { passes: 0, fails: 0, totalScore: 0, scoreCount: 0 }
    if (e.event_type === 'exam_pass') {
      byLesson[key].passes++
      byLesson[key].totalScore += (e.payload?.score || 0)
      byLesson[key].scoreCount++
    } else {
      byLesson[key].fails++
    }
  })

  const rows = Object.entries(byLesson)
    .map(([title, d]) => {
      const total = d.passes + d.fails
      const passPct = Math.round(d.passes / total * 100)
      const avgScore = d.scoreCount ? Math.round(d.totalScore / d.scoreCount) : 0
      const pctColor = passPct >= 80 ? 'text-green-600' : passPct >= 60 ? 'text-amber-500' : 'text-[var(--blue-100)]'
      return { title, total, passPct, avgScore, pctColor }
    })
    .sort((a, b) => b.total - a.total)

  container.innerHTML = `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] overflow-hidden">
      <div class="px-4 py-3 border-b border-[var(--blue-10)]">
        <p class="text-xs font-bold text-[var(--black-100)]">Resultados de exámenes por lección</p>
      </div>
      <table class="w-full border-collapse text-xs">
        <thead>
          <tr class="bg-[var(--background-page)]">
            <th class="text-left px-4 py-2 text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide">Lección</th>
            <th class="text-center px-4 py-2 text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide">Intentos</th>
            <th class="text-center px-4 py-2 text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide">Aprobaron</th>
            <th class="text-center px-4 py-2 text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide">Puntaje prom.</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr class="border-t border-slate-50">
              <td class="px-4 py-2.5 text-[var(--black-100)]">${escapeHtml(r.title)}</td>
              <td class="px-4 py-2.5 text-center text-[var(--black-60)]">${r.total}</td>
              <td class="px-4 py-2.5 text-center font-bold ${r.pctColor}">${r.passPct}%</td>
              <td class="px-4 py-2.5 text-center font-bold text-[var(--black-100)]">${r.avgScore}%</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `
}
