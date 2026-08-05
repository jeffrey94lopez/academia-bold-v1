// Shell de las 3 pestañas de analytics (Resumen | Lecciones | BolBot).
// Pinta la barra de tabs en #panel-analytics + un sub-contenedor #analytics-content
// donde cada vista se monta. Reemplaza el patrón anterior de renders que se
// llamaban mutuamente.
import { renderLessonsAnalytics } from './admin-lessons-analytics.js'
import { renderBotAnalytics } from './admin-bot-analytics.js'
import { renderExecAnalytics } from './admin-exec-analytics.js'

export const ANALYTICS_TABS = ['resumen', 'lecciones', 'bolbot']
const LABELS = { resumen: 'Resumen', lecciones: 'Lecciones', bolbot: 'BoldBot POS' }

export function renderAnalytics(tab = null) {
  const active = tab || localStorage.getItem('analytics_tab') || 'resumen'
  localStorage.setItem('analytics_tab', active)
  const panel = document.getElementById('panel-analytics')
  if (!panel) return

  const tabsHtml = ANALYTICS_TABS.map(t => {
    const on = t === active
    return `<button class="analytics-shell-tab px-4 py-2 rounded-lg text-sm font-bold ${on
      ? 'bg-[var(--blue-100)] text-white'
      : 'text-[var(--black-60)] hover:bg-[var(--background-page)]'}" data-tab="${t}">${LABELS[t]}</button>`
  }).join('')

  panel.innerHTML = `
    <div class="flex items-center gap-2 mb-4 border-b border-[var(--blue-10)] pb-3">${tabsHtml}</div>
    <div id="analytics-content"></div>`

  panel.querySelectorAll('.analytics-shell-tab').forEach(btn => {
    btn.addEventListener('click', () => renderAnalytics(btn.dataset.tab))
  })

  if (active === 'resumen') renderExecAnalytics()
  else if (active === 'lecciones') renderLessonsAnalytics()
  else renderBotAnalytics()
}
