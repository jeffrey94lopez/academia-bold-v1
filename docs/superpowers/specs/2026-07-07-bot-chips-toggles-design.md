# Toggles de preguntas sugeridas del bot (chips)

**Fecha:** 2026-07-07
**Estado:** Aprobado. Revisado 2026-07-07: se reutiliza la tabla existente
`app_settings` en lugar de crear `bot_settings` (descubierta durante la
ejecución; ya implementa el mismo patrón clave-valor con RLS y admin).

## Problema

Los chips de preguntas sugeridas del chat de bolbot POS se muestran al abrir el
chat y reaparecen después de cada respuesta del bot, sin forma de controlarlo.
El equipo quiere activar/desactivar ambos comportamientos desde el admin, por
separado y sin deploy.

## Diseño

### Almacenamiento: tabla existente `app_settings` (Supabase)

`app_settings (key text, value text)` ya guarda los feature flags del portal
(`bot_enabled`, `curso_enabled`, …) con lectura anónima y escritura del admin
autenticado. Se agregan dos claves nuevas, con la convención existente
"clave ausente o distinta de 'false' = activado":

| key                    | default (ausente) | controla                                      |
|------------------------|-------------------|-----------------------------------------------|
| `chips_inicio`         | activado          | Mostrar los chips al abrir el chat            |
| `chips_tras_respuesta` | activado          | Reaparición de los chips tras cada respuesta  |

No hay CREATE TABLE ni inserts: el upsert del admin crea la fila la primera
vez que se toca un switch. Única migración
(`supabase/migrations/enable_realtime_app_settings.sql`, una línea):

- `alter publication supabase_realtime add table public.app_settings` para que
  el portal reaccione en vivo.

### Portal (`js/assistant.js`)

- Estado de módulo `chipSettings = { inicio: true, tras_respuesta: true }` con
  una función exportada `loadChipSettings()` que lee la tabla. Si la consulta
  falla o faltan filas, se queda en `true` (comportamiento actual — nunca se
  rompe el chat por un problema de datos).
- **Render inicial** (contenedor `#quickQueries`): se agrega la clase `hidden`
  cuando `chips_inicio` es `false`.
- **Tras cada respuesta** (`js/assistant.js:642`) **y en el manejo de error de
  conexión** (`:660`): el `classList.remove('hidden')` solo corre si
  `chips_tras_respuesta` es `true`.
- Los dos toggles son independientes: con `chips_inicio` apagado y
  `chips_tras_respuesta` encendido, los chips no se ven al abrir pero sí
  después de la primera respuesta, y viceversa.

### Live updates (`js/live-updates.js`)

Suscripción `postgres_changes` a `app_settings` en el canal `live-content`
existente, con el mismo debounce de 1.5 s: recarga `loadChipSettings()`. Los
nuevos valores aplican en el siguiente evento (próxima respuesta del bot o
próxima carga del portal); no se fuerza mostrar/ocultar el contenedor en el
momento del cambio.

### Admin (`js/admin.js`, panel "Sugerencias Bot")

Encima de la lista de sugerencias, una tarjeta "Comportamiento" con dos
switches:

- **"Mostrar sugerencias al abrir el chat"** → clave `chips_inicio`.
- **"Reaparecer después de cada respuesta"** → clave `chips_tras_respuesta`.

Cada switch hace `upsert` directo de su clave al cambiarlo (sin botón Guardar,
mismo patrón que los flags existentes de `app_settings`),
muestra toast de éxito/error y registra en el activity log
(`logActivity('update', 'bot_setting', <clave>)`). Si la lectura inicial de la
tabla falla, los switches se muestran deshabilitados con un aviso.

## Manejo de errores

- Portal: cualquier fallo leyendo `app_settings` (o claves ausentes) ⇒ ambos
  toggles se asumen activados (comportamiento histórico).
- Admin: fallo al guardar ⇒ toast de error y el switch vuelve a su estado
  anterior.

## Pruebas

Verificación manual end-to-end (no hay suite automatizada en el proyecto):

1. Con ambos toggles activos: chips visibles al abrir y tras cada respuesta
   (estado actual, sin regresión).
2. Apagar "al abrir" ⇒ recargar portal ⇒ chips ocultos al inicio; enviar
   mensaje ⇒ chips aparecen tras la respuesta.
3. Apagar "tras respuesta" ⇒ enviar mensaje ⇒ chips no reaparecen.
4. Cambiar "tras respuesta" en el admin con el portal abierto en otra pestaña
   ⇒ sin recargar el portal, la siguiente respuesta del bot ya respeta el
   nuevo valor (realtime).
5. Claves ausentes en `app_settings` (estado inicial) ⇒ portal se comporta
   como hoy.

## Fuera de alcance

- El contenido/orden de los chips (ya existe en el panel actual).
- Cualquier cambio en el workflow de n8n.
