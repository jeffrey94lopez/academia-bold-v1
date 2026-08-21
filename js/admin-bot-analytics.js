import {
  fetchBotSummary, fetchBotConversations, fetchContentGaps, fetchOffHours,
} from './analytics-api.js'
import {
  rangeControlsHtml, wireRangeControls, computeRange,
} from './analytics-ui.js'
import { escapeHtml, exportCSV } from './utils.js'
import { rankAttention } from './bot-attention.js'
import { offHoursStats } from './off-hours.js'

const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

// Fecha + hora de una conversación, en zona de negocio (misma que el heatmap)
// para que la hora mostrada no dependa del navegador del admin.
const BIZ_TZ = 'America/Tegucigalpa'
function fmtDayTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  const dia = d.toLocaleDateString('es-HN', { timeZone: BIZ_TZ, day: '2-digit', month: 'short' })
  const hora = d.toLocaleTimeString('es-HN', { timeZone: BIZ_TZ, hour: '2-digit', minute: '2-digit', hour12: false })
  return `${dia}, ${hora}`
}

export async function renderBotAnalytics(from = null, to = null) {
  const el = document.getElementById('analytics-content')
  if (!el) return
  if (!from || !to) { const r = computeRange('7d', new Date()); from = r.from; to = r.to }
  el.innerHTML = `<p class="text-[var(--black-40)] text-sm p-4">Cargando…</p>`

  let summary, convs, gaps, offHours
  try {
    [summary, convs, gaps, offHours] = await Promise.all([
      fetchBotSummary(from, to),
      fetchBotConversations(from, to, { limit: 100 }),
      fetchContentGaps(from, to),
      // RPC opcional: si aún no está aplicado, no rompe el dashboard (cae al heatmap).
      fetchOffHours(from, to).catch(() => null),
    ])
  } catch (e) {
    el.innerHTML = `<p class="text-[var(--error-100)] text-sm p-4">Error cargando analytics del bot: ${escapeHtml(e.message)}</p>`
    return
  }

  const k = summary.kpis

  // Header — total + resolución real + cómo terminó + sentimiento.
  const total = k.total || 0
  const pct = n => total ? Math.round(100 * n / total) : 0
  const lc = k.lifecycle || {}
  const totalRes = (k.resolved || 0) + (k.unresolved || 0) + (k.ambiguous || 0)
  const pctR = n => totalRes ? Math.round(100 * n / totalRes) : 0
  const drill = obj => `data-drill='${escapeHtml(JSON.stringify(obj))}'`

  const header = `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-5">
      <p class="mb-3"><span class="text-4xl font-black text-[var(--blue-100)]">${total}</span> <span class="text-sm text-[var(--black-60)]">conversaciones en el rango</span></p>

      <!-- Resolución real (estilo barra segmentada) -->
      <div class="mt-3">
        <p class="text-[11px] text-center text-[var(--black-60)]"><span class="font-bold text-[var(--black-100)]">Resolución real</span> <span class="text-[var(--black-40)]">· sin ambiguas</span></p>
        <div class="flex h-5 rounded-md overflow-hidden gap-0.5 mt-1 cursor-pointer">
          <div ${drill({ estado: 'resuelta' })} class="bot-drill flex items-center justify-center text-[10px] font-bold" style="width:${pctR(k.resolved || 0)}%;background:var(--success-10);color:var(--success-150)">resueltas ${k.resolved || 0}</div>
          <div ${drill({ estado: 'no_resuelta' })} class="bot-drill flex items-center justify-center text-[10px] font-bold" style="width:${pctR(k.unresolved || 0)}%;background:var(--error-10);color:var(--error-100)">no resueltas ${k.unresolved || 0}</div>
          <div ${drill({ estado: 'ambigua' })} class="bot-drill flex items-center justify-center text-[10px] font-bold" style="width:${pctR(k.ambiguous || 0)}%;background:var(--black-10);color:var(--black-60)">ambiguas ${k.ambiguous || 0}</div>
        </div>
        <p class="mt-1 text-center text-[var(--black-40)]"><span class="text-base font-black text-[var(--black-100)]">${k.resolved_pct ?? 0}%</span> <span class="text-[10px]">resueltas (sin contar ambiguas)</span></p>
      </div>

      <!-- Cómo terminó (barra bajada) + Sentimiento, lado a lado -->
      <div class="border-t border-[var(--blue-10)] mt-4 pt-3 flex flex-wrap gap-x-8 gap-y-3 items-center">
        <div>
          <p class="text-[11px] text-[var(--black-60)]">Cómo terminó <span class="text-[var(--black-40)]">· cerró el cliente</span></p>
          <p class="text-xl font-black text-[var(--black-100)]">${pct(lc.cerrada_cliente || 0)}%
            <span class="text-[11px] font-normal text-[var(--black-60)]">
              <button ${drill({ life: 'cerrada_cliente' })} class="bot-drill underline">${lc.cerrada_cliente || 0} cerró</button> ·
              <button ${drill({ life: 'abandonada' })} class="bot-drill underline">${lc.abandonada || 0} abandonó</button> ·
              <button ${drill({ life: 'escalada' })} class="bot-drill underline">${lc.escalada || 0} escaló</button>
            </span>
          </p>
        </div>
        <div>
          <p class="text-[11px] text-[var(--black-60)] mb-1">Sentimiento</p>
          <div class="flex gap-3 text-sm font-bold">
            <button ${drill({ sent: 'positivo' })} class="bot-drill flex items-center gap-1" style="color:var(--success-150)"><i data-lucide="smile" class="w-4 h-4"></i>${pct((k.sentiment || {}).positivo || 0)}%</button>
            <button ${drill({ sent: 'neutro' })} class="bot-drill flex items-center gap-1 text-[var(--black-60)]"><i data-lucide="meh" class="w-4 h-4"></i>${pct((k.sentiment || {}).neutro || 0)}%</button>
            <button ${drill({ sent: 'negativo' })} class="bot-drill flex items-center gap-1" style="color:var(--error-100)"><i data-lucide="frown" class="w-4 h-4"></i>${pct((k.sentiment || {}).negativo || 0)}%</button>
          </div>
        </div>
      </div>
    </div>`

  // "Qué atender ahora" — lista priorizada (rankAttention reemplaza al viejo
  // par negCat/pickContentToReinforce con un solo ranking cruzado con gaps).
  const attnItems = rankAttention(summary.by_category, gaps)
  const ACT = { crear: ['Crear lección', 'var(--error-100)'], revisar: ['Revisar lección', 'var(--warning-150)'], reforzar: ['Reforzar contenido', 'var(--blue-100)'] }
  // Nombre claro de la regla que disparó cada ítem, para entender por qué atenderlo.
  const REASON = {
    'contenido-faltante': 'Contenido faltante',
    'baja-resolucion': 'Baja resolución',
    'negativo': 'Sentimiento negativo',
    'escala': 'Escala a soporte',
  }
  const attention = attnItems.length ? `
    <div class="flex flex-col gap-2 mt-4">
      ${attnItems.map(it => {
        const [label, color] = ACT[it.action]
        const f = { category: it.category, ...(it.extraStatus ? { estado: it.extraStatus } : {}) }
        const act = it.action === 'crear' ? `data-gap-cat="${escapeHtml(it.category)}"` : `data-edit-cat="${escapeHtml(it.category)}"`
        return `<div class="bot-drill flex items-center gap-2 p-3 rounded-xl border border-[var(--blue-10)] cursor-pointer" ${drill(f)}>
          <span class="flex-1 min-w-0 text-sm text-[var(--black-100)]">
            <span class="font-bold">${escapeHtml(it.category)}</span>
            <span class="block text-xs mt-0.5"><span class="font-bold" style="color:${color}">${REASON[it.problem] || 'Atención'}</span> <span class="text-[var(--black-60)]">· ${it.detail}</span></span>
          </span>
          <button ${act} class="shrink-0 text-xs font-bold px-2 py-1 rounded border" style="color:${color};border-color:${color}">${label}</button>
        </div>`
      }).join('')}
    </div>` : '<p class="text-xs text-[var(--black-40)] mt-4">Sin señales de atención en el rango.</p>'

  // Capa ③ — Exploración: categorías + heatmap + explorador
  const maxCat = Math.max(1, ...summary.by_category.map(c => c.total))
  const catRows = summary.by_category.map(c => `
    <tr class="border-b border-[var(--blue-10)] bot-drill cursor-pointer" ${drill({ category: c.category })}>
      <td class="p-2 text-xs text-[var(--black-100)]">${escapeHtml(c.category)}</td>
      <td class="p-2 w-1/3"><div class="h-1.5 bg-[var(--black-10)] rounded-full"><div class="h-1.5 bg-[var(--blue-100)] rounded-full" style="width:${Math.round(100 * c.total / maxCat)}%"></div></div></td>
      <td class="p-2 text-xs text-right text-[var(--black-60)]">${c.total}</td>
      <td class="p-2 text-xs text-right text-[var(--black-60)]">${c.resolved_pct ?? '—'}%</td>
    </tr>`).join('')

  const heat = buildHeatmap(summary.heatmap)
  const ohFallback = offHoursStats(summary.heatmap)  // solo conteo (sin resolución)
  const ohPct = offHours ? offHours.off_pct : ohFallback.pct
  const ohOff = offHours ? offHours.off : ohFallback.off
  const ohTotal = offHours ? offHours.total : ohFallback.total
  const ohResolved = offHours && offHours.off
    ? ` · de esas, <span class="font-bold text-[var(--black-100)]">${offHours.off_resolved_pct ?? 0}%</span> resueltas`
    : ''

  const explorer = renderExplorer(convs)

  el.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      ${rangeControlsHtml('bot', from, to)}
      <button id="bot-export-csv" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--black-10)] text-[var(--black-60)] hover:bg-[var(--blue-10)]">⬇ CSV</button>
    </div>
    ${header}
    <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mt-6 mb-2">Qué atender ahora</p>
    ${attention}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-6">
      <div class="bg-white rounded-2xl border border-[var(--blue-10)] overflow-hidden">
        <p class="p-3 text-sm font-bold text-[var(--black-100)]">Dudas por categoría</p>
        <table class="w-full"><tbody>${catRows || '<tr><td class="p-3 text-xs text-[var(--black-40)]">Sin datos</td></tr>'}</tbody></table>
      </div>
      <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-3">
        <p class="text-sm font-bold text-[var(--black-100)] mb-1">Cuándo escriben</p>
        <p class="text-[11px] text-[var(--black-60)] mb-2">🌙 <span class="font-bold text-[var(--black-100)]">${ohPct}%</span> fuera de horario (5pm–8am) · ${ohOff} de ${ohTotal}${ohResolved}</p>
        ${heat}
      </div>
    </div>
    ${explorer}`
  lucide?.createIcons?.()

  // Listeners
  wireRangeControls(el, 'bot', (f, t) => renderBotAnalytics(f, t))
  const explorer = wireExplorer(el, convs, from, to)
  el.querySelector('#bot-export-csv')?.addEventListener('click', async ev => {
    const btn = ev.currentTarget
    const original = btn.textContent
    btn.disabled = true
    btn.textContent = '⬇ Descargando…'
    try {
      // Número grande (no null): el RPC tiene p_limit DEFAULT 100 y PostgREST
      // trata el null como "usa el default", así que null salía limitado a 100.
      // Con un tope alto trae TODAS las del rango + filtros del explorador.
      const rows = await fetchBotConversations(from, to, { ...explorer.getFilters(), limit: 1000000 })
      exportBotCsv(rows, from, to)
    } catch (e) {
      alert('Error al exportar CSV: ' + e.message)
    } finally {
      btn.textContent = original
      btn.disabled = false
    }
  })
  el.querySelectorAll('[data-gap-cat]').forEach(btn => {
    btn.addEventListener('click', ev => {
      ev.stopPropagation()
      goToCreateLesson(ev.currentTarget.getAttribute('data-gap-cat'))
    })
  })
  el.querySelectorAll('[data-edit-cat]').forEach(btn => {
    btn.addEventListener('click', ev => {
      ev.stopPropagation()
      goToEditLessonByCategory(ev.currentTarget.getAttribute('data-edit-cat'))
    })
  })
}

function buildHeatmap(cells) {
  const grid = {}
  let max = 1
  cells.forEach(c => { grid[`${c.dow}-${c.hour}`] = c.count; if (c.count > max) max = c.count })
  let html = '<div class="grid gap-0.5" style="grid-template-columns:28px repeat(24,1fr);min-width:340px">'
  html += '<div></div>' + Array.from({ length: 24 }, (_, h) => `<div class="text-[7px] text-center text-[var(--black-40)]">${h}</div>`).join('')
  for (let d = 0; d < 7; d++) {
    html += `<div class="text-[9px] text-[var(--black-40)] flex items-center">${DOW[d]}</div>`
    for (let h = 0; h < 24; h++) {
      const n = grid[`${d}-${h}`] || 0
      const op = n ? (0.15 + 0.85 * n / max).toFixed(2) : 0
      html += `<div title="${DOW[d]} ${h}:00 — ${n}" style="height:12px;border-radius:2px;background:rgba(18,30,108,${op})"></div>`
    }
  }
  return html + '</div>'
}

// -------- Explorador con filtros colapsables --------
function renderExplorer(convs) {
  return `
  <div class="bg-white rounded-2xl border border-[var(--blue-10)] mt-6" id="bot-explorer">
    <div class="flex items-center gap-2 p-3 cursor-pointer" id="bot-filters-head">
      <span class="text-sm font-bold text-[var(--black-100)]">Explorador de conversaciones</span>
      <span class="text-[10px] text-[var(--black-40)]" id="bot-filter-summary"></span>
      <span class="ml-auto text-xs text-[var(--blue-100)]" id="bot-filters-toggle">Filtros ▾</span>
    </div>
    <div class="px-3 pb-3 hidden" id="bot-filters-body">
      <div class="flex flex-wrap gap-2 items-center">
        <input id="bot-search" placeholder="🔎 buscar en mensajes…" class="px-2 py-1 rounded border border-[var(--blue-20)] text-xs flex-1 min-w-[160px]">
        ${filterChips('estado', 'Estado', [['', 'Todas'], ['no_resuelta', 'No resuelta'], ['resuelta', 'Resuelta'], ['ambigua', 'Ambigua']])}
        ${filterChips('sent', 'Sentimiento', [['', 'Todos'], ['positivo', 'Positivo'], ['neutro', 'Neutro'], ['negativo', 'Negativo']])}
        ${filterChips('life', 'Cierre', [['', 'Todas'], ['cerrada_cliente', 'Cerró'], ['abandonada', 'Abandonó'], ['escalada', 'Escaló']])}
      </div>
    </div>
    <div id="bot-conv-list" class="border-t border-[var(--blue-10)]">${convRows(convs)}</div>
  </div>`
}

function filterChips(group, label, opts) {
  const chips = opts.map((o, i) => `<button class="bot-fchip px-2 py-1 rounded-full text-[11px] border ${i === 0 ? 'bg-[var(--blue-100)] text-white border-[var(--blue-100)]' : 'text-[var(--black-60)] border-[var(--blue-20)]'}" data-group="${group}" data-val="${o[0]}">${o[1]}</button>`).join('')
  return `<div class="flex items-center gap-1"><span class="text-[10px] font-bold text-[var(--black-40)] uppercase">${label}</span>${chips}</div>`
}

const LIFECYCLE_BADGE = {
  cerrada_cliente: ['Cerró',    'var(--success-150)'],
  abandonada:      ['Abandonó', 'var(--black-40)'],
  escalada:        ['Escaló',   'var(--warning-150)'],
  en_curso:        ['En curso', 'var(--blue-100)'],
}

// Un solo badge para el cierre: bajo "escalada gana", lifecycle = 'escalada'
// equivale a support_redirected, así que este badge reemplaza al de soporte.
function lifecycleBadge(lifecycle) {
  const b = LIFECYCLE_BADGE[lifecycle]
  if (!b) return ''
  return `<span class="text-[10px] px-2 rounded-full border" style="border-color:${b[1]};color:${b[1]}">${b[0]}</span>`
}

function convRows(convs) {
  if (!convs.length) return '<p class="p-3 text-xs text-[var(--black-40)]">Sin conversaciones en el rango/filtros.</p>'
  return convs.map((c, i) => `
    <div class="bot-conv-row px-3 py-2 border-b border-[var(--blue-10)] cursor-pointer text-xs" data-idx="${i}">
      <div class="flex items-center gap-2">
        <span class="shrink-0 text-[10px] font-bold text-[var(--black-40)] tabular-nums">🕒 ${fmtDayTime(c.started_at)}</span>
        <span class="flex-1 min-w-0 truncate text-[var(--black-100)]">${escapeHtml(c.first_user_msg || '(sin mensaje)')}</span>
      </div>
      <div class="flex items-center gap-1.5 mt-1">
        ${c.sentiment === 'negativo' ? '<span class="text-[10px] px-2 rounded-full border border-[var(--error-100)] text-[var(--error-100)]">Neg</span>' : ''}
        ${lifecycleBadge(c.lifecycle)}
        ${c.bot_no_info ? '<span class="text-[10px] px-2 rounded-full border border-[var(--warning-150)] text-[var(--warning-150)]">Sin info</span>' : ''}
        <span class="ml-auto text-[var(--black-40)]">${escapeHtml(c.cat || '')}</span>
      </div>
    </div>
    <div class="bot-conv-detail hidden px-3 py-2 bg-[var(--background-page)] text-xs" data-detail="${i}"></div>`).join('')
}

function wireExplorer(el, convs, from, to) {
  const head = el.querySelector('#bot-filters-head')
  const body = el.querySelector('#bot-filters-body')
  const toggle = el.querySelector('#bot-filters-toggle')
  head?.addEventListener('click', () => {
    const hidden = body.classList.toggle('hidden')
    toggle.textContent = hidden ? 'Filtros ▾' : 'Filtros ▴'
  })

  const state = { estado: '', sent: '', life: '', category: '', search: '' }
  const summaryEl = el.querySelector('#bot-filter-summary')

  // Mapea el state del explorador al shape que espera fetchBotConversations.
  // Se reusa en refresh() y desde el botón de export CSV.
  const activeFilters = () => {
    const f = {}
    if (state.estado) f.status = state.estado
    if (state.sent) f.sentiment = state.sent
    if (state.life) f.lifecycle = state.life
    if (state.category) f.category = state.category
    if (state.search) f.search = state.search
    return f
  }

  const syncChips = () => {
    ['estado', 'sent', 'life'].forEach(g => {
      el.querySelectorAll(`.bot-fchip[data-group="${g}"]`).forEach(c => {
        const on = c.dataset.val === state[g]
        c.className = `bot-fchip px-2 py-1 rounded-full text-[11px] border ${on ? 'bg-[var(--blue-100)] text-white border-[var(--blue-100)]' : 'text-[var(--black-60)] border-[var(--blue-20)]'}`
      })
    })
  }

  const FILTER_LABELS = {
    estado: { resuelta: 'Resuelta', no_resuelta: 'No resuelta', ambigua: 'Ambigua' },
    sent: { positivo: 'Positivo', neutro: 'Neutro', negativo: 'Negativo' },
    life: { cerrada_cliente: 'Cerró', abandonada: 'Abandonó', escalada: 'Escaló' },
  }
  const friendlyFilterLabel = (k, v) => (FILTER_LABELS[k] && FILTER_LABELS[k][v]) || v

  const renderSummary = () => {
    const active = Object.entries(state).filter(([, v]) => v)
    summaryEl.innerHTML = active.map(([k, v]) =>
      `<button class="bot-active-chip px-2 py-0.5 rounded-full border border-[var(--blue-20)] text-[var(--black-60)] mr-1" data-clear="${k}">${escapeHtml(friendlyFilterLabel(k, v))} ✕</button>`).join('')
  }

  const refresh = async () => {
    const rows = await fetchBotConversations(from, to, { ...activeFilters(), limit: 100 })
    el.querySelector('#bot-conv-list').innerHTML = convRows(rows)
    bindRows(el, rows)
    renderSummary()
  }

  const applyFilters = (partial, { replace } = {}) => {
    if (replace) {
      state.estado = ''; state.sent = ''; state.life = ''; state.category = ''; state.search = ''
      const searchInput = el.querySelector('#bot-search')
      if (searchInput) searchInput.value = ''
    }
    Object.assign(state, partial)
    syncChips()
    refresh()
  }

  summaryEl?.addEventListener('click', ev => {
    const btn = ev.target.closest('[data-clear]')
    if (!btn) return
    applyFilters({ [btn.getAttribute('data-clear')]: '' }, { replace: false })
  })

  el.querySelectorAll('.bot-fchip').forEach(chip => {
    chip.addEventListener('click', () => {
      applyFilters({ [chip.dataset.group]: chip.dataset.val }, { replace: false })
    })
  })

  el.querySelectorAll('.bot-drill').forEach(node => {
    node.addEventListener('click', ev => {
      if (ev.target.closest('[data-gap-cat],[data-edit-cat]')) return
      let partial
      try { partial = JSON.parse(node.getAttribute('data-drill') || '{}') } catch { partial = {} }
      applyFilters(partial, { replace: true })
      if (body.classList.contains('hidden')) { body.classList.remove('hidden'); toggle.textContent = 'Filtros ▴' }
      el.querySelector('#bot-explorer')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  })

  let t
  el.querySelector('#bot-search')?.addEventListener('input', e => {
    clearTimeout(t); t = setTimeout(() => { state.search = e.target.value.trim(); refresh() }, 400)
  })
  bindRows(el, convs)

  return { getFilters: activeFilters }
}

function bindRows(el, rows) {
  el.querySelectorAll('.bot-conv-row').forEach(row => {
    row.addEventListener('click', () => {
      const i = row.dataset.idx
      const detail = el.querySelector(`.bot-conv-detail[data-detail="${i}"]`)
      if (!detail) return
      if (!detail.classList.contains('hidden')) { detail.classList.add('hidden'); return }
      const c = rows[i]
      const msgs = (c.messages || []).map(m =>
        `<p class="mb-1"><b class="text-[var(--blue-100)]">${m.role === 'user' ? 'Usuario' : 'Bot'}:</b> ${escapeHtml(m.content || '')}</p>`).join('')
      const lessons = (c.lessons_used || []).map(l => `<span class="text-[10px] px-2 rounded-full bg-[var(--blue-10)] text-[var(--blue-100)] mr-1">${escapeHtml(l)}</span>`).join('')
      detail.innerHTML = `${c.summary ? `<p class="italic text-[var(--black-60)] mb-2">✨ ${escapeHtml(c.summary)}</p>` : ''}${lessons ? `<div class="mb-2">${lessons}</div>` : ''}${msgs || '<span class="text-[var(--black-40)]">Sin mensajes</span>'}`
      detail.classList.remove('hidden')
    })
  })
}

function fmtDateForFile(d) {
  const dt = d instanceof Date ? d : new Date(d)
  return dt.toISOString().slice(0, 10)
}

function exportBotCsv(convs, from, to) {
  const range = from && to ? `-${fmtDateForFile(from)}-${fmtDateForFile(to)}` : ''
  exportCSV(convs, `bolbot-conversaciones${range}.csv`, [
    { label: 'ID', getValue: r => r.id },
    { label: 'Fecha', getValue: r => r.started_at },
    { label: 'Categoría', getValue: r => r.cat },
    { label: 'Estado', getValue: r => r.eff_status || '' },
    { label: 'Sentimiento', getValue: r => r.sentiment || '' },
    { label: 'Cómo terminó', getValue: r => r.lifecycle || '' },
    { label: 'Primera pregunta', getValue: r => r.first_user_msg || '' },
    { label: 'Mensajes (JSON)', getValue: r => JSON.stringify(r.messages || []) },
  ])
}

function goToCreateLesson(categoria) {
  // Puente bot→lección: guarda la categoría sugerida y abre el panel de lecciones.
  localStorage.setItem('prefill_lesson_categoria', categoria || '')
  localStorage.setItem('admin_panel', 'lessons')
  location.reload()
}

function goToEditLessonByCategory(categoria) {
  // Revisar respuesta / reforzar contenido: abre la lección existente de esa
  // categoría para editarla. Si no hay lección, cae a crear una nueva.
  localStorage.setItem('edit_lesson_categoria', categoria || '')
  localStorage.setItem('admin_panel', 'lessons')
  location.reload()
}
