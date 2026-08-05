# Rediseño del dashboard BolBot — Diseño

**Fecha:** 2026-08-04
**Estado:** Diseño aprobado. Siguiente: plan de implementación.
**Relacionado:** rediseña la pestaña BolBot (③) de `js/admin-bot-analytics.js`, ahora que ①c (auto-eval LLM) está en producción y los datos son reales.

## Contexto y problema

La pestaña BolBot actual tiene la parte de arriba con problemas confirmados por el usuario:
- **KPIs confusos:** "Resolución real 53%" y "Resuelto sin soporte 71%" se mostraban como dos porcentajes grandes lado a lado, pero miden cosas distintas con denominadores distintos (no suman 100) → invitan a leerse como partes del mismo todo.
- **"Requiere tu atención" no servía:** tres tarjetas (Contenido por reforzar, Sentimiento negativo, Dudas recurrentes no resueltas) poco accionables.
- **Recargado** y con **métricas sueltas que no llevan a los datos** (no se puede pasar de un número a las conversaciones que lo componen).

Se **conservan** tal cual (funcionan bien): **Dudas por categoría**, **Cuándo escriben (heatmap)** y el **Explorador de conversaciones**.

**No requiere backend:** todos los datos ya vienen en `analytics_bot_summary` (`kpis.total`, `kpis.support`, `kpis.lifecycle`, `kpis.resolved/unresolved/ambiguous`, `kpis.sentiment`) y todos los filtros del drill-down ya existen en la RPC del explorador (`analytics_bot_conversations`: estado, sentimiento, soporte, categoría, lifecycle). Es un rediseño **solo de frontend**.

## Principio rector

**Un porcentaje = un denominador claro.** Lo que es "parte de un todo" va en barra apilada que suma 100; nunca como números sueltos que parezcan sumar y no sumen. **Toda métrica es un drill-down**: clic → baja al explorador y aplica el filtro correspondiente.

## Diseño

### Global
- **Nombre de la pestaña:** cambia de `BolBot` a **`BoldBot POS`** (`LABELS.bolbot` en `js/analytics-shell.js`). La clave interna de la pestaña (`'bolbot'`) y el orden no cambian, solo la etiqueta visible.
- **Picker de rango de fechas** arriba (patrón existente `rangeControlsHtml`), scopea toda la pestaña (header, qué-atender, categorías, heatmap y explorador).
- **Tema Merlin** (solo tokens de `css/style.css`).

### 1. Header (una tarjeta)

- **Titular:** `185 conversaciones · así terminaron` (`kpis.total`).
- **Barra 1 — resultado grueso (suma 100):** `bot X%` / `soporte Y%`. `soporte` = `kpis.support`; `bot` = `total − support`. Colores: bot = success, soporte = warning. Segmentos clicables.
- **Barra 2 — desglose del ciclo de vida (suma 100), justo debajo:** `cerró el cliente N` / `abandonó N` / `escaló N` (de `kpis.lifecycle`: `cerrada_cliente` / `abandonada` / `escalada`). Colores que **descomponen la barra 1**: cerró = success, abandonó = neutro (gris), escaló = warning (igual que soporte). Así se lee que `cerró + abandonó = bot` y `escaló = soporte`. Segmentos clicables.
- **Resolución real (línea secundaria, con el faltante explícito):** `Resolución real X% · N resueltas · N no resueltas · N ambiguas`. `resolved_pct = resueltas ÷ (resueltas + no_resueltas)` (excluye ambiguas). Los 3 conteos vienen de `kpis.resolved/unresolved/ambiguous`. **Las ambiguas se muestran explícitas** (no se esconde el faltante). Cada uno de los 3 es clicable.
- **Sentimiento (con caritas + %):** tres ítems `🙂 pos%` / `😐 neu%` / `🙁 neg%` con iconos Tabler `ti-mood-smile` / `ti-mood-neutral` / `ti-mood-sad` en colores success / secondary / danger. De `kpis.sentiment` (`positivo`/`neutro`/`negativo`) sobre el total. Cada carita es clicable.

> **"Ambigua"** = el bot respondió pero el usuario se fue sin señal clara (no agradeció, no repreguntó, no se quejó); no se puede saber si le sirvió. Se excluye del % de resolución para no sesgarlo, pero queda visible y explorable.

### 2. Qué atender ahora (reemplaza "Requiere tu atención")

Una **lista priorizada** de categorías con problema, cada fila con su acción. Reemplaza las 3 tarjetas sueltas por un solo ranking accionable. Deriva de `summary.by_category` (`total`, `resolved_pct`, `negative_pct`, `support_pct`) + `content_gaps` (`category`, `total`, `has_lesson`).

Por categoría (con volumen mínimo para evitar ruido) se elige **un** problema dominante, por prioridad:
1. **Contenido faltante** (está en `content_gaps` con `has_lesson = false`) → acción **Crear lección**.
2. **Baja resolución** (`resolved_pct` bajo) con lección existente → acción **Revisar lección**.
3. **Sentimiento negativo alto** (`negative_pct` alto) → acción **Revisar lección**.
4. **Escala mucho a soporte** (`support_pct` alto) → acción **Reforzar contenido**.

Se ordenan por severidad (ponderada por volumen) y se muestran las top ~4. Cada fila:
- Es **clicable** → explorador filtrado por `categoría` (+ estado `no_resuelta` cuando aplica).
- Tiene un **botón de acción** que dispara el puente existente (crear lección / editar lección de la categoría), reutilizando `maybeEditLessonByCategory` / `prefill_lesson_categoria` como ya hace el dashboard.

La lógica de ranking es **pura y testeable** (extiende/reemplaza `pickContentToReinforce` de `js/bot-attention.js`).

### 3. Dudas por categoría (se conserva)

Tabla `categoría → total → % resolución` (de `summary.by_category`). **Filas clicables** → explorador filtrado por esa categoría.

### 4. Cuándo escriben — heatmap (se conserva, informativo)

Mapa día-de-semana × hora (de `summary.heatmap`), scopeado por el rango de fechas de arriba. **Informativo: no es destino de drill-down** (el explorador no tiene filtro por día/hora, y no se extiende la RPC para esto). Queda como lectura visual.

### 5. Explorador de conversaciones (se conserva, destino del drill-down)

Funciona como hoy (`renderExplorer`, filtros `estado / sentimiento / soporte / categoría / búsqueda`). Se le añade que **puede recibir un filtro programático** desde cualquier métrica clicable.

## Interacción — drill-down

- **Clic en cualquier métrica** → (1) fija los filtros del explorador **reemplazando** los activos (empieza limpio, predecible), (2) hace **auto-scroll** al explorador, (3) muestra el filtro aplicado como **chip con ✕** para quitarlo.
- **Mapa métrica → filtro** (todos son filtros que la RPC del explorador ya soporta):

| Métrica (clic) | Filtro aplicado |
|---|---|
| Barra 1 · bot | soporte = no escaló |
| Barra 1 · soporte / Barra 2 · escaló | soporte = escaló |
| Barra 2 · cerró el cliente | lifecycle = cerrada_cliente |
| Barra 2 · abandonó | lifecycle = abandonada |
| Resolución · resueltas / no resueltas / ambiguas | estado = resuelta / no_resuelta / ambigua |
| Sentimiento · 🙂 / 😐 / 🙁 | sentimiento = positivo / neutro / negativo |
| Qué atender · fila | categoría = X (+ estado = no_resuelta si aplica) |
| Dudas por categoría · fila | categoría = X |

- El **mapeo métrica → objeto-de-filtro** es una función **pura y testeable**; el wiring (scroll + set de filtros + re-render del explorador) es glue de la vista.

## Estructura final de la pestaña

```
[ picker de fechas ]
Header:  185 · así terminaron
         ▉ bot / soporte
         ▉ cerró / abandonó / escaló
         Resolución real 53% · 89 resueltas · 78 no resueltas · 18 ambiguas
         Sentimiento 🙂 34% · 😐 52% · 🙁 14%
Qué atender ahora:  lista priorizada con acción
Dudas por categoría   |   Cuándo escriben (heatmap, informativo)
Explorador de conversaciones  ← destino del drill-down
```

## Fuera de alcance

- No se toca backend: sin RPCs nuevas ni cambios de esquema.
- El heatmap no gana drill-down por día/hora (requeriría extender la RPC del explorador; se descartó).
- No se rediseñan las otras pestañas (Resumen ejecutivo, Lecciones) — solo BolBot. (El header/sentimiento del Resumen ejecutivo se puede alinear después si se quiere, aparte.)

## Criterios de éxito

- Ningún par de porcentajes del header invita a sumarse y no sumar; lo que es parte-de-un-todo va en barra que cierra a 100; el faltante de "resolución real" (ambiguas) se muestra explícito.
- "Requiere tu atención" pasa a ser una sola lista priorizada accionable.
- Clic en cualquier métrica (barras, resolución, sentimiento, qué-atender, categoría) baja al explorador con el filtro correcto, reemplazando los activos, con chip para quitarlo.
- El heatmap y todo el dashboard respetan el rango de fechas de arriba.
- Sin tocar backend; la lógica de ranking y el mapeo métrica→filtro quedan cubiertos por tests puros.
