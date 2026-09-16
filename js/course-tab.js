// course-tab.js — pestaña "Curso": registro del estudiante, lecciones con
// examen, progreso y certificado. Se activa desde el admin (curso_enabled).
// Reutiliza el motor de la versión anterior: course.js (sesión/examen) y
// certificate.js (diploma imprimible).
import { supabase } from './supabase.js'
import { loadSession, registerStudent, showExamModal } from './course.js'
import { renderCertificate } from './certificate.js'
import { renderBlocks } from './block-renderer.js'
import { parseLessonBlocks } from './lesson-blocks.js'
import { ordenarCurso } from './course-order.js'
import { parseExamen } from './course-lessons.js'
import { escapeHtml } from './utils.js'
import { track } from './analytics.js'
import { loadVisibilityOverrides } from './settings.js'
import { aplicarVisibilidad, visibles } from './lesson-visibility.js'
import { APP_ENV } from './env.js'

let student = null
let courseLessons = []

export async function initCourseTab() {
  const container = document.getElementById('section-course')
  if (!container) return
  container.innerHTML = '<div class="flex items-center justify-center h-full text-[var(--black-60)] text-sm">Cargando curso...</div>'

  // Misma bifurcación que en lessons.js: en prod filtra el servidor, fuera de
  // prod manda el override del entorno.
  const [{ data, error }, overrides] = await Promise.all([
    APP_ENV === 'prod'
      ? supabase.from('lecciones').select('*').eq('active', true).order('orden')
      : supabase.from('lecciones').select('*').order('orden'),
    loadVisibilityOverrides(),
  ])
  if (error) {
    container.innerHTML = '<p class="text-[var(--black-60)] text-sm text-center pt-16">No se pudo cargar el curso. Intenta de nuevo.</p>'
    return
  }

  // El curso lo forman solo las lecciones con examen configurado. El orden lo
  // da `curso_orden` y no el `orden` del query, que es relativo a la categoría:
  // ver js/course-order.js.
  courseLessons = ordenarCurso(
    visibles(aplicarVisibilidad(data, overrides, APP_ENV))
      .map(l => ({ ...l, examen: parseExamen(l) }))
      .filter(l => l.examen)
  )

  if (!courseLessons.length) {
    container.innerHTML = '<p class="text-[var(--black-60)] text-sm text-center pt-16">Aún no hay lecciones con examen para el curso.</p>'
    return
  }

  student = await loadSession()
  renderHome()
}

// ── Registro ──────────────────────────────────────────────────────────────

function renderRegistration() {
  const container = document.getElementById('section-course')
  container.innerHTML = `
    <div class="h-full overflow-y-auto custom-scroll flex items-start md:items-center justify-center p-6">
      <div class="w-full max-w-md bg-white rounded-2xl border border-[var(--blue-20)] p-6 shadow-sm mt-4 md:mt-0">
        <h2 class="font-black text-lg text-[var(--blue-100)] mb-1">Curso Bold POS</h2>
        <p class="text-xs text-[var(--black-60)] mb-5">Regístrate para guardar tu progreso, presentar los exámenes y obtener tu certificado al completar todas las lecciones.</p>
        <div class="space-y-3">
          <div>
            <label class="block text-xs font-bold text-[var(--black-60)] mb-1">Nombre</label>
            <input id="cr-nombre" type="text" placeholder="Tu nombre"
              class="w-full px-4 py-2.5 rounded-xl border border-[var(--blue-20)] text-base md:text-sm outline-none focus:border-[var(--blue-100)]">
          </div>
          <div>
            <label class="block text-xs font-bold text-[var(--black-60)] mb-1">Apellido</label>
            <input id="cr-apellido" type="text" placeholder="Tu apellido"
              class="w-full px-4 py-2.5 rounded-xl border border-[var(--blue-20)] text-base md:text-sm outline-none focus:border-[var(--blue-100)]">
          </div>
          <div>
            <label class="block text-xs font-bold text-[var(--black-60)] mb-1">Correo</label>
            <input id="cr-correo" type="email" placeholder="tucorreo@ejemplo.com"
              class="w-full px-4 py-2.5 rounded-xl border border-[var(--blue-20)] text-base md:text-sm outline-none focus:border-[var(--blue-100)]">
          </div>
        </div>
        <p id="cr-error" class="hidden text-xs font-bold text-red-500 mt-3"></p>
        <button id="cr-start"
          class="mt-5 w-full bg-[var(--blue-100)] hover:opacity-90 text-white font-black text-sm py-3 rounded-xl transition-opacity">
          Comenzar el curso →
        </button>
      </div>
    </div>
  `

  document.getElementById('cr-start').addEventListener('click', async () => {
    const nombre   = document.getElementById('cr-nombre').value.trim()
    const apellido = document.getElementById('cr-apellido').value.trim()
    const correo   = document.getElementById('cr-correo').value.trim()
    const errEl    = document.getElementById('cr-error')
    const btn      = document.getElementById('cr-start')
    errEl.classList.add('hidden')

    if (!nombre || !apellido || !correo) {
      errEl.textContent = 'Completa nombre, apellido y correo.'
      errEl.classList.remove('hidden')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      errEl.textContent = 'Ingresa un correo válido.'
      errEl.classList.remove('hidden')
      return
    }

    btn.disabled = true
    btn.textContent = 'Registrando...'
    try {
      const id = await registerStudent(nombre, apellido, correo)
      student = { id, nombre, apellido, correo, progreso: {}, completado: false }
      track('mode_selected', { mode: 'course' })
      renderHome()
    } catch (err) {
      console.error('[course-tab] registerStudent error:', err)
      // El código va a la vista, no solo a la consola: un fallo de RLS y uno de
      // red se veían idénticos ("Ocurrió un error"), y sin el código el
      // diagnóstico es adivinanza. Pasó de verdad: un 42501 estuvo rompiendo el
      // registro sin que nadie supiera por qué.
      const code = err?.code || err?.name || ''
      errEl.textContent = code
        ? `Ocurrió un error al registrarte (${code}). Intenta de nuevo.`
        : 'Ocurrió un error al registrarte. Intenta de nuevo.'
      errEl.classList.remove('hidden')
      btn.disabled = false
      btn.textContent = 'Comenzar el curso →'
    }
  })
}

// ── Pantalla principal: progreso + lista de lecciones ─────────────────────

function renderHome() {
  if (!student) { renderRegistration(); return }
  const container = document.getElementById('section-course')

  const total = courseLessons.length
  const done  = courseLessons.filter(l => student.progreso?.[String(l.id)]?.completado).length
  const pct   = total ? Math.round((done / total) * 100) : 0

  // El curso es una lista lineal, no un agrupado por categoría. Agrupar rompía
  // la secuencia: con las 6 lecciones actuales el estudiante hacía
  // 1 → 4 → 6 → 2 → 3 → 5, o sea aprendía a cerrar turno antes de crear un ítem
  // y a facturar antes de tener productos y clientes. El orden lo manda
  // `curso_orden` (ver js/course-order.js) y la categoría queda como etiqueta.

  container.innerHTML = `
    <div class="h-full overflow-y-auto custom-scroll">
      <div class="max-w-2xl mx-auto p-4 md:p-6">
        <div class="flex items-center justify-between gap-3 mb-1">
          <h2 class="font-black text-lg text-[var(--blue-100)]">Curso Bold POS</h2>
          <span class="text-xs text-[var(--black-60)] font-bold shrink-0">${escapeHtml(student.nombre)} ${escapeHtml(student.apellido)}</span>
        </div>
        <p class="text-xs text-[var(--black-60)] mb-3">${done} de ${total} lecciones completadas</p>
        <div class="w-full bg-[var(--black-10)] rounded-full h-2 mb-5">
          <div class="bg-[var(--blue-100)] h-2 rounded-full transition-all duration-300" style="width:${pct}%"></div>
        </div>
        ${student.completado ? `
          <div class="mb-5 p-4 rounded-2xl border border-[var(--success-100,#22c55e)] bg-green-50 flex items-center justify-between gap-3">
            <p class="text-sm font-bold text-green-700">🏆 ¡Completaste el curso!</p>
            <button id="cr-cert" class="shrink-0 text-xs font-black text-white bg-[var(--blue-100)] px-4 py-2 rounded-full">Ver mi certificado</button>
          </div>` : ''}
        <div id="cr-list" class="pb-6"></div>
      </div>
    </div>
  `

  const listEl = document.getElementById('cr-list')
  courseLessons.forEach((l, i) => {
    const p = student.progreso?.[String(l.id)]
    const cat = (l.categoria || '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').trim()
    const row = document.createElement('button')
    row.className = 'w-full flex items-center gap-3 p-3 mb-2 rounded-xl border bg-white text-left transition-colors ' +
      (p?.completado ? 'border-green-300' : 'border-[var(--blue-10)] hover:border-[var(--blue-100)]')
    row.innerHTML = `
      <span class="shrink-0 w-6 h-6 rounded-full text-[10px] font-black flex items-center justify-center ${p?.completado
        ? 'bg-green-100 text-green-700'
        : 'bg-[var(--black-10)] text-[var(--black-60)]'}">${i + 1}</span>
      <span class="flex-1 min-w-0">
        <span class="block text-sm font-bold truncate ${p?.completado ? 'text-[var(--black-60)]' : 'text-[var(--black-100)]'}">${escapeHtml(l.titulo)}</span>
        ${cat ? `<span class="block text-[10px] font-bold uppercase tracking-widest text-[var(--black-40)] mt-0.5">${escapeHtml(cat)}</span>` : ''}
      </span>
      ${p?.completado
        ? `<span class="shrink-0 text-xs font-black text-green-600">✓ ${p.puntaje}%</span>`
        : '<span class="shrink-0 text-xs font-bold text-[var(--black-40)]">Pendiente ›</span>'}
    `
    row.addEventListener('click', () => renderLesson(l))
    listEl.appendChild(row)
  })

  document.getElementById('cr-cert')?.addEventListener('click', () => renderCertificate(student))
}

// ── Contenido de una lección + examen ─────────────────────────────────────

function renderLesson(lesson) {
  const container = document.getElementById('section-course')
  const p = student.progreso?.[String(lesson.id)]

  container.innerHTML = `
    <div class="h-full flex flex-col">
      <div class="px-4 py-3 border-b border-[var(--blue-10)] flex items-center gap-3 shrink-0">
        <button id="cr-back" class="text-[var(--blue-100)] text-2xl font-bold leading-none">‹</button>
        <span class="font-black text-sm text-[var(--blue-100)] flex-1 truncate">${escapeHtml(lesson.titulo)}</span>
        ${p?.completado ? `<span class="text-xs font-black text-green-600 shrink-0">✓ ${p.puntaje}%</span>` : ''}
      </div>
      <div id="cr-content" class="flex-1 overflow-y-auto custom-scroll p-4"></div>
      <div class="px-4 py-3 border-t border-[var(--blue-10)] shrink-0">
        <button id="cr-exam"
          class="w-full max-w-2xl mx-auto block bg-[var(--blue-100)] hover:opacity-90 text-white font-black text-sm py-3 rounded-xl transition-opacity">
          ${p?.completado ? 'Repetir examen' : 'Presentar examen'}
        </button>
      </div>
    </div>
  `

  const panel = document.getElementById('cr-content')
  const inner = document.createElement('div')
  inner.style.cssText = 'max-width:720px;margin:0 auto'
  panel.appendChild(inner)

  // El contenido legacy llega como bloque html; renderBlocks lo pinta.
  const blocks = parseLessonBlocks(lesson.contenido)
  if (blocks.length) {
    inner.appendChild(renderBlocks(blocks))
  }

  document.getElementById('cr-back').addEventListener('click', renderHome)
  document.getElementById('cr-exam').addEventListener('click', () => {
    const allIds = courseLessons.map(l => String(l.id))
    showExamModal(lesson, student, allIds, {
      onPass: (_puntaje, courseComplete) => {
        renderHome()
        if (courseComplete) renderCertificate(student)
      },
      onDismiss: () => {}
    })
  })
}
