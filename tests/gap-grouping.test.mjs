import test from 'node:test'
import assert from 'node:assert/strict'
import { agruparPorCategoria } from '../js/gap-grouping.js'

const v = (categoria, preguntas_total, titulo = 't') => ({ categoria, preguntas_total, titulo })

test('agruparPorCategoria: ordena los grupos por cantidad de vacíos, no por preguntas', () => {
  // El panel agrupa para que se vea DÓNDE se acumula el trabajo. Una categoría
  // con 5 vacíos de 1 pregunta pesa más que una con 1 vacío de 9.
  const g = agruparPorCategoria([
    v('Ingresos', 9), v('Configuración', 1), v('Configuración', 1), v('Configuración', 1),
  ])
  assert.deepEqual(g.map(x => x.categoria), ['Configuración', 'Ingresos'])
  assert.deepEqual(g.map(x => x.total), [3, 1])
})

test('agruparPorCategoria: dentro del grupo, los más preguntados primero', () => {
  const [grupo] = agruparPorCategoria([v('Ingresos', 2, 'b'), v('Ingresos', 8, 'a')])
  assert.deepEqual(grupo.vacios.map(x => x.titulo), ['a', 'b'])
})

test('agruparPorCategoria: abre los dos grupos más grandes y deja el resto cerrado', () => {
  const g = agruparPorCategoria([
    v('A', 1), v('A', 1), v('A', 1),
    v('B', 1), v('B', 1),
    v('C', 1),
    v('D', 1),
  ])
  assert.deepEqual(g.map(x => x.abierto), [true, true, false, false])
})

test('agruparPorCategoria: abrirTop configurable, y tolera pedir más grupos de los que hay', () => {
  const g = agruparPorCategoria([v('A', 1), v('B', 1)], { abrirTop: 5 })
  assert.deepEqual(g.map(x => x.abierto), [true, true])
  const cero = agruparPorCategoria([v('A', 1), v('B', 1)], { abrirTop: 0 })
  assert.deepEqual(cero.map(x => x.abierto), [false, false])
})

test('agruparPorCategoria: los vacíos sin categoría caen en un grupo con nombre legible', () => {
  // La RPC devuelve `categoria` nula cuando el clasificador no la puso. Un
  // grupo titulado "null" o "" en pantalla es una fuga de la base a la cara.
  for (const vacia of [null, undefined, '', '   ']) {
    const [g] = agruparPorCategoria([{ categoria: vacia, preguntas_total: 1 }])
    assert.equal(g.categoria, 'Sin categoría')
  }
})

test('agruparPorCategoria: sin vacíos devuelve una lista vacía', () => {
  assert.deepEqual(agruparPorCategoria([]), [])
  assert.deepEqual(agruparPorCategoria(null), [])
  assert.deepEqual(agruparPorCategoria(undefined), [])
})

test('agruparPorCategoria: empate de tamaño se desempata alfabéticamente', () => {
  // Sin desempate estable, el orden de los grupos bailaría entre repintados y
  // el usuario perdería el lugar donde estaba leyendo.
  const g = agruparPorCategoria([v('Ventas', 1), v('Egresos', 1), v('Ingresos', 1)])
  assert.deepEqual(g.map(x => x.categoria), ['Egresos', 'Ingresos', 'Ventas'])
})

test('agruparPorCategoria: tolera preguntas_total ausente sin romper el orden', () => {
  const g = agruparPorCategoria([{ categoria: 'A' }, { categoria: 'A', preguntas_total: 3 }])
  assert.equal(g[0].total, 2)
  assert.equal(g[0].vacios[0].preguntas_total, 3)
})
