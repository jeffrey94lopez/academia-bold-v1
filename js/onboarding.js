// js/onboarding.js — controlador de la página del recorrido guiado.
//
// Une las piezas puras: estado y reglas (onboarding-state), pasos
// (onboarding-steps), qué hace cada clic (onboarding-flow), pantallas
// (onboarding-screens), avance guardado (onboarding-progress), cierre con Bold
// (onboarding-bridge) y telemetría. Aquí solo queda lo que necesita el
// navegador: escuchar eventos, pintar, conservar el foco y los timers.

import { initBoldContext, onContextoBold, getContextoBold } from './bold-context.js'
import { storageGet, storageSet, storageRemove } from './storage.js'
import { crearEstadoInicial } from './onboarding-state.js'
import { subpasoActual, numeroPaso, TOTAL_PASOS } from './onboarding-steps.js'
import { cargarAvance, guardarAvance, adoptarCuenta } from './onboarding-progress.js'
import { cerrarRecorrido, irAMisItems } from './onboarding-bridge.js'
import { crearTelemetria } from './onboarding-telemetry.js'
import { renderPantalla } from './onboarding-screens.js'
import { t, AVISO_PRACTICA } from './onboarding-screens-ui.js'
import { mostrarBurbuja, ocultarBurbuja, botonSiguiente } from './onboarding-guide.js'
import * as flujo from './onboarding-flow.js'
import { setBotOrigin } from './bot-origin.js'

const io = { get: storageGet, set: storageSet, remove: storageRemove }
const stage = document.getElementById('onb-stage')

// Abierto desde el portal (Ayuda) navegando en el mismo iframe: al salir hay
// que volver al portal, no avisarle a Bold (ver onboarding-bridge.js).
const desdeAyuda = new URLSearchParams(location.search).get('desde') === 'ayuda'

// Ruling E: probando en local la telemetría no debe escribir filas en
// analytics_events (la base es compartida con producción).
const ES_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname)

const ANCHO_MINIMO = 1024

// Lecciones de Academia (retail, web) sobre lo que se practicó. Slugs reales
// tomados de docs/links-lecciones.csv; si una se renombra, el link cae en el
// portal sin abrir lección, no rompe nada.
const LECCIONES = [
  { slug: 'creacion-de-items-de-forma-individual', titulo: 'Creación de ítems de forma individual' },
  { slug: 'venta-por-medio-de-factura-electronica', titulo: 'Venta por medio de factura electrónica' },
  { slug: 'registro-de-gastos', titulo: 'Registro de gastos' },
  { slug: 'ajuste-de-inventario', titulo: 'Ajuste de inventario' },
]

function nuevoRunId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  // Contexto no seguro (http fuera de localhost): basta con que no se repita.
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function trackLocal(evento, payload) {
  console.debug('[onboarding] telemetría (local, no se envía):', evento, payload)
}

// analytics.js trae el cliente de Supabase desde un CDN: se carga recién al
// primer evento para que, si falla, el recorrido igual funcione.
function trackReal(evento, payload) {
  import('./analytics.js')
    .then(m => m.track(evento, payload))
    .catch(err => console.error('[onboarding] telemetría:', err))
}

// ── Arranque ────────────────────────────────────────────────────────────────

initBoldContext()
let cuenta = getContextoBold()?.accountId ?? null
const cargado = cargarAvance(io, cuenta)
let estado = cargado ?? crearEstadoInicial(nuevoRunId())

const telemetria = crearTelemetria({
  track: ES_LOCAL ? trackLocal : trackReal,
  getRunId: () => estado.runId,
  getAccountId: () => cuenta,
})

// En la bienvenida todavía no hay nada que retomar.
if (cargado && !cargado.completed && cargado.step !== 'bienvenida') telemetria.retomo(cargado.step)
guardar()

let errores = {}
// Pantalla propia que tapa al recorrido: null | { tipo: 'angosta' } |
// { tipo: 'no-aplica', suelto } | { tipo: 'cerrado', reason }
let especial = window.innerWidth < ANCHO_MINIMO && !estado.completed ? { tipo: 'angosta' } : null

onContextoBold(ctx => {
  if (ctx.accountId && ctx.accountId !== cuenta) {
    cuenta = ctx.accountId
    const antes = estado
    estado = adoptarCuenta(io, cuenta, estado)
    if (estado !== antes) {
      // Ganó el avance que la cuenta ya tenía guardado (de otra sesión).
      if (!estado.completed && estado.step !== 'bienvenida') telemetria.retomo(estado.step)
      errores = {}
      render()
    }
  }
  if (ctx.vertical === 'restaurantes' && estado.step === 'bienvenida' && especial?.tipo !== 'no-aplica') {
    noAplica()
  }
})

function guardar() {
  guardarAvance(io, cuenta, estado)
}

// ── Cambios de estado ───────────────────────────────────────────────────────

function aplicar(nuevo, opciones = {}) {
  const antes = estado
  const { estado: siguiente, eventos } = flujo.transicion(antes, nuevo)
  estado = siguiente
  for (const ev of eventos) {
    if (ev.tipo === 'fin') telemetria.fin()
    else telemetria.pasoCompleto(ev.step)
  }
  if (flujo.pantallaActual(antes) !== flujo.pantallaActual(estado)) errores = {}
  guardar()
  render(opciones)
}

// Un re-render en medio de un clic reemplaza el botón entre mousedown y
// mouseup, y el navegador ya no dispara el click. Lo que se dispara al salir
// de un campo (change) espera a que el puntero se suelte; también espera un
// tick para que el foco ya esté en el campo siguiente cuando se restaure.
let punteroAbajo = false
let diferido = null
document.addEventListener('pointerdown', () => { punteroAbajo = true }, true)
const soltar = () => setTimeout(() => { punteroAbajo = false; correrDiferido() }, 0)
document.addEventListener('pointerup', soltar, true)
document.addEventListener('pointercancel', soltar, true)

function programar(fn) {
  diferido = fn
  if (!punteroAbajo) setTimeout(correrDiferido, 0)
}

function correrDiferido() {
  if (punteroAbajo || !diferido) return
  const fn = diferido
  diferido = null
  fn()
}

// ── Pintado ─────────────────────────────────────────────────────────────────

function actualizarBarra() {
  const paso = document.getElementById('onb-paso')
  const relleno = document.getElementById('onb-progreso-relleno')
  const barra = document.getElementById('onb-progreso')
  const saltar = document.getElementById('onb-saltar')
  const n = numeroPaso(estado.step)
  paso.textContent = n !== null ? `Paso ${n} de ${TOTAL_PASOS}`
    : estado.step === 'cierre' ? '¡Recorrido completo!' : 'Bienvenida'
  const pct = Math.round(flujo.progreso(estado) * 100)
  relleno.style.width = `${pct}%`
  barra.setAttribute('aria-valuenow', String(pct))
  // Ya cerrado (o sin recorrido para su vertical) no hay nada que saltar.
  saltar.hidden = especial?.tipo === 'cerrado' || especial?.tipo === 'no-aplica'
  saltar.textContent = estado.step === 'cierre' ? 'Cerrar recorrido' : 'Saltar recorrido'
}

function recordarFoco() {
  const a = document.activeElement
  if (!a || !stage.contains(a)) return null
  const name = a.getAttribute('name')
  if (!name) return null
  let ini = null
  let fin = null
  try { ini = a.selectionStart; fin = a.selectionEnd } catch {}
  return { name, idx: a.dataset.idx ?? null, ini, fin }
}

function restaurarFoco(f) {
  if (!f) return false
  const sel = `[name="${CSS.escape(f.name)}"]` + (f.idx !== null ? `[data-idx="${CSS.escape(f.idx)}"]` : '')
  const el = stage.querySelector(sel)
  if (!el || el.disabled) return false
  el.focus({ preventScroll: true })
  try { if (f.ini !== null) el.setSelectionRange(f.ini, f.fin) } catch {}
  return true
}

function render({ tope = false, aviso = '' } = {}) {
  // Todo cambio de paso pasa por aquí (aplicar, adoptar la cuenta, arranque):
  // el bot siempre manda el paso en que va el usuario, no uno viejo.
  setBotOrigin('onboarding', estado.step)
  actualizarBarra()
  if (especial) {
    ocultarBurbuja()
    stage.innerHTML = pantallaEspecial(especial)
    return
  }
  const pantalla = flujo.pantallaActual(estado)
  if (pantalla === 'bienvenida' || pantalla === 'cierre') {
    ocultarBurbuja()
    stage.innerHTML = pantalla === 'bienvenida' ? bienvenida() : cierre()
    return
  }
  const foco = recordarFoco()
  // topeAlcanzado solo vive en este pintado (ver aplicarAccion).
  const vista = tope ? { ...estado, topeAlcanzado: true } : estado
  stage.innerHTML = renderPantalla(pantalla, vista, errores, estado.borrador ?? {})
  const restaurado = restaurarFoco(foco)

  const s = subpasoActual(estado)
  if (!s) { ocultarBurbuja(); return }
  let avisoBurbuja = aviso
  if (tope && estado.item) {
    avisoBurbuja = `No hay más existencias: solo tienes ${estado.item.existencias} unidades de este ítem.`
  }
  mostrarBurbuja(stage, s.ancla, s.texto, {
    conSiguiente: s.avanza === 'info',
    onSiguiente: () => aplicar(flujo.siguiente(estado, s.ancla)),
    aviso: avisoBurbuja,
  })
  if (restaurado) return
  // Sin foco previo: llevarlo a lo que pide la burbuja, para seguir con el teclado.
  if (s.avanza === 'campo') stage.querySelector(`[name="${CSS.escape(s.ancla)}"]`)?.focus({ preventScroll: true })
  else if (s.avanza === 'info') botonSiguiente()?.focus({ preventScroll: true })
}

function toast(texto) {
  const cont = document.getElementById('onb-toasts')
  const el = document.createElement('div')
  el.className = 'onb-toast'
  el.setAttribute('role', 'status')
  el.textContent = texto
  cont.append(el)
  setTimeout(() => el.remove(), 3500)
}

// ── Pantallas propias del recorrido ─────────────────────────────────────────

const LOGO = '<span class="onb-logo" aria-label="bold">b<span class="onb-logo-o">o</span>ld</span>'

function tarjeta(contenido) {
  return `<section class="onb-especial"><div class="onb-especial-card">${LOGO}${contenido}</div></section>`
}

function bienvenida() {
  const aprende = [
    'Crear tu primer ítem', 'Encontrarlo en tu lista de productos', 'Hacer una venta',
    'Registrar un gasto', 'Ver tu historial de ventas', 'Ver el historial de tu inventario',
  ]
  return tarjeta(`
  <h1 class="onb-especial-titulo">Aprende a usar Bold POS en unos 5 minutos</h1>
  <p class="onb-especial-texto">Vas a practicar en una copia de Bold POS: tú haces los clics y escribes tus datos, y una guía te dice qué tocar en cada momento.</p>
  <ol class="onb-especial-lista">${aprende.map(a => `<li>${t(a)}</li>`).join('')}</ol>
  <p class="onb-especial-practica">${t(AVISO_PRACTICA)}</p>
  <div class="onb-especial-botones">
    <button type="button" class="onb-btn onb-btn-primario" data-action="empezar">Empezar</button>
    <button type="button" class="onb-btn onb-btn-secundario" data-action="saltar">Saltar recorrido</button>
  </div>`)
}

function cierre() {
  const frases = flujo.resumenCierre(estado)
  const resumen = frases.length
    ? `<ul class="onb-especial-lista onb-especial-check">${frases.map(f => `<li>${t(f)}</li>`).join('')}</ul>`
    : ''
  const lecciones = LECCIONES.map(l =>
    `<li><a class="onb-especial-link" href="/?leccion=${encodeURIComponent(l.slug)}">${t(l.titulo)}</a></li>`).join('')
  return tarjeta(`
  <h1 class="onb-especial-titulo">¡Lo lograste! Ya conoces lo básico de Bold POS</h1>
  ${resumen}
  <p class="onb-especial-practica">Recuerda: esto fue una práctica, nada se guardó en tu cuenta. Ahora hazlo de verdad en tu Bold POS.</p>
  <div class="onb-especial-botones">
    <button type="button" class="onb-btn onb-btn-primario" data-action="crear-de-verdad">Crear mi primer producto de verdad</button>
  </div>
  <h2 class="onb-especial-sub">Sigue aprendiendo en Academia Bold</h2>
  <ul class="onb-especial-lecciones">${lecciones}</ul>`)
}

function pantallaEspecial(e) {
  if (e.tipo === 'angosta') {
    return tarjeta(`
  <h1 class="onb-especial-titulo">Este recorrido se ve mejor en computador</h1>
  <p class="onb-especial-texto">La práctica copia la pantalla de Bold POS para computador. En una pantalla angosta puede verse apretada.</p>
  <div class="onb-especial-botones">
    <button type="button" class="onb-btn onb-btn-primario" data-action="continuar-igual">Continuar igual</button>
    <button type="button" class="onb-btn onb-btn-secundario" data-action="saltar">Saltar recorrido</button>
  </div>`)
  }
  if (e.tipo === 'no-aplica') {
    const pie = desdeAyuda
      ? '<div class="onb-especial-botones"><button type="button" class="onb-btn onb-btn-primario" data-action="volver-academia">Volver a Academia</button></div>'
      : e.suelto ? '<p class="onb-especial-texto">Ya puedes cerrar esta ventana.</p>' : ''
    return tarjeta(`
  <h1 class="onb-especial-titulo">Pronto tendremos tu recorrido</h1>
  <p class="onb-especial-texto">Esta práctica guiada es para tiendas (retail). Estamos preparando la de restaurantes; mientras tanto, en Academia Bold encuentras lecciones para tu negocio.</p>
  ${pie}`)
  }
  // cerrado
  const texto = e.reason === 'complete'
    ? 'Ya puedes cerrar esta ventana. En tu Bold POS entra a Ítems → Lista de ítems para crear tu primer producto de verdad.'
    : 'Ya puedes cerrar esta ventana. Puedes retomar el recorrido desde Ayuda.'
  return tarjeta(`
  <h1 class="onb-especial-titulo">${e.reason === 'complete' ? '¡Listo!' : 'Recorrido en pausa'}</h1>
  <p class="onb-especial-texto">${t(texto)}</p>
  <div class="onb-especial-botones">
    <button type="button" class="onb-btn onb-btn-secundario" data-action="volver-recorrido">Volver al recorrido</button>
  </div>`)
}

// ── Acciones de la página (fuera de la réplica) ─────────────────────────────

function salir(reason) {
  const resultado = cerrarRecorrido(window, reason, { desdeAyuda })
  // 'portal' ya está navegando. Con 'mensaje', si Bold todavía no escucha el
  // cierre, el modal no se va: la pantalla le dice al cliente qué hacer.
  if (resultado !== 'portal') {
    especial = { tipo: 'cerrado', reason }
    render()
  }
}

function saltar() {
  if (estado.step === 'cierre') { salir('complete'); return }
  telemetria.salto(estado.step)
  guardar()
  salir('skip')
}

function noAplica() {
  especial = { tipo: 'no-aplica', suelto: false }
  if (!desdeAyuda) especial.suelto = cerrarRecorrido(window, 'no_aplica') === 'suelto'
  render()
}

const ACCIONES_PAGINA = {
  'empezar': () => { telemetria.inicio(); aplicar(flujo.empezar(estado)) },
  'saltar': saltar,
  'continuar-igual': () => { especial = null; render() },
  'volver-recorrido': () => { especial = null; render() },
  'volver-academia': () => cerrarRecorrido(window, 'no_aplica', { desdeAyuda }),
  'crear-de-verdad': () => { irAMisItems(window); salir('complete') },
}

document.getElementById('onb-saltar').addEventListener('click', saltar)

// ── BolBot ──────────────────────────────────────────────────────────────────
// assistant.js y settings.js importan el cliente de Supabase desde un CDN: con
// import estático, si el CDN falla se cae TODO este módulo y con él el
// recorrido. Dinámicos, lo peor que pasa es que el botón del bot no aparece.

const botBtn = document.getElementById('onb-bot-btn')
const botPanel = document.getElementById('onb-bot-panel')
let botCargado = null

function abrirBot() {
  botPanel.hidden = false
  document.body.classList.add('onb-con-bot')
  botBtn.setAttribute('aria-expanded', 'true')
  telemetria.botAbierto(estado.step)
  // Se dibuja solo en #section-assistant al importarse. Hasta el primer clic
  // no se carga: quien no abre el bot no paga las consultas de FAQs y chips.
  botCargado ??= import('./assistant.js').catch(err => {
    botCargado = null
    console.error('[onboarding] no se pudo cargar BolBot:', err)
  })
  botCargado.then(enfocarChat)
  // El escenario se angostó: la guía escucha resize para reubicar el foco y la burbuja.
  window.dispatchEvent(new Event('resize'))
}

// El import resuelve antes de que el chat exista: renderAssistant espera las
// sugerencias y los toggles. La primera vez se espera a que aparezca el campo.
function enfocarChat() {
  const cont = document.getElementById('section-assistant')
  const enfocar = () => {
    const input = document.getElementById('chatInput')
    if (input && !botPanel.hidden) input.focus({ preventScroll: true })
    return !!input
  }
  if (enfocar()) return
  const obs = new MutationObserver(() => { if (enfocar()) obs.disconnect() })
  obs.observe(cont, { childList: true })
}

function cerrarBot() {
  if (botPanel.hidden) return
  botPanel.hidden = true
  document.body.classList.remove('onb-con-bot')
  botBtn.setAttribute('aria-expanded', 'false')
  window.dispatchEvent(new Event('resize'))
  botBtn.focus({ preventScroll: true })
}

botBtn.addEventListener('click', () => (botPanel.hidden ? abrirBot() : cerrarBot()))
document.getElementById('onb-bot-cerrar').addEventListener('click', cerrarBot)
botPanel.addEventListener('keydown', ev => { if (ev.key === 'Escape') cerrarBot() })

// Misma convención que el portal (main.js): solo un 'false' explícito apaga el
// bot; si la lectura falla, queda visible.
import('./settings.js')
  .then(m => m.loadSettings(['bot_enabled']))
  .then(s => { if (s.bot_enabled !== 'false') botBtn.hidden = false })
  .catch(err => console.error('[onboarding] no se pudo leer bot_enabled:', err))

// ── Eventos de la réplica ───────────────────────────────────────────────────

stage.addEventListener('click', ev => {
  const el = ev.target.closest('[data-action]')
  if (!el || !stage.contains(el)) return
  const accion = el.dataset.action
  // El change del campo que se acaba de dejar va primero; si quedara para
  // después, su re-pintado borraría el aviso que deje este clic.
  if (diferido) { const fn = diferido; diferido = null; fn() }
  if (ACCIONES_PAGINA[accion]) { ACCIONES_PAGINA[accion](); return }

  const r = flujo.aplicarAccion(estado, accion, { ...el.dataset })
  if (r.errores !== undefined) errores = r.errores
  if (r.toast) toast(r.toast)
  let aviso = r.aviso ?? ''
  if (!aviso && r.errores && Object.keys(r.errores).length) {
    aviso = 'Te faltan datos: revisa los campos marcados en rojo.'
  }
  if (r.estado === estado && r.errores === undefined && !r.tope) {
    // Nada cambió: solo repetir la burbuja con el aviso, sin re-pintar.
    if (aviso) render({ aviso })
    return
  }
  aplicar(r.estado, { tope: r.tope, aviso })
})

stage.addEventListener('input', ev => {
  const el = ev.target
  if (el.dataset?.action === 'cambiar-cantidad') {
    const nuevo = flujo.escribirCantidad(estado, Number(el.dataset.idx), el.value)
    if (nuevo !== estado) aplicar(nuevo)
    return
  }
  const name = el.getAttribute?.('name')
  if (!name) return
  estado = flujo.escribirCampo(estado, name, el.value)
  guardar()
  // Corregido el campo, su error se va sin esperar a "Crear".
  const clave = flujo.claveError(name)
  if (clave && errores[clave] && flujo.campoValido(name, el.value)) {
    errores = { ...errores }
    delete errores[clave]
    el.classList.remove('onb-input-error')
    el.closest('.onb-campo')?.querySelector('.onb-error')?.remove()
  }
  // Mientras escribe no se re-pinta (se perdería el change al salir del
  // campo); solo se actualiza lo calculado.
  const total = stage.querySelector('[data-onb="f-total"]')
  if (total) total.textContent = flujo.precioTotalBorrador(estado.borrador)
})

stage.addEventListener('change', ev => {
  const el = ev.target
  const name = el.getAttribute?.('name')
  if (!name || el.dataset?.action === 'cambiar-cantidad') return
  estado = flujo.escribirCampo(estado, name, el.value)
  programar(() => aplicar(flujo.confirmarCampo(estado, name)))
})

stage.addEventListener('keydown', ev => {
  const el = ev.target
  if (ev.key !== 'Enter' || el.tagName !== 'INPUT') return
  const name = el.getAttribute('name')
  if (!name || el.dataset.action === 'cambiar-cantidad') return
  ev.preventDefault()
  programar(() => aplicar(flujo.confirmarCampo(estado, name)))
})

render()
