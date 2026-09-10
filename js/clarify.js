// Lógica pura del contador de indagación (clarify_count) del bot.
// Import-safe en Node: sin DOM ni dependencias de CDN. Testeable con node:test.
//
// El backend (n8n) usa `clarify_count >= 2` como regla dura para dejar de
// repreguntar. El frontend cuenta cuántas veces SEGUIDAS el bot pidió
// aclaración en la sesión y lo manda en el body del webhook.

// Próximo valor del contador a partir del actual y la respuesta del bot.
// Incrementa si el turno fue una aclaración; se reinicia en respuesta final.
export function nextClarifyCount(current, data) {
  const n = Number.isInteger(current) && current >= 0 ? current : 0
  return data && data.asked_clarification === true ? n + 1 : 0
}

// ¿Se debe mostrar el botón "¿Logré resolver tu duda? Sí/No" tras este turno?
// Solo cuando el bot dio una respuesta/resultado real: NO en las repreguntas
// (asked_clarification), NI cuando derivó a soporte (support_redirected), NI
// cuando no tuvo información (knowledge_gap) — esos dos traen su propio prompt
// con opción de soporte. data null/undefined → no se muestra.
export function shouldAskResolution(data) {
  if (!data) return false
  return data.asked_clarification !== true &&
    data.support_redirected !== true &&
    data.knowledge_gap !== true
}

// Body del POST al webhook n8n, con clarify_count y la selección esparcida.
// `contexto` (el del comercio que manda Bold POS, ver js/bold-context.js) es
// opcional: solo agrega claves cuando de verdad las tenemos, para no cambiarle
// la forma del payload a n8n mientras Bold no lo implemente.
export function chatRequestBody({ message, history, faqContext, clarifyCount, seleccion, contexto }) {
  const body = { message, history, faq_context: faqContext, clarify_count: clarifyCount, ...seleccion }
  if (contexto?.accountId)    body.account_id    = contexto.accountId
  if (contexto?.businessName) body.business_name = contexto.businessName
  return body
}
