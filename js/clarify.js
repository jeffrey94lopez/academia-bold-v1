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
// con opción de soporte — NI cuando ofreció contenido de la otra vertical
// (cross_vertical), que ya trae su propia pregunta Sí/No: dos juegos de botones
// a la vez son dos preguntas simultáneas al usuario.
export function shouldAskResolution(data) {
  if (!data) return false
  return data.asked_clarification !== true &&
    data.support_redirected !== true &&
    data.knowledge_gap !== true &&
    !data.cross_vertical
}

// Body del POST al webhook n8n, con clarify_count y la selección esparcida.
// `contexto` (el del comercio que manda Bold POS, ver js/bold-context.js) es
// opcional: solo agrega claves cuando de verdad las tenemos.
// `cruceAceptado` es el id de la lección de la otra vertical que el usuario
// aceptó ver: hace que n8n responda desde ella saltándose el filtro, pero solo
// en ese turno.
export function chatRequestBody({ message, history, faqContext, clarifyCount, seleccion, contexto, cruceAceptado }) {
  const body = { message, history, faq_context: faqContext, clarify_count: clarifyCount, ...seleccion }
  if (contexto?.accountId)    body.account_id    = contexto.accountId
  if (contexto?.businessName) body.business_name = contexto.businessName
  if (cruceAceptado)          body.cross_vertical_accepted = cruceAceptado
  // Puerta de version: n8n solo OFRECE el cruce cuando ve esta clave. Sin
  // ella, un portal viejo (produccion sin desplegar, o un cliente cacheado)
  // recibiria "¿quieres verla?" sin botones para contestar.
  body.supports_cross = true
  return body
}
