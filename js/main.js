import { initBoldContext, onContextoBold, getContextoBold } from './bold-context.js'
import './assistant.js'
import './lessons.js'
import './resources.js'
import { loadSettings } from './settings.js'
import { startLiveUpdates } from './live-updates.js'
import { initCourseTab } from './course-tab.js'
import { storageGet, storageSet, storageRemove } from './storage.js'
import { shouldShowNavHint, NAV_HINT_KEY } from './nav-hint.js'
import { claveAvance, cargarAvance } from './onboarding-progress.js'
import { modeloTarjeta } from './onboarding-resume.js'

// Escucha el `bold:context` del POS y le avisa que ya estamos listos. Va
// primero: cuanto antes se instale, menos chance de perder el mensaje.
initBoldContext()

startLiveUpdates()

// Expuesta para que lessons.js pueda cambiar a la pestaña de lecciones al
// abrir un link directo (?leccion=<slug>) sin duplicar la lógica de tabs acá.
window.switchTab = switchTab

;(async () => {
  const s = await loadSettings()
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
  // Al salir de lecciones se detiene el realtime; al volver se reanuda (#7).
  if (tab !== 'lessons') { window.lessonsCleanup?.(); window.lessonsFlushReading?.() }
  else window.lessonsResume?.()
  document.querySelectorAll('[id^="section-"]').forEach(s => s.classList.add('hidden'))
  document.getElementById(`section-${tab}`).classList.remove('hidden')

  document.querySelectorAll('.nav-tab').forEach(b => {
    const active = b.dataset.tab === tab
    b.classList.toggle('text-[var(--blue-100)]', active)
    b.classList.toggle('text-[var(--black-60)]', !active)
    b.querySelector('.nav-tab-ico')?.classList.toggle('nav-pill-on', active)
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

// Aviso de descubrimiento del nav (móvil): que se note que hay más que el bot.
// Se muestra hasta que el usuario lo cierra (se recuerda en el navegador).
const navHint = document.getElementById('nav-hint')
if (navHint && shouldShowNavHint(storageGet(NAV_HINT_KEY))) {
  navHint.classList.remove('hidden')
  navHint.classList.add('flex')
  navHint.querySelector('.nav-hint-close')?.addEventListener('click', () => {
    navHint.classList.add('hidden')
    navHint.classList.remove('flex')
    storageSet(NAV_HINT_KEY, 'true')
  })
}

// Tarjeta para retomar/empezar el recorrido guiado (Task 8). Navega al mismo
// onboarding.html que abre el link directo; `?desde=ayuda` le dice al
// recorrido que debe volver aquí en vez de avisarle a Bold (onboarding.js).
const DESTINO_RECORRIDO = 'onboarding.html?desde=ayuda'
const io = { get: storageGet, set: storageSet, remove: storageRemove }
const onbResumeEl = document.getElementById('onboarding-resume')

function renderOnboardingResume() {
  if (!onbResumeEl) return
  const cuenta = getContextoBold()?.accountId ?? null
  const modelo = modeloTarjeta(cargarAvance(io, cuenta))

  if (modelo.tipo === 'continuar') {
    onbResumeEl.innerHTML = `
      <div class="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-[var(--blue-100)] text-white">
        <span class="text-sm font-semibold">Continúa tu recorrido (paso ${modelo.paso} de ${modelo.total})</span>
        <a href="${DESTINO_RECORRIDO}" class="shrink-0 px-3 py-2 rounded-full bg-white text-[var(--blue-100)] text-xs font-bold">Continuar</a>
      </div>`
  } else {
    const texto = modelo.tipo === 'repetir' ? 'Repetir el recorrido guiado de Bold POS' : 'Recorrido guiado de Bold POS'
    onbResumeEl.innerHTML = `<a href="${DESTINO_RECORRIDO}" class="onb-resume-link block text-xs text-[var(--blue-100)] underline">${texto}</a>`
    if (modelo.tipo === 'repetir') {
      // Ruling C: "repetir" solo borra el avance guardado; onboarding.html ya
      // crea un runId nuevo cuando no encuentra nada que retomar.
      onbResumeEl.querySelector('.onb-resume-link')
        ?.addEventListener('click', () => storageRemove(claveAvance(cuenta)))
    }
  }
  onbResumeEl.classList.remove('hidden')
}

renderOnboardingResume()
// La clave de localStorage depende de la cuenta: si bold:context llega
// después de este primer render (caso normal embebido en Bold POS), hay que
// recalcular con el accountId real para no mostrar/perder el avance de otra.
onContextoBold(() => renderOnboardingResume())

lucide.createIcons()
