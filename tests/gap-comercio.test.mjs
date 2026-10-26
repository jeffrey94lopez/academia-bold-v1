import test from 'node:test'
import assert from 'node:assert/strict'
import { etiquetaComercio, contarComercios } from '../js/gap-comercio.js'

test('etiquetaComercio: el nombre manda cuando está', () => {
  const e = etiquetaComercio({ business_name: 'Panadería La Espiga', account_id: 'a3f91c2b-0000' })
  assert.equal(e.texto, 'Panadería La Espiga')
  // El id completo va al title: es lo que Soporte pega en su buscador.
  assert.equal(e.completo, 'a3f91c2b-0000')
})

test('etiquetaComercio: sin nombre cae al id ACORTADO, nunca al id crudo', () => {
  // Un uuid entero dentro de una lista rompe el renglón y no se lee igual.
  const e = etiquetaComercio({ account_id: 'a3f91c2b-7d4e-4f10-9c33-12ab34cd56ef' })
  assert.equal(e.texto, 'ID a3f91c2b…')
  assert.equal(e.completo, 'a3f91c2b-7d4e-4f10-9c33-12ab34cd56ef')
})

test('etiquetaComercio: un id CORTO se muestra entero, sin puntos suspensivos', () => {
  // Los account_id de Bold son numéricos y cortos ("9548"), no uuids. Un "…"
  // pegado siempre afirma que hay más id del que hay, y manda a buscar el resto
  // en un tooltip que repite lo mismo.
  const e = etiquetaComercio({ account_id: '9548' })
  assert.equal(e.texto, 'ID 9548')
  assert.equal(e.completo, '9548')
})

test('etiquetaComercio: sin identidad lo DICE, no finge', () => {
  // Las conversaciones de antes del embed de Bold no traen cuenta. Pintar una
  // etiqueta vacía las haría indistinguibles de un comercio identificado.
  for (const p of [null, undefined, {}, { account_id: '', business_name: '  ' }]) {
    assert.equal(etiquetaComercio(p).texto, 'Sin identificar')
    assert.equal(etiquetaComercio(p).identificado, false)
  }
  assert.equal(etiquetaComercio({ account_id: 'x' }).identificado, true)
})

test('etiquetaComercio: un nombre larguísimo se acota', () => {
  const e = etiquetaComercio({ business_name: 'N'.repeat(90) })
  assert.ok(e.texto.length <= 41, e.texto.length)
  assert.ok(e.texto.endsWith('…'))
})

test('contarComercios: cuenta cuentas DISTINTAS, no preguntas', () => {
  // Es la diferencia entre "esto le pasa a 5 comercios" y "un comercio lo
  // preguntó 5 veces". Lo primero es un problema de plataforma.
  assert.equal(contarComercios([{ account_id: 'a' }, { account_id: 'a' }, { account_id: 'b' }]), 2)
})

test('contarComercios: las preguntas sin cuenta no suman', () => {
  assert.equal(contarComercios([{ account_id: null }, {}, { account_id: 'a' }]), 1)
  assert.equal(contarComercios([]), 0)
  assert.equal(contarComercios(null), 0)
})
