# Actualizaciones en vivo + animación de escritura del bot

**Fecha:** 2026-07-02
**Rama de trabajo:** `sandbox` (pasa a `master`/producción tras pruebas)

## Contexto y problema

El portal del cliente (con el bot "bolbot POS") ahora vive embebido en un iframe
dentro de la plataforma Bold POS. En ese contexto:

1. **Contenido viciado:** las FAQs se cargan una sola vez al abrir la página
   (`loadFaqContext()` en `js/assistant.js`) y los chips de sugerencias solo al
   renderizar. Si el admin agrega/edita una FAQ, lección o sugerencia, las
   sesiones abiertas no se enteran hasta que el usuario presiona el botón
   "Actualizar" del bot o recarga la página — algo que un usuario embebido no
   va a hacer.
2. **Deploys invisibles:** un cambio visual o de código (nuevo deploy en Vercel)
   requiere que la persona recargue la página manualmente.
3. **Respuestas largas de golpe:** la respuesta del bot se inserta completa y
   `scrollToBottom()` manda al usuario al final. En lecciones largas debe
   subir manualmente hasta el inicio para empezar a leer.

## Decisiones tomadas (con el usuario)

- Contenido: actualización **en tiempo real** vía Supabase Realtime.
- Deploys: recarga **inmediata** al detectar versión nueva (con salvaguarda
  si hay una respuesta del bot en curso o texto sin enviar).
- Animación: escritura progresiva **con opción de saltar** ("Mostrar todo").
- El botón "Actualizar" del header del bot **se elimina** (queda "Limpiar").

## Diseño

### 1. Contenido en tiempo real (Supabase Realtime)

- Nuevo módulo `js/live-updates.js` que abre un canal Realtime con
  `postgres_changes` sobre las tablas: `preguntas_frecuentes`,
  `bot_sugerencias`, `lecciones`.
- Reacciones ante cualquier INSERT/UPDATE/DELETE:
  - `preguntas_frecuentes` → recargar `cachedFaqs` (contexto que viaja con
    cada pregunta al bot) y, si la sección de FAQ está visible, re-renderizarla.
  - `bot_sugerencias` → re-renderizar los chips del chat (solo si el chat está
    en estado inicial, sin conversación en curso, para no mover la UI debajo
    del usuario).
  - `lecciones` → si la sección de lecciones está visible, recargarla; si no,
    se recargará sola al navegar (comportamiento actual).
- El conocimiento profundo del bot (embeddings consultados por n8n) ya se
  resuelve en el servidor con cada pregunta; no requiere cambios.
- **Prerequisito de infraestructura:** habilitar Realtime para esas tablas:
  `alter publication supabase_realtime add table preguntas_frecuentes, bot_sugerencias, lecciones;`
- Degradación: si el canal falla o el navegador no conecta el WebSocket, la app
  sigue funcionando como hoy (los datos se refrescan al navegar entre secciones).
  Reintento de suscripción con backoff simple.
- CSP: `connect-src` ya permite `wss://tczcngfhuendmldafbrc.supabase.co` — sin cambios.

### 2. Auto-recarga en deploys (`version.json`)

- El `buildCommand` de `vercel.json` genera `version.json` con el commit SHA:
  `{"v": "$VERCEL_GIT_COMMIT_SHA"}`.
- `js/live-updates.js` guarda la versión inicial al cargar y consulta
  `/version.json` cada 60 s con `cache: 'no-store'`.
- Si la versión cambió → recargar con cache-bust (misma técnica del botón
  "Actualizar" actual: `?v=Date.now()`), **inmediatamente**, salvo que:
  - haya una petición al bot en curso (indicador de "escribiendo" activo o
    animación de escritura corriendo), o
  - el textarea del chat tenga texto sin enviar.
  En esos casos se marca una recarga pendiente que se ejecuta apenas la
  condición desaparezca (respuesta completada / input vacío).
- El historial del chat persiste (ya vive en `localStorage` →
  `bold_chat_history`), así que la recarga es transparente para la conversación.
- En desarrollo local (`version.json` ausente o fetch falla) el chequeo se
  desactiva silenciosamente.
- Se elimina el botón "Actualizar" (`#refreshApp`) del header del chat.

### 3. Animación de escritura progresiva

- En `js/assistant.js`, las burbujas de texto del bot se renderizan con el
  markdown ya convertido a HTML pero **oculto**, y se revelan palabra por
  palabra usando un recorrido de nodos de texto (TreeWalker), a velocidad
  rápida (~180–220 caracteres/seg. percibidos). Esto evita mostrar sintaxis
  markdown a medias (`**negrita` sin cerrar).
- Aplica a: respuestas normales (`appendBubble('bot', …)`) y a segmentos de
  texto (`appendSegments`). Los segmentos de imagen/video/enlace aparecen
  cuando la escritura llega a su posición (se anima secuencialmente segmento
  por segmento).
- **Scroll:**
  - Al iniciar la respuesta, el chat se posiciona en el **inicio** del mensaje
    nuevo (el usuario lee desde arriba).
  - Mientras se escribe, el scroll sigue el texto **solo si** el usuario está
    ya al fondo del contenedor (tolerancia ~40 px). Si el usuario sube
    manualmente, no se le arrastra.
- **Saltar animación:** botón discreto "Mostrar todo" visible durante la
  animación (y también clic sobre la burbuja en curso). Al saltar: se revela
  todo el contenido restante, media incluida, y desaparece el botón.
- Los botones de resolución ("¿Logré resolver tu duda?") y el CTA de soporte
  se agregan **al terminar** la animación (o al saltarla), no antes.
- El historial restaurado desde `localStorage` al recargar NO se anima
  (se muestra completo, comportamiento actual).

## Casos borde

- Realtime caído → app funciona como hoy; sin errores visibles en consola
  más allá de un `console.warn`.
- Deploy detectado durante animación de escritura → recarga pendiente, se
  ejecuta al terminar/saltar.
- Dos cambios de contenido seguidos → los handlers de Realtime son
  idempotentes (recargan desde la DB, no acumulan estado).
- Usuario en móvil con pestaña en background → al volver, el próximo tick del
  poll de versión (60 s) detecta y recarga; Realtime se reconecta solo.

## Pruebas

- Unit/manual: forzar cambio en `version.json` local y verificar recarga
  (inmediata, y diferida cuando hay texto en el input).
- Manual en sandbox: editar una FAQ en el admin y verificar que una sesión
  abierta actualiza chips/contexto sin recargar.
- Manual en sandbox: pregunta con lección larga → escritura progresiva,
  scroll desde el inicio, botón "Mostrar todo" funcional.
- Regresión: chat restaurado de localStorage se muestra sin animación;
  botones de resolución aparecen al final.
