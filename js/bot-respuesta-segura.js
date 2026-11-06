// Red de seguridad entre la respuesta del bot y la burbuja del chat.
// Import-safe: sin DOM y sin supabase.
//
// POR QUÉ EXISTE (incidente del 2026-11-02, ejecución n8n 11773):
// un cliente preguntó cómo configurar su impresora en Windows y recibió en el
// chat 11.410 caracteres de JSON crudo, con nuestros campos internos adentro
// ("sentiment", "knowledge_gap", "support_redirected"). Después abandonó.
//
// La cadena fue: la lección de impresoras es enorme → el modelo cortó su JSON
// por `finish_reason: length` → el JSON quedó sin cerrar → `JSON.parse` falló
// en el nodo "Formatear respuesta" de n8n → ese nodo cae a `reply = raw` →
// assistant.js pinta `reply` tal cual, y además lo guarda y lo manda como
// historial al turno siguiente.
//
// El techo de tokens se subió y el nodo de n8n ahora rescata el texto, pero
// esta red se queda igual: es la ÚLTIMA barrera antes del cliente, y no depende
// de que n8n esté bien. Un parseo que falla nunca justifica mostrar el volcado.

// Claves NUESTRAS. No alcanza con que el texto arranque con "{": el bot puede
// estar explicando un archivo de configuración, o el cliente preguntando por
// uno, y eso tiene que pasar intacto.
const CLAVES = ['"segments"', '"sentiment"', '"knowledge_gap"',
                '"support_redirected"', '"asked_clarification"']

const AVISO_CORTADA = '\n\n(Esta respuesta quedó cortada por su extensión. Pregúntame por la parte que falta y seguimos.)'
const SIN_RESCATE = 'Tuve un problema al armar la respuesta y quedó incompleta 🙏 ¿Puedes repetirme la pregunta?'

export function pareceSobreEnvoltorio(texto) {
  const s = typeof texto === 'string' ? texto : ''
  if (!s.trimStart().startsWith('{')) return false
  return CLAVES.some(k => s.includes(k))
}

// Desescapa un fragmento de string JSON. El último puede venir cortado a mitad
// de una secuencia de escape, así que se recorta de a un carácter antes de
// rendirse al reemplazo manual.
function desescapar(crudo) {
  let s = crudo
  for (let i = 0; i < 4 && s.length; i++) {
    try { return JSON.parse(`"${s}"`) } catch { s = s.slice(0, -1) }
  }
  return crudo.replace(/\\n/g, '\n').replace(/\\t/g, '\t')
              .replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

const unir = partes => partes.map(x => String(x || '').trim()).filter(Boolean).join('\n\n')

// Los `content` de un envoltorio roto. La comilla de cierre es opcional a
// propósito: el fragmento donde el modelo se quedó sin tokens no la tiene, y es
// justo el que más duele perder porque es el final de la explicación.
const CONTENIDOS = /"content"\s*:\s*"((?:\\.|[^"\\])*)(?:"|$)/g

export function textoSeguroDelBot(respuesta) {
  if (typeof respuesta !== 'string') return ''
  if (!pareceSobreEnvoltorio(respuesta)) return respuesta

  // Envoltorio entero: se desarma prolijo y no hubo truncamiento, así que no
  // corresponde avisar de nada.
  try {
    const obj = JSON.parse(respuesta)
    if (Array.isArray(obj?.segments)) {
      const texto = unir(obj.segments.filter(s => s?.type === 'text').map(s => s.content))
      if (texto) return texto
    }
    if (typeof obj?.reply === 'string' && obj.reply.trim()) return obj.reply
  } catch { /* roto: se rescata abajo */ }

  const partes = []
  for (const m of respuesta.matchAll(CONTENIDOS)) partes.push(desescapar(m[1]))
  const texto = unir(partes)
  // Llegar acá significa que el JSON vino roto. El texto rescatado termina a
  // mitad de frase y callarlo dejaría al cliente creyendo que eso era todo.
  return texto ? texto + AVISO_CORTADA : SIN_RESCATE
}
