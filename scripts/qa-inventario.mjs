// scripts/qa-inventario.mjs — prueba de punta a punta del conversor de inventario
// dentro del chat de BolBot, en un Chromium real.
//
//   npm run qa:inventario                 # todos los escenarios
//   npm run qa:inventario -- mono-fe multi # solo algunos
//   QA_HEADED=1 npm run qa:inventario     # con ventana, para mirarlo
//   QA_DEBUG=1 npm run qa:inventario      # imprime cada pregunta y la opción elegida
//
// Requiere una vez: `npx playwright install chromium`.
//
// Cómo simula a Bold sin salir a internet:
// - https://pos.bold.co/harness es una página falsa (interceptada) que embebe la academia
//   en un iframe y le manda `bold:context`: el portal solo acepta ese mensaje si viene de
//   un origen de Bold (ver js/bold-context.js), así que no alcanza con abrir index.html.
// - https://academia.test/** sirve los archivos de este repo.
// - Toda escritura a Supabase (telemetría, conversaciones) se responde en falso: la base
//   real no recibe nada. Las lecturas (lecciones, ajustes) sí pasan, salvo el ajuste
//   `inventario_ia_activa`: se fuerza a 'true' en los escenarios ia-* y a 'false' en el resto.
// - POST /api/purgar (el purgador con IA) se responde con una IA falsa y determinista
//   (ver iaFalsa), o con un 500 / sin respuesta según el escenario.
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

// Para la IA: «Camisetas» es la misma familia que «Camisa» (la IA falsa las une) y
// «Lts.» es una unidad que el heurístico no reconoce pero la IA traduce a Litros.
const FILAS_IA = FILAS.map(f => f[0] === 'A002' ? [...f.slice(0, 2), 'Camisetas', ...f.slice(3)]
  : f[0] === 'A005' ? [...f.slice(0, 3), 'Lts.', ...f.slice(4)] : f)
const IA_SIN_IVA = escribirLibro('productos-ia.xlsx', FILAS_IA.filter(f => f[6] !== 'nota suelta'), [0, 1, 2, 3, 4, 5])
const IA_MIXTO = escribirLibro('productos-ia-iva-mixto.xlsx', FILAS_IA, [0, 1, 2, 3, 4, 5, 6])

// Archivo grande: 15 000 productos con 120 categorías únicas (40 familias × 3 formas
// de escribirla, que el heurístico NO une) y sin columna de IVA.
const N_GRANDE = 15000
const GRANDE = (() => {
  const formas = k => [`Familia ${k}`, `FAMILIA ${k} surtida`, `Familias ${k} varias`]
  const filas = Array.from({ length: N_GRANDE }, (_, i) => {
    const k = i % 40
    return [`G${String(i).padStart(5, '0')}`, `Producto ${i}`, formas(k)[Math.floor(i / 40) % 3], 'und', 10, 20]
  })
  return escribirLibro('productos-15000.xlsx', filas, [0, 1, 2, 3, 4, 5])
})()

// ---------- IA falsa (lo que respondería n8n/Gemini) ----------
const sinTildes = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
// categorias: une las que comparten las 4 primeras letras y los números
// («Camisa» + «Camisetas», «Familia 3» + «FAMILIA 3 surtida»); el nombre es un miembro.
// simplificar: junta las familias en 5 grupos «Línea N» (por número de familia % 5).
// unidades: un diccionario corto; lo demás queda en null.
const UNIDADES_IA = { lts: 'Litros', und: 'Unidades', mts2: 'Metros cuadrados' }
function iaFalsa(pedido) {
  if (pedido.modo === 'unidades') {
    return { unidades: Object.fromEntries(pedido.unidades.map(u => [u, UNIDADES_IA[sinTildes(u).replace(/\./g, '')] ?? null])) }
  }
  const clave = pedido.modo === 'simplificar'
    ? c => { const n = (String(c).match(/\d+/) || [])[0]; return n === undefined ? `solo:${c}` : `Línea ${Number(n) % 5}` }
    : c => sinTildes(c).split(/\s+/)[0].slice(0, 4) + (String(c).match(/\d+/g) || []).join('-')
  const grupos = new Map()
  for (const c of [...pedido.categorias].sort((a, b) => a.localeCompare(b))) {
    const k = clave(c)
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(c)
  }
  return {
    grupos: [...grupos.entries()].map(([k, miembros]) => ({
      nombre: pedido.modo === 'simplificar' && !k.startsWith('solo:') ? k : miembros[0],
      miembros,
    })),
  }
}

// ---------- Escenarios ----------
const ESCENARIOS = {
  'mono-fe':       { ctx: CTX, sucursal: /^Solo tengo/, fe: 'Sí', productos: SIN_IVA, mono: true, impuesto: true },
  'mono-fe-mixto': { ctx: CTX, sucursal: /^Solo tengo/, fe: 'Sí', productos: IVA_MIXTO, mono: true, impuesto: true, espera: [`Encontré ${PRODUCTOS} producto`] },
  'mono-sin-fe':   { ctx: CTX, sucursal: /^Solo tengo/, fe: 'No', productos: SIN_IVA, mono: true, impuesto: false },
  'multi':         { ctx: CTX, sucursal: /más de una/, fe: 'Sí', productos: IVA_MIXTO, plantilla: PLANTILLA_INV },
  'fallback':      { ctx: CTX, sucursal: /^Solo tengo/, fe: 'Sí', productos: SIN_IVA, plantilla: PLANTILLA_INV, bloquearVendor: true, espera: ['Tuve un problema preparando tu plantilla'] },
  'sin-contexto':  { ctx: null, sucursal: /^Solo tengo/, fe: 'Sí', productos: SIN_IVA, plantilla: PLANTILLA_INV, espera: ['No pude identificar tu sucursal'] },
  'mono-celular':  { ctx: CTX, sucursal: /^Solo tengo/, fe: 'Sí', productos: IVA_MIXTO, mono: true, impuesto: true, movil: true },
  // Purgador con IA (gate encendido). `ia`: cómo responde /api/purgar.
  'ia-acepta':     { ctx: CTX, sucursal: /^Solo tengo/, fe: 'Sí', productos: IA_SIN_IVA, mono: true, impuesto: true, ia: 'ok', movil: true,
                     unida: { de: 'Camisetas', a: 'Camisa' }, resumenes: 1, decisiones: ['categorias:acepto', 'unidades:acepto'],
                     espera: ['Varias eran la misma escrita distinto', 'Traduje tus unidades a las de Bold', 'Lts. → Litros'] },
  'ia-corrige':    { ctx: CTX, sucursal: /^Solo tengo/, fe: 'Sí', productos: IA_SIN_IVA, mono: true, impuesto: true, ia: 'ok',
                     renombrar: { grupo: 'Camisa', a: 'Ropa {de} arriba' }, movil: true, unida: { de: 'Camisetas', a: 'Ropa de arriba' }, resumenes: 1,
                     decisiones: ['categorias:corrigio', 'unidades:acepto'] },
  'ia-falla':      { ctx: CTX, sucursal: /^Solo tengo/, fe: 'Sí', productos: IA_SIN_IVA, mono: true, impuesto: true, ia: 'falla',
                     unida: { de: 'Camisetas', a: 'Camisetas' }, resumenes: 0, decisiones: ['categorias:fallo:ia_fallo', 'unidades:fallo:ia_fallo'] },
  'ia-timeout':    { ctx: CTX, sucursal: /^Solo tengo/, fe: 'Sí', productos: IA_SIN_IVA, mono: true, impuesto: true, ia: 'cuelga',
                     unida: { de: 'Camisetas', a: 'Camisetas' }, resumenes: 0, decisiones: ['categorias:fallo:ia_timeout', 'unidades:fallo:ia_timeout'] },
  'ia-reupload':   { ctx: CTX, sucursal: /^Solo tengo/, fe: 'Sí', productos: IA_MIXTO, mono: true, impuesto: true, ia: 'ok', resubir: 1,
                     unida: { de: 'Camisetas', a: 'Camisa' }, resumenes: 1, decisiones: ['categorias:acepto', 'unidades:acepto'] },
  'ia-15000':      { ctx: CTX, sucursal: /^Solo tengo/, fe: 'Sí', productos: GRANDE, productosN: N_GRANDE, grande: true, mono: true, impuesto: true, ia: 'ok',
                     simplificar: true, resumenes: 1, maxCategoriasIA: 120, categoriasFinales: 5,
                     decisiones: ['categorias:acepto', 'simplificar:acepto'], espera: ['Quedan 40 categorías'] },
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
    (/IVA en algunos productos/.test(pregunta) && E.resubir > (E.resubidas ?? 0) && (E.resubidas = (E.resubidas ?? 0) + 1) && por(/^Vuelvo a subir/)) ||
    (E.renombrar && /Varias eran la misma/.test(pregunta) && por(/^Corregir alguna/)) ||
    (/menos grupos más amplios/.test(pregunta) && por(E.simplificar ? /^Sí, propónmelo/ : /^No, así está bien/)) ||
    (/en Bold es/.test(pregunta) && por(/^Unidades$/)) ||
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
  const harness = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>POS falso</title><body style="margin:0">
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
  const eventosIA = []
  await ctx.route(/supabase\.co/, r => {
    const url = r.request().url()
    // El gate del purgador con IA: encendido solo en los escenarios ia-*.
    if (r.request().method() === 'GET' && /\/app_settings\b/.test(url) && url.includes('inventario_ia_activa')) {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ key: 'inventario_ia_activa', value: E.ia ? 'true' : 'false', env: 'prod' }]) })
    }
    if (['GET', 'HEAD', 'OPTIONS'].includes(r.request().method())) return r.continue()
    escrituras++
    try {
      const b = JSON.parse(r.request().postData() || 'null')
      for (const ev of [b].flat()) if (ev?.event_type === 'tool_ia') eventosIA.push(ev.payload)
    } catch { /* no era JSON */ }
    return r.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
  })
  // Se registra después del de academia.test: Playwright prueba primero la ruta más nueva.
  const pedidosIA = []
  await ctx.route('https://academia.test/api/purgar', async r => {
    const pedido = JSON.parse(r.request().postData() || '{}')
    pedidosIA.push(pedido)
    if (E.ia === 'falla') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' })
    if (E.ia === 'cuelga') return new Promise(() => {}) // nunca responde: el navegador corta a los 15 s
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ resultado: iaFalsa(pedido) }) })
  })

  const page = await ctx.newPage()
  const errores = []
  page.on('pageerror', e => errores.push(e.message))
  // Sin esperar el `load`: si un CDN externo tarda, el goto no se cae; el waitFor de abajo manda.
  await page.goto(E.ctx ? 'https://pos.bold.co/harness' : 'https://academia.test/index.html', { waitUntil: 'commit' })
  const app = E.ctx ? page.frameLocator('#f') : page.mainFrame()

  const input = app.locator('#chatInput')
  await input.waitFor({ state: 'visible', timeout: 60000 })
  await input.fill('quiero subir mi inventario desde excel a bold')
  await app.locator('#sendBtn').click()

  const transcripcion = []
  const preguntasUnidad = []
  let descargas = []
  const t0 = Date.now()
  const ultimoBot = async () => (await app.locator('#chatMessages .msg-bot-wide, #chatMessages .msg-bot').last().innerText().catch(() => '')).replace(/\s+/g, ' ')

  while (!descargas.length && Date.now() - t0 < 180000) {
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
    // Editor del purgador con IA: renombra el grupo pedido antes de tocar «Listo».
    if (E.renombrar && await fila.evaluate(el => !!el.closest('.inv-ia-editor'))) {
      const campo = await fila.evaluate((el, g) => !!el.closest('.inv-ia-editor').querySelector(`input[data-grupo="${CSS.escape(g)}"]`), E.renombrar.grupo)
      verifica(campo, `el editor no trae el grupo «${E.renombrar.grupo}»`)
      if (campo) await app.locator(`.inv-ia-editor input[data-grupo="${E.renombrar.grupo}"]`).last().fill(E.renombrar.a)
    }
    const pregunta = await ultimoBot()
    // Capturas de las burbujas de la IA (para revisar el diseño, sobre todo a 400 px).
    const marca = /Varias eran la misma/.test(pregunta) ? 'resumen' : /Traduje tus unidades/.test(pregunta) ? 'unidades' : /menos grupos más amplios/.test(pregunta) ? 'simplificar' : null
    if (marca) await page.screenshot({ path: path.join(SALIDA, `${nombre}-${marca}${await fila.evaluate(el => el.closest('.inv-ia-editor') ? '-editor' : '')}.png`) })
    if (/No reconozco la unidad de medida/i.test(pregunta)) preguntasUnidad.push(textos)
    const elegido = elegir(E, textos, pregunta)
    if (process.env.QA_DEBUG) console.log(`  [${nombre}] «${pregunta.slice(0, 70)}» → ${elegido} (de ${textos.join(" / ")})`)
    await botones[textos.indexOf(elegido)].click()
  }
  const msTotal = Date.now() - t0
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
  // Purgador con IA.
  const resumenes = cuenta(/Varias eran la misma/g)
  verifica(resumenes <= 1, `mostró ${resumenes} veces el resumen de categorías unidas`)
  if (!E.ia) verifica(!pedidosIA.length, `con el gate apagado igual llamó a /api/purgar ${pedidosIA.length} vez/veces`)
  if (E.resumenes !== undefined) verifica(resumenes === E.resumenes, `el resumen de categorías apareció ${resumenes} vez/veces (se esperaba ${E.resumenes})`)
  if (E.ia) {
    const porModo = m => pedidosIA.filter(p => p.modo === m).length
    verifica(porModo('categorias') === 1, `pidió ${porModo('categorias')} veces el modo categorias (se esperaba 1)`)
    for (const p of pedidosIA) {
      verifica(!('productos' in p) && !('filas' in p), 'el pedido a la IA lleva productos')
      verifica(p.account_id === CTX.accountId, `el pedido a la IA no lleva el account_id del contexto (${p.account_id})`)
      verifica(typeof p.run_id === 'string' && p.run_id.length > 0, 'el pedido a la IA no lleva run_id')
    }
    if (E.maxCategoriasIA) for (const p of pedidosIA.filter(x => x.modo === 'categorias')) verifica(p.categorias.length <= E.maxCategoriasIA, `la IA recibió ${p.categorias.length} categorías (máx. ${E.maxCategoriasIA})`)
    const vistas = eventosIA.map(e => [e.etapa, e.decision, e.codigo].filter(Boolean).join(':'))
    for (const d of E.decisiones ?? []) verifica(vistas.includes(d), `no se mandó la telemetría tool_ia «${d}» (llegaron: ${vistas.join(', ') || 'ninguna'})`)
    verifica(eventosIA.every(e => !Object.keys(e).some(k => /nombre|categor|unidad/i.test(k))), 'la telemetría tool_ia lleva texto del cliente')
  }

  // ---------- Verificaciones de la plantilla descargada ----------
  for (const f of descargas) {
    const wb = XLSX.read(fs.readFileSync(f))
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' })
    const iCab = aoa.findIndex(r => r.some(c => /^Nombre/i.test(String(c))))
    const cab = aoa[iCab].map(String)
    const datos = aoa.slice(iCab + 1).filter(r => r.some(c => String(c).trim() !== ''))
    const col = re => cab.findIndex(c => re.test(c))
    const esperados = E.productosN ?? PRODUCTOS
    verifica(datos.length === esperados, `la plantilla trae ${datos.length} productos (se esperaban ${esperados})`)
    const malos = datos.flat().filter(c => PROHIBIDOS.test(String(c)))
    verifica(!malos.length, `caracteres prohibidos en la plantilla: ${malos.slice(0, 5).join(' ; ')}`)
    const iCat = col(/^Categor/i)
    if (!E.grande) verifica(datos.some(r => r[iCat] === 'Ferretería varios'), '«Ferretería|varios» no quedó como «Ferretería varios»')
    if (E.unida) {
      const iNom = col(/^Nombre/i)
      const fila = datos.find(r => /^Camisa roja/.test(r[iNom]))
      verifica(fila?.[iCat] === E.unida.a, `«${E.unida.de}» quedó como «${fila?.[iCat]}» (se esperaba «${E.unida.a}»)`)
    }
    if (E.categoriasFinales) {
      const distintas = new Set(datos.map(r => r[iCat]))
      verifica(distintas.size === E.categoriasFinales, `la plantilla trae ${distintas.size} categorías (se esperaban ${E.categoriasFinales} tras unir y simplificar)`)
    }
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
  return { nombre, fallas, escrituras, descargas, msTotal }
}

const pedidos = process.argv.slice(2)
const nombres = pedidos.length ? pedidos : Object.keys(ESCENARIOS)
const desconocidos = nombres.filter(n => !ESCENARIOS[n])
if (desconocidos.length) {
  console.error(`Escenarios desconocidos: ${desconocidos.join(', ')}. Hay: ${Object.keys(ESCENARIOS).join(', ')}`)
  process.exit(2)
}

// Un Chromium nuevo por escenario: en máquinas con poca memoria un escenario que se
// cuelga dejaba el navegador trabado y hacía caer a todos los siguientes.
let total = 0
for (const n of nombres) {
  let r
  // Si se cae (timeout de Playwright, no una verificación fallida) se reintenta una vez.
  for (let intento = 1; intento <= 2; intento++) {
    const browser = await chromium.launch({ headless: !process.env.QA_HEADED })
    try { r = await correr(n, ESCENARIOS[n], browser) } catch (e) { r = { nombre: n, fallas: [`se cayó: ${e.message.split('\n')[0]}`], escrituras: 0, cayo: true } }
    finally { await browser.close().catch(() => {}) }
    if (!r.cayo) break
    if (intento === 1) console.log(`  … ${n} se cayó (${r.fallas[0]}); reintento`)
  }
  total += r.fallas.length
  console.log(`${r.fallas.length ? '✗' : '✓'} ${n}${r.fallas.length ? '' : ` (escrituras a Supabase interceptadas: ${r.escrituras})`}${r.msTotal ? ` — ${(r.msTotal / 1000).toFixed(1)} s` : ''}`)
  for (const f of r.fallas) console.log(`    - ${f}`)
}
console.log(`\nCapturas y plantillas descargadas: ${SALIDA}`)
process.exit(total ? 1 : 0)
