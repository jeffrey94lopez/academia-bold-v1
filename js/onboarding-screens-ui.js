// js/onboarding-screens-ui.js — piezas compartidas de la réplica de Bold POS:
// shell (barra superior + menú lateral), campos de formulario e íconos.
//
// Contratos con el controlador (Task 6):
// - `data-onb="<ancla>"` marca dónde se posa la burbuja.
// - `data-action="<ancla>"` en lo clicable; lo que el recorrido no usa lleva
//   `data-action="fuera-de-ruta"`.
// - Los campos llevan `name` = ancla, para que el borrador se arme por nombre.

import { escapeHtml } from './utils.js'

export const NEGOCIO = 'Mi negocio'
export const SUCURSAL = 'Mi negocio - Principal'
export const AVISO_PRACTICA = 'Modo práctica — nada de esto se guarda en tu cuenta de Bold POS'
export const FUERA = 'data-action="fuera-de-ruta"'

// escapeHtml devuelve '' para 0; aquí los números sí se muestran.
export function t(v) {
  if (v === null || v === undefined) return ''
  return escapeHtml(String(v))
}

export function miles(n) {
  return Math.round(n).toLocaleString('en-US')
}

// "2026-10-22 23:06:18" en hora local, como lo muestra Bold.
export function fechaHora(iso) {
  const d = iso ? new Date(iso) : new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function fecha(iso) {
  return fechaHora(iso).slice(0, 10)
}

// --- Íconos (SVG en línea, sin CDN) ---

const svg = (d, extra = '') =>
  `<svg class="onb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`

export const ICO = {
  home: svg('<path d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>'),
  pos: svg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
  ingresos: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5c0-1.4 5-1.4 5 .5s-5 1.5-5 3.5 5 2 5 .5"/>'),
  egresos: svg('<path d="M6 3h9l4 4v14H6z"/><path d="M9 12h6M9 16h4"/>'),
  items: svg('<path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/>'),
  clientes: svg('<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/>'),
  proveedores: svg('<path d="M3 9l2-5h14l2 5M4 9v11h16V9M9 20v-6h6v6"/>'),
  reportes: svg('<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'),
  ajustes: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 13.7H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10.3 3V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  ayuda: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 .5c0 2-2.5 2-2.5 4M12 17h.01"/>'),
  sub: svg('<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M9 9h6M9 13h6"/>'),
  caret: svg('<path d="M6 9l6 6 6-6"/>'),
  atras: svg('<path d="M15 18l-6-6 6-6"/>'),
  mas: svg('<path d="M12 5v14M5 12h14"/>'),
  lupa: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  lapiz: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
  basura: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>'),
  etiqueta: svg('<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>'),
  check: svg('<path d="M5 12l5 5 9-10"/>'),
  sucursal: svg('<path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/>'),
  imagen: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="16" cy="10" r="2"/><path d="M3 17l6-6 5 5 3-3 4 4"/>'),
  correo: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>'),
  calendario: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
}

// --- Formularios ---

export function error(errores, clave) {
  const msg = errores?.[clave]
  return msg ? `<p class="onb-error" role="alert">${t(msg)}</p>` : ''
}

export function etiqueta(texto, requerido) {
  return `<label class="onb-label">${t(texto)}${requerido ? ' <span class="onb-req">*</span>' : ''}</label>`
}

// Input de texto. `ancla` hace de name y data-onb; sin ancla es decorativo.
export function input({ ancla, valor = '', placeholder = '', invalido = false, readonly = false, disabled = false, modo = 'text' }) {
  const attrs = [
    'class="onb-input' + (invalido ? ' onb-input-error' : '') + '"',
    'type="text"',
    modo !== 'text' ? `inputmode="${modo}"` : '',
    ancla ? `name="${ancla}" data-onb="${ancla}"` : '',
    `value="${t(valor)}"`,
    placeholder ? `placeholder="${t(placeholder)}"` : '',
    readonly ? 'readonly' : '',
    disabled ? 'disabled' : '',
  ].filter(Boolean)
  return `<input ${attrs.join(' ')}>`
}

// opciones: [{ value, label }]
export function select({ ancla, opciones, valor = '', placeholder = 'Elige una opción', invalido = false, disabled = false }) {
  const ops = [`<option value=""${valor ? '' : ' selected'}>${t(placeholder)}</option>`]
  for (const o of opciones) {
    ops.push(`<option value="${t(o.value)}"${o.value === valor ? ' selected' : ''}>${t(o.label)}</option>`)
  }
  const nombre = ancla ? ` name="${ancla}" data-onb="${ancla}"` : ''
  return `<select class="onb-input onb-select${invalido ? ' onb-input-error' : ''}"${nombre}${disabled ? ' disabled' : ''}>${ops.join('')}</select>`
}

export function campo(contenido, extraClase = '') {
  return `<div class="onb-campo ${extraClase}">${contenido}</div>`
}

export function switchVisual(encendido, attrs = '') {
  return `<span class="onb-switch${encendido ? ' onb-switch-on' : ''}" ${attrs}><span class="onb-switch-bola"></span></span>`
}

export function boton(texto, { clase = 'onb-btn-primario', accion = 'fuera-de-ruta', ancla = '', icono = '' } = {}) {
  const onb = ancla ? ` data-onb="${ancla}"` : ''
  return `<button type="button" class="onb-btn ${clase}"${onb} data-action="${accion}">${icono}${t(texto)}</button>`
}

export function encabezado(titulo, botones = '', { atras = false } = {}) {
  const flecha = atras ? `<button type="button" class="onb-atras" ${FUERA} aria-label="Volver">${ICO.atras}</button>` : ''
  return `<div class="onb-encabezado"><h1 class="onb-titulo">${flecha}${t(titulo)}</h1><div class="onb-acciones">${botones}</div></div>`
}

export function botonEjemplo() {
  return `<button type="button" class="onb-btn onb-btn-ejemplo" data-action="usar-ejemplo">Usar ejemplo</button>`
}

// --- Shell ---

// Ruling A: INGRESOS, EGRESOS, ÍTEMS y Flujo de inventario llevan siempre su
// ancla (data-onb + data-action); el controlador decide si el clic va en ruta.
// Los subitems "gemelos" (Lista de ítems, Gastos, Facturas de Venta) repiten la
// acción de su sección pero no el data-onb, para que el ancla sea única.
const MENU = [
  { id: 'home', label: 'HOME', icono: 'home' },
  { id: 'pv', label: 'PUNTO DE VENTA', icono: 'pos', sub: [
    { id: 'pv:nueva', label: 'Nueva venta' }, { id: 'pv:historial', label: 'Historial de ventas' },
  ] },
  { id: 'ingresos', label: 'INGRESOS', icono: 'ingresos', accion: 'menu-ingresos', sub: [
    { id: 'ingresos:recibos', label: 'Recibos' },
    { id: 'ingresos:facturas', label: 'Facturas de Venta', accion: 'menu-ingresos' },
    { id: 'ingresos:cotizaciones', label: 'Cotizaciones' },
    { id: 'ingresos:notas', label: 'Notas Crédito' },
  ] },
  { id: 'egresos', label: 'EGRESOS', icono: 'egresos', accion: 'menu-egresos', sub: [
    { id: 'egresos:gastos', label: 'Gastos', accion: 'menu-egresos' },
    { id: 'egresos:soporte', label: 'Documentos soporte' },
    { id: 'egresos:compras', label: 'Facturas de compra' },
  ] },
  // ÍTEMS va siempre abierto: "Flujo de inventario" tiene que estar a la vista
  // en factura-detalle, donde la burbuja lo señala.
  { id: 'items', label: 'ÍTEMS', icono: 'items', accion: 'menu-items', abierto: true, sub: [
    { id: 'items:lista', label: 'Lista de ítems', accion: 'menu-items' },
    { id: 'items:ajuste', label: 'Ajuste de inventario' },
    { id: 'items:flujo', label: 'Flujo de inventario', accion: 'menu-flujo', ancla: true },
    { id: 'items:variantes', label: 'Variantes de inventario' },
  ] },
]

const MENU_SECUNDARIO = [
  { label: 'Clientes', icono: 'clientes' }, { label: 'Proveedores', icono: 'proveedores' },
  { label: 'Reportes', icono: 'reportes' }, { label: 'Ajustes', icono: 'ajustes' }, { label: 'Ayuda', icono: 'ayuda' },
]

function accionAttrs(accion, conAncla) {
  if (!accion) return FUERA
  return conAncla ? `data-onb="${accion}" data-action="${accion}"` : `data-action="${accion}"`
}

function seccionMenu(s, activo) {
  const seccionActiva = activo.split(':')[0] === s.id
  const abierta = s.sub && (s.abierto || seccionActiva)
  const cabeza = `<button type="button" class="onb-menu-item${seccionActiva ? ' onb-menu-activo' : ''}" ${accionAttrs(s.accion, true)}>${ICO[s.icono]}<span>${t(s.label)}</span>${s.sub ? `<span class="onb-menu-caret${abierta ? ' onb-abierto' : ''}">${ICO.caret}</span>` : ''}</button>`
  if (!abierta) return cabeza
  const subs = s.sub.map(x => `<button type="button" class="onb-menu-sub${x.id === activo ? ' onb-menu-activo' : ''}" ${accionAttrs(x.accion, x.ancla)}>${ICO.sub}<span>${t(x.label)}</span></button>`)
  return cabeza + `<div class="onb-menu-subs">${subs.join('')}</div>`
}

function sidebar(activo) {
  return `<aside class="onb-sidebar">
  <div class="onb-sidebar-usuario"><strong>${t(NEGOCIO)}</strong><span>Administrador</span></div>
  <div class="onb-sidebar-sucursal">${ICO.sucursal}<span>${t(SUCURSAL)}</span>${ICO.caret}</div>
  <button type="button" class="onb-btn-nueva-venta" data-onb="btn-nueva-venta" data-action="btn-nueva-venta">${ICO.mas}Nueva venta</button>
  <nav class="onb-menu">${MENU.map(s => seccionMenu(s, activo)).join('')}</nav>
  <nav class="onb-menu onb-menu-secundario">${MENU_SECUNDARIO.map(m => `<button type="button" class="onb-menu-item onb-menu-item-sec" ${FUERA}>${ICO[m.icono]}<span>${t(m.label)}</span></button>`).join('')}</nav>
</aside>`
}

// menuActivo: 'home' | 'pv' | 'ingresos:facturas' | 'egresos:gastos' | 'items:lista' | 'items:flujo'
export function shell(contenido, menuActivo = 'home') {
  return `<div class="onb-app">
<header class="onb-topbar">
  <span class="onb-logo" aria-label="bold">b<span class="onb-logo-o">o</span>ld</span>
  <div class="onb-practica" role="note">${t(AVISO_PRACTICA)}</div>
  <div class="onb-topbar-der"><span class="onb-negocio">${t(NEGOCIO)} - <em>Ilimitado</em></span><span class="onb-topbar-ayuda" aria-hidden="true">?</span><span class="onb-avatar" aria-hidden="true">MN</span></div>
</header>
<div class="onb-cuerpo">${sidebar(menuActivo)}<main class="onb-main">${contenido}</main></div>
</div>`
}
