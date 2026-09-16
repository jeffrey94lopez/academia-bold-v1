import { supabase } from './supabase.js'
import { loadSettings } from './settings.js'

let activeSubTab = 'faq'

let filterFaq      = (_q) => {}
let filterGlossary = (_q) => {}
let filterMaterial = (_q) => {}

async function renderResources() {
  const container = document.getElementById('section-resources')
  container.innerHTML = `
    <div class="h-full flex flex-col overflow-hidden">
      <div class="px-4 pt-4 pb-2 shrink-0">
        <h2 class="text-lg font-black mb-3 text-[var(--blue-100)]">Preguntas Frecuentes</h2>
        <!-- Móvil: pestañas apiladas en vertical; desktop: fila horizontal -->
        <div class="flex flex-col md:flex-row gap-2 md:overflow-x-auto">
          <button id="tabFaq" class="sub-tab w-full md:w-auto shrink-0 px-4 py-2 md:py-1.5 rounded-full text-xs font-bold bg-[var(--blue-100)] text-white">Preguntas frecuentes</button>
          <button id="tabGlossary" class="sub-tab w-full md:w-auto shrink-0 px-4 py-2 md:py-1.5 rounded-full text-xs font-bold text-[var(--black-60)] bg-[var(--black-10)]">Glosario</button>
          <button id="tabMaterial" class="sub-tab w-full md:w-auto shrink-0 px-4 py-2 md:py-1.5 rounded-full text-xs font-bold text-[var(--black-60)] bg-[var(--black-10)]">Material de apoyo</button>
        </div>
      </div>

      <div class="px-4 pb-2 shrink-0">
        <input id="resourceSearch" type="text" placeholder="Buscar pregunta..."
          class="w-full px-4 py-2 rounded-xl bg-[var(--background-page)] text-base md:text-sm outline-none focus:ring-2 focus:ring-[var(--blue-100)]">
      </div>

      <div id="subFaq" class="flex-1 overflow-y-auto custom-scroll px-4 pb-4">
        <div id="faqList" class="space-y-2">
          <p class="text-[var(--black-60)] text-sm text-center py-8">Cargando preguntas...</p>
        </div>
      </div>

      <div id="subGlossary" class="hidden flex-1 overflow-y-auto custom-scroll px-4 pb-4">
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

  const settings = await loadSettings()

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

  const [faqFn, glossaryFn, materialFn] = await Promise.all([loadFaq(), loadGlossary(), loadMaterial()])
  filterFaq      = faqFn      ?? ((_q) => {})
  filterGlossary = glossaryFn ?? ((_q) => {})
  filterMaterial = materialFn ?? ((_q) => {})

  document.getElementById('resourceSearch').addEventListener('input', e => {
    const q = e.target.value
    if (activeSubTab === 'faq')           filterFaq(q)
    else if (activeSubTab === 'glossary') filterGlossary(q)
    else                                  filterMaterial(q)
  })

  bindResourceEvents()
}

// Refresco en vivo (Realtime): re-renderiza conservando sub-tab activa y búsqueda.
export async function refreshResources() {
  const search = document.getElementById('resourceSearch')
  const savedQuery = search ? search.value : ''
  const savedTab = activeSubTab
  await renderResources()
  if (savedTab !== 'faq') switchSubTab(savedTab)
  const restored = document.getElementById('resourceSearch')
  if (restored && savedQuery) {
    restored.value = savedQuery
    restored.dispatchEvent(new Event('input'))
  }
}

// ── Bottom sheet de respuesta FAQ ─────────────────────────────────────────────

function closeFaqSheet() {
  const overlay = document.getElementById('faqSheetOverlay')
  if (!overlay) return
  const sheet = overlay.querySelector('.faq-sheet')
  if (sheet) {
    sheet.style.transform = sheet.dataset.hiddenTransform || 'translate(-50%, 100%)'
    sheet.style.opacity = sheet.dataset.fades ? '0' : sheet.style.opacity
  }
  overlay.style.opacity = '0'
  setTimeout(() => overlay.remove(), 250)
}

function openFaqSheet(f) {
  document.getElementById('faqSheetOverlay')?.remove()
  const host = document.getElementById('section-resources')
  if (!host) return

  const overlay = document.createElement('div')
  overlay.id = 'faqSheetOverlay'
  overlay.style.cssText = 'position:absolute;inset:0;z-index:30;transition:opacity .25s ease;opacity:0'

  const backdrop = document.createElement('div')
  backdrop.style.cssText = 'position:absolute;inset:0;background:rgba(18,30,108,.35)'
  backdrop.addEventListener('click', closeFaqSheet)

  // Móvil: bottom sheet que sube desde abajo. Desktop: modal centrado.
  const desktop = window.matchMedia('(min-width: 768px)').matches
  const sheet = document.createElement('div')
  sheet.className = 'faq-sheet'
  if (desktop) {
    sheet.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-46%);opacity:0;width:90%;max-width:560px;max-height:70%;overflow-y:auto;background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.25);padding:20px 20px 24px;transition:transform .22s ease,opacity .22s ease'
    sheet.dataset.hiddenTransform = 'translate(-50%,-46%)'
    sheet.dataset.shownTransform  = 'translate(-50%,-50%)'
    sheet.dataset.fades = '1'
  } else {
    sheet.style.cssText = 'position:absolute;bottom:0;left:50%;transform:translate(-50%,100%);width:100%;max-width:520px;max-height:75%;overflow-y:auto;background:#fff;border-radius:16px 16px 0 0;box-shadow:0 -4px 24px rgba(0,0,0,.18);padding:16px 16px 24px;transition:transform .25s ease'
    sheet.dataset.hiddenTransform = 'translate(-50%,100%)'
    sheet.dataset.shownTransform  = 'translate(-50%,0)'
  }

  const head = document.createElement('div')
  head.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px'
  const title = document.createElement('p')
  title.style.cssText = 'font-weight:800;font-size:14px;color:var(--blue-100);flex:1'
  title.textContent = f.pregunta
  const closeBtn = document.createElement('button')
  closeBtn.setAttribute('aria-label', 'Cerrar')
  closeBtn.style.cssText = 'flex-shrink:0;width:28px;height:28px;border-radius:9999px;background:var(--black-10);color:var(--black-60);font-size:14px;font-weight:700;border:none;cursor:pointer'
  closeBtn.textContent = '✕'
  closeBtn.addEventListener('click', closeFaqSheet)
  head.append(title, closeBtn)

  const body = document.createElement('p')
  body.style.cssText = 'font-size:13px;color:var(--black-60);line-height:1.6;white-space:pre-line'
  body.textContent = f.respuesta

  sheet.append(head, body)

  if (f.leccion_id) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.style.cssText = 'margin-top:12px;font-size:12px;font-weight:700;color:var(--blue-100);background:none;border:none;cursor:pointer;padding:0'
    btn.textContent = 'Ver lección →'
    btn.addEventListener('click', () => {
      closeFaqSheet()
      document.querySelector('[data-tab="lessons"]')?.click()
      setTimeout(() => window.openLessonById?.(f.leccion_id), 150)
    })
    sheet.append(btn)
  } else if (f.link_url && /^https?:\/\//i.test(f.link_url)) {
    const a = document.createElement('a')
    a.href = f.link_url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.style.cssText = 'display:inline-block;margin-top:12px;font-size:12px;font-weight:700;color:var(--blue-100);text-decoration:none'
    a.textContent = 'Más información →'
    sheet.append(a)
  }

  overlay.append(backdrop, sheet)
  host.appendChild(overlay)
  requestAnimationFrame(() => {
    overlay.style.opacity = '1'
    sheet.style.opacity = '1'
    sheet.style.transform = sheet.dataset.shownTransform
  })
}

async function loadFaq() {
  const { data, error } = await supabase.from('preguntas_frecuentes').select('*').order('orden').order('created_at')
  const list = document.getElementById('faqList')

  if (error || !data?.length) {
    list.innerHTML = '<p class="text-[var(--black-60)] text-sm text-center py-8">No hay preguntas frecuentes aún.</p>'
    return (_q) => {}
  }

  // Lista fija de preguntas: la respuesta se abre en un panel deslizante
  // (bottom sheet), así la lista nunca se desplaza al consultar una pregunta.
  function renderFaqList(items) {
    if (!items.length) {
      list.innerHTML = '<p class="text-[var(--black-60)] text-sm text-center py-8">No hay resultados.</p>'
      return
    }
    list.innerHTML = items.map((f, i) => `
      <button type="button" class="faq-item w-full flex items-center justify-between gap-2 p-3 rounded-xl border border-[var(--blue-10)] bg-white text-left hover:border-[var(--blue-100)] transition-colors" data-idx="${i}">
        <span class="font-bold text-sm text-[var(--blue-100)]">${escapeHtml(f.pregunta)}</span>
        <i data-lucide="chevron-right" class="w-4 h-4 shrink-0 text-[var(--black-60)]"></i>
      </button>
    `).join('')

    lucide.createIcons()

    list.querySelectorAll('.faq-item').forEach(btn => {
      btn.addEventListener('click', () => openFaqSheet(items[Number(btn.dataset.idx)]))
    })
  }

  renderFaqList(data)

  return (q) => {
    const lower = q ? q.toLowerCase() : ''
    renderFaqList(lower
      ? data.filter(f => f.pregunta.toLowerCase().includes(lower) || f.respuesta.toLowerCase().includes(lower))
      : data)
  }
}

async function loadGlossary() {
  const { data, error } = await supabase.from('glosario').select('*').order('termino')
  const list = document.getElementById('glossaryList')

  if (error || !data?.length) {
    list.innerHTML = '<p class="text-[var(--black-60)] text-sm text-center py-8">No hay términos en el glosario aún.</p>'
    return (_q) => {}
  }

  const render = (items) => {
    if (!items.length) {
      list.innerHTML = '<p class="text-[var(--black-60)] text-sm text-center py-8">No hay resultados.</p>'
      return
    }
    list.innerHTML = items.map(g => `
      <div class="p-3 rounded-xl border border-[var(--blue-10)] bg-white">
        <p class="font-black text-sm text-[var(--blue-100)]">${escapeHtml(g.termino)}</p>
        <p class="text-xs text-[var(--black-60)] mt-0.5">${escapeHtml(g.definicion)}</p>
      </div>
    `).join('')
  }

  render(data)

  return (q) => {
    const lower = q ? q.toLowerCase() : ''
    render(lower
      ? data.filter(g => g.termino.toLowerCase().includes(lower) || g.definicion.toLowerCase().includes(lower))
      : data)
  }
}

async function loadMaterial() {
  const { data, error } = await supabase.from('material_apoyo').select('*')
  const list = document.getElementById('materialList')

  if (error || !data?.length) {
    list.innerHTML = '<p class="text-[var(--black-60)] text-sm text-center py-8 col-span-2">No hay material disponible aún.</p>'
    return (_q) => {}
  }

  const iconMap  = { pdf: 'file-text', link: 'link', video: 'play-circle' }
  const colorMap = { pdf: 'text-[var(--blue-100)]', link: 'text-[var(--info-100)]', video: 'text-[var(--blue-60)]' }

  const render = (items) => {
    if (!items.length) {
      list.innerHTML = '<p class="text-[var(--black-60)] text-sm text-center py-8 col-span-2">No hay resultados.</p>'
      return
    }
    list.innerHTML = items.map(m => `
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

  render(data)

  return (q) => {
    const lower = q ? q.toLowerCase() : ''
    render(lower
      ? data.filter(m =>
          (m.titulo || '').toLowerCase().includes(lower) || (m.tipo || '').toLowerCase().includes(lower)
        )
      : data)
  }
}

function bindResourceEvents() {
  document.getElementById('tabFaq').addEventListener('click', () => switchSubTab('faq'))
  document.getElementById('tabGlossary').addEventListener('click', () => switchSubTab('glossary'))
  document.getElementById('tabMaterial').addEventListener('click', () => switchSubTab('material'))
}

function switchSubTab(tab) {
  activeSubTab = tab

  const search = document.getElementById('resourceSearch')
  if (search) {
    search.value = ''
    const placeholders = { faq: 'Buscar pregunta...', glossary: 'Buscar término...', material: 'Buscar material...' }
    search.placeholder = placeholders[tab] || 'Buscar...'
  }

  // Reset the active tab to its full list
  if (tab === 'faq')           filterFaq('')
  else if (tab === 'glossary') filterGlossary('')
  else                         filterMaterial('')

  document.getElementById('subFaq').classList.toggle('hidden', tab !== 'faq')
  document.getElementById('subGlossary').classList.toggle('hidden', tab !== 'glossary')
  document.getElementById('subMaterial').classList.toggle('hidden', tab !== 'material')

  const active   = 'sub-tab w-full md:w-auto shrink-0 px-4 py-2 md:py-1.5 rounded-full text-xs font-bold bg-[var(--blue-100)] text-white'
  const inactive = 'sub-tab w-full md:w-auto shrink-0 px-4 py-2 md:py-1.5 rounded-full text-xs font-bold text-[var(--black-60)] bg-[var(--black-10)]'
  document.getElementById('tabFaq').className      = tab === 'faq'      ? active : inactive
  document.getElementById('tabGlossary').className = tab === 'glossary' ? active : inactive
  document.getElementById('tabMaterial').className = tab === 'material' ? active : inactive
}

function escapeHtml(text) {
  if (!text) return ''
  return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

renderResources()
