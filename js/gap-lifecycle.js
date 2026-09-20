// Estado mostrado de un vacío y veredicto del detector de silencio del
// registro. Import-safe: sin DOM y sin supabase.
//
// El estado GUARDADO son tres valores (pendiente/resuelto/descartado). El
// estado MOSTRADO agrega la reincidencia, que no es una columna sino una
// lectura de los contadores: un vacío cerrado que sigue recibiendo preguntas.
//
// Por qué importa la distinción: un resuelto reincidente NO dice "falta
// contenido" — dice que el contenido existe y el bot no lo está recuperando
// (umbral de match_lessons, embedding sin regenerar, lección apagada). Es un
// problema distinto y más barato de arreglar.

export function estadoMostrado(vacio, { umbralReincidencia = 3 } = {}) {
  const estado = vacio?.estado
  const desde = Number(vacio?.preguntas_desde_cierre ?? 0) || 0

  // Un resuelto reincide con UNA sola pregunta: escribiste la respuesta y aun
  // así alguien volvió a quedarse sin ella. No hay que esperar a que se repita.
  if (estado === 'resuelto') return desde > 0 ? 'resuelto_reincidente' : 'resuelto'

  // Un descartado sí necesita insistencia: lo cerraste a propósito, y una
  // pregunta suelta más no invalida ese juicio.
  if (estado === 'descartado') {
    return desde >= umbralReincidencia ? 'descartado_reincidente' : 'descartado'
  }

  return 'pendiente'
}

const HORA_MS = 3600_000

export function registroEnSilencio({
  ultimoGapConversacion,
  ultimaPreguntaRegistrada,
  horasTolerancia = 6,
} = {}) {
  // Sin gaps recientes no hay nada que registrar: un día tranquilo no es una
  // avería. La referencia es el último gap reportado, no el reloj.
  if (!ultimoGapConversacion) return { enSilencio: false, horasSinRegistrar: null }

  const gap = Date.parse(ultimoGapConversacion)
  if (Number.isNaN(gap)) return { enSilencio: false, horasSinRegistrar: null }

  if (!ultimaPreguntaRegistrada) return { enSilencio: true, horasSinRegistrar: null }

  const reg = Date.parse(ultimaPreguntaRegistrada)
  if (Number.isNaN(reg)) return { enSilencio: true, horasSinRegistrar: null }

  const horas = Math.max(0, Math.round((gap - reg) / HORA_MS))
  return { enSilencio: horas > horasTolerancia, horasSinRegistrar: horas }
}
