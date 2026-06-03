# Analytics — Bold POS Academy — Spec

## Goal

Registrar eventos de comportamiento de los estudiantes en Supabase y mostrar un dashboard de analytics en el panel admin con filtros de fecha, métricas clave y análisis de búsquedas.

## Audiencia

Solo el admin ve el dashboard. Los estudiantes no ven ninguna estadística propia.

## Arquitectura

- **`js/analytics.js`** — módulo nuevo. Exporta una función `track(eventType, payload)` que inserta un registro en `analytics_events`. Fire-and-forget: nunca bloquea la UI ni propaga errores al llamador.
- **`js/admin.js`** — panel nuevo "Analytics" con queries directas a Supabase, filtros de fecha y renderizado de tablas y gráficas en HTML/CSS puro.
- **Supabase** — tabla `analytics_events` con RLS: `anon` puede insertar, `authenticated` puede leer.

No se usa ninguna librería externa de analytics (GA, Plausible, etc.). Todo permanece en el mismo proyecto de Supabase.

---

## Modelo de datos

```sql
CREATE TABLE analytics_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  text NOT NULL,
  payload     jsonb DEFAULT '{}',
  session_id  text,
  mode        text CHECK (mode IN ('course', 'explore')),
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_analytics_type_date ON analytics_events (event_type, created_at DESC);
CREATE INDEX idx_analytics_date ON analytics_events (created_at DESC);
```

RLS:
```sql
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert" ON analytics_events
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "auth_select" ON analytics_events
  FOR SELECT TO authenticated USING (true);
```

---

## Eventos a registrar

| event_type | Dónde se llama | payload |
|---|---|---|
| `page_view` | `lessons.js` al cargar la sección | `{ page: 'lessons' }` |
| `lesson_open` | `lessons.js` al abrir una lección | `{ lesson_id, lesson_title, category }` |
| `lesson_search` | `lessons.js` al buscar | `{ term, results_count }` |
| `lesson_complete` | `lessons.js` al marcar sin examen | `{ lesson_id, lesson_title }` |
| `exam_pass` | `course.js` en `showExamModal` | `{ lesson_id, lesson_title, score }` |
| `exam_fail` | `course.js` en `showExamModal` | `{ lesson_id, lesson_title, score }` |
| `certificate_view` | `certificate.js` en `renderCertificate` | `{}` |
| `certificate_print` | `certificate.js` en `printCertificate` | `{}` |
| `mode_selected` | `course.js` en `renderModeSelection` | `{ mode: 'course' \| 'explore' }` |

El `session_id` y `mode` los lee `track()` internamente desde `localStorage` (`bold_session_id`, `bold_mode`).

---

## Módulo `js/analytics.js`

```js
import { supabase } from './supabase.js'

export function track(eventType, payload = {}) {
  const session_id = localStorage.getItem('bold_session_id') || null
  const mode = localStorage.getItem('bold_mode') || (session_id ? 'course' : null)

  supabase.from('analytics_events')
    .insert({ event_type: eventType, payload, session_id, mode })
    .then(({ error }) => {
      if (error) console.error('[analytics] track error:', error)
    })
}
```

Llamadas en los archivos existentes siguen este patrón (sin await):
```js
track('lesson_open', { lesson_id: lesson.id, lesson_title: lesson.titulo, category: lesson.categoria })
```

---

## Panel de Analytics en Admin

### Navegación

Nuevo botón en el nav lateral de `admin.html`:
```html
<button data-panel="analytics" class="admin-nav ...">
  <i data-lucide="bar-chart-2"></i> Analytics
</button>
<div id="panel-analytics" class="hidden"></div>
```

### Filtros de fecha

La barra superior del panel tiene dos zonas:

1. **Presets rápidos** (botones): Hoy · 7 días · 30 días · Este mes · Este año
2. **Botón "Personalizado"** con ícono de calendario — al hacer clic despliega un date-range picker de dos meses (implementado en HTML/CSS/JS puro, sin librerías). Al aplicar el rango, el panel recarga con esas fechas.

El estado del filtro se guarda en variables locales `{ from: Date, to: Date }`. Al cambiar el filtro se llama `renderAnalyticsPanel(from, to)`.

### Secciones del dashboard (en orden)

**1. Tarjetas de resumen** — 4 tarjetas en fila:
- Visitas (count de `page_view`)
- Estudiantes registrados (count de `mode_selected` con `mode = 'course'`)
- Puntaje promedio (avg de `payload->>'score'` en `exam_pass`)
- Certificados generados (count de `certificate_view`) / impresos (count de `certificate_print`)

Cada tarjeta muestra variación vs período anterior del mismo largo (ej. si filtro = 7 días, compara con los 7 días anteriores). Se expresa como "↑ X%" en verde o "↓ X%" en rojo.

**2. Gráfica de visitas por día** — barras verticales en HTML/CSS. El eje X son los días del rango filtrado (máx. 31 barras). El alto de cada barra es proporcional al día con más visitas.

**3. Modo de entrada** — dos barras horizontales (Curso / Solo explorar) con porcentaje.

**4. Lecciones más vistas** — tabla: Lección · Vistas. Ordenada descendente. Top 10.

**5. Todas las búsquedas** — tabla completa con:
- Columnas: Término · Búsquedas · Resultados (promedio de `results_count`) · Última vez · Estado
- Estado: badge verde "Con resultados" si `results_count > 0` siempre, badge rojo "⚠ Sin resultados" si `results_count = 0` en todas sus ocurrencias
- Filtro de texto para buscar un término específico
- Checkbox "Solo sin resultados" — filtra la tabla al lado del cliente (no re-query)
- Paginación: 20 filas por página
- Los términos sin resultados tienen fondo rojo suave y texto en rojo

**6. Exámenes por lección** — tabla: Lección · Intentos totales · % Aprobaron · Puntaje promedio. Solo lecciones que tengan al menos un evento `exam_pass` o `exam_fail`. El % de aprobación se colorea: ≥80% verde, 60-79% amarillo, <60% rojo.

### Queries

Todas las queries usan `.gte('created_at', from.toISOString()).lte('created_at', to.toISOString())`.

Las agregaciones (agrupación por `event_type`, por `payload->>'term'`, por día) se hacen con una sola query `.select('*')` y se procesan en JavaScript del lado del cliente — el volumen esperado (miles de filas, no millones) lo permite sin problema.

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `js/analytics.js` | Nuevo — función `track()` |
| `js/lessons.js` | Importar `track`, agregar llamadas en `renderLessons`, búsqueda y apertura de lección |
| `js/course.js` | Importar `track`, llamadas en `renderModeSelection` y `showExamModal` |
| `js/certificate.js` | Importar `track`, llamadas en `renderCertificate` y `printCertificate` |
| `js/admin.js` | Nuevo panel `renderAnalyticsPanel(from, to)`, date-range picker, wired en `switchPanel` |
| `admin.html` | Botón nav Analytics + div `panel-analytics` |

---

## Fuera de alcance

- Tracking de tiempo en pantalla por lección
- Mapas de calor o grabaciones de sesión
- Exportar analytics a CSV (se cubre en el Spec 2 — Quick Wins)
- Notificaciones automáticas al admin
