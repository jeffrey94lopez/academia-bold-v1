// Bandeja de vacíos del bot: lista, detalle y acciones.
//
// Vive fuera de js/admin.js (que ya pasa de 3.000 líneas), siguiendo el
// precedente de admin-analytics.js y admin-bot-analytics.js.
import { fetchVacios, fetchVaciosSalud, fetchVacioDetalle, resolverVacio,
         descartarVacio, dividirVacio, marcarSolicitud, marcarIncidente,
         fusionarVacios } from './gaps-api.js'
import { validarDivision } from './gap-split.js'
import { validarFusion, avisosFusion } from './gap-merge.js'
import { etiquetaComercio, contarComercios } from './gap-comercio.js'
import { agruparPorCategoria } from './gap-grouping.js'
import { estadoMostrado, registroEnSilencio } from './gap-lifecycle.js'
import { contenidoConFaqInfo, buildFaqBlock } from './gap-faq-block.js'
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

// Pestañas de la bandeja. El orden es el del trabajo: primero lo que falta
// escribir, después los pedidos de producto, al final lo ya cerrado.
//
// `solicitud` e `incidente` NO son descartes: en los dos el bot YA responde
// bien, pero son señal, y la leen equipos distintos. Solicitud = los clientes
// piden algo que la plataforma no hace (lo lee Producto). Incidente = algo no
// está funcionando (lo lee Soporte). Juntos, cada uno es ruido para el otro;
// descartados, los entierra a los dos.
const ESTADOS = {
  pendiente:  'Pendientes',
  solicitud:  'Solicitudes',
  incidente:  'Incidentes',
  resuelto:   'Resueltos',
  descartado: 'Descartados',
}
// Vive a nivel de módulo para sobrevivir a los repintados (resolver, descartar,
// volver del detalle).
let estadoFiltro = 'pendiente'

// Tope de cada consulta. Con el límite por defecto de la RPC (100), un vacío con
// pocas preguntas totales se cae de la lista en silencio. El arreglo correcto es
// un parámetro en la RPC que filtre en el servidor; hasta entonces, uno holgado.
const LIMITE_LISTA = 500

export async function renderGapsPanel() {
  const el = document.getElementById('panel-gaps')
  el.innerHTML = `<p class="text-sm text-[var(--black-40)] p-6">Cargando...</p>`

  // Sin ?? 0 y sin try/catch que se trague el error: un fallo de lectura tiene
  // que verse como fallo, no como "no hay vacíos".
  //
  // Se piden los tres estados siempre: la lista muestra uno según el filtro, y
  // las dos franjas de arriba (resueltos y descartados que siguen recibiendo
  // preguntas) salen de los otros dos. El filtro por reincidencia
  // (preguntas_desde_cierre > 0) se hace abajo, en el cliente.
  const pedir = estado => fetchVacios({ estado, limit: LIMITE_LISTA })
  let porEstado, salud
  try {
    const estados = Object.keys(ESTADOS)
    const [listas, s] = await Promise.all([
      Promise.all(estados.map(pedir)), fetchVaciosSalud(),
    ])
    porEstado = Object.fromEntries(estados.map((e, i) => [e, listas[i]]))
    salud = s
  } catch (e) {
    el.innerHTML = `<div class="p-6 flex flex-col gap-4">
      <div id="gapEmbedAviso"></div>
      <div>
        <p class="text-sm font-bold text-[var(--error-100)]">No se pudo leer la bandeja de vacíos.</p>
        <p class="text-xs text-[var(--black-40)] mt-1">${escapeHtml(e.message)}</p>
      </div>
    </div>`
    pintarAvisoEmbed(document.getElementById('gapEmbedAviso'))
    return
  }

  const lista = porEstado[estadoFiltro] || []
  // Cada franja se oculta cuando la lista ya muestra ese mismo estado: sería
  // repetir las mismas filas dos veces.
  const vuelven = estadoFiltro === 'resuelto' ? []
    : (porEstado.resuelto || []).filter(v => estadoMostrado(v) === 'resuelto_reincidente')
  const descartadosVuelven = estadoFiltro === 'descartado' ? []
    : (porEstado.descartado || []).filter(v => estadoMostrado(v) === 'descartado_reincidente')
  const silencio = registroEnSilencio({
    ultimoGapConversacion: salud?.ultimo_gap_conversacion,
    ultimaPreguntaRegistrada: salud?.ultima_pregunta_registrada,
  })

  const VACIO_MSG = {
    pendiente:  'Nada pendiente. Si el bot está fallando igual, mira el aviso de arriba.',
    solicitud:  'Ninguna solicitud todavía. Se marcan desde el detalle de un vacío pendiente.',
    resuelto:   'No hay vacíos resueltos.',
    descartado: 'No hay vacíos descartados.',
  }
  const vacioMsg = VACIO_MSG[estadoFiltro] || 'No hay vacíos.'
  const INTRO = {
    solicitud: 'Lo que los clientes piden y la plataforma hoy no hace. El bot ya responde bien estos casos; quedan acá como señal de producto, no como contenido por escribir.',
    incidente: 'Cosas que no están funcionando. No se arreglan escribiendo contenido: se arreglan en la plataforma. Mirá el número de comercios — lo que le pasa a varios es un problema, lo que le pasa a uno es un caso.',
  }

  el.innerHTML = `
    <div class="p-4 md:p-6 flex flex-col gap-4">
      <div id="gapEmbedAviso"></div>
      ${silencio.enSilencio ? avisoSilencioHtml(silencio) : ''}
      ${Number(salud?.sin_clasificar) > 0 ? sinClasificarHtml(salud.sin_clasificar) : ''}
      ${vuelven.length ? franjaReincidentesHtml(vuelven) : ''}
      ${descartadosVuelven.length ? franjaDescartadosHtml(descartadosVuelven) : ''}
      <div>
        <div class="flex items-center gap-1.5 flex-wrap mb-3">
          ${pestanasHtml(porEstado)}
        </div>
        ${INTRO[estadoFiltro] ? `<p class="text-xs text-[var(--black-60)] mb-2">${INTRO[estadoFiltro]}</p>` : ''}
        <div class="flex flex-col gap-2">
          ${lista.length
            ? agruparPorCategoria(lista).map(grupoHtml).join('')
            : `<p class="text-xs text-[var(--black-40)]">${vacioMsg}</p>`}
        </div>
      </div>
    </div>`

  pintarAvisoEmbed(document.getElementById('gapEmbedAviso'))
  el.querySelectorAll('.gap-tab').forEach(b => b.addEventListener('click', () => {
    estadoFiltro = b.dataset.estado
    renderGapsPanel()
  }))
  el.querySelectorAll('.gap-row').forEach(b =>
    b.addEventListener('click', () => abrirDetalle(b.dataset.vacio)))
}

// Pestañas en estilo píldora y no subrayadas: `border-b-2` no existe en el
// css/tw.css precompilado, y una clase que no está ahí no aplica nada.
function pestanasHtml(porEstado) {
  return Object.entries(ESTADOS).map(([k, t]) => {
    const n = (porEstado[k] || []).length
    const activa = k === estadoFiltro
    const base = 'gap-tab px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5'
    const estilo = activa
      ? 'bg-[var(--blue-100)] text-white'
      : 'text-[var(--black-60)] border border-[var(--blue-20)] hover:bg-[var(--blue-10)]'
    const badge = activa
      ? 'bg-white text-[var(--blue-100)]'
      : 'bg-[var(--blue-10)] text-[var(--blue-100)]'
    return `<button type="button" data-estado="${escapeHtml(k)}" class="${base} ${estilo}"
      ${activa ? 'aria-current="page"' : ''}>${escapeHtml(t)}
      <span class="${badge} text-[10px] font-black px-1.5 rounded-full">${n >= LIMITE_LISTA ? n + '+' : n}</span>
    </button>`
  }).join('')
}

// Una sección por categoría, colapsable. Se usa <details> nativo: `list-none`
// tampoco existe en el precompilado, así que el triángulo del navegador se deja
// como está — además es el que la gente ya sabe leer.
function grupoHtml(g) {
  return `<details class="bg-white border border-[var(--blue-10)] rounded-xl"${g.abierto ? ' open' : ''}>
    <summary class="px-3 py-2 text-xs font-black text-[var(--blue-100)] cursor-pointer select-none">
      ${escapeHtml(g.categoria)}
      <span class="text-[var(--black-40)] font-bold ml-1">· ${g.total}</span>
    </summary>
    <div class="flex flex-col gap-1.5 px-2 pb-2">${g.vacios.map(filaHtml).join('')}</div>
  </details>`
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

// Decisión 5 de la spec: un descartado que vuelve muchas veces vuelve a la
// superficie. Importa por partida doble: el descarte lo hizo una persona, y un
// vacío descartado con un ancla amplia SIGUE absorbiendo preguntas parecidas
// (el registro empareja contra todos los vacíos, sin mirar el estado).
function franjaDescartadosHtml(vs) {
  return `<div>
    <h2 class="text-sm font-black text-[var(--warning-150)] mb-2">
      Descartados que vuelven (${vs.length})
    </h2>
    <p class="text-xs text-[var(--black-40)] mb-2">
      Los descartaste y siguen llegando preguntas parecidas. Revisa si el descarte
      fue correcto; si no, ábrelo y resuélvelo.
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
  // Cuántos comercios DISTINTOS lo reportaron. Es la diferencia entre un
  // problema de plataforma y un caso puntual, y en Incidentes es el dato
  // principal. Si la RPC todavía no trae la columna, el chip no se pinta en vez
  // de mostrar "undefined comercios".
  const n = Number(v.comercios)
  const comercios = Number.isFinite(n) && n > 0
    ? `<span class="text-[10px] font-bold text-[var(--black-60)]">${n} ${n === 1 ? 'comercio' : 'comercios'}</span>`
    : ''
  // El motivo del descarte es lo que dice, a los dos meses, de qué tipo de
  // basura genera el detector: tiene que verse en algún lado.
  const motivo = v.estado === 'descartado'
    ? `<span class="text-[10px] font-bold text-[var(--black-60)]">descartado: ${escapeHtml(motivoLegible(v.motivo_descarte))}</span>`
    : ''
  return `<button data-vacio="${escapeHtml(v.id)}"
      class="gap-row w-full text-left bg-white border border-[var(--blue-10)] rounded-xl p-3 hover:bg-[var(--background-page)]">
    <div class="flex items-start justify-between gap-3">
      <span class="text-sm font-bold text-[var(--black-100)]">${escapeHtml(v.titulo)}</span>
      <span class="shrink-0 text-xs font-black text-[var(--blue-100)]">${v.preguntas_total}×</span>
    </div>
    <div class="flex items-center gap-2 mt-1.5 flex-wrap">
      ${chips}
      ${comercios}
      <span class="text-[10px] text-[var(--black-40)]">última ${escapeHtml(hace(v.ultima_vez))}</span>
      ${motivo}
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

// Si la FAQ ya quedó escrita pero el vacío no se cerró, acá se guarda a qué
// lección apuntar. El reintento ejecuta SOLO resolverVacio: volver a pasar por
// guardarResolucion releería la lección (guardarResolucion ya no duplica una FAQ
// con la misma pregunta, pero el reintento no tiene por qué escribir de nuevo).
//
// Lleva su `vacioId` porque tiene que sobrevivir a "← Volver a la bandeja" y a
// reabrir ese mismo vacío (que sigue listado como pendiente porque nunca se
// cerró): abrirDetalle lo conserva si el id coincide y lo borra solo al abrir
// otro vacío. `formulario` y `mensaje` permiten repintar el estado congelado
// tal como lo vio el usuario.
let cierrePendiente = null   // { vacioId, leccionId, pregunta, formulario, mensaje } | null

// Un re-embebido fallido deja la FAQ escrita pero el bot incapaz de encontrarla.
// El re-embebido corre sin esperarse y es independiente del cierre del vacío:
// puede fallar con el vacío cerrado o, si el cierre también falla, con el vacío
// todavía en la bandeja; el aviso no afirma nada sobre el estado del vacío.
// El aviso no puede vivir en un prepend: el propio onGuardar repinta el panel
// justo después y se lo lleva. Vive en una bandera que renderGapsPanel pinta
// hasta que alguien la descarte.
let embedFallido = null   // { leccionId, titulo } | null

const CAMPOS_FORMULARIO = ['gapLeccion', 'gapPregunta', 'gapVariaciones', 'gapRespuesta', 'gapAcordeon']

// Cuántas preguntas llegaron después de que el vacío se cerró (resuelto o
// descartado). La RPC del detalle no trae este contador (la de la lista sí), pero
// trae las preguntas con su fecha y `resuelto_at`: se cuenta de ahí, de datos
// reales.
function preguntasDesdeCierre(v, preguntas) {
  const cierre = Date.parse(v.resuelto_at)
  if (Number.isNaN(cierre)) return 0
  return preguntas.filter(p => Date.parse(p.created_at) > cierre).length
}

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
  // El reintento de cierre pertenece a UN vacío: reabrir ese mismo (tras "Volver"
  // o tras dividir) lo conserva; abrir otro lo suelta.
  if (cierrePendiente && cierrePendiente.vacioId !== vacioId) cierrePendiente = null
  const v = detalle.vacio
  const estado = v.estado
  // Las preguntas reales son lo que permite escribir la respuesta sin adivinar,
  // y también lo que precarga las variaciones.
  const variacionesSugeridas = dedupeQuestions(detalle.preguntas.map(p => p.texto)).join('\n')
  // La vertical del vacío acota el selector: ofrecer lecciones de la otra
  // vertical sería ofrecer el destino equivocado.
  const opciones = lecciones
    .filter(l => !v.vertical || !l.vertical || l.vertical === v.vertical || l.vertical === 'ambas')
    .map(l => `<option value="${escapeHtml(l.id)}">${escapeHtml(l.titulo)}</option>`).join('')

  // Un vacío que NO está pendiente ya tuvo una decisión: no se le ofrece el
  // formulario como si nada. Se muestra qué pasó y el formulario queda detrás de
  // una confirmación (ver resueltoHtml / descartadoHtml).
  const reabrible = estado !== 'pendiente'
  const desdeCierre = preguntasDesdeCierre(v, detalle.preguntas)
  // Cuántos comercios DISTINTOS: un incidente de 5 comercios es un problema de
  // plataforma; 5 preguntas del mismo comercio es un caso.
  const comercios = contarComercios(detalle.preguntas)
  // La RPC del detalle devuelve la fila cruda de bot_vacios (leccion_id, sin el
  // título): el título sale de la lista de lecciones que ya se leyó arriba.
  const leccionDestino = v.leccion_id ? lecciones.find(l => l.id === v.leccion_id) : null

  el.innerHTML = `
    <div class="p-4 md:p-6 flex flex-col gap-4">
      <button id="gapVolver" class="text-xs font-bold text-[var(--blue-100)] hover:underline text-left">← Volver a la bandeja</button>

      <div>
        <h2 class="text-base font-black text-[var(--black-100)]">${escapeHtml(v.titulo)}</h2>
        <p class="text-xs text-[var(--black-40)] mt-1">
          ${escapeHtml(v.preguntas_total)} preguntas · primera ${escapeHtml(hace(v.primera_vez))} · última ${escapeHtml(hace(v.ultima_vez))}${comercios > 0 ? ` · ${comercios} ${comercios === 1 ? 'comercio' : 'comercios'}` : ''}
        </p>
        ${estado === 'resuelto' ? '' : `<button id="gapFusionBtn"
          class="mt-1.5 text-xs font-bold text-[var(--blue-100)] hover:underline">Fusionar con otro vacío…</button>`}
      </div>

      <div id="gapFusionBox" class="hidden"></div>

      ${estado === 'resuelto' ? resueltoHtml(v, leccionDestino, desdeCierre) : ''}
      ${estado === 'descartado' ? descartadoHtml(v, desdeCierre) : ''}
      ${estado === 'solicitud' ? solicitudHtml(v, desdeCierre) : ''}
      ${estado === 'incidente' ? incidenteHtml(v, desdeCierre) : ''}

      <div>
        <h3 class="text-xs font-black text-[var(--blue-100)] mb-1.5">Preguntas reales</h3>
        <div class="flex flex-col gap-1">
          ${detalle.preguntas.map((p, i) => preguntaHtml(p, i)).join('')}
        </div>
        <div id="gapSplitBar" class="hidden mt-2"></div>
      </div>

      <div id="gapConfirmBox" class="hidden"></div>

      <div id="gapResolverWrap" class="${reabrible ? 'hidden' : ''}">
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
            ${estado === 'pendiente'
              ? `<button id="gapSolicitudBtn" class="px-3 py-2 rounded-xl text-xs font-bold text-[var(--black-60)] border border-[var(--blue-20)]">Es una solicitud…</button>
                 <button id="gapIncidenteBtn" class="px-3 py-2 rounded-xl text-xs font-bold text-[var(--black-60)] border border-[var(--blue-20)]">Es un incidente…</button>
                 <button id="gapDescartarBtn" class="px-3 py-2 rounded-xl text-xs font-bold text-[var(--black-60)] border border-[var(--blue-20)]">Descartar…</button>`
              : ''}
          </div>
        </div>
      </div>

      <div id="gapDescartarBox" class="hidden"></div>
    </div>`

  document.getElementById('gapVolver').addEventListener('click', renderGapsPanel)
  document.getElementById('gapGuardar').addEventListener('click', onGuardar)
  wireVerConversacion()
  wireDividir(v)
  wireFusionar(v)
  wireAccionesPorEstado(v)
  if (cierrePendiente) repintarCierrePendiente()
}

// Estado congelado del reintento: la FAQ YA está en la lección, así que lo único
// que queda por hacer es cerrar el vacío. Se repinta con los valores que la
// persona había escrito, deshabilitados, y el aviso del fallo.
function repintarCierrePendiente() {
  // Si el vacío estaba resuelto/descartado, el formulario sigue oculto tras su
  // confirmación; pero el reintento es lo único que tiene sentido hacer, así
  // que se muestra.
  document.getElementById('gapResolverWrap').classList.remove('hidden')
  const f = cierrePendiente.formulario
  if (f) {
    document.getElementById('gapLeccion').value = f.leccionId
    document.getElementById('gapPregunta').value = f.pregunta
    document.getElementById('gapVariaciones').value = f.variaciones
    document.getElementById('gapRespuesta').value = f.respuesta
    document.getElementById('gapAcordeon').checked = f.mostrarAcordeon
  }
  CAMPOS_FORMULARIO.forEach(id => { document.getElementById(id).disabled = true })
  document.getElementById('gapGuardar').textContent = 'Reintentar cerrar el vacío'
  if (cierrePendiente.mensaje) mostrarMsg(cierrePendiente.mensaje, true)
}

// ── Vacíos que ya tuvieron una decisión ──────────────────────────────────────

function resueltoHtml(v, leccion, desdeCierre) {
  const donde = leccion
    ? `la lección «${escapeHtml(leccion.titulo)}»`
    : 'una lección que ya no existe'
  const quien = v.resuelto_por ? ` por ${escapeHtml(v.resuelto_por)}` : ''
  return `<div class="bg-white border border-[var(--blue-10)] rounded-xl p-3 flex flex-col gap-1.5">
    <h3 class="text-xs font-black text-[var(--success-150)]">Este vacío ya está resuelto</h3>
    <p class="text-xs text-[var(--black-100)]">
      Se resolvió con una FAQ en ${donde}${quien}, ${escapeHtml(hace(v.resuelto_at))}.
    </p>
    ${desdeCierre > 0 ? `<p class="text-xs font-bold text-[var(--warning-150)]">
      ${desdeCierre} ${desdeCierre === 1 ? 'pregunta llegó' : 'preguntas llegaron'} después de resolverlo.</p>` : ''}
    <p class="text-xs text-[var(--black-60)]">
      ${desdeCierre > 0
        ? 'El contenido existe y el bot no lo está recuperando. Escribir otra FAQ no lo arregla.'
        : 'Si vuelven a preguntarlo, no hará falta escribir otra FAQ: el problema sería que el bot no recupera la lección.'}
      Revisa que esa lección esté <b>activa</b> y con el <b>embedding al día</b>
      (en Lecciones: guárdala de nuevo o usa "Re-embeber todo").
    </p>
    <div class="flex gap-2 flex-wrap mt-1">
      <button id="gapIrLecciones" class="px-3 py-2 rounded-xl text-xs font-bold bg-[var(--blue-100)] text-white">Ir a Lecciones a revisarla</button>
      <button id="gapResolverDeNuevo" class="px-3 py-2 rounded-xl text-xs font-bold text-[var(--black-60)] border border-[var(--blue-20)]">Resolver de nuevo…</button>
      <button id="gapDescartarBtn" class="px-3 py-2 rounded-xl text-xs font-bold text-[var(--black-60)] border border-[var(--blue-20)]">Descartar…</button>
    </div>
  </div>`
}

// Sin esta caja, un vacío marcado como solicitud abría sin explicar su estado
// y sin un solo botón — y wireAccionesPorEstado lanzaba TypeError buscando
// #gapResolverDeNuevo, que solo pintaban las otras dos cajas.
function solicitudHtml(v, desdeCierre) {
  const quien = v.resuelto_por ? ` por ${escapeHtml(v.resuelto_por)}` : ''
  return `<div class="bg-white border border-[var(--blue-10)] rounded-xl p-3 flex flex-col gap-1.5">
    <h3 class="text-xs font-black text-[var(--blue-100)]">Este vacío está marcado como solicitud</h3>
    <p class="text-xs text-[var(--black-100)]">
      El bot ya responde bien esto. Quedó registrado como algo que los clientes
      piden y la plataforma no hace${quien}, ${escapeHtml(hace(v.resuelto_at))}.
    </p>
    ${v.nota_descarte ? `<p class="text-xs text-[var(--black-60)]">Cómo funciona hoy: ${escapeHtml(v.nota_descarte)}</p>` : ''}
    ${desdeCierre > 0 ? `<p class="text-xs font-bold text-[var(--warning-150)]">
      ${desdeCierre} ${desdeCierre === 1 ? 'pregunta llegó' : 'preguntas llegaron'} después de marcarla.</p>` : ''}
    <p class="text-xs text-[var(--black-60)]">
      Si la plataforma cambia y ahora sí se puede hacer, resuélvelo con una FAQ.
    </p>
    <div class="flex gap-2 flex-wrap mt-1">
      <button id="gapResolverDeNuevo" class="px-3 py-2 rounded-xl text-xs font-bold bg-[var(--blue-100)] text-white">Resolver con una FAQ…</button>
      <button id="gapIncidenteBtn" class="px-3 py-2 rounded-xl text-xs font-bold text-[var(--black-60)] border border-[var(--blue-20)]">Es un incidente…</button>
    </div>
  </div>`
}

// Incidente: algo no funciona. Lo lee Soporte, y lo que importa es de qué
// comercios vino — por eso el detalle lo dice pregunta por pregunta.
function incidenteHtml(v, desdeCierre) {
  const quien = v.resuelto_por ? ` por ${escapeHtml(v.resuelto_por)}` : ''
  return `<div class="bg-white border border-[var(--warning-150)] rounded-xl p-3 flex flex-col gap-1.5">
    <h3 class="text-xs font-black text-[var(--warning-150)]">Este vacío está marcado como incidente de soporte</h3>
    <p class="text-xs text-[var(--black-100)]">
      No falta contenido: algo no está funcionando. Marcado${quien}, ${escapeHtml(hace(v.resuelto_at))}.
    </p>
    ${v.nota_descarte ? `<p class="text-xs text-[var(--black-60)]">Qué falla: ${escapeHtml(v.nota_descarte)}</p>` : ''}
    ${desdeCierre > 0 ? `<p class="text-xs font-bold text-[var(--warning-150)]">
      ${desdeCierre} ${desdeCierre === 1 ? 'pregunta llegó' : 'preguntas llegaron'} después de marcarlo: sigue pasando.</p>` : ''}
    <div class="flex gap-2 flex-wrap mt-1">
      <button id="gapResolverDeNuevo" class="px-3 py-2 rounded-xl text-xs font-bold bg-[var(--blue-100)] text-white">Resolver con una FAQ…</button>
      <button id="gapSolicitudBtn" class="px-3 py-2 rounded-xl text-xs font-bold text-[var(--black-60)] border border-[var(--blue-20)]">Es una solicitud…</button>
    </div>
  </div>`
}

function descartadoHtml(v, desdeCierre) {
  return `<div class="bg-white border border-[var(--blue-10)] rounded-xl p-3 flex flex-col gap-1.5">
    <h3 class="text-xs font-black text-[var(--black-60)]">Este vacío está descartado</h3>
    <p class="text-xs text-[var(--black-100)]">
      Motivo: <b>${escapeHtml(motivoLegible(v.motivo_descarte))}</b> · ${escapeHtml(hace(v.resuelto_at))}.
    </p>
    ${v.nota_descarte ? `<p class="text-xs text-[var(--black-60)]">Nota: ${escapeHtml(v.nota_descarte)}</p>` : ''}
    ${desdeCierre > 0 ? `<p class="text-xs font-bold text-[var(--warning-150)]">
      ${desdeCierre} ${desdeCierre === 1 ? 'pregunta llegó' : 'preguntas llegaron'} después de descartarlo.</p>` : ''}
    <div class="flex gap-2 flex-wrap mt-1">
      <button id="gapResolverDeNuevo" class="px-3 py-2 rounded-xl text-xs font-bold bg-[var(--blue-100)] text-white">Reabrir resolviéndolo…</button>
    </div>
  </div>`
}

// Pide confirmación en #gapConfirmBox antes de hacer algo que no se debería
// hacer por un clic distraído.
function pedirConfirmacion({ titulo, texto, okTexto, onOk }) {
  const box = document.getElementById('gapConfirmBox')
  box.classList.remove('hidden')
  box.innerHTML = `<div class="border border-[var(--warning-150)] rounded-xl p-3 flex flex-col gap-1.5">
    <p class="text-xs font-black text-[var(--warning-150)]">${escapeHtml(titulo)}</p>
    <p class="text-xs text-[var(--black-60)]">${escapeHtml(texto)}</p>
    <div class="flex gap-2 mt-1">
      <button id="gapConfirmOk" class="px-3 py-2 rounded-xl text-xs font-bold bg-[var(--blue-100)] text-white">${escapeHtml(okTexto)}</button>
      <button id="gapConfirmNo" class="px-3 py-2 rounded-xl text-xs font-bold text-[var(--black-60)] border border-[var(--blue-20)]">Cancelar</button>
    </div>
  </div>`
  const cerrar = () => { box.classList.add('hidden'); box.innerHTML = '' }
  document.getElementById('gapConfirmNo').addEventListener('click', cerrar)
  document.getElementById('gapConfirmOk').addEventListener('click', () => { cerrar(); onOk() })
}

function wireAccionesPorEstado(v) {
  if (v.estado === 'pendiente') {
    wireDescartar(v)
    wireMarca(v, 'solicitud')
    wireMarca(v, 'incidente')
    return
  }

  // Una marca se corrige con la otra: lo que entró como solicitud y resulta ser
  // un incidente (o al revés) se mueve sin pasar por pendiente.
  wireMarca(v, 'solicitud')
  wireMarca(v, 'incidente')

  const wrap = document.getElementById('gapResolverWrap')
  const mostrarFormulario = () => {
    wrap.classList.remove('hidden')
    wrap.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
  }

  // Resolver de nuevo pone resuelto_at = now(), y la reincidencia se cuenta
  // contra resuelto_at: el contador vuelve a 0 y el vacío sale de la franja de
  // arriba sin que nadie haya arreglado nada. Por eso va detrás de un aviso.
  document.getElementById('gapResolverDeNuevo').addEventListener('click', () => {
    if (v.estado === 'resuelto') {
      pedirConfirmacion({
        titulo: '¿Resolver de nuevo?',
        texto: 'Resolver otra vez reinicia el contador de reincidencia: este vacío saldrá de "Resueltos que siguen preguntándose" aunque el bot siga sin recuperar la lección. Si el problema es que el bot no la encuentra, escribir otra FAQ no lo arregla.',
        okTexto: 'Sí, resolver de nuevo',
        onOk: mostrarFormulario,
      })
    } else if (v.estado === 'solicitud') {
      pedirConfirmacion({
        titulo: '¿Resolver esta solicitud?',
        texto: 'Dejará de contar como pedido de producto y pasará a resueltos, ligada a la lección que elijas. Hazlo solo si la plataforma ya hace lo que pedían.',
        okTexto: 'Sí, resolver',
        onOk: mostrarFormulario,
      })
    } else if (v.estado === 'incidente') {
      pedirConfirmacion({
        titulo: '¿Resolver este incidente con una FAQ?',
        texto: 'Un incidente se arregla en la plataforma, no escribiendo contenido. Resolverlo acá solo tiene sentido si lo que faltaba era explicar cómo evitarlo.',
        okTexto: 'Sí, resolver con una FAQ',
        onOk: mostrarFormulario,
      })
    } else {
      pedirConfirmacion({
        titulo: '¿Reabrir este vacío?',
        texto: 'Resolverlo lo saca de descartados (se pierde el motivo del descarte) y reinicia su contador de preguntas desde el cierre.',
        okTexto: 'Sí, reabrir y resolver',
        onOk: mostrarFormulario,
      })
    }
  })

  if (v.estado === 'resuelto') {
    document.getElementById('gapIrLecciones').addEventListener('click', () => {
      // admin-gaps no puede importar a admin.js (ciclo): se usa el mismo botón del
      // sidebar que usaría la persona.
      document.querySelector('.admin-nav[data-panel="lessons"]')?.click()
    })
    wireDescartar(v, {
      titulo: '¿Descartar un vacío resuelto?',
      texto: 'Descartarlo lo desliga de la lección y reinicia el contador de reincidencia: dejará de aparecer en "Resueltos que siguen preguntándose".',
      okTexto: 'Sí, descartar',
    })
  }
}

// ── Descartar ────────────────────────────────────────────────────────────────

const MOTIVOS = {
  no_aplica: 'No aplica',
  es_soporte: 'Es soporte, no academia',
  duplicado: 'Duplicado de otro vacío',
  ruido: 'Ruido',
}

// Un código desconocido se muestra tal cual en vez de esconderse: mejor ver
// "otro_motivo" que una celda vacía.
function motivoLegible(codigo) {
  if (!codigo) return 'sin motivo registrado'
  return MOTIVOS[codigo] || codigo
}

// `confirmar` (opcional) pide confirmación antes de mostrar el formulario.
function wireDescartar(vacio, confirmar) {
  const box = document.getElementById('gapDescartarBox')
  const mostrar = () => {
    box.classList.remove('hidden')
    box.innerHTML = `
      <div class="bg-white border border-[var(--blue-10)] rounded-xl p-3 flex flex-col gap-1.5">
        <h3 class="text-xs font-black text-[var(--black-60)]">Descartar sin crear contenido</h3>
        <select id="gapMotivo" class="w-full px-2 py-1.5 rounded-lg border border-[var(--blue-20)] text-xs outline-none">
          ${Object.entries(MOTIVOS).map(([k, t]) =>
            `<option value="${escapeHtml(k)}">${escapeHtml(t)}</option>`).join('')}
        </select>
        <input id="gapNota" placeholder="Nota (opcional)"
          class="w-full px-2 py-1.5 rounded-lg border border-[var(--blue-20)] text-xs outline-none">
        <p id="gapDescartarMsg" class="text-xs hidden"></p>
        <button id="gapDescartarOk" class="px-3 py-2 rounded-xl text-xs font-bold bg-[var(--black-60)] text-white">
          Descartar este vacío
        </button>
      </div>`

    document.getElementById('gapDescartarOk').addEventListener('click', async () => {
      const motivo = document.getElementById('gapMotivo').value
      const nota = document.getElementById('gapNota').value.trim() || null
      const btn = document.getElementById('gapDescartarOk')
      btn.disabled = true
      try {
        await descartarVacio(vacio.id, motivo, nota)
      } catch (e) {
        btn.disabled = false
        const m = document.getElementById('gapDescartarMsg')
        m.textContent = `No se pudo descartar: ${e.message}`
        m.className = 'text-xs text-[var(--error-100)]'
        return
      }
      // El motivo no es burocracia: a los dos meses dice si el detector genera
      // basura y de qué tipo.
      logActivity('update', 'bot_vacio', vacio.titulo, { accion: 'descartado', motivo })
      renderGapsPanel()
      refreshGapsBadge()
    })
  }
  document.getElementById('gapDescartarBtn').addEventListener('click', () =>
    confirmar ? pedirConfirmacion({ ...confirmar, onOk: mostrar }) : mostrar())
}

// ── Solicitud / Incidente ───────────────────────────────────────────────────

// Las dos marcas que NO son descartes: el bot respondió bien, pero el vacío es
// señal. Comparten caja y mecánica porque la diferencia no es técnica sino de
// quién lo lee: Producto una, Soporte la otra.
const MARCAS = {
  solicitud: {
    btnId: 'gapSolicitudBtn',
    titulo: 'Marcar como solicitud de producto',
    explicacion: 'El bot ya responde bien esto; queda registrado como algo que los clientes piden y la plataforma no hace. No desaparece: va a la pestaña Solicitudes.',
    placeholder: 'Cómo funciona hoy (opcional) — ej. se gestiona por Soporte',
    okTexto: 'Registrar como solicitud',
    rpc: marcarSolicitud,
  },
  incidente: {
    btnId: 'gapIncidenteBtn',
    titulo: 'Marcar como incidente de soporte',
    explicacion: 'No falta contenido ni es un pedido de producto: algo no está funcionando. Va a la pestaña Incidentes, donde se ve qué se repite y en cuántos comercios.',
    placeholder: 'Qué falla (opcional) — ej. el datáfono no reconoce la clave',
    okTexto: 'Registrar como incidente',
    rpc: marcarIncidente,
  },
}

// `estado` es la clave de MARCAS. Reusa la caja de descartar, igual que antes:
// solo una de las tres puede estar abierta a la vez, que es lo correcto.
function wireMarca(vacio, estado) {
  const cfg = MARCAS[estado]
  const btn = document.getElementById(cfg.btnId)
  if (!btn) return
  const box = document.getElementById('gapDescartarBox')

  btn.addEventListener('click', () => {
    box.classList.remove('hidden')
    box.innerHTML = `
      <div class="bg-white border border-[var(--blue-10)] rounded-xl p-3 flex flex-col gap-1.5">
        <h3 class="text-xs font-black text-[var(--black-60)]">${escapeHtml(cfg.titulo)}</h3>
        <p class="text-[11px] text-[var(--black-40)]">${escapeHtml(cfg.explicacion)}</p>
        <input id="gapMarcaNota" placeholder="${escapeHtml(cfg.placeholder)}"
          class="w-full px-2 py-1.5 rounded-lg border border-[var(--blue-20)] text-xs outline-none">
        <p id="gapMarcaMsg" class="text-xs hidden"></p>
        <button id="gapMarcaOk" class="px-3 py-2 rounded-xl text-xs font-bold bg-[var(--blue-100)] text-white">
          ${escapeHtml(cfg.okTexto)}
        </button>
      </div>`

    document.getElementById('gapMarcaOk').addEventListener('click', async () => {
      const nota = document.getElementById('gapMarcaNota').value.trim() || null
      const ok = document.getElementById('gapMarcaOk')
      ok.disabled = true
      try {
        const { data: { user } } = await supabase.auth.getUser()
        await cfg.rpc(vacio.id, nota, user?.email || null)
      } catch (e) {
        ok.disabled = false
        const m = document.getElementById('gapMarcaMsg')
        m.textContent = `No se pudo marcar: ${e.message}`
        m.className = 'text-xs text-[var(--error-100)]'
        return
      }
      logActivity('update', 'bot_vacio', vacio.titulo, { accion: estado })
      renderGapsPanel()
      refreshGapsBadge()
    })
  })
}

// ── Dividir ──────────────────────────────────────────────────────────────────

// Los tres motivos que devuelve validarDivision (y que lanza la RPC con el mismo
// nombre), dichos de forma que una persona sepa qué hacer.
const MOTIVOS_DIVISION = {
  seleccion_vacia: 'Selecciona al menos una pregunta.',
  seleccion_total: 'Seleccionaste todas: eso no divide nada y dejaría este vacío sin preguntas. Si lo que está mal es el título, edítalo.',
  pregunta_ajena: 'Alguna pregunta ya no pertenece a este vacío. Vuelve a la bandeja y recárgala.',
}

// Las RPCs lanzan el código tal cual ('seleccion_total'); gaps-api lo envuelve
// como "dividir_vacio: seleccion_total". Si trae un código conocido, se
// traduce; si no, se muestra el mensaje crudo en vez de esconderlo.
function explicarError(motivos, e) {
  const msg = String(e?.message ?? e)
  const codigo = Object.keys(motivos).find(k => msg.includes(k))
  return codigo ? motivos[codigo] : msg
}

function wireDividir(vacio) {
  const bar = document.getElementById('gapSplitBar')
  const seleccion = () =>
    [...document.querySelectorAll('.gap-pregunta:checked')].map(c => c.value)

  const pintarBarra = () => {
    const ids = seleccion()
    if (ids.length === 0) { bar.classList.add('hidden'); return }

    // Se valida en el CLIENTE antes de llamar. La RPC rechaza lo mismo y es la
    // que manda (es transaccional), pero explicar el motivo acá evita un viaje
    // perdido y, sobre todo, evita que el usuario no entienda el rechazo.
    const v = validarDivision(vacioAbierto.preguntas, ids)

    // Marcar otra casilla repinta la barra: sin esto se perdería el título que
    // la persona ya estaba escribiendo.
    const tituloPrevio = document.getElementById('gapSplitTitulo')?.value ?? ''

    bar.classList.remove('hidden')
    bar.innerHTML = v.ok
      ? `<div class="flex items-center gap-2 flex-wrap">
           <input id="gapSplitTitulo" placeholder="Título del vacío nuevo (opcional)"
             class="flex-1 min-w-[160px] px-2 py-1.5 rounded-lg border border-[var(--blue-20)] text-xs outline-none">
           <button id="gapSplitOk" class="px-3 py-2 rounded-xl text-xs font-bold bg-amber-100 text-amber-700">
             Mover ${ids.length} a un vacío nuevo
           </button>
           <span id="gapSplitMsg" class="text-xs"></span>
         </div>`
      : `<p class="text-xs text-[var(--error-100)]">${escapeHtml(MOTIVOS_DIVISION[v.motivo] || 'No se puede dividir así.')}</p>`

    if (!v.ok) return
    document.getElementById('gapSplitTitulo').value = tituloPrevio
    document.getElementById('gapSplitOk').addEventListener('click', async () => {
      const titulo = document.getElementById('gapSplitTitulo').value.trim()
      const btn = document.getElementById('gapSplitOk')
      btn.disabled = true
      let nuevoId
      try {
        nuevoId = await dividirVacio(vacio.id, ids, titulo)
      } catch (e) {
        btn.disabled = false
        const m = document.getElementById('gapSplitMsg')
        m.textContent = `No se pudo dividir: ${explicarError(MOTIVOS_DIVISION, e)}`
        m.className = 'text-xs text-[var(--error-100)]'
        return
      }
      // 'move' ("Movió") ya existe en actionBadge (js/admin.js): la división
      // queda auditada sin inventar un tipo de acción nuevo.
      logActivity('move', 'bot_vacio', vacio.titulo,
        { desde: vacio.id, hacia: nuevoId, preguntas: ids.length })
      refreshGapsBadge()   // el vacío nuevo nace pendiente: el contador cambió
      abrirDetalle(vacio.id)   // recargar: los contadores cambiaron en ambos lados
    })
  }

  document.querySelectorAll('.gap-pregunta').forEach(c =>
    c.addEventListener('change', pintarBarra))
}

// ── Fusionar ─────────────────────────────────────────────────────────────────

// El espejo de dividir, con una asimetría que importa: el vacío abierto es el
// ORIGEN y DESAPARECE. El destino conserva título, categoría y ancla.

const ETIQUETA_ESTADO = {
  pendiente: 'Pendiente', solicitud: 'Solicitud', incidente: 'Incidente',
  resuelto: 'Resuelto', descartado: 'Descartado',
}

const MOTIVOS_FUSION = {
  sin_destino: 'Elige primero el vacío destino.',
  mismo_vacio: 'Ese es este mismo vacío.',
  origen_resuelto: 'Este vacío está resuelto. Fusiónalos al revés — abre el otro y muévelo hacia este — o se perdería la lección con la que se resolvió.',
  destino_inexistente: 'El vacío destino ya no existe. Vuelve a la bandeja y recárgala.',
  vacio_inexistente: 'Uno de los dos vacíos ya no existe. Vuelve a la bandeja y recárgala.',
}

function wireFusionar(vacio) {
  // No se pinta para un vacío resuelto: sería el origen, y la RPC lo rechaza
  // para no perder su enlace a la lección.
  const btn = document.getElementById('gapFusionBtn')
  if (!btn) return
  const box = document.getElementById('gapFusionBox')

  btn.addEventListener('click', async () => {
    btn.disabled = true
    box.classList.remove('hidden')
    box.innerHTML = `<p class="text-xs text-[var(--black-40)]">Cargando los demás vacíos…</p>`

    let candidatos
    try {
      // estado null = TODOS los estados. Fusionar hacia un vacío ya resuelto es
      // válido y es justo lo que alimenta "resuelto pero siguen preguntando".
      candidatos = (await fetchVacios({ estado: null, limit: LIMITE_LISTA }))
        .filter(c => c.id !== vacio.id)
    } catch (e) {
      btn.disabled = false
      box.innerHTML = `<p class="text-xs text-[var(--error-100)]">No se pudo cargar la lista: ${escapeHtml(e.message)}</p>`
      return
    }

    if (!candidatos.length) {
      box.innerHTML = `<p class="text-xs text-[var(--black-40)]">No hay ningún otro vacío con el que fusionar.</p>`
      return
    }
    pintarCajaFusion(vacio, candidatos, box)
  })
}

function pintarCajaFusion(vacio, candidatos, box) {
  box.innerHTML = `
    <div class="bg-white border border-amber-200 rounded-xl p-3 flex flex-col gap-1.5">
      <h3 class="text-xs font-black text-amber-700">Fusionar con otro vacío</h3>
      <p class="text-[11px] text-[var(--black-40)]">
        Las ${escapeHtml(vacio.preguntas_total)} preguntas de este vacío se mueven al que elijas
        y este desaparece. El destino conserva su título, su categoría y su ancla.
      </p>
      <select id="gapFusionDestino" class="w-full px-2 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-xs outline-none focus:border-amber-400">
        <option value="">Elige el vacío destino…</option>
        ${candidatos.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.titulo)} — ${escapeHtml(c.preguntas_total)} preguntas · ${escapeHtml(ETIQUETA_ESTADO[c.estado] || c.estado)}</option>`).join('')}
      </select>
      <div id="gapFusionAvisos" class="flex flex-col gap-1"></div>
      <p id="gapFusionMsg" class="text-xs hidden"></p>
      <button id="gapFusionOk" disabled
        class="px-3 py-2 rounded-xl text-xs font-bold bg-amber-100 text-amber-700 self-start">Mover las preguntas</button>
    </div>`

  const sel = document.getElementById('gapFusionDestino')
  const ok = document.getElementById('gapFusionOk')
  const elegido = () => candidatos.find(c => c.id === sel.value) || null

  sel.addEventListener('change', () => {
    const destino = elegido()
    const v = validarFusion(vacio, destino)
    const msg = document.getElementById('gapFusionMsg')
    ok.disabled = !v.ok
    ok.textContent = v.ok
      ? `Mover ${vacio.preguntas_total} preguntas a «${destino.titulo}»`
      : 'Mover las preguntas'

    // Nada seleccionado no es un error, es el estado inicial.
    if (v.ok || !sel.value) {
      msg.className = 'text-xs hidden'
    } else {
      msg.textContent = MOTIVOS_FUSION[v.motivo] || 'No se puede fusionar así.'
      msg.className = 'text-xs text-[var(--error-100)]'
    }

    // Los avisos no impiden fusionar: dicen qué se pierde, antes del clic.
    document.getElementById('gapFusionAvisos').innerHTML = (v.ok ? avisosFusion(vacio, destino) : [])
      .map(a => `<p class="text-[11px] text-[var(--warning-150)]">⚠ ${escapeHtml(a)}</p>`).join('')
  })

  // Confirmación aparte, al contrario que dividir: dividir se deshace
  // fusionando, pero fusionar borra el vacío origen con su título y su marca, y
  // eso no vuelve con un botón.
  ok.addEventListener('click', () => {
    const destino = elegido()
    if (!validarFusion(vacio, destino).ok) return
    pedirConfirmacion({
      titulo: '¿Fusionar estos dos vacíos?',
      texto: `«${vacio.titulo}» desaparece y sus ${vacio.preguntas_total} preguntas pasan a «${destino.titulo}». Para deshacerlo habría que volver a dividirlo a mano.`,
      okTexto: 'Sí, fusionar',
      onOk: () => ejecutarFusion(vacio, destino, ok),
    })
  })
}

async function ejecutarFusion(vacio, destino, btn) {
  btn.disabled = true
  try {
    await fusionarVacios(vacio.id, destino.id)
  } catch (e) {
    btn.disabled = false
    const msg = document.getElementById('gapFusionMsg')
    msg.textContent = `No se pudo fusionar: ${explicarError(MOTIVOS_FUSION, e)}`
    msg.className = 'text-xs text-[var(--error-100)]'
    return
  }
  // 'move' ("Movió") ya existe en actionBadge (js/admin.js). Se guarda el
  // título del origen porque su fila ya no existe para consultarlo.
  logActivity('move', 'bot_vacio', vacio.titulo,
    { accion: 'fusionado', hacia: destino.id, hacia_titulo: destino.titulo,
      preguntas: vacio.preguntas_total })
  refreshGapsBadge()
  // Se abre el DESTINO: el origen ya no existe, y el resultado de la fusión es
  // lo único que tiene sentido mirar ahora.
  abrirDetalle(destino.id)
}

// De qué comercio vino esta pregunta. El id completo va en el `title` porque
// es lo que Soporte pega en su buscador; en pantalla iría cortando el renglón.
function comercioHtml(p) {
  const c = etiquetaComercio(p)
  const color = c.identificado ? 'text-[var(--black-60)]' : 'text-[var(--black-40)]'
  const title = c.completo ? ` title="${escapeHtml(c.completo)}"` : ''
  return `<p class="text-[10px] ${color} mt-1 ml-6"${title}>🏪 ${escapeHtml(c.texto)}</p>`
}

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
    ${comercioHtml(p)}
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

  btn.disabled = true
  let res
  let formulario = null
  if (cierrePendiente) {
    btn.textContent = 'Cerrando...'
    const { vacioId, leccionId, pregunta } = cierrePendiente
    res = await cerrarVacio(vacioId, leccionId, pregunta)
  } else {
    const leccionId = document.getElementById('gapLeccion').value
    if (!leccionId) {
      btn.disabled = false
      mostrarMsg('Elige la lección destino.', true)
      return
    }
    // Se toma la foto del formulario ANTES de escribir: si el cierre falla hay
    // que poder repintarlo congelado aunque la persona navegue y vuelva.
    formulario = {
      leccionId,
      pregunta: document.getElementById('gapPregunta').value,
      variaciones: document.getElementById('gapVariaciones').value,
      respuesta: document.getElementById('gapRespuesta').value,
      mostrarAcordeon: document.getElementById('gapAcordeon').checked,
    }
    btn.textContent = 'Guardando...'
    res = await guardarResolucion({ vacioId: vacioAbierto.vacio.id, ...formulario })
  }
  btn.disabled = false

  if (res.soloFaltaCerrar) {
    // La FAQ ya está en la lección: congelar el formulario y ofrecer solo cerrar.
    // Se conserva el `formulario` de la primera vez: en un segundo fallo del
    // reintento no hay formulario nuevo que fotografiar.
    cierrePendiente = {
      ...res.pendiente,
      formulario: formulario ?? cierrePendiente?.formulario ?? null,
      mensaje: res.error,
    }
    repintarCierrePendiente()
    return
  }

  if (res.error) {
    btn.textContent = 'Guardar y cerrar el vacío'
    mostrarMsg(res.error, true)
    return
  }
  cierrePendiente = null
  renderGapsPanel()
  refreshGapsBadge()
}

function mostrarMsg(texto, esError) {
  const msg = document.getElementById('gapMsg')
  msg.textContent = texto
  msg.className = `text-xs ${esError ? 'text-[var(--error-100)]' : 'text-[var(--success-150)]'}`
}

// El re-embebido termina cuando el panel ya puede haberse vuelto a pintar (o
// cuando el usuario está en otro panel), así que no usa #gapMsg ni un prepend:
// levanta la bandera `embedFallido` y, si la lista está en pantalla, pinta el
// aviso ahí mismo. Si no lo está, renderGapsPanel lo pintará la próxima vez.
function avisarEmbedFallido(leccion) {
  console.error('[gaps] el re-embebido de la lección falló:', leccion.id)
  embedFallido = { leccionId: leccion.id, titulo: leccion.titulo }
  const slot = document.getElementById('gapEmbedAviso')
  if (slot) pintarAvisoEmbed(slot)
}

function pintarAvisoEmbed(slot) {
  // El slot es un item de un contenedor flex con gap: aunque esté vacío, el gap
  // se aplica y mete 16px de más. Oculto, el flex lo ignora por completo.
  slot.hidden = !embedFallido
  if (!embedFallido) { slot.innerHTML = ''; return }
  slot.innerHTML = `<div class="border border-[var(--error-100)] rounded-xl p-3">
    <p class="text-xs font-black text-[var(--error-100)]">El bot aún no puede encontrar la FAQ que acabas de escribir</p>
    <p class="text-xs text-[var(--black-60)] mt-1">
      La FAQ quedó guardada en la lección «${escapeHtml(embedFallido.titulo)}», pero el
      re-embebido falló: el bot no podrá encontrarla hasta que se vuelva a embeber.
      Abre esa lección en el editor y guárdala, o usa "Re-embeber todo" en el panel de Lecciones.
    </p>
    <button id="gapEmbedDescartar" class="mt-2 text-xs font-bold text-[var(--blue-100)] hover:underline">Entendido, descartar aviso</button>
  </div>`
  document.getElementById('gapEmbedDescartar').addEventListener('click', () => {
    embedFallido = null
    renderGapsPanel()
  })
}

// Cierra el vacío. Devuelve { error } y, si falla, soloFaltaCerrar + lo que
// hace falta para reintentar: la lección YA se guardó, así que decirlo en vez
// de fingir que no pasó nada.
async function cerrarVacio(vacioId, leccionId, pregunta, extra = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    await resolverVacio(vacioId, leccionId, user?.email || '')
  } catch (e) {
    return {
      error: `La FAQ se guardó, pero el vacío no se pudo cerrar: ${e.message}. Usa "Reintentar cerrar el vacío"; no la vuelvas a escribir.`,
      soloFaltaCerrar: true,
      pendiente: { vacioId, leccionId, pregunta },
    }
  }
  logActivity('update', 'bot_vacio', pregunta, { leccion_id: leccionId, accion: 'resuelto', ...extra })
  return { error: null }
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

  // contenidoConFaq NO appendea a ciegas: si la lección ya tiene un bot_faq con
  // la misma pregunta (normalizada), lo reemplaza en su posición. Appendear
  // duplica la FAQ por cuatro caminos distintos, todos alcanzables: re-resolver
  // un vacío ya resuelto, dos admins con el mismo vacío abierto, un cierre
  // fallido seguido de navegación, o cerrar el navegador entre el UPDATE de
  // `lecciones` y el cierre del vacío. La lógica vive en gap-faq-block.js, con
  // tests.
  let contenido, reemplazada
  try {
    ;({ contenido, reemplazada } = contenidoConFaqInfo(leccion.contenido, bloque))
  } catch (e) {
    // Lanza cuando el parseo daría vacío teniendo contenido.
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

  // Re-embeber depende del UPDATE, no del cierre del vacío: sin esto el bot no
  // encuentra la FAQ recién escrita (match_lessons solo mira el embedding), que
  // es el objetivo entero de la bandeja. Va ANTES de cerrar para que un fallo al
  // cerrar no lo deje sin correr. No bloquea (el cierre no espera su resultado),
  // pero tampoco se traga el fallo: si el vacío se cierra bien, habrá salido de
  // la lista y nadie volvería a enterarse.
  embedLesson(leccion.id, leccion.titulo, leccion.categoria,
    JSON.parse(contenido), leccion.notas)
    .then(async ok => {
      if (ok) return
      avisarEmbedFallido(leccion)
      // Backstop durable: el indicador del panel de Lecciones cuenta las que
      // tienen embedding_updated_at nulo, así que esto hace que la lección
      // aparezca como "sin embedding actualizado" aunque se pierda el aviso o
      // se cierre el navegador. NO la esconde del bot: match_lessons solo mira
      // `embedding is not null`, así que sigue encontrable con su contenido
      // anterior, solo que marcada como pendiente de re-embeber.
      // .select('id') por la misma razón que arriba: un UPDATE bloqueado por RLS
      // no da error, devuelve 0 filas.
      const { data: marcadas, error } = await supabase.from('lecciones')
        .update({ embedding_updated_at: null }).eq('id', leccion.id).select('id')
      if (error) {
        console.error('[gaps] no se pudo marcar la lección como pendiente de embeber:', error.message)
      } else if (!marcadas || marcadas.length !== 1) {
        console.error('[gaps] el backstop durable NO quedó puesto: el UPDATE de embedding_updated_at no tocó exactamente una fila (¿RLS?). Lección:', leccion.id)
      }
    })
    .catch(e => console.error('[gaps] fallo tras el re-embebido:', e.message))

  // Queda en el registro si la FAQ reemplazó a una existente en vez de agregarse.
  return cerrarVacio(vacioId, leccionId, pregunta, reemplazada ? { faq_reemplazada: true } : {})
}
