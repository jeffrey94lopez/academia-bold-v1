// Check if Construir prompt returned a direct response (no lessons)
try {
  var promptOut = $('Construir prompt').first().json;
  if (promptOut && promptOut._directResponse) {
    var direct = JSON.parse(promptOut._directResponse);
    return [{ json: direct }];
  }
} catch(_dr) {}

var raw = $json.choices?.[0]?.message?.content ?? $json.message?.content ?? $json.response ?? '';
var parsed;
try { parsed = JSON.parse(raw); } catch(_) { parsed = null; }
var segments = (parsed && Array.isArray(parsed.segments)) ? parsed.segments : null;
var reply;
if (segments) {
  reply = segments.filter(function(s) { return s.type === 'text'; }).map(function(s) { return s.content; }).join('\n\n');
} else {
  reply = parsed ? (parsed.reply || raw) : raw;
}
if (!reply) reply = raw;
var sentiment = (parsed && parsed.sentiment) ? parsed.sentiment : 'neutro';
if (!['positivo', 'neutro', 'negativo'].includes(sentiment)) sentiment = 'neutro';
var supportRedirected = (parsed && parsed.support_redirected === true) || reply.includes('573171109500');
var topic = 'desconocido';
var nodeNames = ['Normalizar intenci?n', 'Normalizar intenci?n', 'Normalizar intencion'];
for (var i = 0; i < nodeNames.length; i++) {
  try {
    var nd = $(nodeNames[i]).first();
    if (nd && nd.json) { topic = nd.json.topic || nd.json.categoria || nd.json.branch || 'desconocido'; break; }
  } catch(_) {}
}
var lessons_used = [];
var media = [];
if (segments) {
  segments.forEach(function(s) {
    if (s.type === 'image' && s.url) media.push({ type: 'image', url: s.url, caption: s.caption || '' });
    else if (s.type === 'video' && s.url) media.push({ type: 'video', url: s.url, label: s.label || '' });
  });
} else if (parsed && Array.isArray(parsed.media)) {
  parsed.media.forEach(function(m) {
    if (!m || !m.url) return;
    if (m.type === 'image') media.push({ type: 'image', url: m.url, caption: m.caption || '' });
    else if (m.type === 'video') media.push({ type: 'video', url: m.url, label: m.label || '' });
  });
}
var clarifyCountF = 0;
try { clarifyCountF = parseInt($('Validar input y token').first().json.clarify_count, 10); } catch (_cf) {}
if (!(clarifyCountF >= 0)) clarifyCountF = 0;
var vertical = null, soportaCruce = false, aceptado = null;
try {
  var _b = $('Webhook').first().json.body;
  vertical = _b.vertical || null;
  soportaCruce = _b.supports_cross === true;
  aceptado = _b.cross_vertical_accepted || null;
} catch(_) {}

var otras = [];
try {
  var _cr = $('Buscar en otra vertical').all();
  var filas = (_cr.length === 1 && Array.isArray(_cr[0].json)) ? _cr[0].json : _cr.map(function(i) { return i.json; });
  // Defensivo: con executeOnce el nodo no repite filas, pero si alguien restaura
  // un respaldo donde executeOnce era false devolveria cada fila una vez por item
  // de entrada. Deduplicar por id mantiene correcta la eleccion en ese caso.
  var vistos = {};
  filas.forEach(function(l) {
    if (!l || !l.id || vistos[l.id]) return;
    if (!vertical || l.vertical === vertical || l.vertical === 'ambas') return;
    vistos[l.id] = true;
    otras.push(l);
  });
  otras.sort(function(a, b) { return (b.similarity || 0) - (a.similarity || 0); });
} catch(_) {}

// Mejor candidata PROPIA, para comparar. Se lee del nodo filtrado.
var mejorPropia = 0;
try {
  var _pr = $('Buscar lecciones').all();
  var fp = (_pr.length === 1 && Array.isArray(_pr[0].json)) ? _pr[0].json : _pr.map(function(i) { return i.json; });
  fp.forEach(function(l) { if (l && l.id && (l.similarity || 0) > mejorPropia) mejorPropia = l.similarity; });
} catch(_) {}

// Se ofrece el cruce cuando la mejor leccion de la OTRA vertical le gana en
// similitud a la mejor de la propia. No se usa knowledge_gap: el modelo
// improvisa con lecciones flojas en vez de admitir que no sabe. Tampoco "la
// busqueda propia vino vacia": con umbral 0.15 casi nunca viene vacia.
// El id sale del item, nunca del texto del modelo.
//
// El cruce NO debe pisar una derivacion a soporte: un usuario frustrado que
// pregunta algo de la otra vertical necesita el link de soporte, no una
// oferta. Y `parsed` solo existe cuando la respuesta vino del LLM de lecciones:
// las ramas de soporte y clarificacion llegan a este nodo sin pasar por el
// modelo, y ahi el cruce no tiene nada que hacer. derivaASoporte se lee ANTES
// de que supportRedirected se apague mas abajo.
var vieneDelModelo = !!(parsed && typeof parsed === 'object');
var derivaASoporte = supportRedirected === true;

var crossVertical = null;
if (soportaCruce && !aceptado && vieneDelModelo && !derivaASoporte
    && otras.length && (otras[0].similarity || 0) > mejorPropia) {
  crossVertical = { leccion_id: otras[0].id, titulo: otras[0].titulo, vertical: otras[0].vertical };
}
var askedClarification = !!(parsed && parsed.asked_clarification === true) && clarifyCountF < 2 && !crossVertical;
var knowledgeGap = !!(parsed && parsed.knowledge_gap === true) && !crossVertical;
if (askedClarification || crossVertical) supportRedirected = false;
if (crossVertical) {
  var etiq = crossVertical.vertical === 'restaurantes' ? 'Restaurantes' : 'Retail';
  var CRUCE_COPY = 'Eso no est\u00e1 en el contenido de tu tipo de negocio, pero s\u00ed tenemos una lecci\u00f3n de ' + etiq + ' sobre \u00ab' + crossVertical.titulo + '\u00bb. \u00bfQuieres verla?';
  reply = CRUCE_COPY;
  segments = [{ type: 'text', content: CRUCE_COPY }];
  media = [];
} else if (knowledgeGap) {
  var NO_INFO_COPY = 'Todav\u00eda no tengo informaci\u00f3n sobre eso \ud83d\ude4f Soy un asistente que se actualiza cada semana con las consultas de los usuarios, as\u00ed que es muy probable que pronto pueda ayudarte. \u00bfQuieres que te ayude con otra cosa mientras tanto?';
  reply = NO_INFO_COPY;
  segments = [{ type: 'text', content: NO_INFO_COPY }];
  media = [];
  supportRedirected = false;
}
var out = { response: reply, segments: segments, topic: topic, sentiment: sentiment, support_redirected: supportRedirected, asked_clarification: askedClarification, knowledge_gap: knowledgeGap, media: media, lessons_used: lessons_used };
if (crossVertical) out.cross_vertical = crossVertical;
return [{ json: out }];