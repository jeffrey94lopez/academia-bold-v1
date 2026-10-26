import test from 'node:test'
import assert from 'node:assert/strict'
import { validarFusion, avisosFusion } from '../js/gap-merge.js'

const vacio = (over = {}) => ({ id: 'a', estado: 'pendiente', categoria: 'Caja', vertical: 'retail', ...over })

test('validarFusion: el caso normal pasa', () => {
  assert.deepEqual(validarFusion(vacio(), vacio({ id: 'b' })), { ok: true })
})

test('validarFusion: sin destino elegido no se puede fusionar', () => {
  for (const destino of [null, undefined, {}, { id: '' }]) {
    assert.deepEqual(validarFusion(vacio(), destino), { ok: false, motivo: 'sin_destino' })
  }
})

test('validarFusion: fusionar un vacío consigo mismo se rechaza', () => {
  assert.deepEqual(validarFusion(vacio(), vacio()), { ok: false, motivo: 'mismo_vacio' })
})

test('validarFusion: un vacío RESUELTO no puede ser el origen', () => {
  // Es la única regla direccional: el origen se borra, y un resuelto lleva
  // `leccion_id`, el único enlace a contenido que alguien escribió. Perderlo en
  // silencio es lo que esta regla impide. Al revés sí se puede: mover lo
  // pendiente hacia el resuelto alimenta "resuelto pero siguen preguntando".
  assert.deepEqual(validarFusion(vacio({ estado: 'resuelto' }), vacio({ id: 'b' })),
    { ok: false, motivo: 'origen_resuelto' })
  assert.deepEqual(validarFusion(vacio(), vacio({ id: 'b', estado: 'resuelto' })), { ok: true })
})

test('validarFusion: descartado y solicitud SÍ pueden ser origen', () => {
  for (const estado of ['descartado', 'solicitud']) {
    assert.deepEqual(validarFusion(vacio({ estado }), vacio({ id: 'b' })), { ok: true })
  }
})

test('avisosFusion: el caso limpio no avisa nada', () => {
  assert.deepEqual(avisosFusion(vacio(), vacio({ id: 'b' })), [])
})

test('avisosFusion: avisa que se pierde la marca del origen cuando no está pendiente', () => {
  // El origen DESAPARECE. Su motivo y su nota se van con él, y nadie debería
  // enterarse después de haber hecho clic.
  const a = avisosFusion(vacio({ estado: 'solicitud', nota_descarte: 'lo ve Soporte' }), vacio({ id: 'b' }))
  assert.equal(a.length, 1)
  assert.match(a[0], /solicitud/i)
  assert.match(a[0], /lo ve Soporte/)
})

test('avisosFusion: la nota se nombra solo si existe', () => {
  const a = avisosFusion(vacio({ estado: 'descartado' }), vacio({ id: 'b' }))
  assert.equal(a.length, 1)
  assert.doesNotMatch(a[0], /nota/i)
})

test('avisosFusion: avisa cuando el destino ya está cerrado', () => {
  const r = avisosFusion(vacio(), vacio({ id: 'b', estado: 'resuelto' }))
  assert.equal(r.length, 1)
  assert.match(r[0], /resuelto/i)
  const d = avisosFusion(vacio(), vacio({ id: 'b', estado: 'descartado' }))
  assert.match(d[0], /descartado/i)
})

test('avisosFusion: avisa cuando categoría o vertical no coinciden', () => {
  // El destino conserva las suyas: el ancla no se recalcula (decisión 3), y la
  // clasificación va pegada al ancla.
  const cat = avisosFusion(vacio(), vacio({ id: 'b', categoria: 'Inventario' }))
  assert.equal(cat.length, 1)
  assert.match(cat[0], /Inventario/)
  const ver = avisosFusion(vacio(), vacio({ id: 'b', vertical: 'restaurantes' }))
  assert.match(ver[0], /restaurantes/)
})

test('avisosFusion: una categoría ausente no cuenta como distinta', () => {
  // `categoria` nula es "sin clasificar", no "otra categoría": avisar de una
  // diferencia que no existe entrena a ignorar los avisos.
  assert.deepEqual(avisosFusion(vacio({ categoria: null }), vacio({ id: 'b' })), [])
  assert.deepEqual(avisosFusion(vacio(), vacio({ id: 'b', categoria: '' })), [])
})

test('avisosFusion: los avisos se acumulan', () => {
  const a = avisosFusion(
    vacio({ estado: 'descartado', categoria: 'Caja' }),
    vacio({ id: 'b', estado: 'resuelto', categoria: 'Inventario', vertical: 'restaurantes' }))
  assert.equal(a.length, 4)
})
