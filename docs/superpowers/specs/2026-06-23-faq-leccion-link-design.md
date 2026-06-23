# FAQ con Redirección a Lección o Link Externo

**Fecha:** 2026-06-23  
**Alcance:** Módulo de Preguntas Frecuentes — población inicial de 16 FAQs desde chats de soporte + campo de redirección a lección interna o URL externa.

---

## Contexto

La tabla `preguntas_frecuentes` alimenta dos consumidores:
1. **Chatbot Bolbot** — vía embeddings en la API `/api/chat`
2. **Vista del estudiante** — acordeón en `resources.js` (sección Recursos > Preguntas frecuentes)

El admin gestiona las FAQs desde `admin.js` → `renderFaqPanel()`. Actualmente los únicos campos son `pregunta` y `respuesta`. No existe forma de vincular una FAQ a una lección de la academia ni a un recurso externo.

---

## Objetivo

1. Poblar la base de datos con 16 preguntas frecuentes extraídas de transcripciones reales de soporte (WhatsApp, Dic 2025 – Feb 2026).
2. Agregar soporte para vincular cada FAQ a una lección interna de la academia o a una URL externa, tanto en el panel admin como en la vista del estudiante.

---

## Cambios de base de datos

Tabla `preguntas_frecuentes` — agregar 2 columnas opcionales:

```sql
ALTER TABLE preguntas_frecuentes
  ADD COLUMN leccion_id UUID REFERENCES lecciones(id) ON DELETE SET NULL,
  ADD COLUMN link_url   TEXT;
```

Ambas columnas son nullable. Un FAQ puede tener ninguna, una, o ambas asignadas. Si tiene ambas, la lección interna tiene prioridad en la vista del estudiante.

---

## Cambios en admin (`js/admin.js` → `renderFaqPanel`)

### Formulario inline
Agregar debajo del textarea de `respuesta`:

- **Dropdown "Lección relacionada"** — carga lecciones activas con `supabase.from('lecciones').select('id, titulo').eq('active', true).order('orden')`. Primera opción: `— Ninguna —` (valor vacío). Al editar una FAQ, pre-llena con el `leccion_id` existente.
- **Input "Link externo"** — campo texto libre, placeholder `https://...`. Al editar, pre-llena con `link_url` existente.

### Lista de items
Cada `.faq-item` muestra badges discretos:
- `📚` si tiene `leccion_id`
- `🔗` si tiene `link_url`

Estos badges se renderizan junto al título, antes de los botones de acción.

### Lógica de guardado
El upsert incluye `leccion_id` (null si vacío) y `link_url` (null si vacío):

```js
const leccion_id = document.getElementById('faqLeccionId').value || null
const link_url   = document.getElementById('faqLinkUrl').value.trim() || null
// incluir en el objeto de insert/update
```

### Select de datos
`renderFaqPanel` agrega `leccion_id, link_url` al `select('*')` existente (ya los trae con `*`, no requiere cambio).

---

## Cambios en vista del estudiante (`js/resources.js` → `loadFaq`)

En el cuerpo expandido de cada `<details>`, agregar al final de la respuesta un botón de acción condicional:

- **Si `leccion_id`** — botón `"Ver lección →"` que:
  1. Hace clic en el tab de Lecciones: `document.querySelector('[data-tab="lessons"]')?.click()`
  2. Llama `window.openLessonById?.(f.leccion_id)`
- **Si solo `link_url`** — enlace `<a target="_blank" rel="noopener">` con texto `"Más información →"`
- **Si ambos** — muestra solo el botón de lección (prioridad interna)
- **Si ninguno** — no se renderiza nada adicional

El botón/enlace usa estilos consistentes con el sistema de diseño existente (texto pequeño, color `var(--blue-100)`).

---

## Cambios en lecciones (`js/lessons.js` → `renderLessons`)

Exponer función de navegación global al final de `renderLessons()`, después de que los datos estén cargados:

```js
window.openLessonById = (id) => {
  const lesson = lessons.find(l => String(l.id) === String(id))
  if (!lesson) return
  activeLesson = lesson
  // Desktop
  renderAccordion()
  renderDeskContent()
  // Mobile: navegar a pantalla de detalle
  document.getElementById('ls-screen-categories')?.classList.add('hidden')
  document.getElementById('ls-screen-lessons')?.classList.add('hidden')
  document.getElementById('ls-screen-detail')?.classList.remove('hidden')
}
```

La función se asigna a `window` para que `resources.js` pueda llamarla sin acoplamiento de módulos. Como `renderLessons()` es async y se llama al cargar el módulo, la función estará disponible antes de que el usuario pueda interactuar con las FAQs.

---

## Población inicial de FAQs

16 entradas a insertar en `preguntas_frecuentes`. `leccion_id` y `link_url` se dejan null en la carga inicial; el admin los asigna después desde el panel.

| # | Pregunta |
|---|----------|
| 1 | ¿Qué hago si una factura electrónica se quedó en estado borrador? |
| 2 | ¿Qué son las intermitencias de la DIAN y cuánto duran? |
| 3 | ¿Cómo anulo un comprobante y lo convierto en factura electrónica? |
| 4 | ¿Cómo hago un cargue masivo de productos con variantes de talla y color? |
| 5 | ¿Puedo ingresar inventario desde el celular? |
| 6 | ¿Cómo actualizo el tipo de IVA de mis productos? |
| 7 | ¿Qué motivos de nota de crédito regresan el ítem al inventario? |
| 8 | ¿Por qué la venta sigue en el reporte después de hacer una nota de crédito? |
| 9 | ¿Cómo creo un usuario con acceso restringido (rol Vendedor)? |
| 10 | ¿Puedo tener diferentes usuarios para diferentes dispositivos? |
| 11 | ¿Cómo creo mi cuenta en Bold POS? |
| 12 | ¿Cómo cambio mi plan? |
| 13 | ¿Dónde consulto los precios de la plataforma? |
| 14 | ¿Cómo configuro mi impresora de tickets? |
| 15 | ¿Cómo registro un pago dividido (efectivo + transferencia)? |
| 16 | ¿Cómo descargo el reporte de facturas para el contador? |

Las respuestas completas están documentadas en la conversación de diseño y se insertan vía script SQL o directamente desde el panel admin.

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| `js/admin.js` | Formulario FAQ: +2 campos; lista FAQ: +badges; guardado: +leccion_id, link_url |
| `js/resources.js` | `loadFaq`: +botón/enlace condicional en cuerpo del acordeón |
| `js/lessons.js` | `renderLessons`: +`window.openLessonById` al final |
| Supabase (SQL) | `ALTER TABLE preguntas_frecuentes ADD COLUMN leccion_id, link_url` |
| Supabase (datos) | `INSERT` de 16 FAQs con pregunta + respuesta |

---

## Criterios de aceptación

- [ ] El formulario admin permite seleccionar una lección del dropdown y/o pegar una URL
- [ ] Los badges 📚 / 🔗 aparecen en el listado del admin cuando corresponde
- [ ] Al editar, los campos leccion_id y link_url se pre-llenan correctamente
- [ ] El guardado persiste leccion_id y link_url en Supabase
- [ ] En la vista del estudiante, una FAQ con leccion_id muestra botón "Ver lección →"
- [ ] El botón navega al tab de Lecciones y abre la lección correcta (desktop y mobile)
- [ ] Una FAQ con solo link_url muestra enlace "Más información →" en nueva pestaña
- [ ] Una FAQ sin ningún vínculo no muestra botón adicional
- [ ] Las 16 FAQs están cargadas en la base de datos
- [ ] El embedding (Bolbot) sigue funcionando correctamente para las FAQs existentes
