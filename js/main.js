import './assistant.js'
import './lessons.js'
import './resources.js'
import { supabase } from './supabase.js'

async function applyAppSettings() {
  const { data } = await supabase.from('app_settings').select('key,value')
  if (!data) return
  const settings = Object.fromEntries(data.map(r => [r.key, r.value]))

  if (settings.resources_enabled === 'false') {
    document.querySelectorAll('[data-tab="resources"]').forEach(el => el.classList.add('hidden'))
    document.getElementById('section-resources')?.classList.add('hidden')
  } else {
    document.querySelectorAll('[data-tab="resources"]').forEach(el => el.classList.remove('hidden'))
  }
}

applyAppSettings()

function switchTab(tab) {
  document.querySelectorAll('[id^="section-"]').forEach(s => s.classList.add('hidden'))
  document.getElementById(`section-${tab}`).classList.remove('hidden')

  document.querySelectorAll('.nav-tab').forEach(b => {
    const active = b.dataset.tab === tab
    b.classList.toggle('text-[var(--blue-100)]', active)
    b.classList.toggle('text-[var(--black-60)]', !active)
  })

  document.querySelectorAll('.nav-tab-desk').forEach(b => {
    const active = b.dataset.tab === tab
    if (b.dataset.tab === 'assistant') {
      b.classList.toggle('bg-[var(--blue-100)]', active)
      b.classList.toggle('text-white', active)
      b.classList.toggle('text-[var(--black-60)]', !active)
    } else {
      b.classList.toggle('text-[var(--blue-100)]', active)
      b.classList.toggle('bg-[var(--blue-10)]', active)
      b.classList.toggle('text-[var(--black-60)]', !active)
    }
  })
}

document.querySelectorAll('[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab))
})

lucide.createIcons()
