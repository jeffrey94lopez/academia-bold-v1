import { supabase } from './supabase.js'
import { renderBlocks } from './block-renderer.js'
import { loadSession, renderModeSelection, markLessonComplete, checkAndMarkCourseComplete, showExamModal } from './course.js'
import { renderCertificate } from './certificate.js'
import { track } from './analytics.js'
import { copyLessonToWhatsApp } from './whatsapp-copy.js'
import { escapeHtml } from './utils.js'

let courseStudent = null

function progressIcon(lessonId) {
  if (!courseStudent) return ''
  const entry = courseStudent.progreso?.[String(lessonId)]
  if (entry?.completado) return '<span class="text-green-500 text-xs ml-1 shrink-0">✅</span>'
  return '<span class="text-slate-300 text-xs ml-1 shrink-0">⭕</span>'
}

async function renderLessons() {
  const container = document.getElementById('section-lessons')

  if (!courseStudent) {
    const session = await loadSession()
    if (session) courseStudent = session
  }

  const exploreMode = localStorage.getItem('bold_mode') === 'explore'
  if (!courseStudent && !exploreMode) {
    renderModeSelection(container, {
      onCourse(student) { courseStudent = student; renderLessons() },
      onExplore() { renderLessons() },
    })
    return
  }

  container.innerHTML = '<div class="flex items-center justify-center h-full text-slate-400 text-sm">Cargando lecciones...</div>'

  const [{ data: lessons, error }, { data: cats }] = await Promise.all([
    supabase.from('lecciones').select('*').order('orden'),
    supabase.from('categorias').select('*').order('orden'),
  ])
  const CATEGORIES = (cats || []).map(c => ({ key: c.nombre, emoji: c.emoji }))

  if (error) console.error('[lessons] Supabase error:', error)
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

  track('page_view', { page: 'lessons' })

  // ── Shared: render lesson content into any panel ───────────────────────────
  function renderLessonContent(panel, lesson) {
    panel.innerHTML = ''
    track('lesson_open', { lesson_id: lesson.id, lesson_title: lesson.titulo || '', category: lesson.categoria || 'Ventas' })
    const catLessons = grouped[lesson.categoria || 'Ventas'] || []
    const idx = catLessons.findIndex(l => l.id === lesson.id)
    const lessonIdx = idx >= 0 ? idx + 1 : '?'

    let blocks = []
    let isLegacy = false
    try {
      const p = JSON.parse(lesson.contenido)
      if (Array.isArray(p)) blocks = p
      else isLegacy = true
    } catch (_) { isLegacy = true }

    // First video block is promoted above the title; remaining blocks follow below
    let topVideo = null, restBlocks = blocks
    if (blocks[0]?.type === 'video') { topVideo = blocks[0]; restBlocks = blocks.slice(1) }

    if (topVideo) panel.appendChild(renderBlocks([topVideo]))

    const titleEl = document.createElement('h2')
    titleEl.className = 'font-black text-base text-slate-900 mb-0.5'
    titleEl.textContent = lesson.titulo

    const metaEl = document.createElement('p')
    metaEl.className = 'text-xs text-slate-400 mb-4'
    metaEl.textContent = `${lesson.categoria || 'Ventas'} · Lección ${lessonIdx}`

    panel.append(titleEl, metaEl)

    if (restBlocks.length > 0) {
      panel.appendChild(renderBlocks(restBlocks))
    } else if (isLegacy && lesson.contenido) {
      // Legacy HTML fallback for lessons saved before block editor
      const div = document.createElement('div')
      div.innerHTML = lesson.contenido
      panel.append(div)
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
      panel.append(notasWrap)
    }

    const waBtn = document.createElement('button')
    waBtn.style.cssText = 'margin-top:12px;width:100%;padding:10px;border-radius:12px;background:#25D366;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;border:none'
    waBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> Copiar para WhatsApp'
    waBtn.addEventListener('click', () => copyLessonToWhatsApp(lesson, waBtn))
    panel.append(waBtn)

    if (courseStudent) {
      const allIds = lessons.map(l => String(l.id))
      const alreadyDone = courseStudent.progreso?.[String(lesson.id)]?.completado
      if (alreadyDone) {
        const doneTag = document.createElement('div')
        doneTag.className = 'mt-5 py-3 rounded-xl bg-green-50 border border-green-200 text-center text-sm font-bold text-green-700'
        doneTag.textContent = '✅ Lección completada'
        panel.append(doneTag)
      } else {
        const hasExam = Array.isArray(lesson.examen?.preguntas) && lesson.examen.preguntas.length > 0
        const examBtn = document.createElement('button')
        examBtn.className = 'mt-5 w-full py-3 rounded-xl bg-[#E92129] text-white text-sm font-bold hover:scale-[1.02] transition-transform'
        examBtn.textContent = hasExam ? 'Ir al examen →' : 'Marcar lección como completada ✓'
        examBtn.addEventListener('click', () => {
          if (hasExam) {
            showExamModal(lesson, courseStudent, allIds, {
              onPass(_puntaje, courseComplete) {
                renderAccordion()
                renderDeskContent()
                renderMobileLessonList()
                if (courseComplete) setTimeout(() => renderCertificate(courseStudent), 500)
              },
              onDismiss() {},
            })
          } else {
            track('lesson_complete', { lesson_id: lesson.id, lesson_title: lesson.titulo || '' })
            markLessonComplete(courseStudent, String(lesson.id), 100).then(() =>
              checkAndMarkCourseComplete(courseStudent, allIds).then(done => {
                renderAccordion()
                renderDeskContent()
                renderMobileLessonList()
                if (done) setTimeout(() => renderCertificate(courseStudent), 500)
              })
            ).catch(err => console.error('[lessons] markLessonComplete error:', err))
          }
        })
        panel.append(examBtn)
      }
    }
  }

  // ── Desktop: accordion ────────────────────────────────────────────────────
  function renderAccordion() {
    const accordion = document.getElementById('ls-accordion')

    let topBar = ''
    if (courseStudent) {
      const total = lessons.length
      const done = Object.values(courseStudent.progreso || {}).filter(v => v?.completado).length
      topBar = `
        <div class="px-3 py-2.5 border-b border-slate-100 bg-slate-50">
          <p class="text-[10px] font-black text-slate-700 truncate">${escapeHtml(courseStudent.nombre)} ${escapeHtml(courseStudent.apellido)}</p>
          <div class="flex items-center gap-2 mt-1">
            <div class="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div class="h-full bg-[#E92129] transition-all" style="width:${total ? Math.round(done / total * 100) : 0}%"></div>
            </div>
            <span class="text-[10px] text-slate-400 shrink-0">${done}/${total}</span>
          </div>
          ${courseStudent.completado ? `<button id="cert-btn" class="mt-2 w-full py-1.5 rounded-lg bg-[#E92129] text-white text-[10px] font-black">🏆 Ver mi certificado</button>` : ''}
        </div>`
    } else {
      topBar = `
        <div class="px-3 py-2 border-b border-slate-100">
          <button id="start-course-btn" class="w-full py-1.5 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-500 hover:bg-slate-50 transition-colors">📋 Iniciar curso</button>
        </div>`
    }

    accordion.innerHTML = topBar + CATEGORIES
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
                <span class="flex items-center justify-between">
                  <span class="${isActive ? 'font-bold text-[#E92129]' : 'text-slate-600'}">${escapeHtml(l.titulo)}</span>
                  ${progressIcon(l.id)}
                </span>
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
        activeLesson = lessons.find(l => String(l.id) === btn.dataset.id) || null
        renderAccordion()
        renderDeskContent()
      })
    })

    accordion.querySelector('#cert-btn')?.addEventListener('click', () => renderCertificate(courseStudent))

    accordion.querySelector('#start-course-btn')?.addEventListener('click', () => {
      localStorage.removeItem('bold_mode')
      courseStudent = null
      renderModeSelection(container, {
        onCourse(student) { courseStudent = student; renderLessons() },
        onExplore() { renderLessons() },
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
    if (!list) return
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
    const list = document.getElementById('ls-lesson-list')
    if (!list) return

    const catObj = CATEGORIES.find(c => c.key === activeCategory)
    const titleEl = document.getElementById('ls-mob-cat-title')
    if (titleEl) titleEl.textContent = `${catObj?.emoji || ''} ${activeCategory}`

    const q = document.getElementById('ls-mob-search')?.value?.toLowerCase() || ''
    const filtered = (grouped[activeCategory] || []).filter(l =>
      !q || l.titulo.toLowerCase().includes(q) || (l.descripcion || '').toLowerCase().includes(q))

    list.innerHTML = ''
    filtered.forEach(l => {
      const isActive = activeLesson?.id === l.id
      const btn = document.createElement('button')
      btn.className = `w-full text-left px-4 py-3.5 border-b border-slate-100 hover:bg-slate-50 transition-colors ${isActive ? 'border-l-2 border-l-[#E92129] bg-red-50/40' : ''}`
      const row = document.createElement('div')
      row.className = 'flex items-center justify-between'
      const title = document.createElement('p')
      title.className = `text-sm ${isActive ? 'font-bold text-[#E92129]' : 'font-medium text-slate-700'}`
      title.textContent = l.titulo
      row.append(title)
      if (courseStudent) row.insertAdjacentHTML('beforeend', progressIcon(l.id))
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
      empty.className = 'text-slate-400 text-sm px-4 py-4'
      empty.textContent = 'Sin resultados.'
      list.append(empty)
    }
  }

  // Mobile back buttons
  document.getElementById('ls-back-cats')?.addEventListener('click', () => showScreen('categories'))
  document.getElementById('ls-back-lessons')?.addEventListener('click', () => showScreen('lessons'))

  // Mobile search
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

  // ── Initialize ────────────────────────────────────────────────────────────
  renderMobileCatList()
  renderMobileLessonList()
  showScreen('categories')

  renderAccordion()
  renderDeskContent()
}

renderLessons()
