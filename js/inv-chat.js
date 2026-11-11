import { crearSesion, ETIQUETA_TIPO } from './inv-sesion.js'
import { CAMPOS } from './inv-origen.js'
import { crearBase, esc, CANCELADO } from './chat-base.js'
import { FORMATOS_CODIGO, crearGeneradorCodigos } from './inv-codigos.js'
import { iniciarCodigos } from './barras-chat.js'
import { telemetriaReal } from './herramientas-telemetria.js'
import { getContextoBold } from './bold-context.js'

const letraColumna = i => { let s = '', n = i; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 } while (n >= 0); return s }
const FIN = Symbol('fin')

const OPCIONES_IVA = [
  { texto: 'IVA-19', valor: 'IVA-19' },
  { texto: 'IVA-5',  valor: 'IVA-5' },
  { texto: 'Excluido', valor: 'EXCLUIDO' },
  { texto: 'Exento',   valor: 'EXENTO' },
]

function contarIva({ mapeo, filas }) {
  // Helper pequeño que cuenta filas con / sin IVA válido. Lo usa el chat para
  // armar el mensaje "X con, Y sin" del caso mixto.
  let con = 0, sin = 0
  if (mapeo.impuesto === undefined) return { con: 0, sin: filas.length }
  for (const f of filas) {
    if (f.every(c => String(c ?? '').trim() === '')) continue
    const v = String(f[mapeo.impuesto] ?? '').trim()
    if (v === '' || isNaN(parseFloat(v.replace(',', '.')))) sin++
    else con++
  }
  return { con, sin }
}

const INTRO_HTML = '¡Claro! Te ayudo a pasar tu inventario a Bold POS paso a paso: conseguir tu plantilla, subir tu archivo de productos, una revisión rápida y la descarga. <b>No necesitas saber nada de Excel, y tus archivos no salen de tu computador.</b>'
// Lo que queda en el historial de la conversación (texto plano).
export const TEXTO_INTRO = INTRO_HTML.replace(/<[^>]+>/g, '')

// `host`: función que devuelve el contenedor de mensajes del chat. `alDesplazar`:
// pide al chat que baje al último mensaje. `via`: desde dónde arrancó (para la métrica).
// Resuelve cuando termina la conversación.
export async function iniciarConversacion({ host, alDesplazar = () => {}, via = 'chat', telemetria = telemetriaReal('inventario') }) {
  const sesion = crearSesion()
  const { bot, usuario, chips, pedirArchivos, pedirCampos, vivo } = crearBase({ host, alDesplazar })

  // Mira la columna de IVA del archivo (si está mapeada) y devuelve:
  // 'completo' (todas las filas con IVA válido), 'vacio' (ninguna) o 'mixto'.
  // Usa parseImpuesto que ya existe en inv-numeros.
  async function detectarEstadoIva() {
    const { parseImpuesto } = await import('./inv-numeros.js')
    const { mapeo, filas } = sesion.estado.origen
    if (mapeo.impuesto === undefined) return 'vacio'
    let con = 0, sin = 0
    for (const f of filas) {
      if (vacia(f)) continue
      const v = parseImpuesto(f[mapeo.impuesto])
      if (v == null) sin++; else con++
    }
    if (con === 0) return 'vacio'
    if (sin === 0) return 'completo'
    return 'mixto'
  }

  const vacia = fila => fila.every(c => String(c ?? '').trim() === '')

  // Modo del conversor: 'mono' (plantilla sintética) o 'multi' (sube la del cliente).
  let modo = null
  let conFE = null  // se setea en el camino mono antes de armar la plantilla sintética.

  async function pasoSucursales() {
    const q = await bot(
      '<b>Antes de empezar, una pregunta importante sobre tu cuenta de Bold:</b>' +
      '<p>No te pregunto dónde querés cargar el inventario ahora. ' +
      'Te pregunto por el <b>total de sucursales activas en tu cuenta de Bold POS</b>.</p>' +
      '<p>¿Tu cuenta tiene más de una sucursal?</p>')
    const r = await chips(q, [
      { texto: 'Solo tengo esta sucursal', detalle: 'Preparo la plantilla por vos con tu sucursal lista. No hace falta descargar nada de Bold.', valor: 'una' },
      { texto: 'Tengo más de una sucursal', detalle: 'Te pido que descargues la plantilla desde Bold POS; la de tu cuenta trae los IDs de todas tus sucursales.', valor: 'mas' },
    ])
    vivo()
    modo = r === 'una' ? 'mono' : 'multi'
    telemetria.paso(modo === 'mono' ? 'sucursales_una' : 'sucursales_mas')
  }

  async function pasoPlantillaSintetica() {
    const ctx = getContextoBold()
    const warehouseId = ctx?.warehouseId
    if (!warehouseId) {
      // Sin warehouseId no podemos armar la plantilla. Caemos a multi.
      await bot('No pude identificar tu sucursal desde Bold. Vamos por el camino manual: descargá tu plantilla desde Bold POS.', { demora: 300 })
      modo = 'multi'
      telemetria.error('plantilla_sintetica', 'sin_warehouse_id')
      return pasoPlantillas()
    }
    const qFE = await bot('¿Tu cuenta de Bold tiene <b>facturación electrónica</b> activa?')
    conFE = await chips(qFE, [{ texto: 'Sí', valor: true }, { texto: 'No', valor: false }])
    vivo()

    const t0 = Date.now()
    const r = await sesion.agregarPlantillaSintetica({ warehouseId, conFE })
    if (r.ok) {
      telemetria.paso('plantilla_sintetica_lista', { ms_total: Date.now() - t0 })
      await bot('Perfecto, te preparé la plantilla para <b>tu sucursal</b>. Ahora pasamos a tu archivo de productos.', { demora: 400 })
      sesion.estado.opciones.isv = conFE  // ya respondió, no re-preguntar en pasoPreguntas.
      return
    }
    telemetria.error('plantilla_sintetica', r.codigo)
    await bot('Tuve un problema preparando tu plantilla. Vamos por el camino manual: descargala desde Bold POS y súbela aquí. Te guío paso a paso.', { demora: 500 })
    modo = 'multi'
    return pasoPlantillas()
  }

// ---------- Paso 1: plantilla(s) de Bold ----------
  // Qué plantillas necesita este cliente (null = lo que suba).
  let necesarias = null

  const TIPOS_PRODUCTO = [
    { texto: 'Productos que cuento (ropa, abarrotes, repuestos…)', detalle: 'Llevan control de existencias: «inventariables».', valor: ['inventariable'] },
    { texto: 'Servicios o cosas que no cuento', detalle: 'No llevan control de existencias: «no inventariables».', valor: ['noinventariable'] },
    { texto: 'De los dos tipos', valor: ['inventariable', 'noinventariable'] },
  ]

  // Guía para quien nunca ha descargado la plantilla: qué tipo es el suyo y dónde se baja.
  async function guiaPlantilla() {
    let q = await bot('Primero dime qué vas a cargar, así sé cuál plantilla te toca descargar:')
    let r = await chips(q, [...TIPOS_PRODUCTO, { texto: 'No estoy seguro', valor: 'duda' }])
    vivo()
    if (r === 'duda') {
      q = await bot('Es fácil: si el producto <b>se acaba y lo cuentas</b> (una camisa, un arroz, un repuesto), es <b>inventariable</b>. Si es un <b>servicio</b> (un corte de pelo, una instalación) o algo que no descuentas del stock, es <b>no inventariable</b>. Si tienes de ambos, descarga las dos.')
      r = await chips(q, TIPOS_PRODUCTO)
      vivo()
    }
    necesarias = r
    const cuales = r.map(t => `<b>${ETIQUETA_TIPO[t]}</b>`).join(' y ')
    const b = await bot(`Perfecto. Entra a tu cuenta de Bold POS y sigue estos pasos:
      <ol class="inv-pasos">
        <li>En el <b>menú de la izquierda</b>, entra a <b>Ítems</b> y elige <b>Lista de ítems</b>.</li>
        <li>Arriba a la derecha, haz clic en el botón <b>Importar</b>.</li>
        <li>Elige <b>Iniciar creación masiva</b>.</li>
        <li>Descarga la plantilla de ítems ${cuales}.</li>
        <li><b>No la llenes ni la cambies</b>: yo la lleno por ti. Vuelve aquí y súbela.</li>
      </ol>
      <p class="inv-nota">Tiene que ser la de <b>tu</b> cuenta: trae tu sucursal, tus categorías y tus impuestos, y una de otra cuenta no te la aceptará.</p>`, { demora: 700 })
    for (;;) {
      const a = await chips(b, [{ texto: 'Ya la descargué ✅', valor: 'lista' }, { texto: 'No encuentro el botón Importar', valor: 'ayuda' }])
      vivo()
      if (a === 'lista') return
      telemetria.error('plantillas', 'sin_boton_importar')
      await bot('Puede ser que tu usuario no tenga permiso para importar: prueba entrando con el usuario del dueño o administrador de la cuenta. Si aun así no te aparece, escríbele a soporte de Bold POS. Cuando la tengas, aquí te espero.', { demora: 500 })
    }
  }

  async function pasoPlantillas() {
    const q0 = await bot('Antes de empezar necesito <b>la plantilla de tu cuenta de Bold POS</b>: ahí vienen tu sucursal, tus categorías y tus impuestos. No te preocupes, te llevo de la mano.')
    const r0 = await chips(q0, [{ texto: 'Guíame para conseguirla', valor: 'guia' }, { texto: 'Ya la tengo descargada', valor: 'tengo' }])
    vivo()
    if (r0 === 'guia') await guiaPlantilla()
    let b = await bot(necesarias
      ? `Cuando quieras, sube ${necesarias.length > 1 ? 'tus <b>dos plantillas</b> (puedes elegirlas juntas)' : 'tu plantilla'}.`
      : 'Súbela cuando quieras. Puede ser la de <b>inventariables</b>, la de <b>no inventariables</b> o las dos juntas.')
    for (;;) {
      const files = await pedirArchivos(b, { boton: 'Subir plantilla de Bold', accept: '.xlsx', multiple: true })
      vivo()
      const errores = []
      for (const f of files) {
        const r = await sesion.agregarPlantilla(f)
        if (r.error) { errores.push(r.error); telemetria.error('plantillas', r.codigo); continue }
        const { info } = r
        await bot(`✅ Plantilla de <b>${ETIQUETA_TIPO[info.tipo]}</b>${info.sucursal ? ` de <b>${esc(info.sucursal)}</b>` : ''}. Tiene <b>${info.listas.categorias.length}</b> categorías${info.tieneIsv ? ' y trae la columna de impuesto (ISV)' : ''}.`, { demora: 300 })
      }
      for (const e of errores) await bot(`⚠️ ${esc(e)}`, { demora: 300 })
      const tipos = Object.keys(sesion.estado.plantillas)
      if (!tipos.length) { b = await bot('Súbeme una plantilla que hayas descargado desde Bold POS (Ítems › Lista de ítems › Importar › Iniciar creación masiva) para continuar.'); continue }
      if (necesarias) {
        const falta = necesarias.filter(t => !tipos.includes(t))
        if (!falta.length) return
        telemetria.error('plantillas', 'plantilla_faltante')
        b = await bot(`Me falta la plantilla de ítems <b>${falta.map(t => ETIQUETA_TIPO[t]).join(' y ')}</b>. Descárgala igual que la anterior y súbela.`)
        continue
      }
      if (tipos.length === 1) {
        const otra = tipos[0] === 'inventariable' ? 'no inventariables' : 'inventariables'
        const q = await bot(`¿Vas a cargar también ítems <b>${otra}</b> (por ejemplo servicios)?`)
        const r = await chips(q, [{ texto: `Sí, subir la de ${otra}`, valor: 'otra' }, { texto: 'No, seguir con esta', valor: 'seguir' }])
        vivo()
        if (r === 'otra') { b = await bot(`Perfecto, súbela cuando quieras.`); continue }
      }
      return
    }
  }

  // ---------- Paso 2: archivo de productos ----------
  async function pasoOrigen() {
    const q = await bot('Ahora necesito <b>la lista de tus productos</b>. ¿De dónde la sacas?')
    const de = await chips(q, [
      { texto: 'De Alegra', valor: 'alegra' },
      { texto: 'De otro programa (Siigo, World Office…)', valor: 'otro' },
      { texto: 'La tengo en un Excel propio', valor: 'excel' },
      { texto: 'No tengo una lista', valor: 'nada' },
    ])
    vivo()
    if (de === 'nada') {
      telemetria.error('origen', 'sin_lista')
      await bot('Entonces lo más rápido es llenar la plantilla de Bold que acabas de descargar, escribiendo tus productos en las filas (nombre, categoría, unidad, costo y precio). Cuando tengas la lista, escríbeme «subir mi inventario» y la revisamos juntos. 👍', { demora: 600 })
      throw FIN
    }
    const AYUDA = {
      alegra: 'En Alegra, exporta tu <b>listado de ítems a Excel</b> y súbelo aquí tal como te lo da el sistema.',
      otro: 'En tu programa, busca la opción de <b>exportar o descargar los productos a Excel o CSV</b> y súbela aquí tal cual: yo reconozco las columnas.',
      excel: 'Sirve cualquier Excel o CSV con una fila de títulos. Lo mínimo: una columna con el <b>nombre</b> y otra con el <b>precio de venta</b>. Si tienes código, categoría, unidad, costo, impuesto o existencias, mejor.',
    }
    let b = await bot(AYUDA[de])
    for (;;) {
      const [file] = await pedirArchivos(b, { boton: 'Subir archivo de productos', accept: '.xlsx,.xls,.csv' })
      vivo()
      const r = await sesion.cargarOrigen(file)
      if (r.error) { telemetria.error('origen', r.codigo); b = await bot(`⚠️ ${esc(r.error)} Prueba con otro archivo.`); continue }
      await bot(`Encontré <b>${r.total}</b> producto(s) en la hoja «${esc(r.hoja)}».`)
      return
    }
  }

  // ---------- Paso 3: columnas ----------
  function listaMapeo() {
    const { mapeo, encabezados } = sesion.estado.origen
    const lineas = CAMPOS.filter(c => mapeo[c.id] !== undefined)
      .map(c => `<li>${esc(c.etiqueta)} ← «${esc(encabezados[mapeo[c.id]].replace(/\s+/g, ' ').trim())}»</li>`)
    return `<ul class="inv-lista">${lineas.join('')}</ul>`
  }

  function editorMapeo(b) {
    return new Promise(resolver => {
      const { encabezados, mapeo, filas } = sesion.estado.origen
      const muestra = col => { for (const f of filas) { const v = f[col]; if (String(v ?? '').trim() !== '') return String(v) } return '' }
      const opciones = sel => ['<option value="">— no usar —</option>'].concat(
        encabezados.map((h, i) => h.trim() === '' ? '' : `<option value="${i}" ${sel === i ? 'selected' : ''}>${letraColumna(i)} · ${esc(h.replace(/\s+/g, ' ').trim().slice(0, 40))}</option>`)).join('')
      const caja = document.createElement('div')
      caja.className = 'inv-editor'
      caja.innerHTML = CAMPOS.map(c => `<label class="inv-campo"><span>${esc(c.etiqueta)}${c.obligatorio ? ' *' : ''}</span>
        <select data-campo="${c.id}">${opciones(mapeo[c.id])}</select><small></small></label>`).join('') +
        '<div class="inv-acciones"><button type="button" class="inv-chipbtn inv-chipbtn-fuerte">Listo</button></div>'
      const ejemplo = () => caja.querySelectorAll('.inv-campo').forEach(l => {
        const v = l.querySelector('select').value
        l.querySelector('small').textContent = v === '' ? '' : `Ej.: ${muestra(Number(v)).slice(0, 36)}`
      })
      ejemplo()
      caja.addEventListener('change', e => {
        const campo = e.target.dataset.campo
        if (!campo) return
        if (e.target.value === '') delete mapeo[campo]; else mapeo[campo] = Number(e.target.value)
        ejemplo()
      })
      caja.querySelector('button').addEventListener('click', () => { caja.querySelector('.inv-acciones').remove(); caja.querySelectorAll('select').forEach(s => { s.disabled = true }); usuario('Listo, ya corregí las columnas'); resolver() })
      b.appendChild(caja)
      alDesplazar()
    })
  }

  async function pasoColumnas() {
    for (;;) {
      const completo = sesion.mapeoCompleto()
      if (!completo) telemetria.error('columnas', 'columnas_incompletas')
      const b = await bot(`Así entendí tus columnas:${listaMapeo()}${completo ? '' : '<b>Me falta el nombre o el precio de venta.</b> Indícame cuáles son.'}`)
      if (completo) {
        const r = await chips(b, [{ texto: 'Se ve bien ✅', valor: 'ok' }, { texto: 'Corregir columnas', valor: 'corregir' }])
        vivo()
        if (r === 'ok') return
      }
      await editorMapeo(b)
      vivo()
    }
  }

  // ---------- Paso 4: preguntas que dependen de la cuenta y del archivo ----------
  async function pasoPreguntas() {
    // Facturación electrónica. En el camino mono ya se preguntó al armar la
    // plantilla sintética; sesion.estado.opciones.isv lo lleva seteado.
    const yaSePregunto = sesion.estado.opciones.isv !== null
    if (!yaSePregunto) {
      const trae = sesion.tieneIsv()
      const qIsv = await bot(`¿Tu cuenta tiene <b>facturación electrónica</b> habilitada? ${trae ? 'Tu plantilla trae la columna de impuesto (ISV), así que parece que sí.' : 'Tu plantilla no trae la columna de impuesto (ISV).'}`)
      const conIsv = (await chips(qIsv, [{ texto: 'Sí', valor: true }, { texto: 'No', valor: false }]))
      vivo()
      sesion.estado.opciones.isv = conIsv
      if (conIsv && !trae) await bot('Entonces descarga de nuevo tu plantilla desde Bold POS (con la facturación electrónica activa) y súbela otra vez; por ahora no puedo llenar el impuesto sin esa columna. Seguimos con lo demás.')
      if (!conIsv && trae) await bot('Entendido: dejaré la columna de impuesto vacía.')
    }

    // Preguntas de IVA general y manejo de mixto (ambos caminos).
    if (sesion.estado.opciones.isv) {
      const estado = await detectarEstadoIva()
      if (estado === 'vacio') {
        const q = await bot('Tu archivo no trae IVA por producto. ¿Qué IVA querés aplicar por defecto a tus ítems?')
        const iva = await chips(q, OPCIONES_IVA)
        vivo()
        sesion.estado.opciones.ivaStrategy = 'por_fila'
        sesion.estado.opciones.ivaGeneral = iva
        telemetria.paso('iva_general_elegido', { iva, camino: modo })
      } else if (estado === 'mixto') {
        const con = contarIva(sesion.estado.origen).con
        const sin = contarIva(sesion.estado.origen).sin
        telemetria.error('iva_mixto', 'detectado', { filas_con: con, filas_sin: sin })
        const q = await bot(`Tu archivo trae IVA en algunos productos (<b>${con}</b> filas) pero no en otros (<b>${sin}</b> filas). ¿Cómo lo resolvemos?`)
        const r = await chips(q, [
          { texto: 'Vuelvo a subir mi archivo con la columna de IVA completa', valor: 'reupload' },
          { texto: 'Elegí UN IVA para los que faltan, respetá los que ya tienen', valor: 'por_fila_fallback' },
          { texto: 'Aplicá UN IVA a TODOS, yo corrijo en Bold después', valor: 'todos_igual' },
        ])
        vivo()
        if (r === 'reupload') {
          telemetria.error('iva_mixto', 'resolucion_reupload')
          await bot('Dale, subí el archivo de nuevo con la columna de IVA completa.')
          await pasoOrigen()
          return pasoPreguntas()  // vuelve a entrar con el archivo nuevo
        }
        const strategy = r === 'todos_igual' ? 'todos_igual' : 'por_fila'
        const qIva = await bot('¿Cuál es ese IVA?')
        const iva = await chips(qIva, OPCIONES_IVA)
        vivo()
        sesion.estado.opciones.ivaStrategy = strategy
        sesion.estado.opciones.ivaGeneral = iva
        const codigoReso = r === 'todos_igual' ? 'resolucion_todos_igual' : 'resolucion_por_fila_con_fallback'
        telemetria.error('iva_mixto', codigoReso, { iva_elegido: iva })
        if (r === 'todos_igual') {
          await bot('Listo. Si querés cambiar el IVA de algunos productos después del import, podés hacerlo en Bold POS con <b>Actualización masiva</b>. La pestaña <b>Instrucciones</b> del xlsx descargado tiene la lista de IVAs válidos.', { demora: 500 })
        }
      }
      // estado === 'completo': no se pregunta, cada fila usa su valor del archivo.
    }

    let r = sesion.recalcular()
    if (r.pendienteInventariable) {
      const q = await bot('Tu archivo no dice qué productos llevan control de existencias. ¿Tus productos son <b>inventariables</b>?')
      sesion.estado.opciones.inventariable = await chips(q, [{ texto: 'Sí, controlo existencias', valor: 'si' }, { texto: 'No, son servicios', valor: 'no' }])
      vivo()
      r = sesion.recalcular()
    }

    for (const u of r.unidadesSinMapa) {
      const unidades = sesion.plantillaReferencia().listas.unidades
      const q = await bot(`No reconozco la unidad de medida «${esc(u)}». ¿Cuál es en Bold POS?`)
      sesion.estado.opciones.unidades[u] = await chips(q, unidades.slice(0, 8).map(x => ({ texto: x, valor: x })))
      vivo()
    }
    r = sesion.recalcular()

    if (r.categoriasFaltantes.length) {
      const q = await bot(`Estas <b>${r.categoriasFaltantes.length}</b> categoría(s) no existen todavía en tu Bold POS, y Bold no importa ítems de una categoría que no exista. Créalas antes de importar:<pre class="inv-cats">${esc(r.categoriasFaltantes.join('\n'))}</pre>`)
      let b = q
      for (;;) {
        const acc = await chips(b, [{ texto: 'Copiar categorías', valor: 'copiar' }, { texto: 'Enviar todo a “General”', valor: 'general' }, { texto: 'Ya las creé, continuar', valor: 'seguir' }])
        vivo()
        if (acc === 'copiar') {
          try { await navigator.clipboard.writeText(r.categoriasFaltantes.join('\n')) } catch { /* sin portapapeles: la lista está a la vista */ }
          b = await bot('Copiadas ✅ Pégalas al crearlas en Bold POS (una por línea).', { demora: 250 })
          continue
        }
        if (acc === 'general') sesion.estado.opciones.categoriasAGeneral = true
        break
      }
      r = sesion.recalcular()
    }

    // Códigos: el que lee la pistola al vender. Opcional en Bold, pero sin él no hay etiquetas.
    if (r.sinCodigo) {
      const todos = r.sinCodigo === r.total
      const varios = r.sinCodigo > 1
      const q = await bot(`${todos ? (varios ? 'Tus productos no traen' : 'Tu producto no trae') : `<b>${r.sinCodigo}</b> de tus ${r.total} productos no traen`} <b>código</b>. El código es lo que lee el lector de barras al vender. ¿Quieres que lo${varios ? 's' : ''} cree por ti?`)
      const crear = await chips(q, [{ texto: 'Sí, créalos', valor: true }, { texto: 'No, déjalos vacíos', valor: false }])
      vivo()
      if (crear) {
        const muestra = Object.values(r.salidas).flat()[0]?.nombre ?? 'Producto'
        const f = await bot('¿Con qué estilo?')
        const formato = await chips(f, FORMATOS_CODIGO.map(x => ({
          texto: x.etiqueta, valor: x.id,
          detalle: x.id === 'personalizado' ? x.detalle : `Ej.: ${crearGeneradorCodigos({ formato: x.id })(muestra)}`,
        })))
        vivo()
        const opciones = { formato, prefijo: '', inicio: 1, relleno: 3 }
        if (formato === 'personalizado') {
          const b = await bot('Cuéntame cómo quieres que empiecen. Con prefijo <b>TIENDA</b> y número inicial <b>001</b> salen TIENDA-001, TIENDA-002…')
          const v = await pedirCampos(b, {
            campos: [
              { id: 'prefijo', etiqueta: 'Prefijo (opcional)', placeholder: 'TIENDA' },
              { id: 'inicio', etiqueta: 'Número inicial', placeholder: '001', valor: '001', requerido: true },
            ],
            resumen: v => `${v.prefijo ? `${v.prefijo}-` : ''}${v.inicio}`,
          })
          vivo()
          opciones.prefijo = v.prefijo
          opciones.inicio = parseInt(v.inicio, 10) || 1
          opciones.relleno = /^\d+$/.test(v.inicio) ? v.inicio.length : 3
        }
        sesion.estado.opciones.codigos = opciones
        r = sesion.recalcular()
        await bot(`✅ Creé <b>${r.codigosCreados}</b> código(s) nuevo(s), sin repetir ninguno de los que ya tenías.`, { demora: 300 })
      }
    }
  }

  function construirCategoriasParaCrear() {
    const cats = new Set()
    for (const tipo of Object.keys(sesion.estado.resultado.salidas)) {
      for (const it of sesion.estado.resultado.salidas[tipo]) {
        if (it.categoria && it.categoria.toLowerCase() !== 'general') cats.add(it.categoria)
      }
    }
    return [...cats].sort()
  }

  function construirUnidadesNoCanonicas() {
    // Las unidades canónicas de Bold que sintetizamos en vendor/ — hardcoded acá
    // para no romper el aislamiento del chat con inv-plantilla-sintetica.
    const CANONICAS = new Set([
      'Centímetros', 'Galónes', 'Gramos', 'Kilogramos', 'Libras', 'Litros',
      'Metros', 'Metros cuadrados', 'Metros cúbicos', 'Miligramos', 'Mililitros',
      'Milímetros', 'Onzas', 'Par', 'Unidades',
    ])
    const uso = new Set()
    for (const tipo of Object.keys(sesion.estado.resultado.salidas)) {
      for (const it of sesion.estado.resultado.salidas[tipo]) {
        if (it.unidad && !CANONICAS.has(it.unidad)) uso.add(it.unidad)
      }
    }
    return [...uso].sort()
  }

  // ---------- Resultado ----------
  async function pasoResultado() {
    const r = sesion.estado.resultado

    // Camino mono: no hay plantilla Bold subida → todo lo que no sea General
    // o una unidad canónica son "faltantes" en Bold. Le damos la lista para crear.
    if (modo === 'mono') {
      const catsParaCrear = construirCategoriasParaCrear()
      const unidadesParaCrear = construirUnidadesNoCanonicas()
      if (catsParaCrear.length) {
        const b = await bot(`Estas <b>${catsParaCrear.length}</b> categorías no existen en tu Bold todavía. Creálas antes de importar (Bold POS → Ítems → Categorías → Crear). Podés pegarlas una por línea:<pre class="inv-cats">${esc(catsParaCrear.join('\n'))}</pre>`, { demora: 500 })
        const acc = await chips(b, [{ texto: 'Copiar categorías', valor: 'copiar' }, { texto: 'Continuar', valor: 'seguir' }])
        vivo()
        if (acc === 'copiar') {
          try { await navigator.clipboard.writeText(catsParaCrear.join('\n')) } catch { /* sin portapapeles */ }
          await bot('Copiadas ✅', { demora: 250 })
        }
      }
      if (unidadesParaCrear.length) {
        const b = await bot(`Estas <b>${unidadesParaCrear.length}</b> unidades que usás no están en la lista estándar de Bold. Creálas antes de importar (Bold POS → Ítems → Unidades):<pre class="inv-cats">${esc(unidadesParaCrear.join('\n'))}</pre>`, { demora: 500 })
        const acc = await chips(b, [{ texto: 'Copiar unidades', valor: 'copiar' }, { texto: 'Continuar', valor: 'seguir' }])
        vivo()
        if (acc === 'copiar') {
          try { await navigator.clipboard.writeText(unidadesParaCrear.join('\n')) } catch { /* ídem */ }
          await bot('Copiadas ✅', { demora: 250 })
        }
      }
    }

    const tipos = Object.keys(r.salidas).filter(t => r.salidas[t].length)
    if (r.total) telemetria.paso('resultado'); else telemetria.error('resultado', 'sin_resultado')
    // Cuántas filas fallaron y por qué (solo el motivo, no el producto).
    const porMotivo = {}
    for (const e of r.errores) porMotivo[e.codigo] = (porMotivo[e.codigo] ?? 0) + 1
    for (const [codigo, filas] of Object.entries(porMotivo)) telemetria.error('resultado', codigo, { filas })
    const lista = (titulo, items) => items.length ? `<details class="inv-detalle"><summary>${items.length} ${titulo}</summary><ul>${
      items.slice(0, 100).map(i => `<li>${i.fila ? `Fila ${i.fila}: ` : ''}${esc(i.mensaje)}</li>`).join('')}${items.length > 100 ? '<li>…</li>' : ''}</ul></details>` : ''
    const texto = r.total
      ? `¡Listo! 🎉 Armé <b>${r.total}</b> producto(s)${r.errores.length ? `; <b>${r.errores.length}</b> fila(s) tienen errores y no se incluyen` : ''}.`
      : 'No pude armar ningún producto con lo que me diste.'
    const b = await bot(`${texto}${lista('error(es): estas filas no se incluyen', r.errores)}${lista('aviso(s) para revisar', r.avisos)}
      ${r.total ? '<p class="inv-nota">Descarga la plantilla e impórtala en Bold POS.</p>' : ''}`, { demora: 700 })
    const fila = document.createElement('div')
    fila.className = 'inv-acciones'
    for (const t of tipos) {
      const btn = document.createElement('button')
      btn.type = 'button'; btn.className = 'inv-chipbtn inv-chipbtn-fuerte'
      btn.textContent = `⬇️ Plantilla de ${ETIQUETA_TIPO[t]} (${r.salidas[t].length})`
      btn.addEventListener('click', async () => {
        btn.disabled = true
        await sesion.descargar(t)
        btn.disabled = false
        telemetria.fin('descarga', {
          tipo: t, productos: r.salidas[t].length, filas_con_error: r.errores.length, avisos: r.avisos.length,
          codigos_creados: r.codigosCreados, con_isv: sesion.estado.opciones.isv === true,
          categorias_faltantes: r.categoriasFaltantes.length, a_general: sesion.estado.opciones.categoriasAGeneral,
        })
      })
      fila.appendChild(btn)
    }
    b.appendChild(fila)
    alDesplazar()
    const items = tipos.flatMap(t => r.salidas[t]).filter(i => i.codigo).map(i => ({ codigo: i.codigo, texto: i.nombre }))
    const sig = await chips(b, [
      ...(r.total ? [{ texto: '🏷️ Crear etiquetas con código de barras', valor: 'etiquetas' }] : []),
      { texto: 'Empezar de nuevo', valor: 'otra' },
    ])
    vivo()
    if (sig === 'otra') {
      await bot('Claro, empecemos de nuevo.')
      return iniciarConversacion({ host, alDesplazar, via: 'reinicio' })
    }
    if (sig === 'etiquetas') {
      await bot(items.length
        ? `Con gusto: uso los <b>${items.length}</b> código(s) de tus productos.`
        : 'Tus productos no tienen código todavía; en el siguiente paso te los creo.', { demora: 300 })
      const nombres = items.length ? null : tipos.flatMap(t => r.salidas[t]).map(i => i.nombre)
      return iniciarCodigos({ host, alDesplazar, items: items.length ? items : null, nombres, via: 'inventario' })
    }
  }

  try {
    telemetria.inicio(via)
    await pasoSucursales()
    await bot(INTRO_HTML)
    if (modo === 'mono') await pasoPlantillaSintetica()
    if (modo === 'multi') await pasoPlantillas()
    telemetria.paso('plantillas')
    await pasoOrigen(); telemetria.paso('origen')
    await pasoColumnas(); telemetria.paso('columnas')
    await pasoPreguntas(); telemetria.paso('preguntas')
    await pasoResultado()
  } catch (e) {
    if (e === CANCELADO || e === FIN) return
    console.error('[inventario] conversación interrumpida:', e)
    telemetria.error('desconocido', 'excepcion')
    await bot('Algo salió mal y no pude seguir. Recarga la página e inténtalo de nuevo.')
  }
}
