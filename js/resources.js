import { supabase } from './supabase.js'

let activeSubTab = 'glossary'

async function renderResources() {
  const container = document.getElementById('section-resources')
  container.innerHTML = `
    <div class="h-full flex flex-col overflow-hidden">
      <div class="px-4 pt-4 pb-2 shrink-0">
        <h2 class="text-lg font-black mb-3">Recursos</h2>
        <div class="flex gap-2">
          <button id="tabGlossary" class="sub-tab px-4 py-1.5 rounded-full text-xs font-bold bg-[#E92129] text-white">Glosario</button>
          <button id="tabMaterial" class="sub-tab px-4 py-1.5 rounded-full text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800">Material de apoyo</button>
        </div>
      </div>

      <div id="subGlossary" class="flex-1 overflow-y-auto custom-scroll px-4 pb-4">
        <div class="mb-3">
          <input id="searchGlossary" type="text" placeholder="Buscar término..."
            class="w-full px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-[#E92129]">
        </div>
        <div id="glossaryList" class="space-y-2">
          <p class="text-slate-400 text-sm text-center py-8">Cargando glosario...</p>
        </div>
      </div>

      <div id="subMaterial" class="hidden flex-1 overflow-y-auto custom-scroll px-4 pb-4">
        <div id="materialList" class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <p class="text-slate-400 text-sm text-center py-8 col-span-2">Cargando material...</p>
        </div>
      </div>
    </div>
  `

  await Promise.all([loadGlossary(), loadMaterial()])
  bindResourceEvents()
}

async function loadGlossary() {
  const { data, error } = await supabase.from('glosario').select('*').order('termino')
  const list = document.getElementById('glossaryList')

  if (error || !data?.length) {
    list.innerHTML = '<p class="text-slate-400 text-sm text-center py-8">No hay términos en el glosario aún.</p>'
    return
  }

  const render = (items) => {
    list.innerHTML = items.map(g => `
      <div class="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800/50">
        <p class="font-black text-sm text-[#E92129]">${escapeHtml(g.termino)}</p>
        <p class="text-xs text-slate-600 dark:text-slate-400 mt-0.5">${escapeHtml(g.definicion)}</p>
      </div>
    `).join('')
  }

  render(data)

  document.getElementById('searchGlossary').addEventListener('input', e => {
    const q = e.target.value.toLowerCase()
    render(data.filter(g => g.termino.toLowerCase().includes(q) || g.definicion.toLowerCase().includes(q)))
  })
}

async function loadMaterial() {
  const { data, error } = await supabase.from('material_apoyo').select('*')
  const list = document.getElementById('materialList')

  if (error || !data?.length) {
    list.innerHTML = '<p class="text-slate-400 text-sm text-center py-8 col-span-2">No hay material disponible aún.</p>'
    return
  }

  const iconMap = { pdf: 'file-text', link: 'link', video: 'play-circle' }
  const colorMap = { pdf: 'text-red-500', link: 'text-blue-500', video: 'text-purple-500' }

  list.innerHTML = data.map(m => `
    <a href="${escapeHtml(m.url)}" target="_blank" rel="noopener"
      class="flex items-center gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 hover:border-[#E92129] transition-colors group">
      <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
        <i data-lucide="${iconMap[m.tipo] || 'file'}" class="w-5 h-5 ${colorMap[m.tipo] || 'text-slate-500'}"></i>
      </div>
      <div class="min-w-0">
        <p class="font-bold text-sm truncate group-hover:text-[#E92129] transition-colors">${escapeHtml(m.titulo)}</p>
        <p class="text-[10px] font-bold text-slate-400 uppercase">${escapeHtml(m.tipo)}</p>
      </div>
      <i data-lucide="external-link" class="w-4 h-4 text-slate-300 ml-auto shrink-0"></i>
    </a>
  `).join('')

  lucide.createIcons()
}

function bindResourceEvents() {
  document.getElementById('tabGlossary').addEventListener('click', () => switchSubTab('glossary'))
  document.getElementById('tabMaterial').addEventListener('click', () => switchSubTab('material'))
}

function switchSubTab(tab) {
  activeSubTab = tab
  document.getElementById('subGlossary').classList.toggle('hidden', tab !== 'glossary')
  document.getElementById('subMaterial').classList.toggle('hidden', tab !== 'material')
  document.getElementById('tabGlossary').className = `sub-tab px-4 py-1.5 rounded-full text-xs font-bold ${tab === 'glossary' ? 'bg-[#E92129] text-white' : 'text-slate-500 bg-slate-100 dark:bg-slate-800'}`
  document.getElementById('tabMaterial').className = `sub-tab px-4 py-1.5 rounded-full text-xs font-bold ${tab === 'material' ? 'bg-[#E92129] text-white' : 'text-slate-500 bg-slate-100 dark:bg-slate-800'}`
}

function escapeHtml(text) {
  if (!text) return ''
  return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

renderResources()
