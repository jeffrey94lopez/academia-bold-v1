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
