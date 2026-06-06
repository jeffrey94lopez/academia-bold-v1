import { supabase } from './supabase.js'
import { requireAuth, logout } from './auth.js'
import { uploadFile, listFiles, deleteFile } from './upload.js'
import { renderBlocks } from './block-renderer.js'
import { copyLessonToWhatsApp } from './whatsapp-copy.js'
import { escapeHtml } from './utils.js'
import { renderResultsPanel, renderAnalyticsPanel } from './admin-analytics.js'

let currentBlocks = []
let sortableInstance = null
let currentQuestions = []
let questionsSortable = null
let quillInstances = {}
let currentCategories = []

async function init() {
  const ok = await requireAuth()
  if (!ok) return

  document.getElementById('loginScreen').classList.add('hidden')
  document.getElementById('adminApp').classList.remove('hidden')
  document.getElementById('logoutBtn').addEventListener('click', logout)

  lucide.createIcons()
  initMediaLibraryModal()
  initPasteHandler()

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
    b.classList.toggle('text-[#E92129]', active)
    b.classList.toggle('bg-red-50', active)
    b.classList.toggle('text-slate-500', !active)
  })

  if (panel === 'lessons') renderLessonsPanel()
  if (panel === 'glossary') renderGlossaryPanel()
  if (panel === 'material') renderMaterialPanel()
  if (panel === 'suggestions') renderSuggestionsPanel()
  if (panel === 'results') renderResultsPanel()
  if (panel === 'analytics') renderAnalyticsPanel()
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
        <button id="manageCatsBtn" class="px-3 py-2 rounded-xl text-xs font-bold text-slate-500 border border-slate-200 hover:bg-slate-50 flex items-center gap-1.5">
          <i data-lucide="tag" class="w-3.5 h-3.5"></i> Categorías
        </button>
        <button id="addLesson" class="bg-[#E92129] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:scale-105 transition-transform">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i> Nueva lección
        </button>
      </div>
    </div>

    <div class="relative mb-4">
      <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"></i>
      <input id="lessonSearch" type="text" placeholder="Buscar lección..."
        class="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129] bg-white">
    </div>

    <div id="catManager" class="hidden mb-4 bg-white rounded-2xl border border-slate-200 p-4">
      <div class="flex items-center justify-between mb-3">
        <p class="text-[10px] font-black uppercase text-slate-400 tracking-wide">Categorías</p>
        <button id="addCatBtn" class="text-[10px] font-bold text-[#E92129] hover:underline">+ Nueva</button>
      </div>
      <div id="catList" class="space-y-1.5 mb-2">
        ${currentCategories.map(c => `
          <div class="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-50">
            <span>${escapeHtml(c.emoji)}</span>
            <span class="flex-1 text-sm font-medium text-slate-700">${escapeHtml(c.nombre)}</span>
            <button class="edit-cat text-slate-300 hover:text-slate-600 p-1" data-id="${c.id}" data-nombre="${escapeHtml(c.nombre)}" data-emoji="${escapeHtml(c.emoji)}" title="Editar" aria-label="Editar categoría ${escapeHtml(c.nombre)}">
              <i data-lucide="edit-2" class="w-3.5 h-3.5"></i>
            </button>
            <button class="del-cat text-slate-300 hover:text-red-500 p-1" data-id="${c.id}" data-nombre="${escapeHtml(c.nombre)}" title="Eliminar" aria-label="Eliminar categoría ${escapeHtml(c.nombre)}">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        `).join('')}
      </div>
      <div id="catInlineForm" class="hidden border-t border-slate-100 pt-3">
        <input type="hidden" id="catFormId">
        <div class="flex gap-2 mb-2">
          <input id="catFormEmoji" maxlength="2" placeholder="📁"
            class="w-12 px-2 py-1.5 rounded-lg border border-slate-200 text-sm text-center outline-none focus:border-[#E92129]">
          <input id="catFormNombre" placeholder="Nombre de categoría"
            class="flex-1 px-2 py-1.5 rounded-lg border border-slate-200 text-sm outline-none focus:border-[#E92129]">
        </div>
        <div class="flex gap-2">
          <button id="cancelCatForm" class="flex-1 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-500">Cancelar</button>
          <button id="saveCatForm" class="flex-1 py-1.5 rounded-lg bg-[#E92129] text-white text-xs font-bold">Guardar</button>
        </div>
      </div>
    </div>

    <div id="lessonsList"></div>

    <div id="lessonFormModal" class="hidden fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div class="bg-white rounded-2xl w-full max-w-5xl flex flex-col" style="max-height:90vh">
        <div class="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <h3 id="lessonFormTitle" class="font-black text-base">Nueva lección</h3>
          <button id="cancelLessonForm" class="text-slate-400 hover:text-slate-700 text-lg leading-none px-1">&#x2715;</button>
        </div>
        <div class="flex-1 overflow-hidden grid" style="grid-template-columns:1fr 1fr;min-height:0">
          <div class="overflow-y-auto p-5 border-r border-slate-100">
            <input type="hidden" id="lessonId">
            <div class="space-y-2 mb-4">
              <input id="lessonTitulo" placeholder="Título" required
                class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
              <input id="lessonDescripcion" placeholder="Descripción corta" required
                class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
              <select id="lessonCategoria"
                class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129] bg-white">
              </select>
            </div>
            <p class="text-[10px] font-black uppercase text-slate-400 tracking-wide mb-2">Contenido</p>
            <div id="blockList" class="space-y-2 mb-3"></div>
            <div class="flex flex-wrap gap-1.5 mb-4">
              <button data-type="step" class="add-block bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-slate-200">+ Paso</button>
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
              <p class="text-[10px] font-black uppercase text-slate-400 tracking-wide mb-1">Notas</p>
              <textarea id="lessonNotas" placeholder="Notas adicionales para el estudiante (opcional)..." rows="3"
                class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs outline-none focus:border-[#E92129] resize-none"></textarea>
            </div>
            <div class="mb-4">
              <div class="flex items-center justify-between mb-2">
                <p class="text-[10px] font-black uppercase text-slate-400 tracking-wide">Examen</p>
                <button type="button" id="addQuestion" class="text-[10px] font-bold text-[#E92129] hover:underline">+ Agregar pregunta</button>
              </div>
              <div id="questionList" class="space-y-3"></div>
            </div>
            <div class="flex items-end gap-3 pt-3 border-t border-slate-100">
              <div>
                <p class="text-[10px] font-black uppercase text-slate-400 mb-1">Orden</p>
                <input id="lessonOrden" type="number" placeholder="1" required
                  class="w-16 px-2 py-1.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
              </div>
              <button id="saveLessonBtn" class="flex-1 py-2.5 rounded-xl bg-[#E92129] text-white text-sm font-bold">Guardar lección</button>
            </div>
          </div>
          <div class="overflow-y-auto p-5 bg-slate-50">
            <p class="text-[10px] font-black uppercase text-slate-400 tracking-wide mb-3">&#x1F441;&#xFE0F; Vista previa del estudiante</p>
            <div class="bg-white rounded-xl p-4 shadow-sm">
              <h3 id="previewTitle" class="font-black text-sm mb-1 text-slate-900"></h3>
              <p id="previewDesc" class="text-xs text-slate-400 mb-4"></p>
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

  if (!filtered.length) {
    list.innerHTML = '<p class="text-slate-400 text-sm text-center py-8">No se encontraron lecciones.</p>'
    return
  }

  if (q) {
    list.innerHTML = filtered.map(l => lessonCardHtml(l)).join('')
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
        <div class="flex items-center gap-2 mb-2 pb-1.5 border-b border-slate-100">
          <span>${escapeHtml(cat.emoji)}</span>
          <span class="font-black text-sm text-slate-700">${escapeHtml(cat.nombre)}</span>
          <span class="text-xs text-slate-400 ml-1">${catLessons.length}</span>
        </div>
        ${catLessons.length
          ? catLessons.map(l => lessonCardHtml(l)).join('')
          : '<p class="text-xs text-slate-400 pl-1 pb-2">Sin lecciones.</p>'}
      </div>`
    }
    if (uncategorized.length) {
      html += `<div class="mb-6">
        <div class="flex items-center gap-2 mb-2 pb-1.5 border-b border-slate-100">
          <span>📁</span>
          <span class="font-black text-sm text-slate-700">Sin categoría</span>
          <span class="text-xs text-slate-400 ml-1">${uncategorized.length}</span>
        </div>
        ${uncategorized.map(l => lessonCardHtml(l)).join('')}
      </div>`
    }
    list.innerHTML = html || '<p class="text-slate-400 text-sm text-center py-8">No hay lecciones aún.</p>'
  }

  lucide.createIcons()
  wireLessonCards()
}

function lessonCardHtml(l) {
  return `
    <div class="lesson-card bg-white rounded-xl border border-slate-100 p-3.5 flex items-center gap-3 mb-2 cursor-pointer hover:border-[#E92129] hover:shadow-sm transition-all" data-id="${l.id}">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <p class="font-bold text-sm text-slate-800 truncate">${escapeHtml(l.titulo)}</p>
          <span class="shrink-0 text-[10px] text-slate-400">#${escapeHtml(String(l.orden))}</span>
        </div>
        <p class="text-xs text-slate-400 mt-0.5 line-clamp-1">${escapeHtml(l.descripcion || '')}</p>
      </div>
      <div class="flex gap-1 shrink-0">
        <button data-id="${l.id}" class="copy-whatsapp p-1.5 rounded-lg hover:bg-green-50 text-slate-400 hover:text-green-600" title="Copiar para WhatsApp" aria-label="Copiar lección para WhatsApp">
          <i data-lucide="share-2" class="w-4 h-4"></i>
        </button>
        <button data-id="${l.id}" data-titulo="${escapeHtml(l.titulo)}" class="del-lesson p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500" title="Eliminar" aria-label="Eliminar lección ${escapeHtml(l.titulo)}">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    </div>`
}

function wireLessonCards() {
  const list = document.getElementById('lessonsList')
  if (!list) return

  list.querySelectorAll('.lesson-card').forEach(card => {
    card.addEventListener('click', async e => {
      if (e.target.closest('.del-lesson') || e.target.closest('.copy-whatsapp')) return
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
    await supabase.from('lecciones').delete().eq('id', b.dataset.id)
    renderLessonsPanel()
  }))
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
  const colors = { step: '#E92129', image: '#3b82f6', video: '#8b5cf6', link: '#16a34a',
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
      <div class="upload-zone border-2 border-dashed border-slate-200 rounded-lg p-3 text-center mb-1.5 transition-colors">
        ${block.url ? `
          <div class="flex items-center gap-2 bg-slate-50 rounded-lg p-2">
            <img src="${escapeHtml(block.url)}" class="w-10 h-10 object-cover rounded shrink-0" onerror="this.style.display='none'">
            <span class="text-xs text-slate-600 truncate flex-1">${escapeHtml(block.url.split('/').pop())}</span>
            <button type="button" class="clear-upload text-slate-300 hover:text-red-400 text-sm px-1">✕</button>
          </div>
        ` : `
          <p class="text-slate-400 text-xs mb-2">🖼️ Arrastra una imagen aquí o</p>
          <div class="flex gap-1.5 justify-center">
            <button type="button" class="pick-file px-3 py-1.5 bg-[#E92129] text-white text-xs rounded-lg">📁 Buscar</button>
            <button type="button" class="pick-library px-3 py-1.5 bg-slate-100 text-slate-600 text-xs rounded-lg border border-slate-200">🗂️ Biblioteca</button>
          </div>
        `}
        <div class="upload-progress hidden mt-2">
          <div class="h-1 bg-slate-200 rounded-full overflow-hidden"><div class="upload-bar h-full bg-[#E92129] transition-all" style="width:0%"></div></div>
          <p class="text-xs text-slate-400 mt-1">Subiendo...</p>
        </div>
      </div>
      <input data-field="caption" value="${escapeHtml(block.caption || '')}" placeholder="Pie de foto (opcional)"
        class="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129]">`
  } else if (block.type === 'video') {
    fields = `<input data-field="url" value="${escapeHtml(block.url || '')}" placeholder="URL de YouTube"
        class="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129] mb-1.5">
      <input data-field="label" value="${escapeHtml(block.label || '')}" placeholder="Etiqueta del video"
        class="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129]">`
  } else if (block.type === 'link') {
    fields = `<input data-field="url" value="${escapeHtml(block.url || '')}" placeholder="URL del enlace"
        class="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129] mb-1.5">
      <input data-field="label" value="${escapeHtml(block.label || '')}" placeholder="Texto del enlace"
        class="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129]">`
  }

  const cardBg = isBotBlock ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'
  return `<div data-idx="${i}" class="${cardBg} border rounded-xl p-2.5 flex items-start gap-2">
    <div class="drag-handle text-slate-300 text-lg cursor-grab mt-0.5 select-none leading-none">⠿</div>
    <div class="flex-1 min-w-0">
      <div class="text-[9px] font-black uppercase mb-1.5" style="color:${color}">${label}</div>
      ${fields}
    </div>
    <button class="del-block text-slate-300 hover:text-red-400 text-sm px-1 mt-0.5 shrink-0" aria-label="Eliminar bloque">✕</button>
  </div>`
}

function renderQuestionList() {
  const list = document.getElementById('questionList')
  if (!list) return
  if (questionsSortable) { questionsSortable.destroy(); questionsSortable = null }

  list.innerHTML = currentQuestions.map((q, qi) => `
    <div data-qi="${qi}" class="bg-white border border-slate-200 rounded-xl p-3">
      <div class="flex items-start gap-2 mb-2">
        <div class="drag-handle-q text-slate-300 text-lg cursor-grab select-none leading-none mt-0.5">⠿</div>
        <input data-qi="${qi}" class="q-text flex-1 px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129]"
          placeholder="Pregunta" value="${escapeHtml(q.pregunta || '')}">
        <button data-qi="${qi}" class="del-q text-slate-300 hover:text-red-400 text-sm px-1 shrink-0 mt-1" aria-label="Eliminar pregunta">✕</button>
      </div>
      <div class="space-y-1.5 ml-6">
        ${(q.opciones || []).map((op, oi) => `
          <div class="flex items-center gap-2">
            <input type="radio" name="correct-${qi}" data-qi="${qi}" data-oi="${oi}" class="correct-radio shrink-0" ${q.correcta === oi ? 'checked' : ''}>
            <input data-qi="${qi}" data-oi="${oi}" class="opt-text flex-1 px-2 py-1 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129]"
              placeholder="Opción ${oi + 1}" value="${escapeHtml(op || '')}">
            ${q.opciones.length > 2 ? `<button data-qi="${qi}" data-oi="${oi}" class="del-opt text-slate-300 hover:text-red-400 text-xs px-1">✕</button>` : ''}
          </div>
        `).join('')}
        ${q.opciones.length < 4 ? `<button data-qi="${qi}" class="add-opt text-[10px] font-bold text-slate-400 hover:text-slate-700 mt-1">+ Opción</button>` : ''}
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
      <button id="addTerm" class="bg-[#E92129] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:scale-105 transition-transform">
        <i data-lucide="plus" class="w-3.5 h-3.5"></i> Nuevo término
      </button>
    </div>
    <div class="space-y-2">
      ${(data || []).map(g => `
        <div class="bg-white rounded-xl border border-slate-100 p-3 flex items-start justify-between gap-3">
          <div>
            <p class="font-bold text-sm text-[#E92129]">${escapeHtml(g.termino)}</p>
            <p class="text-xs text-slate-500 mt-0.5">${escapeHtml(g.definicion)}</p>
          </div>
          <div class="flex gap-1 shrink-0">
            <button data-id="${g.id}" data-term="${escapeHtml(g.termino)}" data-def="${escapeHtml(g.definicion)}" class="edit-term p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Editar término ${escapeHtml(g.termino)}">
              <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
            <button data-id="${g.id}" class="del-term p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-500" aria-label="Eliminar término ${escapeHtml(g.termino)}">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `).join('') || '<p class="text-slate-400 text-sm">No hay términos aún.</p>'}
    </div>
    <div id="termForm" class="hidden mt-4 bg-white rounded-2xl border border-slate-200 p-4">
      <input type="hidden" id="termId">
      <input id="termTermino" placeholder="Término" required class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129] mb-2">
      <textarea id="termDefinicion" placeholder="Definición" rows="2" required class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129] resize-none mb-2"></textarea>
      <div class="flex gap-2">
        <button id="cancelTerm" class="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-500">Cancelar</button>
        <button id="saveTerm" class="flex-1 py-2 rounded-xl bg-[#E92129] text-white text-sm font-bold">Guardar</button>
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

async function renderMaterialPanel() {
  const el = document.getElementById('panel-material')
  el.innerHTML = `
    <div class="max-w-4xl mx-auto">
      <h2 class="text-lg font-black mb-4">Biblioteca de archivos</h2>

      <div id="materialDropzone" class="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center mb-6 hover:border-[#E92129] transition-colors cursor-pointer">
        <div class="text-4xl mb-3">📁</div>
        <p class="text-slate-400 text-sm mb-3">Arrastra archivos aquí o</p>
        <button id="materialPickFile" class="px-4 py-2 bg-[#E92129] text-white text-sm rounded-lg font-bold">📁 Buscar archivo</button>
        <p class="text-xs text-slate-400 mt-2">Cualquier tipo · Máx. 50MB</p>
        <div id="materialProgress" class="hidden mt-4">
          <div class="h-1.5 bg-slate-200 rounded-full overflow-hidden max-w-xs mx-auto">
            <div id="materialProgressBar" class="h-full bg-[#E92129] transition-all" style="width:0%"></div>
          </div>
          <p class="text-xs text-slate-400 mt-1">Subiendo...</p>
        </div>
      </div>

      <div class="flex items-center gap-3 mb-4">
        <input id="materialSearch" type="text" placeholder="🔍 Buscar archivos..."
          class="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-[#E92129]">
        <span id="materialFileCount" class="text-xs text-slate-400 shrink-0"></span>
      </div>

      <div id="materialGrid" class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
        <p class="col-span-5 text-center text-slate-400 text-sm py-12">Cargando archivos...</p>
      </div>
    </div>
  `

  let files = []

  const loadFiles = async () => {
    const grid = document.getElementById('materialGrid')
    if (!grid) return
    grid.innerHTML = '<p class="col-span-5 text-center text-slate-400 text-sm py-12">Cargando...</p>'
    try {
      files = await listFiles()
      renderMaterialGrid(files)
    } catch {
      grid.innerHTML = `<p class="col-span-5 text-center text-red-400 text-sm py-12">Error al cargar. <button onclick="renderMaterialPanel()" class="underline">Reintentar</button></p>`
    }
  }

  await loadFiles()

  document.getElementById('materialSearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase()
    renderMaterialGrid(files.filter(f => f.name.toLowerCase().includes(q)))
  })

  const dropzone = document.getElementById('materialDropzone')
  const progressDiv = document.getElementById('materialProgress')
  const progressBar = document.getElementById('materialProgressBar')

  const doUpload = async (file) => {
    progressDiv.classList.remove('hidden')
    progressBar.style.width = '0%'
    try {
      await uploadFile(file, pct => { progressBar.style.width = pct + '%' })
      showToast('Archivo subido correctamente')
      await loadFiles()
    } catch (e) {
      showToast(e.message || 'Error al subir archivo', 'error')
    } finally {
      progressDiv.classList.add('hidden')
    }
  }

  dropzone.addEventListener('dragover', e => {
    e.preventDefault()
    dropzone.classList.add('border-[#E92129]', 'bg-red-50')
  })
  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('border-[#E92129]', 'bg-red-50')
  })
  dropzone.addEventListener('drop', e => {
    e.preventDefault()
    dropzone.classList.remove('border-[#E92129]', 'bg-red-50')
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

function renderMaterialGrid(files) {
  const grid = document.getElementById('materialGrid')
  const count = document.getElementById('materialFileCount')
  if (!grid) return
  if (count) count.textContent = `${files.length} archivos`

  if (!files.length) {
    grid.innerHTML = '<p class="col-span-5 text-center text-slate-400 text-sm py-12">No hay archivos subidos aún</p>'
    return
  }

  grid.innerHTML = files.map(f => `
    <div class="group relative bg-white border border-slate-100 rounded-xl p-3 text-center shadow-sm hover:shadow-md transition-shadow">
      ${f.type.startsWith('image/')
        ? `<img src="${escapeHtml(f.url)}" alt="" class="w-full h-16 object-cover rounded-lg mb-2" loading="lazy">`
        : `<div class="text-3xl mb-2">${fileIcon(f.type)}</div>`}
      <p class="text-xs text-slate-700 truncate font-medium" title="${escapeHtml(displayName(f.name))}">${escapeHtml(displayName(f.name))}</p>
      <p class="text-xs text-slate-400">${formatBytes(f.size)}</p>
      <div class="absolute inset-0 bg-black/60 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
        <button class="copy-url bg-blue-500 text-white rounded-lg px-2 py-1 text-xs font-bold"
          data-url="${escapeHtml(f.url)}" data-name="${escapeHtml(f.name)}">📋 URL</button>
        <button class="delete-file bg-red-500 text-white rounded-lg px-2 py-1 text-xs font-bold"
          data-path="${escapeHtml(f.name)}">🗑️</button>
      </div>
    </div>
  `).join('')

  grid.querySelectorAll('.copy-url').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      navigator.clipboard.writeText(btn.dataset.url)
        .then(() => showToast(`URL de "${btn.dataset.name}" copiada`))
        .catch(() => showToast('No se pudo copiar al portapapeles', 'error'))
    })
  })

  grid.querySelectorAll('.delete-file').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation()
      if (!confirm(`¿Eliminar "${btn.dataset.path}"?`)) return
      try {
        await deleteFile(btn.dataset.path)
        showToast('Archivo eliminado')
        const updated = await listFiles()
        renderMaterialGrid(updated)
      } catch {
        showToast('Error al eliminar el archivo', 'error')
      }
    })
  })
}

async function renderSuggestionsPanel() {
  const el = document.getElementById('panel-suggestions')
  const { data } = await supabase.from('bot_sugerencias').select('*').order('orden')

  el.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-black">Sugerencias Bot</h2>
        <p class="text-xs text-slate-400 mt-0.5">Máximo 6 activas. Se muestran en el chat de Bodi.</p>
      </div>
      <button id="addSuggestion" class="bg-[#E92129] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:scale-105 transition-transform">
        <i data-lucide="plus" class="w-3.5 h-3.5"></i> Nueva sugerencia
      </button>
    </div>
    <div class="space-y-2">
      ${(data || []).map(s => `
        <div class="bg-white rounded-xl border border-slate-100 p-3 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <span class="text-xs font-black text-slate-300 w-5 text-center">${escapeHtml(String(s.orden))}</span>
            <p class="font-bold text-sm truncate">${escapeHtml(s.texto)}</p>
            ${s.activo
              ? '<span class="shrink-0 text-[10px] font-black bg-green-50 text-green-600 px-2 py-0.5 rounded-full">Activo</span>'
              : '<span class="shrink-0 text-[10px] font-black bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">Inactivo</span>'
            }
          </div>
          <div class="flex gap-1 shrink-0">
            <button data-id="${s.id}" data-texto="${escapeHtml(s.texto)}" data-orden="${escapeHtml(String(s.orden))}" data-activo="${escapeHtml(String(s.activo))}" class="edit-sug p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" aria-label="Editar sugerencia ${escapeHtml(s.texto)}">
              <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
            <button data-id="${s.id}" class="del-sug p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-500" aria-label="Eliminar sugerencia ${escapeHtml(s.texto)}">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `).join('') || '<p class="text-slate-400 text-sm">No hay sugerencias. Crea la primera.</p>'}
    </div>
    <div id="sugForm" class="hidden mt-4 bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
      <input type="hidden" id="sugId">
      <input id="sugTexto" placeholder="Texto del chip (max 60 caracteres)" maxlength="60" required
        class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
      <input id="sugOrden" type="number" placeholder="Orden (ej: 1)" required min="0"
        class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
      <label class="flex items-center gap-2 cursor-pointer">
        <input id="sugActivo" type="checkbox" checked class="w-4 h-4 accent-[#E92129]">
        <span class="text-sm font-bold text-slate-700">Activo</span>
      </label>
      <p id="sugError" class="hidden text-red-500 text-xs"></p>
      <div class="flex gap-2">
        <button id="cancelSug" class="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-500">Cancelar</button>
        <button id="saveSug" class="flex-1 py-2 rounded-xl bg-[#E92129] text-white text-sm font-bold">Guardar</button>
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
    await supabase.from('bot_sugerencias').delete().eq('id', b.dataset.id)
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
    document.getElementById('sugForm').classList.add('hidden')
    renderSuggestionsPanel()
  })
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
    zone.classList.add('border-[#E92129]', 'bg-red-50')
  })
  zone.addEventListener('dragleave', () => {
    zone.classList.remove('border-[#E92129]', 'bg-red-50')
  })
  zone.addEventListener('drop', e => {
    e.preventDefault()
    e.stopPropagation()
    zone.classList.remove('border-[#E92129]', 'bg-red-50')
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
  if (!type) return '📁'
  if (type.startsWith('image/')) return '🖼️'
  if (type === 'application/pdf') return '📄'
  if (type.startsWith('video/')) return '🎬'
  if (type.startsWith('audio/')) return '🎵'
  return '📁'
}

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function displayName(name) {
  return name.replace(/-\d{13}(\.[^.]+)?$/, '$1')
}

function showToast(msg, type = 'success') {
  const t = document.createElement('div')
  t.className = `fixed bottom-4 right-4 z-[100] px-4 py-3 rounded-xl text-sm font-medium shadow-lg text-white ${
    type === 'error' ? 'bg-red-500' : 'bg-emerald-500'
  }`
  t.textContent = msg
  document.body.appendChild(t)
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
  grid.innerHTML = '<p class="col-span-4 text-center text-slate-400 text-sm py-8">Cargando...</p>'

  let files = []
  try {
    files = await listFiles()
    renderMediaGrid(files)
  } catch {
    grid.innerHTML = '<p class="col-span-4 text-center text-red-400 text-sm py-8">Error al cargar archivos</p>'
  }

  search.oninput = () => {
    const q = search.value.toLowerCase()
    renderMediaGrid(files.filter(f => f.name.toLowerCase().includes(q)))
  }
}

function renderMediaGrid(files) {
  const grid = document.getElementById('mediaGrid')
  const count = document.getElementById('mediaCount')
  if (!grid) return
  count.textContent = `${files.length} archivos`

  if (!files.length) {
    grid.innerHTML = '<p class="col-span-4 text-center text-slate-400 text-sm py-8">No hay archivos subidos</p>'
    return
  }

  grid.innerHTML = files.map(f => {
    const thumb = f.type.startsWith('image/')
      ? `<img src="${escapeHtml(f.url)}" alt="" class="w-full h-14 object-cover rounded-lg mb-1" loading="lazy">`
      : `<div class="text-3xl mb-1">${fileIcon(f.type)}</div>`
    return `
    <div class="media-item cursor-pointer border-2 border-transparent rounded-xl p-2 text-center hover:border-[#E92129] transition-colors"
         data-url="${escapeHtml(f.url)}" data-name="${escapeHtml(f.name)}">
      ${thumb}
      <p class="text-xs text-slate-700 truncate" title="${escapeHtml(displayName(f.name))}">${escapeHtml(displayName(f.name))}</p>
      <p class="text-xs text-slate-400">${formatBytes(f.size)}</p>
    </div>`
  }).join('')

  grid.querySelectorAll('.media-item').forEach(item => {
    item.addEventListener('click', () => {
      grid.querySelectorAll('.media-item').forEach(i => {
        i.classList.remove('border-[#E92129]', 'bg-red-50')
      })
      item.classList.add('border-[#E92129]', 'bg-red-50')
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
