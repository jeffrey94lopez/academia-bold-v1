export function escapeHtml(text) {
  if (!text) return ''
  return String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
}

// Extrae el ID de un video de YouTube desde cualquier formato de link:
// watch?v=, youtu.be/, shorts/, embed/, live/, con o sin protocolo/www.
export function getYouTubeId(url) {
  if (!url) return null
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
    const host = u.hostname.replace(/^www\.|^m\./, '')
    let id = null
    if (host === 'youtu.be') {
      id = u.pathname.split('/')[1] || null
    } else if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      id = u.searchParams.get('v')
      if (!id) {
        const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{6,})/)
        if (m) id = m[1]
      }
    }
    return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? id : null
  } catch { return null }
}

// Escapa y neutraliza una celda para CSV. Antepone ' a fórmulas (= + - @)
// para que Excel/Sheets no las ejecute (CSV injection), y entrecomilla si hay
// comas, comillas o saltos de línea (RFC 4180).
export function csvCell(value) {
  let s = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

// Slug legible a partir de un título: minúsculas, sin tildes, todo lo que
// no sea alfanumérico se vuelve "-". Espejo del slugify() en SQL
// (supabase/migrations/add_lecciones_slug.sql) — se usa para lecciones
// nuevas; el backfill de las existentes lo hace esa migración.
export function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita diacríticos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function exportCSV(rows, filename, columns) {
  const header = columns.map(c => csvCell(c.label)).join(',')
  const body = rows
    .map(row => columns.map(c => csvCell(c.getValue(row))).join(','))
    .join('\n')
  const blob = new Blob(['﻿' + header + '\n' + body], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

// Modo staff: se activa una vez con ?staff=1 en la URL (queda recordado en el
// navegador) y se desactiva con ?staff=0. Controla herramientas internas y el
// escape para ver la vertical contraria cuando Bold POS ya fijó una.
export function isStaff() {
  try {
    const p = new URLSearchParams(window.location.search)
    if (p.get('staff') === '1') localStorage.setItem('bold_staff', '1')
    else if (p.get('staff') === '0') localStorage.removeItem('bold_staff')
    return localStorage.getItem('bold_staff') === '1'
  } catch { return false }
}
