import test from 'node:test'
import assert from 'node:assert/strict'
import { modeloCobertura } from '../js/gap-cobertura.js'

const payload = {
  umbral: 0.55,
  revisados: 80,
  sin_embedding: 4,
  cubiertos: [
    { id: 'a', titulo: 'imprimir una tirilla', leccion_id: 'L1', leccion_titulo: 'Formato de impresión', similitud: 0.72, preguntas_total: 3 },
    { id: 'b', titulo: 'abrir un turno', leccion_id: 'L2', leccion_titulo: 'Apertura de turno', similitud: 0.61, preguntas_total: 1 },
  ],
}

test('modeloCobertura: pasa la lista y el umbral con el que se filtró', () => {
  // El umbral viaja a la pantalla a propósito: uno escondido en el código es un
  // número que nadie cuestiona, y este nace provisional.
  const m = modeloCobertura(payload)
  assert.equal(m.umbral, 0.55)
  assert.equal(m.cubiertos.length, 2)
  assert.equal(m.hay, true)
})

test('modeloCobertura: ordena por similitud, de más a menos', () => {
  const m = modeloCobertura({ ...payload, cubiertos: [payload.cubiertos[1], payload.cubiertos[0]] })
  assert.deepEqual(m.cubiertos.map(c => c.id), ['a', 'b'])
})

test('modeloCobertura: cuenta los que NO se pudieron revisar', () => {
  // Un vacío sin ancla no se puede comparar contra nada. Callarlo haría creer
  // que el barrido los miró y los descartó.
  const m = modeloCobertura(payload)
  assert.equal(m.sinEmbedding, 4)
  assert.equal(m.revisados, 80)
})

test('modeloCobertura: sin cubiertos, la franja no se pinta', () => {
  const m = modeloCobertura({ umbral: 0.55, revisados: 80, sin_embedding: 0, cubiertos: [] })
  assert.equal(m.hay, false)
  assert.deepEqual(m.cubiertos, [])
})

test('modeloCobertura: tolera que la RPC no exista todavía', () => {
  // La migración la corre el usuario. Hasta entonces el panel tiene que
  // funcionar igual, sin franja, en vez de romperse.
  for (const malo of [null, undefined, {}, 'raro', []]) {
    const m = modeloCobertura(malo)
    assert.equal(m.hay, false)
    assert.deepEqual(m.cubiertos, [])
    assert.equal(m.sinEmbedding, 0)
  }
})

test('modeloCobertura: la similitud se normaliza a número', () => {
  // jsonb devuelve numeric como string. Un "0.72" sin convertir rompe
  // cualquier comparación y se ordena alfabéticamente.
  const m = modeloCobertura({ ...payload, cubiertos: [
    { id: 'x', similitud: '0.9', titulo: 't', leccion_id: 'L1', leccion_titulo: 'l' },
    { id: 'y', similitud: '0.61', titulo: 't', leccion_id: 'L2', leccion_titulo: 'l' },
  ] })
  assert.equal(typeof m.cubiertos[0].similitud, 'number')
  assert.deepEqual(m.cubiertos.map(c => c.id), ['x', 'y'])
})

test('modeloCobertura: un cubierto sin lección SÍ se ofrece', () => {
  // La franja ya no nombra la lección ni la liga: el mejor match eligió la
  // equivocada en 3 de 6 casos medidos. La sugerencia vale por el vacío, no
  // por la lección, así que descartarla por eso sería perder trabajo útil.
  const m = modeloCobertura({ ...payload, cubiertos: [
    { id: 'x', similitud: 0.8, titulo: 't' },
    { id: 'y', similitud: 0.7, titulo: 't', leccion_id: 'L1', leccion_titulo: 'Una lección' },
  ] })
  assert.deepEqual(m.cubiertos.map(c => c.id), ['x', 'y'])
})
