// js/onboarding-telemetry.js — eventos de analítica del recorrido guiado.
//
// No importa js/analytics.js directamente: recibe `track` por inyección, así
// se prueba en Node sin tocar Supabase. `vertical` es siempre 'retail' porque
// el recorrido todavía no existe para restaurantes (Global Constraints).

const VERTICAL = 'retail'

export function crearTelemetria({ track, getRunId, getAccountId }) {
  function payload(extra) {
    const p = { run_id: getRunId(), ...extra, vertical: VERTICAL }
    const accountId = getAccountId()
    if (accountId !== null && accountId !== undefined) p.account_id = accountId
    return p
  }

  return {
    inicio() { track('onboarding_start', payload({})) },
    pasoCompleto(step) { track('onboarding_step_complete', payload({ step })) },
    salto(step) { track('onboarding_skip', payload({ step })) },
    retomo(step) { track('onboarding_resume', payload({ step })) },
    fin() { track('onboarding_complete', payload({})) },
    // Solo aperturas a mano con el botón: la automática (pantallas anchas) no
    // es una decisión del usuario y no se cuenta.
    botAbierto(step) { track('onboarding_bot_open', payload({ step })) },
    // Cada mensaje que el usuario le manda a BolBot desde el recorrido.
    mensajeBot(step) { track('onboarding_bot_message', payload({ step })) },
  }
}
