# Academia embebible en Bold POS (iframe cross-origin)

**Fecha:** 2026-07-02
**Estado:** Aprobado por el usuario

## Contexto

Bold POS (pos.bold.co) va a mostrar la parte de usuario de la academia
(https://academia.localizadoc.com/) dentro de un iframe. El equipo de desarrollo de
Bold POS controla la página contenedora; la solución debe vivir 100% en la academia,
sin depender de ellos.

Dos bloqueos detectados:

1. **Headers anti-framing propios.** `vercel.json` enviaba `X-Frame-Options: DENY` y
   `Content-Security-Policy: ... frame-ancestors 'none'`, que prohíben embeber la app
   en cualquier iframe. Este era el error reportado
   ("Framing ... violates frame-ancestors 'none'").
2. **Acceso directo a `localStorage` en un contexto third-party.** `assistant.js` y
   `theme-init.js` acceden a `localStorage` al cargar. Si el navegador bloquea
   almacenamiento de terceros (Chrome/Edge con "bloquear cookies de terceros",
   frecuente en equipos corporativos), ese acceso lanza `SecurityError` y la app queda
   en blanco dentro del iframe.

Alcance real de la superficie de usuario en producción: asistente (bot), lecciones y
recursos. La pantalla de curso/progreso (`js/course.js`, con `registerStudent` /
`loadSession`) está deshabilitada — no se importa desde `main.js` — así que no hay
login ni progreso de estudiante que proteger hoy. El uso vivo de `localStorage` es:

| Archivo | Claves | Uso |
|---|---|---|
| `js/assistant.js` | `bold_chat_history`, `bold_session_id` | historial de chat, id anónimo para bot/analytics |
| `js/analytics.js` | `bold_session_id`, `bold_mode` (lectura) | etiquetar eventos |
| `js/theme-init.js` | `theme` | tema claro/oscuro (script suelto en `<head>`, no módulo ES) |

## Decisiones

- Origen permitido para embeber: `'self'`, `https://bold.co` y `https://*.bold.co`.
- Persistencia dentro del iframe: aceptable que sea "mejor esfuerzo". Si el navegador
  bloquea o borra el almacenamiento, el chat y el tema no persisten entre visitas,
  pero la app debe seguir funcionando (fallback en memoria). No se agrega mecanismo
  de recuperación de sesión porque la pantalla de curso/progreso está deshabilitada.
- Enfoque elegido: **A — storage seguro** (se descartó "solo CSP" por el riesgo de
  pantalla en blanco, y "modo embed" con UI adaptada por YAGNI).

## Diseño

### 1. Headers (`vercel.json`) — ya aplicado en el working tree, pendiente de commit

- Eliminar el header `X-Frame-Options: DENY` (no admite lista de orígenes; los
  navegadores modernos usan `frame-ancestors`).
- En el CSP, cambiar `frame-ancestors 'none'` por
  `frame-ancestors 'self' https://bold.co https://*.bold.co`.
- El resto del CSP y headers de seguridad quedan intactos. La protección
  anti-clickjacking se mantiene para cualquier origen fuera de bold.co.

### 2. Nuevo módulo `js/storage.js`

API mínima, sin dependencias:

```js
storageGet(key)      // → string | null; nunca lanza
storageSet(key, val) // best-effort; nunca lanza
storageRemove(key)   // best-effort; nunca lanza
```

Comportamiento:

- Detecta una sola vez (al cargar el módulo) si `localStorage` es accesible mediante
  un write/read/remove de prueba dentro de try/catch.
- Si no es accesible, todas las operaciones usan un `Map` en memoria que vive lo que
  dure la página.
- Cada operación individual también va envuelta en try/catch con caída al `Map`, para
  cubrir fallos en runtime (`QuotaExceededError`, revocación de acceso a mitad de
  sesión). Un `setItem` que falla escribe en el `Map` para que la lectura siguiente
  sea coherente dentro de la misma página.

### 3. Refactor de consumidores activos

- `js/assistant.js`: reemplazar todas las llamadas directas a `localStorage`
  (líneas de historial de chat y `bold_session_id`) por `storageGet`/`storageSet`/
  `storageRemove`.
- `js/analytics.js`: reemplazar las dos lecturas de `localStorage` por `storageGet`.
- `js/theme-init.js`: es un script clásico en el `<head>` (no módulo), así que no
  puede importar `storage.js`; se envuelve su única línea en try/catch inline.
- `js/course.js`: **no se toca** (código deshabilitado). Si se reactiva la pantalla
  de curso/progreso, debe migrarse al wrapper en ese momento.
- `js/admin.js` y `admin.html`: fuera de alcance; el admin no se embebe.

### 4. Manejo de errores

Toda falla de almacenamiento es silenciosa para el usuario: la app funciona con
persistencia degradada. No se muestran avisos ni se registra en analytics (el propio
analytics depende del storage).

### 5. Verificación

1. **Regresión directa:** abrir la academia de forma normal (top-level) y comprobar
   que bot, lecciones, recursos y tema funcionan igual que antes.
2. **Simulación de iframe hostil:** página de prueba local servida desde otro origen
   que embeba la academia en un iframe, con "bloquear cookies de terceros" activado
   en Chrome. Comprobar que la app carga y el bot responde (sin persistencia).
   Nota: el bloqueo por CSP solo es reproducible contra producción, porque los
   headers los inyecta Vercel.
3. **Post-deploy:** embeber `https://academia.localizadoc.com/` desde una página en
   otro origen permitido/no permitido para confirmar que `frame-ancestors` permite
   bold.co y sigue bloqueando al resto; luego prueba real desde Bold POS.

## Riesgos conocidos

- **Almacenamiento particionado:** aun cuando funciona, el storage dentro del iframe
  está particionado por el sitio contenedor: el historial de chat del embed es
  independiente del de una visita directa a la academia. Aceptado.
- **Safari:** puede borrar el almacenamiento particionado con el tiempo; el usuario
  del embed perdería historial de chat/tema. Aceptado (mejor esfuerzo).
- **Login dentro del iframe:** no aplica hoy (la parte embebida no tiene login). Si
  algún día se embebe una superficie con Supabase Auth, habrá que revisar este spec.
