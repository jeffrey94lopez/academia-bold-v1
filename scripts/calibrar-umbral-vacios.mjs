// Desechable: agrupa las preguntas históricas con varios umbrales de coseno
// para poder elegir el umbral MIRANDO los grupos. No es parte del producto.
//
// Uso:
//   N8N_EMBED_TEXT_URL=https://n8n.mplasesores.com/webhook/embed-text \
//   N8N_EMBED_TOKEN=... \
//     node scripts/calibrar-umbral-vacios.mjs <archivo.tsv>
//
// El TSV es `texto<TAB>vertical` por línea, exportado de:
//   select coalesce(summary, <primer mensaje del usuario>) , coalesce(category, topic), vertical
//     from bodi_conversations where knowledge_gap is true;
//
// CAVEAT que hay que tener presente al leer la salida: esos textos son los
// RESÚMENES que escribe el LLM, no las preguntas textuales del usuario (esas no
// existían cuando se exportó). Todos comparten el preámbulo "El usuario
// pregunta cómo…", que infla la similitud de todo contra todo. Por eso el
// script lo recorta antes de embeber. Aun así el umbral que salga es
// PROVISIONAL: hay que revisarlo con preguntas reales cuando el registro lleve
// unas semanas.
import { readFileSync } from 'node:fs'

const URL_EMBED = process.env.N8N_EMBED_TEXT_URL
const TOKEN = process.env.N8N_EMBED_TOKEN
if (!URL_EMBED || !TOKEN) {
  console.error('Faltan N8N_EMBED_TEXT_URL / N8N_EMBED_TOKEN')
  process.exit(1)
}

// Recorta el preámbulo del resumen para dejar la duda en sí.
// "El usuario pregunta cómo cerrar la caja" -> "cerrar la caja"
const PREAMBULO = /^(el usuario\s+)?(pregunt[óa]|consulta|desea|necesita|reporta|solicita|busca|no puede|actualiz[óa])\b[\s,]*(que\s+|sobre\s+|por\s+|si\s+)?(c[óo]mo\s+)?/i

// La CODA cuenta lo que hizo el bot, no lo que preguntó el usuario. Dejarla
// hace que los grupos se formen por "derivado a soporte" o "no tiene
// información", uniendo preguntas de temas distintos. Verificado: con la coda
// puesta, "registrar una deuda con un proveedor" y "agregar una cuenta
// bancaria" caían en el mismo vacío.
const CODA = /(,?\s*(pero|y|aunque)\s+(el\s+)?(bot|la\s+funci[óo]n|el\s+sistema)|;\s*el\s+bot|,\s*siendo\s+derivad|,?\s*y\s+fue\s+derivad|,\s*lo\s+cual\s+el\s+bot|,\s*lo\s+que\s+llev[óo]\s+a|\s+y\s+(el\s+bot|es\s+redirigido)).*$/i

export function limpiar(texto) {
  let t = String(texto || '').trim().replace(/\s+/g, ' ')
  const antes = t
  t = t.replace(PREAMBULO, '')
  const sinCoda = t.replace(CODA, '').trim()
  if (sinCoda.length >= 12) t = sinCoda
  // Si el recorte dejó algo demasiado corto, era un falso positivo: devolver el original.
  return t.length >= 8 ? t : antes
}

const filas = readFileSync(process.argv[2], 'utf8')
  .split('\n')
  .map(l => l.split('\t'))
  .filter(p => p.length >= 2 && p[0].trim())
  .map(p => ({
    original: p[0].trim(),
    texto: limpiar(p[0]),
    vertical: p[1].trim() === 'null' ? null : p[1].trim(),
  }))

async function embed(text, intento = 0) {
  const res = await fetch(URL_EMBED, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': TOKEN },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    // La cuota de embeddings de Vertex es baja: un reintento con espera.
    if (intento === 0) {
      await new Promise(r => setTimeout(r, 6000))
      return embed(text, 1)
    }
    throw new Error(`embed ${res.status}`)
  }
  const { embedding } = await res.json()
  if (!Array.isArray(embedding) || embedding.length !== 768) {
    throw new Error(`embedding inesperado: ${embedding?.length}`)
  }
  return embedding
}

const coseno = (a, b) => {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

// MISMO algoritmo que la RPC registrar_pregunta_sin_respuesta: ancla fija (el
// embedding de la primera pregunta del grupo, que NO se recalcula), se compara
// contra el ancla del vacío más cercano, y se filtra por vertical. Si acá se
// agrupara distinto que en la base, el umbral calibrado no significaría nada.
function agrupar(items, umbral) {
  const vacios = []
  for (const it of items) {
    let mejor = null, mejorSim = -1
    for (const v of vacios) {
      if ((v.vertical || null) !== (it.vertical || null)) continue
      const s = coseno(v.ancla, it.emb)
      if (s > mejorSim) { mejorSim = s; mejor = v }
    }
    if (mejor && mejorSim > umbral) mejor.textos.push(it.texto)
    else vacios.push({ ancla: it.emb, vertical: it.vertical || null, textos: [it.texto] })
  }
  return vacios
}

console.error(`Embebiendo ${filas.length} textos…`)
const items = []
for (const [i, f] of filas.entries()) {
  try {
    items.push({ ...f, emb: await embed(f.texto) })
  } catch (e) {
    console.error(`  ✗ ${i}: ${e.message} — ${f.texto.slice(0, 50)}`)
  }
  if (i % 20 === 0) console.error(`  ${i}/${filas.length}`)
  await new Promise(r => setTimeout(r, 250))
}
console.error(`Embebidos ${items.length}/${filas.length}\n`)

for (const umbral of [0.70, 0.75, 0.80, 0.85, 0.90]) {
  const vacios = agrupar(items, umbral).sort((a, b) => b.textos.length - a.textos.length)
  const conVarias = vacios.filter(v => v.textos.length > 1).length
  const agrupadas = vacios.reduce((s, v) => s + (v.textos.length > 1 ? v.textos.length : 0), 0)
  console.log(`\n${'='.repeat(74)}`)
  console.log(`UMBRAL ${umbral} → ${vacios.length} vacíos | ${conVarias} con más de una pregunta | ${agrupadas}/${items.length} preguntas agrupadas`)
  for (const v of vacios.filter(x => x.textos.length > 1).slice(0, 10)) {
    console.log(`\n  [${v.textos.length}] ${v.textos[0].slice(0, 86)}`)
    for (const t of v.textos.slice(1, 6)) console.log(`      · ${t.slice(0, 86)}`)
  }
}
