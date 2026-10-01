import { supabase } from './supabase.js'
import { renderBlocks } from './block-renderer.js'
import { parseLessonBlocks } from './lesson-blocks.js'
import { track } from './analytics.js'
import { copyLessonToWhatsApp } from './whatsapp-copy.js'
import { escapeHtml, isStaff } from './utils.js'
import { VERTICALES, PLATAFORMAS, getSeleccion, setSeleccion, filtrarPorSeleccion, plataformasHabilitadas, verticalesVisibles, resolverSeleccion } from './vertical.js'
import { onContextoBold, seleccionDesdeContexto, getContextoBold } from './bold-context.js'
import { crearSuscripcionReanudable } from './realtime-lifecycle.js'
import { createReadingTracker } from './reading-tracker.js'
import { loadSettings, loadVisibilityOverrides } from './settings.js'
import { aplicarVisibilidad, visibles } from './lesson-visibility.js'
import { APP_ENV } from './env.js'

// Telemetría de lectura: un tracker por sesión de portal. Se arranca al abrir
// una lección y se vacía al salir de la pestaña u ocultar la página.
const readingTracker = createReadingTracker({ track, now: () => Date.now() })
window.lessonsFlushReading = () => readingTracker.flush('tab')
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') readingTracker.flush('hidden')
})
window.addEventListener('pagehide', () => readingTracker.flush('pagehide'))

// Las categorías se muestran sin emojis (pueden venir en la columna emoji o
// incrustados en el nombre); las claves internas de agrupación no se tocan.
const stripEmoji = s => (s || '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').trim()

async function renderLessons() {
  const container = document.getElementById('section-lessons')

  container.innerHTML = '<div class="flex items-center justify-center h-full text-[var(--black-60)] text-sm">Cargando lecciones...</div>'

  // En prod el filtro sigue siendo del servidor: así el portal real NO recibe
  // ni una lección oculta, y ningún error en el merge podría exponerla. Fuera
  // de prod hay que traerlas todas, porque lecciones.active es el valor de
  // producción y el que manda es el override del entorno.
  const leccionesQuery = APP_ENV === 'prod'
    ? supabase.from('lecciones').select('*').eq('active', true).order('orden')
    : supabase.from('lecciones').select('*').order('orden')

  const [lessonsRes, catsRes, loadedSettings, overrides] = await Promise.all([
    leccionesQuery,
    supabase.from('categorias').select('*').order('orden'),
    loadSettings(),
    loadVisibilityOverrides(),
  ])
  let allLessons = visibles(aplicarVisibilidad(lessonsRes.data, overrides, APP_ENV))
  let settings = loadedSettings
  const seleccionGuardada = getSeleccion()
  let sel = resolverSeleccion(allLessons, settings, seleccionGuardada, { verticalFija: verticalFijadaPorBold() })
  if (sel.vertical !== seleccionGuardada.vertical || sel.plataforma !== seleccionGuardada.plataforma) {
    setSeleccion(sel)
  }
  let lessons = filtrarPorSeleccion(allLessons, sel)
  const error = lessonsRes.error
  const cats  = catsRes.data
  const CATEGORIES = (cats || []).map(c => ({ key: c.nombre, emoji: c.emoji }))

  if (error) console.error('[lessons] Supabase error:', error)
  if (error || !allLessons.length) {
    container.innerHTML = '<p class="text-[var(--black-60)] text-sm text-center pt-16">No hay lecciones disponibles.</p>'
    return
  }

  // Group by category
  const grouped = {}
  function rebuildGrouped() {
    for (const key of Object.keys(grouped)) delete grouped[key]
    for (const cat of CATEGORIES) grouped[cat.key] = []
    for (const l of lessons) {
      const cat = l.categoria || CATEGORIES[0]?.key || 'General'
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(l)
    }
  }
  rebuildGrouped()

  // Bold POS nos dice la vertical del comercio, así que elegirla a mano no tiene
  // sentido: se oculta la tarjeta. El chip Web/Mobile SÍ se queda — Bold no manda
  // `platform` (va fijo en 'web'), y sin el chip nadie podría llegar a las
  // lecciones Mobile. ?staff=1 devuelve el selector para que soporte pueda
  // revisar la vertical contraria.
  function verticalFijadaPorBold() {
    return !!getContextoBold()?.vertical && !isStaff()
  }

  // Selector de vertical (tarjetas con icono) + plataforma (chips).
  // Mismo markup en móvil y desktop; se regenera al cambiar la selección.
  function selectorHtml() {
    const verticalesShown  = VERTICALES.filter(v => verticalesVisibles(allLessons, settings).includes(v.key))
    const plataformasShown = PLATAFORMAS.filter(p => plataformasHabilitadas(settings, sel.vertical).includes(p.key))
    const showVerticales  = verticalesShown.length >= 2 && !verticalFijadaPorBold()
    const showPlataformas = plataformasShown.length >= 2

    if (!showVerticales && !showPlataformas) return ''

    return `
      <div class="px-3 pt-3 pb-2 border-b border-[var(--blue-10)] bg-white">
        ${showVerticales ? `
        <div class="flex gap-2">
          ${verticalesShown.map(v => `
            <button data-vertical="${v.key}"
              class="sel-vertical flex-1 rounded-xl border-[1.5px] px-2 py-2 text-center transition-colors ${v.key === sel.vertical
                ? 'border-[var(--blue-100)] bg-[var(--blue-10)] text-[var(--blue-100)]'
                : 'border-[var(--blue-20)] text-[var(--black-60)] hover:border-[var(--blue-100)]'}">
              <i data-lucide="${v.icon}" class="w-4 h-4 mx-auto mb-0.5"></i>
              <span class="block text-[11px] font-black">${v.label}</span>
            </button>`).join('')}
        </div>` : ''}
        ${showPlataformas ? `
        <div class="flex gap-2 ${showVerticales ? 'mt-2' : ''}">
          ${plataformasShown.map(p => `
            <button data-plataforma="${p.key}"
              class="sel-plataforma px-4 py-1 rounded-full text-[11px] font-bold border transition-colors ${p.key === sel.plataforma
                ? 'bg-[var(--blue-100)] border-[var(--blue-100)] text-white'
                : 'border-[var(--blue-20)] text-[var(--black-60)] hover:border-[var(--blue-100)]'}">${p.label}</button>`).join('')}
        </div>` : ''}
      </div>`
  }

  const firstCat = CATEGORIES.find(c => grouped[c.key]?.length > 0)?.key || CATEGORIES[0]?.key
  let activeCategory = firstCat
  let activeLesson = grouped[firstCat]?.[0] || null
  let searchQuery = ''
  // Acordeón desktop: categorías abiertas (toggle manual, varias a la vez)
  const openCats = new Set(firstCat ? [firstCat] : [])

  container.innerHTML = `
    <!-- MOBILE: 3-screen stack (hidden on md+) -->
    <div class="md:hidden absolute inset-0">
      <div id="ls-screen-categories" class="absolute inset-0 flex flex-col bg-white">
        <div class="px-4 py-3 border-b border-[var(--blue-10)] shrink-0">
          <h2 class="font-black text-base text-[var(--blue-100)]">Centro de Ayuda</h2>
        </div>
        <div id="ls-selector-mob"></div>
        <!-- Búsqueda global: filtra lecciones de todas las categorías desde la pantalla inicial -->
        <div class="px-3 py-2 border-b border-[var(--blue-10)] shrink-0">
          <div class="flex items-center gap-2 bg-[var(--background-page)] rounded-xl px-3 py-2">
            <span class="text-[var(--black-60)] text-sm">🔍</span>
            <input id="ls-cat-search" placeholder="Buscar lección..." class="bg-transparent text-base flex-1 outline-none">
          </div>
        </div>
        <div id="ls-cat-list" class="flex-1 overflow-y-auto"></div>
      </div>

      <div id="ls-screen-lessons" class="absolute inset-0 flex-col bg-white hidden">
        <div class="bg-[var(--blue-100)] px-4 py-3 flex items-center gap-3 shrink-0">
          <button id="ls-back-cats" class="text-white/80 text-2xl font-bold leading-none">‹</button>
          <span id="ls-mob-cat-title" class="text-white font-black text-sm flex-1"></span>
        </div>
        <div class="px-3 py-2 border-b border-[var(--blue-10)] shrink-0">
          <div class="flex items-center gap-2 bg-[var(--background-page)] rounded-xl px-3 py-2">
            <span class="text-[var(--black-60)] text-sm">🔍</span>
            <input id="ls-mob-search" placeholder="Buscar lección..." class="bg-transparent text-base flex-1 outline-none">
          </div>
        </div>
        <div id="ls-lesson-list" class="flex-1 overflow-y-auto"></div>
      </div>

      <div id="ls-screen-content" class="absolute inset-0 flex-col bg-[var(--background-page)] hidden">
        <div class="bg-[var(--blue-100)] px-4 py-3 flex items-center gap-3 shrink-0">
          <button id="ls-back-lessons" class="text-white/80 text-2xl font-bold leading-none">‹</button>
          <span id="ls-mob-lesson-title" class="text-white font-black text-sm flex-1 truncate"></span>
        </div>
        <div id="ls-mob-content" class="flex-1 overflow-y-auto p-4 custom-scroll"></div>
      </div>
    </div>

    <!-- DESKTOP: sidebar + content panel (hidden below md) -->
    <div class="hidden md:flex absolute inset-0">
      <div class="w-48 bg-white border-r border-[var(--blue-10)] flex flex-col shrink-0">
        <div id="ls-selector-desk"></div>
        <div class="p-2.5 border-b border-[var(--blue-10)] shrink-0">
          <div class="flex items-center gap-2 bg-[var(--background-page)] rounded-xl px-3 py-2">
            <span class="text-[var(--black-60)] text-xs">🔍</span>
            <input id="ls-desk-search" placeholder="Buscar..." class="bg-transparent text-xs flex-1 outline-none">
          </div>
        </div>
        <div id="ls-accordion" class="flex-1 overflow-y-auto custom-scroll"></div>
      </div>
      <div id="ls-desk-content" class="flex-1 overflow-y-auto p-5 bg-[var(--background-page)] custom-scroll"></div>
    </div>
  `

  track('page_view', { page: 'lessons', ...sel })

  // ── Render lesson content ─────────────────────────────────────────────────
  function renderLessonContent(panel, lesson) {
    panel.innerHTML = ''
    track('lesson_open', { lesson_id: lesson.id, lesson_title: lesson.titulo || '', category: lesson.categoria || '', ...sel })

    // Columna de lectura centrada: líneas más cortas cansan menos la vista
    const inner = document.createElement('div')
    inner.style.cssText = 'max-width:720px;margin:0 auto'
    panel.appendChild(inner)

    const catLessons = grouped[lesson.categoria || CATEGORIES[0]?.key] || []
    const idx = catLessons.findIndex(l => l.id === lesson.id)
    const lessonIdx = idx >= 0 ? idx + 1 : '?'

    const blocks = parseLessonBlocks(lesson.contenido)

    let topVideo = null, restBlocks = blocks
    if (blocks[0]?.type === 'video') { topVideo = blocks[0]; restBlocks = blocks.slice(1) }
    if (topVideo) inner.appendChild(renderBlocks([topVideo]))

    const titleEl = document.createElement('h2')
    titleEl.className = 'font-black text-base text-[var(--blue-100)] mb-0.5'
    titleEl.textContent = lesson.titulo

    const metaEl = document.createElement('p')
    metaEl.className = 'text-xs text-[var(--black-60)] mb-4'
    metaEl.textContent = `${stripEmoji(lesson.categoria || '')} · Lección ${lessonIdx}`

    inner.append(titleEl, metaEl)

    // El contenido legacy ya viene como bloque html desde parseLessonBlocks:
    // no hace falta una rama aparte acá.
    if (restBlocks.length > 0) {
      inner.appendChild(renderBlocks(restBlocks))
    }

    if (lesson.notas) {
      const notasWrap = document.createElement('div')
      notasWrap.style.cssText = 'margin-top:16px;background:var(--warning-10);border-left:3px solid var(--warning-100);border-radius:8px;padding:12px 14px'
      const notasTitle = document.createElement('p')
      notasTitle.style.cssText = 'font-size:11px;font-weight:900;color:var(--warning-150);margin-bottom:6px'
      notasTitle.textContent = '📝 Notas'
      const notasText = document.createElement('p')
      notasText.style.cssText = 'font-size:12px;color:var(--warning-200);line-height:1.5'
      notasText.textContent = lesson.notas
      notasWrap.append(notasTitle, notasText)
      inner.append(notasWrap)
    }

    // Herramienta interna: visible solo para el equipo (abrir el portal una vez
    // con ?staff=1; ?staff=0 lo desactiva). Botón compacto y centrado.
    if (isStaff()) {
      const waBtn = document.createElement('button')
      waBtn.style.cssText = 'margin:16px auto 0;padding:8px 18px;border-radius:9999px;background:#25D366;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;border:none'
      waBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> Copiar para WhatsApp'
      waBtn.addEventListener('click', () => copyLessonToWhatsApp(lesson, waBtn))
      inner.append(waBtn)
    }

    const selRead = getSeleccion()
    readingTracker.start(panel, {
      lesson_id: lesson.id,
      lesson_title: lesson.titulo || '',
      category: lesson.categoria || '',
      vertical: selRead.vertical,
      plataforma: selRead.plataforma,
    })
  }

  // ── Desktop: accordion ────────────────────────────────────────────────────
  function renderAccordion() {
    const accordion = document.getElementById('ls-accordion')
    if (!accordion) return

    if (!lessons.length) {
      accordion.innerHTML = emptyStateHtml()
      accordion.querySelector('[data-goto-plataforma]')?.addEventListener('click', e =>
        applySeleccion({ plataforma: e.currentTarget.dataset.gotoPlataforma }))
      return
    }

    accordion.innerHTML = CATEGORIES
      .filter(c => grouped[c.key]?.length > 0)
      .map(cat => {
        const catLessons = grouped[cat.key] || []
        const q = searchQuery.toLowerCase()
        const filtered = q
          ? catLessons.filter(l =>
              l.titulo.toLowerCase().includes(q) ||
              (l.descripcion || '').toLowerCase().includes(q))
          : catLessons
        // Buscando: se abren las categorías con resultados; sin búsqueda,
        // cada categoría se abre/cierra manualmente (toggle).
        const isOpen = q ? filtered.length > 0 : openCats.has(cat.key)

        const lessonRows = isOpen ? `
          <div>
            ${filtered.map(l => {
              const isActive = activeLesson?.id === l.id
              return `<button
                class="acc-lesson w-full text-left px-4 py-2.5 text-xs border-b border-[var(--blue-10)] hover:bg-[var(--blue-10)] transition-colors ${isActive ? 'bg-[var(--blue-10)] border-l-2 border-l-[var(--blue-100)]' : ''}"
                data-id="${l.id}">
                <span class="${isActive ? 'font-bold text-[var(--blue-100)]' : 'text-[var(--black-60)]'}">${escapeHtml(l.titulo)}</span>
              </button>`
            }).join('')}
            ${filtered.length === 0 && q ? '<p class="text-xs text-[var(--black-60)] px-4 py-2">Sin resultados</p>' : ''}
          </div>` : ''

        return `
          <div>
            <button class="acc-cat w-full flex items-center justify-between px-3 py-2.5 border-b border-[var(--blue-10)] hover:bg-[var(--black-10)] transition-colors" data-cat="${escapeHtml(cat.key)}">
              <span class="text-xs font-black ${isOpen ? 'text-[var(--blue-100)]' : 'text-[var(--black-60)]'}">${escapeHtml(stripEmoji(cat.key))}</span>
              <span class="text-[10px] ${isOpen ? 'text-[var(--blue-100)]' : 'text-[var(--black-40)]'}">${isOpen ? '▾' : '▸'}</span>
            </button>
            ${lessonRows}
          </div>`
      }).join('')

    accordion.querySelectorAll('.acc-cat').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.cat
        if (openCats.has(key)) openCats.delete(key)
        else { openCats.add(key); activeCategory = key }
        renderAccordion()
      })
    })

    accordion.querySelectorAll('.acc-lesson').forEach(btn => {
      btn.addEventListener('click', () => {
        activeLesson = lessons.find(l => String(l.id) === btn.dataset.id) || null
        renderAccordion()
        renderDeskContent()
      })
    })
  }

  function renderDeskContent() {
    const panel = document.getElementById('ls-desk-content')
    if (!panel) return
    if (!activeLesson) {
      panel.innerHTML = '<p class="text-[var(--black-60)] text-sm">Selecciona una lección.</p>'
      return
    }
    renderLessonContent(panel, activeLesson)
  }

  let searchDebounce = null
  document.getElementById('ls-desk-search')?.addEventListener('input', e => {
    clearTimeout(searchDebounce)
    searchQuery = e.target.value
    renderAccordion()
    const term = searchQuery.trim()
    if (term) {
      searchDebounce = setTimeout(() => {
        const filtered = Object.values(grouped).flat().filter(l =>
          l.titulo.toLowerCase().includes(term.toLowerCase()) ||
          (l.descripcion || '').toLowerCase().includes(term.toLowerCase()))
        track('lesson_search', { term, results_count: filtered.length })
      }, 600)
    }
  })

  // ── Mobile: screens ───────────────────────────────────────────────────────
  function showScreen(name) {
    ['categories', 'lessons', 'content'].forEach(s => {
      const el = document.getElementById(`ls-screen-${s}`)
      if (!el) return
      if (s === name) { el.classList.remove('hidden'); el.classList.add('flex') }
      else            { el.classList.add('hidden');    el.classList.remove('flex') }
    })
  }

  function renderMobileCatList() {
    const list = document.getElementById('ls-cat-list')
    if (!list) return
    list.innerHTML = ''
    if (!lessons.length) {
      list.innerHTML = emptyStateHtml()
      list.querySelector('[data-goto-plataforma]')?.addEventListener('click', e =>
        applySeleccion({ plataforma: e.currentTarget.dataset.gotoPlataforma }))
      return
    }
    CATEGORIES.filter(c => grouped[c.key]?.length > 0).forEach(cat => {
      const btn = document.createElement('button')
      btn.className = 'w-full flex items-center gap-3 px-4 py-3.5 border-b border-[var(--blue-10)] text-left hover:bg-[var(--black-10)] transition-colors'
      btn.innerHTML = `
        <span class="font-bold text-sm flex-1 text-[var(--black-100)]">${escapeHtml(stripEmoji(cat.key))}</span>
        <span class="text-[var(--black-40)] text-xl">›</span>`
      btn.addEventListener('click', () => {
        activeCategory = cat.key
        renderMobileLessonList()
        showScreen('lessons')
      })
      list.append(btn)
    })
  }

  // Estado vacío por combinación: mensaje + salto a la otra plataforma.
  function emptyStateHtml() {
    const habilitadas = plataformasHabilitadas(settings, sel.vertical)
    const otra = PLATAFORMAS.find(p => p.key !== sel.plataforma && habilitadas.includes(p.key))
    const vLabel = VERTICALES.find(v => v.key === sel.vertical)?.label || ''
    return `
      <div class="flex flex-col items-center justify-center py-14 px-4 text-center">
        <p class="font-bold text-sm text-[var(--black-100)] mb-1">Aún no hay lecciones aquí</p>
        <p class="text-xs text-[var(--black-60)] mb-4">Estamos preparando el contenido de ${escapeHtml(vLabel)} para ${escapeHtml(sel.plataforma === 'web' ? 'Web' : 'la app móvil')}.</p>
        ${otra ? `<button data-goto-plataforma="${otra.key}" class="px-4 py-2 rounded-full bg-[var(--blue-100)] text-white text-xs font-bold">Ver lecciones de ${otra.label}</button>` : ''}
      </div>`
  }

  function renderSelectors() {
    for (const id of ['ls-selector-mob', 'ls-selector-desk']) {
      const el = document.getElementById(id)
      if (!el) continue
      el.innerHTML = selectorHtml()
      el.querySelectorAll('.sel-vertical').forEach(b =>
        b.addEventListener('click', () => applySeleccion({ vertical: b.dataset.vertical })))
      el.querySelectorAll('.sel-plataforma').forEach(b =>
        b.addEventListener('click', () => applySeleccion({ plataforma: b.dataset.plataforma })))
    }
    if (window.lucide) lucide.createIcons()
  }

  function applySeleccion(cambio, { origen = 'usuario' } = {}) {
    const previo = sel
    setSeleccion(cambio)
    sel = resolverSeleccion(allLessons, settings, getSeleccion(), { verticalFija: verticalFijadaPorBold() })
    searchQuery = ''
    for (const id of ['ls-desk-search', 'ls-cat-search', 'ls-mob-search']) {
      const inp = document.getElementById(id)
      if (inp) inp.value = ''
    }
    lessons = filtrarPorSeleccion(allLessons, sel)
    rebuildGrouped()
    activeLesson = null
    activeCategory = CATEGORIES.find(c => grouped[c.key]?.length > 0)?.key || CATEGORIES[0]?.key
    openCats.clear()
    if (activeCategory) openCats.add(activeCategory)
    renderSelectors()
    renderAccordion()
    renderMobileCatList()
    renderDeskContent()
    showScreen('categories')
    if (sel.vertical !== previo.vertical || sel.plataforma !== previo.plataforma) {
      track('vertical_change', { vertical: sel.vertical, plataforma: sel.plataforma, origen })
    }
  }

  function renderMobileLessonList() {
    const list = document.getElementById('ls-lesson-list')
    if (!list) return

    const titleEl = document.getElementById('ls-mob-cat-title')
    if (titleEl) titleEl.textContent = stripEmoji(activeCategory)

    const q = document.getElementById('ls-mob-search')?.value?.toLowerCase() || ''
    const filtered = (grouped[activeCategory] || []).filter(l =>
      !q || l.titulo.toLowerCase().includes(q) || (l.descripcion || '').toLowerCase().includes(q))

    list.innerHTML = ''
    filtered.forEach(l => {
      const isActive = activeLesson?.id === l.id
      const btn = document.createElement('button')
      btn.className = `w-full text-left px-4 py-3.5 border-b border-[var(--blue-10)] hover:bg-[var(--black-10)] transition-colors ${isActive ? 'border-l-2 border-l-[var(--blue-100)] bg-[var(--blue-10)]' : ''}`
      const row = document.createElement('div')
      row.className = 'flex items-center justify-between'
      const title = document.createElement('p')
      title.className = `text-sm ${isActive ? 'font-bold text-[var(--blue-100)]' : 'font-medium text-[var(--black-100)]'}`
      title.textContent = l.titulo
      row.append(title)
      btn.append(row)
      btn.addEventListener('click', () => {
        activeLesson = l
        renderMobileLessonList()
        const titleSpan = document.getElementById('ls-mob-lesson-title')
        if (titleSpan) titleSpan.textContent = l.titulo
        renderLessonContent(document.getElementById('ls-mob-content'), l)
        showScreen('content')
      })
      list.append(btn)
    })

    if (filtered.length === 0 && q) {
      const empty = document.createElement('p')
      empty.className = 'text-[var(--black-60)] text-sm px-4 py-4'
      empty.textContent = 'Sin resultados.'
      list.append(empty)
    }
  }

  // Búsqueda global desde la pantalla de categorías: muestra lecciones de
  // cualquier categoría; al tocar una se abre directo su contenido.
  function renderMobileCatSearchResults(q) {
    const list = document.getElementById('ls-cat-list')
    if (!list) return
    if (!q) { renderMobileCatList(); return }

    const matches = lessons.filter(l =>
      l.titulo.toLowerCase().includes(q) || (l.descripcion || '').toLowerCase().includes(q))

    list.innerHTML = ''
    matches.forEach(l => {
      const btn = document.createElement('button')
      btn.className = 'w-full text-left px-4 py-3.5 border-b border-[var(--blue-10)] hover:bg-[var(--black-10)] transition-colors'
      const title = document.createElement('p')
      title.className = 'text-sm font-medium text-[var(--black-100)]'
      title.textContent = l.titulo
      const meta = document.createElement('p')
      meta.className = 'text-xs text-[var(--black-60)] mt-0.5'
      meta.textContent = stripEmoji(l.categoria || '')
      btn.append(title, meta)
      btn.addEventListener('click', () => {
        activeCategory = l.categoria || firstCat
        activeLesson = l
        renderMobileLessonList()
        const titleSpan = document.getElementById('ls-mob-lesson-title')
        if (titleSpan) titleSpan.textContent = l.titulo
        renderLessonContent(document.getElementById('ls-mob-content'), l)
        showScreen('content')
      })
      list.append(btn)
    })

    if (!matches.length) {
      const empty = document.createElement('p')
      empty.className = 'text-[var(--black-60)] text-sm px-4 py-4'
      empty.textContent = 'Sin resultados.'
      list.append(empty)
    }
  }

  let catSearchDebounce = null
  document.getElementById('ls-cat-search')?.addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase()
    renderMobileCatSearchResults(q)
    clearTimeout(catSearchDebounce)
    if (q) {
      catSearchDebounce = setTimeout(() => {
        const count = lessons.filter(l =>
          l.titulo.toLowerCase().includes(q) || (l.descripcion || '').toLowerCase().includes(q)).length
        track('lesson_search', { term: q, results_count: count })
      }, 600)
    }
  })

  document.getElementById('ls-back-cats')?.addEventListener('click', () => showScreen('categories'))
  document.getElementById('ls-back-lessons')?.addEventListener('click', () => showScreen('lessons'))

  let mobSearchDebounce = null
  document.getElementById('ls-mob-search')?.addEventListener('input', e => {
    renderMobileLessonList()
    clearTimeout(mobSearchDebounce)
    const q = e.target.value.trim()
    if (q) {
      mobSearchDebounce = setTimeout(() => {
        const filtered = (grouped[activeCategory] || []).filter(l =>
          l.titulo.toLowerCase().includes(q.toLowerCase()) ||
          (l.descripcion || '').toLowerCase().includes(q.toLowerCase()))
        track('lesson_search', { term: q, results_count: filtered.length })
      }, 600)
    }
  })

  // ── Toast ─────────────────────────────────────────────────────────────────
  function showToast(msg) {
    const existing = document.getElementById('ls-toast')
    if (existing) existing.remove()
    const toast = document.createElement('div')
    toast.id = 'ls-toast'
    toast.style.cssText = 'position:absolute;top:12px;left:50%;transform:translateX(-50%);z-index:50;padding:6px 16px;border-radius:999px;font-size:11px;font-weight:700;color:#fff;background:var(--blue-100);box-shadow:0 2px 8px rgba(0,0,0,.15);pointer-events:none;white-space:nowrap'
    toast.textContent = msg
    container.appendChild(toast)
    setTimeout(() => toast.remove(), 3000)
  }

  // ── Realtime refresh ──────────────────────────────────────────────────────
  async function refreshLessons() {
    const [{ data: freshLessons, error: err }, overrides] = await Promise.all([
      APP_ENV === 'prod'
        ? supabase.from('lecciones').select('*').eq('active', true).order('orden')
        : supabase.from('lecciones').select('*').order('orden'),
      loadVisibilityOverrides(),
    ])
    if (err || !freshLessons) return

    allLessons = visibles(aplicarVisibilidad(freshLessons, overrides, APP_ENV))
    sel = resolverSeleccion(allLessons, settings, sel, { verticalFija: verticalFijadaPorBold() })
    lessons = filtrarPorSeleccion(allLessons, sel)
    rebuildGrouped()

    // If active lesson was removed/disabled, clear the content panel
    if (activeLesson && !lessons.find(l => l.id === activeLesson.id)) {
      activeLesson = null
      renderDeskContent()
    }

    renderSelectors()
    renderAccordion()
    renderMobileCatList()
    renderMobileLessonList()
  }

  // ── Initialize ────────────────────────────────────────────────────────────
  renderSelectors()
  renderMobileCatList()
  renderMobileLessonList()
  showScreen('categories')
  renderAccordion()
  renderDeskContent()

  window.openLessonById = (id) => {
    // Las FAQs (js/resources.js) son compartidas entre verticales/plataformas
    // y pueden enlazar una lección fuera de la selección activa. Por eso la
    // búsqueda parte de `allLessons` (sin filtrar) en vez de `lessons`.
    const lesson = allLessons.find(l => String(l.id) === String(id))
    if (!lesson) { console.warn('[openLessonById] Lección no encontrada:', id); return }
    const lessonVertical = lesson.vertical || 'retail'
    const lessonPlataforma = lesson.plataforma || 'web'
    if (lessonVertical !== sel.vertical || lessonPlataforma !== sel.plataforma) {
      // Cambia de contexto: persiste la selección, refiltra `lessons`/`grouped`
      // y re-renderiza los selectores. Deja activeLesson en null y la pantalla
      // en 'categories'; la lógica de abajo la reemplaza abriendo la lección.
      applySeleccion({ vertical: lessonVertical, plataforma: lessonPlataforma })
    }
    activeLesson = lesson
    // Sync activeCategory for mobile back navigation
    activeCategory = lesson.categoria || firstCat
    openCats.add(activeCategory)
    // Desktop
    renderAccordion()
    renderDeskContent()
    // Mobile
    renderMobileLessonList()
    const titleSpan = document.getElementById('ls-mob-lesson-title')
    if (titleSpan) titleSpan.textContent = lesson.titulo
    const mobContent = document.getElementById('ls-mob-content')
    if (mobContent) renderLessonContent(mobContent, lesson)
    showScreen('content')
  }

  window.openLessonBySlug = (slug) => {
    const lesson = allLessons.find(l => l.slug === slug)
    if (!lesson) { console.warn('[openLessonBySlug] Lección no encontrada:', slug); return }
    window.openLessonById(lesson.id)
  }

  // Link directo a una lección puntual: ?leccion=<slug> (botón "Copiar link"
  // del admin). Se resuelve una sola vez, al cargar el portal.
  const leccionSlug = new URLSearchParams(window.location.search).get('leccion')
  if (leccionSlug) {
    if (allLessons.some(l => l.slug === leccionSlug)) {
      window.switchTab?.('lessons')
      window.openLessonBySlug(leccionSlug)
    } else {
      console.warn('[deep-link] Lección no encontrada para el slug:', leccionSlug)
    }
  }

  // ── Supabase Realtime ─────────────────────────────────────────────────────
  // Suscripción reanudable: al salir de la pestaña se detiene y al volver se
  // reanuda (main.js). Antes se removía el canal sin forma de re-suscribir, así
  // que el realtime moría al cambiar de pestaña una vez (#7).
  const realtime = crearSuscripcionReanudable({
    subscribe: () => supabase
      .channel('lessons-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lecciones' }, async () => {
        await refreshLessons()
        showToast('Lecciones actualizadas ✓')
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leccion_visibilidad' }, async () => {
        await refreshLessons()
        showToast('Lecciones actualizadas ✓')
      })
      .subscribe(),
    remove: (channel) => supabase.removeChannel(channel),
  })
  realtime.iniciar()

  window.lessonsCleanup = () => realtime.detener()
  window.lessonsResume  = () => realtime.iniciar()

  // ── Contexto del comercio (Bold POS) ──────────────────────────────────────
  // Si el POS nos dice quién es el comercio, su vertical/plataforma manda sobre
  // la selección guardada. `onContextoBold` dispara de una vez si el mensaje ya
  // había llegado (puede llegar mientras esta función está en su primer await).
  onContextoBold(ctx => {
    const cambio = seleccionDesdeContexto(ctx)
    if (!cambio) return
    const igual = (cambio.vertical ?? sel.vertical) === sel.vertical &&
                  (cambio.plataforma ?? sel.plataforma) === sel.plataforma
    // Ya estábamos donde Bold dice: persistir y repintar SOLO el selector. No
    // se llama a applySeleccion porque un re-render completo devolvería a las
    // categorías a quien esté leyendo una lección; pero el selector sí tiene
    // que repintarse, porque la tarjeta de vertical se pintó cuando el
    // contexto todavía no había llegado y hay que esconderla.
    if (igual) { setSeleccion(cambio); renderSelectors(); return }
    applySeleccion(cambio, { origen: 'bold' })
  })
}

renderLessons()
