// Bandeja de vacíos del bot: lista, detalle y acciones.
//
// Vive fuera de js/admin.js (que ya pasa de 3.000 líneas), siguiendo el
// precedente de admin-analytics.js y admin-bot-analytics.js.
import { fetchVacios, fetchVaciosSalud } from './gaps-api.js'
import { estadoMostrado, registroEnSilencio } from './gap-lifecycle.js'

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

const hace = iso => {
  if (!iso) return '—'
  const dias = Math.floor((Date.now() - Date.parse(iso)) / 86400000)
  if (dias <= 0) return 'hoy'
  if (dias === 1) return 'ayer'
  return `hace ${dias} días`
}

export async function renderGapsPanel() {
  const el = document.getElementById('panel-gaps')
  el.innerHTML = `<p class="text-sm text-[var(--black-40)] p-6">Cargando...</p>`

  // Sin ?? 0 y sin try/catch que se trague el error: un fallo de lectura tiene
  // que verse como fallo, no como "no hay vacíos".
  let pendientes, reincidentes, salud
  try {
    ;[pendientes, reincidentes, salud] = await Promise.all([
      fetchVacios({ estado: 'pendiente' }),
      fetchVacios({ estado: 'resuelto' }),
      fetchVaciosSalud(),
    ])
  } catch (e) {
    el.innerHTML = `<div class="p-6">
      <p class="text-sm font-bold text-[var(--error-100)]">No se pudo leer la bandeja de vacíos.</p>
      <p class="text-xs text-[var(--black-40)] mt-1">${escapeHtml(e.message)}</p>
    </div>`
    return
  }

  const vuelven = (reincidentes || []).filter(v => estadoMostrado(v) === 'resuelto_reincidente')
  const silencio = registroEnSilencio({
    ultimoGapConversacion: salud?.ultimo_gap_conversacion,
    ultimaPreguntaRegistrada: salud?.ultima_pregunta_registrada,
  })

  el.innerHTML = `
    <div class="p-4 md:p-6 flex flex-col gap-4">
      ${silencio.enSilencio ? avisoSilencioHtml(silencio) : ''}
      ${Number(salud?.sin_clasificar) > 0 ? sinClasificarHtml(salud.sin_clasificar) : ''}
      ${vuelven.length ? franjaReincidentesHtml(vuelven) : ''}
      <div>
        <h2 class="text-sm font-black text-[var(--blue-100)] mb-2">
          Pendientes (${(pendientes || []).length})
        </h2>
        <div class="flex flex-col gap-1.5">
          ${(pendientes || []).length
            ? pendientes.map(filaHtml).join('')
            : `<p class="text-xs text-[var(--black-40)]">Nada pendiente. Si el bot está fallando igual, mira el aviso de arriba.</p>`}
        </div>
      </div>
    </div>`
}

function avisoSilencioHtml(s) {
  const cuando = s.horasSinRegistrar === null
    ? 'y no se ha registrado ninguno nunca'
    : `pero no se registra ninguno desde hace ${s.horasSinRegistrar} horas`
  return `<div class="border border-[var(--error-100)] rounded-xl p-3">
    <p class="text-xs font-black text-[var(--error-100)]">El registro de vacíos parece roto</p>
    <p class="text-xs text-[var(--black-60)] mt-1">
      El bot reportó preguntas sin respuesta ${escapeHtml(cuando)}.
      Revisa la rama de registro del workflow de n8n.
    </p>
  </div>`
}

function sinClasificarHtml(n) {
  return `<div class="border border-[var(--warning-150)] rounded-xl p-3">
    <p class="text-xs font-black text-[var(--warning-150)]">${n} preguntas sin clasificar</p>
    <p class="text-xs text-[var(--black-60)] mt-1">
      Llegaron sin embedding (cuota de Vertex). No se perdieron, pero tampoco se agruparon.
    </p>
  </div>`
}

function franjaReincidentesHtml(vs) {
  return `<div>
    <h2 class="text-sm font-black text-[var(--warning-150)] mb-2">
      Resueltos que siguen preguntándose (${vs.length})
    </h2>
    <p class="text-xs text-[var(--black-40)] mb-2">
      El contenido existe y el bot no lo está recuperando. Revisa que la lección
      esté activa y con embedding al día — es más barato que escribir de nuevo.
    </p>
    <div class="flex flex-col gap-1.5">${vs.map(filaHtml).join('')}</div>
  </div>`
}

function filaHtml(v) {
  const chips = [v.vertical, v.categoria].filter(Boolean)
    .map(c => `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--blue-10)] text-[var(--blue-100)]">${escapeHtml(c)}</span>`)
    .join(' ')
  const extra = Number(v.preguntas_desde_cierre) > 0
    ? `<span class="text-[10px] font-bold text-[var(--warning-150)]">+${v.preguntas_desde_cierre} desde que lo cerraste</span>`
    : ''
  return `<button data-vacio="${escapeHtml(v.id)}"
      class="gap-row w-full text-left bg-white border border-[var(--blue-10)] rounded-xl p-3 hover:bg-[var(--background-page)]">
    <div class="flex items-start justify-between gap-3">
      <span class="text-sm font-bold text-[var(--black-100)]">${escapeHtml(v.titulo)}</span>
      <span class="shrink-0 text-xs font-black text-[var(--blue-100)]">${v.preguntas_total}×</span>
    </div>
    <div class="flex items-center gap-2 mt-1.5 flex-wrap">
      ${chips}
      <span class="text-[10px] text-[var(--black-40)]">última ${escapeHtml(hace(v.ultima_vez))}</span>
      ${extra}
    </div>
  </button>`
}

export async function refreshGapsBadge() {
  const badge = document.getElementById('gapsBadge')
  if (!badge) return
  try {
    const salud = await fetchVaciosSalud()
    const n = Number(salud?.pendientes)
    // Number(undefined) es NaN, no 0: un fallo de lectura deja el badge oculto
    // en vez de afirmar que no hay nada pendiente.
    if (Number.isFinite(n) && n > 0) {
      badge.textContent = String(n)
      badge.classList.remove('hidden')
    } else {
      badge.classList.add('hidden')
    }
  } catch (e) {
    console.error('[gaps] no se pudo leer la salud de la bandeja:', e.message)
    badge.classList.add('hidden')
  }
}
