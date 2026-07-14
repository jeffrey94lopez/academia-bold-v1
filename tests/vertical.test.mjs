import test from 'node:test'
import assert from 'node:assert/strict'
import { storageRemove } from '../js/storage.js'
import {
  getSeleccion, setSeleccion, filtrarPorSeleccion, etiqueta,
  plataformasHabilitadas, verticalesVisibles, resolverSeleccion,
} from '../js/vertical.js'

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

// --- Visibilidad configurable por app_settings (Task 8) ---

test('plataformasHabilitadas y verticalesVisibles: todo habilitado por defecto (settings null/undefined)', () => {
  const L = [
    { id: 1, vertical: 'retail', plataforma: 'web' },
    { id: 2, vertical: 'restaurantes', plataforma: 'mobile' },
  ]
  assert.deepEqual(plataformasHabilitadas(null, 'retail'), ['web', 'mobile'])
  assert.deepEqual(plataformasHabilitadas(undefined, 'restaurantes'), ['web', 'mobile'])
  assert.deepEqual(verticalesVisibles(L, null), ['retail', 'restaurantes'])
  assert.deepEqual(verticalesVisibles(L, undefined), ['retail', 'restaurantes'])
})

test('verticalesVisibles: vertical habilitada pero sin lecciones queda oculta', () => {
  const L = [{ id: 1, vertical: 'retail', plataforma: 'web' }]
  assert.deepEqual(verticalesVisibles(L, {}), ['retail'])
})

test('verticalesVisibles: vertical deshabilitada por switch se oculta aunque tenga lecciones', () => {
  const L = [
    { id: 1, vertical: 'retail', plataforma: 'web' },
    { id: 2, vertical: 'restaurantes', plataforma: 'web' },
  ]
  const settings = { vertical_restaurantes_enabled: 'false' }
  assert.deepEqual(verticalesVisibles(L, settings), ['retail'])
  // El switch de vertical no afecta las plataformas de esa vertical.
  assert.deepEqual(plataformasHabilitadas(settings, 'restaurantes'), ['web', 'mobile'])
})

test('plataformasHabilitadas/verticalesVisibles: plataforma deshabilitada se excluye de chips y del cálculo de visibilidad', () => {
  const settings = { plataforma_retail_mobile_enabled: 'false' }
  assert.deepEqual(plataformasHabilitadas(settings, 'retail'), ['web'])
  const L = [{ id: 1, vertical: 'retail', plataforma: 'mobile' }] // única lección de retail está en la plataforma apagada
  assert.deepEqual(verticalesVisibles(L, settings), [])
})

test('resolverSeleccion: respeta una selección válida (vertical visible + plataforma habilitada)', () => {
  const L = [
    { id: 1, vertical: 'retail', plataforma: 'web' },
    { id: 2, vertical: 'restaurantes', plataforma: 'mobile' },
  ]
  assert.deepEqual(
    resolverSeleccion(L, {}, { vertical: 'restaurantes', plataforma: 'mobile' }),
    { vertical: 'restaurantes', plataforma: 'mobile' })
})

test('resolverSeleccion: fallback a la primera vertical visible cuando la guardada está oculta', () => {
  const L = [{ id: 1, vertical: 'retail', plataforma: 'web' }]
  const settings = { vertical_restaurantes_enabled: 'false' }
  assert.deepEqual(
    resolverSeleccion(L, settings, { vertical: 'restaurantes', plataforma: 'mobile' }),
    { vertical: 'retail', plataforma: 'web' })
})

test('resolverSeleccion: fallback a la primera plataforma habilitada CON lecciones', () => {
  const L = [{ id: 1, vertical: 'retail', plataforma: 'mobile' }] // sólo mobile tiene lecciones
  assert.deepEqual(
    resolverSeleccion(L, {}, { vertical: 'retail', plataforma: 'xxx' }),
    { vertical: 'retail', plataforma: 'mobile' })
})

test('resolverSeleccion: plataforma guardada deshabilitada (aunque tenga lecciones) cae a otra plataforma habilitada', () => {
  const L = [
    { id: 1, vertical: 'retail', plataforma: 'web' },
    { id: 2, vertical: 'retail', plataforma: 'mobile' },
  ]
  const settings = { plataforma_retail_mobile_enabled: 'false' }
  assert.deepEqual(
    resolverSeleccion(L, settings, { vertical: 'retail', plataforma: 'mobile' }),
    { vertical: 'retail', plataforma: 'web' })
})

test('resolverSeleccion: sin verticales visibles devuelve la selección recibida tal cual', () => {
  const seleccion = { vertical: 'restaurantes', plataforma: 'mobile' }
  assert.deepEqual(resolverSeleccion([], {}, seleccion), seleccion)
})
