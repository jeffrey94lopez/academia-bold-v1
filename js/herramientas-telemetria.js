// js/herramientas-telemetria.js — qué tanto se usan las herramientas de BolBot
// (conversor de inventario y generador de códigos) y dónde se atoran.
//
// Cinco eventos en analytics_events, todos con run_id (una conversación) y, si Bold
// mandó el contexto, account_id / business_name / vertical:
//   tool_start     la conversación arrancó
//   tool_step      llegó a un paso (una vez por paso y conversación)
//   tool_error     algo falló o se atoró (código fijo, nunca texto libre)
//   tool_complete  se llevó el resultado: descargó, imprimió, bajó el ZIP
//   tool_ia        decisión ante una propuesta de la IA (sin dedup, solo conteos)
// Jamás se manda contenido del cliente: ni nombres de productos, ni códigos, ni
// nombres de archivo. Solo conteos y opciones elegidas.
//
// No importa js/analytics.js: recibe `track` por inyección, así se prueba en Node.
import { getContextoBold } from './bold-context.js'
import { APP_ENV } from './env.js'

export const HERRAMIENTAS = ['inventario', 'codigos']

export const PASOS = {
  inventario: ['plantillas', 'origen', 'columnas', 'preguntas', 'resultado'],
  codigos: ['datos', 'formato', 'diseno', 'resultado'],
}

// Lo que puede salir mal, con su explicación para el equipo. La pestaña del admin
// usa estas frases; un código que no esté aquí se cuenta como 'otro'.
export const ERRORES = {
  plantilla_invalida: 'Subió un archivo que no es una plantilla de Bold POS',
  plantilla_faltante: 'Le faltó subir una de las plantillas que necesita',
  sin_boton_importar: 'No encontraba el botón Importar en Bold POS',
  sin_lista: 'No tenía una lista de productos para subir',
  archivo_ilegible: 'El archivo no se pudo leer',
  sin_tabla: 'El archivo no tiene una tabla de productos reconocible',
  columnas_incompletas: 'No se reconoció la columna de nombre o de precio',
  filas_nombre: 'Productos sin nombre',
  filas_precio: 'Productos con precio inválido',
  filas_omitida: 'Productos que el cliente eligió omitir',
  filas_plantilla_tipo: 'Productos de un tipo cuya plantilla no subió',
  sin_warehouse_id: 'No vino el warehouseId en el contexto de Bold (plantilla sintética)',
  detectado: 'Se detectó IVA mixto en el archivo (algunas filas con IVA, otras sin)',
  resolucion_reupload: 'El cliente eligió volver a subir el archivo con la columna de IVA completa',
  sin_resultado: 'No se pudo armar ningún producto',
  datos_vacios: 'No se encontraron códigos en lo que pegó o subió',
  formato_invalido: 'Los códigos no sirven para el formato de barras elegido',
  dibujo_fallo: 'Algunos códigos no se pudieron dibujar',
  libreria_no_carga: 'No cargó la herramienta de dibujo (conexión)',
  descarga_fallo: 'Falló la descarga de imágenes',
  ia_fallo: 'La IA no respondió (error del servicio)',
  ia_respuesta_invalida: 'La IA respondió algo que no cumple las reglas; se descartó',
  ia_timeout: 'La IA tardó más de 60 s',
  ia_lista_grande: 'Más de 300 categorías o unidades distintas; no se usó la IA',
  correccion_pendientes: 'Se encontraron datos inválidos que el cliente debía corregir',
  correccion_corrigio: 'Escribió los valores correctos',
  correccion_ceros: 'Eligió dejar costos o existencias en 0',
  correccion_omitio: 'Eligió omitir filas sin nombre o precio',
  correccion_reupload: 'Prefirió subir otro archivo',
  excepcion: 'Error inesperado',
  otro: 'Otro',
}

export const ETIQUETAS_PASO = {
  plantillas: 'Subió su plantilla de Bold',
  origen: 'Subió su archivo de productos',
  columnas: 'Confirmó las columnas',
  preguntas: 'Respondió las preguntas',
  correcciones: 'Corrigió datos inválidos',
  resultado: 'Llegó al resultado',
  datos: 'Dio los códigos o contenidos',
  formato: 'Eligió el formato de barras',
  diseno: 'Eligió papel y tamaño',
  codigos_creados: 'Le creó códigos a sus productos',
}

export const ETIQUETAS_HERRAMIENTA = { inventario: 'Pasar inventario a Bold', codigos: 'Códigos de barras y QR' }

// `contexto`: { accountId, businessName, vertical } o null.
export function crearTelemetriaHerramienta({ track, tool, runId, getContexto = () => null, env = 'prod' }) {
  const pasosVistos = new Set()

  function payload(extra = {}) {
    const p = { tool, run_id: runId, env, ...extra }
    const c = getContexto()
    if (c?.accountId) p.account_id = String(c.accountId)
    if (c?.businessName) p.business_name = String(c.businessName).slice(0, 80)
    if (c?.vertical) p.vertical = String(c.vertical)
    return p
  }

  return {
    // La conversación (la usa el purgador con IA para agrupar sus pedidos).
    runId,

    // via: dónde arrancó (chat, pagina, inventario = viene del conversor).
    inicio(via = 'chat') { track('tool_start', payload({ via })) },

    paso(paso) {
      if (pasosVistos.has(paso)) return
      pasosVistos.add(paso)
      track('tool_step', payload({ paso }))
    },

    // `detalle`: solo números o cadenas cortas propias del sistema (nunca texto del cliente).
    error(paso, codigo, detalle = {}) {
      track('tool_error', payload({ paso, codigo: codigo in ERRORES ? codigo : 'otro', ...detalle }))
    },

    // Decisión del cliente ante una propuesta de la IA (purgador). Sin deduplicar: cada
    // propuesta cuenta. Solo números y códigos del sistema, nunca texto del cliente:
    // por eso se eligen los campos a mano en vez de esparcir `detalle`.
    ia(etapa, decision, detalle = {}) {
      const { n_entrada, n_salida, codigo } = detalle
      const extra = { etapa, decision }
      if (n_entrada !== undefined) extra.n_entrada = n_entrada
      if (n_salida !== undefined) extra.n_salida = n_salida
      if (codigo !== undefined) extra.codigo = codigo
      track('tool_ia', payload(extra))
    },

    // accion: descarga | impresion | zip | lista_codigos. `datos`: conteos y opciones.
    fin(accion, datos = {}) { track('tool_complete', payload({ accion, ...datos })) },
  }
}

// Telemetría real: manda a analytics_events, salvo en pruebas locales (la base es
// compartida con producción, igual que en onboarding.js). analytics.js trae el cliente
// de Supabase desde un CDN: se pide al primer evento para que, si falla, el chat siga.
export function telemetriaReal(tool) {
  const local = typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname)
  const runId = globalThis.crypto?.randomUUID?.() ?? `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  const track = (evento, p) => {
    if (local) { console.debug('[herramientas] telemetría (local, no se envía):', evento, p); return }
    import('./analytics.js').then(m => m.track(evento, p)).catch(err => console.error('[herramientas] telemetría:', err))
  }
  // El contexto de Bold llega cuando llega: se lee en cada evento, no al crear.
  return crearTelemetriaHerramienta({ track, tool, runId, getContexto: getContextoBold, env: APP_ENV })
}
