# Sub-proyecto C — Etiquetas y clasificación (Design)

> **Fecha:** 2026-07-24 · **Rama:** sandbox · **Estado:** diseño aprobado, pendiente spec-review del usuario

## Contexto: parte de un pedido mayor

Este spec cubre **solo el sub-proyecto C** del pedido de 4 subsistemas ("Optimización del bot + dashboard"), orden **A → C → D → B**. A ya está completo y en producción (reglas de interacción + señales `bot_no_info`/`bot_asked_clarification`). C consume la señal determinista `bot_no_info` que A dejó persistida.

| # | Sub-proyecto | Estado |
|---|---|---|
| **A** | Reglas de interacción del bot | ✅ producción 2026-07-24 |
| **C** (este spec) | Etiquetas y clasificación (card consolidada + badge "Sin info") | diseño aprobado |
| **D** | UI del dashboard (clasificaciones en barra + separar insights) | pendiente |
| **B** | Estados de conversación exclusivos | pendiente |

## Objetivo

Aprovechar la señal determinista `bot_no_info` (persistida por A en `bodi_conversations`) dentro del dashboard BolBot:
1. **Consolidar** dos cards de "Requiere tu atención" en una sola card determinista basada en `bot_no_info` + escalamiento.
2. **Etiquetar** en el explorador de conversaciones las que tuvieron falta de información.

Reduce ruido en el dashboard y hace visible dónde el bot falla por falta de contenido, sin depender del LLM (①c, aún pendiente).

## Arquitectura

Dos capas. Todo el frontend vive en **`js/admin-bot-analytics.js`**; la lógica pura de selección de la card se extrae a un módulo import-safe testeable.

### ① DB — 2 RPCs (las aplica el usuario en el SQL Editor de Supabase, patrón de A)

**`analytics_bot_summary`** — exponer `no_info` por categoría:
- Agregar `bot_no_info` a la selección del CTE `res`.
- En el subquery `by_category`, agregar a cada objeto: `'no_info', count(*) filter (where bot_no_info)`.
- El resto de la función (kpis, heatmap, otros cortes de by_category) queda intacto.

**`analytics_bot_conversations`** — exponer `bot_no_info` por conversación:
- Agregar `bot_no_info` a la lista de columnas del CTE `res`. Como la función devuelve `to_jsonb(r)`, el campo aparece automáticamente en cada fila; no hay que tocar nada más.

Ambas se recrean con `drop function if exists ... / create or replace` (patrón del repo) y conservan los `revoke/grant` existentes.

### ② Card consolidada "📚 Contenido por reforzar"

Reemplaza en "Requiere tu atención" (`js/admin-bot-analytics.js` ~L57-68) las **dos** cards actuales — 🔗 *Contenido faltante* y ↗ *Escala mucho a soporte* — por **una** card. La sección pasa de 4 a 3 cards (se conservan 😟 *Sentimiento negativo* y 🔴 *Dudas recurrentes no resueltas ①c*).

Comportamiento:
- Rankea `summary.by_category` por `no_info` descendente y toma la #1 con `no_info > 0`.
- Texto: `"{categoría}": {no_info} sin-info · {support_pct}% escala a soporte`.
- Acción (cruza la categoría elegida con `content_gaps`/`gaps` para `has_lesson`):
  - si **no** hay lección → botón `→ Crear lección` (reusa `goToCreateLesson`, atributo `data-gap-cat`).
  - si **sí** hay lección → botón `→ Reforzar contenido` (reusa `goToEditLessonByCategory`, atributo `data-edit-cat`).
- Sin datos (ninguna categoría con `no_info > 0`): texto "Sin huecos de información en el rango.", sin botón.
- Tono/estilo: reusa `attentionCard(...)` existente (tono `warning`).

**Función pura testeable** — la selección se extrae a una función sin DOM:
```
pickContentToReinforce(byCategory, gaps) => { category, noInfo, supportPct, hasLesson, action } | null
```
- `action` es `'create'` (no hay lección) o `'reinforce'` (sí hay), derivado de `gaps`.
- Devuelve `null` cuando no hay categoría con `noInfo > 0`.
- La card se arma a partir de este objeto; `renderBotAnalytics` solo formatea y cablea el botón.
- Ubicación: módulo import-safe (p. ej. `js/analytics-ui.js`, ya testeado en `tests/analytics-ui.test.mjs`, o un helper nuevo). No en `admin-bot-analytics.js` si ese archivo no es import-safe en Node.

### ③ Badge "Sin info" en el explorador

En `convRows` (`js/admin-bot-analytics.js` ~L177-184), junto a los badges "Neg" y "Escaló", agregar cuando `c.bot_no_info === true`:
- Un badge corto (texto "Sin info") con el mismo patrón visual de los existentes (borde + color; tono `warning`/`blue`, sin clases Tailwind nuevas).
- **Sin filtro nuevo** en el explorador (fuera de alcance).

## Interfaz de datos

- `analytics_bot_summary().by_category[i].no_info: number` — nuevo campo, conteo de conversaciones con `bot_no_info` en esa categoría dentro del rango.
- `analytics_bot_conversations()[i].bot_no_info: boolean` — nuevo campo por conversación.
- El frontend no cambia sus llamadas a `fetchBotSummary`/`fetchBotConversations`/`fetchContentGaps`; solo consume los campos nuevos.

## Testing y verificación

- **Unit (`node:test`, patrón `tests/*.test.mjs`):** `pickContentToReinforce` — cubre: elige la categoría con más `no_info`; deriva `action: 'create'` vs `'reinforce'` según `has_lesson` en `gaps`; devuelve `null` cuando ninguna categoría tiene `no_info > 0`; ignora categorías con `no_info = 0`.
- **Suite verde:** `node --test tests/*.test.mjs`.
- **Navegador (manual, tras aplicar las RPCs):** en /admin → analytics → BolBot, verificar que la card "Contenido por reforzar" muestra la categoría con más sin-info y el botón correcto (crear/reforzar), y que las conversaciones con `bot_no_info` muestran el badge "Sin info" en el explorador.
- **RPCs:** aplicación y verificación **manual** por el usuario (el MCP de Supabase de la sesión no ve el proyecto Bold POS).

## Riesgos y fuera de alcance

- **Datos incrementales:** `no_info` solo se llena con conversaciones nuevas (A ya está en prod); las viejas quedan en `false`. La card se pobla a medida que llegan datos — no es un bug.
- **Fuera de alcance:** filtro "Sin info" en el explorador; la card 😟 Sentimiento negativo y la 🔴 de ①c; clasificaciones dentro de la barra de satisfacción y separación de insights (eso es D); estados de ciclo de vida (B); la evaluación rica con LLM (①c).
