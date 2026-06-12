import { supabase } from './supabase.js'
import { escapeHtml } from './utils.js'

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

  const el = document.getElementById('panel-analytics')
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

  function preset(label, f, t) {
    return `<button class="analytics-preset px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--black-10)] text-[var(--black-60)] hover:bg-[var(--black-10)]"
      data-from="${f.toISOString()}" data-to="${t.toISOString()}">${label}</button>`
  }
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999)
  function daysAgo(n) { const d = new Date(todayStart); d.setDate(d.getDate() - n); return d }
  function monthStart() { return new Date(now.getFullYear(), now.getMonth(), 1) }
  function yearStart()  { return new Date(now.getFullYear(), 0, 1) }
  const fmtDate = d => d.toISOString().split('T')[0]

  el.innerHTML = `
    <div class="flex items-center justify-between mb-5 flex-wrap gap-3">
      <div class="flex items-center gap-3">
        <h2 class="text-lg font-black">Analytics</h2>
        <div class="flex text-xs font-bold border border-[var(--blue-20)] rounded-xl overflow-hidden">
          <button id="analytics-tab-lecciones" class="px-3 py-1.5 bg-[var(--coral-100)] text-white">Lecciones</button>
          <button id="analytics-tab-bodi" class="px-3 py-1.5 text-[var(--black-60)] hover:bg-[var(--background-page)]">Bodi</button>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        ${preset('Hoy', todayStart, todayEnd)}
        ${preset('7 días', daysAgo(6), todayEnd)}
        ${preset('30 días', daysAgo(29), todayEnd)}
        ${preset('Este mes', monthStart(), todayEnd)}
        ${preset('Este año', yearStart(), todayEnd)}
        <button id="analytics-export-csv" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--blue-20)] text-[var(--black-60)] hover:border-slate-300">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          CSV
        </button>
        <div class="relative">
          <button id="analytics-cal-btn" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--blue-20)] text-[var(--black-60)] hover:border-slate-300">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Personalizado
          </button>
          <div id="analytics-cal-dropdown" class="hidden absolute right-0 mt-1 bg-white border border-[var(--blue-20)] rounded-xl shadow-xl p-4 z-20 flex gap-3 items-end" style="min-width:280px">
            <div class="flex flex-col gap-2 flex-1">
              <label class="text-xs font-bold text-[var(--black-60)]">Desde</label>
              <input id="analytics-from-input" type="date" value="${fmtDate(from)}"
                class="px-2 py-1.5 border border-[var(--blue-20)] rounded-lg text-xs outline-none focus:border-[var(--coral-100)]">
              <label class="text-xs font-bold text-[var(--black-60)]">Hasta</label>
              <input id="analytics-to-input" type="date" value="${fmtDate(to)}"
                class="px-2 py-1.5 border border-[var(--blue-20)] rounded-lg text-xs outline-none focus:border-[var(--coral-100)]">
            </div>
            <button id="analytics-apply-btn" class="px-3 py-1.5 bg-[var(--coral-100)] text-white text-xs font-bold rounded-lg">Aplicar</button>
          </div>
        </div>
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

  el.querySelectorAll('.analytics-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      renderAnalyticsPanel(new Date(btn.dataset.from), new Date(btn.dataset.to))
    })
  })

  const calBtn = el.querySelector('#analytics-cal-btn')
  const calDrop = el.querySelector('#analytics-cal-dropdown')
  calBtn.addEventListener('click', e => {
    e.stopPropagation()
    calDrop.classList.toggle('hidden')
  })
  document.addEventListener('click', () => calDrop.classList.add('hidden'), { once: true })
  el.querySelector('#analytics-apply-btn').addEventListener('click', () => {
    const f = new Date(el.querySelector('#analytics-from-input').value)
    const t = new Date(el.querySelector('#analytics-to-input').value)
    t.setHours(23, 59, 59, 999)
    if (isNaN(f) || isNaN(t) || f > t) return
    renderAnalyticsPanel(f, t)
  })

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

  el.querySelector('#analytics-tab-bodi')?.addEventListener('click', () => {
    renderBodiAnalytics(from, to)
  })

  el.querySelector('#analytics-tab-lecciones')?.addEventListener('click', () => {
    renderAnalyticsPanel(from, to)
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
      <div style="height:${h}px;width:${barWidth}px;background:${c === maxCount ? 'var(--coral-100)' : '#fca5a5'};border-radius:3px 3px 0 0;min-height:2px"></div>
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
              <span class="text-xs font-bold text-[var(--coral-100)]">${coursePct}%</span>
            </div>
            <div class="h-1.5 bg-[var(--black-10)] rounded-full">
              <div class="h-1.5 bg-[var(--coral-100)] rounded-full" style="width:${coursePct}%"></div>
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
            <span class="text-xs font-bold text-[var(--coral-100)]">${cnt}</span>
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
            <label class="flex items-center gap-1.5 text-[10px] font-bold text-[var(--coral-100)] bg-[var(--coral-10)] px-2.5 py-1 rounded-lg cursor-pointer">
              <input id="srch-no-results" type="checkbox" class="accent-[var(--coral-100)]" ${filterNoResults ? 'checked' : ''}> Solo sin resultados
            </label>
            <input id="srch-filter" type="text" placeholder="🔍 Filtrar término..."
              value="${escapeHtml(filterText)}"
              class="px-2.5 py-1 border border-[var(--blue-20)] rounded-lg text-xs outline-none focus:border-[var(--coral-100)] w-40">
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
              <tr class="border-t border-slate-50 ${t.noResults ? 'bg-[var(--coral-10)]/40' : ''}">
                <td class="px-4 py-2.5 font-semibold ${t.noResults ? 'text-[var(--coral-100)]' : 'text-[var(--black-100)]'}">${escapeHtml(t.term)}</td>
                <td class="px-4 py-2.5 text-center text-[var(--black-60)]">${t.count}</td>
                <td class="px-4 py-2.5 text-center font-bold ${t.noResults ? 'text-[var(--coral-100)]' : 'text-[var(--black-100)]'}">${t.avgResults}</td>
                <td class="px-4 py-2.5 text-center text-[var(--black-40)]">${fmtRelTime(t.lastAt)}</td>
                <td class="px-4 py-2.5 text-center">
                  ${t.noResults
                    ? '<span class="bg-red-100 text-[var(--coral-100)] text-[10px] font-bold px-2 py-0.5 rounded-full">⚠ Sin resultados</span>'
                    : '<span class="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">Con resultados</span>'}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`}
        <div class="flex items-center justify-between px-4 py-2.5 border-t border-[var(--blue-10)]">
          <span class="text-[10px] text-[var(--black-40)]">${total} términos · <span class="text-[var(--coral-100)] font-bold">${noResultsCount} sin resultados</span></span>
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
      const pctColor = passPct >= 80 ? 'text-green-600' : passPct >= 60 ? 'text-amber-500' : 'text-[var(--coral-100)]'
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

async function renderBodiAnalytics(from = null, to = null) {
  const now = new Date()
  if (!from) { from = new Date(now); from.setHours(0, 0, 0, 0) }
  if (!to)   { to   = new Date(now); to.setHours(23, 59, 59, 999) }

  const el = document.getElementById('panel-analytics')
  if (!el) return
  el.innerHTML = '<p class="text-[var(--black-40)] text-sm p-6">Cargando analytics de Bodi...</p>'

  const { data: convs, error } = await supabase
    .from('bodi_conversations')
    .select('*')
    .gte('started_at', from.toISOString())
    .lte('started_at', to.toISOString())
    .limit(2000)
    .order('started_at', { ascending: false })

  if (error) { el.innerHTML = '<p class="text-red-400 text-sm p-6">Error al cargar datos de Bodi.</p>'; return }

  const rows = convs || []
  const total = rows.length
  const withAnswer = rows.filter(r => r.resolved !== null)
  const resolved = rows.filter(r => r.resolved === true).length
  const unresolved = rows.filter(r => r.resolved === false)
  const abandoned = rows.filter(r => r.status === 'abandoned').length
  const support = rows.filter(r => r.support_redirected).length
  const resolvedPct = withAnswer.length ? Math.round(resolved / withAnswer.length * 100) : 0
  const abandonedPct = total ? Math.round(abandoned / total * 100) : 0

  const moduleStats = {}
  const globalSent = { positivo: 0, neutro: 0, negativo: 0 }
  rows.forEach(r => {
    const t = r.topic || 'Sin módulo'
    if (!moduleStats[t]) moduleStats[t] = { total: 0, resolved: 0, withAnswer: 0, abandoned: 0, support: 0, positivo: 0, neutro: 0, negativo: 0 }
    const m = moduleStats[t]
    m.total++
    if (r.resolved !== null) m.withAnswer++
    if (r.resolved === true) m.resolved++
    if (r.status === 'abandoned') m.abandoned++
    if (r.support_redirected) m.support++
    if (r.sentiment === 'positivo') { m.positivo++; globalSent.positivo++ }
    else if (r.sentiment === 'negativo') { m.negativo++; globalSent.negativo++ }
    else { m.neutro++; globalSent.neutro++ }
  })
  const moduleEntries = Object.entries(moduleStats).sort((a, b) => b[1].total - a[1].total)
  const sentimentTotal = globalSent.positivo + globalSent.neutro + globalSent.negativo || 1
  const maxModuleTotal = Math.max(...moduleEntries.map(e => e[1].total), 1)

  const heat = Array.from({ length: 7 }, () => new Array(24).fill(0))
  rows.forEach(r => {
    const d = new Date(r.started_at)
    const dayMon = (d.getDay() + 6) % 7
    const hour = d.getHours()
    heat[dayMon][hour]++
  })
  const maxHeat = Math.max(...heat.flat(), 1)
  const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

  // Header row: empty corner + 7 day labels
  let heatCells = `<div></div>` + dayNames.map(d =>
    `<div class="text-[9px] text-[var(--black-60)] text-center font-bold pb-0.5">${d}</div>`
  ).join('')

  for (let h = 0; h < 24; h++) {
    heatCells += `<div class="text-[9px] text-[var(--black-40)] flex items-center justify-end pr-1 leading-none">${String(h).padStart(2,'0')}h</div>`
    for (let d = 0; d < 7; d++) {
      const count = heat[d][h]
      const opacity = count ? (0.12 + 0.88 * count / maxHeat).toFixed(2) : '0'
      heatCells += `<div style="background:rgba(255,41,71,${opacity});border-radius:2px;min-height:10px" title="${dayNames[d]} ${String(h).padStart(2,'0')}:00 — ${count} conv."></div>`
    }
  }

  const fmtDate = d => d.toISOString().split('T')[0]
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0)
  const todayEnd   = new Date(now); todayEnd.setHours(23,59,59,999)
  function daysAgo(n) { const d = new Date(todayStart); d.setDate(d.getDate()-n); return d }
  function preset(label, f, t) {
    return `<button class="bodi-preset px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--black-10)] text-[var(--black-60)] hover:bg-[var(--black-10)]"
      data-from="${f.toISOString()}" data-to="${t.toISOString()}">${label}</button>`
  }

  el.innerHTML = `
    ${rows.length >= 1000 ? `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:10px 14px;margin-bottom:16px;font-size:13px;color:#856404;">Mostrando los primeros ${rows.length} registros. Usa filtros de fecha para ver rangos más específicos.</div>` : ''}
    <div class="flex items-center justify-between mb-5 flex-wrap gap-3">
      <div class="flex items-center gap-3">
        <h2 class="text-lg font-black">Analytics</h2>
        <div class="flex text-xs font-bold border border-[var(--blue-20)] rounded-xl overflow-hidden">
          <button id="bodi-tab-lecciones" class="px-3 py-1.5 text-[var(--black-60)] hover:bg-[var(--background-page)]">Lecciones</button>
          <button id="bodi-tab-bodi" class="px-3 py-1.5 bg-[var(--coral-100)] text-white">Bodi</button>
        </div>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        ${preset('Hoy', todayStart, todayEnd)}
        ${preset('7 días', daysAgo(6), todayEnd)}
        ${preset('30 días', daysAgo(29), todayEnd)}
        <button id="bodi-export-csv" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--blue-20)] text-[var(--black-60)] hover:border-slate-300">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          CSV
        </button>
      </div>
    </div>

    <div class="grid grid-cols-5 gap-3 mb-5">
      ${[
        ['Total conv.', total],
        ['Resueltas', resolvedPct + '%'],
        ['Abandonadas', abandonedPct + '%'],
        ['A soporte', support],
        ['Sin resolver', unresolved.length]
      ].map(([label, val]) => `
        <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
          <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mb-1">${label}</p>
          <p class="text-2xl font-black text-[var(--black-100)]">${val}</p>
        </div>`).join('')}
    </div>

    <div class="bg-white rounded-2xl border border-[var(--blue-10)] overflow-hidden mb-5">
      <div class="px-4 py-3 border-b border-[var(--blue-10)]">
        <p class="text-xs font-bold text-[var(--black-100)]">Conversaciones por módulo</p>
      </div>
      ${moduleEntries.length === 0
        ? '<p class="text-[var(--black-40)] text-xs p-4">Sin datos en el período</p>'
        : `<div class="overflow-x-auto"><table class="w-full border-collapse text-xs">
          <thead><tr class="border-b border-[var(--blue-10)] bg-[var(--background-page)]">
            <th class="px-4 py-2 text-left text-[10px] font-bold text-[var(--black-40)] uppercase">Módulo</th>
            <th class="px-4 py-2 text-right text-[10px] font-bold text-[var(--black-40)] uppercase">Total</th>
            <th class="px-4 py-2 text-right text-[10px] font-bold text-[var(--black-40)] uppercase">Resueltas</th>
            <th class="px-4 py-2 text-right text-[10px] font-bold text-[var(--black-40)] uppercase">Abandon.</th>
            <th class="px-4 py-2 text-right text-[10px] font-bold text-[var(--black-40)] uppercase">Soporte</th>
            <th class="px-4 py-2 text-left text-[10px] font-bold text-[var(--black-40)] uppercase">Sentimiento</th>
            <th class="px-4 py-2 text-left text-[10px] font-bold text-[var(--black-40)] uppercase">Volumen</th>
          </tr></thead>
          <tbody>
            ${moduleEntries.map(([topic, m]) => {
              const resolvedPctM = m.withAnswer ? Math.round(m.resolved / m.withAnswer * 100) : 0
              const abandonedPctM = m.total ? Math.round(m.abandoned / m.total * 100) : 0
              const supportPctM = m.total ? Math.round(m.support / m.total * 100) : 0
              const dominantSent = m.positivo >= m.negativo && m.positivo >= m.neutro ? 'positivo'
                : m.negativo >= m.neutro ? 'negativo' : 'neutro'
              const sentColor = dominantSent === 'positivo' ? '#22c55e' : dominantSent === 'negativo' ? '#ef4444' : '#94a3b8'
              const sentLabel = dominantSent === 'positivo' ? 'Positivo' : dominantSent === 'negativo' ? 'Negativo' : 'Neutro'
              const barPct = Math.round(m.total / maxModuleTotal * 100)
              return `<tr class="border-b border-slate-50 hover:bg-[var(--background-page)]">
                <td class="px-4 py-2.5 font-bold text-[var(--black-100)]">${escapeHtml(topic)}</td>
                <td class="px-4 py-2.5 text-right font-black text-[var(--coral-100)]">${m.total}</td>
                <td class="px-4 py-2.5 text-right text-[var(--black-60)]">${resolvedPctM}%</td>
                <td class="px-4 py-2.5 text-right text-[var(--black-60)]">${abandonedPctM}%</td>
                <td class="px-4 py-2.5 text-right text-[var(--black-60)]">${supportPctM}%</td>
                <td class="px-4 py-2.5">
                  <span class="text-[10px] font-bold px-2 py-0.5 rounded-full" style="color:${sentColor};background:${sentColor}18">${sentLabel}</span>
                </td>
                <td class="px-4 py-2.5 min-w-[80px]">
                  <div class="h-1.5 bg-[var(--black-10)] rounded-full">
                    <div class="h-1.5 bg-[var(--coral-100)] rounded-full" style="width:${barPct}%"></div>
                  </div>
                </td>
              </tr>`
            }).join('')}
          </tbody>
        </table></div>`}
    </div>

    <div class="grid gap-4 mb-5" style="grid-template-columns:1fr auto">
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4">
      <p class="text-xs font-bold text-[var(--black-100)] mb-3">Mapa de calor — hora × día de la semana</p>
      <div class="overflow-x-auto">
        <div class="grid gap-0.5" style="grid-template-columns:36px repeat(7,minmax(28px,1fr));min-width:240px;max-width:480px">
          ${heatCells}
        </div>
      </div>
      <p class="text-[10px] text-[var(--black-40)] mt-2">Más rojo = más conversaciones. Cada celda = una hora del día.</p>
    </div>
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4" style="min-width:140px">
      <p class="text-xs font-bold text-[var(--black-100)] mb-3">Sentimiento</p>
      ${[['Positivo','positivo','#22c55e'],['Neutro','neutro','#94a3b8'],['Negativo','negativo','#ef4444']].map(([label, key, color]) => {
        const cnt = globalSent[key]
        const pct = Math.round(cnt / sentimentTotal * 100)
        return `<div class="mb-3">
          <div class="flex justify-between mb-0.5">
            <span class="text-xs text-[var(--black-100)]">${label}</span>
            <span class="text-xs font-bold" style="color:${color}">${pct}%</span>
          </div>
          <div class="h-1.5 bg-[var(--black-10)] rounded-full">
            <div class="h-1.5 rounded-full" style="width:${pct}%;background:${color}"></div>
          </div>
          <p class="text-[10px] text-[var(--black-40)] mt-0.5">${cnt} conv.</p>
        </div>`
      }).join('')}
      ${total === 0 ? '<p class="text-[10px] text-[var(--black-40)]">Sin datos</p>' : ''}
    </div>
    </div>

    <div class="bg-white rounded-2xl border border-[var(--blue-10)] overflow-hidden mb-5">
      <div class="px-4 py-3 border-b border-[var(--blue-10)]">
        <p class="text-xs font-bold text-[var(--black-100)]">Conversaciones sin resolver (${unresolved.length})</p>
      </div>
      ${unresolved.length === 0
        ? '<p class="text-[var(--black-40)] text-xs p-4">Ninguna — ¡todo resuelto!</p>'
        : unresolved.slice(0, 20).map(r => `
          <div class="border-b border-slate-50 last:border-0">
            <button class="bodi-expand w-full text-left px-4 py-2.5 hover:bg-[var(--background-page)] flex items-center justify-between gap-2" data-id="${escapeHtml(r.id)}">
              <div class="flex items-center gap-3 min-w-0">
                <span class="text-xs text-[var(--black-60)] shrink-0">${new Date(r.started_at).toLocaleDateString('es-CO')}</span>
                <span class="text-xs font-bold text-[var(--black-100)] truncate">${escapeHtml(r.topic || '—')}</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full ${r.sentiment === 'negativo' ? 'bg-[var(--coral-10)] text-red-600' : 'bg-[var(--black-10)] text-[var(--black-60)]'}">${escapeHtml(r.sentiment || '—')}</span>
              </div>
              <svg class="w-3.5 h-3.5 text-[var(--black-40)] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div class="bodi-messages hidden px-4 pb-3 space-y-1.5" data-id="${escapeHtml(r.id)}">
              ${(r.messages || []).map(m => `
                <div class="text-xs ${m.role === 'user' ? 'text-blue-700 bg-blue-50' : 'text-[var(--black-100)] bg-[var(--background-page)]'} rounded-lg px-3 py-1.5">
                  <span class="font-bold">${m.role === 'user' ? 'Usuario' : 'Bodi'}:</span> ${escapeHtml(m.content || '')}
                </div>`).join('')}
            </div>
          </div>`).join('')}
    </div>

    <div class="bg-white rounded-2xl border border-[var(--blue-10)] overflow-hidden">
      <div class="px-4 py-3 border-b border-[var(--blue-10)]">
        <p class="text-xs font-bold text-[var(--black-100)]">Conversaciones recientes</p>
        <p class="text-[10px] text-[var(--black-40)] mt-0.5">Clic en una fila para ver el detalle</p>
      </div>
      ${rows.length === 0
        ? '<p class="text-[var(--black-40)] text-xs p-4">Sin conversaciones en el período</p>'
        : `<div class="overflow-x-auto"><table class="w-full border-collapse text-xs">
          <thead><tr class="border-b border-[var(--blue-10)]">
            <th class="px-4 py-2 text-left text-[10px] font-bold text-[var(--black-40)] uppercase">Fecha</th>
            <th class="px-4 py-2 text-left text-[10px] font-bold text-[var(--black-40)] uppercase">Primera pregunta</th>
            <th class="px-4 py-2 text-left text-[10px] font-bold text-[var(--black-40)] uppercase">Módulo</th>
            <th class="px-4 py-2 text-left text-[10px] font-bold text-[var(--black-40)] uppercase">Sentimiento</th>
            <th class="px-4 py-2 text-left text-[10px] font-bold text-[var(--black-40)] uppercase">Estado</th>
            <th class="px-4 py-2 text-left text-[10px] font-bold text-[var(--black-40)] uppercase">Resuelto</th>
          </tr></thead>
          <tbody>
            ${rows.slice(0, 50).map(r => {
              const firstQ = (r.messages || []).find(m => m.role === 'user')
              const preview = firstQ ? (firstQ.content.length > 65 ? firstQ.content.slice(0, 65) + '…' : firstQ.content) : '—'
              const msgRows = (r.messages || []).map(m => `
                <div class="text-xs ${m.role === 'user' ? 'text-blue-700 bg-blue-50' : 'text-[var(--black-100)] bg-[var(--background-page)]'} rounded-lg px-3 py-1.5 mb-1">
                  <span class="font-bold mr-1">${m.role === 'user' ? 'Usuario:' : 'Bodi:'}</span>${escapeHtml(m.content || '')}
                </div>`).join('')
              return `
              <tr class="border-b border-slate-50 hover:bg-[var(--background-page)] cursor-pointer bodi-conv-row" data-id="${escapeHtml(r.id)}">
                <td class="px-4 py-2 text-[var(--black-60)] shrink-0 whitespace-nowrap">${new Date(r.started_at).toLocaleString('es-CO', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}</td>
                <td class="px-4 py-2 text-[var(--black-60)] max-w-[220px]"><span class="line-clamp-1">${escapeHtml(preview)}</span></td>
                <td class="px-4 py-2 font-medium text-[var(--black-100)] whitespace-nowrap">${escapeHtml(r.topic || '—')}</td>
                <td class="px-4 py-2 text-[var(--black-60)] whitespace-nowrap">${escapeHtml(r.sentiment || '—')}</td>
                <td class="px-4 py-2 whitespace-nowrap">
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${r.status === 'completed' ? 'bg-green-50 text-green-700' : r.status === 'abandoned' ? 'bg-orange-50 text-orange-700' : 'bg-[var(--black-10)] text-[var(--black-60)]'}">${escapeHtml(r.status || '')}</span>
                </td>
                <td class="px-4 py-2 font-bold whitespace-nowrap ${r.resolved === true ? 'text-green-600' : r.resolved === false ? 'text-red-500' : 'text-[var(--black-40)]'}">
                  ${r.resolved === true ? 'Sí' : r.resolved === false ? 'No' : '—'}
                </td>
              </tr>
              <tr class="bodi-conv-detail hidden" data-id="${escapeHtml(r.id)}">
                <td colspan="6" class="px-4 py-3 bg-[var(--background-page)] border-b border-[var(--blue-10)]">
                  ${(r.lessons_used && r.lessons_used.length)
                    ? `<p class="text-[10px] font-bold text-[var(--black-40)] uppercase mb-1.5">Lecciones consultadas</p>
                       <div class="flex flex-wrap gap-1 mb-3">
                         ${r.lessons_used.map(l => `<span class="text-[10px] bg-[var(--coral-10)] text-red-700 px-2 py-0.5 rounded-full font-medium">${escapeHtml(l)}</span>`).join('')}
                       </div>`
                    : r.topic
                      ? `<div class="bodi-lessons-container" data-topic="${escapeHtml(r.topic)}" data-loaded="false"></div>`
                      : ''}
                  ${msgRows ? `<p class="text-[10px] font-bold text-[var(--black-40)] uppercase mb-1.5">Conversación</p>${msgRows}` : '<p class="text-xs text-[var(--black-40)]">Sin mensajes registrados</p>'}
                </td>
              </tr>`
            }).join('')}
          </tbody>
        </table></div>`}
    </div>
  `

  el.querySelectorAll('.bodi-preset').forEach(btn => {
    btn.addEventListener('click', () => renderBodiAnalytics(new Date(btn.dataset.from), new Date(btn.dataset.to)))
  })

  el.querySelectorAll('.bodi-conv-row').forEach(row => {
    row.addEventListener('click', async () => {
      const detail = el.querySelector(`.bodi-conv-detail[data-id="${row.dataset.id}"]`)
      if (!detail) return
      detail.classList.toggle('hidden')
      row.classList.toggle('bg-[var(--black-10)]')

      if (detail.classList.contains('hidden')) return

      const container = detail.querySelector('.bodi-lessons-container')
      if (!container || container.dataset.loaded !== 'false') return

      container.dataset.loaded = 'loading'
      const topic = container.dataset.topic
      if (!topic) { container.dataset.loaded = 'true'; return }

      const { data: topicLessons } = await supabase
        .from('lecciones').select('titulo').eq('categoria', topic).order('orden')

      container.dataset.loaded = 'true'
      if (!topicLessons?.length) return

      container.innerHTML = `
        <p class="text-[10px] font-bold text-[var(--black-40)] uppercase mb-1.5">Lecciones del módulo "${escapeHtml(topic)}"</p>
        <div class="flex flex-wrap gap-1 mb-3">
          ${topicLessons.map(l => `<span class="text-[10px] bg-[var(--coral-10)] text-red-700 px-2 py-0.5 rounded-full font-medium">${escapeHtml(l.titulo)}</span>`).join('')}
        </div>`
    })
  })

  el.querySelector('#bodi-export-csv')?.addEventListener('click', () => {
    exportCSV(rows, `bodi-conversaciones-${fmtDate(from)}-${fmtDate(to)}.csv`, [
      { label: 'ID',                getValue: r => r.id },
      { label: 'Session ID',        getValue: r => r.session_id },
      { label: 'Fecha inicio',      getValue: r => new Date(r.started_at).toLocaleString('es-CO') },
      { label: 'Fecha fin',         getValue: r => r.ended_at ? new Date(r.ended_at).toLocaleString('es-CO') : '' },
      { label: 'Duración (min)',     getValue: r => r.ended_at ? Math.round((new Date(r.ended_at) - new Date(r.started_at)) / 60000) : '' },
      { label: 'Módulo',            getValue: r => r.topic || '' },
      { label: 'Sentimiento',       getValue: r => r.sentiment || '' },
      { label: 'Resuelto',          getValue: r => r.resolved === true ? 'Sí' : r.resolved === false ? 'No' : 'Sin respuesta' },
      { label: 'Estado',            getValue: r => r.status || '' },
      { label: 'Soporte',           getValue: r => r.support_redirected ? 'Sí' : 'No' },
      { label: 'Mensajes (JSON)',    getValue: r => JSON.stringify(r.messages || []) }
    ])
  })

  el.querySelector('#bodi-tab-lecciones')?.addEventListener('click', () => renderAnalyticsPanel(from, to))
  el.querySelector('#bodi-tab-bodi')?.addEventListener('click', () => renderBodiAnalytics(from, to))

  el.querySelectorAll('.bodi-expand').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id
      const msgs = el.querySelector(`.bodi-messages[data-id="${CSS.escape(id)}"]`)
      if (msgs) msgs.classList.toggle('hidden')
    })
  })
}

function exportCSV(rows, filename, columns) {
  const header = columns.map(c => c.label).join(',')
  const body = rows.map(row =>
    columns.map(c => {
      const v = c.getValue(row)
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s
    }).join(',')
  ).join('\n')
  const blob = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
