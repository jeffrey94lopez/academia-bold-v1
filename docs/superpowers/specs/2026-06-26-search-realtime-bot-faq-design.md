# Spec: Búsqueda Global, Lecciones en Tiempo Real y Bot + FAQs

**Fecha:** 2026-06-26  
**Estado:** Aprobado

---

## Contexto

La app Academia Bold V1 es una SPA vanilla JS + Supabase con tres secciones principales:
- **Asistente** (`assistant.js`) — chatbot bolbot POS via n8n
- **Centro de Ayuda** (`lessons.js`) — lecciones agrupadas por categoría
- **P. Frecuentes** (`resources.js`) — FAQ, Glosario y Material de apoyo en sub-tabs

### Problemas a resolver

1. La búsqueda en la sección de Recursos no es consistente: FAQ y Glosario tienen buscadores en posiciones distintas; Material de apoyo no tiene ninguno.
2. Las lecciones se cargan una sola vez al abrir la app. Si el admin agrega una lección, el cliente debe refrescar manualmente para verla.
3. El bot no conoce las preguntas frecuentes almacenadas en `preguntas_frecuentes`; solo responde con el conocimiento que n8n tiene por defecto.

---

## Funcionalidad 1: Búsqueda global en Resources

### Descripción
Reemplazar los buscadores individuales de FAQ y Glosario por un único campo `#resourceSearch` posicionado de forma fija entre el grupo de tabs y el contenido. Material de apoyo también ganará búsqueda.

### Comportamiento
- El input siempre es visible dentro de la sección Resources, independientemente del tab activo.
- Al cambiar de tab (`switchSubTab`), el valor del input se limpia y la lógica de filtrado conecta al contenido del tab activo.
- Al escribir en el input, el contenido del tab activo se filtra en tiempo real (sin debounce, misma lógica que hoy).

### Filtrado por tab
| Tab | Campos a filtrar |
|-----|-----------------|
| FAQ | `pregunta`, `respuesta` |
| Glosario | `termino`, `definicion` |
| Material de apoyo | `titulo`, `tipo` |

### Cambios en resources.js
- Eliminar `<div id="faqSearchWrapper">` del template HTML.
- Eliminar `<input id="searchGlossary">` del interior de `#subGlossary`.
- Agregar `<input id="resourceSearch">` en el template, entre el grupo de tabs y los contenedores de contenido.
- Actualizar `switchSubTab` para:
  1. Limpiar el valor de `#resourceSearch`.
  2. Re-renderizar el tab activo con lista completa (sin filtro).
- En `loadFaq`, `loadGlossary` y `loadMaterial`: extraer la función `render(items)` para que sea invocable con cualquier subconjunto de datos.
- Vincular el evento `input` de `#resourceSearch` a la función de render del tab activo.
- En `switchSubTab`, también actualizar el atributo `placeholder` del input según el tab ("Buscar pregunta...", "Buscar término...", "Buscar material...").

---

## Funcionalidad 2: Lecciones en tiempo real

### Descripción
Cuando el admin agrega, edita o desactiva una lección, todos los clientes que tienen la app abierta ven la lista actualizada automáticamente — sin recargar la página. Un toast discreto notifica el cambio.

### Comportamiento
- Al montar `renderLessons()`, se abre un canal Supabase Realtime suscrito a cualquier evento (`INSERT`, `UPDATE`, `DELETE`) en la tabla `lecciones`.
- Al recibir un evento:
  1. Mostrar un toast "Lecciones actualizadas ✓" en la parte superior de la sección (z-index alto, sin bloquear interacción).
  2. El toast desaparece automáticamente después de 3 segundos.
  3. Re-fetch de `lecciones` y `categorias` desde Supabase.
  4. Actualizar los arrays `lessons` y `grouped` en memoria.
  5. Re-renderizar el accordion (desktop) y la lista de categorías/lecciones (móvil).
  6. Preservar `activeLesson` y `activeCategory`: si la lección activa todavía existe, mantenerla seleccionada y no re-renderizar el panel de contenido; si fue eliminada/desactivada, limpiar el panel.
- Al hacer clic en otra sección de la app (usuario sale de "Centro de Ayuda"), cancelar la suscripción con `channel.unsubscribe()`.

### Canal Supabase
```js
supabase
  .channel('lessons-realtime')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'lecciones' }, handler)
  .subscribe()
```

### Toast
- Elemento `div` inyectado en `#section-lessons` con posición `absolute top-3 left-1/2 -translate-x-1/2`.
- Estilo: fondo azul, texto blanco, redondeado, sombra leve.
- Se elimina del DOM al cumplirse 3 segundos.

### Limpieza del canal
- El botón de navegación que cambia a otra sección dispara `channel.unsubscribe()`.
- Si el usuario regresa a la sección, `renderLessons()` vuelve a suscribirse (o se verifica si el canal ya existe).

---

## Funcionalidad 3: Bot + FAQs como contexto

### Descripción
El bot actualmente recibe `{ message, history }` en cada request a n8n. No conoce la tabla `preguntas_frecuentes`. Se agregará un campo `faq_context` al payload para que n8n pueda usarlo como contexto adicional.

### Comportamiento (frontend)
- Al iniciar `renderAssistant()`, cargar todos los registros de `preguntas_frecuentes` con `select('pregunta, respuesta')` y guardarlos en una variable de módulo `let cachedFaqs = []`.
- En `sendMessage()`, incluir `faq_context: cachedFaqs` en el body del request a n8n.
- Si la carga de FAQs falla, `cachedFaqs` permanece `[]` y el bot sigue funcionando normalmente (degradación silenciosa).
- Las FAQs se cargan una sola vez por sesión. No se recargan en cada mensaje.

### Payload resultante
```js
{ message: text, history, faq_context: cachedFaqs }
// faq_context: [{ pregunta: "...", respuesta: "..." }, ...]
```

### Requisito en n8n (fuera del alcance del frontend)
El workflow de n8n debe ser actualizado para leer el campo `faq_context` del body y usarlo como parte del contexto del prompt del LLM. Sin este cambio, el bot recibirá los datos pero no los incorporará a sus respuestas.

**Acción requerida:** En el nodo de construcción del prompt de n8n, agregar algo como:
```
Si la pregunta se relaciona con alguna de las siguientes preguntas frecuentes, úsalas como referencia:
{{$json.faq_context.map(f => `P: ${f.pregunta}\nR: ${f.respuesta}`).join('\n\n')}}
```

---

## Archivos modificados

| Archivo | Cambios |
|---------|---------|
| `js/resources.js` | Unificar buscadores en `#resourceSearch`, refactorizar renders de FAQ/Glosario/Material |
| `js/lessons.js` | Agregar suscripción Realtime, función `refreshLessons()`, toast, limpieza de canal |
| `js/assistant.js` | Cargar FAQs al iniciar, incluir `faq_context` en requests |

## Archivos no modificados
- `index.html` — sin cambios
- `js/supabase.js` — sin cambios
- `api/chat.js` — sin cambios
- Base de datos / migraciones — sin cambios

---

## Criterios de éxito

- [ ] Un solo input de búsqueda visible en la sección Resources; filtra correctamente en los 3 tabs
- [ ] Al cambiar de tab, el input se limpia
- [ ] Al agregar una lección desde el admin, el cliente ve el toast y la lista se actualiza sin recargar
- [ ] La lección que el cliente está leyendo no se interrumpe durante la actualización
- [ ] El payload enviado a n8n incluye `faq_context` con las FAQs de la base de datos
- [ ] Si las FAQs no cargan, el bot sigue funcionando normalmente
