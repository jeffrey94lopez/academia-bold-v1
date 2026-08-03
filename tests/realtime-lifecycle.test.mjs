import test from 'node:test'
import assert from 'node:assert/strict'
import { crearSuscripcionReanudable } from '../js/realtime-lifecycle.js'

// Gestor de una suscripción realtime que se puede detener y REANUDAR. El bug #7
// era que, al salir de la pestaña de lecciones, el canal se removía y nunca se
// volvía a suscribir → el realtime quedaba muerto para siempre. Aquí probamos
// la máquina de estados con dependencias falsas (sin supabase).

function fakes() {
  const eventos = []
  let n = 0
  const subscribe = () => { eventos.push('subscribe'); return { id: ++n } }
  const remove = (h) => { eventos.push(`remove:${h.id}`) }
  return { subscribe, remove, eventos }
}

test('iniciar suscribe una sola vez (idempotente)', () => {
  const { subscribe, remove, eventos } = fakes()
  const sub = crearSuscripcionReanudable({ subscribe, remove })
  sub.iniciar()
  sub.iniciar()
  assert.deepEqual(eventos, ['subscribe'])
  assert.equal(sub.activa(), true)
})

test('detener remueve el canal y deja inactiva la suscripción', () => {
  const { subscribe, remove, eventos } = fakes()
  const sub = crearSuscripcionReanudable({ subscribe, remove })
  sub.iniciar()
  sub.detener()
  assert.deepEqual(eventos, ['subscribe', 'remove:1'])
  assert.equal(sub.activa(), false)
})

test('detener sin estar activa no hace nada', () => {
  const { subscribe, remove, eventos } = fakes()
  const sub = crearSuscripcionReanudable({ subscribe, remove })
  sub.detener()
  assert.deepEqual(eventos, [])
})

test('BUG #7: reanudar tras detener vuelve a suscribir', () => {
  const { subscribe, remove, eventos } = fakes()
  const sub = crearSuscripcionReanudable({ subscribe, remove })
  sub.iniciar()   // carga inicial
  sub.detener()   // el usuario sale de la pestaña de lecciones
  sub.iniciar()   // el usuario vuelve → debe re-suscribir
  assert.deepEqual(eventos, ['subscribe', 'remove:1', 'subscribe'])
  assert.equal(sub.activa(), true)
})

test('cada nueva suscripción usa un canal nuevo (no reusa el removido)', () => {
  const { subscribe, remove, eventos } = fakes()
  const sub = crearSuscripcionReanudable({ subscribe, remove })
  sub.iniciar()
  sub.detener()
  sub.iniciar()
  sub.detener()
  // El segundo remove debe ser sobre el canal 2, no el 1.
  assert.deepEqual(eventos, ['subscribe', 'remove:1', 'subscribe', 'remove:2'])
})
