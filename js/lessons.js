import { supabase } from './supabase.js'
import { renderBlocks } from './block-renderer.js'
import { track } from './analytics.js'
import { copyLessonToWhatsApp } from './whatsapp-copy.js'
import { escapeHtml } from './utils.js'

// Las categorías se muestran sin emojis (pueden venir en la columna emoji o
// incrustados en el nombre); las claves internas de agrupación no se tocan.
const stripEmoji = s => (s || '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').trim()

async function renderLessons() {
  const container = document.getElementById('section-lessons')

  container.innerHTML = '<div class="flex items-center justify-center h-full text-[var(--black-60)] text-sm">Cargando lecciones...</div>'

  const [lessonsRes, catsRes] = await Promise.all([
    supabase.from('lecciones').select('*').eq('active', true).order('orden'),
    supabase.from('categorias').select('*').order('orden'),
  ])
  let lessons = lessonsRes.data || []
  const error = lessonsRes.error
  const cats  = catsRes.data
  const CATEGORIES = (cats || []).map(c => ({ key: c.nombre, emoji: c.emoji }))

  if (error) console.error('[lessons] Supabase error:', error)
  if (error || !lessons?.length) {
    container.innerHTML = '<p class="text-[var(--black-60)] text-sm text-center pt-16">No hay lecciones disponibles.</p>'
    return
  }

  // Group by category
  const grouped = {}
  for (const cat of CATEGORIES) grouped[cat.key] = []
  for (const l of lessons) {
    const cat = l.categoria || CATEGORIES[0]?.key || 'General'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(l)
  }

  const firstCat = CATEGORIES.find(c => grouped[c.key]?.length > 0)?.key || CATEGORIES[0]?.key
  let activeCategory = firstCat
  let activeLesson = grouped[firstCat]?.[0] || null
  let searchQuery = ''

  container.innerHTML = `
    <!-- MOBILE: 3-screen stack (hidden on md+) -->
    <div class="md:hidden absolute inset-0">
      <div id="ls-screen-categories" class="absolute inset-0 flex flex-col bg-white">
        <div class="px-4 py-3 border-b border-[var(--blue-10)] shrink-0">
          <h2 class="font-black text-base text-[var(--blue-100)]">Centro de Ayuda</h2>
        </div>
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

  track('page_view', { page: 'lessons' })

  // ── Render lesson content ─────────────────────────────────────────────────
  function renderLessonContent(panel, lesson) {
    panel.innerHTML = ''
    track('lesson_open', { lesson_id: lesson.id, lesson_title: lesson.titulo || '', category: lesson.categoria || '' })

    const catLessons = grouped[lesson.categoria || CATEGORIES[0]?.key] || []
    const idx = catLessons.findIndex(l => l.id === lesson.id)
    const lessonIdx = idx >= 0 ? idx + 1 : '?'

    let blocks = []
    let isLegacy = false
    try {
      const p = JSON.parse(lesson.contenido)
      if (Array.isArray(p)) blocks = p
      else isLegacy = true
    } catch (_) { isLegacy = true }

    let topVideo = null, restBlocks = blocks
    if (blocks[0]?.type === 'video') { topVideo = blocks[0]; restBlocks = blocks.slice(1) }
    if (topVideo) panel.appendChild(renderBlocks([topVideo]))

    const titleEl = document.createElement('h2')
    titleEl.className = 'font-black text-base text-[var(--blue-100)] mb-0.5'
    titleEl.textContent = lesson.titulo

    const metaEl = document.createElement('p')
    metaEl.className = 'text-xs text-[var(--black-60)] mb-4'
    metaEl.textContent = `${stripEmoji(lesson.categoria || '')} · Lección ${lessonIdx}`

    panel.append(titleEl, metaEl)

    if (restBlocks.length > 0) {
      panel.appendChild(renderBlocks(restBlocks))
    } else if (isLegacy && lesson.contenido) {
      const div = document.createElement('div')
      div.innerHTML = lesson.contenido
      panel.append(div)
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
      panel.append(notasWrap)
    }

    const waBtn = document.createElement('button')
    waBtn.style.cssText = 'margin-top:12px;width:100%;padding:10px;border-radius:12px;background:#25D366;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;border:none'
    waBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> Copiar para WhatsApp'
    waBtn.addEventListener('click', () => copyLessonToWhatsApp(lesson, waBtn))
    panel.append(waBtn)
  }

  // ── Desktop: accordion ────────────────────────────────────────────────────
  function renderAccordion() {
    const accordion = document.getElementById('ls-accordion')
    if (!accordion) return

    accordion.innerHTML = CATEGORIES
      .filter(c => grouped[c.key]?.length > 0)
      .map(cat => {
        const isOpen = cat.key === activeCategory
        const catLessons = grouped[cat.key] || []
        const q = searchQuery.toLowerCase()
        const filtered = q
          ? catLessons.filter(l =>
              l.titulo.toLowerCase().includes(q) ||
              (l.descripcion || '').toLowerCase().includes(q))
          : catLessons

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
        activeCategory = btn.dataset.cat
        searchQuery = ''
        const searchEl = document.getElementById('ls-desk-search')
        if (searchEl) searchEl.value = ''
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
    const { data: freshLessons, error: err } = await supabase
      .from('lecciones').select('*').eq('active', true).order('orden')
    if (err || !freshLessons) return

    lessons = freshLessons

    // Rebuild grouped in-place (keeps CATEGORIES reference intact)
    for (const key of Object.keys(grouped)) delete grouped[key]
    for (const cat of CATEGORIES) grouped[cat.key] = []
    for (const l of lessons) {
      const cat = l.categoria || CATEGORIES[0]?.key || 'General'
      if (!grouped[cat]) grouped[cat] = []
      grouped[cat].push(l)
    }

    // If active lesson was removed/disabled, clear the content panel
    if (activeLesson && !lessons.find(l => l.id === activeLesson.id)) {
      activeLesson = null
      renderDeskContent()
    }

    renderAccordion()
    renderMobileCatList()
    renderMobileLessonList()
  }

  // ── Initialize ────────────────────────────────────────────────────────────
  renderMobileCatList()
  renderMobileLessonList()
  showScreen('categories')
  renderAccordion()
  renderDeskContent()

  window.openLessonById = (id) => {
    const lesson = lessons.find(l => String(l.id) === String(id))
    if (!lesson) { console.warn('[openLessonById] Lección no encontrada:', id); return }
    activeLesson = lesson
    // Sync activeCategory for mobile back navigation
    activeCategory = lesson.categoria || firstCat
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

  // ── Supabase Realtime ─────────────────────────────────────────────────────
  const channel = supabase
    .channel('lessons-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'lecciones' }, async () => {
      await refreshLessons()
      showToast('Lecciones actualizadas ✓')
    })
    .subscribe()

  window.lessonsCleanup = () => {
    supabase.removeChannel(channel)
    window.lessonsCleanup = null
  }
}

renderLessons()
