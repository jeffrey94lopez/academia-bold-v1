// Importa las lecciones de periféricos de docs/guia-impresoras/: las 5 de
// impresoras térmicas y la del lector de código de barras.
//
//   node scripts/importar-guia-impresoras.mjs --dry   # valida, no toca la red
//   SUPABASE_SERVICE_KEY=... node scripts/importar-guia-impresoras.mjs
//
// Sube las 12 capturas al bucket `material` (carpeta guia-impresoras/) y crea
// las lecciones en `lecciones` con active=false y sin embedding: nacen
// ocultas, igual que una copia de vertical. Hay que revisarlas en el admin,
// activarlas y darles "regenerar embedding" (ver js/lesson-embed.js). Hasta
// entonces ni el portal ni el bot las ven.
//
// La service key sale de una variable de entorno y no se escribe en ningún
// archivo. Es idempotente: una lección cuyo título ya existe se salta, y las
// imágenes se suben con nombre fijo (upsert).
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { LECCIONES, IMAGENES } from '../docs/guia-impresoras/lecciones.mjs'
import { slugify } from '../js/utils.js'
import { lessonToEmbedText } from '../js/lesson-embed-text.js'

const SUPABASE_URL = 'https://tczcngfhuendmldafbrc.supabase.co'
const BUCKET = 'material'
const CARPETA = 'guia-impresoras'
const CATEGORIA = 'Configuración'
const VERTICAL = 'ambas'
const IMG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../docs/guia-impresoras/img')

const dry = process.argv.includes('--dry')
const KEY = process.env.SUPABASE_SERVICE_KEY
if (!dry && !KEY) {
  console.error('Falta SUPABASE_SERVICE_KEY (o usa --dry para validar sin red).')
  process.exit(1)
}

const headers = (extra = {}) => ({ apikey: KEY, Authorization: `Bearer ${KEY}`, ...extra })

async function rest(pathAndQuery, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, { ...init, headers: headers(init.headers) })
  const body = await res.text()
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${pathAndQuery} → ${res.status} ${body}`)
  return body ? JSON.parse(body) : null
}

async function subirImagenes() {
  const urls = {}
  for (const [n, { archivo }] of Object.entries(IMAGENES)) {
    const destino = `${CARPETA}/${archivo}`
    // Misma forma que getPublicUrl: el path sin escapar es seguro porque los
    // nombres son ascii sin espacios.
    urls[n] = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${destino}`
    if (dry) continue
    const bytes = await readFile(path.join(IMG_DIR, archivo))
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${destino}`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }),
      body: bytes,
    })
    if (!res.ok) throw new Error(`subir ${archivo} → ${res.status} ${await res.text()}`)
    console.log(`  imagen ${n} ok (${bytes.length} B)`)
  }
  return urls
}

function resolverImagenes(bloques, urls) {
  return bloques.map(b => {
    if (b.type !== 'image') return b
    const n = /^@@(\d+)@@$/.exec(b.url)?.[1]
    if (!n || !urls[n]) throw new Error(`imagen sin resolver: ${b.url}`)
    return { ...b, url: urls[n] }
  })
}

console.log(dry ? 'DRY RUN: sin red' : 'Importando…')
const urls = await subirImagenes()

let orden = 0
let existentes = new Set()
if (!dry) {
  const filas = await rest(`lecciones?select=titulo,orden&categoria=eq.${encodeURIComponent(CATEGORIA)}&order=orden.desc`)
  orden = filas.length ? Math.max(...filas.map(f => f.orden ?? 0)) : 0
  existentes = new Set((await rest('lecciones?select=titulo')).map(f => f.titulo))
}

for (const l of LECCIONES) {
  const bloques = resolverImagenes(l.bloques, urls)
  const imgs = bloques.filter(b => b.type === 'image').length
  const embedLen = lessonToEmbedText(l.titulo, CATEGORIA, bloques, null).length
  const resumen = `${bloques.length} bloques, ${imgs} imágenes, ~${embedLen} car. para el bot`
  if (existentes.has(l.titulo)) { console.log(`= «${l.titulo}» ya existe, se salta`); continue }
  if (dry) { console.log(`· «${l.titulo}» [${l.plataforma}] ${resumen}`); continue }

  orden += 1
  const base = slugify(l.titulo)
  for (let intento = 0; intento < 20; intento++) {
    const slug = intento === 0 ? base : `${base}-${intento + 1}`
    try {
      await rest('lecciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          titulo: l.titulo,
          descripcion: l.descripcion,
          contenido: JSON.stringify(bloques),
          orden,
          categoria: CATEGORIA,
          vertical: VERTICAL,
          plataforma: l.plataforma,
          notas: null,
          examen: null,
          curso_orden: null,
          active: false,
          slug,
        }),
      })
      console.log(`+ «${l.titulo}» creada (${resumen}) slug=${slug}`)
      break
    } catch (e) {
      if (!/23505/.test(e.message)) throw e
    }
  }
}
console.log('Listo. Revísalas en el admin, actívalas y regenera el embedding de cada una.')
