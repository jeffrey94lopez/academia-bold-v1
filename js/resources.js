import { supabase } from './supabase.js'

let activeSubTab = 'faq'

async function renderResources() {
  const container = document.getElementById('section-resources')
  container.innerHTML = `
    <div class="h-full flex flex-col overflow-hidden">
      <div class="px-4 pt-4 pb-2 shrink-0">
        <h2 class="text-lg font-black mb-3">Preguntas Frecuentes</h2>
        <div class="flex gap-2 overflow-x-auto">
          <button id="tabFaq" class="sub-tab shrink-0 px-4 py-1.5 rounded-full text-xs font-bold bg-[var(--blue-100)] text-white">Preguntas frecuentes</button>
          <button id="tabGlossary" class="sub-tab shrink-0 px-4 py-1.5 rounded-full text-xs font-bold text-[var(--black-60)] bg-[var(--black-10)]">Glosario</button>
          <button id="tabMaterial" class="sub-tab shrink-0 px-4 py-1.5 rounded-full text-xs font-bold text-[var(--black-60)] bg-[var(--black-10)]">Material de apoyo</button>
        </div>
      </div>

      <div id="subFaq" class="flex-1 overflow-y-auto custom-scroll px-4 pb-4">
        <div class="mb-3">
          <input id="faqStudentSearch" type="text" placeholder="Buscar pregunta..."
            class="w-full px-4 py-2 rounded-xl bg-[var(--background-page)] text-sm outline-none focus:ring-2 focus:ring-[var(--blue-100)]">
        </div>
        <div id="faqList" class="space-y-2">
          <p class="text-[var(--black-60)] text-sm text-center py-8">Cargando preguntas...</p>
        </div>
      </div>

      <div id="subGlossary" class="hidden flex-1 overflow-y-auto custom-scroll px-4 pb-4">
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

  const faqEnabled      = settings.faq_enabled !== 'false'
  const glossaryEnabled = settings.glossary_enabled !== 'false'
  const materialEnabled = settings.resources_enabled !== 'false'

  if (!faqEnabled) {
    document.getElementById('tabFaq').classList.add('hidden')
    document.getElementById('subFaq').classList.add('hidden')
  }
  if (!glossaryEnabled) {
    document.getElementById('tabGlossary').classList.add('hidden')
  }
  if (!materialEnabled) {
    document.getElementById('tabMaterial').classList.add('hidden')
  }

  // Show first enabled tab
  if (!faqEnabled) {
    if (glossaryEnabled) switchSubTab('glossary')
    else if (materialEnabled) switchSubTab('material')
  }

  await Promise.all([loadFaq(), loadGlossary(), loadMaterial()])
  bindResourceEvents()
}

async function loadFaq() {
  const { data, error } = await supabase.from('preguntas_frecuentes').select('*').order('orden').order('created_at')
  const list = document.getElementById('faqList')
  const searchInput = document.getElementById('faqStudentSearch')

  if (error || !data?.length) {
    list.innerHTML = '<p class="text-[var(--black-60)] text-sm text-center py-8">No hay preguntas frecuentes aún.</p>'
    return
  }

  const actionBtn = (f) => {
    if (f.leccion_id) {
      return `<button type="button" class="faq-lesson-btn mt-2 text-xs font-bold text-[var(--blue-100)] hover:underline" data-lesson-id="${f.leccion_id}">Ver lección →</button>`
    } else if (f.link_url && /^https?:\/\//i.test(f.link_url)) {
      return `<a href="${escapeHtml(f.link_url)}" target="_blank" rel="noopener noreferrer" class="mt-2 inline-block text-xs font-bold text-[var(--blue-100)] hover:underline">Más información →</a>`
    }
    return ''
  }

  function renderFaqList(items) {
    if (!items.length) {
      list.innerHTML = '<p class="text-[var(--black-60)] text-sm text-center py-8">No hay resultados.</p>'
      return
    }
    list.innerHTML = items.map(f => `
      <details class="rounded-xl border border-[var(--blue-10)] bg-white overflow-hidden">
        <summary class="flex items-center justify-between gap-2 p-3 cursor-pointer list-none font-bold text-sm select-none">
          <span>${escapeHtml(f.pregunta)}</span>
          <i data-lucide="chevron-down" class="w-4 h-4 shrink-0 text-[var(--black-60)] transition-transform faq-chevron"></i>
        </summary>
        <div class="px-3 pb-3 text-xs text-[var(--black-60)] border-t border-[var(--blue-10)] pt-2 mt-0">
          ${escapeHtml(f.respuesta)}
          ${actionBtn(f)}
        </div>
      </details>
    `).join('')

    lucide.createIcons()

    list.querySelectorAll('details').forEach(d => {
      d.addEventListener('toggle', () => {
        const icon = d.querySelector('.faq-chevron')
        if (icon) icon.style.transform = d.open ? 'rotate(180deg)' : ''
      })
    })

    list.querySelectorAll('.faq-lesson-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelector('[data-tab="lessons"]')?.click()
        setTimeout(() => window.openLessonById?.(btn.dataset.lessonId), 150)
      })
    })
  }

  renderFaqList(data)

  searchInput?.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase()
    const filtered = q ? data.filter(f =>
      f.pregunta.toLowerCase().includes(q) || f.respuesta.toLowerCase().includes(q)
    ) : data
    renderFaqList(filtered)
  })
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
  document.getElementById('tabFaq').addEventListener('click', () => switchSubTab('faq'))
  document.getElementById('tabGlossary').addEventListener('click', () => switchSubTab('glossary'))
  document.getElementById('tabMaterial').addEventListener('click', () => switchSubTab('material'))
}

function switchSubTab(tab) {
  activeSubTab = tab
  document.getElementById('subFaq').classList.toggle('hidden', tab !== 'faq')
  document.getElementById('subGlossary').classList.toggle('hidden', tab !== 'glossary')
  document.getElementById('subMaterial').classList.toggle('hidden', tab !== 'material')
  const active   = 'sub-tab shrink-0 px-4 py-1.5 rounded-full text-xs font-bold bg-[var(--blue-100)] text-white'
  const inactive = 'sub-tab shrink-0 px-4 py-1.5 rounded-full text-xs font-bold text-[var(--black-60)] bg-[var(--black-10)]'
  document.getElementById('tabFaq').className      = tab === 'faq'      ? active : inactive
  document.getElementById('tabGlossary').className = tab === 'glossary' ? active : inactive
  document.getElementById('tabMaterial').className = tab === 'material' ? active : inactive
}

function escapeHtml(text) {
  if (!text) return ''
  return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

renderResources()
