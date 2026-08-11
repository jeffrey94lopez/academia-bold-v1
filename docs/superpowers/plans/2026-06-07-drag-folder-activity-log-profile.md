# Drag-to-folder, Activity Log y Perfil de Usuario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar arrastrar archivos a carpetas con actualización en cascada de URLs, registro de actividad de admin con panel de historial, y gestión de perfil de usuario.

**Architecture:** Tres features independientes en orden de dependencia: (1) drag-to-folder en `renderMaterialGrid` + `cascadeUpdateUrl` en admin.js; (2) tabla `activity_log` en Supabase + helper `js/activity.js` + calls en todas las acciones; (3) nuevos paneles "Registro" y "Mi perfil" en admin.html/admin.js. La tabla `lecciones.contenido` es JSONB → Supabase lo devuelve ya parseado como array JS, no necesita `JSON.parse`.

**Tech Stack:** Vanilla JS ES modules, Tailwind CSS CDN, Lucide Icons (`window.lucide`), Supabase JS client v2, Supabase Auth.

---

## Files

- Modify: `js/upload.js` — nueva función `moveFile(oldPath, targetFolderPath)`
- Modify: `js/admin.js` — drag events, cascade update, logActivity calls, 2 paneles nuevos
- Create: `js/activity.js` — helper `logActivity()`
- Modify: `admin.html` — 2 nav buttons + 2 panel divs

---

## Task 1: Drag-to-folder con cascade URL update

**Files:**
- Modify: `js/upload.js`
- Modify: `js/admin.js`

- [ ] **Step 1: Agregar moveFile en upload.js**

Al final de `js/upload.js`, antes del cierre del archivo, agregar:

```js
export async function moveFile(oldPath, targetFolderPath) {
  const filename = oldPath.split('/').pop()
  const newPath = targetFolderPath ? `${targetFolderPath}/${filename}` : filename
  const oldUrl = supabase.storage.from(BUCKET).getPublicUrl(oldPath).data.publicUrl
  if (oldPath === newPath) return { newPath, newUrl: oldUrl, oldUrl }
  const { error } = await supabase.storage.from(BUCKET).move(oldPath, newPath)
  if (error) throw error
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(newPath)
  return { newPath, newUrl: data.publicUrl, oldUrl }
}
```

- [ ] **Step 2: Actualizar import en admin.js**

Localizar:
```js
import { uploadFile, listFiles, deleteFile, renameFile, createFolder } from './upload.js'
```
Reemplazar por:
```js
import { uploadFile, listFiles, deleteFile, renameFile, createFolder, moveFile } from './upload.js'
```

- [ ] **Step 3: Agregar cascadeUpdateUrl y handleFileMoveToFolder en admin.js**

Agregar estas dos funciones ANTES de `renderFolderBreadcrumb`:

```js
async function cascadeUpdateUrl(oldUrl, newUrl) {
  const { data: lessons } = await supabase.from('lecciones').select('id, contenido')
  const affected = (lessons || []).filter(l =>
    l.contenido && JSON.stringify(l.contenido).includes(oldUrl)
  )
  for (const l of affected) {
    const updated = (Array.isArray(l.contenido) ? l.contenido : []).map(b =>
      b.url === oldUrl ? { ...b, url: newUrl } : b
    )
    await supabase.from('lecciones').update({ contenido: updated }).eq('id', l.id)
  }
  await supabase.from('material_apoyo').update({ url: newUrl }).eq('url', oldUrl)
}

async function handleFileMoveToFolder(oldPath, targetFolderPath) {
  try {
    const { oldUrl, newUrl } = await moveFile(oldPath, targetFolderPath)
    await cascadeUpdateUrl(oldUrl, newUrl)
    showToast(`Archivo movido a "${targetFolderPath.split('/').pop()}"`)
    renderMaterialPanel()
  } catch (e) {
    showToast('Error al mover: ' + e.message, 'error')
  }
}
```

- [ ] **Step 4: Agregar clase file-card y draggable a los divs de archivo en renderMaterialGrid**

En `renderMaterialGrid`, en la **vista lista** (`materialView === 'list'`), localizar el div exterior de cada archivo:
```js
      <div class="flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-3 py-2.5 hover:border-slate-200 transition-colors group">
```
Reemplazar por:
```js
      <div class="file-card flex items-center gap-3 bg-white border border-slate-100 rounded-xl px-3 py-2.5 hover:border-slate-200 transition-colors group" draggable="true" data-path="${escapeHtml(f.name)}">
```

En la **vista cuadrícula** (`else`), localizar el div exterior de cada archivo:
```js
      <div class="group relative bg-white border border-slate-100 rounded-xl p-3 text-center shadow-sm hover:shadow-md transition-shadow">
```
Reemplazar por:
```js
      <div class="file-card group relative bg-white border border-slate-100 rounded-xl p-3 text-center shadow-sm hover:shadow-md transition-shadow" draggable="true" data-path="${escapeHtml(f.name)}">
```

- [ ] **Step 5: Agregar event listeners de drag en renderMaterialGrid**

Al FINAL de `renderMaterialGrid`, después de todos los listeners existentes (preview, rename, copy-url, delete), agregar:

```js
  grid.querySelectorAll('.file-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', card.dataset.path)
      e.dataTransfer.effectAllowed = 'move'
      setTimeout(() => card.classList.add('opacity-50'), 0)
    })
    card.addEventListener('dragend', () => card.classList.remove('opacity-50'))
  })

  grid.querySelectorAll('.folder-card').forEach(card => {
    card.addEventListener('dragover', e => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      card.style.outline = '2px solid #E92129'
      card.style.outlineOffset = '-2px'
    })
    card.addEventListener('dragleave', e => {
      if (!card.contains(e.relatedTarget)) {
        card.style.outline = ''
        card.style.outlineOffset = ''
      }
    })
    card.addEventListener('drop', async e => {
      e.preventDefault()
      e.stopPropagation()
      card.style.outline = ''
      card.style.outlineOffset = ''
      const oldPath = e.dataTransfer.getData('text/plain')
      if (!oldPath) return
      const targetFolder = card.dataset.path
      if (oldPath.startsWith(targetFolder + '/')) {
        showToast('El archivo ya está en esta carpeta', 'error')
        return
      }
      await handleFileMoveToFolder(oldPath, targetFolder)
    })
  })
```

- [ ] **Step 6: Verificar manualmente**

Abrir el panel Material. Verificar:
- Arrastrar un archivo sobre una carpeta → carpeta se resalta con borde rojo
- Soltar → archivo desaparece de la vista actual y aparece dentro de la carpeta
- Abrir una lección que usaba ese archivo → imagen sigue mostrándose (URL actualizada)
- Intentar arrastrar un archivo a la carpeta donde ya está → toast de error

- [ ] **Step 7: Commit**

```bash
git add js/upload.js js/admin.js
git commit -m "feat(admin): drag-to-folder con cascade URL update en lecciones y material_apoyo"
```

---

## Task 2: Tabla activity_log + helper activity.js

**Files:**
- Create: `js/activity.js`
- Modify: `js/admin.js`

- [ ] **Step 1: Ejecutar SQL en Supabase**

En el SQL Editor de Supabase, ejecutar:

```sql
create table if not exists activity_log (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  action text not null,
  entity_type text not null,
  entity_name text,
  details jsonb default '{}',
  created_at timestamptz default now()
);

alter table activity_log enable row level security;

create policy "authenticated_insert" on activity_log
  for insert to authenticated with check (auth.uid() = user_id);

create policy "authenticated_select" on activity_log
  for select to authenticated using (true);
```

Verificar en Table Editor que la tabla existe con las columnas correctas.

- [ ] **Step 2: Crear js/activity.js**

```js
import { supabase } from './supabase.js'

export async function logActivity(action, entityType, entityName, details = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('activity_log').insert({
      user_id: user.id,
      user_email: user.email,
      action,
      entity_type: entityType,
      entity_name: entityName,
      details,
    })
  } catch {
    // silently fail — logging must never break the app
  }
}
```

- [ ] **Step 3: Agregar import en admin.js**

Después de la última línea de imports (la que importa de `./upload.js`), agregar:

```js
import { logActivity } from './activity.js'
```

- [ ] **Step 4: Commit**

```bash
git add js/activity.js js/admin.js
git commit -m "feat(admin): tabla activity_log y helper logActivity"
```

---

## Task 3: Calls de logActivity en todas las acciones

**Files:**
- Modify: `js/admin.js`

Todas las calls son fire-and-forget (sin `await`). `logActivity` captura errores internamente.

- [ ] **Step 1: Lección — crear y actualizar**

En `saveLessonBtn` click handler, localizar:
```js
    document.getElementById('lessonFormModal').classList.add('hidden')
    renderLessonsPanel()
```
Reemplazar por:
```js
    logActivity(id ? 'update' : 'create', 'lesson', titulo)
    document.getElementById('lessonFormModal').classList.add('hidden')
    renderLessonsPanel()
```

- [ ] **Step 2: Lección — eliminar**

En el handler `.del-lesson`, localizar:
```js
  await supabase.from('lecciones').delete().eq('id', b.dataset.id)
  renderLessonsPanel()
```
Reemplazar por:
```js
  await supabase.from('lecciones').delete().eq('id', b.dataset.id)
  logActivity('delete', 'lesson', b.dataset.titulo)
  renderLessonsPanel()
```

- [ ] **Step 3: Archivo — subir**

En `doUpload`, localizar:
```js
      showToast('Archivo subido correctamente')
      await loadFiles()
```
Reemplazar por:
```js
      showToast('Archivo subido correctamente')
      logActivity('create', 'image', displayName(file.name), { folder: currentFolderPath || 'raíz' })
      await loadFiles()
```

- [ ] **Step 4: Archivo — eliminar**

En `renderMaterialGrid`, en el handler `.delete-file`, localizar:
```js
        await deleteFile(btn.dataset.path)
        showToast('Archivo eliminado')
        renderMaterialPanel()
```
Reemplazar por:
```js
        await deleteFile(btn.dataset.path)
        logActivity('delete', 'image', displayName(btn.dataset.path.split('/').pop()))
        showToast('Archivo eliminado')
        renderMaterialPanel()
```

- [ ] **Step 5: Archivo — renombrar**

En `initRenameModal`, en el handler del botón de guardar, localizar:
```js
      modal.classList.add('hidden')
      showToast('Archivo renombrado correctamente')
      if (_renameReloadCallback) await _renameReloadCallback()
```
Reemplazar por:
```js
      modal.classList.add('hidden')
      logActivity('update', 'image', newName, { from: displayName(_renameCurrentPath.split('/').pop()) })
      showToast('Archivo renombrado correctamente')
      if (_renameReloadCallback) await _renameReloadCallback()
```

NOTA: `newName` y `_renameCurrentPath` son variables accesibles en ese scope.

- [ ] **Step 6: Archivo — mover a carpeta**

En `handleFileMoveToFolder`, localizar:
```js
    await cascadeUpdateUrl(oldUrl, newUrl)
    showToast(`Archivo movido a "${targetFolderPath.split('/').pop()}"`)
```
Reemplazar por:
```js
    await cascadeUpdateUrl(oldUrl, newUrl)
    logActivity('move', 'image', displayName(oldPath.split('/').pop()), { to: targetFolderPath })
    showToast(`Archivo movido a "${targetFolderPath.split('/').pop()}"`)
```

- [ ] **Step 7: Carpeta — crear**

En el handler `confirmNewFolder`, localizar:
```js
      showToast(`Carpeta "${name}" creada`)
      await loadFiles()
```
Reemplazar por:
```js
      logActivity('create', 'folder', name)
      showToast(`Carpeta "${name}" creada`)
      await loadFiles()
```

- [ ] **Step 8: Material de apoyo — crear, actualizar, eliminar**

En `renderMaterialApoyoPanel`, en el handler `saveMatApoyo`, localizar:
```js
    renderMaterialApoyoPanel()
  })
```
(la llamada al final del handler exitoso — DESPUÉS de la verificación de error). Reemplazar por:
```js
    logActivity(id ? 'update' : 'create', 'material_apoyo', titulo)
    renderMaterialApoyoPanel()
  })
```

En el handler `.del-mat-apoyo`, localizar:
```js
    if (error) { showToast('Error al eliminar: ' + error.message, 'error'); return }
    renderMaterialApoyoPanel()
```
Reemplazar por:
```js
    if (error) { showToast('Error al eliminar: ' + error.message, 'error'); return }
    logActivity('delete', 'material_apoyo', b.dataset.titulo)
    renderMaterialApoyoPanel()
```

- [ ] **Step 9: Sugerencias bot — agregar data-texto al botón eliminar y loggear**

En `renderSuggestionsPanel`, en el template de la lista de sugerencias, localizar el botón `.del-sug`. Actualmente tiene solo `data-id`. Agregar `data-texto`:

Localizar en el template HTML algo como:
```js
            class="del-sug p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500"
```
Encontrar el botón completo y agregar `data-texto="${escapeHtml(s.texto)}"` al mismo nivel que `data-id="${s.id}"`.

En el handler `.del-sug`, localizar:
```js
    await supabase.from('bot_sugerencias').delete().eq('id', b.dataset.id)
    renderSuggestionsPanel()
```
Reemplazar por:
```js
    await supabase.from('bot_sugerencias').delete().eq('id', b.dataset.id)
    logActivity('delete', 'bot_suggestion', b.dataset.texto)
    renderSuggestionsPanel()
```

En el handler `saveSug`, localizar (al final, después del check de error exitoso):
```js
    document.getElementById('sugForm').classList.add('hidden')
    renderSuggestionsPanel()
```
Reemplazar por:
```js
    logActivity(id ? 'update' : 'create', 'bot_suggestion', texto)
    document.getElementById('sugForm').classList.add('hidden')
    renderSuggestionsPanel()
```

- [ ] **Step 10: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): logActivity en todas las acciones — lecciones, archivos, carpetas, material, sugerencias"
```

---

## Task 4: Panel "Registro de actividad"

**Files:**
- Modify: `admin.html`
- Modify: `js/admin.js`

- [ ] **Step 1: Agregar nav button y panel div en admin.html**

Localizar el botón de "Mat. de apoyo":
```html
        <button data-panel="material-apoyo" class="admin-nav w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50">
          <i data-lucide="link" class="w-4 h-4"></i> Mat. de apoyo
        </button>
```

Agregar DESPUÉS de él:
```html
        <button data-panel="activity-log" class="admin-nav w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50">
          <i data-lucide="history" class="w-4 h-4"></i> Registro
        </button>
```

Agregar el panel div después de `<div id="panel-material-apoyo" class="hidden">`:
```html
        <div id="panel-activity-log" class="hidden"></div>
```

- [ ] **Step 2: Agregar case en switchPanel en admin.js**

Localizar:
```js
  if (panel === 'material-apoyo') renderMaterialApoyoPanel()
```
Agregar después:
```js
  if (panel === 'activity-log') renderActivityLogPanel()
```

- [ ] **Step 3: Agregar función actionBadge en admin.js**

Agregar esta función de utilidad ANTES de `renderActivityLogPanel`:

```js
function actionBadge(action) {
  const colors = {
    create: 'bg-green-100 text-green-700',
    update: 'bg-blue-100 text-blue-700',
    delete: 'bg-red-100 text-red-700',
    download: 'bg-purple-100 text-purple-700',
    move: 'bg-amber-100 text-amber-700',
  }
  const labels = {
    create: 'Creó', update: 'Modificó', delete: 'Eliminó',
    download: 'Descargó', move: 'Movió',
  }
  const cls = escapeHtml(colors[action] || 'bg-slate-100 text-slate-700')
  const label = escapeHtml(labels[action] || action)
  return `<span class="text-xs font-bold px-2 py-0.5 rounded-full ${cls}">${label}</span>`
}
```

- [ ] **Step 4: Agregar renderActivityLogPanel en admin.js**

Agregar esta función ANTES de `renderSuggestionsPanel`:

```js
async function renderActivityLogPanel() {
  const el = document.getElementById('panel-activity-log')
  el.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-black">Registro de actividad</h2>
        <p class="text-xs text-slate-400 mt-0.5">Últimas 200 acciones del panel de administración.</p>
      </div>
      <select id="activityFilter" class="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 bg-white outline-none focus:border-[#E92129]">
        <option value="">Todas las acciones</option>
        <option value="lesson">Lecciones</option>
        <option value="image">Archivos</option>
        <option value="folder">Carpetas</option>
        <option value="material_apoyo">Material de apoyo</option>
        <option value="bot_suggestion">Sugerencias bot</option>
        <option value="profile">Perfil</option>
      </select>
    </div>
    <div id="activityTableWrap" class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <p class="text-center text-slate-400 text-sm py-12">Cargando...</p>
    </div>
  `

  const loadLog = async (filterType = '') => {
    const wrap = document.getElementById('activityTableWrap')
    if (!wrap) return
    let q = supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(200)
    if (filterType) q = q.eq('entity_type', filterType)
    const { data, error } = await q
    if (error) {
      wrap.innerHTML = `<p class="text-center text-red-400 text-sm py-12">Error al cargar: ${escapeHtml(error.message)}</p>`
      return
    }
    if (!data || !data.length) {
      wrap.innerHTML = '<p class="text-center text-slate-400 text-sm py-12">Sin actividad registrada.</p>'
      return
    }
    const entityLabels = {
      lesson: 'Lección', image: 'Archivo', folder: 'Carpeta',
      material_apoyo: 'Mat. de apoyo', bot_suggestion: 'Sug. bot',
      profile: 'Perfil', csv: 'CSV',
    }
    wrap.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-100">
              <th class="text-left py-2.5 px-4 text-xs font-bold text-slate-400">Fecha</th>
              <th class="text-left py-2.5 px-4 text-xs font-bold text-slate-400">Usuario</th>
              <th class="text-left py-2.5 px-4 text-xs font-bold text-slate-400">Acción</th>
              <th class="text-left py-2.5 px-4 text-xs font-bold text-slate-400">Tipo</th>
              <th class="text-left py-2.5 px-4 text-xs font-bold text-slate-400">Nombre</th>
            </tr>
          </thead>
          <tbody>
            ${data.map(e => `
              <tr class="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                <td class="py-2.5 px-4 text-slate-400 text-xs whitespace-nowrap">
                  ${escapeHtml(new Date(e.created_at).toLocaleString('es-HN', { dateStyle: 'short', timeStyle: 'short' }))}
                </td>
                <td class="py-2.5 px-4 text-slate-500 text-xs max-w-[160px] truncate" title="${escapeHtml(e.user_email || '')}">
                  ${escapeHtml(e.user_email || 'Desconocido')}
                </td>
                <td class="py-2.5 px-4">${actionBadge(e.action)}</td>
                <td class="py-2.5 px-4 text-slate-400 text-xs">${escapeHtml(entityLabels[e.entity_type] || e.entity_type)}</td>
                <td class="py-2.5 px-4 text-slate-700 text-sm font-medium max-w-[200px] truncate" title="${escapeHtml(e.entity_name || '')}">
                  ${escapeHtml(e.entity_name || '—')}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `
  }

  await loadLog()

  document.getElementById('activityFilter').addEventListener('change', e => {
    loadLog(e.target.value)
  })
}
```

- [ ] **Step 5: Verificar manualmente**

Realizar una acción en el admin (ej: crear una carpeta, subir un archivo). Navegar a "Registro". Verificar:
- La acción aparece en la tabla con el email del usuario actual, acción con badge de color, tipo y nombre correcto
- El filtro por tipo funciona
- Timestamps legibles en español

- [ ] **Step 6: Commit**

```bash
git add admin.html js/admin.js
git commit -m "feat(admin): panel de registro de actividad con filtro por tipo"
```

---

## Task 5: Panel "Mi perfil"

**Files:**
- Modify: `admin.html`
- Modify: `js/admin.js`

- [ ] **Step 1: Agregar nav button y panel div en admin.html**

Localizar el botón de "Registro":
```html
        <button data-panel="activity-log" class="admin-nav w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50">
          <i data-lucide="history" class="w-4 h-4"></i> Registro
        </button>
```

Agregar DESPUÉS:
```html
        <button data-panel="profile" class="admin-nav w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50">
          <i data-lucide="user" class="w-4 h-4"></i> Mi perfil
        </button>
```

Agregar el panel div después de `<div id="panel-activity-log" class="hidden">`:
```html
        <div id="panel-profile" class="hidden"></div>
```

- [ ] **Step 2: Agregar case en switchPanel en admin.js**

Localizar:
```js
  if (panel === 'activity-log') renderActivityLogPanel()
```
Agregar después:
```js
  if (panel === 'profile') renderProfilePanel()
```

- [ ] **Step 3: Agregar renderProfilePanel en admin.js**

Agregar ANTES de `renderActivityLogPanel`:

```js
async function renderProfilePanel() {
  const el = document.getElementById('panel-profile')
  const { data: { user } } = await supabase.auth.getUser()
  const initial = (user?.user_metadata?.full_name || user?.email || 'A')[0].toUpperCase()
  const fullName = user?.user_metadata?.full_name || ''
  const email = user?.email || ''

  el.innerHTML = `
    <div class="max-w-lg">
      <h2 class="text-lg font-black mb-6">Mi perfil</h2>

      <div class="bg-white rounded-2xl border border-slate-200 p-6 mb-4 space-y-4">
        <div class="flex items-center gap-4 mb-2">
          <div class="w-14 h-14 rounded-full bg-[#E92129] flex items-center justify-center text-white text-xl font-black shrink-0">
            ${escapeHtml(initial)}
          </div>
          <div>
            <p class="font-black text-slate-800">${escapeHtml(fullName || 'Sin nombre')}</p>
            <p class="text-sm text-slate-400">${escapeHtml(email)}</p>
          </div>
        </div>

        <div>
          <label class="text-xs font-bold text-slate-500 mb-1 block">Nombre completo</label>
          <input id="profileName" value="${escapeHtml(fullName)}"
            class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
        </div>
        <div>
          <label class="text-xs font-bold text-slate-500 mb-1 block">Correo electrónico</label>
          <input id="profileEmail" type="email" value="${escapeHtml(email)}"
            class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
          <p class="text-xs text-slate-400 mt-1">Al cambiar el correo se enviará confirmación a la nueva dirección.</p>
        </div>
        <p id="profileError" class="hidden text-red-500 text-xs"></p>
        <button id="saveProfile" class="w-full py-2.5 rounded-xl bg-[#E92129] text-white text-sm font-bold hover:opacity-90 transition-opacity">
          Guardar cambios
        </button>
      </div>

      <div class="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <h3 class="font-black text-slate-800">Cambiar contraseña</h3>
        <div>
          <label class="text-xs font-bold text-slate-500 mb-1 block">Nueva contraseña</label>
          <input id="profilePassword" type="password" placeholder="Mínimo 6 caracteres"
            class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
        </div>
        <div>
          <label class="text-xs font-bold text-slate-500 mb-1 block">Confirmar contraseña</label>
          <input id="profilePasswordConfirm" type="password"
            class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
        </div>
        <p id="passwordError" class="hidden text-red-500 text-xs"></p>
        <button id="savePassword" class="w-full py-2.5 rounded-xl bg-slate-800 text-white text-sm font-bold hover:opacity-90 transition-opacity">
          Cambiar contraseña
        </button>
      </div>
    </div>
  `

  document.getElementById('saveProfile').addEventListener('click', async () => {
    const name = document.getElementById('profileName').value.trim()
    const newEmail = document.getElementById('profileEmail').value.trim()
    const errorEl = document.getElementById('profileError')
    const btn = document.getElementById('saveProfile')

    if (!newEmail) {
      errorEl.textContent = 'El correo es requerido.'
      errorEl.classList.remove('hidden')
      return
    }

    btn.disabled = true
    btn.textContent = 'Guardando...'
    errorEl.classList.add('hidden')

    const updates = { data: { full_name: name } }
    if (newEmail !== email) updates.email = newEmail

    const { error } = await supabase.auth.updateUser(updates)
    if (error) {
      errorEl.textContent = error.message
      errorEl.classList.remove('hidden')
      btn.disabled = false
      btn.textContent = 'Guardar cambios'
      return
    }

    logActivity('update', 'profile', email, { full_name: name })
    if (newEmail !== email) {
      showToast('Cambios guardados. Revisa tu correo para confirmar la nueva dirección.')
    } else {
      showToast('Perfil actualizado correctamente')
    }
    renderProfilePanel()
  })

  document.getElementById('savePassword').addEventListener('click', async () => {
    const password = document.getElementById('profilePassword').value
    const confirm = document.getElementById('profilePasswordConfirm').value
    const errorEl = document.getElementById('passwordError')
    const btn = document.getElementById('savePassword')

    errorEl.classList.add('hidden')
    if (!password || password.length < 6) {
      errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'
      errorEl.classList.remove('hidden')
      return
    }
    if (password !== confirm) {
      errorEl.textContent = 'Las contraseñas no coinciden.'
      errorEl.classList.remove('hidden')
      return
    }

    btn.disabled = true
    btn.textContent = 'Cambiando...'

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      errorEl.textContent = error.message
      errorEl.classList.remove('hidden')
      btn.disabled = false
      btn.textContent = 'Cambiar contraseña'
      return
    }

    logActivity('update', 'profile', email, { changed: 'password' })
    showToast('Contraseña actualizada correctamente')
    document.getElementById('profilePassword').value = ''
    document.getElementById('profilePasswordConfirm').value = ''
    btn.disabled = false
    btn.textContent = 'Cambiar contraseña'
  })
}
```

- [ ] **Step 4: Verificar manualmente**

Navegar a "Mi perfil". Verificar:
- Nombre y correo del usuario actual se muestran precargados
- Cambiar nombre y guardar → toast de confirmación, panel se recarga con el nuevo nombre
- Cambiar correo → toast indicando que se enviará confirmación
- Contraseñas distintas → error inline
- Contraseña < 6 chars → error inline
- Contraseña correcta → toast de confirmación, campos se limpian
- Cambiar contraseña y contraseñas coinciden → funciona correctamente

- [ ] **Step 5: Commit**

```bash
git add admin.html js/admin.js
git commit -m "feat(admin): panel de perfil con edición de nombre, correo y contraseña"
```

---

## Self-Review

**Spec coverage:**
- [x] Arrastrar archivo a carpeta → Task 1
- [x] Cascade update en lecciones (JSONB) → Task 1 (cascadeUpdateUrl)
- [x] Cascade update en material_apoyo → Task 1 (cascadeUpdateUrl)
- [x] Visual feedback en drag (outline rojo en carpeta) → Task 1 Step 5
- [x] Prevent mover a carpeta donde ya está → Task 1 Step 5 (guard)
- [x] Tabla activity_log con RLS → Task 2 Step 1
- [x] logActivity helper fire-and-forget → Task 2 Step 2
- [x] Registro en eliminar imagen → Task 3 Step 4
- [x] Registro en eliminar lección → Task 3 Step 2
- [x] Registro en modificar lección → Task 3 Step 1 (id branch)
- [x] Registro en crear lección → Task 3 Step 1 (no-id branch)
- [x] Registro en agregar material de apoyo → Task 3 Step 8
- [x] Registro en descarga CSV → no aplica (función no existe en el codebase)
- [x] Registro en modificar/agregar/eliminar sugerencia bot → Task 3 Step 9
- [x] Panel visual de historial con filtro → Task 4
- [x] Nombre, correo, contraseña en perfil → Task 5
- [x] Confirmación de email al cambiar correo → Task 5 (Supabase maneja)

**Dependencias entre tareas:**
- Task 1: independiente
- Task 2: independiente (precondición para Task 3)
- Task 3: depende de Task 2 (necesita logActivity importado)
- Task 4: depende de Task 2 (lee de activity_log)
- Task 5: depende de Task 2 (llama logActivity para perfil)
- Orden recomendado: 1 → 2 → 3 → 4 → 5

**Sin placeholders. Código completo en cada paso.**
