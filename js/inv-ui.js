// js/inv-ui.js — pantalla de inventario.html: une las plantillas de Bold, el archivo
// del cliente y el conversor. Todo corre en el navegador; nada se sube a ningún servidor.
import { leerLibro, escribirPlantilla, descargar } from './inv-excel.js'
import { leerPlantilla } from './inv-plantilla.js'
import { elegirHoja, CAMPOS } from './inv-origen.js'
import { convertir } from './inv-convertir.js'

const XLSX = window.XLSX

const estado = {
  plantillas: {},   // { inventariable?: {info, wb}, noinventariable?: {info, wb} }
  origen: null,     // { nombre, hoja, encabezados, mapeo, filas }
  opciones: { formatoNumero: 'auto', inventariable: null, isv: null, unidades: {}, categoriasAGeneral: false },
  resultado: null,
}

const $ = id => document.getElementById(id)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const letraColumna = i => { let s = '', n = i; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 } while (n >= 0); return s }
const ETIQUETA_TIPO = { inventariable: 'Inventariables', noinventariable: 'No inventariables' }

async function leerArchivo(file) {
  const csv = /\.csv$/i.test(file.name)
  return leerLibro(XLSX, await file.arrayBuffer(), { csv })
}

// ---------- Paso 1: plantillas de Bold ----------
$('inv-plantillas').addEventListener('change', async e => {
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
  pintarPlantillas(avisos)
  actualizar()
})

function pintarPlantillas(avisos = []) {
  const chips = Object.entries(estado.plantillas).map(([tipo, { info }]) =>
    `<div class="inv-chip inv-ok"><b>${ETIQUETA_TIPO[tipo]}</b> · ${esc(info.sucursal || 'sin existencias')}
       · ${info.listas.categorias.length} categorías${info.tieneIsv ? ' · con ISV' : ''}</div>`)
  const malos = avisos.map(a => `<div class="inv-chip inv-mal">${esc(a)}</div>`)
  $('inv-plantillas-estado').innerHTML = chips.concat(malos).join('')
}

// ---------- Paso 2: archivo de productos ----------
$('inv-origen').addEventListener('change', async e => {
  const file = e.target.files[0]
  if (!file) return
  const caja = $('inv-origen-estado')
  try {
    const { hojas } = await leerArchivo(file)
    const mejor = elegirHoja(hojas)
    if (!mejor) {
      estado.origen = null
      caja.innerHTML = `<div class="inv-chip inv-mal">No encontré una tabla de productos en "${esc(file.name)}". Revisa que tenga una fila de encabezados con al menos Nombre y Precio.</div>`
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

// ---------- Paso 3 y 4 ----------
function plantillaDeReferencia() { return estado.plantillas.inventariable ?? estado.plantillas.noinventariable }

function actualizar() {
  const listo = estado.origen && Object.keys(estado.plantillas).length
  $('inv-revision').hidden = !listo
  $('inv-resultado').hidden = !listo
  if (!listo) return
  const ref = plantillaDeReferencia().info
  const tieneIsv = Object.values(estado.plantillas).some(p => p.info.tieneIsv)
  if (estado.opciones.isv === null) estado.opciones.isv = tieneIsv
  estado.resultado = convertir({
    filas: estado.origen.filas,
    mapeo: estado.origen.mapeo,
    plantillas: Object.fromEntries(Object.entries(estado.plantillas).map(([t, p]) => [t, p.info])),
    opciones: { ...estado.opciones, isv: estado.opciones.isv },
  })
  pintarRevision(ref, tieneIsv)
  pintarResultado()
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
      <textarea id="inv-cats" readonly rows="${Math.min(r.categoriasFaltantes.length, 8)}">${esc(r.categoriasFaltantes.join('\n'))}</textarea>
      <div class="inv-fila"><button type="button" id="inv-copiar" class="inv-btn inv-btn-sec">Copiar categorías</button><span id="inv-copiado" class="inv-ayuda" aria-live="polite"></span></div>
      <label><input type="checkbox" id="inv-cats-general"> Mejor enviar estos ítems a la categoría "General"</label></div>`)
  } else if (estado.opciones.categoriasAGeneral) {
    preguntas.push(`<label class="inv-pregunta"><input type="checkbox" id="inv-cats-general" checked> Enviar a "General" los ítems de categorías que no existen</label>`)
  }

  $('inv-revision-cuerpo').innerHTML = `
    <table class="inv-tabla"><thead><tr><th>Dato de Bold POS</th><th>Columna de tu archivo</th><th>Ejemplo</th></tr></thead><tbody>${filasMapeo}</tbody></table>
    <label class="inv-formato">Formato de números en tu archivo
      <select id="inv-formato">
        <option value="auto" ${estado.opciones.formatoNumero === 'auto' ? 'selected' : ''}>Automático</option>
        <option value="punto" ${estado.opciones.formatoNumero === 'punto' ? 'selected' : ''}>El punto es decimal (1,234.50)</option>
        <option value="coma" ${estado.opciones.formatoNumero === 'coma' ? 'selected' : ''}>La coma es decimal (1.234,50)</option>
      </select></label>
    ${preguntas.join('')}`
}

function pintarResultado() {
  const r = estado.resultado
  const caja = $('inv-resultado-cuerpo')
  const tipos = Object.keys(r.salidas).filter(t => r.salidas[t].length)
  const botones = tipos.map(t =>
    `<button type="button" class="inv-btn" data-descargar="${t}">Descargar plantilla de ${ETIQUETA_TIPO[t].toLowerCase()} (${r.salidas[t].length})</button>`).join('')
  const lista = (titulo, items, clase) => items.length ? `<details class="inv-detalle ${clase}"><summary>${items.length} ${titulo}</summary><ul>${
    items.slice(0, 200).map(i => `<li>${i.fila ? `Fila ${i.fila}: ` : ''}${esc(i.mensaje)}</li>`).join('')}${items.length > 200 ? '<li>…</li>' : ''}</ul></details>` : ''
  caja.innerHTML = `
    <p class="inv-resumen">${r.total ? `<b>${r.total}</b> ítem(s) listos.` : 'Todavía no hay ítems listos.'}
      ${r.errores.length ? `<b>${r.errores.length}</b> fila(s) con error no se incluyen.` : ''}</p>
    <div class="inv-fila">${botones}</div>
    ${lista('error(es): estas filas no se exportan', r.errores, 'inv-det-mal')}
    ${lista('aviso(s) para revisar', r.avisos, 'inv-det-aviso')}`
}

// ---------- Eventos (delegados: el contenido se repinta en cada cambio) ----------
$('inv-revision-cuerpo').addEventListener('change', e => {
  const t = e.target
  if (t.dataset.campo) {
    if (t.value === '') delete estado.origen.mapeo[t.dataset.campo]
    else estado.origen.mapeo[t.dataset.campo] = Number(t.value)
  } else if (t.dataset.unidad) estado.opciones.unidades[t.dataset.unidad] = t.value
  else if (t.id === 'inv-formato') estado.opciones.formatoNumero = t.value
  else if (t.name === 'isv') estado.opciones.isv = t.value === 'si'
  else if (t.name === 'inv') estado.opciones.inventariable = t.value
  else if (t.id === 'inv-cats-general') estado.opciones.categoriasAGeneral = t.checked
  else return
  actualizar()
})

$('inv-revision-cuerpo').addEventListener('click', async e => {
  if (e.target.id !== 'inv-copiar') return
  const area = $('inv-cats')
  try { await navigator.clipboard.writeText(area.value) } catch { area.select(); document.execCommand('copy') }
  $('inv-copiado').textContent = '¡Copiado!'
})

$('inv-resultado-cuerpo').addEventListener('click', e => {
  const tipo = e.target.dataset?.descargar
  if (!tipo) return
  const { info, wb } = estado.plantillas[tipo]
  // Se escribe sobre una copia del libro para poder descargar varias veces tras cambiar opciones.
  const copia = XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' })
  escribirPlantilla(XLSX, copia, info, estado.resultado.salidas[tipo])
  descargar(XLSX, copia, `Plantilla de Ítems ${ETIQUETA_TIPO[tipo]} Bold POS (lista).xlsx`)
})
