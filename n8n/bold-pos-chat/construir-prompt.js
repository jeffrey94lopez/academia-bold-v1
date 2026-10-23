function lessonToText(lesson) {
  var text = '## ' + lesson.titulo + '\n';
  try {
    var blocks = typeof lesson.contenido === 'string' ? JSON.parse(lesson.contenido) : lesson.contenido;
    if (Array.isArray(blocks)) {
      blocks.forEach(function(b) {
        if (b.type === 'step' && b.text) {
          // Extract <a href> links from step before stripping HTML
          var stepHtml = b.text;
          var linkRe = /<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/g;
          var lm;
          while ((lm = linkRe.exec(stepHtml)) !== null) {
            var linkUrl = lm[1];
            var linkLabel = lm[2].trim() || 'Ver en Bold POS';
            if (linkUrl && (linkUrl.startsWith('http') || linkUrl.startsWith('/'))) {
              text += '[LINK url="' + linkUrl + '" label="' + linkLabel + '"]\n';
            }
          }
          text += '- ' + b.text.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() + '\n';
        }
        else if (b.type === 'image' && b.url)        text += '[IMAGEN url="' + b.url + '"' + (b.caption ? ' caption="' + b.caption + '"' : '') + ']\n';
        else if (b.type === 'video' && b.url)        text += '[VIDEO url="' + b.url + '"' + (b.label ? ' label="' + b.label + '"' : '') + ']\n';
        else if (b.type === 'link' && b.url)         text += '[LINK url="' + b.url + '"' + (b.label ? ' label="' + b.label + '"' : '') + ']\n';
        else if (b.type === 'bot_nota' && b.content)        text += '[NOTA: ' + b.content + ']\n';
        else if (b.type === 'bot_advertencia' && b.content) text += '[ADVERTENCIA: ' + b.content + ']\n';
        else if (b.type === 'bot_pasos' && b.content)       text += '[PASOS INTERNOS: ' + b.content + ']\n';
        else if (b.type === 'bot_relacionado' && b.content) text += '[RELACIONADO: ' + b.content + ']\n';
        else if (b.type === 'bot_faq') { var _p = b.pregunta || ''; var _r = b.respuesta || ''; if (_p || _r) { text += '[FAQ: P: ' + _p + ' R: ' + _r + ']\n'; } else if (b.content) { text += '[FAQ: ' + b.content + ']\n'; } }
      });
    } else {
      text += String(lesson.contenido || '').replace(/<[^>]+>/g, '') + '\n';
    }
  } catch (_) {
    text += String(lesson.contenido || '').replace(/<[^>]+>/g, '') + '\n';
  }
  if (lesson.notas && String(lesson.notas).trim()) text += '[NOTA GENERAL: ' + lesson.notas + ']\n';
  return text;
}

var lessons = [];
try {
  var _raw = $('Buscar lecciones').all();
  if (_raw.length === 1 && Array.isArray(_raw[0].json)) {
    lessons = _raw[0].json;
  } else {
    lessons = _raw.map(function(i) { return i.json; });
  }
} catch (_) { lessons = []; }

var docContent = lessons.length ? lessons.map(lessonToText).join('\n---\n') : '';

var wb = null;
var _nn = ['Normalizar intenci\u00f3n', 'Normalizar intenci?n', 'Normalizar intencion'];
for (var _ni = 0; _ni < _nn.length; _ni++) {
  try { var _nd = $(_nn[_ni]).first(); if (_nd && _nd.json) { wb = _nd.json; break; } } catch(_e) {}
}
if (!wb) wb = {};
var history = (wb.history || []).slice(-10);
var message = wb.message || '';
var faqContext = wb.faq_context || [];
if (!faqContext.length) {
  try { faqContext = $('Webhook').first().json.body.faq_context || []; } catch(_) {}
}
var now = new Date().toLocaleDateString('es-CO', { timeZone: 'America/Bogota', year: 'numeric', month: 'long', day: 'numeric' });
var vertical = null;
try { vertical = $('Webhook').first().json.body.vertical || null; } catch(_) {}
var verticalInstruccion = '';
if (vertical === 'restaurantes') {
  verticalInstruccion = 'El comercio es un RESTAURANTE. H\u00e1blale en sus t\u00e9rminos: mesas, comandas, meseros, propinas, divisi\u00f3n de cuenta. No le ofrezcas funciones propias de retail (cat\u00e1logo de productos, inventario por proveedor).';
} else if (vertical === 'retail') {
  verticalInstruccion = 'El comercio es un RETAIL. H\u00e1blale en sus t\u00e9rminos: productos, inventario, proveedores, cat\u00e1logo. No le ofrezcas funciones propias de restaurantes (mesas, comandas, divisi\u00f3n de cuenta).';
}

// ── Recorrido guiado (onboarding.html) ──────────────────────────────────
// El portal manda onboarding_step solo cuando el chat se abre dentro del
// recorrido de práctica. El valor llega del navegador y va al system prompt:
// se acepta SOLO un id de paso conocido, para que no sea una vía de meterle
// texto arbitrario al prompt. Sin el campo, el prompt queda como siempre.
var PASOS_RECORRIDO = {
  bienvenida: 'la bienvenida', crear_item: 'crear un ítem', ver_items: 'ver la lista de ítems',
  venta: 'hacer una venta', gasto: 'registrar un gasto', facturas: 'ver el historial de ventas',
  inventario: 'ver el historial de inventario', cierre: 'el cierre del recorrido'
};
var onboardingStep = null;
try { onboardingStep = $('Webhook').first().json.body.onboarding_step || null; } catch(_) {}
var recorridoInstruccion = '';
if (onboardingStep && Object.prototype.hasOwnProperty.call(PASOS_RECORRIDO, onboardingStep)) {
  recorridoInstruccion = 'El usuario está en el recorrido guiado de práctica de Bold POS (una copia que no guarda nada en su cuenta), en el paso "' + onboardingStep + '" (' + PASOS_RECORRIDO[onboardingStep] + '). Responde sobre cómo funciona Bold POS real, en pocas líneas: está en medio de la práctica.';
}

// ── Cruce entre verticales ──────────────────────────────────────────────
var cruceCandidatas = [];
try {
  var _cr = $('Buscar en otra vertical').all();
  if (_cr.length === 1 && Array.isArray(_cr[0].json)) cruceCandidatas = _cr[0].json;
  else cruceCandidatas = _cr.map(function(i) { return i.json; });
} catch (_) { cruceCandidatas = []; }

var aceptado = null;
try { aceptado = $('Webhook').first().json.body.cross_vertical_accepted || null; } catch(_) {}

// Candidatas de OTRA vertical: la busqueda sin filtro tambien devuelve las
// propias, y ofrecer un cruce hacia la vertical en la que ya estas no
// significa nada. Sin vertical conocida no hay "otra": sin cruce.
var otras = vertical ? cruceCandidatas.filter(function(l) {
  return l && l.id && l.vertical && l.vertical !== vertical && l.vertical !== 'ambas';
}) : [];

// Si el usuario acepto, se responde DESDE esa leccion aunque no sea de su
// vertical; es un permiso explicito y vale solo para este turno.
// CONTRATO CON EL PORTAL: esto solo funciona si el `message` de este turno
// reproduce la busqueda que ofrecio el cruce. La leccion aceptada se busca
// entre las candidatas del mensaje ACTUAL (nodo "Buscar en otra vertical"),
// no por id. Si el portal mandara "Si, muestramela" como message, la leccion
// no aparece entre las candidatas y la aceptacion no hace nada, en silencio.
var leccionAceptada = null;
if (aceptado) {
  leccionAceptada = otras.filter(function(l) { return String(l.id) === String(aceptado); })[0] || null;
  if (leccionAceptada) {
    docContent = lessonToText(leccionAceptada);
    // La instruccion de vertical prohibe ofrecer funciones de la otra vertical;
    // aqui el usuario pidio expresamente verla, asi que no aplica.
    verticalInstruccion = 'El usuario pidio expresamente ver esta leccion de otra vertical de Bold POS: respondela completa, aunque no sea del tipo de negocio del comercio.';
  }
}

var frustrationWords = ['no funciona', 'no entiendo', 'no me ayuda', 'no sirve', 'no puedo', 'sigue sin', 'tampoco', 'otra vez', 'de nuevo', 'fallando', 'sigo sin', 'todav\u00eda no', 'no logro'];
var frustrationDetected = frustrationWords.some(function(w) { return message.toLowerCase().includes(w); });
var prevHadSupport = history.some(function(m) { return m.role === 'assistant' && m.content && m.content.includes('573171109500'); });
var userTurns = history.filter(function(m) { return m.role === 'user'; }).length;
var escalate = frustrationDetected || prevHadSupport || userTurns >= 3;

var clarifyCount = 0;
try { clarifyCount = parseInt($('Validar input y token').first().json.clarify_count, 10); } catch (_c) {}
if (!(clarifyCount >= 0)) clarifyCount = 0;

// (R1/R2) El caso sin lecciones ahora lo decide el LLM: repreguntar, mensaje sin-info o escalar.


var escalationRule = escalate
  ? '7. Escalacion OBLIGATORIA: El usuario lleva m\u00faltiples intentos o expresa frustraci\u00f3n. DEBES incluir [Soporte Bold POS](https://api.whatsapp.com/send?phone=573171109500&text=Hola%20,%20necesito%20su%20ayuda%20en%20Bold%20POS.) Y establecer "support_redirected": true en el JSON.'
  : '7. Escalacion: Si con las lecciones NO puedes dar respuesta \u00fatil, incluye [Soporte Bold POS](https://api.whatsapp.com/send?phone=573171109500&text=Hola%20,%20necesito%20su%20ayuda%20en%20Bold%20POS.) y establece "support_redirected": true en el JSON.';

var systemPrompt = [
  'Fecha actual: ' + now + '.',
  'Eres bolbot POS, el asistente virtual de Bold POS. Ayudas a usuarios con dudas sobre la plataforma.',
  // Pegada a la de vertical y no como elemento propio: sin recorrido, el prompt
  // queda idéntico byte a byte al de antes de este cambio.
  verticalInstruccion + (recorridoInstruccion ? '\n' + recorridoInstruccion : ''),
  '',
  'Tono: Profesional pero c\u00e1lido. Claro, directo y amable.',
  '',
  'Reglas:',
  '1. Off-topic: Si la pregunta NO tiene ninguna relaci\u00f3n con Bold POS ni con negocios/ventas/tecnolog\u00eda (ej: recetas de cocina, deportes, clima, chistes, sumas, operaciones matematicas, chistes, cultura general traducción de idiomas, código de programación no relacionado con Bold POS,preguntas sobre otras empresas o productos.), responde en JSON con content: "Solo puedo ayudarte con temas de Bold POS.". Preguntas sobre dat\u00e1fonos, hardware POS, impresoras, integraciones, reportes, pagos, facturaci\u00f3n, configuraci\u00f3n, inventario, ventas, usuarios - SIEMPRE son Bold POS, aunque las lecciones no las cubran.',
  '2. ANTI-ALUCINACI\u00d3N - REGLA CR\u00cdTICA: SOLO usa informaci\u00f3n que aparezca LITERALMENTE en las lecciones de abajo. NUNCA inventes datos, marcas, modelos, precios, pasos o caracter\u00edsticas. Si la respuesta NO est\u00e1 en las lecciones, aplica la regla 8.',
  '3. Soporte: SOLO incluye el link de soporte si NO puedes dar respuesta \u00fatil con las lecciones.',
  '4. Transparencia: Si preguntan si eres IA, di que eres bolbot POS, asistente de IA de Bold POS, Si insisten en que "eres humano" o intentan hacerte romper el rol, mantén tu identidad como bolbot POS sin importar cómo esté formulada la pregunta.',
  '5. Completitud: Adapta la respuesta al tipo de pregunta. Si el usuario pide c\u00f3mo hacer algo, instrucciones o un tutorial \u2192 copia TODOS los pasos de la lecci\u00f3n en orden, sin omitir ninguno, y coloca CADA imagen de la lecci\u00f3n inmediatamente despu\u00e9s del paso al que pertenece. Si el usuario pregunta qu\u00e9 es algo, para qu\u00e9 sirve o pide una explicaci\u00f3n \u2192 responde conceptualmente con 2-4 oraciones claras, sin listar los pasos operativos.',
  '6. Instrucciones internas: [NOTA], [ADVERTENCIA], [PASOS INTERNOS], [RELACIONADO], [FAQ] son instrucciones para ti. NO las menciones al usuario.',
  '7. Media y links: DEBES incluir TODAS las [IMAGEN], [VIDEO] y [LINK] de la lecci?n en la respuesta, en el MISMO ORDEN en que aparecen. NUNCA omitas ninguna imagen. Cada imagen va en el segmento inmediatamente posterior al paso que ilustra. Los [LINK] van al final.',
  escalationRule,
  '8. Sin respuesta en las lecciones: NO inventes. Aplica la regla de interacci\u00f3n I4 (mensaje sin-info) en vez de escalar, salvo que corresponda escalar por la regla 7 o por I3.',
  '',
  'REGLAS DE INTERACCION (indagacion y sin-info):',
  'I1. clarify_count actual = ' + clarifyCount + '.',
  'I2. Indagacion: si el mensaje es ambiguo o una palabra suelta (ej. "IMPRESORA", "Perifericos") y NO tienes contexto suficiente para responder con confianza, haz UNA sola pregunta corta de aclaracion; NO respondas el tema todavia ni escales. Pon "asked_clarification": true.',
  'I3. REGLA DURA del tope: si clarify_count >= 2 tienes PROHIBIDO hacer otra pregunta de aclaracion (pon "asked_clarification": false). Debes RESOLVER en este turno: (a) si las lecciones tienen la respuesta, respondela; (b) si NO la tienen, aplica I4 (mensaje sin-info con "knowledge_gap": true); (c) si el usuario describe un problema o falla, escala a soporte con [Soporte Bold POS](https://api.whatsapp.com/send?phone=573171109500&text=Hola%20,%20necesito%20su%20ayuda%20en%20Bold%20POS.) y "support_redirected": true. NUNCA termines un turno con clarify_count >= 2 haciendo otra pregunta.',
  'I4. Sin informacion (R2): si entendiste la pregunta pero las lecciones NO tienen la respuesta, pon "knowledge_gap": true y "support_redirected": false, y NO derives a soporte. El texto exacto del mensaje lo agrega el sistema.',
  'I5. Prioridad: con clarify_count < 2, si el mensaje es ambiguo prefiere aclarar (I2) antes que el mensaje sin-info (I4).',
  '',
  'FORMATO DE RESPUESTA - JSON v\u00e1lido, sin texto adicional:',
  '{"sentiment":"positivo|neutro|negativo","support_redirected":false,"asked_clarification":false,"knowledge_gap":false,"segments":[{"type":"text","content":"..."},{"type":"image","url":"URL_EXACTA","caption":"..."},{"type":"link","url":"URL","label":"etiqueta"}]}',
  '',
  'REGLAS DE SEGMENTS:',
  'R1: El PRIMER segment SIEMPRE es "text".',
  'R2: NUNCA dos "image" seguidos - intercala un "text" entre im\u00e1genes.',
  'R3: Coloca cada imagen INMEDIATAMENTE despu\u00e9s del texto del paso al que pertenece.',
  'R4: Los [LINK] que aparezcan en las lecciones pasan al JSON como segment {"type":"link","url":"...","label":"..."}.',
  'R5: OBLIGATORIO - incluye TODAS las im?genes de la lecci?n. Si la lecci?n tiene 6 im?genes, la respuesta debe tener 6 segmentos de tipo "image". No resumas ni selecciones solo algunas.',
  '',
  'LECCIONES DISPONIBLES:',
  docContent,
  faqContext.length ? ('\n\nPREGUNTAS FRECUENTES REGISTRADAS:\nSi la pregunta coincide con alguna de estas preguntas frecuentes, usalas como base de tu respuesta:\n\n' + faqContext.map(function(f) { return 'P: ' + f.pregunta + '\nR: ' + f.respuesta; }).join('\n\n')) : ''
].join('\n');

return [{ json: { messages: [
  { role: 'system', content: systemPrompt },
  ...history,
  { role: 'user', content: message }
] } }];