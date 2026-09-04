import { studentClient } from './supabase.js'
import { track } from './analytics.js'

function escHtml(t) {
  if (t == null) return ''
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ── Session management ─────────────────────────────────────────────────────

export async function registerStudent(nombre, apellido, correo) {
  const id = crypto.randomUUID()

  // El header x-student-id va desde el registro y no solo después: PostgREST
  // inserta con RETURNING, y al devolver la fila Postgres aplica también la
  // política de SELECT (anon_select_own), que compara el id con ese header.
  // Sin el header la fila entra pero no se puede devolver, y Postgres responde
  // 42501 "new row violates row-level security policy" — que suena a problema
  // de la política de INSERT y no lo es.
  const { error } = await studentClient(id)
    .from('progreso_estudiantes')
    .insert({ id, nombre, apellido, correo, progreso: {}, completado: false })

  if (error) throw error

  localStorage.setItem('bold_session_id', id)
  return id
}

export async function loadSession() {
  const id = localStorage.getItem('bold_session_id')
  if (!id) return null

  const { data, error } = await studentClient()
    .from('progreso_estudiantes')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !data) {
    localStorage.removeItem('bold_session_id')
    return null
  }

  return data
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

  const { data, error } = await studentClient()
    .from('progreso_estudiantes')
    .update({ progreso })
    .eq('id', student.id)
    .select('id')

  if (error) throw error
  sinFilasEsFallo(data)

  student.progreso = progreso
}

// Un UPDATE que RLS no deja tocar ninguna fila NO devuelve error: Postgres
// simplemente no ve la fila, afecta cero y responde ok. Así se perdieron 4
// lecciones sin que nadie se enterara — la pantalla felicitaba al estudiante y
// la base quedaba vacía. Por eso el update pide las filas de vuelta con
// .select() y la ausencia se trata como fallo.
function sinFilasEsFallo(data) {
  if (data && data.length > 0) return
  const err = new Error('El progreso no se guardó: la base no aceptó la actualización (0 filas).')
  err.code = 'rls_0_filas'
  throw err
}

export async function checkAndMarkCourseComplete(student, allLessonIds) {
  const allDone = allLessonIds.every(id => student.progreso[id]?.completado === true)
  if (!allDone) return false

  const fecha_completado = new Date().toISOString()

  const { data, error } = await studentClient()
    .from('progreso_estudiantes')
    .update({ completado: true, fecha_completado })
    .eq('id', student.id)
    .select('id')

  if (error) throw error
  sinFilasEsFallo(data)

  student.completado = true
  student.fecha_completado = fecha_completado

  return true
}

// ── Exam modal ─────────────────────────────────────────────────────────────

export function showExamModal(lesson, student, allLessonIds, { onPass, onDismiss } = {}) {
  const preguntas = lesson?.examen?.preguntas ?? []
  const total = preguntas.length
  if (!total) { onDismiss?.(); return }

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
          <div class="bg-[#121e6c] h-1.5 rounded-full transition-all duration-300" style="width:${pct}%"></div>
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
                    ? 'border-[#121e6c] bg-[var(--blue-10)] text-[#121e6c] font-bold'
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
              ? 'bg-[#121e6c] text-white hover:bg-[#0d1650]'
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
          // Si el guardado falla hay que decirlo: antes el catch se lo comía y
          // la pantalla igual felicitaba al estudiante, que se iba creyendo que
          // su nota quedó registrada. `markLessonComplete` solo muta
          // student.progreso cuando el update sale bien, así que el listado ya
          // muestra la realidad; lo que faltaba era avisar.
          let courseComplete = false
          let saveError = null
          try {
            await markLessonComplete(student, String(lesson.id), puntaje)
            courseComplete = await checkAndMarkCourseComplete(student, allLessonIds)
          } catch (err) {
            console.error('[course] markLessonComplete error:', err)
            saveError = err
          }
          render({ view: 'success', puntaje, courseComplete, saveError })
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
    const { puntaje, courseComplete, saveError } = state
    track('exam_pass', { lesson_id: String(lesson.id), lesson_title: lesson.titulo || '', score: puntaje })

    const card = document.createElement('div')
    card.className = 'bg-white rounded-2xl shadow-2xl w-full max-w-md text-center p-8'

    const codigo = saveError ? (saveError.code || saveError.name || '') : ''

    card.innerHTML = `
      <div class="text-5xl mb-4">${saveError ? '⚠️' : '🎉'}</div>
      <h2 class="font-black text-xl text-slate-900 mb-1">${saveError ? 'Aprobaste, pero no se guardó' : '¡Lección completada!'}</h2>
      ${courseComplete && !saveError ? `<p class="text-xs font-bold text-[#121e6c] uppercase tracking-wide mb-4">🏆 ¡Curso completado!</p>` : ''}
      <div class="inline-flex items-center justify-center w-20 h-20 rounded-full ${saveError ? 'bg-amber-50 border-4 border-amber-400' : 'bg-green-50 border-4 border-green-400'} mx-auto my-4">
        <span class="font-black text-2xl ${saveError ? 'text-amber-600' : 'text-green-600'}">${puntaje}%</span>
      </div>
      ${saveError ? `
        <div class="text-left text-xs bg-amber-50 border border-amber-200 rounded-xl p-3 mb-6">
          <p class="font-bold text-amber-800 mb-1">No pudimos guardar tu progreso${codigo ? ` (${escHtml(codigo)})` : ''}.</p>
          <p class="text-amber-700">Tu ${puntaje}% no quedó registrado. Revisa tu conexión y vuelve a presentar el examen.</p>
        </div>
      ` : `
        <p class="text-sm text-slate-500 mb-6">Obtuviste <strong>${puntaje}%</strong> en el examen. ¡Buen trabajo!</p>
      `}
      <button id="exam-continue" class="w-full ${saveError ? 'bg-amber-500 hover:bg-amber-600' : 'bg-[#121e6c] hover:bg-[#0d1650]'} text-white font-black text-sm py-3 rounded-xl transition-colors">
        ${saveError ? 'Entendido' : 'Continuar'}
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
    track('exam_fail', { lesson_id: String(lesson.id), lesson_title: lesson.titulo || '', score: puntaje })

    const card = document.createElement('div')
    card.className = 'bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 max-h-[90vh] overflow-y-auto'

    card.innerHTML = `
      <div class="text-5xl text-center mb-4">😔</div>
      <h2 class="font-black text-xl text-slate-900 text-center mb-1">Necesitas repasar</h2>
      <div class="flex items-center justify-center w-20 h-20 rounded-full bg-red-50 border-4 border-[#dc2626] mx-auto my-4">
        <span class="font-black text-2xl text-[#dc2626]">${puntaje}%</span>
      </div>
      <p class="text-sm text-slate-500 text-center mb-4">Necesitas al menos <strong>70%</strong> para aprobar. Revisa las siguientes preguntas:</p>
      <ul class="space-y-2 mb-6 text-left">
        ${wrongTexts.map(t => `
          <li class="flex items-start gap-2 text-xs text-slate-600">
            <span class="text-[#dc2626] font-black mt-0.5 shrink-0">✗</span>
            <span>${escHtml(t)}</span>
          </li>
        `).join('')}
      </ul>
      <div class="flex gap-3">
        <button id="exam-retry" class="flex-1 bg-[#121e6c] hover:bg-[#0d1650] text-white font-black text-sm py-3 rounded-xl transition-colors">
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
