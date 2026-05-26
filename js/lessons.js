import { supabase } from './supabase.js'
import { renderBlocks } from './block-renderer.js'

const CATEGORIES = [
  { key: 'Ventas',        emoji: '📊' },
  { key: 'Inventario',    emoji: '📦' },
  { key: 'Ingresos',      emoji: '💰' },
  { key: 'Egresos',       emoji: '💸' },
  { key: 'Contactos',     emoji: '👥' },
  { key: 'Configuración', emoji: '⚙️' },
]

function escapeHtml(text) {
  if (text == null) return ''
  return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

async function renderLessons() {
  const container = document.getElementById('section-lessons')
  container.innerHTML = '<div class="flex items-center justify-center h-full text-slate-400 text-sm">Cargando lecciones...</div>'

  const { data: lessons, error } = await supabase
    .from('lecciones')
    .select('*')
    .order('orden')

  if (error || !lessons?.length) {
    container.innerHTML = '<p class="text-slate-400 text-sm text-center pt-16">No hay lecciones disponibles.</p>'
    return
  }

  // Group by category, preserving CATEGORIES order
  const grouped = {}
  for (const cat of CATEGORIES) grouped[cat.key] = []
  for (const l of lessons) {
    const cat = l.categoria || 'Ventas'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(l)
  }

  // Initial state
  const firstCat = CATEGORIES.find(c => grouped[c.key].length > 0)?.key || CATEGORIES[0].key
  let activeCategory = firstCat
  let activeLesson = grouped[firstCat]?.[0] || null
  let searchQuery = ''

  // Build skeleton
  container.innerHTML = `
    <!-- MOBILE: 3-screen stack (hidden on md+) -->
    <div class="md:hidden absolute inset-0">
      <div id="ls-screen-categories" class="absolute inset-0 flex flex-col bg-white">
        <div class="px-4 py-3 border-b border-slate-100 shrink-0">
          <h2 class="font-black text-base">Lecciones</h2>
        </div>
        <div id="ls-cat-list" class="flex-1 overflow-y-auto"></div>
      </div>

      <div id="ls-screen-lessons" class="absolute inset-0 flex-col bg-white hidden">
        <div class="bg-[#E92129] px-4 py-3 flex items-center gap-3 shrink-0">
          <button id="ls-back-cats" class="text-white/80 text-2xl font-bold leading-none">‹</button>
          <span id="ls-mob-cat-title" class="text-white font-black text-sm flex-1"></span>
        </div>
        <div class="px-3 py-2 border-b border-slate-100 shrink-0">
          <div class="flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2">
            <span class="text-slate-400 text-sm">🔍</span>
            <input id="ls-mob-search" placeholder="Buscar lección..." class="bg-transparent text-sm flex-1 outline-none placeholder-slate-400">
          </div>
        </div>
        <div id="ls-lesson-list" class="flex-1 overflow-y-auto"></div>
      </div>

      <div id="ls-screen-content" class="absolute inset-0 flex-col bg-slate-50 hidden">
        <div class="bg-[#E92129] px-4 py-3 flex items-center gap-3 shrink-0">
          <button id="ls-back-lessons" class="text-white/80 text-2xl font-bold leading-none">‹</button>
          <span id="ls-mob-lesson-title" class="text-white font-black text-sm flex-1 truncate"></span>
        </div>
        <div id="ls-mob-content" class="flex-1 overflow-y-auto p-4 custom-scroll"></div>
      </div>
    </div>

    <!-- DESKTOP: sidebar + content panel (hidden below md) -->
    <div class="hidden md:flex absolute inset-0">
      <div class="w-48 bg-white border-r border-slate-100 flex flex-col shrink-0">
        <div class="p-2.5 border-b border-slate-100 shrink-0">
          <div class="flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2">
            <span class="text-slate-400 text-xs">🔍</span>
            <input id="ls-desk-search" placeholder="Buscar..." class="bg-transparent text-xs flex-1 outline-none placeholder-slate-400">
          </div>
        </div>
        <div id="ls-accordion" class="flex-1 overflow-y-auto custom-scroll"></div>
      </div>
      <div id="ls-desk-content" class="flex-1 overflow-y-auto p-5 bg-slate-50 custom-scroll"></div>
    </div>
  `

  // ── Shared: render lesson content into any container ──────────────────────
  function renderLessonContent(container, lesson) {
    container.innerHTML = ''
    const catLessons = grouped[lesson.categoria || 'Ventas'] || []
    const lessonIdx = catLessons.findIndex(l => l.id === lesson.id) + 1

    let blocks = []
    let isLegacy = false
    try {
      const p = JSON.parse(lesson.contenido)
      if (Array.isArray(p)) blocks = p
      else isLegacy = true
    } catch (_) { isLegacy = true }

    // If first block is a video, promote it above the title
    const firstVideoIdx = blocks.findIndex(b => b.type === 'video')
    let topVideo = null, restBlocks = blocks
    if (firstVideoIdx === 0) { topVideo = blocks[0]; restBlocks = blocks.slice(1) }

    if (topVideo) container.appendChild(renderBlocks([topVideo]))

    const titleEl = document.createElement('h2')
    titleEl.className = 'font-black text-base text-slate-900 mb-0.5'
    titleEl.textContent = lesson.titulo

    const metaEl = document.createElement('p')
    metaEl.className = 'text-xs text-slate-400 mb-4'
    metaEl.textContent = `${lesson.categoria || 'Ventas'} · Lección ${lessonIdx}`

    container.append(titleEl, metaEl)

    if (restBlocks.length > 0) {
      container.appendChild(renderBlocks(restBlocks))
    } else if (isLegacy && lesson.contenido) {
      // Legacy HTML fallback for lessons saved before block editor
      const div = document.createElement('div')
      div.innerHTML = lesson.contenido
      container.append(div)
    }

    if (lesson.notas) {
      const notasWrap = document.createElement('div')
      notasWrap.style.cssText = 'margin-top:16px;background:#fefce8;border-left:3px solid #eab308;border-radius:8px;padding:12px 14px'
      const notasTitle = document.createElement('p')
      notasTitle.style.cssText = 'font-size:11px;font-weight:900;color:#854d0e;margin-bottom:6px'
      notasTitle.textContent = '📝 Notas'
      const notasText = document.createElement('p')
      notasText.style.cssText = 'font-size:12px;color:#713f12;line-height:1.5'
      notasText.textContent = lesson.notas
      notasWrap.append(notasTitle, notasText)
      container.append(notasWrap)
    }
  }

  // ── Desktop: accordion ────────────────────────────────────────────────────
  function renderAccordion() {
    const accordion = document.getElementById('ls-accordion')
    accordion.innerHTML = CATEGORIES
      .filter(c => grouped[c.key].length > 0)
      .map(cat => {
        const isOpen = cat.key === activeCategory
        const catLessons = grouped[cat.key]
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
                class="acc-lesson w-full text-left px-4 py-2.5 text-xs border-b border-slate-100/60 hover:bg-red-50 transition-colors ${isActive ? 'bg-red-50 border-l-2 border-l-[#E92129]' : ''}"
                data-id="${l.id}">
                <span class="${isActive ? 'font-bold text-[#E92129]' : 'text-slate-600'}">${escapeHtml(l.titulo)}</span>
              </button>`
            }).join('')}
            ${filtered.length === 0 && q ? '<p class="text-xs text-slate-400 px-4 py-2">Sin resultados</p>' : ''}
          </div>` : ''

        return `
          <div>
            <button class="acc-cat w-full flex items-center justify-between px-3 py-2.5 border-b border-slate-100 hover:bg-slate-50 transition-colors" data-cat="${escapeHtml(cat.key)}">
              <span class="text-xs font-black ${isOpen ? 'text-[#E92129]' : 'text-slate-600'}">${cat.emoji} ${escapeHtml(cat.key)}</span>
              <span class="text-[10px] ${isOpen ? 'text-[#E92129]' : 'text-slate-300'}">${isOpen ? '▾' : '▸'}</span>
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
        activeLesson = lessons.find(l => l.id === btn.dataset.id) || null
        renderAccordion()
        renderDeskContent()
      })
    })
  }

  function renderDeskContent() {
    const panel = document.getElementById('ls-desk-content')
    if (!panel) return
    if (!activeLesson) {
      panel.innerHTML = '<p class="text-slate-400 text-sm">Selecciona una lección.</p>'
      return
    }
    renderLessonContent(panel, activeLesson)
  }

  // Desktop search
  document.getElementById('ls-desk-search')?.addEventListener('input', e => {
    searchQuery = e.target.value
    renderAccordion()
  })

  // ── Mobile: screens ───────────────────────────────────────────────────────
  function showScreen(name) {
    const screens = ['categories', 'lessons', 'content']
    for (const s of screens) {
      const el = document.getElementById(`ls-screen-${s}`)
      if (!el) continue
      if (s === name) {
        el.classList.remove('hidden')
        el.classList.add('flex')
      } else {
        el.classList.add('hidden')
        el.classList.remove('flex')
      }
    }
  }

  function renderMobileCatList() {
    const list = document.getElementById('ls-cat-list')
    list.innerHTML = ''
    CATEGORIES.filter(c => grouped[c.key].length > 0).forEach(cat => {
      const btn = document.createElement('button')
      btn.className = 'w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 text-left hover:bg-slate-50 transition-colors'
      btn.innerHTML = `
        <span class="text-lg">${cat.emoji}</span>
        <span class="font-bold text-sm flex-1 text-slate-800">${escapeHtml(cat.key)}</span>
        <span class="text-slate-300 text-xl">›</span>`
      btn.addEventListener('click', () => {
        activeCategory = cat.key
        renderMobileLessonList()
        showScreen('lessons')
      })
      list.append(btn)
    })
  }

  function renderMobileLessonList() {
    const catObj = CATEGORIES.find(c => c.key === activeCategory)
    const titleEl = document.getElementById('ls-mob-cat-title')
    if (titleEl) titleEl.textContent = `${catObj?.emoji || ''} ${activeCategory}`

    const q = document.getElementById('ls-mob-search')?.value?.toLowerCase() || ''
    const filtered = (grouped[activeCategory] || []).filter(l =>
      !q || l.titulo.toLowerCase().includes(q) || (l.descripcion || '').toLowerCase().includes(q))

    const list = document.getElementById('ls-lesson-list')
    list.innerHTML = ''
    filtered.forEach(l => {
      const isActive = activeLesson?.id === l.id
      const btn = document.createElement('button')
      btn.className = `w-full text-left px-4 py-3.5 border-b border-slate-100 hover:bg-slate-50 transition-colors ${isActive ? 'border-l-2 border-l-[#E92129] bg-red-50/40' : ''}`
      const title = document.createElement('p')
      title.className = `text-sm ${isActive ? 'font-bold text-[#E92129]' : 'font-medium text-slate-700'}`
      title.textContent = l.titulo
      btn.append(title)
      btn.addEventListener('click', () => {
        activeLesson = l
        renderMobileLessonList()
        document.getElementById('ls-mob-lesson-title').textContent = l.titulo
        renderLessonContent(document.getElementById('ls-mob-content'), l)
        showScreen('content')
      })
      list.append(btn)
    })

    if (filtered.length === 0 && q) {
      const empty = document.createElement('p')
      empty.className = 'text-slate-400 text-sm px-4 py-4'
      empty.textContent = 'Sin resultados.'
      list.append(empty)
    }
  }

  // Mobile back buttons
  document.getElementById('ls-back-cats')?.addEventListener('click', () => showScreen('categories'))
  document.getElementById('ls-back-lessons')?.addEventListener('click', () => showScreen('lessons'))

  // Mobile search
  document.getElementById('ls-mob-search')?.addEventListener('input', () => renderMobileLessonList())

  // ── Initialize ────────────────────────────────────────────────────────────
  renderMobileCatList()
  renderMobileLessonList()
  showScreen('categories')

  renderAccordion()
  renderDeskContent()
}

renderLessons()
