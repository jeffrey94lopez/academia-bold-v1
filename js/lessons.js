import { supabase } from './supabase.js'
import { renderBlocks } from './block-renderer.js'

async function renderLessons() {
  const container = document.getElementById('section-lessons')
  container.innerHTML = `
    <div class="h-full overflow-y-auto custom-scroll p-4">
      <h2 class="text-lg font-black mb-4">Lecciones</h2>
      <div id="lessonsGrid" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="text-slate-400 text-sm col-span-2 text-center py-8">Cargando lecciones...</div>
      </div>
    </div>
    <!-- Modal detalle -->
    <div id="lessonModal" class="hidden fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div class="bg-white dark:bg-slate-900 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col">
        <div class="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h3 id="modalTitle" class="font-black text-base"></h3>
          <button id="closeModal" class="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
            <i data-lucide="x" class="w-5 h-5"></i>
          </button>
        </div>
        <div id="modalContent" class="overflow-y-auto custom-scroll p-4 prose prose-sm dark:prose-invert max-w-none flex-1"></div>
      </div>
    </div>
  `

  const { data: lessons, error } = await supabase
    .from('lecciones')
    .select('*')
    .order('orden')

  const grid = document.getElementById('lessonsGrid')

  if (error || !lessons?.length) {
    grid.innerHTML = '<p class="text-slate-400 text-sm col-span-2 text-center py-8">No hay lecciones disponibles aún.</p>'
    return
  }

  grid.innerHTML = lessons.map((l, i) => `
    <button data-id="${l.id}" class="lesson-card text-left p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:shadow-md">
      <span class="inline-block text-[10px] font-black text-[#E92129] bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-full mb-2">Lección ${i + 1}</span>
      <p class="font-black text-sm mb-1">${escapeHtml(l.titulo)}</p>
      <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">${escapeHtml(l.descripcion)}</p>
      <p class="text-[10px] font-bold text-[#E92129] mt-2 flex items-center gap-1">
        Leer lección <i data-lucide="arrow-right" class="w-3 h-3"></i>
      </p>
    </button>
  `).join('')

  lucide.createIcons()

  grid.querySelectorAll('.lesson-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const lesson = lessons.find(l => l.id === btn.dataset.id)
      document.getElementById('modalTitle').textContent = lesson.titulo
      const contentEl = document.getElementById('modalContent')
      contentEl.innerHTML = ''
      let blocks
      try { blocks = JSON.parse(lesson.contenido) } catch (_) { blocks = null }
      if (Array.isArray(blocks)) {
        contentEl.appendChild(renderBlocks(blocks))
      } else {
        contentEl.innerHTML = lesson.contenido
      }
      document.getElementById('lessonModal').classList.remove('hidden')
    })
  })

  document.getElementById('closeModal').addEventListener('click', () => {
    document.getElementById('lessonModal').classList.add('hidden')
  })

  document.getElementById('lessonModal').addEventListener('click', e => {
    if (e.target === document.getElementById('lessonModal')) {
      document.getElementById('lessonModal').classList.add('hidden')
    }
  })
}

function escapeHtml(text) {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

renderLessons()
