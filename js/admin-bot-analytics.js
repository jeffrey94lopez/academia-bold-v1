import {
  fetchBotSummary, fetchBotConversations, fetchContentGaps, fetchOffHours,
} from './analytics-api.js'
import {
  rangeControlsHtml, wireRangeControls, computeRange,
} from './analytics-ui.js'
import { escapeHtml, exportCSV } from './utils.js'
import { rankAttention } from './bot-attention.js'
import { modeloVerticales } from './bot-verticales.js'
// Mismo criterio que la bandeja de vacíos: nombre si lo hay, si no el id
// acortado, y si no hay ninguno lo dice en vez de pintar una etiqueta vacía.
import { etiquetaComercio } from './gap-comercio.js'
import { nombreUsuario } from './usuario-nombre.js'
import { offHoursStats, isOffHour, bandStats, BUSINESS_HOURS } from './off-hours.js'
import { BIZ_TZ } from './biz-time.js'

const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DOW_LARGO = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

// Por qué fricción y no sentimiento: el sentimiento lo etiquetaba un LLM sobre
// texto tonalmente plano y salía ruido (48% positivo sin una sola señal de
// agrado con gpt-4o-mini; 96% neutro con gemini). La fricción se mide de
// señales registradas. Ver update_analytics_bot_summary_friccion.sql.
const FRICCION_NOTA = 'Conversaciones donde el bot no pudo resolver por su cuenta: '
  + 'o no tenía contenido para responder, o derivó a soporte. Se mide de señales '
  + 'registradas, no de que un modelo interprete el tono del usuario.'

// Fecha + hora de una conversación, en zona de negocio (misma que el heatmap)
// para que la hora mostrada no dependa del navegador del admin.
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
  const fr = k.friction || {}
  const totalRes = (k.resolved || 0) + (k.unresolved || 0) + (k.ambiguous || 0)
  const pctR = n => totalRes ? Math.round(100 * n / totalRes) : 0
  const drill = obj => `data-drill='${escapeHtml(JSON.stringify(obj))}'`

  // Un segmento de ancho 0 igual escribe su texto y queda cortado contra el
  // borde de la barra (visible en celular con 0 ambiguas). No se pinta: el
  // número que valdría cero ya no aporta nada.
  const segmento = (filtro, texto, n, pct, bg, fg) => n > 0
    ? `<div ${drill(filtro)} class="bot-drill flex items-center justify-center text-[10px] font-bold" style="width:${pct}%;background:${bg};color:${fg}">${texto}</div>`
    : ''

  const header = `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-5">
      <p class="mb-3"><span class="text-4xl font-black text-[var(--blue-100)]">${total}</span> <span class="text-sm text-[var(--black-60)]">conversaciones en el rango</span></p>

      <!-- Resolución real (estilo barra segmentada) -->
      <div class="mt-3">
        <p class="text-[11px] text-center text-[var(--black-60)]"><span class="font-bold text-[var(--black-100)]">Resolución real</span> <span class="text-[var(--black-40)]">· sin ambiguas</span></p>
        <div class="flex h-5 rounded-md overflow-hidden gap-0.5 mt-1 cursor-pointer">
          ${segmento({ estado: 'resuelta' }, `resueltas ${k.resolved || 0}`, k.resolved || 0, pctR(k.resolved || 0), 'var(--success-10)', 'var(--success-150)')}
          ${segmento({ estado: 'no_resuelta' }, `no resueltas ${k.unresolved || 0}`, k.unresolved || 0, pctR(k.unresolved || 0), 'var(--error-10)', 'var(--error-100)')}
          ${segmento({ estado: 'ambigua' }, `ambiguas ${k.ambiguous || 0}`, k.ambiguous || 0, pctR(k.ambiguous || 0), 'var(--black-10)', 'var(--black-60)')}
        </div>
        <p class="mt-1 text-center text-[var(--black-40)]"><span class="text-base font-black text-[var(--black-100)]">${k.resolved_pct ?? 0}%</span> <span class="text-[10px]">resueltas (sin contar ambiguas)</span></p>
      </div>

      <!-- Cómo terminó + Fricción. Cada número dice sobre qué base se calcula:
           un "32%" suelto no se puede interpretar. -->
      <div class="border-t border-[var(--blue-10)] mt-4 pt-3 flex flex-wrap gap-x-10 gap-y-4">
        <div>
          <p class="text-[11px] font-bold text-[var(--black-100)]">Cómo terminó</p>
          <p class="text-xl font-black text-[var(--black-100)] leading-tight">${pct(lc.cerrada_cliente || 0)}%
            <span class="text-[11px] font-normal text-[var(--black-60)]">de las ${total} conversaciones las cerró el cliente</span>
          </p>
          <p class="text-[11px] text-[var(--black-60)] mt-0.5">
            <button ${drill({ life: 'cerrada_cliente' })} class="bot-drill underline">${lc.cerrada_cliente || 0} cerró</button> ·
            <button ${drill({ life: 'abandonada' })} class="bot-drill underline">${lc.abandonada || 0} abandonó</button> ·
            <button ${drill({ life: 'escalada' })} class="bot-drill underline">${lc.escalada || 0} escaló</button>
            ${lc.en_curso ? `<span class="text-[var(--black-40)]">· ${lc.en_curso} en curso</span>` : ''}
          </p>
        </div>
        <div>
          <p class="text-[11px] font-bold text-[var(--black-100)]">Fricción <span class="text-[var(--black-40)] font-normal cursor-help" title="${escapeHtml(FRICCION_NOTA)}">ⓘ</span></p>
          <p class="text-xl font-black text-[var(--black-100)] leading-tight">${fr.pct ?? 0}%
            <span class="text-[11px] font-normal text-[var(--black-60)]">de las ${total} conversaciones el bot no las resolvió solo</span>
          </p>
          <p class="text-[11px] text-[var(--black-60)] mt-0.5">
            <button ${drill({ no_info: '1' })} class="bot-drill underline text-[var(--error-100)] font-bold">${fr.no_info || 0} sin contenido para responder</button> ·
            <button ${drill({ life: 'escalada' })} class="bot-drill underline">${fr.support || 0} derivadas a soporte</button>
          </p>
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
    'sin-informacion': 'Sin contenido para responder',
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

  const bandas = buildBandas(summary.heatmap)
  const heat = buildHeatmap(summary.heatmap)
  const ohFallback = offHoursStats(summary.heatmap)  // solo conteo (sin resolución)
  const ohPct = offHours ? offHours.off_pct : ohFallback.pct
  const ohOff = offHours ? offHours.off : ohFallback.off
  const ohTotal = offHours ? offHours.total : ohFallback.total
  const ohResolved = offHours && offHours.off
    ? ` · de esas, <span class="font-bold text-[var(--black-100)]">${offHours.off_resolved_pct ?? 0}%</span> resueltas`
    : ''

  // Dos recuadros por vertical. La barra usa los mismos colores y el mismo
  // criterio que "Resolución real" de arriba, así que se leen como la misma
  // medida partida en dos, no como otra métrica.
  const verticales = modeloVerticales(k.by_vertical)
  const verticalesHtml = `
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
      ${verticales.map(v => `
        <div class="bot-drill bg-white rounded-2xl border border-[var(--blue-10)] p-4 cursor-pointer hover:bg-[var(--background-page)]" ${drill({ vertical: v.clave })}>
          <p class="flex items-center gap-2">
            <span class="text-3xl font-black text-[var(--blue-100)]">${v.total}</span>
            <span class="text-sm font-bold text-[var(--black-100)]">${escapeHtml(v.nombre)}</span>
          </p>
          ${v.conResultado ? `
            <div class="flex h-5 rounded-md overflow-hidden gap-0.5 mt-2">
              ${segmento({ vertical: v.clave, estado: 'resuelta' }, v.resueltas, v.resueltas, v.pctBarra.resueltas, 'var(--success-10)', 'var(--success-150)')}
              ${segmento({ vertical: v.clave, estado: 'no_resuelta' }, v.noResueltas, v.noResueltas, v.pctBarra.noResueltas, 'var(--error-10)', 'var(--error-100)')}
            </div>
            <p class="mt-1 text-[11px] text-[var(--black-60)]">
              <span class="font-black text-[var(--black-100)]">${v.pctResueltas}%</span> resueltas
              <span class="text-[var(--black-40)]">· sobre ${v.conResultado} con resultado</span>
              ${v.ambiguas ? `· <button ${drill({ vertical: v.clave, estado: 'ambigua' })} class="bot-drill underline text-[var(--black-40)]">${v.ambiguas} ambiguas</button>` : ''}
            </p>`
            : `<p class="mt-2 text-[11px] text-[var(--black-40)]">Sin conversaciones con resultado en el rango.</p>`}
        </div>`).join('')}
    </div>`

  const explorerHtml = renderExplorer(convs)

  el.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      ${rangeControlsHtml('bot', from, to)}
      <button id="bot-export-csv" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--black-10)] text-[var(--black-60)] hover:bg-[var(--blue-10)]">⬇ CSV</button>
    </div>
    ${header}
    ${verticalesHtml}
    <p class="text-[10px] font-bold text-[var(--black-40)] uppercase tracking-wide mt-6 mb-2">Qué atender ahora</p>
    ${attention}
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-6">
      <div class="bg-white rounded-2xl border border-[var(--blue-10)] overflow-hidden">
        <p class="p-3 text-sm font-bold text-[var(--black-100)]">Dudas por categoría</p>
        <table class="w-full"><tbody>${catRows || '<tr><td class="p-3 text-xs text-[var(--black-40)]">Sin datos</td></tr>'}</tbody></table>
      </div>
      <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-3">
        <p class="text-sm font-bold text-[var(--black-100)] mb-1">Cuándo escriben</p>
        <div class="flex items-center gap-2.5 mb-3 p-2.5 rounded-xl bg-[var(--error-10)]" style="border:1px solid rgba(195,26,47,0.2)">
          <span class="text-2xl">🌙</span>
          <div class="leading-tight">
            <p><span class="text-2xl font-black text-[var(--error-100)]">${ohPct}%</span> <span class="text-sm font-bold text-[var(--black-60)]">fuera de horario</span></p>
            <p class="text-[12px] text-[var(--black-60)] mt-0.5"><span class="font-bold text-[var(--black-100)]">${ohOff}</span> de ${ohTotal} conversaciones · fuera de Lun–Vie 8am–5pm y Sáb 8am–12m${ohResolved}</p>
          </div>
        </div>
        ${bandas}
        <div class="mt-3">${heat}</div>
      </div>
    </div>
    ${explorerHtml}`
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

const pad = n => String(n).padStart(2, '0')
const hora12 = h => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`
// Rótulo de 12h para las franjas: medianoche (inicio y fin del día) es 12am y
// mediodía es 12m, como el resto de los textos del dashboard.
const hora12Rot = h => (h === 0 || h === 24) ? '12am' : h === 12 ? '12m' : hora12(h)

// Lectura rápida del mismo dato que el heatmap: 7 días × 4 franjas, con el
// número DENTRO de la celda. Las franjas salen del horario de atención
// (bandsFromSchedule), así que cada celda cae entera dentro o entera fuera y
// el color no miente. El detalle hora por hora sigue abajo, en el heatmap.
// Se exporta (igual que buildHeatmap) para probarla sin DOM: devuelve HTML
// como string — ver tests/mapa-horario.test.mjs.
export function buildBandas(cells) {
  const { bands, rows, max, top, total } = bandStats(cells)
  const rotulo = b => `${hora12Rot(b.from)}–${hora12Rot(b.to)}`
  const titular = top && total
    ? `<p class="text-sm text-[var(--black-100)] mb-2">El momento más fuerte es el <span class="font-bold text-[var(--blue-100)]">${DOW_LARGO[top.dow]} ${top.band.label.toLowerCase()}</span> — ${top.count} ${top.count === 1 ? 'conversación' : 'conversaciones'}.</p>`
    : ''
  let html = `<div class="grid gap-1" style="grid-template-columns:34px repeat(${bands.length},1fr)"><div></div>`
  html += bands.map(b => `<div class="text-[9px] font-bold text-center text-[var(--black-60)] leading-tight" style="padding-bottom:2px">${b.label}<span class="block text-[var(--black-40)]" style="font-size:8px;font-weight:400">${rotulo(b)}</span></div>`).join('')
  rows.forEach(row => {
    html += `<div class="text-[10px] font-bold text-[var(--black-60)] flex items-center">${DOW[row.dow]}</div>`
    row.counts.forEach((n, i) => {
      const off = row.off[i]
      const rgb = off ? '195,26,47' : '18,30,108'          // mismo código de color que el heatmap
      const op = n && max ? (0.12 + 0.78 * n / max).toFixed(2) : 0.03
      const fg = max && n / max > 0.45 ? '#fff' : (off ? 'var(--error-100)' : 'var(--blue-100)')
      const b = bands[i]
      html += `<div title="${DOW[row.dow]} ${rotulo(b)} — ${n} ${n === 1 ? 'conversación' : 'conversaciones'}${off ? ' (fuera de horario)' : ''}" class="rounded-lg flex items-center justify-center text-sm font-black" style="height:34px;background:rgba(${rgb},${op});color:${n ? fg : 'var(--black-40)'}">${n || '·'}</div>`
    })
  })
  html += '</div>'
  return `${titular}${html}`
}

export function buildHeatmap(cells) {
  const grid = {}
  let max = 1
  cells.forEach(c => { grid[`${c.dow}-${c.hour}`] = c.count; if (c.count > max) max = c.count })
  // Horas no laborables segun el horario de atencion (Lun-Vie 8am-5pm,
  // Sab 8am-12m, Dom cerrado) en hora de Bogota. La cabecera de horas marca en
  // rojo lo que esta fuera de horario TODOS los dias que se atiende.
  const isOffAllDays = h => [1, 2, 3, 4, 5, 6].every(d => isOffHour(d, h))
  // La rejilla no baja de 340px (debajo de eso las celdas dejan de leerse). En
  // pantallas angostas eso se salía del borde de la tarjeta: ahora scrollea
  // dentro de su propio contenedor. La leyenda queda fuera del scroll.
  let html = '<div style="overflow-x:auto"><div class="grid gap-0.5" style="grid-template-columns:28px repeat(24,1fr);min-width:340px">'
  // Cada columna es un BLOQUE de una hora, no un instante: la 16 va de 16:00 a
  // 16:59 y es la última que cuenta como horario (a las 17:00 ya cerró). Sin
  // esto la banda azul "termina en 16" y parece que falta una hora.
  const bloque = h => `${pad(h)}:00–${pad(h)}:59`
  html += '<div></div>' + Array.from({ length: 24 }, (_, h) => `<div title="Bloque ${bloque(h)}${isOffAllDays(h) ? ' · fuera del horario de atención' : ' · dentro del horario de atención'}" class="text-[7px] text-center ${isOffAllDays(h) ? 'text-[var(--error-100)] font-bold' : 'text-[var(--black-40)]'}">${h}</div>`).join('')
  // Franja azul sobre las columnas que sí se atienden (Lun–Vie, de BUSINESS_HOURS):
  // ubica la ventana de atención sin tener que contar columnas.
  const [bOpen, bClose] = BUSINESS_HOURS[1] || [8, 17]
  html += `<div></div><div class="grid gap-0.5 mb-0.5" style="grid-column:2 / span 24;grid-template-columns:repeat(24,1fr)">`
    + `<div title="Horario de atención Lun–Vie" class="flex items-center justify-center rounded font-bold" style="grid-column:${bOpen + 1} / span ${bClose - bOpen};height:13px;font-size:8px;background:rgba(18,30,108,0.10);color:var(--blue-100);white-space:nowrap;overflow:visible">${hora12(bOpen)}–${hora12(bClose)} · horario de atención</div></div>`
  for (let d = 0; d < 7; d++) {
    html += `<div class="text-[9px] text-[var(--black-40)] flex items-center">${DOW[d]}</div>`
    for (let h = 0; h < 24; h++) {
      const n = grid[`${d}-${h}`] || 0
      const off = isOffHour(d, h)
      const rgb = off ? '195,26,47' : '18,30,108'          // rojo fuera de horario, azul en horario
      const op = n ? (0.2 + 0.8 * n / max).toFixed(2) : 0  // celdas sin datos quedan en blanco (dentro y fuera de horario)
      html += `<div title="${DOW[d]} ${bloque(h)} — ${n} ${n === 1 ? 'conversación' : 'conversaciones'}${off ? ' (fuera de horario)' : ''}" style="height:12px;border-radius:2px;background:rgba(${rgb},${op})"></div>`
    }
  }
  html += '</div></div>'
  const notaBloques = 'Cada columna es un bloque de una hora. Lun–Vie se atiende de 8am a 5pm, '
    + 'así que el último bloque que cuenta como horario es el 16 (16:00–16:59): a las 17:00 ya cerró. '
    + 'Sáb se atiende de 8am a 12m, así que el último es el 11 (11:00–11:59).'
  html += `<div class="flex items-center gap-3 mt-1.5 text-[9px] text-[var(--black-40)]">
    <span class="flex items-center gap-1"><span style="width:9px;height:9px;border-radius:2px;background:rgba(18,30,108,0.85);display:inline-block"></span>horario Lun–Vie 8am–5pm · Sáb 8am–12m</span>
    <span class="flex items-center gap-1"><span style="width:9px;height:9px;border-radius:2px;background:rgba(195,26,47,0.85);display:inline-block"></span>fuera de horario</span>
    <span title="${escapeHtml(notaBloques)}" class="flex items-center gap-1 cursor-help underline decoration-dotted underline-offset-2">ⓘ por qué la banda termina en 16</span>
  </div>`
  return html
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
        ${filterChips('life', 'Cierre', [['', 'Todas'], ['cerrada_cliente', 'Cerró'], ['abandonada', 'Abandonó'], ['escalada', 'Escaló']])}
        ${filterChips('vertical', 'Vertical', [['', 'Todas'], ['retail', 'Retail'], ['restaurantes', 'Restaurantes'], ['sin_vertical', 'Sin vertical']])}
      </div>
    </div>
    <div id="bot-conv-list" class="border-t border-[var(--blue-10)]">${convRows(convs)}</div>
  </div>`
}

function filterChips(group, label, opts) {
  const chips = opts.map((o, i) => `<button class="bot-fchip px-2 py-1 rounded-full text-[11px] border ${i === 0 ? 'bg-[var(--blue-100)] text-white border-[var(--blue-100)]' : 'text-[var(--black-60)] border-[var(--blue-20)]'}" data-group="${group}" data-val="${o[0]}">${o[1]}</button>`).join('')
  return `<div class="flex items-center gap-1"><span class="text-[10px] font-bold text-[var(--black-40)] uppercase">${label}</span>${chips}</div>`
}

// Badge de vertical. Solo retail/restaurantes: una conversación sin vertical
// llegó sin contexto de Bold, y un badge "sin vertical" en la mitad de las
// filas sería ruido, no información.
const VERTICAL_BADGE = {
  retail:       ['Retail',       'var(--blue-100)'],
  restaurantes: ['Restaurantes', 'var(--warning-150)'],
}

function verticalBadge(vertical) {
  const b = VERTICAL_BADGE[vertical]
  if (!b) return ''
  return `<span class="text-[10px] px-2 rounded-full border" style="border-color:${b[1]};color:${b[1]}">${b[0]}</span>`
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

// `mostrarComercio` se apaga cuando las filas ya viven DENTRO de un comercio
// (pestaña Chats Comercios): repetir el mismo negocio en cada fila de su propia
// lista es ruido, no información.
export function convRows(convs, { mostrarComercio = true } = {}) {
  if (!convs.length) return '<p class="p-3 text-xs text-[var(--black-40)]">Sin conversaciones en el rango/filtros.</p>'
  return convs.map((c, i) => {
    // El id completo va en el `title`: es lo que se pega en el buscador de
    // Soporte, y entero en la fila cortaría el renglón.
    const com = etiquetaComercio(c)
    // El usuario se pinta aunque `mostrarComercio` sea false: en Chats
    // Comercios el comercio ya es el encabezado del grupo, pero saber CUÁL
    // de sus usuarios escribió sigue siendo informacion nueva.
    const usr = nombreUsuario(c)
    return `
    <div class="bot-conv-row px-3 py-2 border-b border-[var(--blue-10)] cursor-pointer text-xs" data-idx="${i}">
      <div class="flex items-center gap-2">
        <span class="shrink-0 text-[10px] font-bold text-[var(--black-40)] tabular-nums">🕒 ${fmtDayTime(c.started_at)}</span>
        <span class="flex-1 min-w-0 truncate text-[var(--black-100)]">${escapeHtml(c.first_user_msg || '(sin mensaje)')}</span>
      </div>
      <div class="flex items-center gap-1.5 mt-1">
        ${c.sentiment === 'negativo' ? '<span class="text-[10px] px-2 rounded-full border border-[var(--error-100)] text-[var(--error-100)]">Neg</span>' : ''}
        ${verticalBadge(c.vertical)}
        ${lifecycleBadge(c.lifecycle)}
        ${c.bot_no_info ? '<span class="text-[10px] px-2 rounded-full border border-[var(--warning-150)] text-[var(--warning-150)]">Sin info</span>' : ''}
        ${mostrarComercio ? `<span class="text-[var(--black-40)] truncate" title="${escapeHtml(com.completo)}">🏪 ${escapeHtml(com.texto)}</span>` : ''}
        ${usr.identificado ? `<span class="text-[var(--black-40)] truncate" title="${escapeHtml(usr.completo)}">👤 ${escapeHtml(usr.texto)}</span>` : ''}
        <span class="ml-auto shrink-0 text-[var(--black-40)]">${escapeHtml(c.cat || '')}</span>
      </div>
    </div>
    <div class="bot-conv-detail hidden px-3 py-2 bg-[var(--background-page)] text-xs" data-detail="${i}"></div>`
  }).join('')
}

function wireExplorer(el, convs, from, to) {
  const head = el.querySelector('#bot-filters-head')
  const body = el.querySelector('#bot-filters-body')
  const toggle = el.querySelector('#bot-filters-toggle')
  head?.addEventListener('click', () => {
    const hidden = body.classList.toggle('hidden')
    toggle.textContent = hidden ? 'Filtros ▾' : 'Filtros ▴'
  })

  const state = { estado: '', life: '', category: '', search: '', no_info: '', vertical: '' }
  const summaryEl = el.querySelector('#bot-filter-summary')

  // Mapea el state del explorador al shape que espera fetchBotConversations.
  // Se reusa en refresh() y desde el botón de export CSV.
  const activeFilters = () => {
    const f = {}
    if (state.estado) f.status = state.estado
    if (state.life) f.lifecycle = state.life
    if (state.category) f.category = state.category
    if (state.no_info) f.no_info = true
    if (state.vertical) f.vertical = state.vertical
    if (state.search) f.search = state.search
    return f
  }

  const syncChips = () => {
    ['estado', 'life', 'vertical'].forEach(g => {
      el.querySelectorAll(`.bot-fchip[data-group="${g}"]`).forEach(c => {
        const on = c.dataset.val === state[g]
        c.className = `bot-fchip px-2 py-1 rounded-full text-[11px] border ${on ? 'bg-[var(--blue-100)] text-white border-[var(--blue-100)]' : 'text-[var(--black-60)] border-[var(--blue-20)]'}`
      })
    })
  }

  const FILTER_LABELS = {
    estado: { resuelta: 'Resuelta', no_resuelta: 'No resuelta', ambigua: 'Ambigua' },
    life: { cerrada_cliente: 'Cerró', abandonada: 'Abandonó', escalada: 'Escaló' },
    no_info: { 1: 'Sin contenido para responder' },
    vertical: { retail: 'Retail', restaurantes: 'Restaurantes', sin_vertical: 'Sin vertical' },
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
      state.estado = ''; state.life = ''; state.category = ''; state.search = ''
      state.no_info = ''; state.vertical = ''
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

export function bindRows(el, rows) {
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
    // Valores CRUDOS, no la etiqueta que pinta etiquetaComercio: el nombre
    // entero y el id completo. Acortar un dato en un archivo que alguien va a
    // analizar sería el error que el tooltip evita en pantalla.
    { label: 'Negocio', getValue: r => r.business_name || '' },
    { label: 'ID negocio', getValue: r => r.account_id || '' },
    { label: 'Usuario', getValue: r => r.user_name || '' },
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
