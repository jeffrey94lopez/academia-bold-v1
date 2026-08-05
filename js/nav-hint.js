// Aviso "aquí abajo también tienes Centro de Ayuda, FAQs y Curso" del nav móvil.
// Se muestra hasta que el usuario lo cierra (se guarda 'true' en storage).
// Lógica pura (recibe el valor guardado) → import-safe y testeable en Node.

export const NAV_HINT_KEY = 'nav_hint_dismissed'

export function shouldShowNavHint(dismissed) {
  return dismissed !== 'true'
}
