// scripts/sniff-bold-context.mjs
// Abre pos.bold.co en un Chromium con head, con perfil persistente para que el
// login sobreviva entre corridas. Inyecta en TODOS los frames un listener que
// imprime los postMessage que empiezan con `bold:` o `academia:`. La idea es
// ver con qué forma real llega el `bold:context` desde el POS — en particular,
// si trae identificadores de bodega/sucursal, que el requerimiento actual no
// contempla.
//
// Uso:
//   node scripts/sniff-bold-context.mjs
//
// Qué hacer en el navegador:
//   1. Loguearte en Bold POS.
//   2. Navegar hasta donde la academia está embebida.
//   3. Mirar esta terminal: se imprime cada mensaje `bold:*` / `academia:*`.
//   4. Ctrl+C para salir.

import { chromium } from 'playwright'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const USER_DATA_DIR = path.join(__dirname, '..', '.playwright-bold-session')
const URL_INICIAL = 'https://pos.bold.co'

const ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
  headless: false,
  viewport: null,
  args: ['--start-maximized'],
})

// Sniffer que se instala en cada frame (incluye iframes cross-origin: Playwright
// corre este script en el "isolated world" de cada frame vía CDP).
await ctx.addInitScript(() => {
  const interesa = (t) =>
    typeof t === 'string' && (t.startsWith('bold:') || t.startsWith('academia:'))

  // Entrantes.
  window.addEventListener('message', (e) => {
    const d = e.data
    if (d && typeof d === 'object' && interesa(d.type)) {
      try {
        console.log('[SNIFF-IN] ' + JSON.stringify({
          direccion: 'recibido',
          en: location.href,
          origen: e.origin,
          data: d,
        }))
      } catch { /* data no serializable */ }
    }
  }, true)

  // Salientes (sobre window.parent — academia:ready, etc.).
  try {
    const parentOrig = window.parent
    if (parentOrig && parentOrig !== window) {
      const pm = parentOrig.postMessage.bind(parentOrig)
      parentOrig.postMessage = function (msg, target, transfer) {
        try {
          if (msg && typeof msg === 'object' && interesa(msg.type)) {
            console.log('[SNIFF-OUT] ' + JSON.stringify({
              direccion: 'enviado-al-parent',
              desde: location.href,
              target,
              data: msg,
            }))
          }
        } catch { /* ignorar */ }
        return pm(msg, target, transfer)
      }
    }
  } catch { /* cross-origin bloqueó el hook: no pasa nada */ }
})

// Imprimir en esta terminal los console.log de CUALQUIER página/frame.
function engancharConsola(page) {
  page.on('console', (msg) => {
    const t = msg.text()
    if (t.startsWith('[SNIFF-IN]') || t.startsWith('[SNIFF-OUT]')) {
      const prefijo = t.startsWith('[SNIFF-IN]') ? '[SNIFF-IN]' : '[SNIFF-OUT]'
      const cuerpo = t.slice(prefijo.length).trim()
      try {
        const obj = JSON.parse(cuerpo)
        console.log('\n' + prefijo, JSON.stringify(obj, null, 2))
      } catch {
        console.log(prefijo, cuerpo)
      }
    }
  })
  page.on('framenavigated', (f) => {
    const u = f.url()
    if (u && u !== 'about:blank') console.log('[frame]', u)
  })
}

ctx.on('page', engancharConsola)
const page = ctx.pages()[0] || await ctx.newPage()
engancharConsola(page)

await page.goto(URL_INICIAL, { waitUntil: 'domcontentloaded' }).catch(() => {})

console.log('\n─────────────────────────────────────────────────────────────')
console.log(' Escuchando bold:* y academia:* en todos los frames.')
console.log(' 1) Logueate en pos.bold.co.')
console.log(' 2) Navegá hasta la academia embebida.')
console.log(' 3) Los payloads van a aparecer acá abajo.')
console.log(' Ctrl+C para salir.')
console.log('─────────────────────────────────────────────────────────────\n')

// No cerrar: dejamos la ventana abierta hasta que el usuario mate el proceso.
await new Promise(() => {})
