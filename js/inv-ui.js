// js/inv-ui.js — conversor de inventario como componente: se monta en inventario.html
// y también dentro de una burbuja del chat de BolBot. Todo corre en el navegador;
// nada se sube a ningún servidor.
import { leerLibro, escribirPlantilla, descargar } from './inv-excel.js'
import { leerPlantilla } from './inv-plantilla.js'
import { elegirHoja, CAMPOS } from './inv-origen.js'
import { convertir } from './inv-convertir.js'

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const letraColumna = i => { let s = '', n = i; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 } while (n >= 0); return s }
const ETIQUETA_TIPO = { inventariable: 'Inventariables', noinventariable: 'No inventariables' }
const RUTA_XLSX = 'vendor/xlsx.full.min.js'

// SheetJS pesa ~950 KB: se carga solo cuando alguien va a usar el conversor
// (el chat no debe pagarlo en cada visita).
let cargaXlsx = null
export function cargarXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX)
  cargaXlsx ??= new Promise((ok, fallo) => {
    const s = document.createElement('script')
    s.src = RUTA_XLSX
    s.onload = () => ok(window.XLSX)
    s.onerror = () => { cargaXlsx = null; fallo(new Error('No se pudo cargar el lector de Excel.')) }
    document.head.appendChild(s)
  })
  return cargaXlsx
}

const PLANTILLA_HTML = `
  <section class="inv-paso">
    <h2><span class="inv-num">1</span> Tu plantilla de Bold POS</h2>
    <p class="inv-ayuda">Descárgala desde tu cuenta de Bold POS (cada cuenta tiene la suya). Sube la de <b>ítems inventariables</b>,
      la de <b>no inventariables</b> o las dos, según lo que vayas a cargar.</p>
    <label class="inv-drop">
      <span>Elegir plantilla(s) de Bold (.xlsx)</span>
      <input data-inv="plantillas" type="file" accept=".xlsx" multiple>
    </label>
    <div data-inv="plantillas-estado" class="inv-chips" aria-live="polite"></div>
  </section>
  <section class="inv-paso">
    <h2><span class="inv-num">2</span> El archivo de tus productos</h2>
    <p class="inv-ayuda">Excel o CSV de tu sistema anterior (Alegra, Siigo, un Excel propio…). Si viene de Alegra, exporta el listado de ítems a Excel.</p>
    <label class="inv-drop">
      <span>Elegir archivo de productos (.xlsx, .xls o .csv)</span>
      <input data-inv="origen" type="file" accept=".xlsx,.xls,.csv">
    </label>
    <div data-inv="origen-estado" class="inv-chips" aria-live="polite"></div>
  </section>
  <section class="inv-paso" data-inv="revision" hidden>
    <h2><span class="inv-num">3</span> Revisa cómo entendimos tu archivo</h2>
    <div data-inv="revision-cuerpo"></div>
  </section>
  <section class="inv-paso" data-inv="resultado" hidden>
    <h2><span class="inv-num">4</span> Descarga tu plantilla lista</h2>
    <div data-inv="resultado-cuerpo" aria-live="polite"></div>
  </section>`

// Monta el conversor dentro de `raiz`. `onResultado(resumen)` se llama cada vez que
// cambia el resultado (el chat lo usa para que el bot cuente qué entendió).
export function montarConversor(raiz, { onResultado } = {}) {
  raiz.innerHTML = PLANTILLA_HTML
  const q = n => raiz.querySelector(`[data-inv="${n}"]`)
  const estado = {
    plantillas: {},   // { inventariable?: {info, wb}, noinventariable?: {info, wb} }
    origen: null,     // { nombre, hoja, encabezados, mapeo, filas }
    opciones: { formatoNumero: 'auto', inventariable: null, isv: null, unidades: {}, categoriasAGeneral: false },
    resultado: null,
  }
  let XLSX = null
  const listo = cargarXlsx().then(x => { XLSX = x }).catch(() => {
    q('plantillas-estado').innerHTML = '<div class="inv-chip inv-mal">No se pudo cargar el lector de Excel. Recarga la página.</div>'
  })

  async function leerArchivo(file) {
    await listo
    const csv = /\.csv$/i.test(file.name)
    return leerLibro(XLSX, await file.arrayBuffer(), { csv })
  }

  // ---------- Paso 1: plantillas de Bold ----------
  q('plantillas').addEventListener('change', async e => {
    const avisos = []
    for (const file of e.target.files) {
      try {
        const { wb, hojas } = await leerArchivo(file)
        const info = leerPlantilla(hojas)
        if (!info) { avisos.push(`"${file.name}" no parece una plantilla de ítems de Bold POS.`); continue }
        estado.plantillas[info.tipo] = { info, wb, nombre: file.name }
      } catch { avisos.push(`No se pudo leer "${file.name}".`) }
    }
    e.target.value = ''
    const chips = Object.entries(estado.plantillas).map(([tipo, { info }]) =>
      `<div class="inv-chip inv-ok"><b>${ETIQUETA_TIPO[tipo]}</b> · ${esc(info.sucursal || 'sin existencias')}
         · ${info.listas.categorias.length} categorías${info.tieneIsv ? ' · con ISV' : ''}</div>`)
    const malos = avisos.map(a => `<div class="inv-chip inv-mal">${esc(a)}</div>`)
    q('plantillas-estado').innerHTML = chips.concat(malos).join('')
    actualizar()
  })

  // ---------- Paso 2: archivo de productos ----------
  q('origen').addEventListener('change', async e => {
    const file = e.target.files[0]
    if (!file) return
    const caja = q('origen-estado')
    try {
      const { hojas } = await leerArchivo(file)
      const mejor = elegirHoja(hojas)
      if (!mejor) {
        estado.origen = null
        caja.innerHTML = `<div class="inv-chip inv-mal">No encontré una tabla de productos en "${esc(file.name)}". Revisa que tenga una fila de encabezados con al menos Nombre y Precio.</div>`
        e.target.value = ''
        return actualizar()
      }
      const filas = hojas[mejor.nombre].slice(mejor.fila + 1).map((f, i) => Object.assign([...f], { __fila: mejor.fila + 2 + i }))
      estado.origen = { nombre: file.name, hoja: mejor.nombre, encabezados: mejor.encabezados, mapeo: mejor.mapeo, filas }
      estado.opciones.unidades = {}
      estado.opciones.inventariable = null
      caja.innerHTML = `<div class="inv-chip inv-ok"><b>${esc(file.name)}</b> · hoja "${esc(mejor.nombre)}" · ${filas.filter(f => f.some(c => String(c).trim() !== '')).length} filas</div>`
    } catch {
      estado.origen = null
      caja.innerHTML = `<div class="inv-chip inv-mal">No se pudo leer "${esc(file.name)}".</div>`
    }
    e.target.value = ''
    actualizar()
  })

  // ---------- Pasos 3 y 4 ----------
  function actualizar() {
    const hayDatos = estado.origen && Object.keys(estado.plantillas).length
    q('revision').hidden = !hayDatos
    q('resultado').hidden = !hayDatos
    if (!hayDatos) return
    const ref = (estado.plantillas.inventariable ?? estado.plantillas.noinventariable).info
    const tieneIsv = Object.values(estado.plantillas).some(p => p.info.tieneIsv)
    if (estado.opciones.isv === null) estado.opciones.isv = tieneIsv
    estado.resultado = convertir({
      filas: estado.origen.filas,
      mapeo: estado.origen.mapeo,
      plantillas: Object.fromEntries(Object.entries(estado.plantillas).map(([t, p]) => [t, p.info])),
      opciones: { ...estado.opciones },
    })
    pintarRevision(ref, tieneIsv)
    pintarResultado()
    onResultado?.(resumenDe(estado.resultado))
  }

  function muestra(col) {
    for (const f of estado.origen.filas) { const v = f[col]; if (String(v ?? '').trim() !== '') return String(v) }
    return ''
  }

  function pintarRevision(ref, tieneIsv) {
    const { encabezados, mapeo } = estado.origen
    const r = estado.resultado
    const opcionesCol = sel => ['<option value="">— no usar —</option>'].concat(
      encabezados.map((h, i) => h.trim() === '' ? '' :
        `<option value="${i}" ${sel === i ? 'selected' : ''}>${letraColumna(i)} · ${esc(h.replace(/\s+/g, ' ').trim().slice(0, 50))}</option>`)).join('')
    const filasMapeo = CAMPOS.map(c => {
      const col = mapeo[c.id]
      return `<tr><td>${esc(c.etiqueta)}${c.obligatorio ? ' *' : ''}</td>
        <td><select data-campo="${c.id}" aria-label="Columna para ${esc(c.etiqueta)}">${opcionesCol(col)}</select></td>
        <td class="inv-muestra">${col === undefined ? '' : esc(muestra(col)).slice(0, 40)}</td></tr>`
    }).join('')

    const preguntas = []
    preguntas.push(`<fieldset class="inv-pregunta"><legend>¿Tu cuenta tiene facturación electrónica habilitada?</legend>
      <label><input type="radio" name="isv" value="si" ${estado.opciones.isv ? 'checked' : ''}> Sí</label>
      <label><input type="radio" name="isv" value="no" ${estado.opciones.isv ? '' : 'checked'}> No</label>
      ${estado.opciones.isv && !tieneIsv ? '<p class="inv-alerta">Tu plantilla no trae la columna de impuesto (ISV). Descárgala de nuevo desde Bold POS con la facturación electrónica activa y súbela otra vez; mientras tanto el impuesto no se llena.</p>' : ''}
      ${!estado.opciones.isv && tieneIsv ? '<p class="inv-alerta">Tu plantilla sí trae la columna de impuesto; con "No" se deja vacía.</p>' : ''}
    </fieldset>`)
    if (r.pendienteInventariable) {
      preguntas.push(`<fieldset class="inv-pregunta"><legend>Tu archivo no dice qué productos llevan control de existencias. ¿Son inventariables?</legend>
        <label><input type="radio" name="inv" value="si" ${estado.opciones.inventariable === 'si' ? 'checked' : ''}> Sí, controlo existencias</label>
        <label><input type="radio" name="inv" value="no" ${estado.opciones.inventariable === 'no' ? 'checked' : ''}> No, son servicios o no controlo existencias</label>
      </fieldset>`)
    }
    if (r.unidadesSinMapa.length) {
      const unidades = ref.listas.unidades
      preguntas.push(`<div class="inv-pregunta inv-aviso"><b>Unidades de medida que no reconocemos</b>
        ${r.unidadesSinMapa.map(u => `<label class="inv-unidad">«${esc(u)}» equivale a
          <select data-unidad="${esc(u)}"><option value="">Elige…</option>${unidades.map(x => `<option>${esc(x)}</option>`).join('')}</select></label>`).join('')}
        <p class="inv-ayuda">Mientras no elijas, se usa "${esc(unidades.find(x => /unidad/i.test(x)) ?? unidades[0] ?? 'Unidades')}".</p></div>`)
    }
    if (r.categoriasFaltantes.length) {
      preguntas.push(`<div class="inv-pregunta inv-aviso"><b>${r.categoriasFaltantes.length} categoría(s) no existen todavía en tu Bold POS</b>
        <p class="inv-ayuda">Créalas en Bold POS <b>antes</b> de importar (Bold no importa ítems de una categoría inexistente). Copia la lista y pégala al crearlas:</p>
        <textarea data-inv="cats" readonly rows="${Math.min(r.categoriasFaltantes.length, 8)}">${esc(r.categoriasFaltantes.join('\n'))}</textarea>
        <div class="inv-fila"><button type="button" data-inv="copiar" class="inv-btn inv-btn-sec">Copiar categorías</button><span data-inv="copiado" class="inv-ayuda" aria-live="polite"></span></div>
        <label><input type="checkbox" data-inv="cats-general"> Mejor enviar estos ítems a la categoría "General"</label></div>`)
    } else if (estado.opciones.categoriasAGeneral) {
      preguntas.push(`<label class="inv-pregunta"><input type="checkbox" data-inv="cats-general" checked> Enviar a "General" los ítems de categorías que no existen</label>`)
    }

    q('revision-cuerpo').innerHTML = `
      <table class="inv-tabla"><thead><tr><th>Dato de Bold POS</th><th>Columna de tu archivo</th><th>Ejemplo</th></tr></thead><tbody>${filasMapeo}</tbody></table>
      <label class="inv-formato">Formato de números en tu archivo
        <select data-inv="formato">
          <option value="auto" ${estado.opciones.formatoNumero === 'auto' ? 'selected' : ''}>Automático</option>
          <option value="punto" ${estado.opciones.formatoNumero === 'punto' ? 'selected' : ''}>El punto es decimal (1,234.50)</option>
          <option value="coma" ${estado.opciones.formatoNumero === 'coma' ? 'selected' : ''}>La coma es decimal (1.234,50)</option>
        </select></label>
      ${preguntas.join('')}`
  }

  function pintarResultado() {
    const r = estado.resultado
    const tipos = Object.keys(r.salidas).filter(t => r.salidas[t].length)
    const botones = tipos.map(t =>
      `<button type="button" class="inv-btn" data-descargar="${t}">Descargar plantilla de ${ETIQUETA_TIPO[t].toLowerCase()} (${r.salidas[t].length})</button>`).join('')
    const lista = (titulo, items, clase) => items.length ? `<details class="inv-detalle ${clase}"><summary>${items.length} ${titulo}</summary><ul>${
      items.slice(0, 200).map(i => `<li>${i.fila ? `Fila ${i.fila}: ` : ''}${esc(i.mensaje)}</li>`).join('')}${items.length > 200 ? '<li>…</li>' : ''}</ul></details>` : ''
    q('resultado-cuerpo').innerHTML = `
      <p class="inv-resumen">${r.total ? `<b>${r.total}</b> ítem(s) listos.` : 'Todavía no hay ítems listos.'}
        ${r.errores.length ? `<b>${r.errores.length}</b> fila(s) con error no se incluyen.` : ''}</p>
      <div class="inv-fila">${botones}</div>
      ${lista('error(es): estas filas no se exportan', r.errores, 'inv-det-mal')}
      ${lista('aviso(s) para revisar', r.avisos, 'inv-det-aviso')}`
  }

  // ---------- Eventos (delegados: el contenido se repinta en cada cambio) ----------
  q('revision-cuerpo').addEventListener('change', e => {
    const t = e.target
    if (t.dataset.campo) {
      if (t.value === '') delete estado.origen.mapeo[t.dataset.campo]
      else estado.origen.mapeo[t.dataset.campo] = Number(t.value)
    } else if (t.dataset.unidad) estado.opciones.unidades[t.dataset.unidad] = t.value
    else if (t.dataset.inv === 'formato') estado.opciones.formatoNumero = t.value
    else if (t.name === 'isv') estado.opciones.isv = t.value === 'si'
    else if (t.name === 'inv') estado.opciones.inventariable = t.value
    else if (t.dataset.inv === 'cats-general') estado.opciones.categoriasAGeneral = t.checked
    else return
    actualizar()
  })

  q('revision-cuerpo').addEventListener('click', async e => {
    if (e.target.dataset.inv !== 'copiar') return
    const area = q('cats')
    try { await navigator.clipboard.writeText(area.value) } catch { area.select(); document.execCommand('copy') }
    q('copiado').textContent = '¡Copiado!'
  })

  q('resultado-cuerpo').addEventListener('click', e => {
    const tipo = e.target.dataset?.descargar
    if (!tipo) return
    const { info, wb } = estado.plantillas[tipo]
    // Se escribe sobre una copia del libro para poder descargar varias veces tras cambiar opciones.
    const copia = XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' })
    escribirPlantilla(XLSX, copia, info, estado.resultado.salidas[tipo])
    descargar(XLSX, copia, `Plantilla de Ítems ${ETIQUETA_TIPO[tipo]} Bold POS (lista).xlsx`)
  })
}

// Lo que el bot cuenta del resultado, en texto plano (sin IA).
export function resumenDe(r) {
  const partes = []
  if (r.total) partes.push(`Entendí **${r.total}** producto(s).`)
  else partes.push('Todavía no hay productos listos.')
  if (r.errores.length) partes.push(`${r.errores.length} fila(s) tienen errores y no se incluyen.`)
  if (r.categoriasFaltantes.length) partes.push(`Hay ${r.categoriasFaltantes.length} categoría(s) que debes crear antes en Bold POS.`)
  if (r.unidadesSinMapa.length) partes.push(`No reconocí ${r.unidadesSinMapa.length} unidad(es) de medida: elige su equivalente.`)
  return partes.join(' ')
}
