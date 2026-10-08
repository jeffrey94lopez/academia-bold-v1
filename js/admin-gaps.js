// Bandeja de vacíos del bot: lista, detalle y acciones.
//
// Vive fuera de js/admin.js (que ya pasa de 3.000 líneas), siguiendo el
// precedente de admin-analytics.js y admin-bot-analytics.js.
import { fetchVacios, fetchVaciosSalud, fetchVacioDetalle, resolverVacio } from './gaps-api.js'
import { estadoMostrado, registroEnSilencio } from './gap-lifecycle.js'
import { contenidoConFaq, buildFaqBlock } from './gap-faq-block.js'
import { dedupeQuestions } from './faq-suggest.js'
import { supabase } from './supabase.js'
import { logActivity } from './activity.js'
import { embedLesson } from './lesson-embed.js'

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
      // Paliativo: la RPC ordena por preguntas_total desc y el filtro por
      // preguntas_desde_cierre > 0 se hace abajo, en el cliente. Con el límite
      // por defecto (100) un reincidente con pocas preguntas totales se cae del
      // top en silencio. El arreglo correcto es un parámetro en la RPC que pida
      // solo los reincidentes; hasta entonces, un límite holgado.
      fetchVacios({ estado: 'resuelto', limit: 500 }),
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

  el.querySelectorAll('.gap-row').forEach(b =>
    b.addEventListener('click', () => abrirDetalle(b.dataset.vacio)))
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

// ── Detalle de un vacío y resolución ─────────────────────────────────────────

let vacioAbierto = null   // { vacio, preguntas } del detalle en pantalla

async function abrirDetalle(vacioId) {
  const el = document.getElementById('panel-gaps')
  el.innerHTML = `<p class="text-sm text-[var(--black-40)] p-6">Cargando...</p>`

  let detalle, lecciones
  try {
    detalle = await fetchVacioDetalle(vacioId)
    // La RPC devuelve vacio: null si el id ya no existe (p. ej. otro admin lo
    // dividió o lo descartó mientras tanto). Sin esto, el render lanzaría un
    // TypeError ajeno al problema real.
    if (!detalle?.vacio) throw new Error('El vacío ya no existe. Vuelve a la bandeja y recárgala.')
    const { data, error } = await supabase
      .from('lecciones').select('id,titulo,vertical').order('titulo')
    if (error) throw new Error(`lecciones: ${error.message}`)
    lecciones = data
  } catch (e) {
    el.innerHTML = `<div class="p-6">
      <p class="text-sm font-bold text-[var(--error-100)]">No se pudo abrir el vacío.</p>
      <p class="text-xs text-[var(--black-40)] mt-1">${escapeHtml(e.message)}</p>
      <button id="gapVolver" class="mt-3 text-xs font-bold text-[var(--blue-100)] hover:underline">← Volver</button>
    </div>`
    document.getElementById('gapVolver').addEventListener('click', renderGapsPanel)
    return
  }

  vacioAbierto = detalle
  const v = detalle.vacio
  // Las preguntas reales son lo que permite escribir la respuesta sin adivinar,
  // y también lo que precarga las variaciones.
  const variacionesSugeridas = dedupeQuestions(detalle.preguntas.map(p => p.texto)).join('\n')
  // La vertical del vacío acota el selector: ofrecer lecciones de la otra
  // vertical sería ofrecer el destino equivocado.
  const opciones = lecciones
    .filter(l => !v.vertical || !l.vertical || l.vertical === v.vertical || l.vertical === 'ambas')
    .map(l => `<option value="${escapeHtml(l.id)}">${escapeHtml(l.titulo)}</option>`).join('')

  el.innerHTML = `
    <div class="p-4 md:p-6 flex flex-col gap-4">
      <button id="gapVolver" class="text-xs font-bold text-[var(--blue-100)] hover:underline text-left">← Volver a la bandeja</button>

      <div>
        <h2 class="text-base font-black text-[var(--black-100)]">${escapeHtml(v.titulo)}</h2>
        <p class="text-xs text-[var(--black-40)] mt-1">
          ${escapeHtml(v.preguntas_total)} preguntas · primera ${escapeHtml(hace(v.primera_vez))} · última ${escapeHtml(hace(v.ultima_vez))}
        </p>
      </div>

      <div>
        <h3 class="text-xs font-black text-[var(--blue-100)] mb-1.5">Preguntas reales</h3>
        <div class="flex flex-col gap-1">
          ${detalle.preguntas.map((p, i) => preguntaHtml(p, i)).join('')}
        </div>
        <div id="gapSplitBar" class="hidden mt-2"></div>
      </div>

      <div class="bg-white border border-amber-200 rounded-xl p-3 flex flex-col gap-1.5">
        <h3 class="text-xs font-black text-amber-700">Resolver con una FAQ del bot</h3>
        <select id="gapLeccion" class="w-full px-2 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-xs outline-none focus:border-amber-400">
          <option value="">Elige la lección destino…</option>${opciones}
        </select>
        <input id="gapPregunta" value="${escapeHtml(v.titulo)}" placeholder="Pregunta base"
          class="w-full px-2 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-xs font-bold outline-none focus:border-amber-400">
        <textarea id="gapVariaciones" rows="3"
          class="w-full px-2 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-xs outline-none focus:border-amber-400 resize-none">${escapeHtml(variacionesSugeridas)}</textarea>
        <textarea id="gapRespuesta" rows="4" placeholder="Respuesta que dará el bot..."
          class="w-full px-2 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-xs outline-none focus:border-amber-400 resize-none"></textarea>
        <label class="flex items-center gap-1.5 text-[11px] text-[var(--black-60)] cursor-pointer select-none">
          <input type="checkbox" id="gapAcordeon" class="accent-[var(--blue-100)]">
          Mostrar en la lección como acordeón (visible al estudiante)
        </label>
        <p id="gapMsg" class="text-xs hidden"></p>
        <div class="flex gap-2 mt-1">
          <button id="gapGuardar" class="px-3 py-2 rounded-xl text-xs font-bold bg-[var(--blue-100)] text-white">Guardar y cerrar el vacío</button>
          <button id="gapDescartarBtn" class="px-3 py-2 rounded-xl text-xs font-bold text-[var(--black-60)] border border-[var(--blue-20)]">Descartar…</button>
        </div>
      </div>

      <div id="gapDescartarBox" class="hidden"></div>
    </div>`

  document.getElementById('gapVolver').addEventListener('click', renderGapsPanel)
  document.getElementById('gapGuardar').addEventListener('click', onGuardar)
  wireVerConversacion()
  wireDescartar(v)
  wireDividir(v)
}

// PLACEHOLDERS de la Task 13 (descartar y dividir). Existen solo para que
// abrirDetalle no lance ReferenceError; la Task 13 los reemplaza por las
// implementaciones reales (si quedan los dos, el módulo no parsea: es a
// propósito, no se puede olvidar quitarlos).
function wireDescartar(_vacio) {}
function wireDividir(_vacio) {}

function preguntaHtml(p, i) {
  const verConv = (p.mensajes || []).length
    ? `<button type="button" data-conv="${i}" class="gap-conv text-[10px] font-bold text-[var(--blue-100)] hover:underline shrink-0">ver conversación</button>`
    : ''
  return `<div class="bg-white border border-[var(--blue-10)] rounded-lg p-2">
    <label class="flex items-start gap-2 cursor-pointer">
      <input type="checkbox" class="gap-pregunta mt-0.5 accent-[var(--blue-100)]" value="${escapeHtml(p.id)}">
      <span class="flex-1 text-xs text-[var(--black-100)]">${escapeHtml(p.texto)}</span>
      <span class="text-[10px] text-[var(--black-40)] shrink-0">${escapeHtml(hace(p.created_at))}</span>
      ${verConv}
    </label>
    <div class="gap-conv-detail hidden mt-2 pt-2 border-t border-[var(--blue-10)] text-xs" data-detail="${i}"></div>
  </div>`
}

// La conversación se expande acá adentro, no se navega a otro panel: el
// explorador no sabe abrir una conversación por id, y además perder el lugar en
// la bandeja a mitad de una revisión es lo que hace que nadie la termine.
function wireVerConversacion() {
  document.querySelectorAll('.gap-conv').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault()
      const i = btn.dataset.conv
      const box = document.querySelector(`.gap-conv-detail[data-detail="${i}"]`)
      if (!box.classList.contains('hidden')) { box.classList.add('hidden'); return }
      const p = vacioAbierto.preguntas[i]
      const msgs = (p.mensajes || []).map(m =>
        `<p class="mb-1"><b class="text-[var(--blue-100)]">${m.role === 'user' ? 'Usuario' : 'Bot'}:</b> ${escapeHtml(m.content || '')}</p>`).join('')
      box.innerHTML = `${p.resumen ? `<p class="italic text-[var(--black-60)] mb-2">✨ ${escapeHtml(p.resumen)}</p>` : ''}${msgs}`
      box.classList.remove('hidden')
    })
  })
}

async function onGuardar() {
  const btn = document.getElementById('gapGuardar')
  const leccionId = document.getElementById('gapLeccion').value
  if (!leccionId) { mostrarMsg('Elige la lección destino.', true); return }

  btn.disabled = true
  btn.textContent = 'Guardando...'
  const { error } = await guardarResolucion({
    vacioId: vacioAbierto.vacio.id,
    leccionId,
    pregunta: document.getElementById('gapPregunta').value,
    variaciones: document.getElementById('gapVariaciones').value,
    respuesta: document.getElementById('gapRespuesta').value,
    mostrarAcordeon: document.getElementById('gapAcordeon').checked,
  })
  btn.disabled = false
  btn.textContent = 'Guardar y cerrar el vacío'

  if (error) { mostrarMsg(error, true); return }
  renderGapsPanel()
  refreshGapsBadge()
}

function mostrarMsg(texto, esError) {
  const msg = document.getElementById('gapMsg')
  msg.textContent = texto
  msg.className = `text-xs ${esError ? 'text-[var(--error-100)]' : 'text-[var(--success-150)]'}`
}

// Escribe el bloque bot_faq en la lección destino y cierra el vacío.
//
// El orden importa y no es negociable: se RELEE `contenido` justo antes de
// escribir. Usar una copia leída al abrir el modal es la clase de bug que ya
// vació lecciones — si alguien la editó mientras tanto, se pisaría su trabajo
// entero en vez de perder unos segundos.
async function guardarResolucion({ vacioId, leccionId, pregunta, variaciones, respuesta, mostrarAcordeon }) {
  const bloque = buildFaqBlock({ pregunta, variaciones, respuesta, mostrarAcordeon })
  if (!bloque) return { error: 'Falta la pregunta base o la respuesta.' }

  const { data: leccion, error: errLeer } = await supabase
    .from('lecciones').select('id,titulo,categoria,contenido,notas').eq('id', leccionId).single()
  if (errLeer) return { error: `No se pudo leer la lección: ${errLeer.message}` }

  let contenido
  try {
    contenido = contenidoConFaq(leccion.contenido, bloque)
  } catch (e) {
    // contenidoConFaq lanza cuando el parseo daría vacío teniendo contenido.
    return { error: e.message }
  }

  // .select('id') es lo que permite ver si el UPDATE tocó algo: una política RLS
  // que lo bloquee no da error, devuelve 0 filas, y sin esta comprobación se
  // cerraría el vacío sin que la FAQ existiera.
  const { data: tocadas, error: errGuardar } = await supabase
    .from('lecciones').update({ contenido }).eq('id', leccionId).select('id')
  if (errGuardar) return { error: `No se pudo guardar la lección: ${errGuardar.message}` }
  if (!tocadas || tocadas.length !== 1) {
    return { error: 'La lección no se actualizó (permisos o la lección ya no existe). El vacío sigue abierto.' }
  }

  const { data: { user } } = await supabase.auth.getUser()
  try {
    await resolverVacio(vacioId, leccionId, user?.email || '')
  } catch (e) {
    // La lección YA se guardó. Decirlo en vez de fingir que no pasó nada: el
    // contenido está bien y lo único pendiente es cerrar el vacío.
    return { error: `La FAQ se guardó, pero el vacío no se pudo cerrar: ${e.message}` }
  }

  logActivity('update', 'bot_vacio', pregunta, { leccion_id: leccionId, accion: 'resuelto' })

  // Re-embeber al final y sin bloquear: sin esto el bot no encuentra la FAQ
  // recién escrita, que es el objetivo entero de la bandeja.
  embedLesson(leccion.id, leccion.titulo, leccion.categoria,
    JSON.parse(contenido), leccion.notas)

  return { error: null }
}
