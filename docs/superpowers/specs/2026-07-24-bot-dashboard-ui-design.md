# Sub-proyecto D — UI dashboard · Spec de diseño

**Parte 3/4 del pedido de optimización del bot** (orden A→C→D→B). Solo frontend, rama `sandbox`. No toca RPCs ni datos.

## Objetivo

Dos mejoras de legibilidad en los dashboards de analytics:

1. **Conteos dentro de la barra de satisfacción** — hoy los conteos pos/neu/neg van como línea de texto *debajo* de la barra apilada; pasan a mostrarse *dentro* de cada segmento.
2. **Insights bot ↔ lecciones en dos bloques** — el panel que hoy mezcla en una lista las categorías con y sin lección se parte en dos sub-secciones rotuladas.

## Contexto actual

La barra apilada de sentimiento (pos/neu/neg) aparece **idéntica en dos lugares**:

- `js/admin-exec-analytics.js` → `satPanel` (~L73-84): barra `h-4` + línea `"12 positivas · 5 neutras · 3 negativas"` debajo.
- `js/admin-bot-analytics.js` → card "Sentimiento neto" **dentro de la grilla de KPIs (Capa ①**, ~L40-49): barra `h-3` + línea `"12 pos · 5 neu · 3 neg"` debajo. Es la única barra de sentimiento del archivo.

El panel de insights vive solo en exec:

- `js/admin-exec-analytics.js` → `insightsPanel` (~L86-97): `gaps.slice(0, 4)` renderiza en una sola lista categorías con lección (🔴 revisar) y sin lección (🔗 oportunidad), mezcladas.

`js/analytics-ui.js` es el hogar de los builders puros compartidos (`kpiCard`, `llmNote`, `rangeControlsHtml`); no accede a `document` en top-level, así que es importable en Node y testeable.

## Diseño

### Parte 1 — `sentimentBar(sentiment)` en `analytics-ui.js`

Builder puro nuevo, reusado por ambos archivos (borra la duplicación, un solo lugar que testear).

- **Firma:** `sentimentBar(sentiment) => string` (HTML). `sentiment = { positivo, neutro, negativo }` (los tres enteros; el objeto `k.sentiment` que ya devuelve la RPC).
- **Comportamiento:**
  - `total = (positivo + neutro + negativo) || 1` (evita división por cero cuando no hay datos → los tres anchos quedan 0%).
  - Tres segmentos flex; cada uno con su **conteo centrado dentro** (`text-[10px]`, texto blanco en pos/neg, `var(--black-60)` en el neutro sobre `var(--black-10)`).
  - Cada segmento lleva `overflow-hidden whitespace-nowrap` (segmentos angostos recortan limpio) y `title` con el conteo + etiqueta larga (ej. `title="12 positivas"`) para verlo en hover.
  - Barra `h-5 rounded-full overflow-hidden` (sube desde h-4/h-3 para que quepa el número).
- **Clases exactas de color** (reusar las actuales): pos = `bg-[var(--success-150)]`, neutro = `bg-[var(--black-10)]`, neg = `bg-[var(--error-100)]`.

**Uso en exec (`satPanel`):** reemplazar el bloque `<div class="flex h-4 …">…</div>` + la línea `<p>…positivas · …</p>` por `${sentimentBar(s)}`. Se conservan el título "Satisfacción", la nota "sentimiento neto = …" y el número grande `sentiment_net`.

**Uso en bot (card "Sentimiento neto" de la grilla de KPIs / Capa ①):** reemplazar el bloque `<div class="flex h-3 …">…</div>` + la línea `<p>…pos · …</p>` por `${sentimentBar(s)}`. Se conserva el resto de la card (título, `sentiment_net`). Es la única barra de sentimiento del archivo — no hay otra fuera de la grilla de KPIs.

Mock:

```
Antes:  ┌──────────────┐        Después: ┌──────────────┐
        │██████░░░▓▓▓▓▓▓│                 │  12  │ 5 │ 3  │  ← conteo dentro
        └──────────────┘                 └──────────────┘
        12 positivas · 5 neutras · 3 neg   (línea eliminada)
```

### Parte 2 — Insights en dos bloques (`insightsPanel`, exec)

Dentro del **mismo panel** "Insights bot ↔ lecciones ✨", partir `gaps` en dos sub-secciones rotuladas y apiladas:

- **🔗 Huecos de contenido** — `gaps.filter(g => !g.has_lesson).slice(0, 4)`. Copy por ítem: `"{categoría} ({total}) — sin lección, oportunidad de contenido"`. Empty-state: "Sin huecos en el rango."
- **🔴 Lecciones a revisar** — `gaps.filter(g => g.has_lesson).slice(0, 4)`. Copy por ítem: `"{categoría} ({total}) — resuelve {resolved_pct}%, revisar lección"`. Empty-state: "Sin lecciones que revisar."

Cada bloque lleva un subtítulo pequeño (`text-[11px] font-bold uppercase text-[var(--black-40)]`). El panel conserva su encabezado con `llmNote()` y el borde/estilo de tarjeta. Se reutiliza el estilo de ítem actual (fila con borde izquierdo `border-[var(--warning-150)]`).

## Interfaces / unidades

- `sentimentBar(sentiment)` — puro, sin DOM. Entrada: `{positivo, neutro, negativo}`. Salida: string HTML. Dependencias: ninguna. Testeable en aislamiento.
- Los dos consumidores (`admin-exec-analytics.js`, `admin-bot-analytics.js`) solo cambian el fragmento de la barra; no cambian su flujo de datos.
- El split de insights es lógica de presentación local a `renderExecAnalytics` (dos `filter`), sin extraer módulo (no se reusa en otro lado).

## Testing

- `tests/analytics-ui.test.mjs` (nuevo) para `sentimentBar`:
  - Los tres conteos aparecen en el HTML.
  - Los anchos porcentuales se calculan sobre el total (ej. `{2,1,1}` → `50%`/`25%`/`25%`).
  - Base cero: `{0,0,0}` no lanza y produce anchos `0%` (no `NaN`/división por cero).
- El cableado en los dos dashboards y el split de insights se verifican en navegador (esos archivos usan `document` y no son import-safe en Node).
- Suite: `node --test tests/*.test.mjs`. El warning `MODULE_TYPELESS_PACKAGE_JSON` es esperado y NO es hallazgo.

## Alcance

- **Solo frontend**, rama `sandbox`. Sin build. Estilo: 2 espacios, sin punto y coma, sin clases Tailwind nuevas (reusar las existentes).
- **Fuera de alcance:** cambiar RPCs o datos; el heatmap; el resto de las cards de la grilla de KPIs de bot (solo se toca la barra dentro de "Sentimiento neto"); estados de ciclo de vida (B).
