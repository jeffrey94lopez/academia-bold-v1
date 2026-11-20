// scripts/qa-inventario.mjs — prueba de punta a punta del conversor de inventario
// dentro del chat de BolBot, en un Chromium real.
//
//   npm run qa:inventario                 # todos los escenarios
//   npm run qa:inventario -- mono-fe multi # solo algunos
//   QA_HEADED=1 npm run qa:inventario     # con ventana, para mirarlo
//   QA_DEBUG=1 npm run qa:inventario      # imprime cada pregunta y la opción elegida
//
// Requiere una vez: `npx playwright install chromium`. Si Playwright no está en node_modules,
// apunta NODE_PATH a una carpeta que lo tenga (NODE_PATH=<dir>/node_modules node scripts/qa-inventario.mjs).
//
// Escenarios de la corrección por fases (nombre → precio → costo → existencia):
//   corrige-todo           escribe un valor válido en cada fase
//   por-linea              usa los controles «Omitir» / «En 0» de cada línea
//   atajos                 «Omitir todas estas filas» y «Dejar todos en 0»
//   sin-existencia         columna sin datos: UNA pregunta, «Dejar todas en 0»
//   corrige-aqui           columna de nombre/precio vacía → «Corregirlos aquí» (sin atajo)
//   reupload-correcciones  «Subir otro archivo» a media corrección: nada del primero queda
//   corrige-50mas / atajo-50mas   más de 50 pendientes: dos rondas, o el atajo cubre todos
// Todos revisan además las categorías copiables (un botón Copiar por categoría), que el
// nombre `<img onerror>` no se ejecute y que no haya un 0 que el cliente no eligió.
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
function escribirLibro(nombre, filas, cols, cabecera = CABECERA) {
  const wb = XLSX.utils.book_new()
  const sel = r => cols.map(i => r[i])
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([sel(cabecera), ...filas.map(sel)]), 'Productos')
  const ruta = path.join(SALIDA, nombre)
  fs.writeFileSync(ruta, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
  return ruta
}
const IVA_MIXTO = escribirLibro('productos-iva-mixto.xlsx', FILAS, [0, 1, 2, 3, 4, 5, 6])
const SIN_IVA = escribirLibro('productos-sin-iva.xlsx', FILAS.filter(f => f[6] !== 'nota suelta'), [0, 1, 2, 3, 4, 5])

// Datos sucios para la corrección por fases (fila de Excel = posición + 2):
// 2 precio «abc», 3 costo vacío, 4 existencia -4, 5 nombre vacío con otros datos,
// 6 costo Y existencia vacíos, 7 nombre con HTML y precio inválido; 1 y 8 están bien.
const XSS = '<img src=x onerror=alert(1)>'
const CAB_SUCIOS = ['Código', 'Nombre', 'Categoría', 'Unidad', 'Costo', 'Precio', 'Existencia']
const FILAS_SUCIAS = [
  ['A001', 'Camisa azul', 'Camisa', 'Unidad', 120, 250, 10],
  ['A002', 'Camisa roja', 'CAMISA', 'unidades', 120, 'abc', 4],
  ['A003', 'Pantalón de tela', 'Pantalones', 'und', '', 400, 6],
  ['A004', 'Arroz 1 kg', 'Abarrotes', 'Kilogramo', 18, 25, -4],
  ['A005', '', 'abarrotes', 'Litro', 40, 55, 3],
  ['A006', 'Cable HDMI', 'Ferretería', 'Unidad', '', 45, ''],
  ['A007', XSS, 'Pantalones', 'und', 15, 'xx', 2],
  ['A008', 'Aceite de oliva', 'Abarrotes', 'Litro', 40, 55, 7],
]
const SUCIOS = escribirLibro('productos-sucios.xlsx', FILAS_SUCIAS, [0, 1, 2, 3, 4, 5, 6], CAB_SUCIOS)
const SUCIOS_SIN_COSTO = escribirLibro('productos-sucios-sin-costo.xlsx', FILAS_SUCIAS, [0, 1, 2, 3, 5, 6], CAB_SUCIOS)
// Nombre y precio vacíos en TODAS las filas (columna entera sin dato).
const SUCIOS_CIEGO = escribirLibro('productos-sin-nombre-ni-precio.xlsx',
  [['C001', '', 'Camisa', 'Unidad', 10, '', 5], ['C002', '', 'Camisa', 'Unidad', 12, '', 6],
   ['C003', '', 'Abarrotes', 'Litro', 14, '', 7], ['C004', '', 'Abarrotes', 'Litro', 16, '', 8]],
  [0, 1, 2, 3, 4, 5, 6], CAB_SUCIOS)
// 60 filas, 55 con costo vacío (más de una página de 50) y 5 con costo.
const N_50 = 60
const SUCIOS_50 = escribirLibro('productos-50mas.xlsx',
  Array.from({ length: N_50 }, (_, i) => [`P${String(i).padStart(3, '0')}`, `Producto ${i}`, `Familia ${i % 3}`, 'und', i < 55 ? '' : 10, 20, 5]),
  [0, 1, 2, 3, 4, 5, 6], CAB_SUCIOS)

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
// Estos archivos no traen la categoría «Ferretería|varios».
const SIN_FERRETERIA = new Set([SUCIOS, SUCIOS_SIN_COSTO, SUCIOS_CIEGO, SUCIOS_50])
const MONO = { ctx: CTX, sucursal: /^Solo tengo/, fe: 'Sí', mono: true, impuesto: true }
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
  // Tras el primer fallo de la IA no se insiste (iaCaida): solo la etapa de categorías reporta el fallo.
  'ia-falla':      { ctx: CTX, sucursal: /^Solo tengo/, fe: 'Sí', productos: IA_SIN_IVA, mono: true, impuesto: true, ia: 'falla',
                     unida: { de: 'Camisetas', a: 'Camisetas' }, resumenes: 0, decisiones: ['categorias:fallo:ia_fallo'] },
  'ia-timeout':    { ctx: CTX, sucursal: /^Solo tengo/, fe: 'Sí', productos: IA_SIN_IVA, mono: true, impuesto: true, ia: 'cuelga',
                     unida: { de: 'Camisetas', a: 'Camisetas' }, resumenes: 0, decisiones: ['categorias:fallo:ia_timeout'] },
  'ia-reupload':   { ctx: CTX, sucursal: /^Solo tengo/, fe: 'Sí', productos: IA_MIXTO, mono: true, impuesto: true, ia: 'ok', resubir: 1,
                     unida: { de: 'Camisetas', a: 'Camisa' }, resumenes: 1, decisiones: ['categorias:acepto', 'unidades:acepto'] },
  'ia-15000':      { ctx: CTX, sucursal: /^Solo tengo/, fe: 'Sí', productos: GRANDE, productosN: N_GRANDE, grande: true, mono: true, impuesto: true, ia: 'ok',
                     simplificar: true, resumenes: 1, maxCategoriasIA: 120, categoriasFinales: 5,
                     decisiones: ['categorias:acepto', 'simplificar:acepto'], espera: ['Quedan 40 categorías'] },
  // Corrección por fases. `fases[campo]`: 'escribir' (por defecto) | 'atajo'. `columna[campo]`: qué elegir
  // cuando la columna entera no trae dato. `alterna[campo]`: [índice de línea, ...] cuyo control «En 0»/«Omitir»
  // se pulsa. `valores[campo]`: texto a escribir (o función de la fila). `cerosEsperados`: 0 que el cliente sí eligió.
  'corrige-todo':  { ...MONO, productos: SUCIOS, productosN: 8, xss: true,
                     valores: { nombre: f => `Nombre ${f}`, precioTotal: '99', costo: '33', existencia: '8' },
                     rondas: { nombre: [1], precioTotal: [2], costo: [2], existencia: [2] },
                     cerosEsperados: { costo: 0, existencia: 0 }, sin: [/Dejaste en 0/, /Omitiste/],
                     revisar: (d, c) => [
                       d.filter(r => String(r[c.nombre]).startsWith('Nombre ')).length === 1 ? null : 'debía haber 1 nombre escrito en la fase de nombre',
                       d.filter(r => Number(r[c.precio]) === 99).length === 2 ? null : 'debía haber 2 precios 99',
                       d.filter(r => Number(r[c.costo]) === 33).length === 2 ? null : 'debía haber 2 costos 33',
                       d.filter(r => Number(r[c.existencia]) === 8).length === 2 ? null : 'debía haber 2 existencias 8',
                       d.some(r => Number(r[c.existencia]) === -4) ? 'quedó la existencia -4' : null,
                     ] },
  'por-linea':     { ...MONO, productos: SUCIOS, productosN: 6, xss: true, movil: true,
                     alterna: { nombre: [0], precioTotal: [1], costo: [0], existencia: [1] },
                     valores: { precioTotal: '99', costo: '33', existencia: '8' },
                     cerosEsperados: { costo: 1, existencia: 1 }, resumen: [/Omitiste 2 fila/, /Dejaste en 0 1 costo\(s\) y 1 existencia\(s\) a propósito/],
                     revisar: (d, c) => [
                       d.filter(r => Number(r[c.precio]) === 99).length === 1 ? null : 'debía haber 1 precio 99 (la fila del <img> se omitió)',
                       d.filter(r => Number(r[c.costo]) === 33).length === 1 ? null : 'debía haber 1 costo 33',
                       d.filter(r => Number(r[c.existencia]) === 8).length === 1 ? null : 'debía haber 1 existencia 8',
                       d.some(r => /img/.test(String(r[c.nombre]))) ? 'el producto omitido llegó a la plantilla' : null,
                     ] },
  'atajos':        { ...MONO, productos: SUCIOS, productosN: 5, xss: true, movil: true,
                     fases: { nombre: 'atajo', precioTotal: 'atajo', costo: 'atajo', existencia: 'atajo' },
                     cerosEsperados: { costo: 2, existencia: 2 }, resumen: [/Omitiste 3 fila/, /Dejaste en 0 2 costo\(s\) y 2 existencia\(s\) a propósito/] },
  'sin-existencia': { ...MONO, productos: SIN_IVA, productosN: PRODUCTOS, preguntasColumna: 1, editores: 0,
                     cerosEsperados: { costo: 0, existencia: PRODUCTOS }, resumen: [new RegExp(`Dejaste en 0 ${PRODUCTOS} existencia\\(s\\) a propósito`)] },
  'corrige-aqui':  { ...MONO, productos: SUCIOS_CIEGO, productosN: 4, movil: true,
                     columna: { nombre: 'lista', precioTotal: 'lista' }, sinAtajo: ['nombre', 'precioTotal'],
                     valores: { nombre: f => `Producto ${f}`, precioTotal: '50' }, preguntasColumna: 2,
                     rondas: { nombre: [4], precioTotal: [4] }, cerosEsperados: { costo: 0, existencia: 0 },
                     revisar: (d, c) => [
                       d.filter(r => /^Producto \d+$/.test(String(r[c.nombre]))).length === 4 ? null : 'debía haber 4 nombres escritos',
                       d.filter(r => Number(r[c.precio]) === 50).length === 4 ? null : 'debía haber 4 precios 50',
                     ] },
  'reupload-correcciones': { ...MONO, productos: SUCIOS_SIN_COSTO, productos2: SIN_IVA, productosN: PRODUCTOS,
                     fases: { precioTotal: 'atajo' }, columna: { costo: 'reupload' }, valores: { nombre: f => `Nombre corregido ${f}` },
                     cerosEsperados: { costo: 0, existencia: PRODUCTOS }, resumen: [new RegExp(`Dejaste en 0 ${PRODUCTOS} existencia\\(s\\) a propósito`)], sin: [/Omitiste/, /Pusiste/],
                     revisar: (d, c) => [d.some(r => /corregido/i.test(String(r[c.nombre]))) ? 'quedó un nombre corregido del primer archivo' : null] },
  'corrige-50mas': { ...MONO, productos: SUCIOS_50, productosN: N_50, valores: { costo: '12' }, rondas: { costo: [50, 5] },
                     cerosEsperados: { costo: 0, existencia: 0 }, sin: [/Dejaste en 0/],
                     revisar: (d, c) => [d.filter(r => Number(r[c.costo]) === 12).length === 55 ? null : 'debía haber 55 costos 12'] },
  'atajo-50mas':   { ...MONO, productos: SUCIOS_50, productosN: N_50, fases: { costo: 'atajo' }, rondas: { costo: [50] },
                     cerosEsperados: { costo: 55, existencia: 0 }, resumen: [/Dejaste en 0 55 costo\(s\) a propósito/] },
}

const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.woff2': 'font/woff2' }
const PROHIBIDOS = /[`´{|}%?°¡!]/

// «Tu archivo no trae <columna>»: por defecto se deja en 0 (costo/existencia). E.columna[campo] lo cambia.
const CAMPO_DE_COLUMNA = { nombre: 'nombre', precio: 'precioTotal', 'precio de venta': 'precioTotal', costo: 'costo', existencia: 'existencia' }
const ELECCION_COLUMNA = { ceros: /^Dejar todas en 0/, mismo: /^Poner el mismo valor/, reupload: /^Subir otro archivo/, lista: /^Corregirlos aquí/ }
function queColumna(E, pregunta) {
  const campo = CAMPO_DE_COLUMNA[(pregunta.match(/Tu archivo no trae (.+?)\./)?.[1] ?? '').toLowerCase()]
  return E.columna?.[campo] ?? 'ceros'
}

// Respuesta a cada pregunta del bot: la primera regla que calce con una opción.
function elegir(E, opciones, pregunta) {
  const por = re => opciones.find(x => re.test(x))
  return (
    por(/^Todos a la vez, con la herramienta/) ||
    (/sucursal/i.test(pregunta) && por(E.sucursal)) ||
    (/facturaci[oó]n electr[oó]nica/i.test(pregunta) && por(new RegExp(`^${E.fe}$`))) ||
    (/Tu archivo no trae/.test(pregunta) && por(ELECCION_COLUMNA[queColumna(E, pregunta)])) ||
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
  // El portapapeles real: el botón Copiar usa la vía normal (navigator.clipboard), no el respaldo.
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://academia.test' }).catch(() => {})
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://pos.bold.co' }).catch(() => {})
  const harness = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>POS falso</title><body style="margin:0">
<iframe id=f src="https://academia.test/index.html" allow="clipboard-read; clipboard-write" style="border:0;width:100vw;height:100vh"></iframe>
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
  const dialogos = []
  page.on('dialog', d => { dialogos.push(d.message()); d.dismiss().catch(() => {}) })
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
  let productos = E.productos       // cambia a E.productos2 tras «Subir otro archivo»
  const editores = []               // {campo, n, sinAtajo, nota} de cada ventana con líneas
  let probadoListo = false
  let copiaVista = null
  const t0 = Date.now()
  const ultimoBot = async () => (await app.locator('#chatMessages .msg-bot-wide, #chatMessages .msg-bot').last().innerText().catch(() => '')).replace(/\s+/g, ' ')

  // Una ventana de la corrección por fases (`fila` = su fila de botones). Escribe, usa los controles por
  // línea o el atajo según el escenario, y pulsa «Listo». La primera vez prueba que «Listo» con los campos
  // vacíos NO avanza y deja el error en línea.
  async function corregir(fila, pregunta) {
    const caja = (await fila.evaluateHandle(el => el.closest('.inv-corr-editor'))).asElement()
    const entradas = await caja.$$('input[data-fila][data-campo]')
    const campo = await entradas[0].getAttribute('data-campo')
    const filasIds = await Promise.all(entradas.map(e => e.getAttribute('data-fila')))
    const atajoBtn = await caja.$('[data-accion="atajo"]')
    editores.push({ campo, n: entradas.length, sinAtajo: !atajoBtn, nota: /de 50 en 50/.test(pregunta) })
    const id = `${nombre}-corr-${campo}${editores.filter(e => e.campo === campo).length > 1 ? '-2' : ''}`
    if (E.movil) { await entradas[0].scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(SALIDA, `${id}.png`) }) }

    if (!probadoListo) {
      probadoListo = true
      const mensajes = () => app.locator('#chatMessages > *').count()
      const antes = await mensajes()
      const listo = await caja.$('[data-accion="listo"]')
      await listo.click()
      await page.waitForTimeout(300)
      const general = (await (await caja.$('.inv-corr-general')).innerText()).trim()
      const enLinea = await caja.$$eval('.inv-corr-linea .inv-corr-error', els => els.filter(e => e.textContent.trim()).length)
      verifica(general.length > 0, `«Listo» con campos vacíos no mostró el error general (fase ${campo})`)
      verifica(enLinea === entradas.length, `«Listo» con campos vacíos mostró ${enLinea} errores en línea (se esperaban ${entradas.length}, fase ${campo})`)
      verifica(await listo.isVisible() && await listo.isEnabled(), `«Listo» con campos vacíos cerró la ventana (fase ${campo})`)
      verifica(await mensajes() === antes, `«Listo» con campos vacíos avanzó: llegaron mensajes nuevos (fase ${campo})`)
      if (E.movil) { await page.screenshot({ path: path.join(SALIDA, `${id}-error.png`) }) }
    }

    const modo = E.fases?.[campo] ?? 'escribir'
    if (modo === 'atajo') {
      verifica(!!atajoBtn, `la fase ${campo} no trae el botón de atajo`)
      if (atajoBtn) {
        const t = (await atajoBtn.innerText()).trim()
        verifica(t === (campo === 'costo' || campo === 'existencia' ? 'Dejar todos en 0' : 'Omitir todas estas filas'), `texto inesperado en el atajo de ${campo}: «${t}»`)
        await atajoBtn.click()
      }
      return
    }
    const alterna = E.alterna?.[campo] ?? []
    for (const [k, i] of alterna.entries()) {
      const ctl = await caja.$(`[data-control="${i}"]`)
      const etiqueta = campo === 'costo' || campo === 'existencia' ? 'En 0' : 'Omitir'
      verifica((await ctl.innerText()).trim() === etiqueta, `el control de la línea ${i} de ${campo} no dice «${etiqueta}»`)
      if (k === 0) {
        // Activar, desactivar y volver a activar: el campo se bloquea y se libera.
        const estados = []
        for (let v = 0; v < 3; v++) { await ctl.click(); estados.push([await ctl.getAttribute('aria-pressed'), await entradas[i].isDisabled()].join('/')) }
        verifica(estados.join(' ') === 'true/true false/false true/true', `el control por línea de ${campo} no alterna bien: ${estados.join(' ')}`)
      } else await ctl.click()
    }
    const valor = E.valores?.[campo] ?? '1'
    for (const [i, e] of entradas.entries()) {
      if (alterna.includes(i)) continue
      await e.fill(typeof valor === 'function' ? valor(filasIds[i]) : valor)
    }
    await (await caja.$('[data-accion="listo"]')).click()
  }

  // Lista de categorías por crear: un solo bloque, un Copiar por categoría, marcas y contador.
  async function probarCopia(pregunta) {
    const declaradas = Number((pregunta.match(/Estas (\d+) categor/) || [])[1])
    const bloques = await app.locator('.inv-copia').count()
    const raiz = app.locator('.inv-copia').last()
    const botonesCopia = raiz.locator('.inv-copia-boton')
    const total = await botonesCopia.count()
    const textos = await raiz.locator('.inv-copia-texto').allInnerTexts()
    verifica(bloques === 1, `hay ${bloques} listas de categorías copiables (se esperaba 1)`)
    verifica(total === declaradas && textos.length === declaradas, `el aviso dice ${declaradas} categorías, hay ${textos.length} filas y ${total} botones Copiar`)
    verifica(new Set(textos).size === textos.length, 'una categoría aparece repetida en la lista')
    verifica((await raiz.locator('.inv-copia-contador').innerText()).trim() === `0 de ${total} copiadas`, 'el contador no arranca en «0 de N copiadas»')
    for (let i = 0; i < total; i++) {
      await botonesCopia.nth(i).scrollIntoViewIfNeeded()
      await botonesCopia.nth(i).click()
      await page.waitForTimeout(40)
      const hecho = await raiz.locator('.inv-copia-fila').nth(i).evaluate(el => el.classList.contains('inv-copia-hecha'))
      const cont = (await raiz.locator('.inv-copia-contador').innerText()).trim()
      verifica(hecho && (await botonesCopia.nth(i).innerText()).trim() === 'Copiada', `la categoría «${textos[i]}» no quedó marcada como copiada`)
      verifica(cont === `${i + 1} de ${total} copiadas`, `contador tras copiar ${i + 1}: «${cont}»`)
      if (i === 0 || i === total - 1) {
        // El texto copiado es el de la categoría (portapapeles real, sin respaldo).
        const leido = await raiz.evaluate(() => navigator.clipboard.readText()).catch(e => `ERROR ${e.message}`)
        verifica(leido === textos[i], `el portapapeles trae «${leido}» y debía traer «${textos[i]}»`)
        verifica(!(await botonesCopia.nth(i).innerText()).includes('Selecciona'), 'Copiar cayó al respaldo «Selecciona y copia»')
      }
    }
    if (E.movil) { await raiz.scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(SALIDA, `${nombre}-categorias.png`) }) }
    return { total, textos }
  }

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
      const archivo = /plantilla/i.test(textos[0]) ? E.plantilla : productos
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
    // Ventana de corrección por fases: líneas con campo, control por línea, atajo y «Listo».
    if (await fila.evaluate(el => !!el.closest('.inv-corr-editor')?.querySelector('input[data-fila]'))) {
      await corregir(fila, pregunta)
      continue
    }
    // Categorías por crear: un botón Copiar por categoría, que marca y cuenta.
    if (/no existen todavía/.test(pregunta) && !copiaVista) copiaVista = await probarCopia(pregunta)
    // Capturas de las burbujas de la IA (para revisar el diseño, sobre todo a 400 px).
    const marca = /Varias eran la misma/.test(pregunta) ? 'resumen' : /Traduje tus unidades/.test(pregunta) ? 'unidades' : /menos grupos más amplios/.test(pregunta) ? 'simplificar' : null
    if (marca) await page.screenshot({ path: path.join(SALIDA, `${nombre}-${marca}${await fila.evaluate(el => el.closest('.inv-ia-editor') ? '-editor' : '')}.png`) })
    if (/No reconozco la unidad de medida/i.test(pregunta)) preguntasUnidad.push(textos)
    const elegido = elegir(E, textos, pregunta)
    if (/Tu archivo no trae/.test(pregunta) && E.productos2 && /^Subir otro archivo/.test(elegido)) productos = E.productos2
    if (process.env.QA_DEBUG) console.log(`  [${nombre}] «${pregunta.slice(0, 70)}» → ${elegido} (de ${textos.join(" / ")})`)
    await botones[textos.indexOf(elegido)].click()
  }
  const msTotal = Date.now() - t0
  await page.waitForTimeout(500)
  const bot = (await app.locator('#chatMessages').innerText()).replace(/\s+/g, ' ')
  transcripcion.push(bot)
  await page.screenshot({ path: path.join(SALIDA, `${nombre}.png`) })
  // HTML inyectado por un nombre del archivo: debe verse como texto, no como elemento.
  const imgInyectadas = await app.locator('#chatMessages img[src="x"]').count().catch(() => -1)
  const bloquesCopia = await app.locator('.inv-copia').count().catch(() => -1)
  await ctx.close()

  // ---------- Verificaciones de la conversación ----------
  const cuenta = re => (bot.match(re) || []).length
  verifica(descargas.length > 0, 'no llegó a descargar la plantilla')
  verifica(cuenta(/Súbela cuando quieras/g) <= 1, `pidió la plantilla de Bold ${cuenta(/Súbela cuando quieras/g)} veces`)
  verifica(cuenta(/facturación electrónica (activa|habilitada)\?/g) <= 1, `preguntó ${cuenta(/facturación electrónica (activa|habilitada)\?/g)} veces por la facturación electrónica`)
  verifica(cuenta(/categor[ií]as?(\(s\))? no existen/g) <= 1, `mostró ${cuenta(/categor[ií]as?(\(s\))? no existen/g)} veces la lista de categorías por crear`)
  // Categorías por crear: una sola lista copiable, nunca el bloque viejo de «unidades por crear».
  verifica(bloquesCopia <= 1, `quedaron ${bloquesCopia} listas copiables de categorías en el chat`)
  if (E.mono) verifica(copiaVista !== null, 'nunca apareció la lista copiable de categorías por crear')
  verifica(!/quedaron en 0/i.test(bot), 'apareció el aviso viejo «quedaron en 0»')
  verifica(!/unidades por crear|Ítems\s*→\s*Unidades/i.test(bot), 'apareció el bloque viejo de «unidades por crear» / «Ítems → Unidades»')
  verifica(!dialogos.length, `se disparó un diálogo del navegador (¿XSS?): ${dialogos.join(' | ')}`)
  verifica(imgInyectadas === 0, `el HTML del nombre se inyectó como elemento (${imgInyectadas} <img>)`)
  if (E.xss) verifica(bot.includes(XSS), 'el nombre con HTML no se mostró como texto en el chat')
  for (const re of E.resumen ?? []) verifica(re.test(bot), `el resumen final no cumple ${re}`)
  for (const re of E.sin ?? []) verifica(!re.test(bot), `el chat no debía decir ${re}`)
  if (E.preguntasColumna !== undefined) verifica(cuenta(/Tu archivo no trae (nombre|precio|costo|existencia)./g) === E.preguntasColumna, `«Tu archivo no trae…» apareció ${cuenta(/Tu archivo no trae (nombre|precio|costo|existencia)./g)} vez/veces (se esperaba ${E.preguntasColumna})`)
  if (E.editores !== undefined) verifica(editores.length === E.editores, `se abrieron ${editores.length} ventanas con líneas (se esperaban ${E.editores})`)
  for (const campo of E.sinAtajo ?? []) verifica(editores.filter(e => e.campo === campo).every(e => e.sinAtajo) && editores.some(e => e.campo === campo), `la fase ${campo} debía abrirse sin atajo`)
  for (const [campo, rondas] of Object.entries(E.rondas ?? {})) {
    const vistas = editores.filter(e => e.campo === campo).map(e => e.n)
    verifica(vistas.join(',') === rondas.join(','), `rondas de ${campo}: ${vistas.join(',') || 'ninguna'} (se esperaban ${rondas.join(',')})`)
    if (rondas.length > 1) verifica(editores.filter(e => e.campo === campo)[0]?.nota === true, `la ronda de ${campo} no avisó «de 50 en 50»`)
  }
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
    if (!E.grande && !SIN_FERRETERIA.has(E.productos)) verifica(datos.some(r => r[iCat] === 'Ferretería varios'), '«Ferretería|varios» no quedó como «Ferretería varios»')
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
    // Ningún 0 automático: los ceros de costo/existencia son solo los que el cliente eligió.
    const columnas = { nombre: col(/^Nombre/i), precio: col(/^Precio Venta/i), costo: col(/^Precio Costo/i), existencia: col(/^Existencia/i) }
    if (process.env.QA_DEBUG) console.log(`  [${nombre}] columnas de la plantilla: ${cab.join(' | ')}`)
    const ceros = i => datos.filter(r => String(r[i]).trim() !== '' && Number(r[i]) === 0).length
    const esperados0 = E.cerosEsperados ?? { costo: 0 }
    if (esperados0.costo !== undefined) verifica(ceros(columnas.costo) === esperados0.costo, `la plantilla trae ${ceros(columnas.costo)} costos en 0 (se esperaban ${esperados0.costo}, los que el cliente eligió)`)
    if (esperados0.existencia !== undefined) verifica(ceros(columnas.existencia) === esperados0.existencia, `la plantilla trae ${ceros(columnas.existencia)} existencias en 0 (se esperaban ${esperados0.existencia}, las que el cliente eligió)`)
    verifica(!datos.some(r => [columnas.costo, columnas.existencia].some(i => String(r[i]).trim() === '')), 'hay costos o existencias vacíos en la plantilla')
    for (const falla of E.revisar?.(datos, columnas) ?? []) if (falla) verifica(false, falla)
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
