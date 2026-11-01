import { track } from './analytics.js'
// certificate.js — diploma rendering and print for Bold POS Academy

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function avgScore(progreso) {
  if (!progreso || typeof progreso !== 'object') return 0
  const entries = Object.values(progreso).filter(e => e && e.completado)
  if (!entries.length) return 0
  const total = entries.reduce((sum, e) => sum + (Number(e.puntaje) || 0), 0)
  return Math.round(total / entries.length)
}

function formatDate(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleDateString('es-HN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function escHtml(t) {
  if (t == null) return ''
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ---------------------------------------------------------------------------
// renderCertificate(student)
// student: { nombre, apellido, progreso, fecha_completado, completado, ... }
// ---------------------------------------------------------------------------

export function renderCertificate(student) {
  // Remove any existing overlay
  const existing = document.getElementById('certificateOverlay')
  if (existing) existing.remove()

  const fullName = escHtml(`${student.nombre || ''} ${student.apellido || ''}`.trim())
  const score    = avgScore(student.progreso)
  const dateStr  = formatDate(student.fecha_completado)

  // ── Outer overlay ──────────────────────────────────────────────────────────
  const overlay = document.createElement('div')
  overlay.id        = 'certificateOverlay'
  overlay.className = 'fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4'

  // ── White card ─────────────────────────────────────────────────────────────
  const card = document.createElement('div')
  card.className = 'bg-white max-w-lg w-full rounded-2xl shadow-2xl overflow-hidden'

  // ── Header ─────────────────────────────────────────────────────────────────
  const header = document.createElement('div')
  header.className = 'flex items-center justify-between px-6 py-4 border-b border-slate-200'
  header.innerHTML = `
    <span class="text-slate-700 font-semibold text-sm tracking-wide uppercase">Tu certificado</span>
    <button id="certCloseBtn"
      class="text-slate-400 hover:text-slate-600 transition-colors text-xl leading-none"
      aria-label="Cerrar">✕</button>
  `

  // ── Diploma body ───────────────────────────────────────────────────────────
  const diplomaWrap = document.createElement('div')
  diplomaWrap.className = 'p-6'

  const diploma = document.createElement('div')
  diploma.className = 'border-4 border-[#121e6c] rounded-xl p-6 text-center'

  // Inner decorative border
  const inner = document.createElement('div')
  inner.className = 'border border-[#d2d4e1] rounded-lg p-5 flex flex-col items-center gap-3'

  inner.innerHTML = `
    <!-- Logo -->
    <div class="w-14 h-14 rounded-full bg-[#121e6c] flex items-center justify-center
                text-white text-2xl font-bold shadow-md">B</div>

    <!-- Labels -->
    <p class="text-xs tracking-widest text-slate-500 uppercase font-semibold">
      Certificado de Finalización
    </p>
    <p class="text-xl font-bold text-slate-800">Bold POS AI Soporte</p>
    <p class="text-sm text-slate-500">Soporte oficial de Bold POS</p>

    <hr class="w-16 border-[#121e6c] border-t-2 my-1">

    <p class="text-sm text-slate-600">Este certificado acredita que</p>

    <!-- Student name -->
    <p class="text-2xl font-serif italic text-[#121e6c] leading-tight">${fullName}</p>

    <p class="text-sm text-slate-600 max-w-xs">
      completó exitosamente el curso de capacitación Bold POS
    </p>

    <!-- Footer row -->
    <div class="flex justify-around w-full mt-3 pt-3 border-t border-slate-200 text-center">
      <div>
        <p class="text-xs text-slate-400 uppercase tracking-wide">Fecha</p>
        <p class="text-sm font-semibold text-slate-700">${escHtml(dateStr) || '—'}</p>
      </div>
      <div>
        <p class="text-xs text-slate-400 uppercase tracking-wide">Puntaje promedio</p>
        <p class="text-sm font-semibold text-slate-700">${score}%</p>
      </div>
    </div>
  `

  diploma.appendChild(inner)
  diplomaWrap.appendChild(diploma)

  // ── Print button ───────────────────────────────────────────────────────────
  const footer = document.createElement('div')
  footer.className = 'px-6 pb-6'

  const printBtn = document.createElement('button')
  printBtn.id        = 'certPrintBtn'
  printBtn.className = 'mt-4 w-full bg-[#121e6c] hover:bg-[#0d1650] text-white font-semibold ' +
                       'py-3 rounded-xl transition-colors text-sm'
  printBtn.textContent = '🖨️ Imprimir certificado'

  footer.appendChild(printBtn)

  // ── Assemble ───────────────────────────────────────────────────────────────
  card.appendChild(header)
  card.appendChild(diplomaWrap)
  card.appendChild(footer)
  overlay.appendChild(card)
  document.body.appendChild(overlay)
  track('certificate_view', {})

  // ── Events ────────────────────────────────────────────────────────────────
  document.getElementById('certCloseBtn').addEventListener('click', () => overlay.remove())
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove() })
  printBtn.addEventListener('click', () => printCertificate(student))

  return overlay
}

// ---------------------------------------------------------------------------
// printCertificate(student)
// Opens a new window with a print-ready landscape diploma.
// ---------------------------------------------------------------------------

export function printCertificate(student) {
  const fullName = escHtml(`${student.nombre || ''} ${student.apellido || ''}`.trim())
  const score    = avgScore(student.progreso)
  const dateStr  = escHtml(formatDate(student.fecha_completado)) || '—'

  const win = window.open('', '_blank')
  if (!win) return // blocked by popup blocker
  track('certificate_print', {})

  win.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Certificado — Bold POS AI Soporte</title>
  <style>
    @page {
      size: landscape;
      margin: 1cm;
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Georgia, 'Times New Roman', serif;
      background: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 1cm;
    }
    .diploma {
      width: 100%;
      max-width: 24cm;
      border: 6px solid #121e6c;
      border-radius: 16px;
      padding: 40px;
      text-align: center;
    }
    .diploma-inner {
      border: 1px solid #fca5a5;
      border-radius: 10px;
      padding: 36px 48px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
    }
    .logo {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: #121e6c;
      color: #ffffff;
      font-size: 28px;
      font-family: Arial, sans-serif;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .label-sm {
      font-family: Arial, sans-serif;
      font-size: 10px;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: #64748b;
      font-weight: 600;
    }
    .academy-name {
      font-family: Arial, sans-serif;
      font-size: 22px;
      font-weight: bold;
      color: #1e293b;
    }
    .academy-sub {
      font-family: Arial, sans-serif;
      font-size: 13px;
      color: #94a3b8;
    }
    .divider {
      width: 64px;
      border: none;
      border-top: 2px solid #121e6c;
      margin: 4px 0;
    }
    .acredita {
      font-size: 13px;
      color: #475569;
    }
    .student-name {
      font-size: 30px;
      font-style: italic;
      color: #121e6c;
      line-height: 1.2;
    }
    .course-desc {
      font-size: 13px;
      color: #475569;
      max-width: 380px;
    }
    .cert-footer {
      display: flex;
      justify-content: space-around;
      width: 100%;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #e2e8f0;
    }
    .cert-footer-item {
      text-align: center;
    }
    .cert-footer-label {
      font-family: Arial, sans-serif;
      font-size: 9px;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #94a3b8;
    }
    .cert-footer-value {
      font-family: Arial, sans-serif;
      font-size: 13px;
      font-weight: 600;
      color: #1e293b;
      margin-top: 4px;
    }
  </style>
</head>
<body>
  <div class="diploma">
    <div class="diploma-inner">
      <div class="logo">B</div>
      <p class="label-sm">Certificado de Finalización</p>
      <p class="academy-name">Bold POS AI Soporte</p>
      <p class="academy-sub">Soporte oficial de Bold POS</p>
      <hr class="divider">
      <p class="acredita">Este certificado acredita que</p>
      <p class="student-name">${fullName}</p>
      <p class="course-desc">completó exitosamente el curso de capacitación Bold POS</p>
      <div class="cert-footer">
        <div class="cert-footer-item">
          <p class="cert-footer-label">Fecha</p>
          <p class="cert-footer-value">${dateStr}</p>
        </div>
        <div class="cert-footer-item">
          <p class="cert-footer-label">Puntaje promedio</p>
          <p class="cert-footer-value">${score}%</p>
        </div>
      </div>
    </div>
  </div>
  <script>window.onload = function() { window.print(); }<\/script>
</body>
</html>`)

  win.document.close()
}
