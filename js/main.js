import './assistant.js'
import './lessons.js'
import './resources.js'
import { supabase } from './supabase.js'
import { startLiveUpdates } from './live-updates.js'
import { initCourseTab } from './course-tab.js'

startLiveUpdates()

;(async () => {
  const { data } = await supabase.from('app_settings').select('key,value')
  const s = data ? Object.fromEntries(data.map(r => [r.key, r.value])) : {}
  if (s.bot_enabled === 'false') {
    document.querySelectorAll('[data-tab="assistant"]').forEach(el => el.classList.add('hidden'))
    document.getElementById('section-assistant')?.classList.add('hidden')
    switchTab('lessons')
  }
  if (s.lessons_enabled === 'false') {
    document.querySelectorAll('[data-tab="lessons"]').forEach(el => el.classList.add('hidden'))
    document.getElementById('section-lessons')?.classList.add('hidden')
  }
  // Curso: apagado por defecto (solo aparece si el admin lo activó)
  if (s.curso_enabled === 'true') {
    document.querySelectorAll('[data-tab="course"]').forEach(el => {
      el.classList.remove('hidden')
      el.style.display = 'flex'
    })
    lucide.createIcons()
    initCourseTab()
  }
})()

function switchTab(tab) {
  if (tab !== 'lessons') window.lessonsCleanup?.()
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
