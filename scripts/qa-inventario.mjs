// scripts/qa-inventario.mjs — prueba de punta a punta del conversor de inventario
// dentro del chat de BolBot, en un Chromium real.
//
//   npm run qa:inventario                 # los 7 escenarios
//   npm run qa:inventario -- mono-fe multi # solo algunos
//   QA_HEADED=1 npm run qa:inventario     # con ventana, para mirarlo
//
// Requiere una vez: `npx playwright install chromium`.
//
// Cómo simula a Bold sin salir a internet:
// - https://pos.bold.co/harness es una página falsa (interceptada) que embebe la academia
//   en un iframe y le manda `bold:context`: el portal solo acepta ese mensaje si viene de
//   un origen de Bold (ver js/bold-context.js), así que no alcanza con abrir index.html.
// - https://academia.test/** sirve los archivos de este repo.
// - Toda escritura a Supabase (telemetría, conversaciones) se responde en falso: la base
//   real no recibe nada. Las lecturas (lecciones, ajustes) sí pasan.
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const { chromium } = require('playwright')
const XLSX = require('../vendor/xlsx.full.min.js')

const SALIDA = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-inventario-'))
const PLANTILLA_INV = path.join(REPO, 'tests/fixtures/bold-inventariables.xlsx')
const WAREHOUSE = 2611
const CTX = {
  type: 'bold:context', accountId: 'qa-001', businessType: 'retail', platform: 'web',
  businessName: 'Tienda QA', user: { id: 'qa', name: 'QA', email: 'qa@example.com', warehouseId: WAREHOUSE },
}

// ---------- Datos de prueba: lo que suele traer un export real ----------
// Categorías duplicadas por mayúsculas, caracteres que Bold rechaza, una unidad que
// Bold no tiene ("Caja"), filas vacías y una fila con basura solo en la columna de IVA.
const CABECERA = ['Código', 'Nombre', 'Categoría', 'Unidad', 'Costo', 'Precio', 'IVA']
const FILAS = [
  ['A001', 'Camisa {azul} talla M!', 'Camisa', 'Unidad', 120, 250, 19],
  ['A002', 'Camisa roja ¿oferta?', 'CAMISA', 'unidades', 120, 260, 19],
  ['A003', 'Pantalón 100% algodón', 'Pantalones', 'und', 200, 400, 5],
  ['', '', '', '', '', '', ''],
  ['', '', '', '', '', '', 'nota suelta'],
  ['A004', 'Arroz 1 kg', 'Abarrotes', 'Kilogramo', 18, 25, ''],
  ['A005', 'Aceite °Premium°', 'abarrotes', 'Litro', 40, 55, ''],
  ['A006', 'Caja de clavos', 'Ferretería|varios', 'Caja', 30, 45, ''],
]
const PRODUCTOS = 6
function escribirLibro(nombre, filas, cols) {
  const wb = XLSX.utils.book_new()
  const sel = r => cols.map(i => r[i])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([sel(CABECERA), ...filas.map(sel)]), 'Productos')
  const ruta = path.join(SALIDA, nombre)
  fs.writeFileSync(ruta, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
  return ruta
}
const IVA_MIXTO = escribirLibro('productos-iva-mixto.xlsx', FILAS, [0, 1, 2, 3, 4, 5, 6])
const SIN_IVA = escribirLibro('productos-sin-iva.xlsx', FILAS.filter(f => f[6] !== 'nota suelta'), [0, 1, 2, 3, 4, 5])

// ---------- Escenarios ----------
const ESCENARIOS = {
  'mono-fe':       { ctx: CTX, sucursal: /^Solo tengo/, fe: 'Sí', productos: SIN_IVA, mono: true, impuesto: true },
  'mono-fe-mixto': { ctx: CTX, sucursal: /^Solo tengo/, fe: 'Sí', productos: IVA_MIXTO, mono: true, impuesto: true, espera: [`Encontré ${PRODUCTOS} producto`] },
  'mono-sin-fe':   { ctx: CTX, sucursal: /^Solo tengo/, fe: 'No', productos: SIN_IVA, mono: true, impuesto: false },
  'multi':         { ctx: CTX, sucursal: /más de una/, fe: 'Sí', productos: IVA_MIXTO, plantilla: PLANTILLA_INV },
  'fallback':      { ctx: CTX, sucursal: /^Solo tengo/, fe: 'Sí', productos: SIN_IVA, plantilla: PLANTILLA_INV, bloquearVendor: true, espera: ['Tuve un problema preparando tu plantilla'] },
  'sin-contexto':  { ctx: null, sucursal: /^Solo tengo/, fe: 'Sí', productos: SIN_IVA, plantilla: PLANTILLA_INV, espera: ['No pude identificar tu sucursal'] },
  'mono-celular':  { ctx: CTX, sucursal: /^Solo tengo/, fe: 'Sí', productos: IVA_MIXTO, mono: true, impuesto: true, movil: true },
}

const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.woff2': 'font/woff2' }
const PROHIBIDOS = /[`´{|}%?°¡!]/

// Respuesta a cada pregunta del bot: la primera regla que calce con una opción.
function elegir(E, opciones, pregunta) {
  const por = re => opciones.find(x => re.test(x))
  return (
    por(/^Todos a la vez, con la herramienta/) ||
    (/sucursal/i.test(pregunta) && por(E.sucursal)) ||
    (/facturaci[oó]n electr[oó]nica/i.test(pregunta) && por(new RegExp(`^${E.fe}$`))) ||
    (/No reconozco la unidad de medida/i.test(pregunta) && por(/^Unidades$/)) ||
    por(/^Ya la tengo descargada/) || por(/^No, seguir con esta/) ||
    por(/^De otro programa/) || por(/^Se ve bien/) ||
    por(/^Eleg[ií] UN IVA para los que faltan/) || por(/^IVA-19$/) ||
    por(/^Sí, controlo/) || por(/^No, déjalos vacíos/) ||
    por(/^Ya las creé, continuar/) || por(/^Continuar$/) ||
    opciones[0]
  )
}

async function correr(nombre, E, browser) {
  const fallas = []
  const verifica = (ok, msg) => { if (!ok) fallas.push(msg) }
  const ctx = await browser.newContext({
    acceptDownloads: true,
    ...(E.movil ? { viewport: { width: 400, height: 860 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } }),
  })
  const harness = `<!doctype html><meta charset=utf-8><title>POS falso</title><body style="margin:0">
<iframe id=f src="https://academia.test/index.html" style="border:0;width:100vw;height:100vh"></iframe>
<script>const CTX=${JSON.stringify(E.ctx)};addEventListener('message',e=>{if(e.data&&e.data.type==='academia:ready'&&CTX)document.getElementById('f').contentWindow.postMessage(CTX,'*')})</script>`
  await ctx.route('https://pos.bold.co/**', r => r.fulfill({ contentType: 'text/html', body: harness }))
  await ctx.route('https://academia.test/**', r => {
    let p = decodeURIComponent(new URL(r.request().url()).pathname)
    if (p === '/') p = '/index.html'
    if (E.bloquearVendor && /\/vendor\/bold-plantilla-base-/.test(p)) return r.abort('failed')
    const f = path.join(REPO, p)
    if (!f.startsWith(REPO + path.sep) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' })
    return r.fulfill({ contentType: TIPOS[path.extname(f)] ?? 'application/octet-stream', body: fs.readFileSync(f) })
  })
  let escrituras = 0
  await ctx.route(/supabase\.co/, r => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(r.request().method())) return r.continue()
    escrituras++
    return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
  })

  const page = await ctx.newPage()
  const errores = []
  page.on('pageerror', e => errores.push(e.message))
  await page.goto(E.ctx ? 'https://pos.bold.co/harness' : 'https://academia.test/index.html')
  const app = E.ctx ? page.frameLocator('#f') : page.mainFrame()

  const input = app.locator('#chatInput')
  await input.waitFor({ state: 'visible', timeout: 20000 })
  await input.fill('quiero subir mi inventario desde excel a bold')
  await app.locator('#sendBtn').click()

  const transcripcion = []
  const preguntasUnidad = []
  let descargas = []
  const t0 = Date.now()
  const ultimoBot = async () => (await app.locator('#chatMessages .msg-bot-wide, #chatMessages .msg-bot').last().innerText().catch(() => '')).replace(/\s+/g, ' ')

  while (!descargas.length && Date.now() - t0 < 120000) {
    await page.waitForTimeout(500)
    const filas = await app.locator('#chatMessages .inv-acciones:not([data-qa])').elementHandles()
    if (!filas.length) continue
    let fila = filas[filas.length - 1]
    for (const h of filas) if ((await h.innerText()).includes('⬇️')) fila = h
    const botones = await fila.$$('button:not([disabled])')
    if (!botones.length) continue
    const textos = []
    for (const b of botones) textos.push((await b.innerText()).split('\n')[0].trim())
    await fila.evaluate(el => el.setAttribute('data-qa', '1'))

    if (textos.some(t => t.startsWith('⬇️'))) {
      for (const [i, t] of textos.entries()) {
        if (!t.startsWith('⬇️')) continue
        const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), botones[i].click()])
        const destino = path.join(SALIDA, `${nombre}-${descargas.length + 1}.xlsx`)
        await dl.saveAs(destino)
        descargas.push(destino)
      }
      break
    }
    if (textos[0].startsWith('📎')) {
      const archivo = /plantilla/i.test(textos[0]) ? E.plantilla : E.productos
      if (!archivo) { verifica(false, `pidió un archivo que este escenario no espera: «${textos[0]}»`); break }
      const [fc] = await Promise.all([page.waitForEvent('filechooser'), botones[0].click()])
      await fc.setFiles(archivo)
      continue
    }
    const pregunta = await ultimoBot()
    if (/No reconozco la unidad de medida/i.test(pregunta)) preguntasUnidad.push(textos)
    const elegido = elegir(E, textos, pregunta)
    await botones[textos.indexOf(elegido)].click()
  }
  await page.waitForTimeout(500)
  const bot = (await app.locator('#chatMessages').innerText()).replace(/\s+/g, ' ')
  transcripcion.push(bot)
  await page.screenshot({ path: path.join(SALIDA, `${nombre}.png`) })
  await ctx.close()

  // ---------- Verificaciones de la conversación ----------
  const cuenta = re => (bot.match(re) || []).length
  verifica(descargas.length > 0, 'no llegó a descargar la plantilla')
  verifica(cuenta(/Súbela cuando quieras/g) <= 1, `pidió la plantilla de Bold ${cuenta(/Súbela cuando quieras/g)} veces`)
  verifica(cuenta(/facturación electrónica (activa|habilitada)\?/g) <= 1, `preguntó ${cuenta(/facturación electrónica (activa|habilitada)\?/g)} veces por la facturación electrónica`)
  verifica(cuenta(/categor[ií]as?(\(s\))? no existen/g) <= 1, `mostró ${cuenta(/categor[ií]as?(\(s\))? no existen/g)} veces la lista de categorías por crear`)
  for (const ops of preguntasUnidad) verifica(ops.includes('Unidades'), `la pregunta de unidad no ofrece «Unidades» (${ops.length} opciones)`)
  for (const t of E.espera ?? []) verifica(bot.includes(t), `el bot nunca dijo «${t}»`)
  verifica(escrituras > 0, 'no se interceptó ninguna escritura a Supabase (¿cambió el cliente?)')
  verifica(!errores.length, `errores de JavaScript: ${errores.join(' | ')}`)

  // ---------- Verificaciones de la plantilla descargada ----------
  for (const f of descargas) {
    const wb = XLSX.read(fs.readFileSync(f))
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
    const iCab = aoa.findIndex(r => r.some(c => /^Nombre/i.test(String(c))))
    const cab = aoa[iCab].map(String)
    const datos = aoa.slice(iCab + 1).filter(r => r.some(c => String(c).trim() !== ''))
    const col = re => cab.findIndex(c => re.test(c))
    verifica(datos.length === PRODUCTOS, `la plantilla trae ${datos.length} productos (se esperaban ${PRODUCTOS})`)
    const malos = datos.flat().filter(c => PROHIBIDOS.test(String(c)))
    verifica(!malos.length, `caracteres prohibidos en la plantilla: ${malos.join(' ; ')}`)
    verifica(datos.some(r => r[col(/^Categor/i)] === 'Ferretería varios'), '«Ferretería|varios» no quedó como «Ferretería varios»')
    verifica(!datos.some(r => /cent[ií]metro/i.test(r[col(/^Unidad/i)])), 'algún producto quedó en Centímetros')
    if (E.mono) {
      verifica(cab.some(c => c === `Existencia Inicial en Sucursal-${WAREHOUSE}`), 'la columna de existencia no es la de la sucursal del contexto')
      verifica(cab.some(c => /^Impuesto/i.test(c)) === E.impuesto, E.impuesto ? 'falta la columna Impuesto*' : 'sobra la columna Impuesto* (sin facturación electrónica)')
      const ins = wb.Sheets[wb.SheetNames.find(n => /Instruc/i.test(n))]
      const textoIns = ins ? XLSX.utils.sheet_to_json(ins, { header: 1, defval: '' }).flat().map(String) : []
      const iCats = textoIns.findIndex(t => /^Categor/i.test(t))
      verifica(ins && textoIns.includes('General'), 'la hoja Instrucciones no trae la categoría General')
      verifica(iCats >= 0, 'la hoja Instrucciones no trae la lista de categorías')
    }
  }
  return { nombre, fallas, escrituras, descargas }
}

const pedidos = process.argv.slice(2)
const nombres = pedidos.length ? pedidos : Object.keys(ESCENARIOS)
const desconocidos = nombres.filter(n => !ESCENARIOS[n])
if (desconocidos.length) {
  console.error(`Escenarios desconocidos: ${desconocidos.join(', ')}. Hay: ${Object.keys(ESCENARIOS).join(', ')}`)
  process.exit(2)
}

const browser = await chromium.launch({ headless: !process.env.QA_HEADED })
let total = 0
for (const n of nombres) {
  let r
  try { r = await correr(n, ESCENARIOS[n], browser) } catch (e) { r = { nombre: n, fallas: [`se cayó: ${e.message.split('\n')[0]}`], escrituras: 0 } }
  total += r.fallas.length
  console.log(`${r.fallas.length ? '✗' : '✓'} ${n}${r.fallas.length ? '' : ` (escrituras a Supabase interceptadas: ${r.escrituras})`}`)
  for (const f of r.fallas) console.log(`    - ${f}`)
}
await browser.close()
console.log(`\nCapturas y plantillas descargadas: ${SALIDA}`)
process.exit(total ? 1 : 0)
