import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluarBorradoCategoria } from '../js/category-guard.js'

// Decide si se puede borrar una categoría a partir del resultado de contar sus
// lecciones (el { count, error } que devuelve supabase). La regla de oro: ante
// cualquier duda NO se borra, para no dejar lecciones huérfanas.

test('categoría sin lecciones: se permite borrar', () => {
  assert.deepEqual(
    evaluarBorradoCategoria({ count: 0, error: null }),
    { permitido: true, razon: 'ok', count: 0 }
  )
})

test('categoría con lecciones: se bloquea e informa cuántas', () => {
  const r = evaluarBorradoCategoria({ count: 3, error: null })
  assert.equal(r.permitido, false)
  assert.equal(r.razon, 'con-lecciones')
  assert.equal(r.count, 3)
})

test('BUG #10: si la query de conteo falla, NO se borra', () => {
  // Antes: `const { count } = ...; if (count > 0)` → con error count es null,
  // null > 0 es false → se borraba igual. Ahora el error bloquea.
  const r = evaluarBorradoCategoria({ count: null, error: { message: 'fallo' } })
  assert.equal(r.permitido, false)
  assert.equal(r.razon, 'error')
})

test('count desconocido (null sin error): tampoco se borra', () => {
  const r = evaluarBorradoCategoria({ count: null, error: null })
  assert.equal(r.permitido, false)
  assert.equal(r.razon, 'desconocido')
})

test('count ausente (undefined): tampoco se borra', () => {
  const r = evaluarBorradoCategoria({ error: null })
  assert.equal(r.permitido, false)
  assert.equal(r.razon, 'desconocido')
})

test('resultado vacío o sin argumento: no se borra', () => {
  assert.equal(evaluarBorradoCategoria({}).permitido, false)
  assert.equal(evaluarBorradoCategoria().permitido, false)
})
