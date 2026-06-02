import { supabase } from './supabase.js'

// ── Session management ─────────────────────────────────────────────────────

export async function registerStudent(nombre, apellido) {
  const id = crypto.randomUUID()
  const { error } = await supabase
    .from('progreso_estudiantes')
    .insert({ id, nombre, apellido, progreso: {}, completado: false })

  if (error) throw error

  localStorage.setItem('bold_session_id', id)
  return id
}

export async function loadSession() {
  const id = localStorage.getItem('bold_session_id')
  if (!id) return null

  const { data, error } = await supabase
    .from('progreso_estudiantes')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    localStorage.removeItem('bold_session_id')
    return null
  }

  return data
}

export function setExploreMode() {
  localStorage.setItem('bold_mode', 'explore')
}

export function clearSession() {
  localStorage.removeItem('bold_session_id')
  localStorage.removeItem('bold_mode')
}

// ── Progress ───────────────────────────────────────────────────────────────

export async function markLessonComplete(student, lessonId, puntaje) {
  const progreso = {
    ...student.progreso,
    [lessonId]: {
      completado: true,
      puntaje,
      fecha: new Date().toISOString().split('T')[0],
    },
  }

  const { error } = await supabase
    .from('progreso_estudiantes')
    .update({ progreso })
    .eq('id', student.id)

  if (error) throw error

  student.progreso = progreso
}

export async function checkAndMarkCourseComplete(student, allLessonIds) {
  const allDone = allLessonIds.every(id => student.progreso[id]?.completado === true)
  if (!allDone) return false

  const fecha_completado = new Date().toISOString()

  const { error } = await supabase
    .from('progreso_estudiantes')
    .update({ completado: true, fecha_completado })
    .eq('id', student.id)

  if (error) throw error

  student.completado = true
  student.fecha_completado = fecha_completado

  return true
}

// ── Mode-selection screen ──────────────────────────────────────────────────

export function renderModeSelection(container, { onCourse, onExplore }) {
  container.innerHTML = `
    <div class="min-h-full flex items-center justify-center p-6 bg-slate-50">
      <div class="w-full max-w-md space-y-4">

        <!-- Brand header -->
        <div class="text-center mb-6">
          <div class="inline-flex items-center justify-center w-14 h-14 bg-[#E92129] rounded-2xl shadow-lg mb-3">
            <span class="text-white font-black italic text-2xl">B</span>
          </div>
          <h1 class="font-black text-2xl text-slate-900 uppercase tracking-tight">Bold POS Academy</h1>
          <p class="text-xs font-bold text-slate-400 uppercase tracking-widest mt-0.5">Academia Oficial de Bold POS</p>
        </div>

        <!-- Block 1: Hacer el curso -->
        <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <p class="font-black text-base text-slate-900 mb-1">Hacer el curso</p>
          <p class="text-xs text-slate-500 mb-4">Registra tu progreso y obtén tu certificado al completar todas las lecciones.</p>

          <div class="space-y-3">
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1">Nombre</label>
              <input
                id="cm-nombre"
                type="text"
                placeholder="Tu nombre"
                class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#E92129] focus:border-transparent transition"
              >
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-600 mb-1">Apellido</label>
              <input
                id="cm-apellido"
                type="text"
                placeholder="Tu apellido"
                class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#E92129] focus:border-transparent transition"
              >
            </div>
          </div>

          <p id="cm-error" class="hidden text-xs font-bold text-[#E92129] mt-2"></p>

          <button
            id="cm-start"
            class="mt-4 w-full bg-[#E92129] hover:bg-red-700 text-white font-black text-sm py-3 rounded-xl transition-colors"
          >
            Comenzar →
          </button>
        </div>

        <!-- Block 2: Solo explorar -->
        <div class="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
          <p class="font-black text-base text-slate-900 mb-1">Solo explorar</p>
          <p class="text-xs text-slate-500 mb-4">Navega por las lecciones y recursos sin registrar progreso.</p>

          <button
            id="cm-explore"
            class="w-full border border-slate-200 hover:border-[#E92129] hover:text-[#E92129] text-slate-600 font-black text-sm py-3 rounded-xl transition-colors"
          >
            Entrar sin registro
          </button>
        </div>

      </div>
    </div>
  `

  // ── Handlers ──────────────────────────────────────────────────────────────
  document.getElementById('cm-start').addEventListener('click', async () => {
    const nombre   = document.getElementById('cm-nombre').value.trim()
    const apellido = document.getElementById('cm-apellido').value.trim()
    const errEl    = document.getElementById('cm-error')
    const btn      = document.getElementById('cm-start')

    errEl.classList.add('hidden')
    errEl.textContent = ''

    if (!nombre || !apellido) {
      errEl.textContent = 'Por favor ingresa tu nombre y apellido.'
      errEl.classList.remove('hidden')
      return
    }

    btn.disabled = true
    btn.textContent = 'Registrando...'

    try {
      const id = await registerStudent(nombre, apellido)
      const student = { id, nombre, apellido, progreso: {}, completado: false }
      onCourse(student)
    } catch (err) {
      console.error('[course] registerStudent error:', err)
      errEl.textContent = 'Ocurrió un error al registrarte. Intenta de nuevo.'
      errEl.classList.remove('hidden')
      btn.disabled = false
      btn.textContent = 'Comenzar →'
    }
  })

  document.getElementById('cm-explore').addEventListener('click', () => {
    setExploreMode()
    onExplore()
  })
}

// ── Exam modal ─────────────────────────────────────────────────────────────

export function showExamModal(lesson, student, allLessonIds, { onPass, onDismiss } = {}) {
  function escHtml(t) {
    if (t == null) return ''
    return String(t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  const preguntas = lesson?.examen?.preguntas ?? []
  const total = preguntas.length

  // Overlay root
  const overlay = document.createElement('div')
  overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4'

  function render(state) {
    overlay.innerHTML = ''

    if (state.view === 'question') {
      renderQuestion(state)
    } else if (state.view === 'success') {
      renderSuccess(state)
    } else if (state.view === 'failure') {
      renderFailure(state)
    }
  }

  // ── Question view ────────────────────────────────────────────────────────
  function renderQuestion(state) {
    const { qIndex, selected } = state
    const q = preguntas[qIndex]
    const questionNum = qIndex + 1
    const pct = Math.round((qIndex / total) * 100)
    const isLast = qIndex === total - 1

    const card = document.createElement('div')
    card.className = 'bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh] overflow-hidden'

    card.innerHTML = `
      <!-- Header -->
      <div class="px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
        <div class="flex items-center justify-between mb-3">
          <p class="text-xs font-bold text-slate-400 uppercase tracking-wide">${escHtml(lesson.titulo)}</p>
          <span class="text-xs font-bold text-slate-500">Pregunta ${questionNum} de ${total}</span>
        </div>
        <!-- Progress bar -->
        <div class="w-full bg-slate-100 rounded-full h-1.5">
          <div class="bg-[#E92129] h-1.5 rounded-full transition-all duration-300" style="width:${pct}%"></div>
        </div>
      </div>

      <!-- Question text -->
      <div class="px-6 py-5 flex-1 overflow-y-auto">
        <p class="font-black text-base text-slate-900 mb-5">${escHtml(q.pregunta)}</p>
        <div id="exam-options" class="space-y-2.5">
          ${q.opciones.map((op, i) => {
            const isSelected = selected === i
            return `
              <button
                class="exam-opt w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-colors
                  ${isSelected
                    ? 'border-[#E92129] bg-red-50 text-[#E92129] font-bold'
                    : 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50'}"
                data-idx="${i}"
              >${escHtml(op)}</button>`
          }).join('')}
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-slate-100 shrink-0">
        <button
          id="exam-next"
          ${selected === null ? 'disabled' : ''}
          class="w-full py-3 rounded-xl font-black text-sm transition-colors
            ${selected !== null
              ? 'bg-[#E92129] text-white hover:bg-red-700'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'}"
        >${isLast ? 'Enviar respuestas' : 'Siguiente →'}</button>
      </div>
    `

    overlay.appendChild(card)

    // Option selection
    card.querySelectorAll('.exam-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const newState = { ...state, selected: Number(btn.dataset.idx) }
        render(newState)
      })
    })

    // Next / submit
    card.querySelector('#exam-next').addEventListener('click', async () => {
      if (state.selected === null) return

      const answers = [...state.answers, state.selected]

      if (isLast) {
        // Score
        let correct = 0
        const wrongTexts = []
        preguntas.forEach((p, i) => {
          if (answers[i] === p.correcta) {
            correct++
          } else {
            wrongTexts.push(p.pregunta)
          }
        })
        const puntaje = Math.round((correct / total) * 100)

        if (puntaje >= 70) {
          // Mark complete in Supabase (fire-and-forget optimistically but await result)
          let courseComplete = false
          try {
            await markLessonComplete(student, lesson.id, puntaje)
            courseComplete = await checkAndMarkCourseComplete(student, allLessonIds)
          } catch (err) {
            console.error('[course] markLessonComplete error:', err)
          }
          render({ view: 'success', puntaje, courseComplete })
        } else {
          render({ view: 'failure', puntaje, wrongTexts })
        }
      } else {
        render({ ...state, qIndex: qIndex + 1, selected: null, answers })
      }
    })
  }

  // ── Success view ─────────────────────────────────────────────────────────
  function renderSuccess(state) {
    const { puntaje, courseComplete } = state

    const card = document.createElement('div')
    card.className = 'bg-white rounded-2xl shadow-2xl w-full max-w-md text-center p-8'

    card.innerHTML = `
      <div class="text-5xl mb-4">🎉</div>
      <h2 class="font-black text-xl text-slate-900 mb-1">¡Lección completada!</h2>
      ${courseComplete ? `<p class="text-xs font-bold text-[#E92129] uppercase tracking-wide mb-4">🏆 ¡Curso completado!</p>` : ''}
      <div class="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-50 border-4 border-green-400 mx-auto my-4">
        <span class="font-black text-2xl text-green-600">${puntaje}%</span>
      </div>
      <p class="text-sm text-slate-500 mb-6">Obtuviste <strong>${puntaje}%</strong> en el examen. ¡Buen trabajo!</p>
      <button id="exam-continue" class="w-full bg-[#E92129] hover:bg-red-700 text-white font-black text-sm py-3 rounded-xl transition-colors">
        Continuar
      </button>
    `

    overlay.appendChild(card)

    card.querySelector('#exam-continue').addEventListener('click', () => {
      overlay.remove()
      onPass?.(puntaje, state.courseComplete)
    })
  }

  // ── Failure view ─────────────────────────────────────────────────────────
  function renderFailure(state) {
    const { puntaje, wrongTexts } = state

    const card = document.createElement('div')
    card.className = 'bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 max-h-[90vh] overflow-y-auto'

    card.innerHTML = `
      <div class="text-5xl text-center mb-4">😔</div>
      <h2 class="font-black text-xl text-slate-900 text-center mb-1">Necesitas repasar</h2>
      <div class="flex items-center justify-center w-20 h-20 rounded-full bg-red-50 border-4 border-[#E92129] mx-auto my-4">
        <span class="font-black text-2xl text-[#E92129]">${puntaje}%</span>
      </div>
      <p class="text-sm text-slate-500 text-center mb-4">Necesitas al menos <strong>70%</strong> para aprobar. Revisa las siguientes preguntas:</p>
      <ul class="space-y-2 mb-6 text-left">
        ${wrongTexts.map(t => `
          <li class="flex items-start gap-2 text-xs text-slate-600">
            <span class="text-[#E92129] font-black mt-0.5 shrink-0">✗</span>
            <span>${escHtml(t)}</span>
          </li>
        `).join('')}
      </ul>
      <div class="flex gap-3">
        <button id="exam-retry" class="flex-1 bg-[#E92129] hover:bg-red-700 text-white font-black text-sm py-3 rounded-xl transition-colors">
          Intentar de nuevo
        </button>
        <button id="exam-close" class="flex-1 border border-slate-200 hover:border-slate-300 text-slate-600 font-bold text-sm py-3 rounded-xl transition-colors">
          Cerrar
        </button>
      </div>
    `

    overlay.appendChild(card)

    card.querySelector('#exam-retry').addEventListener('click', () => {
      render({ view: 'question', qIndex: 0, selected: null, answers: [] })
    })

    card.querySelector('#exam-close').addEventListener('click', () => {
      overlay.remove()
      onDismiss?.()
    })
  }

  // Initial render
  render({ view: 'question', qIndex: 0, selected: null, answers: [] })

  document.body.appendChild(overlay)
}
