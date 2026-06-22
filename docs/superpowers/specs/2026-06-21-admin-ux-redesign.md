# Admin UX Redesign — Spec

**Fecha:** 2026-06-21
**Estado:** Aprobado por usuario

---

## Resumen

Rediseño de la experiencia de usuario del panel admin (`admin.html` + `js/admin.js`). El objetivo es que el admin se sienta coherente con el estilo visual del frontend del alumno (Montserrat, azul `#121e6c`, bordes redondeados) y que sea más eficiente de usar en el día a día. No hay cambios en la base de datos ni en la lógica de negocio.

Cambio de terminología: todas las referencias a **"Bodi"** en el admin se reemplazan por **"bolbot POS"**.

---

## 1. Navegación lateral

### Cambios
- Eliminar iconos de todos los ítems del sidebar.
- Agrupar los ítems en tres secciones con etiqueta uppercase pequeña:
  - **Contenido:** Lecciones, P. Frecuentes, Glosario, Material
  - **bolbot POS:** Mat. de apoyo, Sugerencias
  - **Datos:** Resultados, Analytics, Registro
- Agregar ítem **Inicio** al tope (panel de dashboard, ver §2).
- "Mi perfil" anclado al fondo del sidebar con `margin-top: auto`, separado por un divisor.
- Estado activo: `background: #121e6c; color: #fff; border-radius: 12px`.
- Estado inactivo: `color: #121e6c; background: transparent`, sin hover pesado.
- Divisores entre secciones: `1px solid #f1f2f6`.
- Ancho del sidebar: mantener `w-48` (192px).

### Archivos afectados
- `admin.html` — estructura HTML del nav y sus secciones.
- `js/admin.js` — routing del panel activo, agregar `panel === 'home'`.

---

## 2. Dashboard de inicio (`panel-home`)

Panel nuevo que se muestra al entrar al admin (reemplaza la carga directa de Lecciones).

### Contenido
- **Saludo dinámico:** "Buenos días / Buenas tardes / Buenas noches" según hora del servidor + nombre del usuario desde Supabase Auth.
- **4 tarjetas de métricas** (fila de 4 columnas en desktop, 2×2 en mobile):
  - Lecciones activas (`lecciones` WHERE `active = true`)
  - Conversaciones hoy (`bodi_conversations` WHERE `created_at::date = today`)
  - Preguntas frecuentes (COUNT de `preguntas_frecuentes`)
  - Términos en glosario (COUNT de `glosario`)
- **Actividad reciente:** últimas 5 entradas de `admin_activity_log` (tabla ya existente), mostrando acción + recurso + tiempo relativo.
- **Acciones rápidas:** botones que navegan directamente a crear nueva lección, nueva FAQ, y ver Analytics.

### Estilo de tarjetas de métricas
- `background: #fff; border: 1px solid #f1f2f6; border-radius: 14px; padding: 14px`
- Label: `9px uppercase font-weight:800 color:#969696`
- Número: `22px font-weight:800 color:#121e6c`

### Archivos afectados
- `admin.html` — agregar `<div id="panel-home" class="hidden"></div>`.
- `js/admin.js` — agregar función `renderHomePanel()`.

---

## 3. Header del admin

### Cambios
- **Izquierda:** logo Bold POS (existente) + divisor vertical `1px` + label "Admin" en gris uppercase + separador `/` + nombre del panel activo en azul (breadcrumb dinámico).
- **Derecha:** enlace "Ver sitio ↗" en gris discreto + avatar circular con inicial del usuario (`background: #eff4ff; color: #121e6c; border-radius: 50%`). El avatar abre un dropdown con "Mi perfil" y "Cerrar sesión".
- Eliminar el botón "Salir" del header actual (moverlo al dropdown del avatar).

### Archivos afectados
- `admin.html` — reescribir el `<header>`.
- `js/admin.js` — poblar el breadcrumb y la inicial del avatar desde `supabase.auth.getUser()`.

---

## 4. Editor de lecciones

### Campos de formulario
- Agregar `<label>` con estilo `9px uppercase font-weight:800 color:#969696` sobre cada input (Título, Descripción, Categoría, Orden, Notas).

### Bloques de contenido (lista)
- Cada bloque renderizado como tarjeta: `background:#fff; border:1px solid #f1f2f6; border-radius:12px; padding:10px 12px`.
- Bloques tipo `bot_*` con borde de acento amarillo: `border-color: #fde68a`.
- El tipo de bloque se muestra como badge uppercase: `9px font-weight:800 border-radius:6px padding:2px 8px`.
  - Bloques de contenido: `background:#eff4ff; color:#121e6c`.
  - Bloques bolbot POS: `background:#fef3c7; color:#92400e` + prefijo "bolbot POS —".

### Zona de agregar bloques
- Separar visualmente en dos grupos dentro de un contenedor con borde `dashed`:
  - **"Agregar bloque de contenido"** — Paso, Imagen, Video, Link (botones `background:#eff4ff`).
  - **"Solo para bolbot POS"** — Nota, Advertencia, Pasos internos, Pregunta frecuente (botones `background:#fef3c7`).
- Etiqueta de cada grupo en uppercase pequeño.

### Archivos afectados
- `js/admin.js` — función `renderLessonEditor()`, `blockItemHtml()`, y la sección de botones de agregar bloque.

---

## 5. Listados (Glosario, P. Frecuentes, Material de apoyo)

Patrón común aplicado a los tres paneles:

### Header del panel
- Título + contador de ítems (`font-size:11px color:#969696`) en la misma línea.
- Botones de acción a la derecha (Re-embedear todo si aplica + botón principal de crear).

### Buscador
- Input de búsqueda siempre visible debajo del header, antes de la lista.
- `placeholder="🔍 Buscar..."`, `border-radius:12px`, fondo blanco.

### Ítems de la lista
- Tarjetas con `border-radius:12px; border:1px solid #f1f2f6; padding:11px 14px`.
- Botones de acción con texto: **"Editar"** y **"Eliminar"** (no solo iconos).
  - Editar: `background:#eff4ff; color:#121e6c; border-radius:8px`.
  - Eliminar: `background:#fef1f3; color:#c31a2f; border-radius:8px`.
- Al hacer clic en "Editar", el ítem activo recibe `border:1.5px solid #121e6c` y el formulario de edición aparece inline debajo del ítem (no en un panel separado al fondo).

### Archivos afectados
- `js/admin.js` — `renderGlossaryPanel()`, `renderFaqPanel()`, `renderMaterialApoyoPanel()`.

---

## 6. Cambio de terminología: "Bodi" → "bolbot POS"

Buscar y reemplazar en `admin.html` y `js/admin.js` todas las referencias visibles al usuario:
- Etiquetas de botones, placeholders, labels, mensajes de toast, confirmaciones de eliminación.
- Nombre de la sección en el sidebar: "Bot Bodi" → "bolbot POS".
- Badges de bloques: "Solo Bodi" → "bolbot POS".
- Textos en panel de configuración (toggles).

No afecta nombres de variables internas ni keys de Supabase.

---

## Archivos modificados

| Archivo | Cambios |
|---|---|
| `admin.html` | Header, sidebar agrupado, panel-home nuevo |
| `js/admin.js` | `renderHomePanel`, `renderGlossaryPanel`, `renderFaqPanel`, `renderMaterialApoyoPanel`, `renderLessonsPanel`, `blockItemHtml`, header breadcrumb + avatar |

---

## Fuera de alcance

- Cambios en el frontend del alumno (`index.html`, `js/`).
- Cambios en la base de datos o lógica de negocio.
- Responsive / mobile del admin (el admin ya es solo desktop).
- Analytics y Resultados — sus paneles no cambian internamente, solo heredan el nuevo estilo del sidebar/header.
