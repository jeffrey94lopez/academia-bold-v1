// Pestaña "Herramientas": cuántos comercios usan el conversor de inventario y el
// generador de códigos de BolBot, dónde se atoran y quiénes llegan al final.
//
// Los números vienen de la RPC analytics_herramientas (supabase/migrations/
// create_analytics_herramientas.sql); herramientas-vista.js los deja listos para pintar.
import { rangeControlsHtml, wireRangeControls, computeRange, kpiCard } from './analytics-ui.js'
import { fetchHerramientas } from './analytics-api.js'
import { armarVista } from './herramientas-vista.js'
import { APP_ENV } from './env.js'

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const hace = iso => {
  if (!iso) return '—'
  const dias = Math.floor((Date.now() - Date.parse(iso)) / 86400000)
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  return `hace ${dias} días`
}

const tarjeta = (titulo, cuerpo) => `
  <section class="bg-white rounded-2xl border border-[var(--blue-10)] p-4 mb-4">
    <h3 class="text-sm font-black text-[var(--blue-100)] mb-3">${titulo}</h3>
    ${cuerpo}
  </section>`

function embudoHtml(filas) {
  return `<div class="flex flex-col gap-1.5">${filas.map(f => `
    <div class="flex items-center gap-3 text-xs">
      <span class="w-44 sm:w-56 shrink-0 text-[var(--black-60)]">${escapeHtml(f.etiqueta)}</span>
      <span class="flex-1 h-4 rounded-full bg-[var(--black-10)] overflow-hidden"><span class="block h-full bg-[var(--blue-100)]" style="width:${f.pct}%"></span></span>
      <span class="w-16 text-right font-bold text-[var(--black-100)]">${f.n}<span class="font-normal text-[var(--black-40)]"> · ${f.pct}%</span></span>
    </div>`).join('')}</div>`
}

function erroresHtml(errores) {
  if (!errores.length) return '<p class="text-xs text-[var(--black-40)]">Sin errores ni atoros en el rango. 🎉</p>'
  return `<div class="flex flex-col gap-1">${errores.map(e => `
    <div class="flex items-start gap-3 text-xs border-b border-[var(--black-10)] pb-1.5">
      <span class="flex-1"><b class="text-[var(--black-100)]">${escapeHtml(e.etiqueta)}</b>
        ${e.paso ? `<span class="block text-[var(--black-40)]">Pasó tras: ${escapeHtml(e.paso)}</span>` : ''}</span>
      <span class="text-right whitespace-nowrap text-[var(--black-60)]">${e.corridas} ${e.corridas === 1 ? 'conversación' : 'conversaciones'}${
        e.comercios ? ` · ${e.comercios} ${e.comercios === 1 ? 'comercio' : 'comercios'}` : ''}${e.filas != null ? ` · ${e.filas} filas` : ''}</span>
    </div>`).join('')}</div>`
}

function eleccionesHtml(grupos) {
  if (!grupos.length) return ''
  return `<div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">${grupos.map(g => `
    <div><p class="text-[10px] font-bold text-[var(--black-40)] uppercase mb-1">${escapeHtml(g.etiqueta)}</p>
      ${g.items.map(i => `<p class="text-xs text-[var(--black-60)] flex justify-between"><span>${escapeHtml(i.etiqueta)}</span><b class="text-[var(--black-100)]">${i.n}</b></p>`).join('')}
    </div>`).join('')}</div>`
}

function seccionHerramienta(h) {
  const kpis = [
    kpiCard('Conversaciones', h.corridas, `${h.visitantes} ${h.visitantes === 1 ? 'navegador distinto' : 'navegadores distintos'}`),
    kpiCard('Comercios identificados', h.comercios, h.sinIdentificar ? `${h.sinIdentificar} conversación(es) sin identidad` : 'todas con identidad'),
    kpiCard('Terminaron', `${h.terminaron}<span class="text-sm font-bold text-[var(--black-40)]"> · ${h.pctTerminaron}%</span>`, `${h.comerciosTerminaron} comercio(s)`),
    h.tool === 'inventario'
      ? kpiCard('Productos convertidos', h.productos, `${h.crearonCodigos} crearon códigos`)
      : kpiCard('Crearon códigos', h.crearonCodigos, 'a partir de nombres de productos'),
  ].join('')
  const acciones = h.acciones.length
    ? `<p class="text-[11px] text-[var(--black-60)] mt-3">${h.acciones.map(a => `${escapeHtml(a.etiqueta)}: <b>${a.n}</b>`).join(' · ')}</p>` : ''
  return `
    <h2 class="text-base font-black text-[var(--black-100)] mb-2 mt-6">${escapeHtml(h.titulo)}</h2>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">${kpis}</div>
    ${tarjeta('¿Hasta dónde llegan?', embudoHtml(h.embudo) + acciones)}
    ${tarjeta('Errores y problemas comunes', erroresHtml(h.errores))}
    ${h.elecciones.length ? tarjeta('Qué eligen quienes terminan', eleccionesHtml(h.elecciones)) : ''}`
}

const celdaEstado = e => e
  ? `<span class="${e.ok ? 'text-[var(--success-100,#16794c)] font-bold' : 'text-[var(--black-60)]'}">${e.ok ? '✅' : '⏸'} ${escapeHtml(e.texto)}</span>`
  : '<span class="text-[var(--black-40)]">—</span>'

function comerciosHtml(lista) {
  if (!lista.length) return '<p class="text-xs text-[var(--black-40)]">Todavía ningún comercio identificado usó las herramientas en este rango.</p>'
  return `<div class="flex flex-col gap-2">${lista.map(c => `
    <div class="border border-[var(--blue-10)] rounded-xl p-3 text-xs">
      <div class="flex items-center justify-between gap-2 mb-1.5">
        <b class="text-sm text-[var(--black-100)] truncate" title="${escapeHtml(c.completo)}">${escapeHtml(c.texto)}</b>
        <span class="text-[var(--black-40)] whitespace-nowrap">${c.vertical ? `${escapeHtml(c.vertical)} · ` : ''}${hace(c.ultimo)}</span>
      </div>
      <p><span class="text-[var(--black-40)]">Inventario:</span> ${celdaEstado(c.inventario)}</p>
      <p><span class="text-[var(--black-40)]">Códigos:</span> ${celdaEstado(c.codigos)}</p>
    </div>`).join('')}</div>`
}

export async function renderHerramientasAnalytics(from = null, to = null) {
  const el = document.getElementById('analytics-content')
  if (!el) return
  if (!from || !to) { const r = computeRange('30d', new Date()); from = r.from; to = r.to }
  el.innerHTML = '<p class="text-[var(--black-40)] text-sm p-4">Cargando…</p>'

  let data
  try {
    data = await fetchHerramientas(from, to, APP_ENV)
  } catch (e) {
    el.innerHTML = `<p class="text-[var(--error-100)] text-sm p-4">Error cargando herramientas: ${escapeHtml(e.message)}</p>`
    return
  }
  const v = armarVista(data)

  el.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      ${rangeControlsHtml('herr', from, to)}
      ${APP_ENV !== 'prod' ? `<span class="text-[10px] font-bold uppercase px-2 py-1 rounded bg-[var(--black-10)] text-[var(--black-60)]">Datos de ${escapeHtml(APP_ENV)}</span>` : ''}
    </div>
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4 mb-2">
      <p class="flex items-center gap-2">
        <span class="text-4xl font-black text-[var(--blue-100)]">${v.comercios.length}</span>
        <span class="text-sm text-[var(--black-60)]">${v.comercios.length === 1 ? 'comercio usó' : 'comercios usaron'} las herramientas · ${v.comerciosTerminaron} ${v.comerciosTerminaron === 1 ? 'llegó' : 'llegaron'} hasta el final · ${v.totalCorridas} ${v.totalCorridas === 1 ? 'conversación' : 'conversaciones'}</span>
      </p>
      <p class="text-[11px] text-[var(--black-40)] mt-1">
        «Comercio» es una cuenta que Bold identificó al abrir el portal. Las conversaciones sin
        identidad cuentan en los totales pero no aparecen en la lista de abajo.
        «Terminó» significa que descargó la plantilla, imprimió o bajó las imágenes.
        No se guarda ningún dato de sus productos: solo conteos y opciones.
      </p>
    </div>
    ${v.herramientas.map(seccionHerramienta).join('')}
    <h2 class="text-base font-black text-[var(--black-100)] mb-2 mt-6">Comercios</h2>
    ${tarjeta('Quién usó qué', comerciosHtml(v.comercios))}`

  wireRangeControls(el, 'herr', (f, t) => renderHerramientasAnalytics(f, t))
}
