# Course Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional course mode to Lecciones where students register by name, take per-lesson multiple-choice exams, track progress in Supabase, and receive a printable diploma on completion.

**Architecture:** `js/course.js` owns all session/progress/exam/mode-selection logic. `js/certificate.js` owns the diploma. `js/lessons.js` checks for a session at startup and either shows the mode-selection screen or renders lessons with progress indicators and exam triggers. Admin gains an exam editor inside the existing lesson form modal and a new Results panel.

**Tech Stack:** Vanilla JS ES modules, Supabase JS v2 (CDN), Tailwind CSS CDN, `crypto.randomUUID()`, `window.print()`.

---

## File Map

| File | Change |
|---|---|
| `js/course.js` | NEW — session CRUD, progress update, exam modal, mode-selection UI |
| `js/certificate.js` | NEW — diploma rendering, print |
| `js/lessons.js` | MODIFY — session check at startup, progress indicators, exam trigger |
| `js/admin.js` | MODIFY — exam editor in lesson form, Results panel function |
| `admin.html` | MODIFY — Results nav button + panel div |

---

### Task 1: Supabase schema

**Files:** SQL only — no local files changed.

- [ ] **Step 1: Add `examen` column to `lecciones`**

Open Supabase Dashboard → SQL Editor, run:

```sql
ALTER TABLE lecciones ADD COLUMN IF NOT EXISTS examen jsonb;
```

Expected: "Success. No rows returned."

- [ ] **Step 2: Create `progreso_estudiantes` table with RLS**

```sql
CREATE TABLE IF NOT EXISTS progreso_estudiantes (
  id               uuid PRIMARY KEY,
  nombre           text NOT NULL,
  apellido         text NOT NULL,
  progreso         jsonb NOT NULL DEFAULT '{}',
  completado       boolean NOT NULL DEFAULT false,
  fecha_completado timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE progreso_estudiantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert" ON progreso_estudiantes
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "anon_update_own" ON progreso_estudiantes
  FOR UPDATE TO anon USING (true);

CREATE POLICY "anon_select_own" ON progreso_estudiantes
  FOR SELECT TO anon USING (true);

CREATE POLICY "auth_select_all" ON progreso_estudiantes
  FOR SELECT TO authenticated USING (true);
```

Expected: "Success."

- [ ] **Step 3: Verify in Table Editor**

Open Supabase → Table Editor → `progreso_estudiantes`. Confirm columns: id, nombre, apellido, progreso, completado, fecha_completado, created_at.

- [ ] **Step 4: Commit checkpoint**

```bash
git add -A
git commit -m "chore: Supabase schema — examen column + progreso_estudiantes table"
```

---

### Task 2: Create js/course.js

**Files:**
- Create: `js/course.js`

- [ ] **Step 1: Create the file**

```javascript
import { supabase } from './supabase.js'

// ── Session ────────────────────────────────────────────────────────────────
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
    [lessonId]: { completado: true, puntaje, fecha: new Date().toISOString().split('T')[0] },
  }
  const { error } = await supabase
    .from('progreso_estudiantes')
    .update({ progreso })
    .eq('id', student.id)
  if (error) throw error
  student.progreso = progreso
}

export async function checkAndMarkCourseComplete(student, allLessonIds) {
  const allDone = allLessonIds.every(id => student.progreso[id]?.completado)
  if (!allDone) return false
  const fecha_completado = new Date().toISOString()
  await supabase
    .from('progreso_estudiantes')
    .update({ completado: true, fecha_completado })
    .eq('id', student.id)
  student.completado = true
  student.fecha_completado = fecha_completado
  return true
}

// ── Mode-selection screen ──────────────────────────────────────────────────
export function renderModeSelection(container, { onCourse, onExplore }) {
  container.innerHTML = `
    <div class="absolute inset-0 flex items-center justify-center bg-slate-50 p-4">
      <div class="w-full max-w-lg">
        <div class="text-center mb-8">
          <div class="w-12 h-12 bg-[#E92129] rounded-2xl flex items-center justify-center text-white font-black italic text-2xl mx-auto mb-3">B</div>
          <h2 class="font-black text-xl text-slate-900">Bold POS Academy</h2>
          <p class="text-slate-500 text-sm mt-1">¿Cómo quieres continuar?</p>
        </div>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div class="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-4">
            <div class="text-center">
              <p class="text-3xl mb-1">📋</p>
              <h3 class="font-black text-sm text-slate-900">Hacer el curso</h3>
              <p class="text-xs text-slate-400 mt-0.5">Exámenes · Progreso · Certificado</p>
            </div>
            <div class="space-y-2">
              <input id="ms-nombre" placeholder="Nombre" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
              <input id="ms-apellido" placeholder="Apellido" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-[#E92129]">
            </div>
            <button id="ms-start-course" class="w-full py-2.5 rounded-xl bg-[#E92129] text-white text-sm font-bold hover:scale-[1.02] transition-transform">
              Comenzar →
            </button>
            <p id="ms-error" class="hidden text-xs text-red-500 text-center -mt-2"></p>
          </div>
          <div class="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-4 items-center justify-center text-center">
            <div>
              <p class="text-3xl mb-1">👁️</p>
              <h3 class="font-black text-sm text-slate-900">Solo explorar</h3>
              <p class="text-xs text-slate-400 mt-0.5">Sin registro · Acceso libre</p>
            </div>
            <button id="ms-explore" class="w-full py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold hover:bg-slate-50 transition-colors">
              Entrar sin registro
            </button>
          </div>
        </div>
      </div>
    </div>
  `

  const errorEl = container.querySelector('#ms-error')

  container.querySelector('#ms-start-course').addEventListener('click', async () => {
    const nombre = container.querySelector('#ms-nombre').value.trim()
    const apellido = container.querySelector('#ms-apellido').value.trim()
    if (!nombre || !apellido) {
      errorEl.textContent = 'Ingresa tu nombre y apellido.'
      errorEl.classList.remove('hidden')
      return
    }
    const btn = container.querySelector('#ms-start-course')
    btn.disabled = true
    btn.textContent = 'Registrando...'
    try {
      const id = await registerStudent(nombre, apellido)
      onCourse({ id, nombre, apellido, progreso: {}, completado: false })
    } catch (_) {
      errorEl.textContent = 'Error al registrar. Intenta de nuevo.'
      errorEl.classList.remove('hidden')
      btn.disabled = false
      btn.textContent = 'Comenzar →'
    }
  })

  container.querySelector('#ms-explore').addEventListener('click', () => {
    setExploreMode()
    onExplore()
  })
}

// ── Exam modal ─────────────────────────────────────────────────────────────
export function showExamModal(lesson, student, allLessonIds, { onPass, onDismiss }) {
  const preguntas = lesson.examen?.preguntas || []

  function escHtml(t) {
    if (t == null) return ''
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  const overlay = document.createElement('div')
  overlay.className = 'fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4'

  let currentQ = 0
  let answers = new Array(preguntas.length).fill(null)

  function renderQuestion() {
    const q = preguntas[currentQ]
    const isLast = currentQ === preguntas.length - 1
    const pct = Math.round((currentQ / preguntas.length) * 100)
    overlay.innerHTML = `
      <div class="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 flex flex-col gap-4">
        <div>
          <p class="text-xs font-black text-slate-400 uppercase tracking-wide mb-1">Mini examen — ${escHtml(lesson.titulo)}</p>
          <p class="text-xs text-slate-400">Pregunta ${currentQ + 1} de ${preguntas.length}</p>
          <div class="h-1 bg-slate-100 rounded-full mt-2 overflow-hidden">
            <div class="h-full bg-[#E92129] transition-all" style="width:${pct}%"></div>
          </div>
        </div>
        <p class="font-bold text-sm text-slate-900">${escHtml(q.pregunta)}</p>
        <div class="flex flex-col gap-2">
          ${q.opciones.map((op, idx) => `
            <button data-idx="${idx}" class="exam-opt text-left px-4 py-3 rounded-xl border text-sm transition-colors ${answers[currentQ] === idx ? 'border-[#E92129] bg-red-50 font-bold text-[#E92129]' : 'border-slate-200 text-slate-700 hover:border-[#E92129] hover:bg-red-50'}">
              ${escHtml(op)}
            </button>
          `).join('')}
        </div>
        <button id="exam-next" class="py-2.5 rounded-xl bg-[#E92129] text-white text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed" ${answers[currentQ] === null ? 'disabled' : ''}>
          ${isLast ? 'Enviar respuestas' : 'Siguiente →'}
        </button>
      </div>
    `
    overlay.querySelectorAll('.exam-opt').forEach(btn => {
      btn.addEventListener('click', () => { answers[currentQ] = parseInt(btn.dataset.idx); renderQuestion() })
    })
    overlay.querySelector('#exam-next').addEventListener('click', () => {
      if (answers[currentQ] === null) return
      if (isLast) gradeExam()
      else { currentQ++; renderQuestion() }
    })
  }

  async function gradeExam() {
    const correct = preguntas.filter((q, i) => answers[i] === q.correcta).length
    const puntaje = Math.round((correct / preguntas.length) * 100)
    const passed = puntaje >= 70

    if (passed) {
      overlay.innerHTML = `
        <div class="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 text-center flex flex-col gap-4">
          <p class="text-4xl">🎉</p>
          <h3 class="font-black text-lg text-slate-900">¡Aprobaste!</h3>
          <p class="text-slate-500 text-sm">Obtuviste <strong class="text-[#E92129] text-xl">${puntaje}%</strong> en esta lección.</p>
          <button id="exam-continue" class="py-2.5 rounded-xl bg-[#E92129] text-white text-sm font-bold">Continuar</button>
        </div>
      `
      let courseComplete = false
      try {
        await markLessonComplete(student, String(lesson.id), puntaje)
        courseComplete = await checkAndMarkCourseComplete(student, allLessonIds)
      } catch (_) {}
      overlay.querySelector('#exam-continue').addEventListener('click', () => {
        overlay.remove()
        onPass(puntaje, courseComplete)
      })
    } else {
      const wrongs = preguntas.filter((q, i) => answers[i] !== q.correcta).map(q => q.pregunta)
      overlay.innerHTML = `
        <div class="bg-white rounded-2xl w-full max-w-md shadow-2xl p-6 flex flex-col gap-4">
          <div class="text-center">
            <p class="text-3xl mb-2">😔</p>
            <h3 class="font-black text-base text-slate-900">Necesitas 70% para aprobar</h3>
            <p class="text-slate-500 text-sm mt-1">Obtuviste <strong class="text-[#E92129]">${puntaje}%</strong>. Puedes intentarlo de nuevo.</p>
          </div>
          ${wrongs.length ? `<div class="bg-slate-50 rounded-xl p-3"><p class="text-xs font-bold text-slate-500 mb-2">Preguntas fallidas:</p><ul class="space-y-1">${wrongs.map(q => `<li class="text-xs text-slate-600">• ${escHtml(q)}</li>`).join('')}</ul></div>` : ''}
          <button id="exam-retry" class="py-2.5 rounded-xl bg-[#E92129] text-white text-sm font-bold">Intentar de nuevo</button>
          <button id="exam-cancel" class="py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-bold">Cerrar</button>
        </div>
      `
      overlay.querySelector('#exam-retry').addEventListener('click', () => {
        currentQ = 0; answers = new Array(preguntas.length).fill(null); renderQuestion()
      })
      overlay.querySelector('#exam-cancel').addEventListener('click', () => { overlay.remove(); onDismiss?.() })
    }
  }

  renderQuestion()
  document.body.appendChild(overlay)
}
```

- [ ] **Step 2: Verify no syntax errors**

Open `index.html` in the browser, open DevTools Console — confirm no import errors for `course.js`.

- [ ] **Step 3: Commit**

```bash
git add js/course.js
git commit -m "feat: add course.js — session, progress, exam modal, mode selection"
```

---

### Task 3: Create js/certificate.js

**Files:**
- Create: `js/certificate.js`

- [ ] **Step 1: Create the file**

```javascript
function avgScore(progreso) {
  const entries = Object.values(progreso || {}).filter(v => v?.completado)
  if (!entries.length) return 0
  return Math.round(entries.reduce((sum, v) => sum + (v.puntaje || 0), 0) / entries.length)
}

function formatDate(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleDateString('es-HN', { day: '2-digit', month: 'long', year: 'numeric' })
}

function escHtml(t) {
  if (t == null) return ''
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function renderCertificate(student) {
  const avg = avgScore(student.progreso)
  const dateStr = formatDate(student.fecha_completado)
  const nombreCompleto = `${student.nombre} ${student.apellido}`

  const existing = document.getElementById('certificateOverlay')
  if (existing) existing.remove()

  const wrapper = document.createElement('div')
  wrapper.id = 'certificateOverlay'
  wrapper.className = 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4'
  wrapper.innerHTML = `
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">
      <div class="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <span class="text-xs font-bold text-slate-400 uppercase tracking-wide">Tu certificado</span>
        <button id="cert-close" class="text-slate-400 hover:text-slate-700 text-lg leading-none px-1">&#x2715;</button>
      </div>
      <div class="p-6">
        <div class="border-4 border-[#E92129] rounded-xl p-6 relative bg-white">
          <div class="absolute inset-2 border border-red-200 rounded-lg pointer-events-none"></div>
          <div class="relative text-center flex flex-col items-center gap-2">
            <div class="w-12 h-12 bg-[#E92129] rounded-2xl flex items-center justify-center text-white font-black italic text-2xl">B</div>
            <p class="text-[10px] font-black uppercase tracking-widest text-slate-400">Certificado de Finalización</p>
            <p class="font-black text-base text-slate-900 leading-tight">Bold POS Academy</p>
            <p class="text-xs text-slate-400">Academia Oficial de Bold POS</p>
            <p class="text-xs text-slate-500 mt-2">Este certificado acredita que</p>
            <p class="font-black italic text-2xl text-[#E92129]">${escHtml(nombreCompleto)}</p>
            <p class="text-xs text-slate-600 leading-relaxed">completó exitosamente el curso de capacitación Bold POS</p>
            <div class="flex gap-8 mt-3 pt-3 border-t border-slate-100 w-full justify-center">
              <div class="text-center">
                <p class="text-[10px] text-slate-400">Fecha</p>
                <p class="text-xs font-black text-slate-700">${escHtml(dateStr)}</p>
              </div>
              <div class="text-center">
                <p class="text-[10px] text-slate-400">Puntaje promedio</p>
                <p class="text-xs font-black text-[#E92129]">${avg}%</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="px-6 pb-5">
        <button id="cert-print" class="w-full py-2.5 rounded-xl bg-[#E92129] text-white text-sm font-bold hover:scale-[1.02] transition-transform">
          🖨️ Imprimir certificado
        </button>
      </div>
    </div>
  `

  wrapper.querySelector('#cert-close').addEventListener('click', () => wrapper.remove())
  wrapper.querySelector('#cert-print').addEventListener('click', () => printCertificate(student))
  document.body.appendChild(wrapper)
  return wrapper
}

export function printCertificate(student) {
  const avg = avgScore(student.progreso)
  const dateStr = formatDate(student.fecha_completado)
  const nombreCompleto = `${student.nombre} ${student.apellido}`
  const win = window.open('', '_blank')
  win.document.write(`<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Certificado — ${nombreCompleto}</title>
<style>
  @page { size: landscape; margin: 1cm; }
  body { font-family: Georgia, serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: white; }
  .cert { border: 6px solid #E92129; border-radius: 16px; padding: 48px; max-width: 720px; width: 100%; position: relative; text-align: center; box-sizing: border-box; }
  .inner { position: absolute; inset: 8px; border: 1px solid #fca5a5; border-radius: 10px; }
  .logo { width: 56px; height: 56px; background: #E92129; border-radius: 14px; display: inline-flex; align-items: center; justify-content: center; color: white; font-weight: 900; font-style: italic; font-size: 28px; margin: 0 auto 16px; }
  .label { font-size: 10px; letter-spacing: 3px; text-transform: uppercase; color: #94a3b8; margin-bottom: 8px; }
  .academy { font-size: 22px; font-weight: 900; color: #1e293b; margin: 0; }
  .sub { font-size: 13px; color: #94a3b8; margin: 4px 0 0; }
  .certifies { font-size: 13px; color: #64748b; margin: 24px 0 8px; }
  .name { font-size: 38px; font-style: italic; font-weight: 900; color: #E92129; margin: 0 0 8px; }
  .desc { font-size: 14px; color: #475569; line-height: 1.5; margin: 0; }
  .footer { display: flex; gap: 48px; justify-content: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid #f1f5f9; }
  .foot-label { font-size: 10px; color: #94a3b8; margin: 0; }
  .foot-value { font-size: 14px; font-weight: 900; color: #475569; margin: 4px 0 0; }
</style></head><body>
<div class="cert">
  <div class="inner"></div>
  <div class="logo">B</div>
  <p class="label">Certificado de Finalización</p>
  <p class="academy">Bold POS Academy</p>
  <p class="sub">Academia Oficial de Bold POS</p>
  <p class="certifies">Este certificado acredita que</p>
  <p class="name">${nombreCompleto}</p>
  <p class="desc">completó exitosamente el curso de capacitación Bold POS</p>
  <div class="footer">
    <div><p class="foot-label">Fecha</p><p class="foot-value">${dateStr}</p></div>
    <div><p class="foot-label">Puntaje promedio</p><p class="foot-value">${avg}%</p></div>
  </div>
</div>
<script>window.onload = function() { window.print(); }<\/script>
</body></html>`)
  win.document.close()
}
```

- [ ] **Step 2: Verify no syntax errors**

Open browser DevTools Console — confirm no errors after navigating to `index.html`.

- [ ] **Step 3: Commit**

```bash
git add js/certificate.js
git commit -m "feat: add certificate.js — diploma rendering and print"
```

---

### Task 4: Modify js/lessons.js

**Files:**
- Modify: `js/lessons.js`

- [ ] **Step 1: Add imports and module-level state**

Replace the top 2 lines:
```javascript
import { supabase } from './supabase.js'
import { renderBlocks } from './block-renderer.js'
```
With:
```javascript
import { supabase } from './supabase.js'
import { renderBlocks } from './block-renderer.js'
import { loadSession, renderModeSelection, setExploreMode, markLessonComplete, checkAndMarkCourseComplete, showExamModal } from './course.js'
import { renderCertificate } from './certificate.js'

let courseStudent = null
```

- [ ] **Step 2: Add `progressIcon` helper after `escapeHtml`**

After the closing `}` of `escapeHtml` (line 20), add:

```javascript
function progressIcon(lessonId) {
  if (!courseStudent) return ''
  const entry = courseStudent.progreso?.[String(lessonId)]
  if (entry?.completado) return '<span class="text-green-500 text-xs ml-1 shrink-0">✅</span>'
  return '<span class="text-slate-300 text-xs ml-1 shrink-0">⭕</span>'
}
```

- [ ] **Step 3: Add session check at the start of `renderLessons()`**

Replace the first 4 lines of `renderLessons()`:
```javascript
async function renderLessons() {
  const container = document.getElementById('section-lessons')
  container.innerHTML = '<div class="flex items-center justify-center h-full text-slate-400 text-sm">Cargando lecciones...</div>'

  const { data: lessons, error } = await supabase
```
With:
```javascript
async function renderLessons() {
  const container = document.getElementById('section-lessons')

  if (!courseStudent) {
    const session = await loadSession()
    if (session) courseStudent = session
  }

  const exploreMode = localStorage.getItem('bold_mode') === 'explore'
  if (!courseStudent && !exploreMode) {
    renderModeSelection(container, {
      onCourse(student) { courseStudent = student; renderLessons() },
      onExplore() { renderLessons() },
    })
    return
  }

  container.innerHTML = '<div class="flex items-center justify-center h-full text-slate-400 text-sm">Cargando lecciones...</div>'

  const { data: lessons, error } = await supabase
```

- [ ] **Step 4: Replace `renderAccordion` with progress-aware version**

Replace the entire `renderAccordion` function (lines 156–210 in the original file, now shifted due to earlier additions) with:

```javascript
  function renderAccordion() {
    const accordion = document.getElementById('ls-accordion')

    let topBar = ''
    if (courseStudent) {
      const total = lessons.length
      const done = Object.values(courseStudent.progreso || {}).filter(v => v?.completado).length
      topBar = `
        <div class="px-3 py-2.5 border-b border-slate-100 bg-slate-50">
          <p class="text-[10px] font-black text-slate-700 truncate">${escapeHtml(courseStudent.nombre)} ${escapeHtml(courseStudent.apellido)}</p>
          <div class="flex items-center gap-2 mt-1">
            <div class="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div class="h-full bg-[#E92129] transition-all" style="width:${total ? Math.round(done / total * 100) : 0}%"></div>
            </div>
            <span class="text-[10px] text-slate-400 shrink-0">${done}/${total}</span>
          </div>
          ${courseStudent.completado ? `<button id="cert-btn" class="mt-2 w-full py-1.5 rounded-lg bg-[#E92129] text-white text-[10px] font-black">🏆 Ver mi certificado</button>` : ''}
        </div>`
    } else {
      topBar = `
        <div class="px-3 py-2 border-b border-slate-100">
          <button id="start-course-btn" class="w-full py-1.5 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-500 hover:bg-slate-50 transition-colors">📋 Iniciar curso</button>
        </div>`
    }

    accordion.innerHTML = topBar + CATEGORIES
      .filter(c => grouped[c.key].length > 0)
      .map(cat => {
        const isOpen = cat.key === activeCategory
        const catLessons = grouped[cat.key]
        const q = searchQuery.toLowerCase()
        const filtered = q
          ? catLessons.filter(l =>
              l.titulo.toLowerCase().includes(q) ||
              (l.descripcion || '').toLowerCase().includes(q))
          : catLessons

        const lessonRows = isOpen ? `
          <div>
            ${filtered.map(l => {
              const isActive = activeLesson?.id === l.id
              return `<button
                class="acc-lesson w-full text-left px-4 py-2.5 text-xs border-b border-slate-100/60 hover:bg-red-50 transition-colors ${isActive ? 'bg-red-50 border-l-2 border-l-[#E92129]' : ''}"
                data-id="${l.id}">
                <span class="flex items-center justify-between">
                  <span class="${isActive ? 'font-bold text-[#E92129]' : 'text-slate-600'}">${escapeHtml(l.titulo)}</span>
                  ${progressIcon(l.id)}
                </span>
              </button>`
            }).join('')}
            ${filtered.length === 0 && q ? '<p class="text-xs text-slate-400 px-4 py-2">Sin resultados</p>' : ''}
          </div>` : ''

        return `
          <div>
            <button class="acc-cat w-full flex items-center justify-between px-3 py-2.5 border-b border-slate-100 hover:bg-slate-50 transition-colors" data-cat="${escapeHtml(cat.key)}">
              <span class="text-xs font-black ${isOpen ? 'text-[#E92129]' : 'text-slate-600'}">${cat.emoji} ${escapeHtml(cat.key)}</span>
              <span class="text-[10px] ${isOpen ? 'text-[#E92129]' : 'text-slate-300'}">${isOpen ? '▾' : '▸'}</span>
            </button>
            ${lessonRows}
          </div>`
      }).join('')

    accordion.querySelectorAll('.acc-cat').forEach(btn => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.cat
        searchQuery = ''
        const searchEl = document.getElementById('ls-desk-search')
        if (searchEl) searchEl.value = ''
        renderAccordion()
      })
    })

    accordion.querySelectorAll('.acc-lesson').forEach(btn => {
      btn.addEventListener('click', () => {
        activeLesson = lessons.find(l => String(l.id) === btn.dataset.id) || null
        renderAccordion()
        renderDeskContent()
      })
    })

    accordion.querySelector('#cert-btn')?.addEventListener('click', () => renderCertificate(courseStudent))

    accordion.querySelector('#start-course-btn')?.addEventListener('click', () => {
      localStorage.removeItem('bold_mode')
      courseStudent = null
      renderModeSelection(container, {
        onCourse(student) { courseStudent = student; renderLessons() },
        onExplore() { renderLessons() },
      })
    })
  }
```

- [ ] **Step 5: Add progress icons to mobile lesson list**

In `renderMobileLessonList()`, find:
```javascript
      const title = document.createElement('p')
      title.className = `text-sm ${isActive ? 'font-bold text-[#E92129]' : 'font-medium text-slate-700'}`
      title.textContent = l.titulo
      btn.append(title)
```
Replace with:
```javascript
      const row = document.createElement('div')
      row.className = 'flex items-center justify-between'
      const title = document.createElement('p')
      title.className = `text-sm ${isActive ? 'font-bold text-[#E92129]' : 'font-medium text-slate-700'}`
      title.textContent = l.titulo
      row.append(title)
      if (courseStudent) row.insertAdjacentHTML('beforeend', progressIcon(l.id))
      btn.append(row)
```

- [ ] **Step 6: Add exam trigger at end of `renderLessonContent`**

In `renderLessonContent(panel, lesson)`, after the entire `if (lesson.notas)` block (ending with `panel.append(notasWrap)`), add:

```javascript
    if (courseStudent) {
      const allIds = lessons.map(l => String(l.id))
      const alreadyDone = courseStudent.progreso?.[String(lesson.id)]?.completado
      if (alreadyDone) {
        const doneTag = document.createElement('div')
        doneTag.className = 'mt-5 py-3 rounded-xl bg-green-50 border border-green-200 text-center text-sm font-bold text-green-700'
        doneTag.textContent = '✅ Lección completada'
        panel.append(doneTag)
      } else {
        const hasExam = Array.isArray(lesson.examen?.preguntas) && lesson.examen.preguntas.length > 0
        const examBtn = document.createElement('button')
        examBtn.className = 'mt-5 w-full py-3 rounded-xl bg-[#E92129] text-white text-sm font-bold hover:scale-[1.02] transition-transform'
        examBtn.textContent = hasExam ? 'Ir al examen →' : 'Marcar lección como completada ✓'
        examBtn.addEventListener('click', () => {
          if (hasExam) {
            showExamModal(lesson, courseStudent, allIds, {
              onPass(_puntaje, courseComplete) {
                renderAccordion()
                renderDeskContent()
                renderMobileLessonList()
                if (courseComplete) setTimeout(() => renderCertificate(courseStudent), 500)
              },
              onDismiss() {},
            })
          } else {
            markLessonComplete(courseStudent, String(lesson.id), 100).then(() =>
              checkAndMarkCourseComplete(courseStudent, allIds).then(done => {
                renderAccordion()
                renderDeskContent()
                renderMobileLessonList()
                if (done) setTimeout(() => renderCertificate(courseStudent), 500)
              })
            )
          }
        })
        panel.append(examBtn)
      }
    }
```

- [ ] **Step 7: Manual verification**

1. Open `index.html` → click Lecciones
2. Mode selection screen appears with two blocks
3. Click "Entrar sin registro" → lessons render, "📋 Iniciar curso" in sidebar
4. Clear `localStorage`, reload, click Lecciones → mode selection again
5. Enter name + apellido → click Comenzar → lessons render with ⭕ on each, progress bar shows "0/N"
6. Click a lesson → scroll to bottom → "Ir al examen →" or "Marcar como completada" appears
7. Reload → progress and student name persist

- [ ] **Step 8: Commit**

```bash
git add js/lessons.js
git commit -m "feat: lessons.js — course mode session check, progress indicators, exam trigger"
```

---

### Task 5: Modify js/admin.js — exam editor + results panel

**Files:**
- Modify: `js/admin.js`

- [ ] **Step 1: Add module-level variables for exam state**

After line 8 (`let sortableInstance = null`), add:
```javascript
let currentQuestions = []
let questionsSortable = null
```

- [ ] **Step 2: Add exam section to lesson form HTML**

In `renderLessonsPanel()`, find the notas `<div class="mb-4">` block (the one with `<textarea id="lessonNotas"`). After its closing `</div>`, add:
```javascript
            <div class="mb-4">
              <div class="flex items-center justify-between mb-2">
                <p class="text-[10px] font-black uppercase text-slate-400 tracking-wide">Examen</p>
                <button type="button" id="addQuestion" class="text-[10px] font-bold text-[#E92129] hover:underline">+ Agregar pregunta</button>
              </div>
              <div id="questionList" class="space-y-3"></div>
            </div>
```

- [ ] **Step 3: Add `examen` field to save payload**

Find the payload object in the save handler:
```javascript
    const payload = {
      titulo,
      descripcion: document.getElementById('lessonDescripcion').value,
      contenido: JSON.stringify(currentBlocks),
      orden,
      categoria: document.getElementById('lessonCategoria').value,
      notas: document.getElementById('lessonNotas').value.trim() || null,
    }
```
Replace with:
```javascript
    const payload = {
      titulo,
      descripcion: document.getElementById('lessonDescripcion').value,
      contenido: JSON.stringify(currentBlocks),
      orden,
      categoria: document.getElementById('lessonCategoria').value,
      notas: document.getElementById('lessonNotas').value.trim() || null,
      examen: currentQuestions.length ? JSON.stringify({ preguntas: currentQuestions }) : null,
    }
```

- [ ] **Step 4: Initialize exam questions in `openLessonForm`**

In `openLessonForm(lesson = null)`, find:
```javascript
  renderBlockList()
  updatePreview()
  document.getElementById('lessonFormModal').classList.remove('hidden')
```
Replace with:
```javascript
  try {
    const examData = lesson?.examen ? (typeof lesson.examen === 'string' ? JSON.parse(lesson.examen) : lesson.examen) : null
    currentQuestions = examData?.preguntas || []
  } catch (_) {
    currentQuestions = []
  }
  renderBlockList()
  renderQuestionList()
  updatePreview()
  document.getElementById('lessonFormModal').classList.remove('hidden')
```

- [ ] **Step 5: Add `renderQuestionList` function**

Add this function before `updatePreview()`:

```javascript
function renderQuestionList() {
  const list = document.getElementById('questionList')
  if (!list) return
  if (questionsSortable) { questionsSortable.destroy(); questionsSortable = null }

  list.innerHTML = currentQuestions.map((q, qi) => `
    <div data-qi="${qi}" class="bg-white border border-slate-200 rounded-xl p-3">
      <div class="flex items-start gap-2 mb-2">
        <div class="drag-handle-q text-slate-300 text-lg cursor-grab select-none leading-none mt-0.5">⠿</div>
        <input data-qi="${qi}" class="q-text flex-1 px-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129]"
          placeholder="Pregunta" value="${escapeHtml(q.pregunta || '')}">
        <button data-qi="${qi}" class="del-q text-slate-300 hover:text-red-400 text-sm px-1 shrink-0 mt-1">✕</button>
      </div>
      <div class="space-y-1.5 ml-6">
        ${(q.opciones || []).map((op, oi) => `
          <div class="flex items-center gap-2">
            <input type="radio" name="correct-${qi}" data-qi="${qi}" data-oi="${oi}" class="correct-radio shrink-0" ${q.correcta === oi ? 'checked' : ''}>
            <input data-qi="${qi}" data-oi="${oi}" class="opt-text flex-1 px-2 py-1 rounded-lg border border-slate-200 text-xs outline-none focus:border-[#E92129]"
              placeholder="Opción ${oi + 1}" value="${escapeHtml(op || '')}">
            ${q.opciones.length > 2 ? `<button data-qi="${qi}" data-oi="${oi}" class="del-opt text-slate-300 hover:text-red-400 text-xs px-1">✕</button>` : ''}
          </div>
        `).join('')}
        ${q.opciones.length < 4 ? `<button data-qi="${qi}" class="add-opt text-[10px] font-bold text-slate-400 hover:text-slate-700 mt-1">+ Opción</button>` : ''}
      </div>
    </div>
  `).join('')

  list.querySelectorAll('.q-text').forEach(input => {
    input.addEventListener('input', () => { currentQuestions[+input.dataset.qi].pregunta = input.value })
  })
  list.querySelectorAll('.opt-text').forEach(input => {
    input.addEventListener('input', () => { currentQuestions[+input.dataset.qi].opciones[+input.dataset.oi] = input.value })
  })
  list.querySelectorAll('.correct-radio').forEach(radio => {
    radio.addEventListener('change', () => { if (radio.checked) currentQuestions[+radio.dataset.qi].correcta = +radio.dataset.oi })
  })
  list.querySelectorAll('.del-q').forEach(btn => {
    btn.addEventListener('click', () => { currentQuestions.splice(+btn.dataset.qi, 1); renderQuestionList() })
  })
  list.querySelectorAll('.del-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = currentQuestions[+btn.dataset.qi]
      q.opciones.splice(+btn.dataset.oi, 1)
      if (q.correcta >= q.opciones.length) q.correcta = 0
      renderQuestionList()
    })
  })
  list.querySelectorAll('.add-opt').forEach(btn => {
    btn.addEventListener('click', () => { currentQuestions[+btn.dataset.qi].opciones.push(''); renderQuestionList() })
  })

  if (list.children.length > 0) {
    questionsSortable = Sortable.create(list, {
      handle: '.drag-handle-q',
      animation: 150,
      onEnd(evt) {
        const moved = currentQuestions.splice(evt.oldIndex, 1)[0]
        currentQuestions.splice(evt.newIndex, 0, moved)
        renderQuestionList()
      },
    })
  }

  document.getElementById('addQuestion')?.addEventListener('click', () => {
    currentQuestions.push({ pregunta: '', opciones: ['', ''], correcta: 0 })
    renderQuestionList()
  })
}
```

- [ ] **Step 6: Add `renderResultsPanel` function and wire switchPanel**

At the bottom of `admin.js`, before `init()`, add:

```javascript
async function renderResultsPanel() {
  const el = document.getElementById('panel-results')
  if (!el) return
  el.innerHTML = '<p class="text-slate-400 text-sm">Cargando resultados...</p>'

  const [{ data: students, error }, { data: lessons }] = await Promise.all([
    supabase.from('progreso_estudiantes').select('*').order('created_at', { ascending: false }),
    supabase.from('lecciones').select('id'),
  ])

  const totalLessons = lessons?.length || 0
  if (error) { el.innerHTML = '<p class="text-red-400 text-sm">Error al cargar resultados.</p>'; return }

  const completados = (students || []).filter(s => s.completado).length

  el.innerHTML = `
    <div class="mb-4">
      <h2 class="text-lg font-black">Resultados del curso</h2>
      <p class="text-xs text-slate-400 mt-0.5">${completados} estudiante${completados !== 1 ? 's' : ''} completaron el curso</p>
    </div>
    <div class="bg-white rounded-2xl border border-slate-100 overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-100">
            <th class="text-left px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-wide">Nombre</th>
            <th class="text-left px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-wide">Progreso</th>
            <th class="text-left px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-wide">Promedio</th>
            <th class="text-left px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-wide">Estado</th>
          </tr>
        </thead>
        <tbody>
          ${(students || []).map(s => {
            const entries = Object.values(s.progreso || {}).filter(v => v?.completado)
            const done = entries.length
            const avg = entries.length ? Math.round(entries.reduce((sum, v) => sum + (v.puntaje || 0), 0) / entries.length) : 0
            const badge = s.completado
              ? '<span class="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">Completado</span>'
              : '<span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold">En curso</span>'
            return `<tr class="border-b border-slate-50 last:border-0">
              <td class="px-4 py-3">
                <p class="font-bold">${escapeHtml(s.nombre)} ${escapeHtml(s.apellido)}</p>
                <p class="text-xs text-slate-400">${new Date(s.created_at).toLocaleDateString('es-HN')}</p>
              </td>
              <td class="px-4 py-3 text-xs text-slate-600">${done}/${totalLessons}</td>
              <td class="px-4 py-3 text-xs font-bold ${avg >= 70 ? 'text-green-600' : 'text-slate-500'}">${entries.length ? avg + '%' : '—'}</td>
              <td class="px-4 py-3">${badge}</td>
            </tr>`
          }).join('') || '<tr><td colspan="4" class="px-4 py-6 text-center text-slate-400 text-sm">Ningún estudiante registrado aún.</td></tr>'}
        </tbody>
      </table>
    </div>
  `
}
```

In `switchPanel()`, add inside the function:
```javascript
  if (panel === 'results') renderResultsPanel()
```

- [ ] **Step 7: Manual verification**

1. Edit a lesson in admin → verify "Examen" section with "+ Agregar pregunta"
2. Add 2 questions, each with 3 options, mark a correct answer, save
3. Check Supabase Table Editor: `lecciones` row has JSON in `examen` column
4. Click "Resultados" nav → table appears (empty or with students)

- [ ] **Step 8: Commit**

```bash
git add js/admin.js
git commit -m "feat: admin.js — exam question editor in lesson form, Results panel"
```

---

### Task 6: Modify admin.html

**Files:**
- Modify: `admin.html`

- [ ] **Step 1: Add Results nav button**

Find:
```html
        <button data-panel="suggestions" class="admin-nav w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50">
          <i data-lucide="message-square" class="w-4 h-4"></i> Sugerencias Bot
        </button>
```
After it, add:
```html
        <button data-panel="results" class="admin-nav w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50">
          <i data-lucide="bar-chart-2" class="w-4 h-4"></i> Resultados
        </button>
```

- [ ] **Step 2: Add Results panel div**

Find:
```html
        <div id="panel-suggestions" class="hidden"></div>
```
After it, add:
```html
        <div id="panel-results" class="hidden"></div>
```

- [ ] **Step 3: Verify**

Open `admin.html` → click "Resultados" in nav → panel loads without errors.

- [ ] **Step 4: Commit**

```bash
git add admin.html
git commit -m "feat: admin.html — Resultados nav button and panel div"
```

---

### Task 7: End-to-end verification

- [ ] **Step 1: Full student flow**

1. Clear `localStorage` (DevTools → Application → Local Storage → Clear All)
2. Open `index.html` → click Lecciones
3. Mode selection screen appears — enter name + apellido → Comenzar
4. Lessons show ⭕ on each lesson; progress bar shows "0/N lecciones"
5. Click a lesson with exam configured → scroll to bottom → "Ir al examen →"
6. Answer ≥70% correctly → success screen → lesson shows ✅ → progress bar updates
7. Answer <70% → failure screen with wrong questions listed → "Intentar de nuevo" works
8. Complete all lessons → "🏆 Ver mi certificado" button in sidebar appears
9. Click → diploma renders with name, date, average score
10. Click "🖨️ Imprimir" → print dialog opens showing only the diploma in landscape

- [ ] **Step 2: Session persistence**

1. Register, complete 1 lesson, close tab
2. Reopen `index.html` → click Lecciones → mode selection skipped, same progress loads

- [ ] **Step 3: Explore mode**

1. Clear localStorage → Lecciones → "Entrar sin registro"
2. Lessons render with no exam button, "📋 Iniciar curso" visible in sidebar
3. Click "Iniciar curso" → mode selection re-appears

- [ ] **Step 4: Lesson without exam**

1. Find or create a lesson with no exam questions in admin
2. As course student, open that lesson → "Marcar como completada ✓" appears
3. Click → lesson immediately shows ✅ without an exam

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete course mode — registration, exams, progress, certificate, admin panel"
```
