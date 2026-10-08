// js/embed-test.js — Verificador de la integración Bold POS → BoldBot.
// Página interna (embed-test.html) para que el equipo dev de Bold confirme, en
// vivo, que su postMessage llega y trae los campos correctos. No toca la app.

// La lista de orígenes aceptados se importa en vez de copiarse: si divergieran,
// esta página le diría a Bold que su origen está mal cuando el portal real sí lo
// acepta (o al revés), que es exactamente el tipo de pista falsa que una página
// de diagnóstico no puede dar.
import { ORIGENES_BOLD, esOrigenBold } from './bold-context.js'

const ACADEMIA_ORIGIN = window.location.origin
const BOLD_ORIGINS    = ORIGENES_BOLD.join(' o ')

// Detección de valores de relleno: si llegan tal cual, es que se copiaron
// literales en vez de leerse de la sesión. Solo cadenas evidentemente falsas;
// nada que pueda ser el nombre real de un comercio.
const EJEMPLOS = new Set([
  'nombre real del comercio', 'nombre real', 'correo.real@comercio.com',
  'correo@comercio.com', 'nombre apellido', 'comercio s.a.',
  'prueba', 'test', 'demo', 'xxx', 'string', 'undefined', 'null',
])
const RE_RELLENO = /(nombre|correo|dato|valor)e?s?\s+(real|de\s+prueba|de\s+ejemplo)|placeholder|example\.com|lorem|\bcambiar\b|^<.*>$/i

function esRelleno(v) {
  if (v === null || v === undefined || v === '') return false
  const s = String(v).trim().toLowerCase()
  return EJEMPLOS.has(s) || RE_RELLENO.test(s)
}

// Mapa vertical de Bold → vertical nuestra. Toleramos mayúsculas y variantes.
const VERTICAL_MAP = {
  retail: 'retail', tienda: 'retail', store: 'retail',
  restaurant: 'restaurantes', restaurante: 'restaurantes',
  restaurants: 'restaurantes', restaurantes: 'restaurantes', food: 'restaurantes',
}

const $ = id => document.getElementById(id)
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

const state = { mensajes: [], contexto: null, contextoOrigin: null }

// ---------- 1. Entorno ----------

function ancestorOrigin() {
  try { return document.location.ancestorOrigins?.[0] || null } catch { return null }
}

function storageOk() {
  try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true } catch { return false }
}

const pill = (tipo, texto) =>
  `<span class="pill p-${tipo === 'ok' ? 'ok' : tipo === 'bad' ? 'bad' : tipo === 'warn' ? 'warn' : 'off'}">${esc(texto)}</span>`

function renderEnv() {
  const embebido = window.parent !== window
  const anc = ancestorOrigin()
  const filas = [
    ['Origen de esta página', ACADEMIA_ORIGIN, 'ok'],
    ['¿Está dentro de un iframe?', embebido ? 'Sí' : 'No — abrila desde el POS para la prueba real', embebido ? 'ok' : 'warn'],
    ['Origen del contenedor', anc || (embebido ? '(no visible en este navegador)' : '—'),
      anc ? (esOrigenBold(anc) ? 'ok' : 'warn') : 'off'],
    ['document.referrer', document.referrer || '(vacío)', document.referrer ? 'ok' : 'off'],
    ['Orígenes que aceptamos', BOLD_ORIGINS, 'ok'],
    ['targetOrigin que deben usar', ACADEMIA_ORIGIN, 'ok'],
    ['localStorage disponible', storageOk() ? 'Sí' : 'No (particionado por el navegador)', storageOk() ? 'ok' : 'warn'],
  ]
  $('env').innerHTML = '<tbody>' + filas.map(([k, v, s]) =>
    `<tr><th style="width:210px">${esc(k)}</th><td class="v">${esc(v)}</td>
     <td style="width:34px">${pill(s, s === 'ok' ? '✓' : s === 'warn' ? '!' : '·')}</td></tr>`).join('') + '</tbody>'
}

// ---------- 2. Handshake ----------

function avisarListo() {
  if (window.parent === window) return
  try { window.parent.postMessage({ type: 'academia:ready', v: 1 }, '*') } catch {}
}

// ---------- 3. Escucha y validación ----------

window.addEventListener('message', e => {
  const entrada = { t: new Date().toLocaleTimeString('es-CO'), origin: e.origin, data: e.data }
  state.mensajes.unshift(entrada)
  renderLog()

  const tipo = e.data && typeof e.data === 'object' ? e.data.type : null
  if (tipo !== 'bold:context' && tipo !== 'bold:token') return

  state.contexto = e.data
  state.contextoOrigin = e.origin
  renderCampos()
})

function validar(d, origin) {
  const filas = []
  const add = (campo, valor, estado, nota) => filas.push({ campo, valor, estado, nota })

  // El origen lo fija el navegador: no es falsificable desde la página.
  add('origin del mensaje', origin,
    esOrigenBold(origin) ? 'ok' : 'bad',
    esOrigenBold(origin) ? 'Coincide con uno de los orígenes que aceptamos.'
      : `Solo aceptamos ${BOLD_ORIGINS}. Desde otro origen el mensaje se descarta.`)

  add('type', d.type, d.type === 'bold:context' ? 'ok' : 'warn',
    d.type === 'bold:context' ? '' : 'Se esperaba exactamente "bold:context".')

  const id = d.accountId ?? d.account_id ?? d.sub
  add('accountId', id,
    id == null || id === '' ? 'bad' : esRelleno(id) ? 'warn' : 'ok',
    id == null || id === '' ? 'OBLIGATORIO. Es el claim "sub" del JWT de sesión.'
      : esRelleno(id) ? 'Parece un valor de relleno, no leído de la sesión.'
      : 'Identifica al comercio.')

  const bt  = d.businessType ?? d.business_type
  const map = bt ? VERTICAL_MAP[String(bt).trim().toLowerCase()] : null
  add('businessType', bt,
    !bt ? 'bad' : map ? 'ok' : 'warn',
    !bt ? 'OBLIGATORIO. Es el claim "business_type" del JWT de sesión.'
      : map ? `Lo mapeamos a la vertical "${map}".`
      : 'Valor no reconocido. Avísennos el string exacto y lo agregamos al mapa.')

  const bn = d.businessName ?? d.business_name
  add('businessName', bn,
    !bn ? 'warn' : esRelleno(bn) ? 'warn' : 'ok',
    !bn ? 'Recomendado. Solo se usa para saludar por nombre.'
      : esRelleno(bn) ? 'Parece texto de relleno del snippet, no el nombre real del comercio.' : '')

  const pl = d.platform ?? d.plataforma
  const plOk = pl && ['web', 'mobile', 'android', 'ios'].includes(String(pl).toLowerCase())
  add('platform', pl, !pl ? 'warn' : plOk ? 'ok' : 'warn',
    !pl ? 'Recomendado: "web" o "mobile". Filtra las lecciones por plataforma.'
      : plOk ? '' : 'Se esperaba "web" o "mobile" (o "android"/"ios").')

  const u = d.user || {}
  const emailOk = u.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(u.email))
  add('user.email', u.email,
    !u.email ? 'warn' : esRelleno(u.email) ? 'warn' : emailOk ? 'ok' : 'bad',
    !u.email ? 'Recomendado. Sin él no podemos ligar una conversación del bot con el usuario.'
      : esRelleno(u.email) ? 'Parece un correo de relleno, no el del usuario logueado.'
      : emailOk ? '' : 'No parece un correo válido.')
  add('user.name', u.name,
    !u.name ? 'off' : esRelleno(u.name) ? 'warn' : 'ok',
    !u.name ? 'Opcional.' : esRelleno(u.name) ? 'Parece texto de relleno.' : '')
  add('user.id', u.id, u.id ? 'ok' : 'off', u.id ? '' : 'Opcional (solo si difiere de accountId).')

  // Credenciales que NO queremos en este mensaje.
  const sospechoso = ['token', 'jwt', 'accessToken', 'access_token', 'password', 'apiKey']
    .filter(k => k in d && d.type === 'bold:context')
  if (sospechoso.length) {
    add('⚠ campos extra', sospechoso.join(', '), 'bad',
      'NO nos manden el token de sesión del POS en este mensaje. Ver el requerimiento aparte de JWT.')
  }
  return filas
}

function renderCampos() {
  const d = state.contexto
  if (!d) return
  const filas = validar(d, state.contextoOrigin)
  const errores = filas.filter(f => f.estado === 'bad')
  // Probando fuera del POS (consola local, staging) el único fallo es el
  // origen: eso no es un defecto de la integración, es el entorno de prueba.
  const soloOrigen = errores.length === 1 && errores[0].campo === 'origin del mensaje'
  const hayError = errores.length > 0 && !soloOrigen
  const hayAviso = filas.some(f => f.estado === 'warn') || soloOrigen

  $('fields').innerHTML =
    '<thead><tr><th style="width:150px">Campo</th><th>Valor recibido</th><th style="width:44px">Estado</th><th style="width:38%">Nota</th></tr></thead><tbody>' +
    filas.map(f => `<tr>
      <th>${esc(f.campo)}</th>
      <td class="v">${f.valor === undefined || f.valor === null || f.valor === ''
        ? '<span class="muted">(vacío)</span>'
        : esc(typeof f.valor === 'object' ? JSON.stringify(f.valor) : f.valor)}</td>
      <td>${pill(f.estado, f.estado === 'ok' ? '✓' : f.estado === 'bad' ? '✗' : f.estado === 'warn' ? '!' : '·')}</td>
      <td class="muted">${esc(f.nota)}</td></tr>`).join('') +
    '</tbody>'

  const b = $('banner')
  if (hayError) {
    b.className = 'banner bad'
    b.innerHTML = 'Llegó el mensaje, pero <b>falta algo obligatorio</b>.<small>Revisá las filas con ✗ en la tabla de abajo.</small>'
  } else if (soloOrigen) {
    const avisos = filas.filter(f => f.estado === 'warn').length
    b.className = 'banner wait'
    b.innerHTML = (avisos
      ? 'Contexto recibido <b>con ' + avisos + ' aviso' + (avisos > 1 ? 's' : '') + '</b>, y además no vino de <code>' + esc(BOLD_ORIGINS) + '</code>.'
      : 'Los <b>datos están bien</b>, pero el mensaje no vino de <code>' + esc(BOLD_ORIGINS) + '</code>.') +
      '<small>Lo segundo es normal si estás probando fuera del POS. Repetí la prueba desde pos.bold.co para el visto bueno final.</small>'
  } else if (hayAviso) {
    b.className = 'banner wait'
    b.innerHTML = 'Contexto recibido con <b>observaciones</b>.<small>Lo obligatorio está; revisá las filas con «!».</small>'
  } else {
    b.className = 'banner ok'
    b.innerHTML = '✓ <b>Contexto recibido y válido.</b><small>Con esto BoldBot ya puede autofiltrar la vertical y personalizar. Integración lista.</small>'
  }
}

function renderLog() {
  $('log').innerHTML = state.mensajes.slice(0, 40).map(m =>
    `<div><span class="muted">${esc(m.t)}</span> · <b>${esc(m.origin || '(sin origen)')}</b><br>${esc(JSON.stringify(m.data)).slice(0, 400)}</div>`
  ).join('') || '<div class="muted">Sin mensajes aún…</div>'
}

// ---------- 4. Snippet de prueba y diagnóstico ----------

const SNIPPET = [
  '// Pegar en la consola de https://pos.bold.co con el menu Ayuda ABIERTO.',
  '// Si Chrome no deja pegar: escribir "allow pasting" en la consola y Enter.',
  '// Manda a la Academia SOLO datos reales de la sesion. Nada sale del navegador.',
  '(() => {',
  "  const f = document.querySelector('iframe.pos-help-window__iframe')",
  '         || document.querySelector(\'iframe[src*="academia.localizadoc.com"]\');',
  "  if (!f) return console.error('No encontre el iframe de Ayuda. Esta abierto el menu?');",
  '  const raw = localStorage.token;   // token de sesion del POS (no sale de su navegador)',
  "  if (!raw) return console.error('No hay localStorage.token: la sesion esta iniciada?');",
  '  // Los JWT van en base64url: hay que traducir - y _ antes de decodificar.',
  "  const jwt = JSON.parse(atob(raw.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));",
  '  const txt = sel => document.querySelector(sel)?.textContent.trim() || null;',
  '  // Nombre del comercio y del usuario: ya estan pintados en el propio POS.',
  "  const negocio = txt('.pos-navbar__menu__company__name');",
  "  const usuario = txt('.pos-sidebar__info .name') || txt('.pos-navbar__menu__user__info p');",
  '  const ctx = {',
  "    type: 'bold:context',",
  '    accountId:    jwt.sub,                 // ID de cuenta, del token',
  '    businessType: jwt.business_type,       // vertical, del token',
  "    platform:     'web',",
  '  };',
  '  if (negocio) ctx.businessName = negocio;',
  '  if (usuario) ctx.user = { name: usuario };',
  "  console.log('Contexto que se va a enviar:', ctx);",
  "  f.addEventListener('load', () => {",
  "    f.contentWindow.postMessage(ctx, 'https://academia.localizadoc.com');",
  '  }, { once: true });',
  "  f.src = 'https://academia.localizadoc.com/embed-test.html';",
  '})();',
].join('\n')

function copiar(texto, boton, ok) {
  const previo = boton.textContent
  navigator.clipboard.writeText(texto)
    .then(() => { boton.textContent = ok })
    .catch(() => { boton.textContent = 'No se pudo copiar' })
    .then(() => setTimeout(() => { boton.textContent = previo }, 1800))
}

function diagnostico() {
  return JSON.stringify({
    generado: new Date().toISOString(),
    origenAcademia: ACADEMIA_ORIGIN,
    embebido: window.parent !== window,
    ancestorOrigin: ancestorOrigin(),
    referrer: document.referrer || null,
    userAgent: navigator.userAgent,
    contextoRecibido: state.contexto,
    origenDelContexto: state.contextoOrigin,
    mensajes: state.mensajes.slice(0, 10),
  }, null, 2)
}

// ---------- Arranque ----------

renderEnv()
$('snippet').textContent = SNIPPET
$('copySnippet').addEventListener('click', e => copiar(SNIPPET, e.currentTarget, '¡Copiado!'))
$('copyDiag').addEventListener('click', e => copiar(diagnostico(), e.currentTarget, '¡Copiado!'))

avisarListo()
let intentos = 0
const ping = setInterval(() => {
  avisarListo()
  if (++intentos >= 15 || state.contexto) clearInterval(ping)   // 30 s
}, 2000)
