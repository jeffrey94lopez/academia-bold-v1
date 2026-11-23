// js/herramientas-vista.js — convierte lo que devuelve analytics_herramientas en filas
// listas para pintar (embudo, errores, elecciones, comercios). Sin DOM: se prueba en Node.
import { HERRAMIENTAS, PASOS, ERRORES, ETIQUETAS_PASO, ETIQUETAS_HERRAMIENTA } from './herramientas-telemetria.js'
import { FORMATOS_BARRAS, PAPELES } from './barras.js'
import { etiquetaComercio } from './gap-comercio.js'

const n = v => Number(v) || 0
const pct = (parte, todo) => (todo ? Math.round((100 * parte) / todo) : 0)

const FINAL = { inventario: 'Descargaron la plantilla lista', codigos: 'Imprimieron o bajaron las imágenes' }
const CAMPOS = { tipo: 'Qué crearon', formato: 'Formato de barras', papel: 'Papel', origen_datos: 'De dónde salieron los códigos' }
const VALORES = {
  tipo: { barras: 'Código de barras', qr: 'QR' },
  formato: Object.fromEntries(FORMATOS_BARRAS.map(f => [f.id, f.etiqueta])),
  papel: Object.fromEntries(PAPELES.map(p => [p.id, p.etiqueta])),
  origen_datos: {
    pegar: 'Los pegaron', subir: 'Subieron un Excel o CSV', crear: 'Los creó el bot',
    inventario: 'Venían del conversor de inventario', inventario_crear: 'Los creó el bot desde el conversor',
  },
}
const ACCIONES = { descarga: 'Descargó la plantilla', impresion: 'Imprimió', zip: 'Bajó las imágenes', lista_codigos: 'Bajó la lista de códigos' }

function embudo(tool, d) {
  const corridas = n(d.corridas)
  const porPaso = Object.fromEntries((d.pasos ?? []).map(p => [p.paso, n(p.corridas)]))
  const fila = (clave, etiqueta, cuantos) => ({ clave, etiqueta, n: cuantos, pct: pct(cuantos, corridas) })
  return [
    fila('inicio', 'Empezaron', corridas),
    ...PASOS[tool].map(p => fila(p, ETIQUETAS_PASO[p], porPaso[p] ?? 0)),
    fila('fin', FINAL[tool], n(d.terminaron)),
  ]
}

function errores(d) {
  return (d.errores ?? []).map(e => ({
    codigo: e.codigo, etiqueta: ERRORES[e.codigo] ?? ERRORES.otro, paso: ETIQUETAS_PASO[e.paso] ?? '',
    corridas: n(e.corridas), veces: n(e.veces), comercios: n(e.comercios), filas: e.filas == null ? null : n(e.filas),
  }))
}

function elecciones(d) {
  const porCampo = new Map()
  for (const e of d.elecciones ?? []) {
    if (!CAMPOS[e.campo]) continue
    if (!porCampo.has(e.campo)) porCampo.set(e.campo, [])
    porCampo.get(e.campo).push({ etiqueta: VALORES[e.campo]?.[e.valor] ?? e.valor, n: n(e.corridas) })
  }
  return [...porCampo].map(([campo, items]) => ({ campo, etiqueta: CAMPOS[campo], items }))
}

// Estado de un comercio en una herramienta: terminó, o hasta dónde llegó.
function estado(tool, h) {
  if (!h) return null
  if (n(h.terminadas) > 0) return { texto: 'Terminó', ok: true, corridas: n(h.corridas) }
  const paso = PASOS[tool][n(h.rango_paso) - 1]
  return { texto: paso ? `Se quedó tras: ${ETIQUETAS_PASO[paso]}` : 'Empezó y no avanzó', ok: false, corridas: n(h.corridas) }
}

export function armarVista(data) {
  const h = data?.herramientas ?? {}
  const herramientas = HERRAMIENTAS.map(tool => {
    const d = h[tool] ?? {}
    const corridas = n(d.corridas)
    return {
      tool, titulo: ETIQUETAS_HERRAMIENTA[tool],
      corridas, comercios: n(d.comercios), visitantes: n(d.visitantes), sinIdentificar: n(d.sinIdentificar ?? d.sin_identificar),
      terminaron: n(d.terminaron), comerciosTerminaron: n(d.comercios_terminaron), pctTerminaron: pct(n(d.terminaron), corridas),
      productos: n(d.productos), crearonCodigos: n(d.crearon_codigos),
      embudo: embudo(tool, d), errores: errores(d), elecciones: elecciones(d),
      acciones: (d.acciones ?? []).map(a => ({ etiqueta: ACCIONES[a.accion] ?? a.accion, n: n(a.corridas) })),
    }
  })
  const comercios = (data?.comercios ?? []).map(c => ({
    ...etiquetaComercio(c), vertical: c.vertical || null, ultimo: c.ultimo,
    inventario: estado('inventario', c.herramientas?.inventario),
    codigos: estado('codigos', c.herramientas?.codigos),
  }))
  return {
    herramientas, comercios,
    totalCorridas: herramientas.reduce((a, x) => a + x.corridas, 0),
    comerciosTerminaron: comercios.filter(c => c.inventario?.ok || c.codigos?.ok).length,
  }
}

const ETAPAS_IA = [
  { etapa: 'categorias', etiqueta: 'Categorías' },
  { etapa: 'unidades', etiqueta: 'Unidades' },
  { etapa: 'simplificar', etiqueta: 'Simplificar categorías' },
]
const usd = v => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : `US$ ${Number(v).toFixed(4)}`)

// Costo y aceptación del purgador con IA (RPC analytics_herramientas_ia).
// Un monto null significa que no hay precio configurado; no se inventa un cero.
export function armarVistaIA(data) {
  const d = data ?? {}
  return {
    llamadas: n(d.llamadas), cachePct: n(d.cache_pct),
    tokensEntrada: n(d.tokens_entrada), tokensSalida: n(d.tokens_salida),
    costoTotal: usd(d.costo_usd), costoPorConversion: usd(d.costo_por_conversion), costoPorDescarga: usd(d.costo_por_descarga),
    decisiones: ETAPAS_IA.map(({ etapa, etiqueta }) => {
      const x = d.decisiones?.[etapa] ?? {}
      const fila = { etapa, etiqueta, acepto: n(x.acepto), corrigio: n(x.corrigio), originales: n(x.originales), fallo: n(x.fallo) }
      return { ...fila, total: fila.acepto + fila.corrigio + fila.originales + fila.fallo }
    }),
  }
}

// Topes de la IA del purgador (RPC analytics_herramientas_ia_topes): ventana fija de 24 h.
const pctTope = (usado, tope) => (tope > 0 ? Math.min(100, Math.floor((100 * usado) / tope)) : 0)
const nivelTope = p => (p >= 100 ? 'agotado' : p >= 80 ? 'alerta' : 'ok')

export function armarVistaTopes(data) {
  const d = data ?? {}
  const usadas = n(d.usadas_24h), topeDiario = n(d.tope_diario)
  const ipMax = n(d.ip_max_24h), topeIp = n(d.tope_ip)
  // floor: 99,6 % se queda en 99 (alerta); solo llega a 100 cuando ya se alcanzó el tope.
  const pctDiario = pctTope(usadas, topeDiario), pctIp = pctTope(ipMax, topeIp)
  return {
    usadas, topeDiario, ipMax, topeIp, pctDiario, pctIp,
    nivelDiario: nivelTope(pctDiario),
    nivelIp: nivelTope(pctIp),
    iaActiva: d.ia_activa === true || d.ia_activa === 'true',
  }
}

const escHtml = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const fmtMiles = v => String(Math.round(Number(v) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const COLOR_NIVEL = { ok: 'bg-[var(--blue-100)]', alerta: 'bg-[var(--warning-100)]', agotado: 'bg-[var(--error-100)]' }

export function topesHtml(v) {
  if (!v) return '<p class="text-xs text-[var(--black-40)]">Sin datos de topes todavía</p>'
  const barra = (etiqueta, usado, tope, pctV, nivel) => `
    <div class="text-xs">
      <div class="flex justify-between gap-2 mb-1"><b class="text-[var(--black-100)]">${escHtml(etiqueta)}: ${fmtMiles(usado)} de ${fmtMiles(tope)}</b>
        <span class="text-[var(--black-40)]">${pctV}%</span></div>
      <div class="flex h-4 rounded-full bg-[var(--black-10)] overflow-hidden"><span class="block h-full ${COLOR_NIVEL[nivel] ?? COLOR_NIVEL.ok}" style="width:${pctV}%"></span></div>
    </div>`
  // El tope diario apaga la IA para todos; el de IP solo deja sin IA a esa IP.
  const aviso = v.nivelDiario === 'agotado'
    ? 'Tope alcanzado: la IA está apagada hasta que se liberen llamadas de las últimas 24 h'
    : v.nivelIp === 'agotado' ? 'Una IP llegó a su tope: solo esa IP queda sin IA, el resto sigue con IA' : ''
  return `<div class="flex flex-col gap-3">
    ${barra('Llamadas a Gemini hoy', v.usadas, v.topeDiario, v.pctDiario, v.nivelDiario)}
    ${barra('IP más activa', v.ipMax, v.topeIp, v.pctIp, v.nivelIp)}
  </div>
  ${aviso ? `<p class="text-xs font-bold text-[var(--error-100)] mt-2">${aviso}</p>` : ''}
  <p class="text-xs text-[var(--black-60)] mt-2">${v.iaActiva ? 'IA encendida' : 'IA apagada (interruptor inventario_ia_activa)'}</p>
  <p class="text-[11px] text-[var(--black-40)] mt-1">Siempre las últimas 24 h, sin importar el período</p>`
}
