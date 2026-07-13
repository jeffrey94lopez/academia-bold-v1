import test from 'node:test'
import assert from 'node:assert/strict'
import { storageRemove } from '../js/storage.js'
import { getSeleccion, setSeleccion, filtrarPorSeleccion, etiqueta } from '../js/vertical.js'

// El storage es compartido entre tests (mismo módulo cacheado): cada test
// limpia sus claves antes de actuar para no depender del orden de ejecución.
function limpiarSeleccion() {
  storageRemove('bold_vertical')
  storageRemove('bold_plataforma')
}

test('getSeleccion: defaults retail + web', () => {
  limpiarSeleccion()
  assert.deepEqual(getSeleccion(), { vertical: 'retail', plataforma: 'web' })
})

test('setSeleccion persiste valores válidos', () => {
  limpiarSeleccion()
  setSeleccion({ vertical: 'restaurantes', plataforma: 'mobile' })
  assert.deepEqual(getSeleccion(), { vertical: 'restaurantes', plataforma: 'mobile' })
})

test('setSeleccion ignora valores inválidos', () => {
  limpiarSeleccion()
  setSeleccion({ vertical: 'restaurantes' })
  setSeleccion({ vertical: 'xxx', plataforma: 'yyy' })
  assert.deepEqual(getSeleccion(), { vertical: 'restaurantes', plataforma: 'web' })
})

test('filtrarPorSeleccion filtra y aplica defaults a lecciones viejas', () => {
  const L = [
    { id: 1, vertical: 'retail', plataforma: 'web' },
    { id: 2, vertical: 'retail', plataforma: 'mobile' },
    { id: 3, vertical: 'restaurantes', plataforma: 'web' },
    { id: 4 }, // sin campos → retail/web
  ]
  assert.deepEqual(
    filtrarPorSeleccion(L, { vertical: 'retail', plataforma: 'web' }).map(l => l.id),
    [1, 4])
  assert.deepEqual(
    filtrarPorSeleccion(L, { vertical: 'restaurantes', plataforma: 'mobile' }).map(l => l.id),
    [])
})

test('etiqueta arma icono y texto del badge', () => {
  assert.deepEqual(etiqueta({ vertical: 'restaurantes', plataforma: 'mobile' }),
    { icon: 'utensils', texto: 'Restaurantes · Mobile' })
  assert.deepEqual(etiqueta({}), { icon: 'store', texto: 'Retail · Web' })
})
