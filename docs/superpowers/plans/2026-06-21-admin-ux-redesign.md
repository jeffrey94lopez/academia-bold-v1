# Admin UX Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar el panel admin para que sea visualmente coherente con el frontend del alumno y más eficiente de usar.

**Architecture:** Todos los cambios están en dos archivos (`admin.html` y `js/admin.js`). No hay cambios de base de datos ni de lógica de negocio. El proyecto es vanilla JS + Supabase CDN sin build step — los cambios se verifican abriendo el navegador directamente.

**Tech Stack:** Vanilla JS, Tailwind CSS (compilado en `css/tw.css`), Supabase JS CDN, Lucide Icons CDN.

---

## Mapa de archivos

| Archivo | Qué cambia |
|---|---|
| `admin.html` | Header completo, sidebar agrupado sin iconos, añadir `panel-home` |
| `js/admin.js` | `init()`, `switchPanel()`, `renderHomePanel()` (nueva), `renderLessonsPanel()` (labels + bloques), `blockItemHtml()` (badge estilo), `renderGlossaryPanel()` (search + inline edit + botones texto), `renderFaqPanel()` (idem), `renderMaterialApoyoPanel()` (idem), textos "Bodi" → "bolbot POS" |

---

## Task 1: Terminología "Bodi" → "bolbot POS" en textos visibles

**Files:**
- Modify: `js/admin.js`

Solo reemplazar strings que el usuario ve (labels, toasts, titles, placeholders). No tocar nombres de variables, keys de Supabase, ni `EMBED_TOKEN`.

- [ ] **Step 1: Reemplazar en `js/admin.js`**

Aplicar estos reemplazos exactos (usar Edit con `replace_all: true` para cada uno):

| Buscar | Reemplazar |
|---|---|
| `'Solo para Bodi'` | `'Solo para bolbot POS'` |
| `🤖 Solo para Bodi` | `🤖 Solo para bolbot POS` |
| `— Solo Bodi` | `— bolbot POS` |
| `para Bodi...` | `para bolbot POS...` |
| `que Bodi debe` | `que bolbot POS debe` |
| `que Bodi puede` | `que bolbot POS puede` |
| `que Bodi debe guiar` | `que bolbot POS debe guiar` |
| `Activar en Bodi` | `Activar en bolbot POS` |
| `Desactivar en Bodi` | `Desactivar en bolbot POS` |
| `activada en Bodi.` | `activada en bolbot POS.` |
| `desactivada en Bodi.` | `desactivada en bolbot POS.` |
| `chat de Bodi.` | `chat de bolbot POS.` |
| `Chatbot Bodi` | `bolbot POS` |

- [ ] **Step 2: Verificar en navegador**

Abrir `admin.html`, ir a Lecciones → editar cualquier lección → revisar que los botones de bloques digan "Solo para bolbot POS". Ir a Mi perfil → Configuración → confirmar que el toggle dice "bolbot POS" (no "Chatbot Bodi").

- [ ] **Step 3: Commit**

```bash
git add js/admin.js
git commit -m "refactor(admin): rename Bodi to bolbot POS in all visible text"
```

---

## Task 2: Sidebar HTML — agrupado, sin iconos, con panel-home

**Files:**
- Modify: `admin.html`

Reemplazar el `<nav>` del sidebar por la versión agrupada. Añadir `<div id="panel-home">`.

- [ ] **Step 1: Reemplazar el `<nav>` en `admin.html`**

Reemplazar el bloque completo del nav (el `<nav class="w-48 ...">...</nav>`) por:

```html
<nav class="w-48 bg-white border-r border-[var(--blue-10)] min-h-[calc(100vh-57px)] p-3 flex flex-col gap-0.5 shrink-0">
  <button data-panel="home" class="admin-nav w-full px-3 py-2 rounded-xl text-sm font-bold text-left">Inicio</button>

  <p class="px-3 pt-3 pb-1 text-[9px] font-black uppercase tracking-widest text-[var(--black-40)]">Contenido</p>
  <button data-panel="lessons" class="admin-nav w-full px-3 py-2 rounded-xl text-sm font-bold text-left">Lecciones</button>
  <button data-panel="faq" class="admin-nav w-full px-3 py-2 rounded-xl text-sm font-bold text-left">P. Frecuentes</button>
  <button data-panel="glossary" class="admin-nav w-full px-3 py-2 rounded-xl text-sm font-bold text-left">Glosario</button>
  <button data-panel="material" class="admin-nav w-full px-3 py-2 rounded-xl text-sm font-bold text-left">Material</button>

  <hr class="border-[var(--blue-10)] my-1">

  <p class="px-3 pt-1 pb-1 text-[9px] font-black uppercase tracking-widest text-[var(--black-40)]">bolbot POS</p>
  <button data-panel="material-apoyo" class="admin-nav w-full px-3 py-2 rounded-xl text-sm font-bold text-left">Mat. de apoyo</button>
  <button data-panel="suggestions" class="admin-nav w-full px-3 py-2 rounded-xl text-sm font-bold text-left">Sugerencias</button>

  <hr class="border-[var(--blue-10)] my-1">

  <p class="px-3 pt-1 pb-1 text-[9px] font-black uppercase tracking-widest text-[var(--black-40)]">Datos</p>
  <button data-panel="results" class="admin-nav w-full px-3 py-2 rounded-xl text-sm font-bold text-left">Resultados</button>
  <button data-panel="analytics" class="admin-nav w-full px-3 py-2 rounded-xl text-sm font-bold text-left">Analytics</button>
  <button data-panel="activity" class="admin-nav w-full px-3 py-2 rounded-xl text-sm font-bold text-left">Registro</button>

  <div class="mt-auto pt-2 border-t border-[var(--blue-10)]">
    <button data-panel="profile" class="admin-nav w-full px-3 py-2 rounded-xl text-sm font-bold text-left text-[var(--black-60)]">Mi perfil</button>
  </div>
</nav>
```

- [ ] **Step 2: Añadir `panel-home` en `admin.html`**

Dentro de `<main class="flex-1 p-6">`, añadir como primer hijo:

```html
<div id="panel-home" class="hidden"></div>
```

- [ ] **Step 3: Actualizar `switchPanel` en `js/admin.js`**

Reemplazar el bloque de clases activas dentro de `switchPanel` y añadir el routing para home:

```js
function switchPanel(panel) {
  localStorage.setItem('admin_panel', panel)
  document.querySelectorAll('[id^="panel-"]').forEach(p => p.classList.add('hidden'))
  document.getElementById(`panel-${panel}`).classList.remove('hidden')
  document.querySelectorAll('.admin-nav').forEach(b => {
    const active = b.dataset.panel === panel
    b.classList.toggle('bg-[var(--blue-100)]', active)
    b.classList.toggle('text-white', active)
    b.classList.toggle('text-[var(--blue-100)]', !active && b.dataset.panel !== 'profile')
    b.classList.toggle('hover:bg-[var(--black-10)]', !active)
  })
  // breadcrumb
  const labels = {
    home: 'Inicio', lessons: 'Lecciones', faq: 'P. Frecuentes',
    glossary: 'Glosario', material: 'Material', 'material-apoyo': 'Mat. de apoyo',
    suggestions: 'Sugerencias', results: 'Resultados', analytics: 'Analytics',
    activity: 'Registro', profile: 'Mi perfil'
  }
  const bc = document.getElementById('adminBreadcrumb')
  if (bc) bc.textContent = labels[panel] || panel

  if (panel === 'home') renderHomePanel()
  if (panel === 'lessons') renderLessonsPanel()
  if (panel === 'faq') renderFaqPanel()
  if (panel === 'glossary') renderGlossaryPanel()
  if (panel === 'material') { currentFolderPath = ''; renderMaterialPanel() }
  if (panel === 'material-apoyo') renderMaterialApoyoPanel()
  if (panel === 'suggestions') renderSuggestionsPanel()
  if (panel === 'results') renderResultsPanel()
  if (panel === 'analytics') renderAnalyticsPanel()
  if (panel === 'activity') renderActivityPanel()
  if (panel === 'profile') renderProfilePanel()
}
```

- [ ] **Step 4: Cambiar panel por defecto a 'home' en `init()`**

```js
const savedPanel = localStorage.getItem('admin_panel') || 'home'
switchPanel(savedPanel)
```

- [ ] **Step 5: Verificar en navegador**

Abrir `admin.html`. El sidebar debe mostrar las secciones agrupadas sin iconos. El ítem activo debe tener fondo azul oscuro con texto blanco. Navegar entre paneles y confirmar que el estado activo se mueve correctamente.

- [ ] **Step 6: Commit**

```bash
git add admin.html js/admin.js
git commit -m "feat(admin): grouped sidebar without icons, add home panel routing"
```

---

## Task 3: Header — breadcrumb + avatar con dropdown

**Files:**
- Modify: `admin.html`
- Modify: `js/admin.js`

- [ ] **Step 1: Reemplazar el `<header>` en `admin.html`**

Reemplazar el `<header class="bg-white border-b ...">` completo por:

```html
<header class="bg-white border-b border-[var(--blue-10)] px-6 py-0 h-[57px] flex items-center justify-between sticky top-0 z-10">
  <div class="flex items-center gap-3">
    <img src="assets/Bold%20POS.png" alt="Bold POS" class="h-7 w-auto" />
    <div class="w-px h-5 bg-[var(--blue-10)]"></div>
    <span class="text-[10px] font-black uppercase tracking-widest text-[var(--black-40)]">Admin</span>
    <span class="text-[var(--blue-20)] text-sm">/</span>
    <span id="adminBreadcrumb" class="text-sm font-bold text-[var(--blue-100)]">Inicio</span>
  </div>
  <div class="flex items-center gap-4">
    <a href="index.html" class="text-xs font-bold text-[var(--black-40)] hover:text-[var(--black-100)] flex items-center gap-1">
      Ver sitio <span class="text-[10px]">↗</span>
    </a>
    <div class="relative">
      <button id="avatarBtn" class="w-8 h-8 rounded-full bg-[var(--blue-10)] text-[var(--blue-100)] text-xs font-black flex items-center justify-center hover:bg-[var(--blue-20)] transition-colors">
        <span id="avatarInitial">?</span>
      </button>
      <div id="avatarDropdown" class="hidden absolute right-0 top-10 bg-white border border-[var(--blue-10)] rounded-2xl shadow-lg py-1 w-40 z-50">
        <button id="dropdownProfile" class="w-full text-left px-4 py-2.5 text-sm font-bold text-[var(--blue-100)] hover:bg-[var(--black-10)]">Mi perfil</button>
        <div class="border-t border-[var(--blue-10)] mx-2"></div>
        <button id="logoutBtn" class="w-full text-left px-4 py-2.5 text-sm font-bold text-[var(--black-60)] hover:bg-[var(--black-10)]">Cerrar sesión</button>
      </div>
    </div>
  </div>
</header>
```

- [ ] **Step 2: Poblar avatar y bindear dropdown en `init()` de `js/admin.js`**

Dentro de `init()`, después de `lucide.createIcons()`, añadir:

```js
// Avatar inicial y dropdown
const { data: { user } } = await supabase.auth.getUser()
const initial = (user?.user_metadata?.name || user?.email || '?')[0].toUpperCase()
document.getElementById('avatarInitial').textContent = initial

const avatarBtn = document.getElementById('avatarBtn')
const dropdown  = document.getElementById('avatarDropdown')
avatarBtn.addEventListener('click', (e) => {
  e.stopPropagation()
  dropdown.classList.toggle('hidden')
})
document.addEventListener('click', () => dropdown.classList.add('hidden'))
document.getElementById('dropdownProfile').addEventListener('click', () => {
  dropdown.classList.add('hidden')
  switchPanel('profile')
})
```

- [ ] **Step 3: Eliminar el `logoutBtn` listener duplicado**

Buscar en `init()` la línea:
```js
document.getElementById('logoutBtn').addEventListener('click', logout)
```
Esta línea sigue siendo válida porque `logoutBtn` ahora está en el dropdown — no necesita cambios.

- [ ] **Step 4: Verificar en navegador**

Abrir `admin.html`. El header debe mostrar: logo | Admin / Inicio. A la derecha: "Ver sitio ↗" + círculo con la inicial del email. Hacer clic en el círculo → aparece dropdown con "Mi perfil" y "Cerrar sesión". Navegar a otro panel → el breadcrumb cambia.

- [ ] **Step 5: Commit**

```bash
git add admin.html js/admin.js
git commit -m "feat(admin): header with breadcrumb and avatar dropdown"
```

---

## Task 4: Dashboard — panel Inicio

**Files:**
- Modify: `js/admin.js` — añadir función `renderHomePanel()`

La función consulta 4 counts de Supabase + los últimos 5 registros de `activity_log` en paralelo.

- [ ] **Step 1: Añadir `renderHomePanel()` en `js/admin.js`**

Añadir la función antes de `renderLessonsPanel()`:

```js
async function renderHomePanel() {
  const el = document.getElementById('panel-home')
  el.innerHTML = `<p class="text-sm text-[var(--black-40)] p-6">Cargando...</p>`

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
  const { data: { user } } = await supabase.auth.getUser()
  const name = user?.user_metadata?.name || user?.email?.split('@')[0] || ''

  const today = new Date().toISOString().slice(0, 10)
  const [
    { count: lessonesCount },
    { count: convsCount },
    { count: faqCount },
    { count: glosarioCount },
    { data: activity }
  ] = await Promise.all([
    supabase.from('lecciones').select('*', { count: 'exact', head: true }).eq('active', true),
    supabase.from('bodi_conversations').select('*', { count: 'exact', head: true }).gte('created_at', today),
    supabase.from('preguntas_frecuentes').select('*', { count: 'exact', head: true }),
    supabase.from('glosario').select('*', { count: 'exact', head: true }),
    supabase.from('activity_log').select('action,entity_type,entity_name,created_at').order('created_at', { ascending: false }).limit(5)
  ])

  function timeAgo(iso) {
    const diff = Math.floor((Date.now() - new Date(iso)) / 1000)
    if (diff < 60) return 'hace un momento'
    if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
    return `hace ${Math.floor(diff / 86400)}d`
  }

  const actionLabel = { create: 'Creado', update: 'Editado', delete: 'Eliminado' }
  const entityLabel = {
    lecciones: 'Lección', preguntas_frecuentes: 'FAQ',
    glosario: 'Término', material_apoyo: 'Material'
  }

  el.innerHTML = `
    <div class="max-w-4xl">
      <div class="mb-6">
        <p class="text-lg font-black text-[var(--black-100)]">${greeting} 👋</p>
        <p class="text-sm text-[var(--black-40)] mt-0.5">Esto es lo que está pasando en tu academia.</p>
      </div>

      <div class="grid grid-cols-4 gap-3 mb-6">
        ${[
          ['Lecciones activas',    lessonesCount ?? 0],
          ['Conversaciones hoy',   convsCount    ?? 0],
          ['Preguntas frecuentes', faqCount      ?? 0],
          ['Términos en glosario', glosarioCount ?? 0],
        ].map(([label, val]) => `
          <div class="bg-white border border-[var(--blue-10)] rounded-2xl p-4">
            <p class="text-[9px] font-black uppercase tracking-widest text-[var(--black-40)] mb-1.5">${label}</p>
            <p class="text-2xl font-black text-[var(--blue-100)]">${val}</p>
          </div>
        `).join('')}
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="bg-white border border-[var(--blue-10)] rounded-2xl p-4">
          <p class="text-[9px] font-black uppercase tracking-widest text-[var(--black-100)] mb-3">Actividad reciente</p>
          <div class="space-y-3">
            ${(activity || []).length ? (activity).map(a => `
              <div class="flex gap-3 items-start">
                <div class="w-1.5 h-1.5 rounded-full bg-[var(--blue-100)] mt-1.5 shrink-0"></div>
                <div>
                  <p class="text-xs font-bold text-[var(--black-100)]">${actionLabel[a.action] || a.action} — ${entityLabel[a.entity_type] || a.entity_type}</p>
                  <p class="text-[10px] text-[var(--black-40)]">${escapeHtml(a.entity_name || '')} · ${timeAgo(a.created_at)}</p>
                </div>
              </div>
            `).join('') : '<p class="text-xs text-[var(--black-40)]">Sin actividad reciente.</p>'}
          </div>
        </div>

        <div class="bg-white border border-[var(--blue-10)] rounded-2xl p-4">
          <p class="text-[9px] font-black uppercase tracking-widest text-[var(--black-100)] mb-3">Acciones rápidas</p>
          <div class="space-y-2">
            <button id="quickNewLesson" class="w-full text-left px-4 py-2.5 bg-[var(--background-page)] border border-[var(--blue-10)] rounded-xl text-sm font-bold text-[var(--blue-100)] hover:border-[var(--blue-100)] transition-colors">+ Nueva lección</button>
            <button id="quickNewFaq" class="w-full text-left px-4 py-2.5 bg-[var(--background-page)] border border-[var(--blue-10)] rounded-xl text-sm font-bold text-[var(--blue-100)] hover:border-[var(--blue-100)] transition-colors">+ Nueva pregunta frecuente</button>
            <button id="quickAnalytics" class="w-full text-left px-4 py-2.5 bg-[var(--background-page)] border border-[var(--blue-10)] rounded-xl text-sm font-bold text-[var(--blue-100)] hover:border-[var(--blue-100)] transition-colors">Ver Analytics</button>
          </div>
        </div>
      </div>
    </div>
  `

  document.getElementById('quickNewLesson').addEventListener('click', () => {
    switchPanel('lessons')
    setTimeout(() => document.getElementById('newLessonBtn')?.click(), 300)
  })
  document.getElementById('quickNewFaq').addEventListener('click', () => {
    switchPanel('faq')
    setTimeout(() => document.getElementById('addFaq')?.click(), 300)
  })
  document.getElementById('quickAnalytics').addEventListener('click', () => switchPanel('analytics'))
}
```

- [ ] **Step 2: Verificar en navegador**

Abrir `admin.html` (localStorage limpio o vacío). Debe mostrar el dashboard con las 4 métricas reales desde Supabase y la actividad reciente. Hacer clic en "+ Nueva lección" → navega a Lecciones y abre el modal.

- [ ] **Step 3: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): add home dashboard with metrics and quick actions"
```

---

## Task 5: Editor de lecciones — labels y zonas de bloques

**Files:**
- Modify: `js/admin.js` — sección HTML del `lessonFormModal`, función `blockItemHtml()`

- [ ] **Step 1: Añadir labels a los campos del formulario de lección**

En `js/admin.js`, localizar el bloque de inputs del formulario (alrededor de las líneas con `lessonTitulo`, `lessonDescripcion`, `lessonCategoria`). Reemplazar:

```js
            <div class="space-y-2 mb-4">
              <input id="lessonTitulo" placeholder="Título" required
                class="w-full px-3 py-2.5 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)]">
              <input id="lessonDescripcion" placeholder="Descripción corta" required
                class="w-full px-3 py-2.5 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)]">
              <select id="lessonCategoria"
                class="w-full px-3 py-2.5 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)] bg-white">
              </select>
            </div>
```

Por:

```js
            <div class="space-y-3 mb-4">
              <div>
                <label class="block text-[9px] font-black uppercase tracking-widest text-[var(--black-40)] mb-1">Título</label>
                <input id="lessonTitulo" placeholder="Nombre de la lección" required
                  class="w-full px-3 py-2.5 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)]">
              </div>
              <div>
                <label class="block text-[9px] font-black uppercase tracking-widest text-[var(--black-40)] mb-1">Descripción</label>
                <input id="lessonDescripcion" placeholder="Descripción corta visible al alumno" required
                  class="w-full px-3 py-2.5 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)]">
              </div>
              <div>
                <label class="block text-[9px] font-black uppercase tracking-widest text-[var(--black-40)] mb-1">Categoría</label>
                <select id="lessonCategoria"
                  class="w-full px-3 py-2.5 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)] bg-white">
                </select>
              </div>
            </div>
```

- [ ] **Step 2: Reestructurar zona de agregar bloques**

Localizar el bloque de botones `add-block` (la sección con `<div class="flex flex-wrap gap-1.5 mb-4">`). Reemplazarlo por:

```js
            <div class="border border-dashed border-[var(--blue-20)] rounded-xl p-3 mb-4 space-y-2">
              <div>
                <p class="text-[9px] font-black uppercase tracking-widest text-[var(--black-40)] mb-2">Agregar bloque de contenido</p>
                <div class="flex flex-wrap gap-1.5">
                  <button data-type="step"  class="add-block bg-[var(--blue-10)] text-[var(--blue-100)] text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-[var(--blue-20)]">Paso</button>
                  <button data-type="image" class="add-block bg-[var(--blue-10)] text-[var(--blue-100)] text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-[var(--blue-20)]">Imagen</button>
                  <button data-type="video" class="add-block bg-[var(--blue-10)] text-[var(--blue-100)] text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-[var(--blue-20)]">Video</button>
                  <button data-type="link"  class="add-block bg-[var(--blue-10)] text-[var(--blue-100)] text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-[var(--blue-20)]">Link</button>
                </div>
              </div>
              <div class="border-t border-dashed border-amber-200 pt-2">
                <p class="text-[9px] font-black uppercase tracking-widest text-amber-500 mb-2">Solo para bolbot POS</p>
                <div class="flex flex-wrap gap-1.5">
                  <button data-type="bot_nota"        class="add-block bg-amber-50 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-amber-100">Nota</button>
                  <button data-type="bot_advertencia" class="add-block bg-amber-50 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-amber-100">Advertencia</button>
                  <button data-type="bot_pasos"       class="add-block bg-amber-50 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-amber-100">Pasos internos</button>
                  <button data-type="bot_relacionado" class="add-block bg-amber-50 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-amber-100">Relacionado</button>
                  <button data-type="bot_faq"         class="add-block bg-amber-50 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-amber-100">Pregunta frecuente</button>
                </div>
              </div>
            </div>
```

- [ ] **Step 3: Actualizar `blockItemHtml()` — badge de tipo**

En la función `blockItemHtml`, localizar la línea donde se define `labels` y `cardBg`. Reemplazar:

```js
  const colors = { step: 'var(--blue-100)', image: '#3b82f6', video: '#8b5cf6', link: '#16a34a',
    bot_nota: '#d97706', bot_advertencia: '#d97706', bot_pasos: '#d97706', bot_relacionado: '#d97706', bot_faq: '#d97706' }
  const labels = { step: '📝 Paso', image: '🖼️ Imagen', video: '▶️ Video YouTube', link: '🔗 Link',
    bot_nota: '💡 Nota — bolbot POS', bot_advertencia: '⚠️ Advertencia — bolbot POS',
    bot_pasos: '📋 Pasos internos — bolbot POS', bot_relacionado: '🔗 Relacionado — bolbot POS', bot_faq: '❓ Preg. frecuente — bolbot POS' }
```

Y el `cardBg` que actualmente usa `block.type.startsWith('bot_')`. Localizar esa línea y asegurarse que el resultado de `blockItemHtml` use la clase de borde correcta. Reemplazar la línea del `return` del div principal:

```js
  return `<div data-idx="${i}" class="bg-white border ${block.type?.startsWith('bot_') ? 'border-amber-200' : 'border-[var(--blue-10)]'} rounded-xl p-2.5 flex items-start gap-2">
```

Y reemplazar la línea del badge de tipo (la que muestra el label):
```js
      <div class="inline-block text-[9px] font-black uppercase tracking-wide mb-1.5 px-2 py-0.5 rounded-md ${block.type?.startsWith('bot_') ? 'bg-amber-50 text-amber-700' : 'bg-[var(--blue-10)] text-[var(--blue-100)]'}">${label}</div>
```

- [ ] **Step 4: Verificar en navegador**

Abrir `admin.html` → Lecciones → editar una lección. Confirmar:
- Los campos tienen labels en gris uppercase encima
- Los botones de agregar están divididos en dos grupos dentro de un borde dashed
- Los bloques existentes muestran un badge coloreado (azul para contenido, ámbar para bolbot POS)
- Los bloques bolbot POS tienen borde ámbar

- [ ] **Step 5: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): improve lesson editor with labels, block badges and grouped add-block zones"
```

---

## Task 6: Listado Glosario — buscador + contador + inline edit + botones texto

**Files:**
- Modify: `js/admin.js` — `renderGlossaryPanel()`

- [ ] **Step 1: Reescribir `renderGlossaryPanel()`**

Reemplazar la función completa por:

```js
async function renderGlossaryPanel() {
  const el = document.getElementById('panel-glossary')
  const { data } = await supabase.from('glosario').select('*').order('termino')
  const items = data || []

  function renderList(list) {
    return list.length ? list.map(g => `
      <div data-id="${g.id}" class="glos-item bg-white border border-[var(--blue-10)] rounded-xl px-4 py-3 flex items-center gap-3">
        <div class="flex-1 min-w-0">
          <p class="font-bold text-sm text-[var(--blue-100)]">${escapeHtml(g.termino)}</p>
          <p class="text-xs text-[var(--black-60)] mt-0.5">${escapeHtml(g.definicion)}</p>
        </div>
        <div class="flex gap-1.5 shrink-0">
          <button data-id="${g.id}" data-term="${escapeHtml(g.termino)}" data-def="${escapeHtml(g.definicion)}"
            class="edit-term px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--blue-10)] text-[var(--blue-100)] hover:bg-[var(--blue-20)]">Editar</button>
          <button data-id="${g.id}"
            class="del-term px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--coral-10)] text-[var(--coral-100)] hover:bg-[var(--coral-30)]">Eliminar</button>
        </div>
      </div>
    `).join('') : '<p class="text-[var(--black-40)] text-sm text-center py-6">No hay términos aún.</p>'
  }

  el.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <h2 class="text-lg font-black">Glosario</h2>
        <span class="text-xs font-bold text-[var(--black-40)]">${items.length} términos</span>
      </div>
      <div class="flex gap-2">
        <button id="reembedAllGlossary" class="border border-[var(--blue-20)] text-[var(--blue-100)] px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-[var(--blue-10)] transition-colors">
          <i data-lucide="brain" class="w-3.5 h-3.5"></i> Re-embedear todo
        </button>
        <button id="addTerm" class="bg-[var(--blue-100)] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:scale-105 transition-transform">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i> Nuevo término
        </button>
      </div>
    </div>
    <input id="searchGlosario" type="text" placeholder="🔍  Buscar término..."
      class="w-full px-4 py-2.5 rounded-xl border border-[var(--blue-20)] bg-white text-sm outline-none focus:border-[var(--blue-100)] mb-3">
    <div id="glosarioList" class="space-y-2">
      ${renderList(items)}
    </div>
    <div id="termFormInline" class="hidden mt-3 bg-white rounded-2xl border border-[var(--blue-20)] p-4">
      <input type="hidden" id="termId">
      <label class="block text-[9px] font-black uppercase tracking-widest text-[var(--black-40)] mb-1">Término</label>
      <input id="termTermino" placeholder="Término" required class="w-full px-3 py-2 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)] mb-2">
      <label class="block text-[9px] font-black uppercase tracking-widest text-[var(--black-40)] mb-1">Definición</label>
      <textarea id="termDefinicion" placeholder="Definición" rows="2" required class="w-full px-3 py-2 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)] resize-none mb-2"></textarea>
      <div class="flex gap-2">
        <button id="cancelTerm" class="flex-1 py-2 rounded-xl border border-[var(--blue-20)] text-sm font-bold text-[var(--black-60)]">Cancelar</button>
        <button id="saveTerm" class="flex-1 py-2 rounded-xl bg-[var(--blue-100)] text-white text-sm font-bold">Guardar</button>
      </div>
    </div>
  `
  lucide.createIcons()

  document.getElementById('searchGlosario').addEventListener('input', e => {
    const q = e.target.value.toLowerCase()
    const filtered = items.filter(g => g.termino.toLowerCase().includes(q) || g.definicion.toLowerCase().includes(q))
    document.getElementById('glosarioList').innerHTML = renderList(filtered)
    bindGlosarioActions()
  })

  function showForm(id = '', term = '', def = '') {
    document.getElementById('termId').value = id
    document.getElementById('termTermino').value = term
    document.getElementById('termDefinicion').value = def
    document.getElementById('termFormInline').classList.remove('hidden')
    document.getElementById('termTermino').focus()
    // highlight active item
    document.querySelectorAll('.glos-item').forEach(el => el.classList.remove('!border-[var(--blue-100)]'))
    if (id) document.querySelector(`.glos-item[data-id="${id}"]`)?.classList.add('!border-[var(--blue-100)]')
  }

  function bindGlosarioActions() {
    document.querySelectorAll('.edit-term').forEach(b => b.addEventListener('click', () =>
      showForm(b.dataset.id, b.dataset.term, b.dataset.def)))
    document.querySelectorAll('.del-term').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este término?')) return
      await supabase.from('glosario').delete().eq('id', b.dataset.id)
      renderGlossaryPanel()
    }))
  }

  document.getElementById('addTerm').addEventListener('click', () => showForm())
  document.getElementById('cancelTerm').addEventListener('click', () => {
    document.getElementById('termFormInline').classList.add('hidden')
    document.querySelectorAll('.glos-item').forEach(el => el.classList.remove('!border-[var(--blue-100)]'))
  })
  document.getElementById('saveTerm').addEventListener('click', async () => {
    const btn = document.getElementById('saveTerm')
    btn.disabled = true; btn.textContent = 'Guardando...'
    const id = document.getElementById('termId').value
    const payload = {
      termino:    document.getElementById('termTermino').value.trim(),
      definicion: document.getElementById('termDefinicion').value.trim(),
    }
    let savedId = id
    const { data: saved, error } = id
      ? await supabase.from('glosario').update(payload).eq('id', id).select('id').single()
      : await supabase.from('glosario').insert(payload).select('id').single()
    if (error) { alert('Error al guardar: ' + error.message); btn.disabled = false; btn.textContent = 'Guardar'; return }
    if (saved?.id) savedId = saved.id
    embedGlosarioTerm(savedId, payload.termino, payload.definicion)
    renderGlossaryPanel()
  })

  document.getElementById('reembedAllGlossary').addEventListener('click', async () => {
    const btn = document.getElementById('reembedAllGlossary')
    if (!items.length) return
    btn.disabled = true; btn.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Embeddando...'
    lucide.createIcons()
    let ok = 0
    for (const g of items) { if (await embedGlosarioTerm(g.id, g.termino, g.definicion)) ok++ }
    btn.disabled = false; btn.innerHTML = '<i data-lucide="brain" class="w-3.5 h-3.5"></i> Re-embedear todo'
    lucide.createIcons()
    showToast(`${ok}/${items.length} términos embeddados.`, ok === items.length ? 'success' : 'error')
  })

  bindGlosarioActions()
}
```

- [ ] **Step 2: Verificar en navegador**

Abrir Glosario. Confirmar: contador de términos, buscador funcional, botones "Editar" y "Eliminar" con texto, formulario inline aparece al hacer clic en Editar, el ítem activo resalta con borde azul.

- [ ] **Step 3: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): glossary panel with search, counter and inline edit"
```

---

## Task 7: Listado P. Frecuentes — buscador + contador + inline edit + botones texto

**Files:**
- Modify: `js/admin.js` — `renderFaqPanel()`

- [ ] **Step 1: Reescribir `renderFaqPanel()`**

Reemplazar la función completa por:

```js
async function renderFaqPanel() {
  const el = document.getElementById('panel-faq')
  const { data } = await supabase.from('preguntas_frecuentes').select('*').order('orden').order('created_at')
  const items = data || []

  function renderList(list) {
    return list.length ? list.map(f => `
      <div data-id="${f.id}" class="faq-item bg-white border border-[var(--blue-10)] rounded-xl px-4 py-3 flex items-start gap-3">
        <div class="flex-1 min-w-0">
          <p class="font-bold text-sm text-[var(--blue-100)]">${escapeHtml(f.pregunta)}</p>
          <p class="text-xs text-[var(--black-60)] mt-0.5 line-clamp-2">${escapeHtml(f.respuesta)}</p>
        </div>
        <div class="flex gap-1.5 shrink-0">
          <button data-id="${f.id}" data-pregunta="${escapeHtml(f.pregunta)}" data-respuesta="${escapeHtml(f.respuesta)}"
            class="edit-faq px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--blue-10)] text-[var(--blue-100)] hover:bg-[var(--blue-20)]">Editar</button>
          <button data-id="${f.id}" data-pregunta="${escapeHtml(f.pregunta)}"
            class="del-faq px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--coral-10)] text-[var(--coral-100)] hover:bg-[var(--coral-30)]">Eliminar</button>
        </div>
      </div>
    `).join('') : '<p class="text-[var(--black-40)] text-sm text-center py-6">No hay preguntas aún.</p>'
  }

  el.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <h2 class="text-lg font-black">Preguntas Frecuentes</h2>
        <span class="text-xs font-bold text-[var(--black-40)]">${items.length} preguntas</span>
      </div>
      <div class="flex gap-2">
        <button id="reembedAllFaq" class="border border-[var(--blue-20)] text-[var(--blue-100)] px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-[var(--blue-10)] transition-colors">
          <i data-lucide="brain" class="w-3.5 h-3.5"></i> Re-embedear todo
        </button>
        <button id="addFaq" class="bg-[var(--blue-100)] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:scale-105 transition-transform">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i> Nueva pregunta
        </button>
      </div>
    </div>
    <input id="searchFaq" type="text" placeholder="🔍  Buscar pregunta..."
      class="w-full px-4 py-2.5 rounded-xl border border-[var(--blue-20)] bg-white text-sm outline-none focus:border-[var(--blue-100)] mb-3">
    <div id="faqList" class="space-y-2">
      ${renderList(items)}
    </div>
    <div id="faqFormInline" class="hidden mt-3 bg-white rounded-2xl border border-[var(--blue-20)] p-4">
      <input type="hidden" id="faqId">
      <label class="block text-[9px] font-black uppercase tracking-widest text-[var(--black-40)] mb-1">Pregunta</label>
      <input id="faqPregunta" placeholder="Pregunta frecuente" required class="w-full px-3 py-2 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)] mb-2">
      <label class="block text-[9px] font-black uppercase tracking-widest text-[var(--black-40)] mb-1">Respuesta</label>
      <textarea id="faqRespuesta" placeholder="Respuesta" rows="3" required class="w-full px-3 py-2 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)] resize-none mb-2"></textarea>
      <p id="faqFormError" class="hidden text-red-500 text-xs mb-2"></p>
      <div class="flex gap-2">
        <button id="cancelFaq" class="flex-1 py-2 rounded-xl border border-[var(--blue-20)] text-sm font-bold text-[var(--black-60)]">Cancelar</button>
        <button id="saveFaq" class="flex-1 py-2 rounded-xl bg-[var(--blue-100)] text-white text-sm font-bold">Guardar</button>
      </div>
    </div>
  `
  lucide.createIcons()

  document.getElementById('searchFaq').addEventListener('input', e => {
    const q = e.target.value.toLowerCase()
    const filtered = items.filter(f => f.pregunta.toLowerCase().includes(q) || f.respuesta.toLowerCase().includes(q))
    document.getElementById('faqList').innerHTML = renderList(filtered)
    bindFaqActions()
  })

  function showFaqForm(id = '', pregunta = '', respuesta = '') {
    document.getElementById('faqId').value = id
    document.getElementById('faqPregunta').value = pregunta
    document.getElementById('faqRespuesta').value = respuesta
    document.getElementById('faqFormError').classList.add('hidden')
    document.getElementById('faqFormInline').classList.remove('hidden')
    document.getElementById('faqPregunta').focus()
    document.querySelectorAll('.faq-item').forEach(el => el.classList.remove('!border-[var(--blue-100)]'))
    if (id) document.querySelector(`.faq-item[data-id="${id}"]`)?.classList.add('!border-[var(--blue-100)]')
  }

  function bindFaqActions() {
    document.querySelectorAll('.edit-faq').forEach(b => b.addEventListener('click', () =>
      showFaqForm(b.dataset.id, b.dataset.pregunta, b.dataset.respuesta)))
    document.querySelectorAll('.del-faq').forEach(b => b.addEventListener('click', async () => {
      if (!confirm(`¿Eliminar "${b.dataset.pregunta}"?`)) return
      await supabase.from('preguntas_frecuentes').delete().eq('id', b.dataset.id)
      logActivity('delete', 'preguntas_frecuentes', b.dataset.pregunta)
      renderFaqPanel()
    }))
  }

  document.getElementById('addFaq').addEventListener('click', () => showFaqForm())
  document.getElementById('cancelFaq').addEventListener('click', () => {
    document.getElementById('faqFormInline').classList.add('hidden')
    document.querySelectorAll('.faq-item').forEach(el => el.classList.remove('!border-[var(--blue-100)]'))
  })
  document.getElementById('saveFaq').addEventListener('click', async () => {
    const btn = document.getElementById('saveFaq')
    const errorEl = document.getElementById('faqFormError')
    errorEl.classList.add('hidden')
    const id = document.getElementById('faqId').value
    const pregunta = document.getElementById('faqPregunta').value.trim()
    const respuesta = document.getElementById('faqRespuesta').value.trim()
    if (!pregunta || !respuesta) { errorEl.textContent = 'La pregunta y respuesta son requeridas.'; errorEl.classList.remove('hidden'); return }
    btn.disabled = true; btn.textContent = 'Guardando...'
    let savedId = id
    const { data: saved, error } = id
      ? await supabase.from('preguntas_frecuentes').update({ pregunta, respuesta }).eq('id', id).select('id').single()
      : await supabase.from('preguntas_frecuentes').insert({ pregunta, respuesta }).select('id').single()
    if (error) { errorEl.textContent = 'Error: ' + error.message; errorEl.classList.remove('hidden'); btn.disabled = false; btn.textContent = 'Guardar'; return }
    if (saved?.id) savedId = saved.id
    logActivity(id ? 'update' : 'create', 'preguntas_frecuentes', pregunta)
    embedFaqItem(savedId, pregunta, respuesta)
    renderFaqPanel()
  })

  document.getElementById('reembedAllFaq').addEventListener('click', async () => {
    const btn = document.getElementById('reembedAllFaq')
    if (!items.length) return
    btn.disabled = true; btn.innerHTML = '<i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> Embeddando...'
    lucide.createIcons()
    let ok = 0
    for (const f of items) { if (await embedFaqItem(f.id, f.pregunta, f.respuesta)) ok++ }
    btn.disabled = false; btn.innerHTML = '<i data-lucide="brain" class="w-3.5 h-3.5"></i> Re-embedear todo'
    lucide.createIcons()
    showToast(`${ok}/${items.length} preguntas embeddadas.`, ok === items.length ? 'success' : 'error')
  })

  bindFaqActions()
}
```

- [ ] **Step 2: Verificar en navegador**

Abrir P. Frecuentes. Confirmar buscador, contador, botones con texto, form inline.

- [ ] **Step 3: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): FAQ panel with search, counter and inline edit"
```

---

## Task 8: Listado Material de apoyo — buscador + contador + botones texto

**Files:**
- Modify: `js/admin.js` — `renderMaterialApoyoPanel()`

- [ ] **Step 1: Actualizar header y agregar buscador en `renderMaterialApoyoPanel()`**

Localizar en `renderMaterialApoyoPanel()` el bloque del header (el `<div class="flex items-center justify-between mb-4">`). Reemplazar por:

```js
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <h2 class="text-lg font-black">Material de apoyo</h2>
        <span class="text-xs font-bold text-[var(--black-40)]">${(data || []).length} recursos</span>
      </div>
      <button id="addMatApoyo" class="bg-[var(--blue-100)] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:scale-105 transition-transform">
        <i data-lucide="plus" class="w-3.5 h-3.5"></i> Nuevo recurso
      </button>
    </div>
    <input id="searchMatApoyo" type="text" placeholder="🔍  Buscar recurso..."
      class="w-full px-4 py-2.5 rounded-xl border border-[var(--blue-20)] bg-white text-sm outline-none focus:border-[var(--blue-100)] mb-3">
```

- [ ] **Step 2: Reemplazar botones de icono por botones con texto**

En la misma función, localizar los botones `.edit-mat-apoyo` y `.del-mat-apoyo`. Reemplazar su HTML por:

```js
          <button data-id="${m.id}" data-titulo="${escapeHtml(m.titulo)}" data-url="${escapeHtml(m.url)}" data-tipo="${m.tipo}"
            class="edit-mat-apoyo px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--blue-10)] text-[var(--blue-100)] hover:bg-[var(--blue-20)]">Editar</button>
          <button data-id="${m.id}" data-titulo="${escapeHtml(m.titulo)}"
            class="del-mat-apoyo px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--coral-10)] text-[var(--coral-100)] hover:bg-[var(--coral-30)]">Eliminar</button>
```

- [ ] **Step 3: Agregar buscador funcional**

Después de `lucide.createIcons()` dentro de `renderMaterialApoyoPanel`, añadir:

```js
  document.getElementById('searchMatApoyo')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase()
    document.querySelectorAll('.mat-apoyo-item').forEach(item => {
      item.style.display = item.dataset.titulo?.toLowerCase().includes(q) ? '' : 'none'
    })
  })
```

Y añadir `data-titulo="${escapeHtml(m.titulo)}"` y la clase `mat-apoyo-item` al div wrapper de cada ítem.

- [ ] **Step 4: Verificar en navegador**

Abrir Mat. de apoyo. Confirmar: contador, buscador funcional, botones "Editar" y "Eliminar" con texto.

- [ ] **Step 5: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): material de apoyo panel with search, counter and text buttons"
```

---

## Verificación final

- [ ] Navegar por todos los paneles del admin y confirmar que el sidebar activo resalta correctamente.
- [ ] Confirmar que el breadcrumb cambia en cada panel.
- [ ] Verificar que el dropdown del avatar cierra al hacer clic fuera.
- [ ] Abrir una lección y crear un bloque de cada tipo — verificar badge de color correcto.
- [ ] Crear, editar y eliminar un término del glosario y una FAQ.
- [ ] Confirmar que ningún texto visible dice "Bodi" (solo "bolbot POS").

```bash
git push
```
