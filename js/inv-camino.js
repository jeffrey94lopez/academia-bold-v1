// js/inv-camino.js — cuando alguien habla de cargar o crear productos, BolBot primero
// pregunta CÓMO quiere hacerlo y solo después responde con contenido.
//
// Tres caminos: uno por uno (lección individual), todos a la vez con la herramienta del
// bot, o todos a la vez llenando a mano la plantilla de Bold (lección de carga masiva).
// Los dos que son lección se contestan con el bot de siempre, con una pregunta armada
// para que responda cada pantalla y cada campo.
import { crearBase, CANCELADO } from './chat-base.js'

export const TEXTO_INTRO_CAMINO = 'Claro, te ayudo a cargar tus productos a Bold POS. Hay tres formas de hacerlo; elige la que más te sirva.'

// Lo que se le pregunta al bot para que conteste con todo el detalle de la lección.
export const PREGUNTAS_AL_BOT = {
  individual: 'Explícame paso a paso, con todo el detalle, cómo crear un ítem de forma individual en Bold POS (cada campo y cada pantalla).',
  masivo: 'Explícame paso a paso, con todo el detalle, cómo hacer la creación masiva de ítems con la plantilla de Excel de Bold POS (cómo descargarla, qué va en cada columna y cómo subirla).',
}

const ETIQUETAS = { individual: 'crear tus productos uno por uno', masivo: 'la carga masiva con la plantilla de Bold' }

// Slugs de las lecciones (docs/links-lecciones.csv); la de restaurantes lleva «-2».
const LECCIONES = {
  individual: { retail: 'creacion-de-items-de-forma-individual', restaurantes: 'creacion-de-items-de-forma-individual-2' },
  masivo: { retail: 'creacion-masiva-de-items', restaurantes: 'creacion-masiva-de-items-2' },
}
export const slugLeccion = (camino, vertical) => LECCIONES[camino]?.[vertical] ?? LECCIONES[camino]?.retail ?? null

// acciones: { herramienta(): abre el conversor, preguntar(texto): le pregunta al bot }.
export async function iniciarCamino({ host, alDesplazar = () => {}, vertical = null, acciones }) {
  const { bot, chips, vivo } = crearBase({ host, alDesplazar })

  async function respuestaDeLeccion(camino) {
    await bot(`Perfecto, te explico <b>${ETIQUETAS[camino]}</b> con todo el detalle.`, { demora: 350 })
    vivo()
    await acciones.preguntar(PREGUNTAS_AL_BOT[camino])
    vivo()
    const slug = slugLeccion(camino, vertical)
    const b = await bot(`${slug ? `Si prefieres verlo en la lección completa, con imágenes y video, <a class="inv-enlace" href="/?leccion=${encodeURIComponent(slug)}">ábrela aquí</a>. ` : ''}Y si después necesitas pasar muchos productos de una vez, también puedo ayudarte.`, { demora: 500 })
    const sig = await chips(b, [
      { texto: camino === 'individual' ? 'Tengo más productos: mejor con la herramienta' : 'Mejor que me ayude la herramienta', detalle: 'Yo lleno la plantilla de Bold por ti desde tu Excel.', valor: 'herramienta' },
      { texto: 'Así está bien, gracias', valor: 'fin' },
    ])
    vivo()
    if (sig === 'herramienta') { await bot('¡Con gusto! Empecemos.', { demora: 250 }); await acciones.herramienta(); return }
    await bot('Perfecto. Aquí estoy si necesitas algo más. 👍', { demora: 250 })
  }

  try {
    await bot(TEXTO_INTRO_CAMINO)
    let q = await bot('¿Cómo prefieres hacerlo?', { demora: 350 })
    let camino = await chips(q, [
      { texto: 'Uno por uno', detalle: 'Creas cada producto directo en Bold POS. Lo mejor si son pocos.', valor: 'individual' },
      { texto: 'Todos a la vez, con la herramienta del bot', detalle: 'Subes tu Excel (de Alegra, Siigo o propio) y yo lleno la plantilla de Bold por ti.', valor: 'herramienta' },
      { texto: 'Todos a la vez, llenando la plantilla de Bold a mano', detalle: 'Te explico qué va en cada columna y cómo subirla.', valor: 'masivo' },
      { texto: 'No sé cuál me conviene', valor: 'duda' },
    ])
    vivo()
    if (camino === 'duda') {
      q = await bot('Te ayudo a decidir. ¿Cuántos productos tienes, más o menos, y dónde los tienes?', { demora: 350 })
      const r = await chips(q, [
        { texto: 'Pocos (menos de 15)', valor: 'individual' },
        { texto: 'Muchos, y los tengo en un Excel o en otro sistema', valor: 'herramienta' },
        { texto: 'Muchos, pero no los tengo en ningún archivo', valor: 'masivo' },
      ])
      vivo()
      const porQue = {
        individual: 'Con pocos productos lo más rápido es crearlos <b>uno por uno</b>.',
        herramienta: 'Como ya los tienes en un archivo, lo más rápido es la <b>herramienta del bot</b>: yo lleno la plantilla por ti.',
        masivo: 'Sin un archivo previo, lo mejor es llenar <b>la plantilla de Bold</b> directamente; te explico cada columna.',
      }
      await bot(porQue[r], { demora: 400 })
      camino = r
    }
    vivo()
    if (camino === 'herramienta') await acciones.herramienta()
    else await respuestaDeLeccion(camino)
  } catch (e) {
    if (e === CANCELADO) return
    console.error('[inventario] camino interrumpido:', e)
  }
}
