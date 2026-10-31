// js/inv-sesion.js — estado de una importación de inventario, sin DOM de pantalla.
// Lo maneja la conversación (inv-chat.js): lee archivos, guarda las respuestas del
// cliente y recalcula la conversión cada vez que algo cambia.
import { leerLibro, escribirPlantilla, descargar } from './inv-excel.js'
import { leerPlantilla } from './inv-plantilla.js'
import { elegirHoja } from './inv-origen.js'
import { convertir } from './inv-convertir.js'

export const ETIQUETA_TIPO = { inventariable: 'inventariables', noinventariable: 'no inventariables' }
const RUTA_XLSX = 'vendor/xlsx.full.min.js'

// SheetJS pesa ~950 KB: se carga solo cuando alguien va a usar el conversor
// (el chat no debe pagarlo en cada visita).
let cargaXlsx = null
export function cargarXlsx() {
  if (globalThis.XLSX) return Promise.resolve(globalThis.XLSX)
  cargaXlsx ??= new Promise((ok, fallo) => {
    const s = document.createElement('script')
    s.src = RUTA_XLSX
    s.onload = () => ok(globalThis.XLSX)
    s.onerror = () => { cargaXlsx = null; fallo(new Error('No se pudo cargar el lector de Excel.')) }
    document.head.appendChild(s)
  })
  return cargaXlsx
}

export function crearSesion() {
  const estado = {
    plantillas: {},   // { inventariable?: {info, wb, nombre}, noinventariable?: {...} }
    origen: null,     // { nombre, hoja, encabezados, mapeo, filas }
    opciones: { formatoNumero: 'auto', inventariable: null, isv: null, unidades: {}, categoriasAGeneral: false, codigos: null },
    resultado: null,
  }

  async function leer(file) {
    const XLSX = await cargarXlsx()
    return leerLibro(XLSX, await file.arrayBuffer(), { csv: /\.csv$/i.test(file.name) })
  }

  const api = {
    estado,

    // → { info } o { error }
    async agregarPlantilla(file) {
      try {
        const { wb, hojas } = await leer(file)
        const info = leerPlantilla(hojas)
        if (!info) return { error: `"${file.name}" no parece una plantilla de ítems de Bold POS.` }
        estado.plantillas[info.tipo] = { info, wb, nombre: file.name }
        return { info }
      } catch { return { error: `No pude leer "${file.name}".` } }
    },

    // → { filas, hoja } o { error }
    async cargarOrigen(file) {
      try {
        const { hojas } = await leer(file)
        const mejor = elegirHoja(hojas)
        if (!mejor) return { error: `No encontré una tabla de productos en "${file.name}". Necesita una fila de encabezados con al menos Nombre y Precio.` }
        const filas = hojas[mejor.nombre].slice(mejor.fila + 1).map((f, i) => Object.assign([...f], { __fila: mejor.fila + 2 + i }))
        estado.origen = { nombre: file.name, hoja: mejor.nombre, encabezados: mejor.encabezados, mapeo: mejor.mapeo, filas }
        estado.opciones.unidades = {}
        estado.opciones.inventariable = null
        estado.opciones.codigos = null
        estado.resultado = null
        return { hoja: mejor.nombre, total: filas.filter(f => f.some(c => String(c).trim() !== '')).length }
      } catch { return { error: `No pude leer "${file.name}".` } }
    },

    tieneIsv() { return Object.values(estado.plantillas).some(p => p.info.tieneIsv) },
    plantillaReferencia() { return (estado.plantillas.inventariable ?? estado.plantillas.noinventariable).info },

    // Falta nombre o precio: sin eso no hay conversión posible.
    mapeoCompleto() {
      const m = estado.origen.mapeo
      return m.nombre !== undefined && (m.precioTotal !== undefined || m.precioBase !== undefined)
    },

    recalcular() {
      if (estado.opciones.isv === null) estado.opciones.isv = api.tieneIsv()
      estado.resultado = convertir({
        filas: estado.origen.filas,
        mapeo: estado.origen.mapeo,
        plantillas: Object.fromEntries(Object.entries(estado.plantillas).map(([t, p]) => [t, p.info])),
        opciones: { ...estado.opciones },
      })
      return estado.resultado
    },

    async descargar(tipo) {
      const XLSX = await cargarXlsx()
      const { info, wb } = estado.plantillas[tipo]
      // Sobre una copia del libro: se puede volver a descargar tras cambiar algo.
      const copia = XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' })
      escribirPlantilla(XLSX, copia, info, estado.resultado.salidas[tipo])
      descargar(XLSX, copia, `Plantilla de Ítems ${ETIQUETA_TIPO[tipo][0].toUpperCase()}${ETIQUETA_TIPO[tipo].slice(1)} Bold POS (lista).xlsx`)
    },
  }
  return api
}
