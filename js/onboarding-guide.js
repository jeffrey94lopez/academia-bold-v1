// js/onboarding-guide.js — burbuja de la guía y el "foco" que oscurece el resto.
//
// Sin librería (el CSP no deja cargar una de un CDN nuevo): un recuadro fijo
// sobre el ancla con una sombra enorme hace de oscurecido, y la burbuja se
// ubica al lado con una flecha. El recuadro no atrapa clics (pointer-events:
// none): el cliente puede tocar fuera, y el controlador decide si eso va en
// ruta o merece el aviso de "aquí no vamos".
//
// La ubicación es una función pura (posicionBurbuja) para probarla en Node;
// lo demás toca el DOM y solo corre en el navegador.

const MARGEN = 12        // separación mínima con el borde de la ventana
const SEPARACION = 14    // entre el ancla y la burbuja (cabe la flecha)
const RELLENO = 4        // aire alrededor del ancla dentro del foco

/**
 * Dónde va la burbuja. Prueba derecha, izquierda, abajo y arriba, en ese
 * orden (el menú vive a la izquierda y los formularios llenan el centro: a
 * la derecha suele haber espacio). Si en ningún lado cabe entera —anclas más
 * grandes que la ventana, como el carrito— usa el lado con más espacio y la
 * encierra dentro de la ventana aunque tape parte del ancla.
 *
 * ancla: { top, left, width, height }, burbuja: { width, height },
 * vista: { width, height }. Devuelve { lado, left, top, flecha } donde
 * `flecha` es el desplazamiento de la flecha sobre el borde de la burbuja.
 */
export function posicionBurbuja(ancla, burbuja, vista) {
  const derecha = ancla.left + ancla.width
  const abajo = ancla.top + ancla.height
  const espacio = {
    derecha: vista.width - derecha - SEPARACION - MARGEN,
    izquierda: ancla.left - SEPARACION - MARGEN,
    abajo: vista.height - abajo - SEPARACION - MARGEN,
    arriba: ancla.top - SEPARACION - MARGEN,
  }
  const cabe = {
    derecha: espacio.derecha >= burbuja.width,
    izquierda: espacio.izquierda >= burbuja.width,
    abajo: espacio.abajo >= burbuja.height,
    arriba: espacio.arriba >= burbuja.height,
  }
  const orden = ['derecha', 'izquierda', 'abajo', 'arriba']
  const lado = orden.find(l => cabe[l]) ?? orden.reduce((a, b) => (espacio[b] > espacio[a] ? b : a))

  const acotar = (v, min, max) => Math.max(min, Math.min(v, Math.max(min, max)))
  let left
  let top
  if (lado === 'derecha' || lado === 'izquierda') {
    left = lado === 'derecha' ? derecha + SEPARACION : ancla.left - SEPARACION - burbuja.width
    top = ancla.top + ancla.height / 2 - burbuja.height / 2
  } else {
    top = lado === 'abajo' ? abajo + SEPARACION : ancla.top - SEPARACION - burbuja.height
    left = ancla.left + ancla.width / 2 - burbuja.width / 2
  }
  left = acotar(left, MARGEN, vista.width - burbuja.width - MARGEN)
  top = acotar(top, MARGEN, vista.height - burbuja.height - MARGEN)

  // La flecha apunta al centro del ancla, pero sin salirse de la burbuja.
  const flecha = lado === 'derecha' || lado === 'izquierda'
    ? acotar(ancla.top + ancla.height / 2 - top, 14, burbuja.height - 14)
    : acotar(ancla.left + ancla.width / 2 - left, 14, burbuja.width - 14)
  return { lado, left: Math.round(left), top: Math.round(top), flecha: Math.round(flecha) }
}

// ── DOM ─────────────────────────────────────────────────────────────────────

let foco = null
let burbuja = null
let actual = null        // { root, ancla }
let escuchando = false

function crearNodos() {
  if (foco) return
  foco = document.createElement('div')
  foco.className = 'onb-foco'
  foco.setAttribute('aria-hidden', 'true')
  burbuja = document.createElement('div')
  burbuja.className = 'onb-burbuja'
  burbuja.setAttribute('role', 'status')
  burbuja.setAttribute('aria-live', 'polite')
  document.body.append(foco, burbuja)
}

function elementoAncla() {
  if (!actual) return null
  return actual.root.querySelector(`[data-onb="${CSS.escape(actual.ancla)}"]`)
}

function reubicar() {
  if (!actual || !burbuja) return
  const el = elementoAncla()
  // El ancho útil termina donde termina el escenario, no la ventana: con el
  // panel de BolBot abierto, una burbuja ubicada contra el borde derecho de
  // la ventana quedaba debajo del panel.
  const finEscenario = actual.root.getBoundingClientRect().right
  const vista = {
    width: finEscenario > 0 ? Math.min(window.innerWidth, finEscenario) : window.innerWidth,
    height: window.innerHeight,
  }
  const tam = { width: burbuja.offsetWidth, height: burbuja.offsetHeight }
  if (!el) {
    // Sin ancla (no debería pasar: los tests de pantallas cubren todas) la
    // burbuja queda centrada y sin foco, para que el cliente igual la lea.
    foco.hidden = true
    burbuja.dataset.lado = 'ninguno'
    burbuja.style.left = `${Math.round((vista.width - tam.width) / 2)}px`
    burbuja.style.top = `${Math.round((vista.height - tam.height) / 2)}px`
    return
  }
  const r = el.getBoundingClientRect()
  foco.hidden = false
  foco.style.left = `${r.left - RELLENO}px`
  foco.style.top = `${r.top - RELLENO}px`
  foco.style.width = `${r.width + RELLENO * 2}px`
  foco.style.height = `${r.height + RELLENO * 2}px`
  const pos = posicionBurbuja({ top: r.top, left: r.left, width: r.width, height: r.height }, tam, vista)
  burbuja.dataset.lado = pos.lado
  burbuja.style.left = `${pos.left}px`
  burbuja.style.top = `${pos.top}px`
  burbuja.style.setProperty('--onb-flecha', `${pos.flecha}px`)
}

// Un solo cuadro de animación por ráfaga de scroll/resize.
let pendiente = false
function alMover() {
  if (pendiente) return
  pendiente = true
  requestAnimationFrame(() => { pendiente = false; reubicar() })
}

function escuchar(on) {
  if (on === escuchando) return
  escuchando = on
  const metodo = on ? 'addEventListener' : 'removeEventListener'
  window[metodo]('resize', alMover)
  // capture: el scroll que importa es el de .onb-main, que no burbujea.
  document[metodo]('scroll', alMover, true)
}

/**
 * Muestra la burbuja junto a `[data-onb=ancla]` dentro de `root`, oscurece el
 * resto y lleva el ancla a la vista. Reemplaza la burbuja anterior.
 */
export function mostrarBurbuja(root, ancla, texto, { conSiguiente = false, onSiguiente = () => {}, aviso = '' } = {}) {
  crearNodos()
  actual = { root, ancla }
  burbuja.replaceChildren()
  if (aviso) {
    const a = document.createElement('p')
    a.className = 'onb-burbuja-aviso'
    a.textContent = aviso
    burbuja.append(a)
  }
  const p = document.createElement('p')
  p.className = 'onb-burbuja-texto'
  p.textContent = texto
  burbuja.append(p)
  if (conSiguiente) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'onb-burbuja-siguiente'
    b.textContent = 'Siguiente'
    b.addEventListener('click', () => onSiguiente(), { once: true })
    burbuja.append(b)
  }
  burbuja.hidden = false
  const el = elementoAncla()
  el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  reubicar()
  escuchar(true)
}

/** Botón "Siguiente" de la burbuja visible, si tiene (para darle el foco). */
export function botonSiguiente() {
  return burbuja && !burbuja.hidden ? burbuja.querySelector('.onb-burbuja-siguiente') : null
}

export function ocultarBurbuja() {
  actual = null
  escuchar(false)
  if (foco) foco.hidden = true
  if (burbuja) { burbuja.hidden = true; burbuja.replaceChildren() }
}
