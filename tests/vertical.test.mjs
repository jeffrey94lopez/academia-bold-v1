import test from 'node:test'
import assert from 'node:assert/strict'

// Cada test importa con ?caso=N para obtener módulo (y storage) frescos.

test('getSeleccion: defaults retail + web', async () => {
  const v = await import('../js/vertical.js?caso=1')
  assert.deepEqual(v.getSeleccion(), { vertical: 'retail', plataforma: 'web' })
})

test('setSeleccion persiste valores válidos', async () => {
  const v = await import('../js/vertical.js?caso=2')
  v.setSeleccion({ vertical: 'restaurantes', plataforma: 'mobile' })
  assert.deepEqual(v.getSeleccion(), { vertical: 'restaurantes', plataforma: 'mobile' })
})

test('setSeleccion ignora valores inválidos', async () => {
  const v = await import('../js/vertical.js?caso=3')
  v.setSeleccion({ vertical: 'restaurantes' })
  v.setSeleccion({ vertical: 'xxx', plataforma: 'yyy' })
  assert.deepEqual(v.getSeleccion(), { vertical: 'restaurantes', plataforma: 'web' })
})

test('filtrarPorSeleccion filtra y aplica defaults a lecciones viejas', async () => {
  const v = await import('../js/vertical.js?caso=4')
  const L = [
    { id: 1, vertical: 'retail', plataforma: 'web' },
    { id: 2, vertical: 'retail', plataforma: 'mobile' },
    { id: 3, vertical: 'restaurantes', plataforma: 'web' },
    { id: 4 }, // sin campos → retail/web
  ]
  assert.deepEqual(
    v.filtrarPorSeleccion(L, { vertical: 'retail', plataforma: 'web' }).map(l => l.id),
    [1, 4])
  assert.deepEqual(
    v.filtrarPorSeleccion(L, { vertical: 'restaurantes', plataforma: 'mobile' }).map(l => l.id),
    [])
})

test('etiqueta arma icono y texto del badge', async () => {
  const v = await import('../js/vertical.js?caso=5')
  assert.deepEqual(v.etiqueta({ vertical: 'restaurantes', plataforma: 'mobile' }),
    { icon: 'utensils', texto: 'Restaurantes · Mobile' })
  assert.deepEqual(v.etiqueta({}), { icon: 'store', texto: 'Retail · Web' })
})
