import './assistant.js'
import './lessons.js'
import './resources.js'

const html   = document.documentElement
const toggle = document.getElementById('themeToggle')
const moon   = document.getElementById('iconMoon')
const sun    = document.getElementById('iconSun')

if (localStorage.theme === 'dark') {
  html.classList.add('dark')
  moon.classList.add('hidden')
  sun.classList.remove('hidden')
}

toggle.addEventListener('click', () => {
  html.classList.toggle('dark')
  const isDark = html.classList.contains('dark')
  localStorage.theme = isDark ? 'dark' : 'light'
  moon.classList.toggle('hidden', isDark)
  sun.classList.toggle('hidden', !isDark)
})

function switchTab(tab) {
  document.querySelectorAll('[id^="section-"]').forEach(s => s.classList.add('hidden'))
  document.getElementById(`section-${tab}`).classList.remove('hidden')

  document.querySelectorAll('.nav-tab').forEach(b => {
    const active = b.dataset.tab === tab
    b.classList.toggle('text-[#E92129]', active)
    b.classList.toggle('text-slate-400', !active)
  })

  document.querySelectorAll('.nav-tab-desk').forEach(b => {
    const active = b.dataset.tab === tab
    if (b.dataset.tab === 'assistant') {
      b.classList.toggle('bg-[#111]', active)
      b.classList.toggle('dark:bg-[#111]', active)
      b.classList.toggle('text-white', active)
      b.classList.toggle('text-slate-500', !active)
    } else {
      b.classList.toggle('text-[#E92129]', active)
      b.classList.toggle('bg-red-50', active)
      b.classList.toggle('dark:bg-red-950/30', active)
      b.classList.toggle('text-slate-500', !active)
    }
  })
}

document.querySelectorAll('[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab))
})

lucide.createIcons()
