import test from 'node:test'
import assert from 'node:assert/strict'
import { storageRemove } from '../js/storage.js'
import {
  getSeleccion, setSeleccion, filtrarPorSeleccion, etiqueta,
  plataformasHabilitadas, verticalesVisibles, resolverSeleccion,
  aplicaA, VERTICALES_CONTENIDO, labelVertical, verticalHabilitada, VERTICALES,
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

test('aplicaA: ambas aplica a las dos verticales', () => {
  assert.equal(aplicaA({ vertical: 'ambas' }, 'retail'), true)
  assert.equal(aplicaA({ vertical: 'ambas' }, 'restaurantes'), true)
})

test('aplicaA: una vertical concreta solo aplica a la suya', () => {
  assert.equal(aplicaA({ vertical: 'retail' }, 'retail'), true)
  assert.equal(aplicaA({ vertical: 'retail' }, 'restaurantes'), false)
  assert.equal(aplicaA({ vertical: 'restaurantes' }, 'restaurantes'), true)
  assert.equal(aplicaA({ vertical: 'restaurantes' }, 'retail'), false)
})

test('aplicaA: vertical ausente, null o basura cuenta como retail', () => {
  assert.equal(aplicaA({}, 'retail'), true)
  assert.equal(aplicaA({ vertical: null }, 'retail'), true)
  assert.equal(aplicaA({ vertical: '' }, 'restaurantes'), false)
  assert.equal(aplicaA(null, 'retail'), true)
})

test('filtrarPorSeleccion incluye las lecciones ambas', () => {
  const ls = [
    { titulo: 'A', vertical: 'retail',       plataforma: 'web' },
    { titulo: 'B', vertical: 'restaurantes', plataforma: 'web' },
    { titulo: 'C', vertical: 'ambas',        plataforma: 'web' },
    { titulo: 'D', vertical: 'ambas',        plataforma: 'mobile' },
  ]
  const r = filtrarPorSeleccion(ls, { vertical: 'restaurantes', plataforma: 'web' })
  assert.deepEqual(r.map(l => l.titulo), ['B', 'C'])
})

test('etiqueta: ambas trae su propio icono y label', () => {
  assert.deepEqual(etiqueta({ vertical: 'ambas', plataforma: 'mobile' }),
    { icon: 'layers', texto: 'Ambas · Mobile' })
})

test('labelVertical: nombre suelto para contenido sin plataforma', () => {
  assert.equal(labelVertical('retail'), 'Retail')
  assert.equal(labelVertical('restaurantes'), 'Restaurantes')
  assert.equal(labelVertical('ambas'), 'Ambas')
  assert.equal(labelVertical(null), 'Retail')
})

// Una FAQ y un término de glosario no tienen `plataforma`: aplicaA solo mira
// `vertical`, así que la misma regla sirve para las tres tablas.
test('aplicaA sirve igual para FAQ y glosario (sin plataforma)', () => {
  const faq  = { pregunta: '¿Cómo divido una cuenta?', vertical: 'restaurantes' }
  const term = { termino: 'Comanda', vertical: 'restaurantes' }
  const pago = { pregunta: '¿Cómo proceso un pago?', vertical: 'ambas' }
  assert.equal(aplicaA(faq, 'restaurantes'), true)
  assert.equal(aplicaA(faq, 'retail'), false)
  assert.equal(aplicaA(term, 'retail'), false)
  assert.equal(aplicaA(pago, 'retail'), true)
  assert.equal(aplicaA(pago, 'restaurantes'), true)
})

test('VERTICALES_CONTENIDO trae las 3 opciones y VERTICALES sigue con 2', () => {
  assert.deepEqual(VERTICALES_CONTENIDO.map(v => v.key), ['retail', 'restaurantes', 'ambas'])
  assert.deepEqual(VERTICALES.map(v => v.key), ['retail', 'restaurantes'])
})

test('setSeleccion sigue rechazando ambas como selección del usuario', () => {
  limpiarSeleccion()
  setSeleccion({ vertical: 'ambas' })
  assert.equal(getSeleccion().vertical, 'retail')
})

test('verticalesVisibles: una vertical con solo lecciones ambas es visible', () => {
  const ls = [{ vertical: 'ambas', plataforma: 'web' }]
  assert.deepEqual(verticalesVisibles(ls, {}), ['retail', 'restaurantes'])
})

test('verticalHabilitada respeta el switch de app_settings', () => {
  assert.equal(verticalHabilitada({}, 'retail'), true)
  assert.equal(verticalHabilitada({ vertical_retail_enabled: 'false' }, 'retail'), false)
  assert.equal(verticalHabilitada({ vertical_retail_enabled: 'true' }, 'retail'), true)
})

test('resolverSeleccion verticalFija: respeta la vertical aunque no tenga lecciones', () => {
  const ls = [{ vertical: 'retail', plataforma: 'web' }]
  assert.deepEqual(
    resolverSeleccion(ls, {}, { vertical: 'restaurantes', plataforma: 'web' }, { verticalFija: true }),
    { vertical: 'restaurantes', plataforma: 'web' })
})

test('resolverSeleccion verticalFija: sigue resolviendo la plataforma deshabilitada', () => {
  const ls = [{ vertical: 'restaurantes', plataforma: 'mobile' }]
  const settings = { plataforma_restaurantes_web_enabled: 'false' }
  assert.deepEqual(
    resolverSeleccion(ls, settings, { vertical: 'restaurantes', plataforma: 'web' }, { verticalFija: true }),
    { vertical: 'restaurantes', plataforma: 'mobile' })
})

test('resolverSeleccion verticalFija: el switch del admin gana sobre Bold', () => {
  const ls = [{ vertical: 'retail', plataforma: 'web' }]
  const settings = { vertical_restaurantes_enabled: 'false' }
  const r = resolverSeleccion(ls, settings, { vertical: 'restaurantes', plataforma: 'web' }, { verticalFija: true })
  assert.equal(r.vertical, 'retail')
})

test('resolverSeleccion sin verticalFija se comporta igual que antes', () => {
  const ls = [{ vertical: 'retail', plataforma: 'web' }]
  const r = resolverSeleccion(ls, {}, { vertical: 'restaurantes', plataforma: 'web' })
  assert.equal(r.vertical, 'retail')
})

test('resolverSeleccion verticalFija: early return si plataforma está habilitada (sin lecciones)', () => {
  const ls = [{ vertical: 'retail', plataforma: 'web' }]
  const r = resolverSeleccion(ls, {}, { vertical: 'restaurantes', plataforma: 'web' }, { verticalFija: true })
  assert.equal(r.vertical, 'restaurantes')
  assert.equal(r.plataforma, 'web')
})

test('resolverSeleccion verticalFija: todas las plataformas deshabilitadas cae a plataforma original', () => {
  const ls = [{ vertical: 'restaurantes', plataforma: 'web' }]
  const settings = {
    plataforma_restaurantes_web_enabled: 'false',
    plataforma_restaurantes_mobile_enabled: 'false',
  }
  const r = resolverSeleccion(ls, settings, { vertical: 'restaurantes', plataforma: 'web' }, { verticalFija: true })
  assert.equal(r.plataforma, 'web')
})
