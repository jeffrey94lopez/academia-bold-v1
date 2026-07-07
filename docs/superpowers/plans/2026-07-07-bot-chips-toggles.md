# Toggles de chips sugeridos del bot — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dos toggles en el admin (tabla `bot_settings` de Supabase) que controlan si los chips de preguntas sugeridas se muestran al abrir el chat y si reaparecen tras cada respuesta del bot.

**Architecture:** Tabla clave-valor `bot_settings` con RLS (lectura pública, escritura autenticados) y realtime. El portal (`js/assistant.js`) carga los valores a un estado de módulo con fallback a `true`; `js/live-updates.js` los recarga en vivo; el admin (`js/admin.js`) muestra dos switches en el panel "Sugerencias Bot" que hacen update directo.

**Tech Stack:** Vanilla JS (ES modules), Supabase (PostgREST + Realtime), Tailwind por clases utilitarias, sitio estático (sin framework ni suite de tests — verificación manual según el spec).

**Spec:** `docs/superpowers/specs/2026-07-07-bot-chips-toggles-design.md`

## Global Constraints

- Claves exactas de settings: `chips_inicio` y `chips_tras_respuesta` (default `true`).
- Ante cualquier fallo leyendo `bot_settings`, el portal asume ambos valores `true` (comportamiento actual).
- Textos del admin en español: "Mostrar sugerencias al abrir el chat" y "Reaparecer después de cada respuesta".
- El proyecto no tiene suite de tests: cada task cierra con verificación manual concreta (curl o navegador).
- Los commits siguen convención en español tipo `feat(scope): descripción` (ver `git log`).
- Las migraciones SQL se ejecutan manualmente UNA vez en el SQL Editor de Supabase (proyecto `tczcngfhuendmldafbrc`); el archivo en `supabase/migrations/` es el registro.

---

### Task 1: Migración `bot_settings`

**Files:**
- Create: `supabase/migrations/create_bot_settings.sql`

**Interfaces:**
- Produces: tabla `public.bot_settings (clave text pk, valor boolean)` con filas `chips_inicio` y `chips_tras_respuesta`, legible con el anon key vía `GET /rest/v1/bot_settings`.

- [ ] **Step 1: Escribir la migración**

```sql
-- supabase/migrations/create_bot_settings.sql
-- Configuración del comportamiento del bot editable desde el admin.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
create table if not exists public.bot_settings (
  clave text primary key,
  valor boolean not null default true
);

insert into public.bot_settings (clave, valor) values
  ('chips_inicio', true),
  ('chips_tras_respuesta', true)
on conflict (clave) do nothing;

alter table public.bot_settings enable row level security;

create policy "bot_settings lectura publica"
  on public.bot_settings for select using (true);

create policy "bot_settings escritura autenticados"
  on public.bot_settings for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Realtime para que el portal reaccione sin recargar
alter publication supabase_realtime add table public.bot_settings;
```

- [ ] **Step 2: Pedir al usuario ejecutarla**

Este entorno no tiene service key: pide al usuario que ejecute el contenido del archivo en el SQL Editor de Supabase y confirme. (Si reporta "already member of publication", es benigno: solo aplica si se re-ejecuta.)

- [ ] **Step 3: Verificar por REST que la tabla existe y tiene las 2 filas**

Run (Bash; el anon key es el de `js/supabase.js`):
```bash
KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjemNuZ2ZodWVuZG1sZGFmYnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzQ0OTIsImV4cCI6MjA5NTMxMDQ5Mn0.YuKwq-ooL9noU6FXDDPzJbaj-h7rhZli1s4Zji-uCXQ'
curl -s "https://tczcngfhuendmldafbrc.supabase.co/rest/v1/bot_settings?select=*" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```
Expected: `[{"clave":"chips_inicio","valor":true},{"clave":"chips_tras_respuesta","valor":true}]` (orden puede variar).

También verificar que el anon NO puede escribir:
```bash
curl -s -X PATCH "https://tczcngfhuendmldafbrc.supabase.co/rest/v1/bot_settings?clave=eq.chips_inicio" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"valor": false}' -i | head -1
```
Expected: la fila NO cambia (re-consultar devuelve `valor:true`; PostgREST responde 2xx con 0 filas afectadas por RLS).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/create_bot_settings.sql
git commit -m "feat(bot): migración bot_settings para toggles de chips sugeridos"
```

---

### Task 2: Portal — respetar los toggles en `js/assistant.js`

**Files:**
- Modify: `js/assistant.js` (líneas de referencia: 32-58 chips, 127-192 `renderAssistant`, 641-642 y 656-661 en `sendMessage`, 694-696 bootstrap)

**Interfaces:**
- Consumes: tabla `bot_settings` (Task 1).
- Produces: `export async function loadChipSettings()` — recarga el estado interno `chipSettings = { inicio: boolean, tras_respuesta: boolean }`; sin parámetros, sin retorno útil. Task 3 la importa.

- [ ] **Step 1: Agregar estado y `loadChipSettings()` junto a `loadChips` (después de la línea 44)**

```js
// Toggles administrados desde el admin (tabla bot_settings). Ante cualquier
// fallo se asumen ambos en true: el comportamiento histórico del chat.
let chipSettings = { inicio: true, tras_respuesta: true }

export async function loadChipSettings() {
  try {
    const { data, error } = await supabase
      .from('bot_settings')
      .select('clave, valor')
      .in('clave', ['chips_inicio', 'chips_tras_respuesta'])
    if (error || !data?.length) return
    const map = Object.fromEntries(data.map(r => [r.clave, r.valor]))
    chipSettings = {
      inicio:         map.chips_inicio         ?? true,
      tras_respuesta: map.chips_tras_respuesta ?? true,
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

Y en el HTML del contenedor (línea 165), agregar `hidden` condicional:

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

Línea 660 (catch de error de conexión) queda:

```js
    if (chipSettings.tras_respuesta) document.getElementById('quickQueries')?.classList.remove('hidden')
```

- [ ] **Step 4: Verificar en navegador (servidor estático local)**

Run: `python -m http.server 8080` en la raíz del repo y abrir `http://localhost:8080`.

1. Con ambas filas en `true` (estado tras Task 1): chips visibles al abrir; enviar "¿Cómo creo una cotización?"; chips reaparecen tras la respuesta. (Sin regresión.)
2. En Supabase SQL Editor (o pidiéndole al usuario): `update bot_settings set valor=false where clave='chips_inicio';` → recargar portal → chips ocultos al abrir → enviar un mensaje → chips aparecen tras la respuesta.
3. `update bot_settings set valor=false where clave='chips_tras_respuesta';` → recargar → enviar mensaje → los chips NO reaparecen.
4. Restaurar: `update bot_settings set valor=true;`

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
- Consumes: `loadChipSettings` de `js/assistant.js` (Task 2).

- [ ] **Step 1: Importar y suscribir**

Línea 6, ampliar el import:

```js
import { loadFaqContext, rerenderChips, loadChipSettings } from './assistant.js'
```

Junto a los debounce existentes (línea 67-68), agregar:

```js
const onSettingsChange = debounce(() => { loadChipSettings().catch(() => {}) }, 1500)
```

Y en el canal `live-content` (después de la línea 74):

```js
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bot_settings' }, onSettingsChange)
```

- [ ] **Step 2: Verificar en navegador**

Con el portal abierto en `http://localhost:8080` (sin recargar): cambiar `chips_tras_respuesta` a `false` en Supabase, esperar ~2 s, enviar un mensaje al bot.
Expected: los chips no reaparecen tras la respuesta (el valor llegó por realtime). Restaurar a `true` y repetir: sí reaparecen.

- [ ] **Step 3: Commit**

```bash
git add js/live-updates.js
git commit -m "feat(bot): recarga en vivo de bot_settings vía realtime"
```

---

### Task 4: Admin — switches de comportamiento en el panel "Sugerencias Bot"

**Files:**
- Modify: `js/admin.js` (función `renderSuggestionsPanel`, líneas 1928-2061)

**Interfaces:**
- Consumes: tabla `bot_settings` (Task 1); helpers existentes `showToast(msg, tipo)` y `logActivity(action, entity, detail)` de `js/admin.js`.

- [ ] **Step 1: Leer settings y renderizar la tarjeta "Comportamiento"**

Al inicio de `renderSuggestionsPanel()` (línea 1930), leer también los settings:

```js
  const { data } = await supabase.from('bot_sugerencias').select('*').order('orden')
  const { data: settingsRows, error: settingsError } = await supabase
    .from('bot_settings')
    .select('clave, valor')
  const settings = Object.fromEntries((settingsRows || []).map(r => [r.clave, r.valor]))
```

En el template, inmediatamente después del bloque del encabezado (tras el `</div>` que cierra el `flex items-center justify-between mb-4`, línea 1941) insertar:

```js
    <div class="bg-white rounded-2xl border border-[var(--blue-10)] p-4 mb-4">
      <h3 class="text-sm font-black mb-3">Comportamiento</h3>
      ${settingsError ? '<p class="text-xs text-red-500 mb-2">No se pudo cargar la configuración. Recarga la página.</p>' : ''}
      <div class="space-y-3">
        <label class="flex items-center justify-between gap-3 ${settingsError ? 'opacity-50' : 'cursor-pointer'}">
          <span class="text-sm font-bold">Mostrar sugerencias al abrir el chat</span>
          <input type="checkbox" data-setting="chips_inicio" class="setting-toggle w-4 h-4 accent-[var(--blue-100)]" ${settingsError ? 'disabled' : ''} ${settings.chips_inicio !== false ? 'checked' : ''}>
        </label>
        <label class="flex items-center justify-between gap-3 ${settingsError ? 'opacity-50' : 'cursor-pointer'}">
          <span class="text-sm font-bold">Reaparecer después de cada respuesta</span>
          <input type="checkbox" data-setting="chips_tras_respuesta" class="setting-toggle w-4 h-4 accent-[var(--blue-100)]" ${settingsError ? 'disabled' : ''} ${settings.chips_tras_respuesta !== false ? 'checked' : ''}>
        </label>
      </div>
    </div>
```

- [ ] **Step 2: Guardar al cambiar (update directo, revert si falla)**

Junto a los demás listeners del panel (después de la línea 1990):

```js
  document.querySelectorAll('.setting-toggle').forEach(t => t.addEventListener('change', async () => {
    const clave = t.dataset.setting
    const valor = t.checked
    const { error } = await supabase.from('bot_settings').update({ valor }).eq('clave', clave)
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

1. Se ve la tarjeta "Comportamiento" con ambos switches encendidos (estado de la tabla).
2. Apagar "Reaparecer después de cada respuesta" → toast de éxito → verificar por curl que la fila quedó `false`:
```bash
KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjemNuZ2ZodWVuZG1sZGFmYnJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MzQ0OTIsImV4cCI6MjA5NTMxMDQ5Mn0.YuKwq-ooL9noU6FXDDPzJbaj-h7rhZli1s4Zji-uCXQ'
curl -s "https://tczcngfhuendmldafbrc.supabase.co/rest/v1/bot_settings?clave=eq.chips_tras_respuesta" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```
Expected: `[{"clave":"chips_tras_respuesta","valor":false}]`
3. Con el portal abierto en otra pestaña, enviar un mensaje al bot: los chips no reaparecen (integración con Task 3).
4. Volver a encender el switch → curl devuelve `valor:true`.
5. El resto del panel (crear/editar/eliminar sugerencias, límite de 6 activas) sigue funcionando.

- [ ] **Step 4: Verificación end-to-end del spec (los 5 escenarios)**

Repetir la lista de "Pruebas" del spec de corrido: escenarios 1-4 ya cubiertos arriba; escenario 5 (tabla sin filas ⇒ portal como hoy) se simula en SQL Editor con `delete from bot_settings;` → recargar portal → chips visibles al abrir y tras respuesta → restaurar con el `insert ... on conflict do nothing` de la migración.
Expected: los 5 escenarios del spec pasan.

- [ ] **Step 5: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): toggles de comportamiento de chips sugeridos del bot"
```
