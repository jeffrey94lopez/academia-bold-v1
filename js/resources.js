import { supabase } from './supabase.js'

let activeSubTab = 'glossary'

async function renderResources() {
  const container = document.getElementById('section-resources')
  container.innerHTML = `
    <div class="h-full flex flex-col overflow-hidden">
      <div class="px-4 pt-4 pb-2 shrink-0">
        <h2 class="text-lg font-black mb-3">Recursos</h2>
        <div class="flex gap-2">
          <button id="tabGlossary" class="sub-tab px-4 py-1.5 rounded-full text-xs font-bold bg-[var(--blue-100)] text-white">Glosario</button>
          <button id="tabMaterial" class="sub-tab px-4 py-1.5 rounded-full text-xs font-bold text-[var(--black-60)] bg-[var(--black-10)]">Material de apoyo</button>
        </div>
      </div>

      <div id="subGlossary" class="flex-1 overflow-y-auto custom-scroll px-4 pb-4">
        <div class="mb-3">
          <input id="searchGlossary" type="text" placeholder="Buscar término..."
            class="w-full px-4 py-2 rounded-xl bg-[var(--background-page)] text-sm outline-none focus:ring-2 focus:ring-[var(--blue-100)]">
        </div>
        <div id="glossaryList" class="space-y-2">
          <p class="text-[var(--black-60)] text-sm text-center py-8">Cargando glosario...</p>
        </div>
      </div>

      <div id="subMaterial" class="hidden flex-1 overflow-y-auto custom-scroll px-4 pb-4">
        <div id="materialList" class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <p class="text-[var(--black-60)] text-sm text-center py-8 col-span-2">Cargando material...</p>
        </div>
      </div>
    </div>
  `

  const { data: settingsRows } = await supabase.from('app_settings').select('key,value')
  const settings = settingsRows ? Object.fromEntries(settingsRows.map(r => [r.key, r.value])) : {}
  if (settings.resources_enabled === 'false') {
    document.getElementById('tabMaterial').classList.add('hidden')
  }

  await Promise.all([loadGlossary(), loadMaterial()])
  bindResourceEvents()
}

async function loadGlossary() {
  const { data, error } = await supabase.from('glosario').select('*').order('termino')
  const list = document.getElementById('glossaryList')

  if (error || !data?.length) {
    list.innerHTML = '<p class="text-[var(--black-60)] text-sm text-center py-8">No hay términos en el glosario aún.</p>'
    return
  }

  const render = (items) => {
    list.innerHTML = items.map(g => `
      <div class="p-3 rounded-xl border border-[var(--blue-10)] bg-white">
        <p class="font-black text-sm text-[var(--blue-100)]">${escapeHtml(g.termino)}</p>
        <p class="text-xs text-[var(--black-60)] mt-0.5">${escapeHtml(g.definicion)}</p>
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
    list.innerHTML = '<p class="text-[var(--black-60)] text-sm text-center py-8 col-span-2">No hay material disponible aún.</p>'
    return
  }

  const iconMap  = { pdf: 'file-text', link: 'link', video: 'play-circle' }
  const colorMap = { pdf: 'text-[var(--blue-100)]', link: 'text-[var(--info-100)]', video: 'text-[var(--blue-60)]' }

  list.innerHTML = data.map(m => `
    <a href="${escapeHtml(m.url)}" target="_blank" rel="noopener"
      class="flex items-center gap-3 p-4 rounded-2xl border border-[var(--blue-20)] bg-white hover:border-[var(--blue-100)] transition-colors group">
      <div class="w-10 h-10 rounded-xl bg-[var(--black-10)] flex items-center justify-center shrink-0">
        <i data-lucide="${iconMap[m.tipo] || 'file'}" class="w-5 h-5 ${colorMap[m.tipo] || 'text-[var(--black-60)]'}"></i>
      </div>
      <div class="min-w-0">
        <p class="font-bold text-sm truncate group-hover:text-[var(--blue-100)] transition-colors">${escapeHtml(m.titulo)}</p>
        <p class="text-[10px] font-bold text-[var(--black-60)] uppercase">${escapeHtml(m.tipo)}</p>
      </div>
      <i data-lucide="external-link" class="w-4 h-4 text-[var(--black-40)] ml-auto shrink-0"></i>
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
  document.getElementById('tabGlossary').className = `sub-tab px-4 py-1.5 rounded-full text-xs font-bold ${tab === 'glossary' ? 'bg-[var(--blue-100)] text-white' : 'text-[var(--black-60)] bg-[var(--black-10)]'}`
  document.getElementById('tabMaterial').className = `sub-tab px-4 py-1.5 rounded-full text-xs font-bold ${tab === 'material' ? 'bg-[var(--blue-100)] text-white' : 'text-[var(--black-60)] bg-[var(--black-10)]'}`
}

function escapeHtml(text) {
  if (!text) return ''
  return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

renderResources()
