// De dónde se está usando BolBot y, si es desde el recorrido guiado, en qué
// paso va el usuario. Lo escribe onboarding.js y lo leen assistant.js (para
// marcar la fila de bodi_conversations con origin) y el body al webhook (para
// que n8n sepa qué está practicando).
//
// Estado de módulo y no de assistant.js: el portal importa assistant.js sin
// tocar esto, y así su comportamiento queda exactamente igual (origin null).
// Import-safe en Node: sin DOM ni red. Testeable con node:test.

// Solo valores que acepta el check de la columna (ver
// supabase/migrations/add_origin_bodi_conversations.sql). Uno desconocido haría
// fallar el INSERT entero y el chat se quedaría sin fila: mejor tratarlo como
// "sin origen".
const ORIGENES = ['onboarding']

let actual = { origin: null, step: null }

export function setBotOrigin(origin, step) {
  const o = ORIGENES.includes(origin) ? origin : null
  actual = { origin: o, step: o && step ? String(step) : null }
}

export function getBotOrigin() {
  return { ...actual }
}
