import test from 'node:test'
import assert from 'node:assert/strict'
import {
  fetchVacios, fetchVacioDetalle, fetchVaciosSalud,
  resolverVacio, descartarVacio, dividirVacio,
} from '../js/gaps-api.js'

// Cliente falso: registra la llamada y devuelve lo que se le pida.
function fakeClient(respuesta = { data: [], error: null }) {
  const llamadas = []
  return {
    llamadas,
    rpc: async (name, params) => { llamadas.push({ name, params }); return respuesta },
  }
}

test('fetchVacios: manda los filtros con null cuando no se pasan', async () => {
  const c = fakeClient({ data: [], error: null })
  await fetchVacios({}, c)
  assert.deepEqual(c.llamadas[0], {
    name: 'analytics_bot_vacios',
    params: { p_estado: 'pendiente', p_vertical: null, p_categoria: null, p_limit: 100 },
  })
})

test('fetchVacios: respeta los filtros que sí se pasan', async () => {
  const c = fakeClient({ data: [], error: null })
  await fetchVacios({ estado: 'resuelto', vertical: 'retail', categoria: 'Caja', limit: 20 }, c)
  assert.deepEqual(c.llamadas[0].params, {
    p_estado: 'resuelto', p_vertical: 'retail', p_categoria: 'Caja', p_limit: 20,
  })
})

test('un error de la RPC se propaga como throw, NUNCA como dato vacío', async () => {
  // supabase-js no lanza: devuelve { error }. Si esto se tragara el error, la
  // bandeja pintaría "0 vacíos pendientes" ante un fallo de red.
  const c = fakeClient({ data: null, error: { message: 'permission denied' } })
  await assert.rejects(() => fetchVacios({}, c), /analytics_bot_vacios: permission denied/)
  await assert.rejects(() => fetchVaciosSalud(c), /analytics_vacios_salud/)
  await assert.rejects(() => resolverVacio('v', 'l', 'e@x.com', c), /resolver_vacio/)
})

test('fetchVacioDetalle: pasa el id', async () => {
  const c = fakeClient({ data: { vacio: null, preguntas: [] }, error: null })
  await fetchVacioDetalle('abc', c)
  assert.deepEqual(c.llamadas[0], { name: 'analytics_bot_vacio_detalle', params: { p_vacio_id: 'abc' } })
})

test('resolverVacio y descartarVacio mandan sus parámetros', async () => {
  const c = fakeClient({ data: null, error: null })
  await resolverVacio('v1', 'l1', 'yo@x.com', c)
  await descartarVacio('v2', 'ruido', 'nota', c)
  assert.deepEqual(c.llamadas[0].params, { p_vacio_id: 'v1', p_leccion_id: 'l1', p_email: 'yo@x.com' })
  assert.deepEqual(c.llamadas[1].params, { p_vacio_id: 'v2', p_motivo: 'ruido', p_nota: 'nota' })
})

test('dividirVacio manda el array de ids y devuelve el id nuevo', async () => {
  const c = fakeClient({ data: 'nuevo-id', error: null })
  const r = await dividirVacio('v1', ['a', 'b'], 'Título nuevo', c)
  assert.equal(r, 'nuevo-id')
  assert.deepEqual(c.llamadas[0].params, {
    p_vacio_id: 'v1', p_pregunta_ids: ['a', 'b'], p_titulo: 'Título nuevo',
  })
})
