// Identidad del comercio detrás de una pregunta. Import-safe: sin DOM y sin
// supabase.
//
// Existe porque un incidente sin comercio no se puede atender: "el datáfono no
// reconoce la clave" es inútil sin saber de quién. La identidad llega de Bold
// por postMessage y se guarda en la conversación (account_id desde siempre,
// business_name desde add_identidad_comercio_vacios.sql), así que las
// conversaciones viejas tienen id y no nombre, y las de fuera del POS no tienen
// ninguno de los dos.

const MAX_NOMBRE = 40

const texto = s => String(s ?? '').trim()

export function etiquetaComercio(pregunta) {
  const nombre = texto(pregunta?.business_name)
  const id = texto(pregunta?.account_id)

  if (nombre) {
    return {
      texto: nombre.length > MAX_NOMBRE ? `${nombre.slice(0, MAX_NOMBRE)}…` : nombre,
      completo: id || nombre,
      identificado: true,
    }
  }
  // El id crudo es un uuid: dentro de una lista rompe el renglón y no se lee
  // mejor. Se acorta para ver, y el entero viaja en `completo` para copiar.
  if (id) return { texto: `ID ${id.slice(0, 8)}…`, completo: id, identificado: true }

  return { texto: 'Sin identificar', completo: '', identificado: false }
}

export function contarComercios(preguntas) {
  const lista = Array.isArray(preguntas) ? preguntas : []
  return new Set(lista.map(p => texto(p?.account_id)).filter(Boolean)).size
}
