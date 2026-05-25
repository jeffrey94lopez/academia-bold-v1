import { supabase } from './supabase.js'
import { requireAuth, logout } from './auth.js'
import { renderBlocks } from './block-renderer.js'

let currentBlocks = []
let sortableInstance = null

async function init() {
  const ok = await requireAuth()
  if (!ok) return

  document.getElementById('loginScreen').classList.add('hidden')
  document.getElementById('adminApp').classList.remove('hidden')
  document.getElementById('logoutBtn').addEventListener('click', logout)

  await renderLessonsPanel()
  lucide.createIcons()

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
}

async function renderLessonsPanel() {
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
            </div>
            <p class="text-[10px] font-black uppercase text-slate-400 tracking-wide mb-2">Contenido</p>
            <div id="blockList" class="space-y-2 mb-3"></div>
            <div class="flex flex-wrap gap-1.5 mb-4">
              <button data-type="step" class="add-block bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-slate-200">+ Paso</button>
              <button data-type="image" class="add-block bg-blue-50 text-blue-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-blue-100">+ Imagen</button>
              <button data-type="video" class="add-block bg-purple-50 text-purple-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-purple-100">+ Video</button>
              <button data-type="link" class="add-block bg-green-50 text-green-600 text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-green-100">+ Link</button>
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

  document.getElementById('saveLessonBtn').addEventListener('click', async () => {
    const id = document.getElementById('lessonId').value
    const payload = {
      titulo: document.getElementById('lessonTitulo').value,
      descripcion: document.getElementById('lessonDescripcion').value,
      contenido: JSON.stringify(currentBlocks),
      orden: parseInt(document.getElementById('lessonOrden').value),
    }
    if (id) {
      await supabase.from('lecciones').update(payload).eq('id', id)
    } else {
      await supabase.from('lecciones').insert(payload)
    }
    document.getElementById('lessonFormModal').classList.add('hidden')
    renderLessonsPanel()
  })
}

function openLessonForm(lesson = null) {
  document.getElementById('lessonFormTitle').textContent = lesson ? 'Editar lección' : 'Nueva lección'
  document.getElementById('lessonId').value = lesson?.id || ''
  document.getElementById('lessonTitulo').value = lesson?.titulo || ''
  document.getElementById('lessonDescripcion').value = lesson?.descripcion || ''
  document.getElementById('lessonOrden').value = lesson?.orden || ''
  document.getElementById('previewTitle').textContent = lesson?.titulo || ''
  document.getElementById('previewDesc').textContent = lesson?.descripcion || ''

  try {
    currentBlocks = lesson?.contenido ? JSON.parse(lesson.contenido) : []
    if (!Array.isArray(currentBlocks)) currentBlocks = []
  } catch (_) {
    currentBlocks = []
  }

  renderBlockList()
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

  sortableInstance = Sortable.create(list, {
    handle: '.drag-handle',
    animation: 150,
    onEnd(evt) {
      const moved = currentBlocks.splice(evt.oldIndex, 1)[0]
      currentBlocks.splice(evt.newIndex, 0, moved)
      updatePreview()
    },
  })
}

function blockItemHtml(block, i) {
  const colors = { step: '#E92129', image: '#3b82f6', video: '#8b5cf6', link: '#16a34a' }
  const labels = { step: '📝 Paso', image: '🖼️ Imagen', video: '▶️ Video YouTube', link: '🔗 Link' }
  const color = colors[block.type] || '#94a3b8'
  const label = labels[block.type] || block.type

  let fields = ''
  if (block.type === 'step') {
    fields = `<textarea data-field="text" rows="2" placeholder="Texto del paso..."
      class="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129] resize-none">${escapeHtml(block.text || '')}</textarea>`
  } else if (block.type === 'image') {
    fields = `<input data-field="url" value="${escapeHtml(block.url || '')}" placeholder="URL de imagen"
        class="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129] mb-1.5">
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
  const { data } = await supabase.from('material_apoyo').select('*')

  el.innerHTML = `
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-black">Material de apoyo</h2>
      <button id="addMaterial" class="bg-[#E92129] text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:scale-105 transition-transform">
        <i data-lucide="plus" class="w-3.5 h-3.5"></i> Agregar
      </button>
    </div>
    <div class="space-y-2">
      ${(data || []).map(m => `
        <div class="bg-white rounded-xl border border-slate-100 p-3 flex items-center justify-between gap-3">
          <div class="flex items-center gap-2.5 min-w-0">
            <span class="text-xs font-black uppercase text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">${escapeHtml(m.tipo)}</span>
            <p class="font-bold text-sm truncate">${escapeHtml(m.titulo)}</p>
          </div>
          <div class="flex gap-1 shrink-0">
            <button data-id="${m.id}" data-titulo="${escapeHtml(m.titulo)}" data-tipo="${escapeHtml(m.tipo)}" data-url="${escapeHtml(m.url)}" class="edit-mat p-1.5 rounded-lg hover:bg-slate-100 text-slate-500">
              <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
            <button data-id="${m.id}" class="del-mat p-1.5 rounded-lg hover:bg-red-50 text-slate-500 hover:text-red-500">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>
      `).join('') || '<p class="text-slate-400 text-sm">No hay material aún.</p>'}
    </div>
    <div id="matForm" class="hidden mt-4 bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
      <input type="hidden" id="matId">
      <input id="matTitulo" placeholder="Título del recurso" required
        class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
      <select id="matTipo" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129] bg-white">
        <option value="pdf">PDF</option>
        <option value="link">Link</option>
        <option value="video">Video</option>
      </select>
      <input id="matUrl" placeholder="URL del recurso" required
        class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
      <p class="text-xs text-slate-400">Para subir un archivo: ve a Supabase → Storage → bucket "material" → Upload, luego pega la URL pública aquí.</p>
      <div class="flex gap-2">
        <button id="cancelMat" class="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-500">Cancelar</button>
        <button id="saveMat" class="flex-1 py-2 rounded-xl bg-[#E92129] text-white text-sm font-bold">Guardar</button>
      </div>
    </div>
  `
  lucide.createIcons()

  document.getElementById('addMaterial').addEventListener('click', () => {
    document.getElementById('matId').value = ''
    document.getElementById('matTitulo').value = ''
    document.getElementById('matTipo').value = 'pdf'
    document.getElementById('matUrl').value = ''
    document.getElementById('matForm').classList.remove('hidden')
  })
  document.querySelectorAll('.edit-mat').forEach(b => b.addEventListener('click', () => {
    document.getElementById('matId').value = b.dataset.id
    document.getElementById('matTitulo').value = b.dataset.titulo
    document.getElementById('matTipo').value = b.dataset.tipo
    document.getElementById('matUrl').value = b.dataset.url
    document.getElementById('matForm').classList.remove('hidden')
  }))
  document.querySelectorAll('.del-mat').forEach(b => b.addEventListener('click', async () => {
    if (!confirm('¿Eliminar este material?')) return
    await supabase.from('material_apoyo').delete().eq('id', b.dataset.id)
    renderMaterialPanel()
  }))
  document.getElementById('cancelMat').addEventListener('click', () => {
    document.getElementById('matForm').classList.add('hidden')
  })
  document.getElementById('saveMat').addEventListener('click', async () => {
    const id = document.getElementById('matId').value
    const payload = {
      titulo: document.getElementById('matTitulo').value,
      tipo: document.getElementById('matTipo').value,
      url: document.getElementById('matUrl').value,
    }
    if (id) {
      await supabase.from('material_apoyo').update(payload).eq('id', id)
    } else {
      await supabase.from('material_apoyo').insert(payload)
    }
    renderMaterialPanel()
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

function escapeHtml(text) {
  if (!text) return ''
  return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

init()
