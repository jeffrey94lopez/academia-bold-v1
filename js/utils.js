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
