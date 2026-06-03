import { supabase } from './supabase.js'
import { requireAuth, logout } from './auth.js'
import { uploadFile, listFiles, deleteFile } from './upload.js'
import { renderBlocks } from './block-renderer.js'
import { applyFormat } from './step-formatter.js'

let currentBlocks = []
let sortableInstance = null
let currentQuestions = []
let questionsSortable = null

async function init() {
  const ok = await requireAuth()
  if (!ok) return

  document.getElementById('loginScreen').classList.add('hidden')
  document.getElementById('adminApp').classList.remove('hidden')
  document.getElementById('logoutBtn').addEventListener('click', logout)

  await renderLessonsPanel()
  lucide.createIcons()
  initMediaLibraryModal()

  document.querySelectorAll('.admin-nav').forEach(btn => {
    btn.addEventListener('click', () => switchPanel(btn.dataset.panel))
  })
}

function switchPanel(panel) {
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
  const el = document.getElementById('panel-lessons')
  const { data } = await supabase.from('lecciones').select('*').order('orden')

  el.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-black">Lecciones</h2>
      <button id="addLesson" class="bg-[#E92129] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:scale-105 transition-transform">
        <i data-lucide="plus" class="w-3.5 h-3.5"></i> Nueva lección
      </button>
    </div>
    <div id="lessonsList" class="space-y-3">
      ${(data || []).map(l => `
        <div class="bg-white rounded-2xl border border-slate-100 p-4 flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="font-bold text-sm">${escapeHtml(l.titulo)}</p>
            <p class="text-xs text-slate-500 mt-0.5 line-clamp-1">${escapeHtml(l.descripcion)}</p>
          </div>
          <div class="flex gap-2 shrink-0">
            <button data-id="${l.id}" class="edit-lesson p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
              <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
            <button data-id="${l.id}" class="del-lesson p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-500">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `).join('') || '<p class="text-slate-400 text-sm">No hay lecciones. Crea la primera.</p>'}
    </div>
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
                <option>Ventas</option>
                <option>Inventario</option>
                <option>Ingresos</option>
                <option>Egresos</option>
                <option>Contactos</option>
                <option>Configuración</option>
              </select>
            </div>
            <p class="text-[10px] font-black uppercase text-slate-400 tracking-wide mb-2">Contenido</p>
            <div id="blockList" class="space-y-2 mb-3"></div>
            <div class="flex flex-wrap gap-1.5 mb-4">
              <button data-type="step" class="add-block bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-slate-200">+ Paso</button>
              <button data-type="image" class="add-block bg-blue-50 text-blue-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-blue-100">+ Imagen</button>
              <button data-type="video" class="add-block bg-purple-50 text-purple-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-purple-100">+ Video</button>
              <button data-type="link" class="add-block bg-green-50 text-green-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-green-100">+ Link</button>
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

  document.getElementById('addLesson').addEventListener('click', () => openLessonForm())
  document.querySelectorAll('.edit-lesson').forEach(b => b.addEventListener('click', async () => {
    const { data } = await supabase.from('lecciones').select('*').eq('id', b.dataset.id).single()
    openLessonForm(data)
  }))
  document.querySelectorAll('.del-lesson').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Eliminar esta lección?')) return
    await supabase.from('lecciones').delete().eq('id', b.dataset.id)
    renderLessonsPanel()
  }))
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
        step:  { type, text: '' },
        image: { type, url: '', caption: '' },
        video: { type, url: '', label: '' },
        link:  { type, url: '', label: '' },
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
    if (error) { alert('Error al guardar: ' + error.message); return }
    document.getElementById('lessonFormModal').classList.add('hidden')
    renderLessonsPanel()
  })
}

function openLessonForm(lesson = null) {
  document.getElementById('lessonFormTitle').textContent = lesson ? 'Editar lección' : 'Nueva lección'
  document.getElementById('lessonId').value = lesson?.id || ''
  document.getElementById('lessonTitulo').value = lesson?.titulo || ''
  document.getElementById('lessonDescripcion').value = lesson?.descripcion || ''
  document.getElementById('lessonCategoria').value = lesson?.categoria || 'Ventas'
  document.getElementById('lessonNotas').value = lesson?.notas || ''
  document.getElementById('lessonOrden').value = lesson?.orden || ''
  document.getElementById('previewTitle').textContent = lesson?.titulo || ''
  document.getElementById('previewDesc').textContent = lesson?.descripcion || ''

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
  renderBlockList()
  renderQuestionList()
  updatePreview()
  document.getElementById('lessonFormModal').classList.remove('hidden')
}

function renderBlockList() {
  const list = document.getElementById('blockList')
  if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null }

  list.innerHTML = currentBlocks.map((b, i) => blockItemHtml(b, i)).join('')

  list.querySelectorAll('input, textarea').forEach(input => {
    input.addEventListener('input', () => {
      const idx = parseInt(input.closest('[data-idx]').dataset.idx)
      currentBlocks[idx][input.dataset.field] = input.value
      updatePreview()
    })
  })

  list.querySelectorAll('.del-block').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.closest('[data-idx]').dataset.idx)
      currentBlocks.splice(idx, 1)
      renderBlockList()
      updatePreview()
    })
  })

  list.querySelectorAll('.fmt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const textarea = btn.closest('[data-idx]').querySelector('textarea[data-field="text"]')
      applyFormat(textarea, btn.dataset.marker)
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
  const colors = { step: '#E92129', image: '#3b82f6', video: '#8b5cf6', link: '#16a34a' }
  const labels = { step: '📝 Paso', image: '🖼️ Imagen', video: '▶️ Video YouTube', link: '🔗 Link' }
  const color = colors[block.type] || '#94a3b8'
  const label = labels[block.type] || escapeHtml(block.type)

  let fields = ''
  if (block.type === 'step') {
    fields = `
      <div class="flex gap-1 mb-1.5">
        <button type="button" class="fmt-btn px-2 py-0.5 rounded text-[10px] font-black bg-slate-200 hover:bg-slate-300 text-slate-700 leading-none" data-marker="**" title="Negrita"><strong>B</strong></button>
        <button type="button" class="fmt-btn px-2 py-0.5 rounded text-[10px] font-black bg-slate-200 hover:bg-slate-300 text-slate-700 leading-none" data-marker="*" title="Cursiva"><em>I</em></button>
        <button type="button" class="fmt-btn px-2 py-0.5 rounded text-[10px] font-black bg-slate-200 hover:bg-slate-300 text-slate-700 leading-none" data-marker="__" title="Subrayado"><u>U</u></button>
      </div>
      <textarea data-field="text" rows="2" placeholder="Texto del paso..."
        class="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129] resize-none">${escapeHtml(block.text || '')}</textarea>`
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

  return `<div data-idx="${i}" class="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-start gap-2">
    <div class="drag-handle text-slate-300 text-lg cursor-grab mt-0.5 select-none leading-none">⠿</div>
    <div class="flex-1 min-w-0">
      <div class="text-[9px] font-black uppercase mb-1.5" style="color:${color}">${label}</div>
      ${fields}
    </div>
    <button class="del-block text-slate-300 hover:text-red-400 text-sm px-1 mt-0.5 shrink-0">✕</button>
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
        <button data-qi="${qi}" class="del-q text-slate-300 hover:text-red-400 text-sm px-1 shrink-0 mt-1">✕</button>
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
            <button data-id="${g.id}" data-term="${escapeHtml(g.termino)}" data-def="${escapeHtml(g.definicion)}" class="edit-term p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
              <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
            <button data-id="${g.id}" class="del-term p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-500">
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
    const id = document.getElementById('termId').value
    const payload = {
      termino: document.getElementById('termTermino').value,
      definicion: document.getElementById('termDefinicion').value,
    }
    if (id) {
      await supabase.from('glosario').update(payload).eq('id', id)
    } else {
      await supabase.from('glosario').insert(payload)
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
      <div class="text-3xl mb-2">${fileIcon(f.type)}</div>
      <p class="text-xs text-slate-700 truncate font-medium" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</p>
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
            <button data-id="${s.id}" data-texto="${escapeHtml(s.texto)}" data-orden="${escapeHtml(String(s.orden))}" data-activo="${escapeHtml(String(s.activo))}" class="edit-sug p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
              <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
            <button data-id="${s.id}" class="del-sug p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-500">
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

    if (activo) {
      const { data: activos } = await supabase
        .from('bot_sugerencias')
        .select('id')
        .eq('activo', true)
      const otrasActivas = (activos || []).filter(s => s.id !== id)
      if (otrasActivas.length >= 6) {
        errorEl.textContent = 'Máximo 6 sugerencias activas. Desactiva una antes de agregar otra.'
        errorEl.classList.remove('hidden')
        return
      }
    }

    errorEl.classList.add('hidden')
    const payload = { texto, orden, activo }
    if (id) {
      await supabase.from('bot_sugerencias').update(payload).eq('id', id)
    } else {
      await supabase.from('bot_sugerencias').insert(payload)
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

  grid.innerHTML = files.map(f => `
    <div class="media-item cursor-pointer border-2 border-transparent rounded-xl p-2 text-center hover:border-[#E92129] transition-colors"
         data-url="${escapeHtml(f.url)}" data-name="${escapeHtml(f.name)}">
      <div class="text-3xl mb-1">${fileIcon(f.type)}</div>
      <p class="text-xs text-slate-700 truncate" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</p>
      <p class="text-xs text-slate-400">${formatBytes(f.size)}</p>
    </div>
  `).join('')

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

function escapeHtml(text) {
  if (!text) return ''
  return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

async function renderResultsPanel() {
  const el = document.getElementById('panel-results')
  if (!el) return
  el.innerHTML = '<p class="text-slate-400 text-sm">Cargando resultados...</p>'

  const [{ data: students, error: studentsError }, { data: lessons, error: lessonsError }] = await Promise.all([
    supabase.from('progreso_estudiantes').select('*').order('created_at', { ascending: false }),
    supabase.from('lecciones').select('id'),
  ])

  if (studentsError || lessonsError) { el.innerHTML = '<p class="text-red-400 text-sm">Error al cargar resultados.</p>'; return }
  const totalLessons = lessons?.length || 0

  const completados = (students || []).filter(s => s.completado).length

  el.innerHTML = `
    <div class="mb-4">
      <h2 class="text-lg font-black">Resultados del curso</h2>
      <p class="text-xs text-slate-400 mt-0.5">${completados} estudiante${completados !== 1 ? 's' : ''} completaron el curso</p>
    </div>
    <div class="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-100">
            <th class="text-left px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-wide">Nombre</th>
            <th class="text-left px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-wide">Progreso</th>
            <th class="text-left px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-wide">Promedio</th>
            <th class="text-left px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-wide">Estado</th>
          </tr>
        </thead>
        <tbody>
          ${(students || []).map(s => {
            const entries = Object.values(s.progreso || {}).filter(v => v?.completado)
            const done = entries.length
            const avg = entries.length ? Math.round(entries.reduce((sum, v) => sum + (v.puntaje || 0), 0) / entries.length) : 0
            const badge = s.completado
              ? '<span class="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">Completado</span>'
              : '<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">En curso</span>'
            return `<tr class="border-b border-slate-50 last:border-0">
              <td class="px-4 py-3">
                <p class="font-bold">${escapeHtml(s.nombre)} ${escapeHtml(s.apellido)}</p>
                <p class="text-xs text-slate-400">${new Date(s.created_at).toLocaleDateString('es-HN')}</p>
              </td>
              <td class="px-4 py-3 text-xs text-slate-600">${done}/${totalLessons}</td>
              <td class="px-4 py-3 text-xs font-bold ${avg >= 70 ? 'text-green-600' : 'text-slate-500'}">${entries.length ? avg + '%' : '—'}</td>
              <td class="px-4 py-3">${badge}</td>
            </tr>`
          }).join('') || '<tr><td colspan="4" class="px-4 py-6 text-center text-slate-400 text-sm">Ningún estudiante registrado aún.</td></tr>'}
        </tbody>
      </table>
    </div>
  `
}

async function renderAnalyticsPanel(from = null, to = null) {
  const now = new Date()
  if (!from) { from = new Date(now); from.setHours(0, 0, 0, 0) }
  if (!to)   { to   = new Date(now); to.setHours(23, 59, 59, 999) }

  const el = document.getElementById('panel-analytics')
  if (!el) return
  el.innerHTML = '<p class="text-slate-400 text-sm">Cargando analytics...</p>'

  const duration = to - from
  const prevFrom = new Date(from - duration)
  const prevTo   = new Date(from - 1)

  const [{ data: events, error }, { data: prevEvents }] = await Promise.all([
    supabase.from('analytics_events').select('*')
      .gte('created_at', from.toISOString()).lte('created_at', to.toISOString()),
    supabase.from('analytics_events').select('event_type,created_at')
      .gte('created_at', prevFrom.toISOString()).lte('created_at', prevTo.toISOString()),
  ])

  if (error) { el.innerHTML = '<p class="text-red-400 text-sm">Error al cargar analytics.</p>'; return }

  const ev = events || []
  const prev = prevEvents || []

  function count(arr, type) { return arr.filter(e => e.event_type === type).length }
  function delta(cur, prv) {
    if (!prv) return ''
    const d = cur - prv
    if (d === 0) return '<span class="text-slate-400">sin cambio</span>'
    const sign = d > 0 ? '↑' : '↓'
    const color = d > 0 ? 'text-green-600' : 'text-red-500'
    return `<span class="${color} font-bold">${sign} ${Math.abs(d)}</span>`
  }

  const visits       = count(ev, 'page_view')
  const prevVisits   = count(prev, 'page_view')
  const newStudents  = count(ev, 'mode_selected')
  const prevStudents = count(prev, 'mode_selected')
  const passes       = ev.filter(e => e.event_type === 'exam_pass')
  const avgScore     = passes.length
    ? Math.round(passes.reduce((s, e) => s + (e.payload?.score || 0), 0) / passes.length)
    : 0
  const certViews  = count(ev, 'certificate_view')
  const certPrints = count(ev, 'certificate_print')

  function preset(label, f, t) {
    return `<button class="analytics-preset px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200"
      data-from="${f.toISOString()}" data-to="${t.toISOString()}">${label}</button>`
  }
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const todayEnd   = new Date(now); todayEnd.setHours(23, 59, 59, 999)
  function daysAgo(n) { const d = new Date(todayStart); d.setDate(d.getDate() - n); return d }
  function monthStart() { return new Date(now.getFullYear(), now.getMonth(), 1) }
  function yearStart()  { return new Date(now.getFullYear(), 0, 1) }
  const fmtDate = d => d.toISOString().split('T')[0]

  el.innerHTML = `
    <div class="flex items-center justify-between mb-5 flex-wrap gap-3">
      <h2 class="text-lg font-black">Analytics</h2>
      <div class="flex items-center gap-2 flex-wrap">
        ${preset('Hoy', todayStart, todayEnd)}
        ${preset('7 días', daysAgo(6), todayEnd)}
        ${preset('30 días', daysAgo(29), todayEnd)}
        ${preset('Este mes', monthStart(), todayEnd)}
        ${preset('Este año', yearStart(), todayEnd)}
        <div class="relative">
          <button id="analytics-cal-btn" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 hover:border-slate-300">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Personalizado
          </button>
          <div id="analytics-cal-dropdown" class="hidden absolute right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-4 z-20 flex gap-3 items-end" style="min-width:280px">
            <div class="flex flex-col gap-2 flex-1">
              <label class="text-xs font-bold text-slate-500">Desde</label>
              <input id="analytics-from-input" type="date" value="${fmtDate(from)}"
                class="px-2 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#E92129]">
              <label class="text-xs font-bold text-slate-500">Hasta</label>
              <input id="analytics-to-input" type="date" value="${fmtDate(to)}"
                class="px-2 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#E92129]">
            </div>
            <button id="analytics-apply-btn" class="px-3 py-1.5 bg-[#E92129] text-white text-xs font-bold rounded-lg">Aplicar</button>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-4 gap-4 mb-5">
      <div class="bg-white rounded-2xl border border-slate-100 p-4">
        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Visitas</p>
        <p class="text-2xl font-black text-slate-900">${visits}</p>
        <p class="text-xs mt-1">${delta(visits, prevVisits)}</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-100 p-4">
        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Nuevos estudiantes</p>
        <p class="text-2xl font-black text-slate-900">${newStudents}</p>
        <p class="text-xs mt-1">${delta(newStudents, prevStudents)}</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-100 p-4">
        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Puntaje promedio</p>
        <p class="text-2xl font-black text-slate-900">${passes.length ? avgScore + '%' : '—'}</p>
        <p class="text-xs text-slate-400 mt-1">En exámenes</p>
      </div>
      <div class="bg-white rounded-2xl border border-slate-100 p-4">
        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Certificados</p>
        <p class="text-2xl font-black text-slate-900">${certViews}</p>
        <p class="text-xs text-slate-400 mt-1">${certPrints} impresos</p>
      </div>
    </div>

    <div id="analytics-body"></div>
  `

  el.querySelectorAll('.analytics-preset').forEach(btn => {
    btn.addEventListener('click', () => {
      renderAnalyticsPanel(new Date(btn.dataset.from), new Date(btn.dataset.to))
    })
  })

  const calBtn = el.querySelector('#analytics-cal-btn')
  const calDrop = el.querySelector('#analytics-cal-dropdown')
  calBtn.addEventListener('click', e => {
    e.stopPropagation()
    calDrop.classList.toggle('hidden')
  })
  document.addEventListener('click', () => calDrop.classList.add('hidden'))
  el.querySelector('#analytics-apply-btn').addEventListener('click', () => {
    const f = new Date(el.querySelector('#analytics-from-input').value)
    const t = new Date(el.querySelector('#analytics-to-input').value)
    t.setHours(23, 59, 59, 999)
    if (isNaN(f) || isNaN(t) || f > t) return
    renderAnalyticsPanel(f, t)
  })

  renderAnalyticsBody(el.querySelector('#analytics-body'), ev, from, to)
}

function renderAnalyticsBody(container, ev, from, to) {
  container.innerHTML = '<p class="text-slate-400 text-sm">Secciones próximamente...</p>'
}

window.renderMaterialPanel = renderMaterialPanel

init()
