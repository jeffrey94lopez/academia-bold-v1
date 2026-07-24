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

// Body del POST al webhook n8n, con clarify_count y la selección esparcida.
export function chatRequestBody({ message, history, faqContext, clarifyCount, seleccion }) {
  return { message, history, faq_context: faqContext, clarify_count: clarifyCount, ...seleccion }
}
