# Toggles de chips sugeridos del bot — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revisión 2026-07-07:** la base ya tenía `app_settings (key text, value text)` con RLS, lectura anónima y patrón de flags en el admin. Se reutiliza esa tabla en lugar de crear `bot_settings`. La migración original `create_bot_settings.sql` fue reemplazada por `enable_realtime_app_settings.sql`.

**Goal:** Dos toggles en el admin (claves en la tabla existente `app_settings`) que controlan si los chips de preguntas sugeridas se muestran al abrir el chat y si reaparecen tras cada respuesta del bot.

**Architecture:** Claves `chips_inicio` y `chips_tras_respuesta` en `app_settings` (valores texto `'true'`/`'false'`; clave ausente = activado, igual que los flags existentes). El portal (`js/assistant.js`) las carga a estado de módulo con fallback a activado; `js/live-updates.js` las recarga por realtime; el admin (`js/admin.js`) muestra dos switches en el panel "Sugerencias Bot" que hacen upsert directo.

**Tech Stack:** Vanilla JS (ES modules), Supabase (PostgREST + Realtime), Tailwind por clases utilitarias, sitio estático (sin framework ni suite de tests — verificación manual según el spec).

**Spec:** `docs/superpowers/specs/2026-07-07-bot-chips-toggles-design.md`

## Global Constraints

- Claves exactas en `app_settings`: `chips_inicio` y `chips_tras_respuesta`. Valores texto: se escribe `String(boolean)`; se lee con la convención existente `map.clave !== 'false'` (clave ausente o error ⇒ activado).
- Ante cualquier fallo leyendo `app_settings`, el portal asume ambos toggles activados (comportamiento actual).
- Textos del admin en español: "Mostrar sugerencias al abrir el chat" y "Reaparecer después de cada respuesta".
- El proyecto no tiene suite de tests: cada task cierra con verificación manual concreta (curl o navegador).
- Los commits siguen convención en español tipo `feat(scope): descripción` (ver `git log`).
- Las migraciones SQL se ejecutan manualmente UNA vez en el SQL Editor de Supabase (proyecto `tczcngfhuendmldafbrc`); el archivo en `supabase/migrations/` es el registro.

---

### Task 1: Migración realtime de `app_settings` — COMPLETADA POR EL CONTROLLER

**Files:**
- Delete: `supabase/migrations/create_bot_settings.sql` (obsoleta, nunca ejecutada en la BD)
- Create: `supabase/migrations/enable_realtime_app_settings.sql`

**Interfaces:**
- Produces: eventos realtime `postgres_changes` para `public.app_settings` (consumidos por Task 3).

- [x] **Step 1: Reemplazar la migración**

```sql
-- supabase/migrations/enable_realtime_app_settings.sql
-- Habilita realtime para app_settings (toggles de chips del bot en vivo).
-- Ejecutar UNA sola vez en el SQL Editor; si reporta "already member of
-- publication" es benigno (solo pasa al re-ejecutar).
alter publication supabase_realtime add table public.app_settings;
```

- [x] **Step 2: El usuario la ejecuta en el SQL Editor** (única línea de SQL de toda la feature).

- [x] **Step 3: Verificar por REST que las claves se leen con anon** (la tabla ya existe; smoke check):

```bash
KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjemNuZ2ZodWVuZG1sZGFmYnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzQ0OTIsImV4cCI6MjA5NTMxMDQ5Mn0.YuKwq-ooL9noU6FXDDPzJbaj-h7rhZli1s4Zji-uCXQ'
curl -s "https://tczcngfhuendmldafbrc.supabase.co/rest/v1/app_settings?select=*" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```
Expected: JSON con los flags existentes (p. ej. `resources_enabled`); las claves de chips pueden no existir aún (= activado).

- [x] **Step 4: Commit** (`git add -A supabase/migrations docs && git commit -m "refactor(bot): reutilizar app_settings para toggles de chips (sin tabla nueva)"`)

---

### Task 2: Portal — respetar los toggles en `js/assistant.js`

**Files:**
- Modify: `js/assistant.js` (líneas de referencia: 32-58 chips, 127-192 `renderAssistant`, 641-642 y 656-661 en `sendMessage`)

**Interfaces:**
- Consumes: tabla `app_settings` existente.
- Produces: `export async function loadChipSettings()` — recarga el estado interno `chipSettings = { inicio: boolean, tras_respuesta: boolean }`; sin parámetros, sin retorno útil. Task 3 la importa desde `./assistant.js`.

- [ ] **Step 1: Agregar estado y `loadChipSettings()` junto a `loadChips` (después de la línea 44)**

```js
// Toggles administrados desde el admin (claves en app_settings). Convención
// del proyecto: clave ausente o error ⇒ activado (comportamiento histórico).
let chipSettings = { inicio: true, tras_respuesta: true }

export async function loadChipSettings() {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['chips_inicio', 'chips_tras_respuesta'])
    if (error) return
    const map = Object.fromEntries((data || []).map(r => [r.key, r.value]))
    chipSettings = {
      inicio:         map.chips_inicio         !== 'false',
      tras_respuesta: map.chips_tras_respuesta !== 'false',
    }
  } catch (_) { /* mantener valores actuales */ }
}
```

- [ ] **Step 2: Cargar settings en `renderAssistant` y ocultar el contenedor inicial**

En `renderAssistant()` (línea 127), cambiar la carga de chips para traer ambos en paralelo:

```js
async function renderAssistant() {
  const [chips] = await Promise.all([loadChips(), loadChipSettings()])
```

Y en el HTML del contenedor `#quickQueries` (línea 165), agregar `hidden` condicional al inicio de la clase:

```js
      <div id="quickQueries" class="${chipSettings.inicio ? '' : 'hidden '}px-4 pb-2 flex flex-col md:flex-row gap-2 max-h-44 md:max-h-none overflow-y-auto md:overflow-x-auto no-scrollbar shrink-0">
```

- [ ] **Step 3: Condicionar la reaparición tras respuesta y tras error**

Línea 641-642 (éxito) queda:

```js
    // Las sugerencias vuelven a aparecer después de cada respuesta del bot
    // solo si el toggle del admin lo permite
    if (chipSettings.tras_respuesta) document.getElementById('quickQueries')?.classList.remove('hidden')
```

Línea 660 (dentro del catch de error de conexión) queda:

```js
    if (chipSettings.tras_respuesta) document.getElementById('quickQueries')?.classList.remove('hidden')
```

- [ ] **Step 4: Verificar en navegador (servidor estático local)**

Run: `python -m http.server 8080` en la raíz del repo y abrir `http://localhost:8080`.

1. Estado inicial (claves ausentes): chips visibles al abrir; enviar "¿Cómo creo una cotización?"; chips reaparecen tras la respuesta. (Sin regresión.)
2. Crear la clave apagada vía REST con la sesión del admin no es posible desde curl anon; usar el SQL Editor: `insert into app_settings (key, value) values ('chips_inicio','false') on conflict (key) do update set value='false';` → recargar portal → chips ocultos al abrir → enviar mensaje → chips aparecen tras la respuesta.
3. `insert into app_settings (key, value) values ('chips_tras_respuesta','false') on conflict (key) do update set value='false';` → recargar → enviar mensaje → los chips NO reaparecen.
4. Restaurar: `update app_settings set value='true' where key in ('chips_inicio','chips_tras_respuesta');`

Expected: los 4 puntos se comportan como se describe y no hay errores en la consola.

- [ ] **Step 5: Commit**

```bash
git add js/assistant.js
git commit -m "feat(bot): portal respeta toggles chips_inicio y chips_tras_respuesta"
```

---

### Task 3: Realtime — recargar settings en vivo en `js/live-updates.js`

**Files:**
- Modify: `js/live-updates.js` (líneas 6, 64-75)

**Interfaces:**
- Consumes: `loadChipSettings` de `js/assistant.js` (Task 2); realtime de `app_settings` (Task 1).

- [ ] **Step 1: Importar y suscribir**

Línea 6, ampliar el import:

```js
import { loadFaqContext, rerenderChips, loadChipSettings } from './assistant.js'
```

Junto a los debounce existentes (líneas 67-68), agregar:

```js
const onSettingsChange = debounce(() => { loadChipSettings().catch(() => {}) }, 1500)
```

Y en el canal `live-content` (después de la línea 74):

```js
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, onSettingsChange)
```

Nota: los cambios de otros flags de `app_settings` (p. ej. `curso_enabled`) también dispararán el handler; es inofensivo — solo recarga los dos valores de chips.

- [ ] **Step 2: Verificar en navegador**

Con el portal abierto en `http://localhost:8080` (sin recargar): en el SQL Editor, `update app_settings set value='false' where key='chips_tras_respuesta';`, esperar ~2 s, enviar un mensaje al bot.
Expected: los chips no reaparecen tras la respuesta (el valor llegó por realtime). Restaurar con `value='true'` y repetir: sí reaparecen.

- [ ] **Step 3: Commit**

```bash
git add js/live-updates.js
git commit -m "feat(bot): recarga en vivo de toggles de chips vía realtime de app_settings"
```

---

### Task 4: Admin — switches de comportamiento en el panel "Sugerencias Bot"

**Files:**
- Modify: `js/admin.js` (función `renderSuggestionsPanel`, líneas 1928-2061)

**Interfaces:**
- Consumes: tabla `app_settings`; helpers existentes `showToast(msg, tipo)` y `logActivity(action, entity, detail)` de `js/admin.js`.

- [ ] **Step 1: Leer settings y renderizar la tarjeta "Comportamiento"**

Al inicio de `renderSuggestionsPanel()` (línea 1930), leer también los settings:

```js
  const { data } = await supabase.from('bot_sugerencias').select('*').order('orden')
  const { data: settingsRows, error: settingsError } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['chips_inicio', 'chips_tras_respuesta'])
  const settings = Object.fromEntries((settingsRows || []).map(r => [r.key, r.value]))
```

En el template, inmediatamente después del bloque del encabezado (tras el `</div>` que cierra el `flex items-center justify-between mb-4`, línea 1941) insertar:

```js
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4 mb-4">
      <h3 class="text-sm font-black mb-3">Comportamiento</h3>
      ${settingsError ? '<p class="text-xs text-red-500 mb-2">No se pudo cargar la configuración. Recarga la página.</p>' : ''}
      <div class="space-y-3">
        <label class="flex items-center justify-between gap-3 ${settingsError ? 'opacity-50' : 'cursor-pointer'}">
          <span class="text-sm font-bold">Mostrar sugerencias al abrir el chat</span>
          <input type="checkbox" data-setting="chips_inicio" class="setting-toggle w-4 h-4 accent-[var(--blue-100)]" ${settingsError ? 'disabled' : ''} ${settings.chips_inicio !== 'false' ? 'checked' : ''}>
        </label>
        <label class="flex items-center justify-between gap-3 ${settingsError ? 'opacity-50' : 'cursor-pointer'}">
          <span class="text-sm font-bold">Reaparecer después de cada respuesta</span>
          <input type="checkbox" data-setting="chips_tras_respuesta" class="setting-toggle w-4 h-4 accent-[var(--blue-100)]" ${settingsError ? 'disabled' : ''} ${settings.chips_tras_respuesta !== 'false' ? 'checked' : ''}>
        </label>
      </div>
    </div>
```

- [ ] **Step 2: Guardar al cambiar (upsert directo, revert si falla)**

Junto a los demás listeners del panel (después de la línea 1990):

```js
  document.querySelectorAll('.setting-toggle').forEach(t => t.addEventListener('change', async () => {
    const clave = t.dataset.setting
    const valor = t.checked
    const { error } = await supabase.from('app_settings').upsert({ key: clave, value: String(valor) })
    if (error) {
      t.checked = !valor // revertir el switch al estado anterior
      showToast('Error al guardar: ' + error.message, 'error')
      return
    }
    logActivity('update', 'bot_setting', clave)
    showToast('Configuración guardada')
  }))
```

Nota: verificar la firma real de `showToast` en `js/admin.js` antes de usarla (los usos existentes en el panel son `showToast('Error al eliminar: ...', 'error')`); si el toast de éxito requiere segundo argumento, usar el que usen los demás casos de éxito del archivo.

- [ ] **Step 3: Verificar en navegador**

Abrir `http://localhost:8080/admin.html`, iniciar sesión y entrar al panel "Sugerencias Bot".

1. Se ve la tarjeta "Comportamiento" con ambos switches encendidos (claves ausentes o en 'true').
2. Apagar "Reaparecer después de cada respuesta" → toast de éxito → verificar por curl que la clave quedó `'false'`:
```bash
KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjemNuZ2ZodWVuZG1sZGFmYnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzQ0OTIsImV4cCI6MjA5NTMxMDQ5Mn0.YuKwq-ooL9noU6FXDDPzJbaj-h7rhZli1s4Zji-uCXQ'
curl -s "https://tczcngfhuendmldafbrc.supabase.co/rest/v1/app_settings?key=eq.chips_tras_respuesta" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```
Expected: `[{"key":"chips_tras_respuesta","value":"false"}]`
3. Con el portal abierto en otra pestaña, enviar un mensaje al bot: los chips no reaparecen (integración con Task 3).
4. Volver a encender el switch → curl devuelve `value:"true"`.
5. El resto del panel (crear/editar/eliminar sugerencias, límite de 6 activas) sigue funcionando.

- [ ] **Step 4: Verificación end-to-end del spec (los 5 escenarios)**

Repetir la lista de "Pruebas" del spec de corrido: escenarios 1-4 ya cubiertos arriba; escenario 5 (claves ausentes ⇒ portal como hoy) se simula en SQL Editor con `delete from app_settings where key in ('chips_inicio','chips_tras_respuesta');` → recargar portal → chips visibles al abrir y tras respuesta.
Expected: los 5 escenarios del spec pasan.

- [ ] **Step 5: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): toggles de comportamiento de chips sugeridos del bot"
```
