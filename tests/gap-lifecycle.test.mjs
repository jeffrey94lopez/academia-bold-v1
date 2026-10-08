import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoMostrado, registroEnSilencio } from '../js/gap-lifecycle.js'

test('estadoMostrado: un vacío abierto es pendiente', () => {
  assert.equal(estadoMostrado({ estado: 'pendiente', preguntas_desde_cierre: 0 }), 'pendiente')
  // Un pendiente nunca es "reincidente": todas sus preguntas son las suyas.
  assert.equal(estadoMostrado({ estado: 'pendiente', preguntas_desde_cierre: 9 }), 'pendiente')
})

test('estadoMostrado: resuelto con UNA pregunta nueva ya es reincidente', () => {
  assert.equal(estadoMostrado({ estado: 'resuelto', preguntas_desde_cierre: 0 }), 'resuelto')
  assert.equal(estadoMostrado({ estado: 'resuelto', preguntas_desde_cierre: 1 }), 'resuelto_reincidente')
})

test('estadoMostrado: descartado necesita cruzar el umbral para volver', () => {
  assert.equal(estadoMostrado({ estado: 'descartado', preguntas_desde_cierre: 2 }), 'descartado')
  assert.equal(estadoMostrado({ estado: 'descartado', preguntas_desde_cierre: 3 }), 'descartado_reincidente')
  assert.equal(
    estadoMostrado({ estado: 'descartado', preguntas_desde_cierre: 5 }, { umbralReincidencia: 10 }),
    'descartado')
})

test('estadoMostrado: tolera contadores ausentes o nulos', () => {
  assert.equal(estadoMostrado({ estado: 'resuelto' }), 'resuelto')
  assert.equal(estadoMostrado({ estado: 'resuelto', preguntas_desde_cierre: null }), 'resuelto')
})

test('registroEnSilencio: el bot reporta vacíos pero no se registra ninguno', () => {
  const r = registroEnSilencio({
    ultimoGapConversacion: '2026-09-19T15:00:00Z',
    ultimaPreguntaRegistrada: '2026-09-17T15:00:00Z',
  })
  assert.equal(r.enSilencio, true)
  assert.equal(r.horasSinRegistrar, 48)
})

test('registroEnSilencio: dentro de la tolerancia no alarma', () => {
  const r = registroEnSilencio({
    ultimoGapConversacion: '2026-09-19T15:00:00Z',
    ultimaPreguntaRegistrada: '2026-09-19T12:00:00Z',
  })
  assert.equal(r.enSilencio, false)
  assert.equal(r.horasSinRegistrar, 3)
})

test('registroEnSilencio: nunca se registró nada pero sí hay gaps → silencio', () => {
  const r = registroEnSilencio({
    ultimoGapConversacion: '2026-09-19T15:00:00Z',
    ultimaPreguntaRegistrada: null,
  })
  assert.equal(r.enSilencio, true)
  assert.equal(r.horasSinRegistrar, null)
})

test('registroEnSilencio: sin gaps no hay nada que alarmar', () => {
  // Un día tranquilo se ve igual que un módulo muerto SOLO si se mira el
  // registro; por eso la referencia es el gap más reciente, no el reloj.
  const r = registroEnSilencio({ ultimoGapConversacion: null, ultimaPreguntaRegistrada: null })
  assert.equal(r.enSilencio, false)
})

test('registroEnSilencio: el registro más nuevo que el gap no es silencio', () => {
  const r = registroEnSilencio({
    ultimoGapConversacion: '2026-09-19T10:00:00Z',
    ultimaPreguntaRegistrada: '2026-09-19T15:00:00Z',
  })
  assert.equal(r.enSilencio, false)
  assert.equal(r.horasSinRegistrar, 0)
})
