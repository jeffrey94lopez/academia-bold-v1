// js/inv-convertir.js — convierte las filas del cliente a filas de plantilla Bold POS.
//
// Módulo puro. Entrada: filas de datos + mapeo de columnas + info de las
// plantillas (inv-plantilla.js) + opciones que el cliente fue ajustando.
// Salida: filas listas por plantilla, errores (la fila no se exporta), avisos
// (se exporta, pero conviene mirar) y lo que el cliente debe resolver.
import { normalizar, parseNumero, parseSiNo, parseImpuesto, aCodigo, aTexto } from './inv-numeros.js'
import { crearGeneradorCodigos } from './inv-codigos.js'
import { sanear } from './inv-saneamiento.js'
import { purgar } from './inv-purgador.js'

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
  // Singular/plural ("Caja" ↔ "Cajas", "Galón" ↔ "Galones").
  const raiz = s => normalizar(s).replace(/(es|s)$/, '')
  const plural = lista.find(u => raiz(u) === raiz(origen))
  if (plural) return plural
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
//             unidades: {origen: unidadBold}, categoriasAGeneral: bool,
//             codigos: {formato, prefijo, inicio, relleno} | null (crear códigos faltantes) }
export function convertir({ filas, mapeo, plantillas, opciones = {} }) {
  const fmt = opciones.formatoNumero ?? 'auto'
  const salidas = { inventariable: [], noinventariable: [] }
  const errores = [], avisos = []
  const faltanCategorias = new Map()
  const unidadesSinMapa = new Set()
  const codigosVistos = new Map()
  let pendienteInventariable = false
  let sinExistencia = 0, sinImpuesto = 0, sinCosto = 0, sinCategoria = 0, codigosDanados = 0
  let sinCodigo = 0, codigosCreados = 0

  const get = (fila, campo) => (mapeo[campo] === undefined ? '' : fila[mapeo[campo]])
  // Los códigos nuevos no pueden repetir ninguno que el cliente ya tenga en el archivo.
  const generarCodigo = opciones.codigos
    ? crearGeneradorCodigos(opciones.codigos, filas.map(f => aCodigo(get(f, 'codigo')).texto).filter(Boolean))
    : null
  const referencia = plantillas.inventariable ?? plantillas.noinventariable
  const aviso = (n, msg) => avisos.push({ fila: n, mensaje: msg })
  const error = (n, msg, codigo) => errores.push({ fila: n, mensaje: msg, codigo })

  const categoriasOriginales = filas
    .map(f => get(f, 'categoria'))
    .filter(Boolean)
  const unidadesOriginales = filas
    .map(f => get(f, 'unidad'))
    .filter(Boolean)
  const purgaCategorias = purgar(categoriasOriginales)
  const purgaUnidades = purgar(unidadesOriginales)

  filas.forEach((fila, i) => {
    if (vacia(fila)) return
    const n = fila.__fila ?? i + 1

    const nombre = aTexto(get(fila, 'nombre'))
    if (!nombre) return error(n, 'No tiene nombre.', 'filas_nombre')

    let inventariable = esInventariable(fila, mapeo, opciones)
    if (inventariable === null) { pendienteInventariable = true; inventariable = false }
    const tipo = inventariable ? 'inventariable' : 'noinventariable'
    const plantilla = plantillas[tipo]
    if (!plantilla) return error(n, `"${nombre}" es ${inventariable ? 'inventariable' : 'no inventariable'}, pero no subiste esa plantilla de Bold.`, 'filas_plantilla_tipo')

    // Impuesto y precio total.
    let pct = mapeo.impuesto === undefined ? null : parseImpuesto(get(fila, 'impuesto'))
    let precioTotal = mapeo.precioTotal === undefined ? null : parseNumero(get(fila, 'precioTotal'), fmt)
    if (precioTotal == null && mapeo.precioBase !== undefined) {
      const base = parseNumero(get(fila, 'precioBase'), fmt)
      if (base != null) precioTotal = Math.round(base * (1 + (pct ?? 0) / 100) * 100) / 100
    }
    if (precioTotal == null || precioTotal < 0) return error(n, `"${nombre}": el precio de venta no es un número válido.`, 'filas_precio')

    let costo = mapeo.costo === undefined ? null : parseNumero(get(fila, 'costo'), fmt)
    if (costo == null || costo < 0) { costo = 0; sinCosto++ }

    // Unidad.
    const listaUnidades = plantilla.listas.unidades
    const unidadOriginalCliente = aTexto(get(fila, 'unidad'))
    const unidadPurgada = purgaUnidades.mapeo[get(fila, 'unidad')] ?? unidadOriginalCliente
    let unidad
    if (!unidadPurgada) unidad = mapearUnidad('Unidades', listaUnidades) ?? listaUnidades[0] ?? 'Unidades'
    else {
      unidad = opciones.unidades?.[unidadPurgada] ?? mapearUnidad(unidadPurgada, listaUnidades)
      if (!unidad) {
        unidadesSinMapa.add(unidadPurgada)
        unidad = mapearUnidad('Unidades', listaUnidades) ?? listaUnidades[0] ?? 'Unidades'
      }
    }

    // Categoría: debe existir en Bold antes de importar.
    const lista = plantilla.listas.categorias
    const general = lista.find(c => normalizar(c) === 'general') ?? lista[0] ?? 'General'
    const catOriginal = sinPrefijoNumerico(aTexto(get(fila, 'categoria')))
    let categoria = purgaCategorias.mapeo[get(fila, 'categoria')] ?? catOriginal
    if (!categoria) { categoria = general; sinCategoria++ }
    else {
      const existente = lista.find(c => normalizar(c) === normalizar(categoria))
      if (existente) categoria = existente
      else if (opciones.categoriasAGeneral) categoria = general
      else if (!faltanCategorias.has(normalizar(categoria))) faltanCategorias.set(normalizar(categoria), categoria)
    }

    // Código (texto) y duplicados; si falta y el cliente pidió crearlos, se crea.
    const { texto: original, danado } = aCodigo(get(fila, 'codigo'))
    let codigo = original
    if (!codigo) {
      if (generarCodigo) { codigo = generarCodigo(nombre); codigosCreados++ }
      else sinCodigo++
    }
    if (danado) codigosDanados++
    if (codigo) {
      if (codigosVistos.has(codigo)) aviso(n, `El código "${codigo}" ya está en la fila ${codigosVistos.get(codigo)}.`)
      else codigosVistos.set(codigo, n)
    }

    const out = {
      codigo: sanear(codigo),
      nombre: sanear(nombre),
      categoria: sanear(categoria),
      referencia: sanear(aTexto(get(fila, 'referencia'))),
      descripcion: sanear(aTexto(get(fila, 'descripcion'))),
      unidad: sanear(unidad),
      costo, precioTotal,
    }

    if (inventariable) {
      let ex = mapeo.existencia === undefined ? null : parseNumero(get(fila, 'existencia'), fmt)
      if (ex == null) { ex = 0; sinExistencia++ }
      else if (ex < 0) { aviso(n, `"${nombre}": existencia negativa, se dejó en 0.`); ex = 0 }
      out.existencia = ex
    }

    if (plantilla.tieneIsv && opciones.isv !== false) {
      const strategy = opciones.ivaStrategy ?? 'por_fila'
      let elegido
      if (strategy === 'todos_igual') {
        if (!opciones.ivaGeneral) {
          throw new Error('ivaStrategy=todos_igual requiere opciones.ivaGeneral')
        }
        elegido = opciones.ivaGeneral
      } else {
        // por_fila: usa el valor del archivo; si falta, cae a ivaGeneral si está,
        // o al EXENTO default (comportamiento actual).
        if (pct == null) {
          sinImpuesto++
          if (opciones.ivaGeneral) elegido = opciones.ivaGeneral
          else {
            const exento = mapearImpuesto(0, plantilla.listas.impuestos)
            elegido = exento ?? ''
          }
        } else {
          const opcion = mapearImpuesto(pct, plantilla.listas.impuestos)
          if (!opcion) aviso(n, `"${nombre}": el impuesto ${pct}% no está en tu plantilla; se dejó vacío.`)
          elegido = opcion ?? ''
        }
      }
      out.isv = elegido
    }

    salidas[tipo].push(out)
  })

  if (sinExistencia) avisos.unshift({ fila: null, mensaje: `${sinExistencia} ítem(s) inventariable(s) sin existencia en el archivo: quedaron en 0.` })
  if (sinCosto) avisos.unshift({ fila: null, mensaje: `${sinCosto} ítem(s) sin costo válido: quedaron en 0.` })
  if (sinImpuesto) avisos.unshift({ fila: null, mensaje: `${sinImpuesto} ítem(s) sin impuesto en el archivo: se marcaron como exentos.` })
  if (codigosCreados) avisos.unshift({ fila: null, mensaje: `${codigosCreados} ítem(s) no traían código: se les creó uno nuevo.` })
  if (sinCategoria) avisos.unshift({ fila: null, mensaje: `${sinCategoria} ítem(s) sin categoría: se asignaron a "General".` })
  if (codigosDanados) avisos.unshift({ fila: null, mensaje: `${codigosDanados} código(s) llegaron en notación científica (7.5E+12): Excel ya les cambió los dígitos y hay que corregirlos en el archivo original.` })

  return {
    salidas, errores, avisos,
    categoriasFaltantes: [...faltanCategorias.values()],
    unidadesSinMapa: [...unidadesSinMapa],
    pendienteInventariable, sinCodigo, codigosCreados,
    total: salidas.inventariable.length + salidas.noinventariable.length,
    plantillaReferencia: referencia ? referencia.tipo : null,
  }
}
