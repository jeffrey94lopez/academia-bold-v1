// js/onboarding-resume.js — qué tarjeta mostrar en el portal (Ayuda) para
// retomar el recorrido guiado, según el avance guardado por onboarding.html
// (Task 3: onboarding-progress.js). Módulo puro, sin DOM: el render vive en
// main.js, igual que nav-hint.js.
import { numeroPaso, TOTAL_PASOS } from './onboarding-steps.js'

/**
 * `estado` es lo que devuelve `cargarAvance` (o `null` si no hay nada
 * guardado para esa cuenta). `bienvenida` sin terminar cuenta como "nunca
 * empezó": el cliente no alcanzó a tocar nada del recorrido real.
 */
export function modeloTarjeta(estado) {
  if (!estado || estado.step === 'bienvenida') return { tipo: 'empezar' }
  if (estado.completed) return { tipo: 'repetir' }
  return { tipo: 'continuar', paso: numeroPaso(estado.step) ?? 1, total: TOTAL_PASOS }
}
