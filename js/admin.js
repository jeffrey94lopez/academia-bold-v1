import { supabase } from './supabase.js'
import { requireAuth, logout } from './auth.js'
import { uploadFile, listFiles, deleteFile, renameFile, createFolder, moveFile } from './upload.js'
import { renderBlocks } from './block-renderer.js'
import { copyLessonToWhatsApp } from './whatsapp-copy.js'
import { escapeHtml } from './utils.js'
import { renderResultsPanel, renderAnalyticsPanel } from './admin-analytics.js'
import { logActivity } from './activity.js'

const EMBED_WEBHOOK = 'https://n8n.mplasesores.com/webhook/embed-lesson'
const EMBED_TOKEN   = 'BoldBodi-2026-K9xMvP7q'

function lessonToEmbedText(titulo, categoria, blocks) {
  let text = `Titulo: ${titulo}\nCategoria: ${categoria}\n`
  if (Array.isArray(blocks)) {
    blocks.forEach(b => {
      if (b.type === 'step' && b.text)
        text += b.text.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim() + '\n'
      else if ((b.type === 'bot_nota' || b.type === 'bot_faq') && b.content)
        text += b.content + '\n'
    })
  }
  return text.slice(0, 8000)
}

async function embedLesson(lessonId, titulo, categoria, blocks) {
  try {
    const text = lessonToEmbedText(titulo, categoria, blocks)
    await fetch(EMBED_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': EMBED_TOKEN },
      body: JSON.stringify({ lessonId, text })
    })
  } catch (_) {}
}

let currentBlocks = []
let sortableInstance = null
let currentQuestions = []
let questionsSortable = null
let quillInstances = {}
let currentCategories = []
let materialView = localStorage.getItem('admin_material_view') || 'grid'
let _materialCurrentFiles = []
let lessonListView = localStorage.getItem('admin_lesson_list_view') || 'list'
let currentFolderPath = ''
let lessonPreviewVisible = localStorage.getItem('admin_lesson_preview') !== 'false'

async function init() {
  const ok = await requireAuth()
  if (!ok) return

  document.getElementById('loginScreen').classList.add('hidden')
  document.getElementById('adminApp').classList.remove('hidden')
  document.getElementById('logoutBtn').addEventListener('click', logout)

  lucide.createIcons()
  initMediaLibraryModal()
  initPasteHandler()
  initFilePreviewModal()
  initRenameModal()

  document.querySelectorAll('.admin-nav').forEach(btn => {
    btn.addEventListener('click', () => switchPanel(btn.dataset.panel))
  })

  const savedPanel = localStorage.getItem('admin_panel') || 'lessons'
  switchPanel(savedPanel)
}

function switchPanel(panel) {
  localStorage.setItem('admin_panel', panel)
  document.querySelectorAll('[id^="panel-"]').forEach(p => p.classList.add('hidden'))
  document.getElementById(`panel-${panel}`).classList.remove('hidden')
  document.querySelectorAll('.admin-nav').forEach(b => {
    const active = b.dataset.panel === panel
    b.classList.toggle('text-[var(--blue-100)]', active)
    b.classList.toggle('bg-[var(--blue-10)]', active)
    b.classList.toggle('text-[var(--black-60)]', !active)
  })

  if (panel === 'lessons') renderLessonsPanel()
  if (panel === 'glossary') renderGlossaryPanel()
  if (panel === 'material') { currentFolderPath = ''; renderMaterialPanel() }
  if (panel === 'material-apoyo') renderMaterialApoyoPanel()
  if (panel === 'suggestions') renderSuggestionsPanel()
  if (panel === 'results') renderResultsPanel()
  if (panel === 'analytics') renderAnalyticsPanel()
  if (panel === 'activity') renderActivityLogPanel()
  if (panel === 'profile') renderProfilePanel()
}

async function renderLessonsPanel() {
  if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null }
  quillInstances = {}
  const el = document.getElementById('panel-lessons')

  const [{ data: cats }, { data: lessons }] = await Promise.all([
    supabase.from('categorias').select('*').order('orden'),
    supabase.from('lecciones').select('*').order('orden'),
  ])
  currentCategories = cats || []
  const allLessons = lessons || []

  el.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-black">Lecciones</h2>
      <div class="flex gap-2">
        <button id="manageCatsBtn" class="px-3 py-2 rounded-xl text-xs font-bold text-[var(--black-60)] border border-[var(--blue-20)] hover:bg-[var(--background-page)] flex items-center gap-1.5">
          <i data-lucide="tag" class="w-3.5 h-3.5"></i> Categorías
        </button>
        <button id="addLesson" class="bg-[var(--blue-100)] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:scale-105 transition-transform">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i> Nueva lección
        </button>
      </div>
    </div>

    <div class="flex items-center gap-3 mb-4">
      <div class="relative flex-1">
        <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--black-40)] pointer-events-none"></i>
        <input id="lessonSearch" type="text" placeholder="Buscar lección..."
          class="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)] bg-white">
      </div>
      <div class="flex gap-0.5 border border-[var(--blue-20)] rounded-lg p-0.5 shrink-0">
        <button id="lessonViewList" class="p-1.5 rounded-md transition-colors ${lessonListView === 'list' ? 'bg-[var(--black-10)] text-[var(--black-100)]' : 'text-[var(--black-40)] hover:text-[var(--black-60)]'}" aria-label="Vista lista">
          <i data-lucide="list" class="w-4 h-4"></i>
        </button>
        <button id="lessonViewGrid" class="p-1.5 rounded-md transition-colors ${lessonListView === 'grid' ? 'bg-[var(--black-10)] text-[var(--black-100)]' : 'text-[var(--black-40)] hover:text-[var(--black-60)]'}" aria-label="Vista cuadrícula">
          <i data-lucide="grid-3x3" class="w-4 h-4"></i>
        </button>
      </div>
    </div>

    <div id="catManager" class="hidden mb-4 bg-white rounded-2xl border border-[var(--blue-20)] p-4">
      <div class="flex items-center justify-between mb-3">
        <p class="text-[10px] font-black uppercase text-[var(--black-40)] tracking-wide">Categorías</p>
        <button id="addCatBtn" class="text-[10px] font-bold text-[var(--blue-100)] hover:underline">+ Nueva</button>
      </div>
      <div id="catList" class="space-y-1.5 mb-2">
        ${currentCategories.map(c => `
          <div class="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-[var(--background-page)]">
            <span>${escapeHtml(c.emoji)}</span>
            <span class="flex-1 text-sm font-medium text-[var(--black-100)]">${escapeHtml(c.nombre)}</span>
            <button class="edit-cat text-[var(--black-40)] hover:text-[var(--black-60)] p-1" data-id="${c.id}" data-nombre="${escapeHtml(c.nombre)}" data-emoji="${escapeHtml(c.emoji)}" title="Editar" aria-label="Editar categoría ${escapeHtml(c.nombre)}">
              <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
            </button>
            <button class="del-cat text-[var(--black-40)] hover:text-[var(--blue-100)] p-1" data-id="${c.id}" data-nombre="${escapeHtml(c.nombre)}" title="Eliminar" aria-label="Eliminar categoría ${escapeHtml(c.nombre)}">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        `).join('')}
      </div>
      <div id="catInlineForm" class="hidden border-t border-[var(--blue-10)] pt-3">
        <input type="hidden" id="catFormId">
        <div class="flex gap-2 mb-2">
          <input id="catFormEmoji" maxlength="2" placeholder="📁"
            class="w-12 px-2 py-1.5 rounded-lg border border-[var(--blue-20)] text-sm text-center outline-none focus:border-[var(--blue-100)]">
          <input id="catFormNombre" placeholder="Nombre de categoría"
            class="flex-1 px-2 py-1.5 rounded-lg border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)]">
        </div>
        <div class="flex gap-2">
          <button id="cancelCatForm" class="flex-1 py-1.5 rounded-lg border border-[var(--blue-20)] text-xs font-bold text-[var(--black-60)]">Cancelar</button>
          <button id="saveCatForm" class="flex-1 py-1.5 rounded-lg bg-[var(--blue-100)] text-white text-xs font-bold">Guardar</button>
        </div>
      </div>
    </div>

    <div id="lessonsList"></div>

    <div id="lessonFormModal" class="hidden fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl w-full max-w-5xl flex flex-col" style="max-height:90vh">
        <div class="flex items-center justify-between px-5 py-4 border-b border-[var(--blue-10)] shrink-0">
          <h3 id="lessonFormTitle" class="font-black text-base">Nueva lección</h3>
          <div class="flex items-center gap-2">
            <button id="togglePreview" class="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-bold text-[var(--black-40)] hover:text-[var(--black-100)] hover:bg-[var(--background-page)] transition-colors" aria-label="Alternar vista previa">
              <i data-lucide="eye" class="w-3.5 h-3.5"></i>
              <span class="hidden sm:inline">Vista previa</span>
            </button>
            <button id="cancelLessonForm" class="text-[var(--black-40)] hover:text-[var(--black-100)] text-lg leading-none px-1">&#x2715;</button>
          </div>
        </div>
        <div id="lessonFormGrid" class="flex-1 overflow-hidden grid" style="grid-template-columns:1fr 1fr;min-height:0">
          <div class="overflow-y-auto p-5 border-r border-[var(--blue-10)]">
            <input type="hidden" id="lessonId">
            <div class="space-y-2 mb-4">
              <input id="lessonTitulo" placeholder="Título" required
                class="w-full px-3 py-2.5 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)]">
              <input id="lessonDescripcion" placeholder="Descripción corta" required
                class="w-full px-3 py-2.5 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)]">
              <select id="lessonCategoria"
                class="w-full px-3 py-2.5 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)] bg-white">
              </select>
            </div>
            <p class="text-[10px] font-black uppercase text-[var(--black-40)] tracking-wide mb-2">Contenido</p>
            <div id="blockList" class="space-y-2 mb-3"></div>
            <div class="flex flex-wrap gap-1.5 mb-4">
              <button data-type="step" class="add-block bg-[var(--black-10)] text-[var(--black-60)] text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-[var(--black-10)]">+ Paso</button>
              <button data-type="image" class="add-block bg-blue-50 text-blue-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-blue-100">+ Imagen</button>
              <button data-type="video" class="add-block bg-purple-50 text-purple-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-purple-100">+ Video</button>
              <button data-type="link" class="add-block bg-green-50 text-green-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-green-100">+ Link</button>
              <div class="w-full border-t border-dashed border-amber-200 my-1"></div>
              <p class="w-full text-[9px] font-black uppercase text-amber-500 tracking-widest">🤖 Solo para Bodi</p>
              <button data-type="bot_nota" class="add-block bg-amber-50 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-amber-100">💡 Nota</button>
              <button data-type="bot_advertencia" class="add-block bg-amber-50 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-amber-100">⚠️ Advertencia</button>
              <button data-type="bot_pasos" class="add-block bg-amber-50 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-amber-100">📋 Pasos internos</button>
              <button data-type="bot_relacionado" class="add-block bg-amber-50 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-amber-100">🔗 Relacionado</button>
              <button data-type="bot_faq" class="add-block bg-amber-50 text-amber-700 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-amber-100">❓ Preguntas frecuentes</button>
            </div>
            <div class="mb-4">
              <p class="text-[10px] font-black uppercase text-[var(--black-40)] tracking-wide mb-1">Notas</p>
              <textarea id="lessonNotas" placeholder="Notas adicionales para el estudiante (opcional)..." rows="3"
                class="w-full px-3 py-2.5 rounded-xl border border-[var(--blue-20)] text-xs outline-none focus:border-[var(--blue-100)] resize-none"></textarea>
            </div>
            <div class="mb-4">
              <div class="flex items-center justify-between mb-2">
                <p class="text-[10px] font-black uppercase text-[var(--black-40)] tracking-wide">Examen</p>
                <button type="button" id="addQuestion" class="text-[10px] font-bold text-[var(--blue-100)] hover:underline">+ Agregar pregunta</button>
              </div>
              <div id="questionList" class="space-y-3"></div>
            </div>
            <div class="flex items-end gap-3 pt-3 border-t border-[var(--blue-10)]">
              <div>
                <p class="text-[10px] font-black uppercase text-[var(--black-40)] mb-1">Orden</p>
                <input id="lessonOrden" type="number" placeholder="1" required
                  class="w-16 px-2 py-1.5 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)]">
              </div>
              <button id="saveLessonBtn" class="flex-1 py-2.5 rounded-xl bg-[var(--blue-100)] text-white text-sm font-bold">Guardar lección</button>
            </div>
          </div>
          <div id="lessonPreviewPanel" class="overflow-y-auto p-5 bg-[var(--background-page)]">
            <p class="text-[10px] font-black uppercase text-[var(--black-40)] tracking-wide mb-3">&#x1F441;&#xFE0F; Vista previa del estudiante</p>
            <div class="bg-white rounded-xl p-4 shadow-sm">
              <h3 id="previewTitle" class="font-black text-sm mb-1 text-[var(--black-100)]"></h3>
              <p id="previewDesc" class="text-xs text-[var(--black-40)] mb-4"></p>
              <div id="lessonPreview"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `

  lucide.createIcons()
  renderGroupedLessons(allLessons, '')

  document.getElementById('lessonSearch').addEventListener('input', e => {
    renderGroupedLessons(allLessons, e.target.value)
  })

  document.getElementById('manageCatsBtn').addEventListener('click', () => {
    document.getElementById('catManager').classList.toggle('hidden')
  })

  document.getElementById('addCatBtn').addEventListener('click', () => {
    document.getElementById('catFormId').value = ''
    document.getElementById('catFormEmoji').value = ''
    document.getElementById('catFormNombre').value = ''
    document.getElementById('catInlineForm').classList.remove('hidden')
    document.getElementById('catFormNombre').focus()
  })

  document.getElementById('cancelCatForm').addEventListener('click', () => {
    document.getElementById('catInlineForm').classList.add('hidden')
  })

  document.getElementById('saveCatForm').addEventListener('click', async () => {
    const id = document.getElementById('catFormId').value
    const nombre = document.getElementById('catFormNombre').value.trim()
    const emoji = document.getElementById('catFormEmoji').value.trim() || '📁'
    if (!nombre) return
    if (id) {
      await supabase.from('categorias').update({ nombre, emoji }).eq('id', id)
    } else {
      const maxOrden = currentCategories.reduce((m, c) => Math.max(m, c.orden), 0)
      await supabase.from('categorias').insert({ nombre, emoji, orden: maxOrden + 1 })
    }
    renderLessonsPanel()
  })

  document.querySelectorAll('.edit-cat').forEach(b => b.addEventListener('click', () => {
    document.getElementById('catFormId').value = b.dataset.id
    document.getElementById('catFormEmoji').value = b.dataset.emoji
    document.getElementById('catFormNombre').value = b.dataset.nombre
    document.getElementById('catInlineForm').classList.remove('hidden')
    document.getElementById('catFormNombre').focus()
  }))

  document.querySelectorAll('.del-cat').forEach(b => b.addEventListener('click', async () => {
    const nombre = b.dataset.nombre
    const { count } = await supabase
      .from('lecciones').select('id', { count: 'exact', head: true }).eq('categoria', nombre)
    if (count > 0) {
      alert(`No se puede eliminar "${nombre}" porque tiene ${count} lección(es). Reasígnalas primero.`)
      return
    }
    if (!confirm(`¿Eliminar la categoría "${nombre}"?`)) return
    await supabase.from('categorias').delete().eq('id', b.dataset.id)
    renderLessonsPanel()
  }))

  document.getElementById('addLesson').addEventListener('click', () => openLessonForm())

  document.getElementById('cancelLessonForm').addEventListener('click', () => {
    document.getElementById('lessonFormModal').classList.add('hidden')
  })

  document.getElementById('lessonTitulo').addEventListener('input', e => {
    document.getElementById('previewTitle').textContent = e.target.value
  })
  document.getElementById('lessonDescripcion').addEventListener('input', e => {
    document.getElementById('previewDesc').textContent = e.target.value
  })

  document.getElementById('lessonViewList').addEventListener('click', () => {
    lessonListView = 'list'
    localStorage.setItem('admin_lesson_list_view', 'list')
    document.getElementById('lessonViewList').className = 'p-1.5 rounded-md transition-colors bg-[var(--black-10)] text-[var(--black-100)]'
    document.getElementById('lessonViewGrid').className = 'p-1.5 rounded-md transition-colors text-[var(--black-40)] hover:text-[var(--black-60)]'
    renderGroupedLessons(allLessons, document.getElementById('lessonSearch')?.value || '')
  })
  document.getElementById('lessonViewGrid').addEventListener('click', () => {
    lessonListView = 'grid'
    localStorage.setItem('admin_lesson_list_view', 'grid')
    document.getElementById('lessonViewList').className = 'p-1.5 rounded-md transition-colors text-[var(--black-40)] hover:text-[var(--black-60)]'
    document.getElementById('lessonViewGrid').className = 'p-1.5 rounded-md transition-colors bg-[var(--black-10)] text-[var(--black-100)]'
    renderGroupedLessons(allLessons, document.getElementById('lessonSearch')?.value || '')
  })

  document.getElementById('togglePreview').addEventListener('click', () => {
    lessonPreviewVisible = !lessonPreviewVisible
    localStorage.setItem('admin_lesson_preview', String(lessonPreviewVisible))
    applyPreviewState()
  })

  document.querySelectorAll('.add-block').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type
      const defaults = {
        step:            { type, text: '' },
        image:           { type, url: '', caption: '' },
        video:           { type, url: '', label: '' },
        link:            { type, url: '', label: '' },
        bot_nota:        { type, content: '' },
        bot_advertencia: { type, content: '' },
        bot_pasos:       { type, content: '' },
        bot_relacionado: { type, content: '' },
        bot_faq:         { type, content: '' },
      }
      currentBlocks.push(defaults[type])
      renderBlockList()
      updatePreview()
    })
  })

  document.getElementById('addQuestion').addEventListener('click', () => {
    currentQuestions.push({ pregunta: '', opciones: ['', ''], correcta: 0 })
    renderQuestionList()
  })

  document.getElementById('saveLessonBtn').addEventListener('click', async () => {
    const titulo = document.getElementById('lessonTitulo').value.trim()
    const orden = parseInt(document.getElementById('lessonOrden').value)
    if (!titulo || isNaN(orden)) {
      alert('Completa Título y Orden antes de guardar.')
      return
    }
    const btn = document.getElementById('saveLessonBtn')
    btn.disabled = true
    btn.textContent = 'Guardando...'
    const id = document.getElementById('lessonId').value
    const payload = {
      titulo,
      descripcion: document.getElementById('lessonDescripcion').value,
      contenido: JSON.stringify(currentBlocks),
      orden,
      categoria: document.getElementById('lessonCategoria').value,
      notas: document.getElementById('lessonNotas').value.trim() || null,
      examen: currentQuestions.length ? { preguntas: currentQuestions } : null,
    }
    const { error } = id
      ? await supabase.from('lecciones').update(payload).eq('id', id)
      : await supabase.from('lecciones').insert(payload)
    if (error) {
      alert('Error al guardar: ' + error.message)
      btn.disabled = false
      btn.textContent = 'Guardar lección'
      return
    }
    logActivity(id ? 'update' : 'create', 'lesson', titulo)
    // Regenerate RAG embedding asynchronously (fire-and-forget)
    const savedId = id || (await supabase.from('lecciones').select('id').eq('titulo', titulo).order('created_at', { ascending: false }).limit(1).single()).data?.id
    if (savedId) embedLesson(savedId, titulo, payload.categoria, currentBlocks)
    document.getElementById('lessonFormModal').classList.add('hidden')
    renderLessonsPanel()
  })
}

function renderGroupedLessons(allLessons, searchQuery) {
  const list = document.getElementById('lessonsList')
  if (!list) return
  const q = searchQuery.toLowerCase().trim()
  const filtered = q
    ? allLessons.filter(l =>
        l.titulo.toLowerCase().includes(q) || (l.descripcion || '').toLowerCase().includes(q))
    : allLessons

  if (!filtered.length && q) {
    list.innerHTML = `
      <div class="flex flex-col items-center justify-center py-12 text-center">
        <i data-lucide="search-x" class="w-10 h-10 text-[var(--black-40)] mb-3"></i>
        <p class="font-bold text-[var(--black-60)] mb-1">Sin resultados</p>
        <p class="text-xs text-[var(--black-40)]">Ninguna lección coincide con "<span class="font-medium">${escapeHtml(q)}</span>"</p>
      </div>`
    lucide.createIcons()
    return
  }

  if (q) {
    list.innerHTML = lessonListView === 'grid'
      ? `<div class="grid grid-cols-2 lg:grid-cols-3 gap-3">${filtered.map(l => lessonCardGridHtml(l)).join('')}</div>`
      : filtered.map(l => lessonCardHtml(l)).join('')
  } else {
    const byCategory = {}
    const uncategorized = []
    for (const l of filtered) {
      if (l.categoria) {
        if (!byCategory[l.categoria]) byCategory[l.categoria] = []
        byCategory[l.categoria].push(l)
      } else {
        uncategorized.push(l)
      }
    }
    let html = ''
    for (const cat of currentCategories) {
      const catLessons = byCategory[cat.nombre] || []
      html += `<div class="mb-6">
        <div class="flex items-center gap-2 mb-2 pb-1.5 border-b border-[var(--blue-10)]">
          <span>${escapeHtml(cat.emoji)}</span>
          <span class="font-black text-sm text-[var(--black-100)]">${escapeHtml(cat.nombre)}</span>
          <span class="text-xs text-[var(--black-40)] ml-1">${catLessons.length}</span>
        </div>
        ${catLessons.length
          ? lessonListView === 'grid'
            ? `<div class="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">${catLessons.map(l => lessonCardGridHtml(l)).join('')}</div>`
            : catLessons.map(l => lessonCardHtml(l)).join('')
          : '<p class="text-xs text-[var(--black-40)] pl-1 pb-2">Sin lecciones.</p>'}
      </div>`
    }
    if (uncategorized.length) {
      html += `<div class="mb-6">
        <div class="flex items-center gap-2 mb-2 pb-1.5 border-b border-[var(--blue-10)]">
          <span>📁</span>
          <span class="font-black text-sm text-[var(--black-100)]">Sin categoría</span>
          <span class="text-xs text-[var(--black-40)] ml-1">${uncategorized.length}</span>
        </div>
        ${lessonListView === 'grid'
          ? `<div class="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">${uncategorized.map(l => lessonCardGridHtml(l)).join('')}</div>`
          : uncategorized.map(l => lessonCardHtml(l)).join('')}
      </div>`
    }
    if (!html) {
      list.innerHTML = `
        <div class="flex flex-col items-center justify-center py-16 text-center">
          <div class="w-16 h-16 rounded-2xl bg-[var(--black-10)] flex items-center justify-center mb-4">
            <i data-lucide="book-open" class="w-8 h-8 text-[var(--black-40)]"></i>
          </div>
          <p class="font-bold text-[var(--black-100)] mb-1">Aún no hay lecciones</p>
          <p class="text-xs text-[var(--black-40)] mb-4">Crea la primera lección para que los estudiantes comiencen</p>
          <button id="emptyAddLesson" class="bg-[var(--blue-100)] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 mx-auto">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i> Crear primera lección
          </button>
        </div>`
      lucide.createIcons()
      document.getElementById('emptyAddLesson')?.addEventListener('click', () => openLessonForm())
      return
    }
    list.innerHTML = html
  }

  lucide.createIcons()
  wireLessonCards()
}

function lessonCardHtml(l) {
  return `
    <div class="lesson-card bg-white rounded-xl border ${l.active === false ? 'border-[var(--black-10)] opacity-50' : 'border-[var(--blue-10)]'} p-3.5 flex items-center gap-3 mb-2 cursor-pointer hover:border-[var(--blue-100)] hover:shadow-sm transition-all" data-id="${l.id}">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <p class="font-bold text-sm text-[var(--black-100)] truncate">${escapeHtml(l.titulo)}</p>
          <span class="shrink-0 text-[10px] text-[var(--black-40)]">#${escapeHtml(String(l.orden))}</span>
          ${l.active === false ? '<span class="shrink-0 text-[10px] font-bold text-[var(--black-40)] bg-[var(--black-10)] px-1.5 py-0.5 rounded-full">Oculta</span>' : ''}
        </div>
        <p class="text-xs text-[var(--black-40)] mt-0.5 line-clamp-1">${escapeHtml(l.descripcion || '')}</p>
      </div>
      <div class="flex gap-1 shrink-0">
        <button data-id="${l.id}" data-active="${l.active === false ? 'false' : 'true'}" class="toggle-lesson p-1.5 rounded-lg transition-colors ${l.active === false ? 'text-[var(--black-40)] hover:text-[var(--success-150)]' : 'text-[var(--success-150)] hover:text-[var(--black-40)]'}" title="${l.active === false ? 'Mostrar a estudiantes' : 'Ocultar a estudiantes'}">
          <i data-lucide="${l.active === false ? 'eye-off' : 'eye'}" class="w-4 h-4"></i>
        </button>
        <button data-id="${l.id}" data-bot-active="${l.bot_active === false ? 'false' : 'true'}" class="toggle-bot p-1.5 rounded-lg transition-colors ${l.bot_active === false ? 'text-[var(--black-40)] hover:text-[var(--coral-100)]' : 'text-[var(--coral-100)] hover:text-[var(--black-40)]'}" title="${l.bot_active === false ? 'Activar en Bodi' : 'Desactivar en Bodi'}">
          <i data-lucide="bot" class="w-4 h-4"></i>
        </button>
        <button data-id="${l.id}" class="copy-whatsapp p-1.5 rounded-lg hover:bg-green-50 text-[var(--black-40)] hover:text-green-600" title="Copiar para WhatsApp">
          <i data-lucide="share-2" class="w-4 h-4"></i>
        </button>
        <button data-id="${l.id}" data-titulo="${escapeHtml(l.titulo)}" class="del-lesson p-1.5 rounded-lg hover:bg-[var(--blue-10)] text-[var(--black-40)] hover:text-[var(--blue-100)]" title="Eliminar">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    </div>`
}

function lessonCardGridHtml(l) {
  const cat = currentCategories.find(c => c.nombre === l.categoria)
  return `
    <div class="lesson-card bg-white rounded-xl border ${l.active === false ? 'border-[var(--black-10)] opacity-50' : 'border-[var(--blue-10)]'} p-3.5 cursor-pointer hover:border-[var(--blue-100)] hover:shadow-sm transition-all flex flex-col gap-2" data-id="${l.id}">
      <div class="flex items-start justify-between gap-2">
        <p class="font-bold text-sm text-[var(--black-100)] leading-tight line-clamp-2 flex-1">${escapeHtml(l.titulo)}</p>
        <div class="flex items-center gap-1 shrink-0">
          ${l.active === false ? '<span class="text-[10px] font-bold text-[var(--black-40)] bg-[var(--black-10)] px-1.5 py-0.5 rounded-full">Oculta</span>' : ''}
          <span class="text-[10px] text-[var(--black-40)] font-bold">#${escapeHtml(String(l.orden))}</span>
        </div>
      </div>
      ${l.descripcion ? `<p class="text-xs text-[var(--black-40)] line-clamp-2">${escapeHtml(l.descripcion)}</p>` : ''}
      ${cat ? `<span class="self-start text-[10px] font-bold text-[var(--black-40)] bg-[var(--background-page)] px-2 py-0.5 rounded-full">${escapeHtml(cat.emoji)} ${escapeHtml(cat.nombre)}</span>` : ''}
      <div class="flex gap-1 mt-auto pt-2 border-t border-[var(--blue-10)]">
        <button data-id="${l.id}" data-active="${l.active === false ? 'false' : 'true'}" class="toggle-lesson flex-1 flex items-center justify-center py-1 rounded-lg transition-colors ${l.active === false ? 'text-[var(--black-40)] hover:text-[var(--success-150)]' : 'text-[var(--success-150)] hover:text-[var(--black-40)]'}" title="${l.active === false ? 'Mostrar a estudiantes' : 'Ocultar a estudiantes'}">
          <i data-lucide="${l.active === false ? 'eye-off' : 'eye'}" class="w-3.5 h-3.5"></i>
        </button>
        <button data-id="${l.id}" data-bot-active="${l.bot_active === false ? 'false' : 'true'}" class="toggle-bot flex-1 flex items-center justify-center py-1 rounded-lg transition-colors ${l.bot_active === false ? 'text-[var(--black-40)] hover:text-[var(--coral-100)]' : 'text-[var(--coral-100)] hover:text-[var(--black-40)]'}" title="${l.bot_active === false ? 'Activar en Bodi' : 'Desactivar en Bodi'}">
          <i data-lucide="bot" class="w-3.5 h-3.5"></i>
        </button>
        <button data-id="${l.id}" class="copy-whatsapp flex-1 flex items-center justify-center py-1 rounded-lg hover:bg-green-50 text-[var(--black-40)] hover:text-green-600">
          <i data-lucide="share-2" class="w-3.5 h-3.5"></i>
        </button>
        <button data-id="${l.id}" data-titulo="${escapeHtml(l.titulo)}" class="del-lesson flex-1 flex items-center justify-center py-1 rounded-lg hover:bg-[var(--blue-10)] text-[var(--black-40)] hover:text-[var(--blue-100)]">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>`
}

function wireLessonCards() {
  const list = document.getElementById('lessonsList')
  if (!list) return

  list.querySelectorAll('.toggle-lesson').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation()
      const newActive = btn.dataset.active === 'false'
      const { error } = await supabase.from('lecciones').update({ active: newActive }).eq('id', btn.dataset.id)
      if (!error) { showToast(newActive ? 'Lección visible para estudiantes.' : 'Lección oculta para estudiantes.'); renderLessonsPanel() }
      else showToast('Error al actualizar.')
    })
  })

  list.querySelectorAll('.toggle-bot').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation()
      const newBotActive = btn.dataset.botActive === 'false'
      const { error } = await supabase.from('lecciones').update({ bot_active: newBotActive }).eq('id', btn.dataset.id)
      if (!error) { showToast(newBotActive ? 'Lección activada en Bodi.' : 'Lección desactivada en Bodi.'); renderLessonsPanel() }
      else showToast('Error al actualizar.')
    })
  })

  list.querySelectorAll('.lesson-card').forEach(card => {
    card.addEventListener('click', async e => {
      if (e.target.closest('.del-lesson') || e.target.closest('.copy-whatsapp') || e.target.closest('.toggle-lesson') || e.target.closest('.toggle-bot')) return
      const { data } = await supabase.from('lecciones').select('*').eq('id', card.dataset.id).single()
      if (data) openLessonForm(data)
    })
  })

  list.querySelectorAll('.copy-whatsapp').forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation()
    const { data } = await supabase.from('lecciones').select('*').eq('id', b.dataset.id).single()
    if (!data) return
    const icon = b.querySelector('i')
    b.title = '¡Copiado!'
    if (icon) { icon.setAttribute('data-lucide', 'check'); lucide.createIcons() }
    setTimeout(() => {
      b.title = 'Copiar para WhatsApp'
      if (icon) { icon.setAttribute('data-lucide', 'share-2'); lucide.createIcons() }
    }, 2000)
    copyLessonToWhatsApp(data)
  }))

  list.querySelectorAll('.del-lesson').forEach(b => b.addEventListener('click', async e => {
    e.stopPropagation()
    if (!confirm(`¿Eliminar la lección "${b.dataset.titulo}"?\nEsta acción no se puede deshacer.`)) return
    const { error } = await supabase.from('lecciones').delete().eq('id', b.dataset.id)
    if (error) { showToast('Error al eliminar: ' + error.message, 'error'); return }
    logActivity('delete', 'lesson', b.dataset.titulo)
    renderLessonsPanel()
  }))
}

function applyPreviewState() {
  const formGrid = document.getElementById('lessonFormGrid')
  const previewPanel = document.getElementById('lessonPreviewPanel')
  const btn = document.getElementById('togglePreview')
  if (!formGrid || !previewPanel || !btn) return
  const icon = btn.querySelector('i[data-lucide]')
  if (lessonPreviewVisible) {
    formGrid.style.gridTemplateColumns = '1fr 1fr'
    previewPanel.classList.remove('hidden')
    if (icon) icon.setAttribute('data-lucide', 'eye')
    btn.classList.remove('text-[var(--black-40)]')
    btn.classList.add('text-[var(--black-40)]')
  } else {
    formGrid.style.gridTemplateColumns = '1fr'
    previewPanel.classList.add('hidden')
    if (icon) icon.setAttribute('data-lucide', 'eye-off')
    btn.classList.remove('text-[var(--black-40)]')
    btn.classList.add('text-[var(--black-40)]')
  }
  lucide.createIcons()
}

function openLessonForm(lesson = null) {
  document.getElementById('lessonFormTitle').textContent = lesson ? 'Editar lección' : 'Nueva lección'
  document.getElementById('lessonId').value = lesson?.id || ''
  document.getElementById('lessonTitulo').value = lesson?.titulo || ''
  document.getElementById('lessonDescripcion').value = lesson?.descripcion || ''
  document.getElementById('lessonNotas').value = lesson?.notas || ''
  document.getElementById('lessonOrden').value = lesson?.orden || ''
  document.getElementById('previewTitle').textContent = lesson?.titulo || ''
  document.getElementById('previewDesc').textContent = lesson?.descripcion || ''

  const catSelect = document.getElementById('lessonCategoria')
  catSelect.innerHTML = currentCategories.map(c =>
    `<option value="${escapeHtml(c.nombre)}">${escapeHtml(c.emoji)} ${escapeHtml(c.nombre)}</option>`
  ).join('')
  catSelect.value = lesson?.categoria || (currentCategories[0]?.nombre || '')

  try {
    currentBlocks = lesson?.contenido ? JSON.parse(lesson.contenido) : []
    if (!Array.isArray(currentBlocks)) currentBlocks = []
  } catch (_) {
    currentBlocks = []
  }

  try {
    const examData = lesson?.examen
      ? (typeof lesson.examen === 'string' ? JSON.parse(lesson.examen) : lesson.examen)
      : null
    currentQuestions = Array.isArray(examData?.preguntas) ? examData.preguntas : []
  } catch (_) {
    currentQuestions = []
  }

  document.getElementById('lessonFormModal').classList.remove('hidden')
  renderBlockList()
  renderQuestionList()
  updatePreview()
  applyPreviewState()
}

function markdownToHtml(text) {
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>')
  text = text.replace(/__(.+?)__/g, '<u>$1</u>')
  return text
}

function renderBlockList() {
  const list = document.getElementById('blockList')
  if (!list) return
  if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null }
  Object.values(quillInstances).forEach(q => { try { q.enable(false) } catch (_) {} })
  quillInstances = {}

  list.innerHTML = currentBlocks.map((b, i) => blockItemHtml(b, i)).join('')
  lucide.createIcons()

  list.querySelectorAll('input[data-field], textarea[data-field]').forEach(input => {
    input.addEventListener('input', () => {
      const idx = parseInt(input.closest('[data-idx]').dataset.idx)
      currentBlocks[idx][input.dataset.field] = input.value
      updatePreview()
    })
  })

  list.querySelectorAll('.quill-step-editor').forEach(wrapper => {
    const idx = parseInt(wrapper.closest('[data-idx]').dataset.idx)
    const raw = currentBlocks[idx]?.text != null ? String(currentBlocks[idx].text) : ''
    const html = /<[a-z]/i.test(raw) ? raw : markdownToHtml(raw)

    const quill = new Quill(wrapper, {
      theme: 'snow',
      placeholder: 'Texto del paso...',
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
        ],
      },
    })

    if (html) quill.root.innerHTML = html

    quill.on('text-change', () => {
      const content = quill.root.innerHTML
      currentBlocks[idx].text = content === '<p><br></p>' ? '' : content
      updatePreview()
    })

    quillInstances[idx] = quill
  })

  list.querySelectorAll('.del-block').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.closest('[data-idx]').dataset.idx)
      currentBlocks.splice(idx, 1)
      renderBlockList()
      updatePreview()
    })
  })

  list.querySelectorAll('.move-up').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.closest('[data-idx]').dataset.idx)
      if (idx === 0) return
      const moved = currentBlocks.splice(idx, 1)[0]
      currentBlocks.splice(idx - 1, 0, moved)
      renderBlockList()
      updatePreview()
    })
  })

  list.querySelectorAll('.move-down').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.closest('[data-idx]').dataset.idx)
      if (idx === currentBlocks.length - 1) return
      const moved = currentBlocks.splice(idx, 1)[0]
      currentBlocks.splice(idx + 1, 0, moved)
      renderBlockList()
      updatePreview()
    })
  })

  list.querySelectorAll('.upload-zone').forEach(zone => setupUploadZone(zone))

  sortableInstance = Sortable.create(list, {
    handle: '.drag-handle',
    animation: 150,
    onEnd(evt) {
      const moved = currentBlocks.splice(evt.oldIndex, 1)[0]
      currentBlocks.splice(evt.newIndex, 0, moved)
      renderBlockList()
      updatePreview()
    },
  })
}

function blockItemHtml(block, i) {
  const colors = { step: 'var(--blue-100)', image: '#3b82f6', video: '#8b5cf6', link: '#16a34a',
    bot_nota: '#d97706', bot_advertencia: '#d97706', bot_pasos: '#d97706', bot_relacionado: '#d97706', bot_faq: '#d97706' }
  const labels = { step: '📝 Paso', image: '🖼️ Imagen', video: '▶️ Video YouTube', link: '🔗 Link',
    bot_nota: '💡 Nota — Solo Bodi', bot_advertencia: '⚠️ Advertencia — Solo Bodi',
    bot_pasos: '📋 Pasos internos — Solo Bodi', bot_relacionado: '🔗 Relacionado — Solo Bodi', bot_faq: '❓ Preg. frecuente — Solo Bodi' }
  const color = colors[block.type] || '#94a3b8'
  const label = labels[block.type] || escapeHtml(block.type)
  const isBotBlock = block.type.startsWith('bot_')

  let fields = ''
  if (isBotBlock) {
    const placeholders = {
      bot_nota: 'Contexto adicional o aclaración para Bodi...',
      bot_advertencia: 'Error común o restricción importante que Bodi debe mencionar...',
      bot_pasos: 'Secuencia de pasos internos que Bodi debe guiar...',
      bot_relacionado: 'Módulos o temas relacionados que Bodi puede mencionar...',
      bot_faq: 'Pregunta frecuente y respuesta que Bodi debe saber...',
    }
    fields = `<textarea data-field="content" rows="2" placeholder="${placeholders[block.type] || ''}"
      class="w-full px-2 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-xs outline-none focus:border-amber-400 resize-none">${escapeHtml(block.content || '')}</textarea>`
  } else if (block.type === 'step') {
    fields = `<div class="quill-step-editor"></div>`
  } else if (block.type === 'image') {
    fields = `
      <input data-field="url" value="${escapeHtml(block.url || '')}" class="hidden">
      <div class="upload-zone border-2 border-dashed border-[var(--blue-20)] rounded-lg p-3 text-center mb-1.5 transition-colors">
        ${block.url ? `
          <div class="flex items-center gap-2 bg-[var(--background-page)] rounded-lg p-2">
            <img src="${escapeHtml(block.url)}" class="w-10 h-10 object-cover rounded shrink-0" onerror="this.style.display='none'">
            <span class="text-xs text-[var(--black-60)] truncate flex-1">${escapeHtml(block.url.split('/').pop())}</span>
            <button type="button" class="clear-upload text-[var(--black-40)] hover:text-[var(--blue-100)] text-sm px-1">✕</button>
          </div>
        ` : `
          <p class="text-[var(--black-40)] text-xs mb-2">🖼️ Arrastra una imagen aquí o</p>
          <div class="flex gap-1.5 justify-center">
            <button type="button" class="pick-file px-3 py-1.5 bg-[var(--blue-100)] text-white text-xs rounded-lg">📁 Buscar</button>
            <button type="button" class="pick-library px-3 py-1.5 bg-[var(--black-10)] text-[var(--black-60)] text-xs rounded-lg border border-[var(--blue-20)]">🗂️ Biblioteca</button>
          </div>
        `}
        <div class="upload-progress hidden mt-2">
          <div class="h-1 bg-[var(--blue-20)] rounded-full overflow-hidden"><div class="upload-bar h-full bg-[var(--blue-100)] transition-all" style="width:0%"></div></div>
          <p class="text-xs text-[var(--black-40)] mt-1">Subiendo...</p>
        </div>
      </div>
      <input data-field="caption" value="${escapeHtml(block.caption || '')}" placeholder="Pie de foto (opcional)"
        class="w-full px-2 py-1.5 rounded-lg border border-[var(--blue-20)] text-xs outline-none focus:border-[var(--blue-100)]">`
  } else if (block.type === 'video') {
    fields = `<input data-field="url" value="${escapeHtml(block.url || '')}" placeholder="URL de YouTube"
        class="w-full px-2 py-1.5 rounded-lg border border-[var(--blue-20)] text-xs outline-none focus:border-[var(--blue-100)] mb-1.5">
      <input data-field="label" value="${escapeHtml(block.label || '')}" placeholder="Etiqueta del video"
        class="w-full px-2 py-1.5 rounded-lg border border-[var(--blue-20)] text-xs outline-none focus:border-[var(--blue-100)]">`
  } else if (block.type === 'link') {
    fields = `<input data-field="url" value="${escapeHtml(block.url || '')}" placeholder="URL del enlace"
        class="w-full px-2 py-1.5 rounded-lg border border-[var(--blue-20)] text-xs outline-none focus:border-[var(--blue-100)] mb-1.5">
      <input data-field="label" value="${escapeHtml(block.label || '')}" placeholder="Texto del enlace"
        class="w-full px-2 py-1.5 rounded-lg border border-[var(--blue-20)] text-xs outline-none focus:border-[var(--blue-100)]">`
  }

  const cardBg = isBotBlock ? 'bg-amber-50 border-amber-200' : 'bg-[var(--background-page)] border-[var(--blue-20)]'
  const isFirst = i === 0
  const isLast = i === currentBlocks.length - 1
  return `<div data-idx="${i}" class="${cardBg} border rounded-xl p-2.5 flex items-start gap-2">
    <div class="flex flex-col items-center gap-0.5 shrink-0 mt-0.5">
      <div class="drag-handle text-[var(--black-40)] text-lg cursor-grab select-none leading-none">⠿</div>
      <button class="move-up text-[var(--black-40)] hover:text-[var(--black-60)] transition-colors p-0.5 rounded ${isFirst ? 'opacity-30 cursor-not-allowed' : ''}" ${isFirst ? 'disabled' : ''} aria-label="Mover bloque arriba">
        <i data-lucide="chevron-up" class="w-3.5 h-3.5"></i>
      </button>
      <button class="move-down text-[var(--black-40)] hover:text-[var(--black-60)] transition-colors p-0.5 rounded ${isLast ? 'opacity-30 cursor-not-allowed' : ''}" ${isLast ? 'disabled' : ''} aria-label="Mover bloque abajo">
        <i data-lucide="chevron-down" class="w-3.5 h-3.5"></i>
      </button>
    </div>
    <div class="flex-1 min-w-0">
      <div class="text-[9px] font-black uppercase mb-1.5" style="color:${color}">${label}</div>
      ${fields}
    </div>
    <button class="del-block text-[var(--black-40)] hover:text-[var(--blue-100)] text-sm px-1 mt-0.5 shrink-0" aria-label="Eliminar bloque">✕</button>
  </div>`
}

function renderQuestionList() {
  const list = document.getElementById('questionList')
  if (!list) return
  if (questionsSortable) { questionsSortable.destroy(); questionsSortable = null }

  list.innerHTML = currentQuestions.map((q, qi) => `
    <div data-qi="${qi}" class="bg-white border border-[var(--blue-20)] rounded-xl p-3">
      <div class="flex items-start gap-2 mb-2">
        <div class="drag-handle-q text-[var(--black-40)] text-lg cursor-grab select-none leading-none mt-0.5">⠿</div>
        <input data-qi="${qi}" class="q-text flex-1 px-2 py-1.5 rounded-lg border border-[var(--blue-20)] text-xs outline-none focus:border-[var(--blue-100)]"
          placeholder="Pregunta" value="${escapeHtml(q.pregunta || '')}">
        <button data-qi="${qi}" class="del-q text-[var(--black-40)] hover:text-[var(--blue-100)] text-sm px-1 shrink-0 mt-1" aria-label="Eliminar pregunta">✕</button>
      </div>
      <div class="space-y-1.5 ml-6">
        ${(q.opciones || []).map((op, oi) => `
          <div class="flex items-center gap-2">
            <input type="radio" name="correct-${qi}" data-qi="${qi}" data-oi="${oi}" class="correct-radio shrink-0" ${q.correcta === oi ? 'checked' : ''}>
            <input data-qi="${qi}" data-oi="${oi}" class="opt-text flex-1 px-2 py-1 rounded-lg border border-[var(--blue-20)] text-xs outline-none focus:border-[var(--blue-100)]"
              placeholder="Opción ${oi + 1}" value="${escapeHtml(op || '')}">
            ${q.opciones.length > 2 ? `<button data-qi="${qi}" data-oi="${oi}" class="del-opt text-[var(--black-40)] hover:text-[var(--blue-100)] text-xs px-1" aria-label="Eliminar opción ${oi + 1}">✕</button>` : ''}
          </div>
        `).join('')}
        ${q.opciones.length < 4 ? `<button data-qi="${qi}" class="add-opt text-[10px] font-bold text-[var(--black-40)] hover:text-[var(--black-100)] mt-1">+ Opción</button>` : ''}
      </div>
    </div>
  `).join('')

  list.querySelectorAll('.q-text').forEach(input => {
    input.addEventListener('input', () => { currentQuestions[+input.dataset.qi].pregunta = input.value })
  })
  list.querySelectorAll('.opt-text').forEach(input => {
    input.addEventListener('input', () => { currentQuestions[+input.dataset.qi].opciones[+input.dataset.oi] = input.value })
  })
  list.querySelectorAll('.correct-radio').forEach(radio => {
    radio.addEventListener('change', () => { if (radio.checked) currentQuestions[+radio.dataset.qi].correcta = +radio.dataset.oi })
  })
  list.querySelectorAll('.del-q').forEach(btn => {
    btn.addEventListener('click', () => { currentQuestions.splice(+btn.dataset.qi, 1); renderQuestionList() })
  })
  list.querySelectorAll('.del-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = currentQuestions[+btn.dataset.qi]
      q.opciones.splice(+btn.dataset.oi, 1)
      if (q.correcta >= q.opciones.length) q.correcta = 0
      renderQuestionList()
    })
  })
  list.querySelectorAll('.add-opt').forEach(btn => {
    btn.addEventListener('click', () => { currentQuestions[+btn.dataset.qi].opciones.push(''); renderQuestionList() })
  })

  if (list.children.length > 0) {
    questionsSortable = Sortable.create(list, {
      handle: '.drag-handle-q',
      animation: 150,
      onEnd(evt) {
        const moved = currentQuestions.splice(evt.oldIndex, 1)[0]
        currentQuestions.splice(evt.newIndex, 0, moved)
        renderQuestionList()
      },
    })
  }
}

function updatePreview() {
  const preview = document.getElementById('lessonPreview')
  if (!preview) return
  preview.innerHTML = ''
  preview.appendChild(renderBlocks(currentBlocks))
}

async function renderGlossaryPanel() {
  const el = document.getElementById('panel-glossary')
  const { data } = await supabase.from('glosario').select('*').order('termino')

  el.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-black">Glosario</h2>
      <button id="addTerm" class="bg-[var(--blue-100)] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:scale-105 transition-transform">
        <i data-lucide="plus" class="w-3.5 h-3.5"></i> Nuevo término
      </button>
    </div>
    <div class="space-y-2">
      ${(data || []).map(g => `
        <div class="bg-white rounded-xl border border-[var(--blue-10)] p-3 flex items-start justify-between gap-3">
          <div>
            <p class="font-bold text-sm text-[var(--blue-100)]">${escapeHtml(g.termino)}</p>
            <p class="text-xs text-[var(--black-60)] mt-0.5">${escapeHtml(g.definicion)}</p>
          </div>
          <div class="flex gap-1 shrink-0">
            <button data-id="${g.id}" data-term="${escapeHtml(g.termino)}" data-def="${escapeHtml(g.definicion)}" class="edit-term p-1.5 rounded-lg hover:bg-[var(--black-10)] text-[var(--black-60)]" aria-label="Editar término ${escapeHtml(g.termino)}">
              <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
            <button data-id="${g.id}" class="del-term p-1.5 rounded-lg hover:bg-[var(--blue-10)] text-[var(--black-60)] hover:text-[var(--blue-100)]" aria-label="Eliminar término ${escapeHtml(g.termino)}">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `).join('') || '<p class="text-[var(--black-40)] text-sm">No hay términos aún.</p>'}
    </div>
    <div id="termForm" class="hidden mt-4 bg-white rounded-2xl border border-[var(--blue-20)] p-4">
      <input type="hidden" id="termId">
      <input id="termTermino" placeholder="Término" required class="w-full px-3 py-2 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)] mb-2">
      <textarea id="termDefinicion" placeholder="Definición" rows="2" required class="w-full px-3 py-2 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)] resize-none mb-2"></textarea>
      <div class="flex gap-2">
        <button id="cancelTerm" class="flex-1 py-2 rounded-xl border border-[var(--blue-20)] text-sm font-bold text-[var(--black-60)]">Cancelar</button>
        <button id="saveTerm" class="flex-1 py-2 rounded-xl bg-[var(--blue-100)] text-white text-sm font-bold">Guardar</button>
      </div>
    </div>
  `
  lucide.createIcons()

  document.getElementById('addTerm').addEventListener('click', () => {
    document.getElementById('termId').value = ''
    document.getElementById('termTermino').value = ''
    document.getElementById('termDefinicion').value = ''
    document.getElementById('termForm').classList.remove('hidden')
  })
  document.querySelectorAll('.edit-term').forEach(b => b.addEventListener('click', () => {
    document.getElementById('termId').value = b.dataset.id
    document.getElementById('termTermino').value = b.dataset.term
    document.getElementById('termDefinicion').value = b.dataset.def
    document.getElementById('termForm').classList.remove('hidden')
  }))
  document.querySelectorAll('.del-term').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Eliminar este término?')) return
    await supabase.from('glosario').delete().eq('id', b.dataset.id)
    renderGlossaryPanel()
  }))
  document.getElementById('cancelTerm').addEventListener('click', () => {
    document.getElementById('termForm').classList.add('hidden')
  })
  document.getElementById('saveTerm').addEventListener('click', async () => {
    const btn = document.getElementById('saveTerm')
    btn.disabled = true
    btn.textContent = 'Guardando...'
    const id = document.getElementById('termId').value
    const payload = {
      termino: document.getElementById('termTermino').value,
      definicion: document.getElementById('termDefinicion').value,
    }
    const { error } = id
      ? await supabase.from('glosario').update(payload).eq('id', id)
      : await supabase.from('glosario').insert(payload)
    if (error) {
      alert('Error al guardar: ' + error.message)
      btn.disabled = false
      btn.textContent = 'Guardar'
      return
    }
    renderGlossaryPanel()
  })
}

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
    logActivity('move', 'image', displayName(oldPath.split('/').pop()), { to: targetFolderPath })
    renderMaterialPanel()
  } catch (e) {
    showToast('Error al mover: ' + e.message, 'error')
  }
}

function renderFolderBreadcrumb() {
  const container = document.getElementById('folderBreadcrumb')
  if (!container) return
  const parts = currentFolderPath ? currentFolderPath.split('/') : []
  const crumbs = [
    { label: 'Todos los archivos', path: '' },
    ...parts.map((p, i) => ({ label: p, path: parts.slice(0, i + 1).join('/') }))
  ]
  container.innerHTML = crumbs.map((c, i) => {
    const isLast = i === crumbs.length - 1
    if (isLast) return `<span class="text-[var(--black-100)] font-bold text-sm">${escapeHtml(c.label)}</span>`
    return `<button class="folder-crumb text-[var(--blue-100)] hover:underline text-sm font-bold" data-path="${escapeHtml(c.path)}">${escapeHtml(c.label)}</button><span class="text-[var(--black-40)] text-sm">/</span>`
  }).join('')

  container.querySelectorAll('.folder-crumb').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFolderPath = btn.dataset.path
      renderMaterialPanel()
    })
  })
}

async function renderMaterialPanel() {
  const el = document.getElementById('panel-material')
  el.innerHTML = `
    <div class="max-w-4xl mx-auto">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-black">Biblioteca de archivos</h2>
        <button id="newFolderBtn" class="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-[var(--blue-20)] text-xs font-bold text-[var(--black-60)] hover:bg-[var(--background-page)]">
          <i data-lucide="folder-plus" class="w-3.5 h-3.5"></i> Nueva carpeta
        </button>
      </div>

      <div id="folderBreadcrumb" class="flex items-center gap-1 mb-3 flex-wrap min-h-[24px]"></div>

      <div id="newFolderForm" class="hidden bg-white border border-[var(--blue-20)] rounded-xl p-3 mb-4 flex items-center gap-2">
        <i data-lucide="folder" class="w-4 h-4 text-[var(--black-40)] shrink-0"></i>
        <input id="newFolderInput" type="text" placeholder="Nombre de la carpeta" autocomplete="off"
          class="flex-1 px-2 py-1 rounded-lg border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)]">
        <button id="cancelNewFolder" class="px-3 py-1 rounded-lg border border-[var(--blue-20)] text-xs font-bold text-[var(--black-60)] hover:bg-[var(--background-page)]">Cancelar</button>
        <button id="confirmNewFolder" class="px-3 py-1 rounded-lg bg-[var(--blue-100)] text-white text-xs font-bold">Crear</button>
      </div>

      <div id="materialDropzone" class="border-2 border-dashed border-[var(--blue-20)] rounded-xl p-8 text-center mb-6 hover:border-[var(--blue-100)] transition-colors cursor-pointer">
        <i data-lucide="folder-open" class="w-10 h-10 text-[var(--black-40)] mx-auto mb-3 block"></i>
        <p class="text-[var(--black-40)] text-sm mb-3">Arrastra archivos aquí o</p>
        <button id="materialPickFile" class="px-4 py-2 bg-[var(--blue-100)] text-white text-sm rounded-lg font-bold flex items-center gap-1.5 mx-auto"><i data-lucide="upload" class="w-4 h-4"></i> Buscar archivo</button>
        <p class="text-xs text-[var(--black-40)] mt-2">Cualquier tipo · Máx. 50MB</p>
        <div id="materialProgress" class="hidden mt-4">
          <div class="h-1.5 bg-[var(--blue-20)] rounded-full overflow-hidden max-w-xs mx-auto">
            <div id="materialProgressBar" class="h-full bg-[var(--blue-100)] transition-all" style="width:0%"></div>
          </div>
          <p class="text-xs text-[var(--black-40)] mt-1">Subiendo...</p>
        </div>
      </div>

      <div class="flex items-center gap-3 mb-4">
        <input id="materialSearch" type="text" placeholder="🔍 Buscar archivos..."
          class="flex-1 px-3 py-2 border border-[var(--blue-20)] rounded-lg text-sm outline-none focus:border-[var(--blue-100)]">
        <span id="materialFileCount" class="text-xs text-[var(--black-40)] shrink-0"></span>
        <div class="flex gap-0.5 border border-[var(--blue-20)] rounded-lg p-0.5 shrink-0">
          <button id="viewGrid" class="p-1.5 rounded-md transition-colors ${materialView === 'grid' ? 'bg-[var(--black-10)] text-[var(--black-100)]' : 'text-[var(--black-40)] hover:text-[var(--black-60)]'}" aria-label="Vista cuadrícula">
            <i data-lucide="grid-3x3" class="w-4 h-4"></i>
          </button>
          <button id="viewList" class="p-1.5 rounded-md transition-colors ${materialView === 'list' ? 'bg-[var(--black-10)] text-[var(--black-100)]' : 'text-[var(--black-40)] hover:text-[var(--black-60)]'}" aria-label="Vista lista">
            <i data-lucide="list" class="w-4 h-4"></i>
          </button>
        </div>
      </div>

      <div id="materialGrid" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
        <p class="col-span-5 text-center text-[var(--black-40)] text-sm py-12">Cargando archivos...</p>
      </div>
    </div>
  `
  lucide.createIcons()
  renderFolderBreadcrumb()

  let files = []
  let currentFolders = []

  const loadFiles = async () => {
    const grid = document.getElementById('materialGrid')
    if (!grid) return
    grid.innerHTML = '<p class="col-span-5 text-center text-[var(--black-40)] text-sm py-12">Cargando...</p>'
    try {
      const result = await listFiles(currentFolderPath)
      files = result.files
      currentFolders = result.folders
      _materialCurrentFiles = files
      renderMaterialGrid(files, currentFolders)
    } catch {
      grid.innerHTML = `<p class="col-span-5 text-center text-red-400 text-sm py-12">Error al cargar. <button onclick="renderMaterialPanel()" class="underline">Reintentar</button></p>`
    }
  }

  await loadFiles()

  document.getElementById('materialSearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase()
    const filtered = files.filter(f => {
      const name = f.name.split('/').pop()
      return name.toLowerCase().includes(q)
    })
    _materialCurrentFiles = filtered
    renderMaterialGrid(filtered, q ? [] : currentFolders)
  })

  document.getElementById('viewGrid').addEventListener('click', () => {
    materialView = 'grid'
    localStorage.setItem('admin_material_view', 'grid')
    document.getElementById('viewGrid').className = 'p-1.5 rounded-md transition-colors bg-[var(--black-10)] text-[var(--black-100)]'
    document.getElementById('viewList').className = 'p-1.5 rounded-md transition-colors text-[var(--black-40)] hover:text-[var(--black-60)]'
    renderMaterialGrid(_materialCurrentFiles, currentFolders)
  })

  document.getElementById('viewList').addEventListener('click', () => {
    materialView = 'list'
    localStorage.setItem('admin_material_view', 'list')
    document.getElementById('viewGrid').className = 'p-1.5 rounded-md transition-colors text-[var(--black-40)] hover:text-[var(--black-60)]'
    document.getElementById('viewList').className = 'p-1.5 rounded-md transition-colors bg-[var(--black-10)] text-[var(--black-100)]'
    renderMaterialGrid(_materialCurrentFiles, currentFolders)
  })

  document.getElementById('newFolderBtn').addEventListener('click', () => {
    document.getElementById('newFolderForm').classList.remove('hidden')
    document.getElementById('newFolderInput').value = ''
    document.getElementById('newFolderInput').focus()
  })

  document.getElementById('cancelNewFolder').addEventListener('click', () => {
    document.getElementById('newFolderForm').classList.add('hidden')
  })

  document.getElementById('confirmNewFolder').addEventListener('click', async () => {
    const raw = document.getElementById('newFolderInput').value.trim()
    if (!raw) return
    const name = raw.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase() || 'carpeta'
    const folderPath = currentFolderPath ? `${currentFolderPath}/${name}` : name
    const btn = document.getElementById('confirmNewFolder')
    btn.disabled = true
    btn.textContent = 'Creando...'
    try {
      await createFolder(folderPath)
      document.getElementById('newFolderForm').classList.add('hidden')
      showToast(`Carpeta "${name}" creada`)
      logActivity('create', 'folder', name)
      await loadFiles()
    } catch (e) {
      showToast('Error al crear carpeta: ' + e.message, 'error')
      btn.disabled = false
      btn.textContent = 'Crear'
    }
  })

  document.getElementById('newFolderInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('confirmNewFolder').click()
    if (e.key === 'Escape') document.getElementById('cancelNewFolder').click()
  })

  const dropzone = document.getElementById('materialDropzone')
  const progressDiv = document.getElementById('materialProgress')
  const progressBar = document.getElementById('materialProgressBar')

  const doUpload = async (file) => {
    progressDiv.classList.remove('hidden')
    progressBar.style.width = '0%'
    try {
      await uploadFile(file, pct => { progressBar.style.width = pct + '%' }, currentFolderPath)
      showToast('Archivo subido correctamente')
      logActivity('create', 'image', displayName(file.name), { folder: currentFolderPath || 'raíz' })
      await loadFiles()
    } catch (e) {
      showToast(e.message || 'Error al subir archivo', 'error')
    } finally {
      progressDiv.classList.add('hidden')
    }
  }

  dropzone.addEventListener('dragover', e => {
    e.preventDefault()
    dropzone.classList.add('border-[var(--blue-100)]', 'bg-[var(--blue-10)]')
  })
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('border-[var(--blue-100)]', 'bg-[var(--blue-10)]')
  })
  dropzone.addEventListener('drop', e => {
    e.preventDefault()
    dropzone.classList.remove('border-[var(--blue-100)]', 'bg-[var(--blue-10)]')
    if (e.dataTransfer.files[0]) doUpload(e.dataTransfer.files[0])
  })

  document.getElementById('materialPickFile').addEventListener('click', e => {
    e.stopPropagation()
    const fi = document.createElement('input')
    fi.type = 'file'
    fi.onchange = () => fi.files[0] && doUpload(fi.files[0])
    fi.click()
  })
}

function renderMaterialGrid(files, folders = []) {
  const grid = document.getElementById('materialGrid')
  const count = document.getElementById('materialFileCount')
  if (!grid) return
  if (count) count.textContent = `${folders.length + files.length} elementos`

  if (!folders.length && !files.length) {
    grid.className = ''
    grid.innerHTML = '<p class="text-center text-[var(--black-40)] text-sm py-12">No hay archivos subidos aún</p>'
    return
  }

  if (materialView === 'list') {
    grid.className = 'space-y-2'
    const folderCards = folders.map(f => {
      const folderPath = currentFolderPath ? `${currentFolderPath}/${f.name}` : f.name
      return `
        <div class="folder-card group bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:border-amber-300 hover:bg-amber-100 transition-colors" data-path="${escapeHtml(folderPath)}">
          <i data-lucide="folder" class="w-8 h-8 text-amber-400 shrink-0"></i>
          <p class="text-sm font-bold text-[var(--black-100)] truncate flex-1">${escapeHtml(f.name)}</p>
          <i data-lucide="chevron-right" class="w-4 h-4 text-[var(--black-40)] shrink-0"></i>
        </div>`
    }).join('')
    grid.innerHTML = folderCards + files.map(f => `
      <div class="file-card flex items-center gap-3 bg-white border border-[var(--blue-10)] rounded-xl px-3 py-2.5 hover:border-[var(--blue-20)] transition-colors group" draggable="true" data-path="${escapeHtml(f.name)}">
        <div class="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg overflow-hidden bg-[var(--background-page)]">
          ${f.type.startsWith('image/')
            ? `<img src="${escapeHtml(f.url)}" alt="" class="w-10 h-10 object-cover" loading="lazy">`
            : fileIcon(f.type)}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-[var(--black-100)] truncate" title="${escapeHtml(displayName(f.name.split('/').pop()))}">${escapeHtml(displayName(f.name.split('/').pop()))}</p>
          <p class="text-xs text-[var(--black-40)]">${formatBytes(f.size)}</p>
        </div>
        <div class="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button class="preview-file p-1.5 rounded-lg hover:bg-blue-50 text-[var(--black-40)] hover:text-blue-500"
            data-url="${escapeHtml(f.url)}" data-type="${escapeHtml(f.type)}" data-name="${escapeHtml(f.name)}" aria-label="Ver ${escapeHtml(displayName(f.name.split('/').pop()))}">
            <i data-lucide="eye" class="w-4 h-4"></i>
          </button>
          <button class="rename-file p-1.5 rounded-lg hover:bg-amber-50 text-[var(--black-40)] hover:text-amber-500"
            data-path="${escapeHtml(f.name)}" data-display="${escapeHtml(displayName(f.name.split('/').pop()))}" aria-label="Renombrar ${escapeHtml(displayName(f.name.split('/').pop()))}">
            <i data-lucide="pencil" class="w-4 h-4"></i>
          </button>
          <button class="copy-url p-1.5 rounded-lg hover:bg-[var(--black-10)] text-[var(--black-40)] hover:text-[var(--black-60)]"
            data-url="${escapeHtml(f.url)}" data-name="${escapeHtml(f.name)}" aria-label="Copiar URL">
            <i data-lucide="link" class="w-4 h-4"></i>
          </button>
          <button class="delete-file p-1.5 rounded-lg hover:bg-[var(--blue-10)] text-[var(--black-40)] hover:text-[var(--blue-100)]"
            data-path="${escapeHtml(f.name)}" aria-label="Eliminar ${escapeHtml(displayName(f.name.split('/').pop()))}">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    `).join('')
  } else {
    grid.className = 'grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3'
    const folderGrid = folders.map(f => {
      const folderPath = currentFolderPath ? `${currentFolderPath}/${f.name}` : f.name
      return `
        <div class="folder-card group bg-amber-50 border border-amber-100 rounded-xl p-3 text-center cursor-pointer hover:border-amber-300 hover:bg-amber-100 transition-colors" data-path="${escapeHtml(folderPath)}">
          <div class="flex justify-center mb-2"><i data-lucide="folder" class="w-10 h-10 text-amber-400"></i></div>
          <p class="text-xs text-[var(--black-100)] truncate font-bold" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</p>
        </div>`
    }).join('')
    grid.innerHTML = folderGrid + files.map(f => `
      <div class="file-card group relative bg-white border border-[var(--blue-10)] rounded-xl p-3 text-center shadow-sm hover:shadow-md transition-shadow" draggable="true" data-path="${escapeHtml(f.name)}">
        ${f.type.startsWith('image/')
          ? `<img src="${escapeHtml(f.url)}" alt="" class="w-full h-16 object-cover rounded-lg mb-2" loading="lazy">`
          : `<div class="flex justify-center mb-2">${fileIcon(f.type)}</div>`}
        <p class="text-xs text-[var(--black-100)] truncate font-medium" title="${escapeHtml(displayName(f.name.split('/').pop()))}">${escapeHtml(displayName(f.name.split('/').pop()))}</p>
        <p class="text-xs text-[var(--black-40)]">${formatBytes(f.size)}</p>
        <div class="absolute inset-0 bg-black/60 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
          <button class="preview-file bg-blue-500 text-white rounded-lg p-1.5"
            data-url="${escapeHtml(f.url)}" data-type="${escapeHtml(f.type)}" data-name="${escapeHtml(f.name)}" aria-label="Ver ${escapeHtml(displayName(f.name.split('/').pop()))}">
            <i data-lucide="eye" class="w-3.5 h-3.5"></i>
          </button>
          <button class="rename-file bg-amber-500 text-white rounded-lg p-1.5"
            data-path="${escapeHtml(f.name)}" data-display="${escapeHtml(displayName(f.name.split('/').pop()))}" aria-label="Renombrar ${escapeHtml(displayName(f.name.split('/').pop()))}">
            <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
          </button>
          <button class="copy-url bg-[var(--black-60)] text-white rounded-lg p-1.5"
            data-url="${escapeHtml(f.url)}" data-name="${escapeHtml(f.name)}" aria-label="Copiar URL">
            <i data-lucide="link" class="w-3.5 h-3.5"></i>
          </button>
          <button class="delete-file bg-[var(--blue-10)]0 text-white rounded-lg p-1.5"
            data-path="${escapeHtml(f.name)}" aria-label="Eliminar ${escapeHtml(displayName(f.name.split('/').pop()))}">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `).join('')
  }

  lucide.createIcons()

  grid.querySelectorAll('.folder-card').forEach(card => {
    card.addEventListener('click', () => {
      currentFolderPath = card.dataset.path
      renderMaterialPanel()
    })
  })

  grid.querySelectorAll('.preview-file').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      openFilePreview(btn.dataset.url, btn.dataset.type, btn.dataset.name)
    })
  })

  grid.querySelectorAll('.rename-file').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      openRenameModal(btn.dataset.path, btn.dataset.display)
    })
  })

  grid.querySelectorAll('.copy-url').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      navigator.clipboard.writeText(btn.dataset.url)
        .then(() => showToast(`URL de "${displayName(btn.dataset.name.split('/').pop())}" copiada`))
        .catch(() => showToast('No se pudo copiar al portapapeles', 'error'))
    })
  })

  grid.querySelectorAll('.delete-file').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation()
      const displayN = displayName(btn.dataset.path.split('/').pop())
      if (!confirm(`¿Eliminar "${displayN}"?\nEsta acción no se puede deshacer.`)) return
      try {
        await deleteFile(btn.dataset.path)
        showToast('Archivo eliminado')
        logActivity('delete', 'image', displayN)
        renderMaterialPanel()
      } catch {
        showToast('Error al eliminar el archivo', 'error')
      }
    })
  })

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
      card.style.outline = '2px solid var(--blue-100)'
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
}

async function renderMaterialApoyoPanel() {
  const el = document.getElementById('panel-material-apoyo')
  const { data } = await supabase.from('material_apoyo').select('*').order('titulo')

  const iconMap = { pdf: 'file-text', link: 'link', video: 'play-circle' }
  const colorMap = { pdf: 'text-red-500', link: 'text-blue-500', video: 'text-purple-500' }

  el.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-black">Material de apoyo</h2>
        <p class="text-xs text-[var(--black-40)] mt-0.5">Recursos visibles para los usuarios en la sección Recursos.</p>
      </div>
      <button id="addMatApoyo" class="bg-[var(--blue-100)] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:scale-105 transition-transform">
        <i data-lucide="plus" class="w-3.5 h-3.5"></i> Nuevo recurso
      </button>
    </div>
    <div class="space-y-2">
      ${(data || []).map(m => `
        <div class="bg-white rounded-xl border border-[var(--blue-10)] p-3 flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-[var(--black-10)] flex items-center justify-center shrink-0">
            <i data-lucide="${escapeHtml(iconMap[m.tipo] || 'file')}" class="w-5 h-5 ${escapeHtml(colorMap[m.tipo] || 'text-[var(--black-60)]')}"></i>
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-bold text-sm truncate">${escapeHtml(m.titulo)}</p>
            <p class="text-xs text-[var(--black-40)] uppercase font-bold">${escapeHtml(m.tipo)}</p>
          </div>
          <div class="flex gap-1 shrink-0">
            <button data-id="${escapeHtml(String(m.id))}" data-titulo="${escapeHtml(m.titulo)}" data-url="${escapeHtml(m.url)}" data-tipo="${escapeHtml(m.tipo)}"
              class="edit-mat-apoyo p-1.5 rounded-lg hover:bg-[var(--black-10)] text-[var(--black-60)]" aria-label="Editar ${escapeHtml(m.titulo)}">
              <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
            <button data-id="${escapeHtml(String(m.id))}" data-titulo="${escapeHtml(m.titulo)}"
              class="del-mat-apoyo p-1.5 rounded-lg hover:bg-[var(--blue-10)] text-[var(--black-60)] hover:text-[var(--blue-100)]" aria-label="Eliminar ${escapeHtml(m.titulo)}">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `).join('') || '<p class="text-[var(--black-40)] text-sm py-4">No hay recursos. Crea el primero.</p>'}
    </div>
    <div id="matApoyoForm" class="hidden mt-4 bg-white rounded-2xl border border-[var(--blue-20)] p-4 space-y-3">
      <input type="hidden" id="matApoyoId">
      <input id="matApoyoTitulo" placeholder="Título del recurso" autocomplete="off"
        class="w-full px-3 py-2 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)]">
      <div class="flex gap-2">
        <input id="matApoyoUrl" placeholder="URL o enlace al recurso" autocomplete="off"
          class="flex-1 px-3 py-2 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)]">
        <button id="matApoyoPickLib" type="button"
          class="px-3 py-2 rounded-xl border border-[var(--blue-20)] text-xs font-bold text-[var(--black-60)] hover:bg-[var(--background-page)] shrink-0 flex items-center gap-1.5">
          <i data-lucide="folder-open" class="w-3.5 h-3.5"></i> Biblioteca
        </button>
      </div>
      <select id="matApoyoTipo" class="w-full px-3 py-2 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)] bg-white">
        <option value="link">🔗 Link / Enlace web</option>
        <option value="pdf">📄 PDF / Documento</option>
        <option value="video">▶️ Video</option>
      </select>
      <p id="matApoyoError" class="hidden text-red-500 text-xs"></p>
      <div class="flex gap-2">
        <button id="cancelMatApoyo" class="flex-1 py-2 rounded-xl border border-[var(--blue-20)] text-sm font-bold text-[var(--black-60)]">Cancelar</button>
        <button id="saveMatApoyo" class="flex-1 py-2 rounded-xl bg-[var(--blue-100)] text-white text-sm font-bold">Guardar</button>
      </div>
    </div>
  `
  lucide.createIcons()

  const showForm = () => document.getElementById('matApoyoForm').classList.remove('hidden')
  const hideForm = () => document.getElementById('matApoyoForm').classList.add('hidden')

  document.getElementById('addMatApoyo').addEventListener('click', () => {
    document.getElementById('matApoyoId').value = ''
    document.getElementById('matApoyoTitulo').value = ''
    document.getElementById('matApoyoUrl').value = ''
    document.getElementById('matApoyoTipo').value = 'link'
    document.getElementById('matApoyoError').classList.add('hidden')
    showForm()
    document.getElementById('matApoyoTitulo').focus()
  })

  document.querySelectorAll('.edit-mat-apoyo').forEach(b => b.addEventListener('click', () => {
    document.getElementById('matApoyoId').value = b.dataset.id
    document.getElementById('matApoyoTitulo').value = b.dataset.titulo
    document.getElementById('matApoyoUrl').value = b.dataset.url
    document.getElementById('matApoyoTipo').value = b.dataset.tipo
    document.getElementById('matApoyoError').classList.add('hidden')
    showForm()
  }))

  document.querySelectorAll('.del-mat-apoyo').forEach(b => b.addEventListener('click', async () => {
    if (!confirm(`¿Eliminar "${b.dataset.titulo}"?`)) return
    const { error } = await supabase.from('material_apoyo').delete().eq('id', b.dataset.id)
    if (error) { showToast('Error al eliminar: ' + error.message, 'error'); return }
    logActivity('delete', 'material_apoyo', b.dataset.titulo)
    renderMaterialApoyoPanel()
  }))

  document.getElementById('cancelMatApoyo').addEventListener('click', hideForm)

  document.getElementById('matApoyoPickLib').addEventListener('click', () => {
    openMediaLibrary(url => {
      document.getElementById('matApoyoUrl').value = url
    })
  })

  document.getElementById('saveMatApoyo').addEventListener('click', async () => {
    const id = document.getElementById('matApoyoId').value
    const titulo = document.getElementById('matApoyoTitulo').value.trim()
    const url = document.getElementById('matApoyoUrl').value.trim()
    const tipo = document.getElementById('matApoyoTipo').value
    const errorEl = document.getElementById('matApoyoError')

    if (!titulo || !url) {
      errorEl.textContent = 'Completa el título y la URL.'
      errorEl.classList.remove('hidden')
      return
    }

    const btn = document.getElementById('saveMatApoyo')
    btn.disabled = true
    btn.textContent = 'Guardando...'
    const { error } = id
      ? await supabase.from('material_apoyo').update({ titulo, url, tipo }).eq('id', id)
      : await supabase.from('material_apoyo').insert({ titulo, url, tipo })
    if (error) {
      errorEl.textContent = 'Error al guardar: ' + error.message
      errorEl.classList.remove('hidden')
      btn.disabled = false
      btn.textContent = 'Guardar'
      return
    }
    logActivity(id ? 'update' : 'create', 'material_apoyo', titulo)
    renderMaterialApoyoPanel()
  })
}

async function renderSuggestionsPanel() {
  const el = document.getElementById('panel-suggestions')
  const { data } = await supabase.from('bot_sugerencias').select('*').order('orden')

  el.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-black">Sugerencias Bot</h2>
        <p class="text-xs text-[var(--black-40)] mt-0.5">Máximo 6 activas. Se muestran en el chat de Bodi.</p>
      </div>
      <button id="addSuggestion" class="bg-[var(--blue-100)] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:scale-105 transition-transform">
        <i data-lucide="plus" class="w-3.5 h-3.5"></i> Nueva sugerencia
      </button>
    </div>
    <div class="space-y-2">
      ${(data || []).map(s => `
        <div class="bg-white rounded-xl border border-[var(--blue-10)] p-3 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <span class="text-xs font-black text-[var(--black-40)] w-5 text-center">${escapeHtml(String(s.orden))}</span>
            <p class="font-bold text-sm truncate">${escapeHtml(s.texto)}</p>
            ${s.activo
              ? '<span class="shrink-0 text-[10px] font-black bg-green-50 text-green-600 px-2 py-0.5 rounded-full">Activo</span>'
              : '<span class="shrink-0 text-[10px] font-black bg-[var(--black-10)] text-[var(--black-40)] px-2 py-0.5 rounded-full">Inactivo</span>'
            }
          </div>
          <div class="flex gap-1 shrink-0">
            <button data-id="${s.id}" data-texto="${escapeHtml(s.texto)}" data-orden="${escapeHtml(String(s.orden))}" data-activo="${escapeHtml(String(s.activo))}" class="edit-sug p-1.5 rounded-lg hover:bg-[var(--black-10)] text-[var(--black-60)]" aria-label="Editar sugerencia ${escapeHtml(s.texto)}">
              <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
            <button data-id="${s.id}" data-texto="${escapeHtml(s.texto)}" class="del-sug p-1.5 rounded-lg hover:bg-[var(--blue-10)] text-[var(--black-60)] hover:text-[var(--blue-100)]" aria-label="Eliminar sugerencia ${escapeHtml(s.texto)}">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `).join('') || '<p class="text-[var(--black-40)] text-sm">No hay sugerencias. Crea la primera.</p>'}
    </div>
    <div id="sugForm" class="hidden mt-4 bg-white rounded-2xl border border-[var(--blue-20)] p-4 space-y-2">
      <input type="hidden" id="sugId">
      <input id="sugTexto" placeholder="Texto del chip (max 60 caracteres)" maxlength="60" required
        class="w-full px-3 py-2 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)]">
      <input id="sugOrden" type="number" placeholder="Orden (ej: 1)" required min="0"
        class="w-full px-3 py-2 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)]">
      <label class="flex items-center gap-2 cursor-pointer">
        <input id="sugActivo" type="checkbox" checked class="w-4 h-4 accent-[var(--blue-100)]">
        <span class="text-sm font-bold text-[var(--black-100)]">Activo</span>
      </label>
      <p id="sugError" class="hidden text-red-500 text-xs"></p>
      <div class="flex gap-2">
        <button id="cancelSug" class="flex-1 py-2 rounded-xl border border-[var(--blue-20)] text-sm font-bold text-[var(--black-60)]">Cancelar</button>
        <button id="saveSug" class="flex-1 py-2 rounded-xl bg-[var(--blue-100)] text-white text-sm font-bold">Guardar</button>
      </div>
    </div>
  `
  lucide.createIcons()

  document.getElementById('addSuggestion').addEventListener('click', () => {
    document.getElementById('sugId').value = ''
    document.getElementById('sugTexto').value = ''
    document.getElementById('sugOrden').value = ''
    document.getElementById('sugActivo').checked = true
    document.getElementById('sugError').classList.add('hidden')
    document.getElementById('sugForm').classList.remove('hidden')
  })

  document.querySelectorAll('.edit-sug').forEach(b => b.addEventListener('click', () => {
    document.getElementById('sugId').value = b.dataset.id
    document.getElementById('sugTexto').value = b.dataset.texto
    document.getElementById('sugOrden').value = b.dataset.orden
    document.getElementById('sugActivo').checked = b.dataset.activo === 'true'
    document.getElementById('sugError').classList.add('hidden')
    document.getElementById('sugForm').classList.remove('hidden')
  }))

  document.querySelectorAll('.del-sug').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta sugerencia?')) return
    const { error } = await supabase.from('bot_sugerencias').delete().eq('id', b.dataset.id)
    if (error) { showToast('Error al eliminar: ' + error.message, 'error'); return }
    logActivity('delete', 'bot_suggestion', b.dataset.texto)
    renderSuggestionsPanel()
  }))

  document.getElementById('cancelSug').addEventListener('click', () => {
    document.getElementById('sugForm').classList.add('hidden')
  })

  document.getElementById('saveSug').addEventListener('click', async () => {
    const id = document.getElementById('sugId').value
    const texto = document.getElementById('sugTexto').value.trim()
    const orden = parseInt(document.getElementById('sugOrden').value)
    const activo = document.getElementById('sugActivo').checked
    const errorEl = document.getElementById('sugError')

    if (!texto || isNaN(orden)) {
      errorEl.textContent = 'Completa todos los campos requeridos.'
      errorEl.classList.remove('hidden')
      return
    }

    const saveBtn = document.getElementById('saveSug')
    saveBtn.disabled = true
    saveBtn.textContent = 'Guardando...'

    if (activo) {
      const { data: activos } = await supabase
        .from('bot_sugerencias')
        .select('id')
        .eq('activo', true)
      const otrasActivas = (activos || []).filter(s => s.id !== id)
      if (otrasActivas.length >= 6) {
        errorEl.textContent = 'Máximo 6 sugerencias activas. Desactiva una antes de agregar otra.'
        errorEl.classList.remove('hidden')
        saveBtn.disabled = false
        saveBtn.textContent = 'Guardar'
        return
      }
    }

    errorEl.classList.add('hidden')
    const payload = { texto, orden, activo }
    const { error } = id
      ? await supabase.from('bot_sugerencias').update(payload).eq('id', id)
      : await supabase.from('bot_sugerencias').insert(payload)
    if (error) {
      errorEl.textContent = 'Error al guardar: ' + error.message
      errorEl.classList.remove('hidden')
      saveBtn.disabled = false
      saveBtn.textContent = 'Guardar'
      return
    }
    logActivity(id ? 'update' : 'create', 'bot_suggestion', texto)
    document.getElementById('sugForm').classList.add('hidden')
    renderSuggestionsPanel()
  })
}

function actionBadge(action) {
  const map = {
    create: { cls: 'bg-green-100 text-green-800', label: 'Creó' },
    update: { cls: 'bg-blue-100 text-blue-800',   label: 'Modificó' },
    delete: { cls: 'bg-red-100 text-red-700',     label: 'Eliminó' },
    move:   { cls: 'bg-amber-100 text-amber-800', label: 'Movió' },
  }
  const { cls = 'bg-[var(--black-10)] text-[var(--black-60)]', label = action || '—' } = map[action] || {}
  return `<span class="inline-block text-[10px] font-black px-2 py-0.5 rounded-full ${cls}">${escapeHtml(label)}</span>`
}

async function renderActivityLogPanel() {
  const el = document.getElementById('panel-activity')
  el.innerHTML = `<p class="text-[var(--black-40)] text-sm">Cargando...</p>`

  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    el.innerHTML = `<p class="text-red-500 text-sm">Error al cargar: ${escapeHtml(error.message)}</p>`
    return
  }

  const rows = data || []
  const types = [...new Set(rows.map(r => r.entity_type).filter(Boolean))].sort()

  el.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-black">Registro de actividad</h2>
        <p class="text-xs text-[var(--black-40)] mt-0.5">Últimas 200 acciones</p>
      </div>
      <select id="activityFilter" class="px-3 py-2 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)] bg-white">
        <option value="">Todos los tipos</option>
        ${types.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
      </select>
    </div>
    <div class="bg-white rounded-2xl border border-[var(--blue-20)] overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-sm" id="activityTable">
          <thead>
            <tr class="border-b border-[var(--blue-10)] text-xs text-[var(--black-40)] font-bold uppercase tracking-wide">
              <th class="text-left px-4 py-3">Fecha</th>
              <th class="text-left px-4 py-3">Usuario</th>
              <th class="text-left px-4 py-3">Acción</th>
              <th class="text-left px-4 py-3">Tipo</th>
              <th class="text-left px-4 py-3">Nombre</th>
              <th class="text-left px-4 py-3">Detalles</th>
            </tr>
          </thead>
          <tbody id="activityBody">
            ${renderActivityRows(rows)}
          </tbody>
        </table>
      </div>
    </div>
  `

  document.getElementById('activityFilter').addEventListener('change', e => {
    const filter = e.target.value
    const filtered = filter ? rows.filter(r => r.entity_type === filter) : rows
    document.getElementById('activityBody').innerHTML = renderActivityRows(filtered)
  })
}

async function renderProfilePanel() {
  const el = document.getElementById('panel-profile')
  el.innerHTML = `<p class="text-[var(--black-40)] text-sm">Cargando...</p>`

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    el.innerHTML = `<p class="text-red-500 text-sm">No se pudo cargar el perfil.</p>`
    return
  }

  const name = user.user_metadata?.full_name || ''
  const email = user.email || ''

  el.innerHTML = `
    <div class="max-w-lg">
      <h2 class="text-lg font-black mb-6">Mi perfil</h2>

      <div class="bg-white rounded-2xl border border-[var(--blue-20)] p-5 mb-4">
        <h3 class="text-sm font-black text-[var(--black-100)] mb-4">Información personal</h3>
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-bold text-[var(--black-60)] mb-1" for="profileName">Nombre</label>
            <input id="profileName" type="text" value="${escapeHtml(name)}" autocomplete="name"
              class="w-full px-3 py-2.5 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)]">
          </div>
          <div>
            <label class="block text-xs font-bold text-[var(--black-60)] mb-1" for="profileEmail">Correo electrónico</label>
            <input id="profileEmail" type="email" value="${escapeHtml(email)}" autocomplete="email"
              class="w-full px-3 py-2.5 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)]">
            <p class="text-xs text-amber-600 mt-1 flex items-center gap-1">
              <i data-lucide="triangle-alert" class="w-3 h-3 shrink-0"></i>
              Cambiar el correo enviará un enlace de confirmación al nuevo correo.
            </p>
          </div>
          <p id="profileInfoError" class="hidden text-red-500 text-xs"></p>
          <button id="saveProfileInfo" class="w-full py-2.5 rounded-xl bg-[var(--blue-100)] text-white text-sm font-bold mt-1">
            Guardar información
          </button>
        </div>
      </div>

      <div class="bg-white rounded-2xl border border-[var(--blue-20)] p-5">
        <h3 class="text-sm font-black text-[var(--black-100)] mb-4">Cambiar contraseña</h3>
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-bold text-[var(--black-60)] mb-1" for="profileNewPassword">Nueva contraseña</label>
            <input id="profileNewPassword" type="password" placeholder="Mínimo 6 caracteres" autocomplete="new-password"
              class="w-full px-3 py-2.5 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)]">
          </div>
          <div>
            <label class="block text-xs font-bold text-[var(--black-60)] mb-1" for="profileConfirmPassword">Confirmar contraseña</label>
            <input id="profileConfirmPassword" type="password" placeholder="Repite la contraseña" autocomplete="new-password"
              class="w-full px-3 py-2.5 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)]">
          </div>
          <p id="profilePwError" class="hidden text-red-500 text-xs"></p>
          <button id="saveProfilePassword" class="w-full py-2.5 rounded-xl bg-[var(--blue-100)] text-white text-sm font-bold mt-1">
            Cambiar contraseña
          </button>
        </div>
      </div>

      <div class="bg-white rounded-2xl border border-[var(--blue-20)] p-5 mt-4">
        <h3 class="text-sm font-black text-[var(--black-100)] mb-4">Configuración de la app</h3>
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-bold text-[var(--black-100)]">Lecciones</p>
              <p class="text-xs text-[var(--black-60)] mt-0.5">Muestra u oculta el módulo de lecciones</p>
            </div>
            <button id="toggleLessons" class="relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none" aria-pressed="true">
              <span id="toggleLessonsKnob" class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"></span>
            </button>
          </div>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-bold text-[var(--black-100)]">Material de apoyo</p>
              <p class="text-xs text-[var(--black-60)] mt-0.5">Muestra u oculta el material de apoyo en Recursos</p>
            </div>
            <button id="toggleResources" class="relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none" aria-pressed="true">
              <span id="toggleResourcesKnob" class="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200"></span>
            </button>
          </div>
        </div>
        <p id="toggleSettingsMsg" class="text-xs mt-3 hidden"></p>
      </div>
    </div>
  `
  lucide.createIcons()

  // ── Load and wire settings toggles ───────────────────────────────────────
  const settingsMsg = document.getElementById('toggleSettingsMsg')

  function applyToggle(btnId, knobId, enabled) {
    const btn = document.getElementById(btnId)
    const knob = document.getElementById(knobId)
    btn.classList.toggle('bg-[var(--success-150)]', enabled)
    btn.classList.toggle('bg-[var(--black-40)]', !enabled)
    knob.style.transform = enabled ? 'translateX(20px)' : 'translateX(0)'
    btn.setAttribute('aria-pressed', String(enabled))
  }

  function showSettingsMsg(text, isError) {
    settingsMsg.className = 'text-xs mt-3 ' + (isError ? 'text-red-500' : 'text-[var(--success-150)]')
    settingsMsg.textContent = text
    setTimeout(() => { settingsMsg.className = 'text-xs mt-3 hidden'; settingsMsg.textContent = '' }, 2500)
  }

  function wireToggle(btnId, knobId, settingKey, labelOn, labelOff) {
    let enabled = true
    const btn = document.getElementById(btnId)
    btn.addEventListener('click', async () => {
      enabled = !enabled
      applyToggle(btnId, knobId, enabled)
      const { error } = await supabase.from('app_settings').upsert({ key: settingKey, value: String(enabled) })
      showSettingsMsg(error ? 'Error al guardar.' : (enabled ? labelOn : labelOff), !!error)
    })
    return (initialValue) => { enabled = initialValue; applyToggle(btnId, knobId, enabled) }
  }

  const setLessons   = wireToggle('toggleLessons',   'toggleLessonsKnob',   'lessons_enabled',   'Lecciones activadas.',           'Lecciones desactivadas.')
  const setResources = wireToggle('toggleResources',  'toggleResourcesKnob', 'resources_enabled', 'Material de apoyo activado.',    'Material de apoyo desactivado.')

  const { data: allSettings } = await supabase.from('app_settings').select('key,value')
  const settingsMap = allSettings ? Object.fromEntries(allSettings.map(r => [r.key, r.value])) : {}
  setLessons(settingsMap.lessons_enabled !== 'false')
  setResources(settingsMap.resources_enabled !== 'false')

  document.getElementById('saveProfileInfo').addEventListener('click', async () => {
    const newName = document.getElementById('profileName').value.trim()
    const newEmail = document.getElementById('profileEmail').value.trim()
    const btn = document.getElementById('saveProfileInfo')
    const errorEl = document.getElementById('profileInfoError')
    errorEl.classList.add('hidden')

    if (!newEmail) {
      errorEl.textContent = 'El correo no puede estar vacío.'
      errorEl.classList.remove('hidden')
      return
    }
    if (!document.getElementById('profileEmail').validity.valid) {
      errorEl.textContent = 'Ingresa un correo electrónico válido.'
      errorEl.classList.remove('hidden')
      return
    }

    btn.disabled = true
    btn.textContent = 'Guardando...'

    const updates = {}
    if (newName !== name) updates.data = { full_name: newName }
    if (newEmail !== email) updates.email = newEmail

    if (!Object.keys(updates).length) {
      showToast('No hay cambios que guardar.')
      btn.disabled = false
      btn.textContent = 'Guardar información'
      return
    }

    const { error: err } = await supabase.auth.updateUser(updates)
    if (err) {
      errorEl.textContent = err.message
      errorEl.classList.remove('hidden')
    } else {
      showToast(newEmail !== email
        ? 'Información guardada. Revisa tu nuevo correo para confirmar el cambio.'
        : 'Información guardada correctamente.')
    }
    btn.disabled = false
    btn.textContent = 'Guardar información'
  })

  document.getElementById('saveProfilePassword').addEventListener('click', async () => {
    const pw = document.getElementById('profileNewPassword').value
    const pw2 = document.getElementById('profileConfirmPassword').value
    const errorEl = document.getElementById('profilePwError')
    errorEl.classList.add('hidden')

    if (!pw) {
      errorEl.textContent = 'Ingresa una nueva contraseña.'
      errorEl.classList.remove('hidden')
      return
    }
    if (pw.length < 6) {
      errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'
      errorEl.classList.remove('hidden')
      return
    }
    if (pw !== pw2) {
      errorEl.textContent = 'Las contraseñas no coinciden.'
      errorEl.classList.remove('hidden')
      return
    }

    const btn = document.getElementById('saveProfilePassword')
    btn.disabled = true
    btn.textContent = 'Guardando...'

    const { error: err } = await supabase.auth.updateUser({ password: pw })
    if (err) {
      errorEl.textContent = err.message
      errorEl.classList.remove('hidden')
    } else {
      showToast('Contraseña actualizada correctamente.')
      document.getElementById('profileNewPassword').value = ''
      document.getElementById('profileConfirmPassword').value = ''
    }
    btn.disabled = false
    btn.textContent = 'Cambiar contraseña'
  })
}

function renderActivityRows(rows) {
  if (!rows.length) return `<tr><td colspan="6" class="text-center text-[var(--black-40)] py-8 text-sm">Sin resultados.</td></tr>`
  return rows.map(r => {
    const date = new Date(r.created_at)
    const dateStr = date.toLocaleDateString('es-HN', { day: '2-digit', month: '2-digit', year: '2-digit' })
    const timeStr = date.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })
    const details = r.details && Object.keys(r.details).length
      ? Object.entries(r.details).map(([k, v]) => `${escapeHtml(k)}: ${escapeHtml(String(v))}`).join(', ')
      : '—'
    return `
      <tr class="border-b border-[var(--blue-10)] hover:bg-[var(--background-page)] transition-colors">
        <td class="px-4 py-3 text-[var(--black-60)] whitespace-nowrap text-xs">${escapeHtml(dateStr)} ${escapeHtml(timeStr)}</td>
        <td class="px-4 py-3 text-[var(--black-60)] text-xs max-w-[140px] truncate" title="${escapeHtml(r.user_email || '')}">${escapeHtml(r.user_email || '—')}</td>
        <td class="px-4 py-3">${actionBadge(r.action)}</td>
        <td class="px-4 py-3 text-[var(--black-60)] text-xs">${escapeHtml(r.entity_type || '—')}</td>
        <td class="px-4 py-3 text-[var(--black-100)] text-xs max-w-[200px] truncate" title="${escapeHtml(r.entity_name || '')}">${escapeHtml(r.entity_name || '—')}</td>
        <td class="px-4 py-3 text-[var(--black-40)] text-xs max-w-[200px] truncate" title="${escapeHtml(details)}">${escapeHtml(details)}</td>
      </tr>
    `
  }).join('')
}

function setupUploadZone(zone) {
  const urlInput = zone.closest('[data-idx]').querySelector('input[data-field="url"]')
  const progressDiv = zone.querySelector('.upload-progress')
  const progressBar = zone.querySelector('.upload-bar')

  const doUpload = async (file) => {
    progressDiv.classList.remove('hidden')
    progressBar.style.width = '0%'
    try {
      const { url } = await uploadFile(file, pct => { progressBar.style.width = pct + '%' })
      urlInput.value = url
      urlInput.dispatchEvent(new Event('input'))
      renderBlockList()
    } catch (e) {
      showToast(e.message || 'Error al subir archivo', 'error')
      progressDiv.classList.add('hidden')
    }
  }

  zone.addEventListener('dragover', e => {
    e.preventDefault()
    e.stopPropagation()
    zone.classList.add('border-[var(--blue-100)]', 'bg-[var(--blue-10)]')
  })
  zone.addEventListener('dragleave', () => {
    zone.classList.remove('border-[var(--blue-100)]', 'bg-[var(--blue-10)]')
  })
  zone.addEventListener('drop', e => {
    e.preventDefault()
    e.stopPropagation()
    zone.classList.remove('border-[var(--blue-100)]', 'bg-[var(--blue-10)]')
    if (e.dataTransfer.files[0]) doUpload(e.dataTransfer.files[0])
  })

  const pickBtn = zone.querySelector('.pick-file')
  if (pickBtn) {
    pickBtn.addEventListener('click', e => {
      e.stopPropagation()
      const fi = document.createElement('input')
      fi.type = 'file'
      fi.onchange = () => fi.files[0] && doUpload(fi.files[0])
      fi.click()
    })
  }

  const libBtn = zone.querySelector('.pick-library')
  if (libBtn) {
    libBtn.addEventListener('click', e => {
      e.stopPropagation()
      openMediaLibrary(url => {
        urlInput.value = url
        urlInput.dispatchEvent(new Event('input'))
        renderBlockList()
      })
    })
  }

  const clearBtn = zone.querySelector('.clear-upload')
  if (clearBtn) {
    clearBtn.addEventListener('click', e => {
      e.stopPropagation()
      urlInput.value = ''
      urlInput.dispatchEvent(new Event('input'))
      renderBlockList()
    })
  }
}

function fileIcon(type) {
  if (!type) return '<i data-lucide="folder" class="w-8 h-8 text-[var(--black-40)]"></i>'
  if (type.startsWith('image/')) return '<i data-lucide="image" class="w-8 h-8 text-blue-400"></i>'
  if (type === 'application/pdf') return '<i data-lucide="file-text" class="w-8 h-8 text-red-400"></i>'
  if (type.startsWith('video/')) return '<i data-lucide="video" class="w-8 h-8 text-purple-400"></i>'
  if (type.startsWith('audio/')) return '<i data-lucide="music" class="w-8 h-8 text-green-400"></i>'
  return '<i data-lucide="file" class="w-8 h-8 text-[var(--black-40)]"></i>'
}

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function displayName(name) {
  return name.replace(/-\d{13}(\.[^.]+)?$/, (_, ext) => ext || '')
}

function showToast(msg, type = 'success') {
  const t = document.createElement('div')
  t.className = `fixed bottom-4 right-4 z-[100] px-4 py-3 rounded-xl text-sm font-medium shadow-lg text-white ${
    type === 'error' ? 'bg-[var(--blue-10)]0' : 'bg-emerald-500'
  }`
  t.setAttribute('role', 'status')
  t.setAttribute('aria-live', 'polite')
  document.body.appendChild(t)
  t.textContent = msg
  setTimeout(() => t.remove(), 3000)
}

let _mediaCallback = null
let _selectedUrl = null

async function openMediaLibrary(onSelect) {
  _mediaCallback = onSelect
  _selectedUrl = null

  const modal = document.getElementById('mediaLibraryModal')
  const grid = document.getElementById('mediaGrid')
  const selectBtn = document.getElementById('mediaSelectBtn')
  const search = document.getElementById('mediaSearch')

  modal.classList.remove('hidden')
  modal.classList.add('flex')
  selectBtn.disabled = true
  selectBtn.textContent = '✓ Usar archivo'
  search.value = ''
  grid.innerHTML = '<p class="col-span-4 text-center text-[var(--black-40)] text-sm py-8">Cargando...</p>'

  let files = []
  try {
    const result = await listFiles('')
    files = result.files
    renderMediaGrid(files)
    lucide.createIcons()
  } catch {
    grid.innerHTML = '<p class="col-span-4 text-center text-red-400 text-sm py-8">Error al cargar archivos</p>'
  }

  search.oninput = () => {
    const q = search.value.toLowerCase()
    renderMediaGrid(files.filter(f => f.name.split('/').pop().toLowerCase().includes(q)))
    lucide.createIcons()
  }
}

function renderMediaGrid(files) {
  const grid = document.getElementById('mediaGrid')
  const count = document.getElementById('mediaCount')
  if (!grid) return
  count.textContent = `${files.length} archivos`

  if (!files.length) {
    grid.innerHTML = '<p class="col-span-4 text-center text-[var(--black-40)] text-sm py-8">No hay archivos subidos</p>'
    return
  }

  grid.innerHTML = files.map(f => {
    const thumb = f.type.startsWith('image/')
      ? `<img src="${escapeHtml(f.url)}" alt="" class="w-full h-14 object-cover rounded-lg mb-1" loading="lazy">`
      : `<div class="flex justify-center mb-1">${fileIcon(f.type)}</div>`
    return `
    <div class="media-item cursor-pointer border-2 border-transparent rounded-xl p-2 text-center hover:border-[var(--blue-100)] transition-colors"
         data-url="${escapeHtml(f.url)}" data-name="${escapeHtml(f.name)}">
      ${thumb}
      <p class="text-xs text-[var(--black-100)] truncate" title="${escapeHtml(displayName(f.name.split('/').pop()))}">${escapeHtml(displayName(f.name.split('/').pop()))}</p>
      <p class="text-xs text-[var(--black-40)]">${formatBytes(f.size)}</p>
    </div>`
  }).join('')

  grid.querySelectorAll('.media-item').forEach(item => {
    item.addEventListener('click', () => {
      grid.querySelectorAll('.media-item').forEach(i => {
        i.classList.remove('border-[var(--blue-100)]', 'bg-[var(--blue-10)]')
      })
      item.classList.add('border-[var(--blue-100)]', 'bg-[var(--blue-10)]')
      _selectedUrl = item.dataset.url
      const btn = document.getElementById('mediaSelectBtn')
      btn.disabled = false
      const short = item.dataset.name.length > 20
        ? item.dataset.name.substring(0, 20) + '…'
        : item.dataset.name
      btn.textContent = `✓ Usar ${short}`
    })
  })
}

let _renameCurrentPath = null
let _renameReloadCallback = null

function initRenameModal() {
  if (document.getElementById('renameModal')) return
  const modal = document.createElement('div')
  modal.id = 'renameModal'
  modal.className = 'hidden fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4'
  modal.innerHTML = `
    <div class="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl">
      <h3 class="font-black text-base mb-3">Renombrar archivo</h3>
      <input id="renameInput" type="text" autocomplete="off" aria-label="Nuevo nombre del archivo"
        class="w-full px-3 py-2.5 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)] mb-2">
      <p class="text-xs text-amber-600 mb-4 flex items-start gap-1.5">
        <i data-lucide="triangle-alert" class="w-3.5 h-3.5 shrink-0 mt-0.5"></i>
        Las lecciones que referencien este archivo deberán actualizarse manualmente.
      </p>
      <div class="flex gap-2">
        <button id="cancelRename" class="flex-1 py-2 rounded-xl border border-[var(--blue-20)] text-sm font-bold text-[var(--black-60)] hover:bg-[var(--background-page)]">Cancelar</button>
        <button id="confirmRename" class="flex-1 py-2 rounded-xl bg-[var(--blue-100)] text-white text-sm font-bold">Renombrar</button>
      </div>
    </div>
  `
  document.body.appendChild(modal)
  lucide.createIcons()

  document.getElementById('cancelRename').addEventListener('click', () => {
    modal.classList.add('hidden')
    _renameCurrentPath = null
    _renameReloadCallback = null
  })

  modal.addEventListener('click', e => {
    if (e.target === modal) {
      modal.classList.add('hidden')
      _renameCurrentPath = null
      _renameReloadCallback = null
    }
  })

  document.getElementById('confirmRename').addEventListener('click', async () => {
    const newName = document.getElementById('renameInput').value.trim()
    if (!newName || !_renameCurrentPath) return
    const btn = document.getElementById('confirmRename')
    btn.disabled = true
    btn.textContent = 'Renombrando...'
    try {
      await renameFile(_renameCurrentPath, newName)
      modal.classList.add('hidden')
      showToast('Archivo renombrado correctamente')
      logActivity('update', 'image', newName, { from: displayName(_renameCurrentPath.split('/').pop()) })
      if (_renameReloadCallback) await _renameReloadCallback()
    } catch (e) {
      showToast('Error al renombrar: ' + e.message, 'error')
      btn.disabled = false
      btn.textContent = 'Renombrar'
    }
  })

  document.getElementById('renameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('confirmRename').click()
    if (e.key === 'Escape') modal.classList.add('hidden')
  })
}

function openRenameModal(path, currentDisplayName) {
  const input = document.getElementById('renameInput')
  if (!input) return
  _renameCurrentPath = path
  _renameReloadCallback = async () => {
    renderMaterialPanel()
  }
  const confirmBtn = document.getElementById('confirmRename')
  if (!confirmBtn) return
  input.value = currentDisplayName
  confirmBtn.disabled = false
  confirmBtn.textContent = 'Renombrar'
  document.getElementById('renameModal').classList.remove('hidden')
  setTimeout(() => input.select(), 50)
}

function initFilePreviewModal() {
  if (document.getElementById('filePreviewModal')) return
  const modal = document.createElement('div')
  modal.id = 'filePreviewModal'
  modal.className = 'hidden fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4'
  modal.innerHTML = `
    <button id="closeFilePreview" class="absolute top-4 right-4 text-white/70 hover:text-white p-2 rounded-lg hover:bg-white/10 transition-colors" aria-label="Cerrar vista previa">
      <i data-lucide="x" class="w-6 h-6"></i>
    </button>
    <div id="filePreviewContent" class="max-w-4xl w-full max-h-[85vh] flex items-center justify-center"></div>
    <p id="filePreviewName" class="absolute bottom-4 left-0 right-0 text-center text-white/60 text-sm px-4 truncate"></p>
  `
  document.body.appendChild(modal)
  lucide.createIcons()

  document.getElementById('closeFilePreview').addEventListener('click', () => {
    modal.classList.add('hidden')
    document.getElementById('filePreviewContent').innerHTML = ''
  })

  modal.addEventListener('click', e => {
    if (e.target === modal) {
      modal.classList.add('hidden')
      document.getElementById('filePreviewContent').innerHTML = ''
    }
  })

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      modal.classList.add('hidden')
      document.getElementById('filePreviewContent').innerHTML = ''
    }
  })
}

function openFilePreview(url, type, name) {
  const modal = document.getElementById('filePreviewModal')
  const content = document.getElementById('filePreviewContent')
  const nameEl = document.getElementById('filePreviewName')
  const safeType = /^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*$/.test(type) ? type : ''

  if (safeType.startsWith('image/')) {
    content.innerHTML = `<img src="${escapeHtml(url)}" alt="${escapeHtml(displayName(name))}" class="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl">`
  } else if (safeType.startsWith('video/')) {
    content.innerHTML = `<video src="${escapeHtml(url)}" controls class="max-w-full max-h-[80vh] rounded-lg shadow-2xl" style="max-width:800px"></video>`
  } else {
    content.innerHTML = `
      <div class="text-center text-white/80">
        <div class="flex justify-center mb-4 opacity-50">${fileIcon(safeType).replace(/class="([^"]+)"/g, 'class="$1" style="color:white;width:64px;height:64px"')}</div>
        <p class="mb-4 text-lg font-medium">${escapeHtml(displayName(name))}</p>
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="inline-flex items-center gap-2 px-4 py-2 bg-white/20 rounded-xl text-white hover:bg-white/30 transition-colors text-sm font-bold">
          <i data-lucide="external-link" class="w-4 h-4"></i> Abrir en nueva pestaña
        </a>
      </div>`
    lucide.createIcons()
  }

  nameEl.textContent = displayName(name)
  modal.classList.remove('hidden')
}

function initMediaLibraryModal() {
  document.getElementById('mediaSelectBtn').addEventListener('click', () => {
    if (_selectedUrl && _mediaCallback) _mediaCallback(_selectedUrl)
    document.getElementById('mediaLibraryModal').classList.add('hidden')
    document.getElementById('mediaLibraryModal').classList.remove('flex')
  })
  document.getElementById('mediaCancelBtn').addEventListener('click', () => {
    document.getElementById('mediaLibraryModal').classList.add('hidden')
    document.getElementById('mediaLibraryModal').classList.remove('flex')
  })
  document.getElementById('mediaLibraryModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) {
      e.currentTarget.classList.add('hidden')
      e.currentTarget.classList.remove('flex')
    }
  })
}

function initPasteHandler() {
  document.addEventListener('paste', async e => {
    const modal = document.getElementById('lessonFormModal')
    if (!modal || modal.classList.contains('hidden')) return

    const imgItem = Array.from(e.clipboardData?.items || []).find(it => it.type.startsWith('image/'))
    if (!imgItem) return
    e.preventDefault()

    const file = imgItem.getAsFile()
    if (!file) return

    showToast('Subiendo imagen...')
    try {
      const { url } = await uploadFile(file)
      currentBlocks.push({ type: 'image', url, caption: '' })
      renderBlockList()
      showToast('✓ Imagen pegada')
    } catch (err) {
      showToast('Error al subir: ' + err.message)
    }
  })
}

window.renderMaterialPanel = renderMaterialPanel

init()
