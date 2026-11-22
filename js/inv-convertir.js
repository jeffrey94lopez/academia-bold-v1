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

// "01 - Bebidas" → "Bebidas". Si solo hay prefijo ("01 -") se deja tal cual para no vaciar la categoría.
const sinPrefijoNumerico = s => s.replace(/^\d+\s*-\s*(?=\S)/, '')

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

export function filaSinDatoMapeado(fila, mapeo) {
  const camposRelevantes = ['nombre', 'codigo', 'precioTotal', 'precioBase', 'costo', 'existencia']
  for (const campo of camposRelevantes) {
    const col = mapeo[campo]
    if (col === undefined) continue
    const v = String(fila[col] ?? '').trim()
    if (v !== '') return false
  }
  return true
}

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
  let sinImpuesto = 0, sinCategoria = 0, codigosDanados = 0
  let sinCodigo = 0, codigosCreados = 0

  const get = (fila, campo) => (mapeo[campo] === undefined ? '' : fila[mapeo[campo]])
  // Los códigos nuevos no pueden repetir ninguno que el cliente ya tenga en el archivo.
  const generarCodigo = opciones.codigos
    ? crearGeneradorCodigos(opciones.codigos, filas.map(f => aCodigo(get(f, 'codigo')).texto).filter(Boolean))
    : null
  const pendientes = []
  const omitidas = new Set(opciones.omitidas ?? [])
  const CAMPOS = ['nombre', 'precioTotal', 'costo', 'existencia']
  const candidatas = Object.fromEntries(CAMPOS.map(c => [c, 0]))
  const vacios = Object.fromEntries(CAMPOS.map(c => [c, 0]))
  // 'vacio' si la celda viene en blanco, 'negativo' si el número es < 0, 'invalido' si no es un número.
  const motivoDe = (crudo, valor) => {
    if (String(crudo ?? '').trim() === '') return 'vacio'
    if (valor == null) return 'invalido'
    return valor < 0 ? 'negativo' : null
  }
  const referencia = plantillas.inventariable ?? plantillas.noinventariable
  const aviso = (n, msg) => avisos.push({ fila: n, mensaje: msg })
  const error = (n, msg, codigo) => errores.push({ fila: n, mensaje: msg, codigo })

  // Lo que se purga es lo que de verdad va a Bold: sin filas vacías ni omitidas por el cliente,
  // y con la categoría ya sin su prefijo numérico para que "01 - Bebidas" y "Bebidas" se unan.
  const numeroDeFila = (fila, i) => fila.__fila ?? i + 1
  const activas = filas.filter((f, i) => !filaSinDatoMapeado(f, mapeo) && !omitidas.has(numeroDeFila(f, i)))
  const categoriaDe = fila => sinPrefijoNumerico(aTexto(get(fila, 'categoria')))
  const categoriasOriginales = activas.map(categoriaDe).filter(Boolean)
  const unidadesOriginales = activas
    .map(f => get(f, 'unidad'))
    .filter(Boolean)
  const purgaCategorias = purgar(categoriasOriginales)
  const purgaUnidades = purgar(unidadesOriginales)

  filas.forEach((fila, i) => {
    if (filaSinDatoMapeado(fila, mapeo)) return
    const n = numeroDeFila(fila, i)

    const omitida = omitidas.has(n)
    const corr = campo => {
      const c = opciones.correcciones
      const f = c && Object.hasOwn(c, n) ? c[n] : null
      return f && Object.hasOwn(f, campo) ? f[campo] : undefined
    }
    // Orden: corrección → valor por columna (solo si la celda estaba vacía) → archivo.
    const resolver = (campo, crudo, valor) => {
      const c = corr(campo)
      if (c !== undefined) return [String(c), c]
      const v = opciones.valorPorColumna
      if (v && Object.hasOwn(v, campo) && motivoDe(crudo, valor) === 'vacio') return [String(v[campo]), v[campo]]
      return [crudo, valor]
    }

    const nombre = corr('nombre') ?? aTexto(get(fila, 'nombre'))
    const nombreMostrado = nombre || '(sin nombre)'
    const pend = []
    const marcar = (campo, crudo, valor) => {
      const motivo = motivoDe(crudo, valor)
      if (!omitida) {
        candidatas[campo]++
        if (motivo === 'vacio') vacios[campo]++
      }
      if (!motivo) return
      pend.push({ fila: n, nombre: nombreMostrado, campo, motivo, original: String(crudo ?? '') })
    }
    // El nombre solo puede estar vacío: se pasa 0 como valor para no tratarlo como número.
    marcar('nombre', nombre, 0)

    // Impuesto y precio total.
    let pct = mapeo.impuesto === undefined ? null : parseImpuesto(get(fila, 'impuesto'))
    let precioTotal = mapeo.precioTotal === undefined ? null : parseNumero(get(fila, 'precioTotal'), fmt)
    if (precioTotal == null && mapeo.precioBase !== undefined) {
      const base = parseNumero(get(fila, 'precioBase'), fmt)
      if (base != null) precioTotal = Math.round(base * (1 + (pct ?? 0) / 100) * 100) / 100
    }
    const crudoTotal = get(fila, 'precioTotal')
    const crudoPrecio = String(crudoTotal ?? '').trim() !== '' ? crudoTotal : get(fila, 'precioBase')
    const cPrecio = corr('precioTotal')
    if (cPrecio !== undefined) precioTotal = cPrecio
    marcar('precioTotal', cPrecio !== undefined ? String(cPrecio) : crudoPrecio, precioTotal)

    // Fila omitida: no se exporta ni genera pendientes; solo se avisa si tenía nombre/precio por resolver.
    if (omitida) {
      const p = pend.find(x => x.campo === 'nombre' || x.campo === 'precioTotal')
      if (!p) return error(n, `"${nombreMostrado}": la omitiste.`, 'filas_omitida')
      const que = p.campo === 'nombre' ? 'nombre' : 'precio'
      const motivo = { vacio: `${que} vacío`, invalido: `${que} no válido`, negativo: `${que} negativo` }[p.motivo]
      return error(n, `"${nombreMostrado}": la omitiste (${motivo}).`, p.campo === 'nombre' ? 'filas_nombre' : 'filas_precio')
    }

    let inventariable = esInventariable(fila, mapeo, opciones)
    if (inventariable === null) { pendienteInventariable = true; inventariable = false }
    const tipo = inventariable ? 'inventariable' : 'noinventariable'
    const plantilla = plantillas[tipo]
    if (!plantilla) return error(n, `"${nombreMostrado}" es ${inventariable ? 'inventariable' : 'no inventariable'}, pero no subiste esa plantilla de Bold.`, 'filas_plantilla_tipo')

    let costo = mapeo.costo === undefined ? null : parseNumero(get(fila, 'costo'), fmt)
    let crudoCosto = get(fila, 'costo')
    ;[crudoCosto, costo] = resolver('costo', crudoCosto, costo)
    marcar('costo', crudoCosto, costo)

    let ex = null
    if (inventariable) {
      ex = mapeo.existencia === undefined ? null : parseNumero(get(fila, 'existencia'), fmt)
      let crudoEx = get(fila, 'existencia')
      ;[crudoEx, ex] = resolver('existencia', crudoEx, ex)
      marcar('existencia', crudoEx, ex)
    }

    // Con cualquier pendiente la fila no se exporta; no es un error: el cliente la completa.
    if (pend.length) { pendientes.push(...pend); return }

    // Unidad.
    const listaUnidades = plantilla.listas.unidades
    const unidadOriginalCliente = aTexto(get(fila, 'unidad'))
    const unidadPurgada = purgaUnidades.mapeo[get(fila, 'unidad')] ?? unidadOriginalCliente
    let unidad
    if (!unidadPurgada) unidad = mapearUnidad('Unidades', listaUnidades) ?? listaUnidades[0] ?? 'Unidades'
    else {
      unidad = (opciones.unidades && Object.hasOwn(opciones.unidades, unidadPurgada) ? opciones.unidades[unidadPurgada] : null) ?? mapearUnidad(unidadPurgada, listaUnidades)
      if (!unidad) {
        unidadesSinMapa.add(unidadPurgada)
        unidad = mapearUnidad('Unidades', listaUnidades) ?? listaUnidades[0] ?? 'Unidades'
      }
    }

    // Categoría: debe existir en Bold antes de importar.
    const lista = plantilla.listas.categorias
    const general = lista.find(c => normalizar(c) === 'general') ?? lista[0] ?? 'General'
    const catOriginal = categoriaDe(fila)
    let categoria = purgaCategorias.mapeo[catOriginal] ?? catOriginal
    // Agrupación propuesta por la IA (clave = canónica del heurístico); categoriasAGeneral sigue ganando abajo.
    const ia = opciones.categoriasIA
    if (ia && Object.hasOwn(ia, categoria)) categoria = ia[categoria]
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

  if (sinImpuesto) avisos.unshift({ fila: null, mensaje: `${sinImpuesto} ítem(s) sin impuesto en el archivo: se marcaron como exentos.` })
  if (codigosCreados) avisos.unshift({ fila: null, mensaje: `${codigosCreados} ítem(s) no traían código: se les creó uno nuevo.` })
  if (sinCategoria) avisos.unshift({ fila: null, mensaje: `${sinCategoria} ítem(s) sin categoría: se asignaron a "General".` })
  if (codigosDanados) avisos.unshift({ fila: null, mensaje: `${codigosDanados} código(s) llegaron en notación científica (7.5E+12): Excel ya les cambió los dígitos y hay que corregirlos en el archivo original.` })

  const columnasSinDato = CAMPOS.filter(c => candidatas[c] > 0 && vacios[c] === candidatas[c])

  return {
    salidas, errores, avisos, pendientes, columnasSinDato,
    categoriasFaltantes: [...faltanCategorias.values()],
    unidadesSinMapa: [...unidadesSinMapa],
    categoriasPurgadas: purgaCategorias.limpias,
    unidadesPurgadas: purgaUnidades.limpias,
    pendienteInventariable, sinCodigo, codigosCreados,
    total: salidas.inventariable.length + salidas.noinventariable.length,
    plantillaReferencia: referencia ? referencia.tipo : null,
  }
}
