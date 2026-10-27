// js/inv-convertir.js — convierte las filas del cliente a filas de plantilla Bold POS.
//
// Módulo puro. Entrada: filas de datos + mapeo de columnas + info de las
// plantillas (inv-plantilla.js) + opciones que el cliente fue ajustando.
// Salida: filas listas por plantilla, errores (la fila no se exporta), avisos
// (se exporta, pero conviene mirar) y lo que el cliente debe resolver.
import { normalizar, parseNumero, parseSiNo, parseImpuesto, aCodigo, aTexto } from './inv-numeros.js'

// Grupos de sinónimos de unidades: la clave es la unidad "canónica".
const UNIDADES = {
  unidad: ['unidad', 'unidades', 'und', 'unid', 'u', 'un', 'pza', 'pieza', 'piezas', 'pz', 'no aplica'],
  metro: ['m', 'mt', 'mts', 'metro', 'metros'],
  libra: ['lb', 'lbs', 'libra', 'libras'],
  kilogramo: ['kg', 'kgs', 'kilo', 'kilos', 'kilogramo', 'kilogramos'],
  gramo: ['g', 'gr', 'grs', 'gramo', 'gramos'],
  galon: ['gal', 'gl', 'galon', 'galones'],
  par: ['par', 'pares', 'numero de pares'],
}

function grupoDeUnidad(texto) {
  const n = normalizar(texto)
  return Object.keys(UNIDADES).find(g => UNIDADES[g].includes(n)) ?? null
}

// Unidad de la lista de la plantilla equivalente a la del cliente, o null.
export function mapearUnidad(origen, lista) {
  const n = normalizar(origen)
  if (!n) return null
  const exacta = lista.find(u => normalizar(u) === n)
  if (exacta) return exacta
  const g = grupoDeUnidad(origen)
  return g ? lista.find(u => grupoDeUnidad(u) === g) ?? null : null
}

// Los números del nombre del impuesto de la plantilla ("IVA-19" → 19).
function pctDeOpcion(opcion) {
  const m = String(opcion).match(/(\d+(?:[.,]\d+)?)/)
  return m ? Number(m[1].replace(',', '.')) : 0
}

// Opción de la lista de impuestos de la plantilla que corresponde a `pct`.
export function mapearImpuesto(pct, lista) {
  if (pct == null) return null
  if (pct === 0) return lista.find(o => /exento/i.test(o)) ?? lista.find(o => pctDeOpcion(o) === 0) ?? null
  return lista.find(o => pctDeOpcion(o) === pct && !/excluido/i.test(o)) ?? null
}

const sinPrefijoNumerico = s => s.replace(/^\d+\s*-\s*/, '')

// Orden de prioridad: la columna Sí/No del archivo, "servicio" en el tipo, lo que
// el cliente eligió para todo el archivo y, por último, si trae existencias.
// null = no hay forma de saberlo: la pantalla le pregunta al cliente.
function esInventariable(fila, mapeo, opciones) {
  if (mapeo.inventariable !== undefined) {
    const r = parseSiNo(fila[mapeo.inventariable])
    if (r !== null) return r
  }
  if (mapeo.tipo !== undefined && /servicio/i.test(String(fila[mapeo.tipo] ?? ''))) return false
  if (opciones.inventariable === 'si') return true
  if (opciones.inventariable === 'no') return false
  return mapeo.existencia !== undefined ? true : null
}

const vacia = fila => fila.every(c => String(c ?? '').trim() === '')

// opciones: { formatoNumero, inventariable: 'si'|'no'|null, isv: bool,
//             unidades: {origen: unidadBold}, categoriasAGeneral: bool }
export function convertir({ filas, mapeo, plantillas, opciones = {} }) {
  const fmt = opciones.formatoNumero ?? 'auto'
  const salidas = { inventariable: [], noinventariable: [] }
  const errores = [], avisos = []
  const faltanCategorias = new Map()
  const unidadesSinMapa = new Set()
  const codigosVistos = new Map()
  let pendienteInventariable = false
  let sinExistencia = 0, sinImpuesto = 0, sinCosto = 0, sinCategoria = 0, codigosDanados = 0

  const get = (fila, campo) => (mapeo[campo] === undefined ? '' : fila[mapeo[campo]])
  const referencia = plantillas.inventariable ?? plantillas.noinventariable
  const aviso = (n, msg) => avisos.push({ fila: n, mensaje: msg })
  const error = (n, msg) => errores.push({ fila: n, mensaje: msg })

  filas.forEach((fila, i) => {
    if (vacia(fila)) return
    const n = fila.__fila ?? i + 1

    const nombre = aTexto(get(fila, 'nombre'))
    if (!nombre) return error(n, 'No tiene nombre.')

    let inventariable = esInventariable(fila, mapeo, opciones)
    if (inventariable === null) { pendienteInventariable = true; inventariable = false }
    const tipo = inventariable ? 'inventariable' : 'noinventariable'
    const plantilla = plantillas[tipo]
    if (!plantilla) return error(n, `"${nombre}" es ${inventariable ? 'inventariable' : 'no inventariable'}, pero no subiste esa plantilla de Bold.`)

    // Impuesto y precio total.
    let pct = mapeo.impuesto === undefined ? null : parseImpuesto(get(fila, 'impuesto'))
    let precioTotal = mapeo.precioTotal === undefined ? null : parseNumero(get(fila, 'precioTotal'), fmt)
    if (precioTotal == null && mapeo.precioBase !== undefined) {
      const base = parseNumero(get(fila, 'precioBase'), fmt)
      if (base != null) precioTotal = Math.round(base * (1 + (pct ?? 0) / 100) * 100) / 100
    }
    if (precioTotal == null || precioTotal < 0) return error(n, `"${nombre}": el precio de venta no es un número válido.`)

    let costo = mapeo.costo === undefined ? null : parseNumero(get(fila, 'costo'), fmt)
    if (costo == null || costo < 0) { costo = 0; sinCosto++ }

    // Unidad.
    const listaUnidades = plantilla.listas.unidades
    const unidadOrigen = aTexto(get(fila, 'unidad'))
    let unidad
    if (!unidadOrigen) unidad = mapearUnidad('Unidades', listaUnidades) ?? listaUnidades[0] ?? 'Unidades'
    else {
      unidad = opciones.unidades?.[unidadOrigen] ?? mapearUnidad(unidadOrigen, listaUnidades)
      if (!unidad) {
        unidadesSinMapa.add(unidadOrigen)
        unidad = mapearUnidad('Unidades', listaUnidades) ?? listaUnidades[0] ?? 'Unidades'
      }
    }

    // Categoría: debe existir en Bold antes de importar.
    const lista = plantilla.listas.categorias
    const general = lista.find(c => normalizar(c) === 'general') ?? lista[0] ?? 'General'
    let categoria = sinPrefijoNumerico(aTexto(get(fila, 'categoria')))
    if (!categoria) { categoria = general; sinCategoria++ }
    else {
      const existente = lista.find(c => normalizar(c) === normalizar(categoria))
      if (existente) categoria = existente
      else if (opciones.categoriasAGeneral) categoria = general
      else if (!faltanCategorias.has(normalizar(categoria))) faltanCategorias.set(normalizar(categoria), categoria)
    }

    // Código (texto) y duplicados.
    const { texto: codigo, danado } = aCodigo(get(fila, 'codigo'))
    if (danado) codigosDanados++
    if (codigo) {
      if (codigosVistos.has(codigo)) aviso(n, `El código "${codigo}" ya está en la fila ${codigosVistos.get(codigo)}.`)
      else codigosVistos.set(codigo, n)
    }

    const out = {
      codigo, nombre, categoria, referencia: aTexto(get(fila, 'referencia')),
      descripcion: aTexto(get(fila, 'descripcion')), unidad, costo, precioTotal,
    }

    if (inventariable) {
      let ex = mapeo.existencia === undefined ? null : parseNumero(get(fila, 'existencia'), fmt)
      if (ex == null) { ex = 0; sinExistencia++ }
      else if (ex < 0) { aviso(n, `"${nombre}": existencia negativa, se dejó en 0.`); ex = 0 }
      out.existencia = ex
    }

    if (plantilla.tieneIsv && opciones.isv !== false) {
      if (pct == null) { pct = 0; sinImpuesto++ }
      const opcion = mapearImpuesto(pct, plantilla.listas.impuestos)
      if (!opcion) aviso(n, `"${nombre}": el impuesto ${pct}% no está en tu plantilla; se dejó vacío.`)
      out.isv = opcion ?? ''
    }

    salidas[tipo].push(out)
  })

  if (sinExistencia) avisos.unshift({ fila: null, mensaje: `${sinExistencia} ítem(s) inventariable(s) sin existencia en el archivo: quedaron en 0.` })
  if (sinCosto) avisos.unshift({ fila: null, mensaje: `${sinCosto} ítem(s) sin costo válido: quedaron en 0.` })
  if (sinImpuesto) avisos.unshift({ fila: null, mensaje: `${sinImpuesto} ítem(s) sin impuesto en el archivo: se marcaron como exentos.` })
  if (sinCategoria) avisos.unshift({ fila: null, mensaje: `${sinCategoria} ítem(s) sin categoría: se asignaron a "General".` })
  if (codigosDanados) avisos.unshift({ fila: null, mensaje: `${codigosDanados} código(s) llegaron en notación científica (7.5E+12): Excel ya les cambió los dígitos y hay que corregirlos en el archivo original.` })

  return {
    salidas, errores, avisos,
    categoriasFaltantes: [...faltanCategorias.values()],
    unidadesSinMapa: [...unidadesSinMapa],
    pendienteInventariable,
    total: salidas.inventariable.length + salidas.noinventariable.length,
    plantillaReferencia: referencia ? referencia.tipo : null,
  }
}
