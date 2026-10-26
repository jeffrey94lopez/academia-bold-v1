// Pestaña "Chats Comercios": quién escribe y cuánto, con sus chats adentro.
//
// Vive fuera de admin-bot-analytics.js (ya pasa de 500 líneas) siguiendo el
// mismo precedente que admin-gaps.js.
//
// Las filas de conversación y el desplegado de mensajes se IMPORTAN del
// explorador en vez de reescribirse: dos listas de chats que se ven distinto
// obligan a aprender la pantalla dos veces, y la que se use menos va a quedar
// atrás en cuanto alguien toque la otra.
import { rangeControlsHtml, wireRangeControls, computeRange } from './analytics-ui.js'
import { fetchComercios, fetchBotConversations } from './analytics-api.js'
import { convRows, bindRows } from './admin-bot-analytics.js'
import { etiquetaComercio } from './gap-comercio.js'

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const hace = iso => {
  if (!iso) return '—'
  const dias = Math.floor((Date.now() - Date.parse(iso)) / 86400000)
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  return `hace ${dias} días`
}

// Tope de la consulta. Con el default de la RPC un comercio con pocos chats se
// caería de la lista en silencio; uno holgado evita esa clase de mentira.
const LIMITE = 500

// Sobrevive al repintado de la lista, igual que el filtro de estado de la
// bandeja de vacíos. No sobrevive a cambiar de pestaña, que es lo correcto:
// volver a Comercios y encontrarlo filtrado sin acordarse por qué es peor.
let verticalFiltro = ''

const VERTICALES_FILTRO = [['', 'Todas'], ['retail', 'Retail'], ['restaurantes', 'Restaurantes']]

const filtrar = comercios =>
  verticalFiltro ? comercios.filter(c => c.vertical === verticalFiltro) : comercios

function chipsHtml() {
  return VERTICALES_FILTRO.map(([val, txt]) => {
    const on = val === verticalFiltro
    return `<button class="com-chip px-3 py-1 rounded-full text-xs font-bold border ${on
      ? 'bg-[var(--blue-100)] text-white border-[var(--blue-100)]'
      : 'text-[var(--black-60)] border-[var(--blue-20)] hover:bg-[var(--blue-10)]'}" data-vertical="${val}">${txt}</button>`
  }).join('')
}

export async function renderComerciosAnalytics(from = null, to = null) {
  const el = document.getElementById('analytics-content')
  if (!el) return
  if (!from || !to) { const r = computeRange('7d', new Date()); from = r.from; to = r.to }
  el.innerHTML = `<p class="text-[var(--black-40)] text-sm p-4">Cargando…</p>`

  let comercios
  try {
    comercios = await fetchComercios(from, to, LIMITE)
  } catch (e) {
    el.innerHTML = `<p class="text-[var(--error-100)] text-sm p-4">Error cargando comercios: ${escapeHtml(e.message)}</p>`
    return
  }

  el.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
      ${rangeControlsHtml('com', from, to)}
      <div class="flex items-center gap-1.5" id="com-chips">${chipsHtml()}</div>
    </div>
    <div id="com-body"></div>`

  wireRangeControls(el, 'com', (f, t) => renderComerciosAnalytics(f, t))
  pintarCuerpo(el, comercios, from, to)
  wireComerciosChips(el, comercios, from, to)
}

// Los chips se repintan al cambiar el filtro (para mover el resaltado), así
// que hay que volver a engancharlos: por eso la función se llama a sí misma en
// vez de vivir suelta dentro del render.
function wireComerciosChips(el, comercios, from, to) {
  el.querySelectorAll('.com-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      verticalFiltro = chip.dataset.vertical
      el.querySelector('#com-chips').innerHTML = chipsHtml()
      wireComerciosChips(el, comercios, from, to)
      pintarCuerpo(el, comercios, from, to)
    })
  })
}

// El conteo de arriba habla SIEMPRE de lo que se ve abajo: un "56 comercios"
// con una lista filtrada de 12 es un número que miente.
function pintarCuerpo(el, comercios, from, to) {
  const lista = filtrar(comercios)
  const totalChats = lista.reduce((n, c) => n + Number(c.total || 0), 0)
  const body = el.querySelector('#com-body')

  body.innerHTML = `
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4 mb-4">
      <p class="flex items-center gap-2">
        <span class="text-4xl font-black text-[var(--blue-100)]">${lista.length}</span>
        <span class="text-sm text-[var(--black-60)]">
          ${lista.length === 1 ? 'comercio' : 'comercios'}${verticalFiltro ? ` de ${escapeHtml(verticalFiltro)}` : ' identificados'} · ${totalChats} ${totalChats === 1 ? 'conversación' : 'conversaciones'}
        </span>
      </p>
      <p class="text-[11px] text-[var(--black-40)] mt-1">
        Solo cuentas con identidad. Las conversaciones que llegaron sin contexto de
        Bold no aparecen acá: no se puede saber de qué comercio son.
      </p>
    </div>
    ${lista.length ? `<div class="flex flex-col gap-2">${lista.map(filaComercio).join('')}</div>`
      : `<p class="text-sm text-[var(--black-40)] p-4">Sin comercios${verticalFiltro ? ` de ${escapeHtml(verticalFiltro)}` : ' identificados'} en el rango.</p>`}`

  // `lista` y no `comercios`: los data-idx de las filas indexan lo que se
  // acaba de pintar. Pasar el array sin filtrar desplegaría los chats del
  // comercio equivocado.
  wireComercios(body, lista, from, to)
}

function filaComercio(c, i) {
  const com = etiquetaComercio(c)
  const resueltas = Number(c.resueltas || 0)
  const noResueltas = Number(c.no_resueltas || 0)
  const conResultado = resueltas + noResueltas
  const usuarios = Number(c.usuarios || 0)

  return `
  <div class="bg-white rounded-2xl border border-[var(--blue-10)] overflow-hidden">
    <div class="com-row flex items-center gap-3 p-3 cursor-pointer hover:bg-[var(--background-page)]" data-idx="${i}" data-cuenta="${escapeHtml(c.account_id)}">
      <span class="com-caret text-[var(--black-40)] text-xs shrink-0">▸</span>
      <span class="flex-1 min-w-0">
        <span class="block text-sm font-bold text-[var(--black-100)] truncate">
          ${escapeHtml(com.texto)}${c.vertical ? ` <span class="text-[var(--black-40)]" style="font-weight:400">· ${escapeHtml(c.vertical)}</span>` : ''}
        </span>
        <span class="block text-[11px] text-[var(--black-40)]">
          ${c.business_name ? `ID ${escapeHtml(c.account_id)} · ` : ''}${usuarios ? `${usuarios} ${usuarios === 1 ? 'usuario' : 'usuarios'} · ` : ''}última ${escapeHtml(hace(c.ultima))}
        </span>
      </span>
      <span class="shrink-0 text-right">
        <span class="block text-lg font-black text-[var(--blue-100)] leading-none">${c.total}</span>
        <span class="block text-[10px] text-[var(--black-40)]">${Number(c.total) === 1 ? 'chat' : 'chats'}</span>
      </span>
      <span class="shrink-0 text-[10px] text-right" style="min-width:72px">
        ${conResultado
          ? `<span class="text-[var(--success-150)] font-bold">${resueltas} ok</span>
             <span class="text-[var(--black-40)]"> / </span>
             <span class="text-[var(--error-100)] font-bold">${noResueltas} no</span>`
          : '<span class="text-[var(--black-40)]">sin resultado</span>'}
        ${Number(c.sin_info) ? `<span class="block text-[var(--warning-150)]">${c.sin_info} sin info</span>` : ''}
      </span>
    </div>
    <div class="com-chats hidden border-t border-[var(--blue-10)]" data-chats="${i}"></div>
  </div>`
}

function wireComercios(el, comercios, from, to) {
  el.querySelectorAll('.com-row').forEach(row => {
    row.addEventListener('click', async () => {
      const i = row.dataset.idx
      const caja = el.querySelector(`.com-chats[data-chats="${i}"]`)
      const caret = row.querySelector('.com-caret')
      if (!caja) return

      if (!caja.classList.contains('hidden')) {
        caja.classList.add('hidden')
        caret.textContent = '▸'
        return
      }

      caja.classList.remove('hidden')
      caret.textContent = '▾'
      // Se recarga cada vez que se abre: el rango puede haber cambiado, y una
      // lista cacheada que no coincide con el rango de arriba es peor que
      // esperar un segundo.
      caja.innerHTML = `<p class="p-3 text-xs text-[var(--black-40)]">Cargando chats…</p>`

      let chats
      try {
        chats = await fetchBotConversations(from, to, {
          account_id: comercios[i].account_id, limit: LIMITE,
        })
      } catch (e) {
        caja.innerHTML = `<p class="p-3 text-xs text-[var(--error-100)]">No se pudieron cargar: ${escapeHtml(e.message)}</p>`
        return
      }

      caja.innerHTML = convRows(chats, { mostrarComercio: false })
      // bindRows busca dentro del contenedor que se le pasa, así que cada
      // comercio desplegado maneja sus propias filas sin pisar a los demás.
      bindRows(caja, chats)
    })
  })
}
