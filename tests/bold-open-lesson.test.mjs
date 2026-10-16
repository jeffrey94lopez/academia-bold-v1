import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizarAbrirLeccion, onAbrirLeccion, initBoldContext } from '../js/bold-context.js'

test('normalizarAbrirLeccion: solo bold:open-lesson con slug válido', () => {
  assert.equal(normalizarAbrirLeccion(null), null)
  assert.equal(normalizarAbrirLeccion('bold:open-lesson'), null)
  assert.equal(normalizarAbrirLeccion({ type: 'bold:context', slug: 'abc' }), null)
  assert.equal(normalizarAbrirLeccion({ type: 'bold:open-lesson' }), null)
  assert.equal(normalizarAbrirLeccion({ type: 'bold:open-lesson', slug: 42 }), null)
  assert.equal(normalizarAbrirLeccion({ type: 'bold:open-lesson', slug: '' }), null)
  assert.equal(normalizarAbrirLeccion({ type: 'bold:open-lesson', slug: 'a b' }), null)
  assert.equal(normalizarAbrirLeccion({ type: 'bold:open-lesson', slug: '../x' }), null)
  assert.equal(normalizarAbrirLeccion({ type: 'bold:open-lesson', slug: '<img>' }), null)
  assert.equal(normalizarAbrirLeccion({ type: 'bold:open-lesson', slug: '-a' }), null)
  assert.equal(normalizarAbrirLeccion({ type: 'bold:open-lesson', slug: 'a'.repeat(161) }), null)
  assert.equal(
    normalizarAbrirLeccion({ type: 'bold:open-lesson', slug: ' Asociar-La-Resolucion-2 ' }),
    'asociar-la-resolucion-2')
})

test('open-lesson: respeta el origen, entrega a suscriptores y a los tardíos', () => {
  let handler
  const win = {
    parent: null,                       // parent === win → sin handshake
    addEventListener: (t, h) => { if (t === 'message') handler = h },
  }
  win.parent = win
  initBoldContext(win)
  const msg = slug => ({ type: 'bold:open-lesson', slug })

  // origen no permitido: ni se guarda ni se entrega
  handler({ origin: 'https://atacante.com', data: msg('hola') })
  const recibidos = []
  const baja = onAbrirLeccion(s => recibidos.push(s))
  assert.deepEqual(recibidos, [])

  // origen Bold con suscriptor: entrega de una vez
  handler({ origin: 'https://pos.bold.co', data: msg('leccion-uno') })
  assert.deepEqual(recibidos, ['leccion-uno'])

  // se consume: la misma lección pedida otra vez se abre otra vez
  handler({ origin: 'https://pos.stg.bold.co', data: msg('leccion-uno') })
  assert.deepEqual(recibidos, ['leccion-uno', 'leccion-uno'])

  // slug inválido: no entrega
  handler({ origin: 'https://pos.bold.co', data: msg('no valido!') })
  assert.equal(recibidos.length, 2)

  // sin suscriptores queda pendiente y llega al suscriptor tardío
  baja()
  handler({ origin: 'https://pos.bold.co', data: msg('leccion-dos') })
  const tardios = []
  onAbrirLeccion(s => tardios.push(s))
  assert.deepEqual(tardios, ['leccion-dos'])
})
