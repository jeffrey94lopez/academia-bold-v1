# Sub-proyecto A — Reglas de interacción del bot (Design)

> **Fecha:** 2026-07-23 · **Rama:** sandbox · **Estado:** diseño aprobado, pendiente spec-review del usuario

## Contexto: parte de un pedido mayor

Este spec cubre **solo el sub-proyecto A** de un pedido de 4 subsistemas ("Optimización del bot + dashboard"). Descomposición aprobada, orden **A → C → D → B**, cada uno con su propio ciclo spec → plan → implementación:

| # | Sub-proyecto | Capa |
|---|---|---|
| **A** (este spec) | Reglas de interacción del bot (indagación + mensaje sin-info + señales medibles) | n8n (prompt) + frontend chico + schema |
| **C** | Etiquetas y clasificación (etiqueta "Información faltante" en la conversación + consolidar alertas "Requiere tu atención") | Dashboard + DB |
| **D** | UI del dashboard (clasificaciones dentro de la barra de satisfacción + separar insights bot vs. lecciones) | Frontend (sandbox) |
| **B** | Estados de conversación exclusivos (Cerrada por Cliente / Abandonada por BOT / Escalada a Soporte + timers 2min/10min) | Frontend + DB + posible cron |

Notas de dependencia:
- La **señal de "sin info"** que produce A es consumida por C (etiqueta) y D (insights). Por eso A la deja como dato persistido.
- No confundir el **estado de ciclo de vida** (B: Cerrada/Abandonada/Escalada — dimensión única) con el **estado de calidad** (`resolution_status`: Resuelta/No resuelta/Ambigua, que produce ①c del rediseño de analytics). Son dimensiones ortogonales.
- **①c** (auto-evaluación con LLM en n8n del rediseño de analytics) sigue pendiente. A produce señales **deterministas y baratas ahora**; ①c dará la evaluación rica después. Se mantienen en columnas separadas para no colisionar.

## Objetivo

Mejorar el lenguaje natural y las reglas de interacción del bot para:
1. **Indagar antes de responder o escalar** ante entradas ambiguas o palabras clave sueltas.
2. **Manejar mejor el "no tengo información"** con un mensaje que comunica el aprendizaje semanal y no empuja a soporte.
3. Dejar **señales medibles** que permitan calcular los KPIs del Sprint 1 sin esperar a ①c.

### KPIs Sprint 1 que A habilita
- Aumentar **+10% el volumen de preguntas completadas**.
- Incrementar la **resolución +15%**.

## Arquitectura y contexto técnico

- El cerebro del chat es el workflow n8n **"Bold POS Chat"** (id `dZGuYJbRbG6h8aqv`) en `https://n8n.mplasesores.com`. El repo solo tiene el proxy `api/chat.js`.
- La cadena RAG (Embeber → Buscar lecciones → Construir prompt → OpenAI → Formatear respuesta) **corre siempre**; los routers de intención solo **añaden** el mensaje de soporte. El nodo "Clarificar" está **desconectado** (huérfano). Por eso **toda la lógica de indagación se implementa vía prompt, no recableando nodos**.
- Contrato de respuesta actual (n8n → frontend, consumido en `js/assistant.js` ~L617-660): `{ response, segments[], media[], support_redirected, topic, sentiment, lessons_used }`. El frontend ya persiste `topic/sentiment/support_redirected/lessons_used` vía `upsertConversation` (`js/assistant.js:654`).
- El frontend ya envía en el body del webhook: `{ message, history, faq_context, ...getSeleccion() }` (`js/assistant.js:615`). `history` incluye el mensaje actual como último item.
- Edición de n8n en vivo: patrón del frente 3 — backup del workflow, `curl PUT` (aprobado en `.claude/settings.local.json`), prueba con webhook (header `x-api-key: BoldBodi-2026-K9xMvP7q`), rollback restaurando el backup.

## Comportamiento del bot (reglas de prompt en n8n)

Se edita el system prompt del nodo **"Construir prompt"**:

### R1 — Indagación adaptativa (tope 2)
- Si el mensaje del usuario es **ambiguo o una palabra suelta** (ej. `"IMPRESORA"`, `"Periféricos"`) y no hay contexto suficiente para responder con confianza → hacer **UNA pregunta corta de aclaración**, no responder ni escalar.
- Si la respuesta del usuario ya aclara → responder normalmente.
- Si sigue ambiguo → hacer una **2ª** pregunta de aclaración.
- Tras **2 intentos** sin lograr contexto → dar la mejor respuesta posible con las lecciones disponibles, o escalar a soporte si aplica.
- El tope de 2 se hace **determinista** pasando `clarify_count` desde el frontend (ver R4 / Interfaz), usado como regla dura en el prompt: `si clarify_count >= 2, no volver a preguntar`.

### R2 — Mensaje "sin información"
Cuando el bot entendió la pregunta pero **no hay contenido** en la base para responderla, responde con este copy (aprobado) y **no** deriva a soporte:

> Todavía no tengo información sobre eso 🙏 Soy un asistente que se actualiza cada semana con las consultas de los usuarios, así que es muy probable que pronto pueda ayudarte. ¿Quieres que te ayude con otra cosa mientras tanto?

### R3 — Escalamiento a soporte
- Se mantiene la lógica actual (frustración: `"no funciona"`/`"sigo sin"`/`"otra vez"`, `userTurns >= 3`, soporte previo en el historial).
- **Nuevo gatillo:** 2 aclaraciones sin éxito (R1).
- El caso sin-info (R2) por sí solo **ya no escala**.

## Interfaz de datos (metadata + persistencia + schema)

### Enfoque para el tope de 2 (decisión de arquitectura)
Elegido: **el frontend cuenta y envía `clarify_count`** (determinista, reusa el cambio de frontend que igual se hace). Descartados: (1) que el LLM cuente desde `history` (poco fiable); (3) que n8n lo derive por heurística de signos `?` (frágil, sin señal real de "fue aclaración").

### n8n → frontend (respuesta JSON)
El LLM final produce **salida estructurada** y el nodo "Formatear respuesta" agrega al JSON de respuesta:
- `knowledge_gap: boolean` — `true` cuando el bot dio el mensaje sin-info (R2).
- `asked_clarification: boolean` — `true` cuando el turno fue una pregunta de aclaración (R1), no una respuesta final.
- `category` — se **reusa** el `topic` que ya se devuelve (no se duplica campo).

### frontend → DB (`js/assistant.js`)
- `upsertConversation` (L654) agrega al patch: `bot_no_info` (← `knowledge_gap`) y `bot_asked_clarification` (← `asked_clarification`).
- `handleSend` mantiene un `clarify_count` de sesión (incrementa cuando la respuesta trae `asked_clarification:true`, se reinicia al lograr respuesta final o al limpiar el chat) y lo incluye en el body del webhook (L615).

### schema (`bodi_conversations`)
Migración mínima (aplicada por el usuario en Supabase, patrón de ①a):
```sql
ALTER TABLE bodi_conversations
  ADD COLUMN IF NOT EXISTS bot_no_info boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bot_asked_clarification boolean NOT NULL DEFAULT false;
```
**No se reusa** la columna `knowledge_gap` de ①a (reservada al texto descriptivo del LLM de ①c).

## Cómo se mide (KPIs Sprint 1)

Con estas señales los KPIs quedan calculables sin esperar a ①c (el **display** en dashboard es trabajo de C/D; A solo deja el dato):
- **Preguntas completadas (+10%):** `completadas = conversaciones con respuesta final del bot (no bot_no_info, no escaladas)`. `bot_asked_clarification` permite ver el embudo de indagación.
- **Resolución (+15%):** proxy interino `1 − (escaladas + bot_no_info) / total`, hasta que ①c entregue la resolución real de 3 estados.

## Testing y verificación

- **Unit (Node, patrón del repo `tests/*.test.mjs`):** función pura para la lógica de `clarify_count` (decidir si incrementar/reiniciar y el shape del body), colocada en un módulo import-safe en Node (ej. `js/vertical.js` o un util nuevo — **no** en `assistant.js`, que importa desde CDN y rompe el import en Node). Test cubre: incremento con `asked_clarification:true`, reinicio con respuesta final, reinicio al limpiar chat.
- **n8n en vivo (con backup + rollback):** probar los casos reales que fallaron:
  - `"IMPRESORA"` → repregunta (R1), `asked_clarification:true`, **no** escala.
  - Seguir ambiguo → 2ª pregunta → luego responde o escala (tope 2).
  - Pregunta clara sin contenido → mensaje sin-info (R2), `knowledge_gap:true`, **no** escala.
  - Verificar en la fila de `bodi_conversations` que `bot_no_info`/`bot_asked_clarification` quedaron seteados.
- **Suite verde:** `node --test tests/*.test.mjs`.

## Riesgos y fuera de alcance

- **Riesgo:** el LLM podría no marcar bien `knowledge_gap`/`asked_clarification`. **Mitigación:** salida estructurada con campos booleanos explícitos + few-shot en el prompt.
- **Riesgo:** edición de n8n en producción. **Mitigación:** backup + prueba con webhook + rollback (patrón frente 3); confirmar con el usuario antes de cada PUT.
- **Fuera de alcance:** máquina de estados y timers (B); etiqueta visual y consolidación de alertas en el dashboard (C); UI de barra de satisfacción e insights (D); la evaluación rica con LLM (①c del rediseño de analytics).
