// Le hace al bot, desde el admin, la pregunta real de un vacío.
//
// Por qué existe: el chequeo barato (analytics_vacios_cubiertos) dice que hay
// una lección parecida, no que el bot responda. El 2026-10-31, de 9 vacíos de
// Hardware con contenido cerca, 3 seguían fallando. Esto da el veredicto.
//
// Manda el MISMO cuerpo que el portal, con `chatRequestBody` y con el contexto
// de FAQs incluido. Eso no es cosmético: probar sin `faq_context` ya produjo
// una conclusión falsa en este proyecto, porque las FAQs cambian la respuesta
// del bot (ver la FAQ de impresoras que derivaba a Soporte).
//
// NO manda `conversation_id`: no hay conversación del admin que ligar, y
// mandar un id inexistente rompería la FK del lado del registro de vacíos.
import { supabase } from './supabase.js'
import { chatRequestBody } from './clarify.js'
import { aplicaA } from './vertical.js'

const N8N_URL = '/api/chat'

// La copia exacta que n8n sustituye cuando marca knowledge_gap. Se compara
// contra el texto porque la respuesta del webhook no trae la bandera: el
// frontend del portal tampoco la lee, usa data.response.
const COPIA_SIN_INFO = 'no tengo información sobre eso'

export async function probarEnBot(pregunta, vertical, plataforma = 'web') {
  const { data: faqs, error } = await supabase
    .from('preguntas_frecuentes')
    .select('pregunta, respuesta, vertical')
    .order('orden')
    .order('created_at')
  // Sin FAQs la prueba mentiría, así que se corta en vez de probar a medias.
  if (error) throw new Error(`no se pudo leer las FAQ: ${error.message}`)

  const body = chatRequestBody({
    message: pregunta,
    history: [],
    faqContext: (faqs || []).filter(f => aplicaA(f, vertical)),
    clarifyCount: 0,
    seleccion: { vertical: vertical || 'retail', plataforma },
  })

  const res = await fetch(N8N_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`el bot respondió ${res.status}`)

  const data = await res.json()
  const respuesta = data.response || ''
  return {
    respuesta,
    sinInfo: respuesta.toLowerCase().includes(COPIA_SIN_INFO),
    // Una repregunta no es ni éxito ni fracaso: el bot necesita saber el
    // dispositivo antes de responder, y eso se resuelve en el segundo turno.
    // Decirlo evita que alguien la lea como un fallo y deje el vacío abierto.
    repregunta: Boolean(data.asked_clarification),
  }
}
