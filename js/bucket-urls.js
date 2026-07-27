// Razona sobre las URLs del bucket que viven dentro de texto crudo.
// Import-safe (sin DOM, sin supabase): la I/O y la UI viven en los consumidores.
//
// Trabaja sobre el TEXTO CRUDO y no sobre la estructura parseada: el `contenido`
// de las lecciones guarda dos formatos (JSON de bloques y HTML legacy, ver
// js/lesson-blocks.js) y un solo camino sirve para los dos.

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Todas las URLs del bucket presentes en `raw`, únicas y en orden de aparición.
// El corte es por caracteres que no pueden formar parte de la URL en este
// contexto: sirve tanto para "url":"…" del JSON como para src="…" del HTML.
export function extractBucketUrls(raw, publicPrefix) {
  if (typeof raw !== 'string' || !raw) return []
  if (typeof publicPrefix !== 'string' || !publicPrefix) return []
  const re = new RegExp(escapeRegex(publicPrefix) + '[^\\s"\'<>)\\\\]+', 'g')
  const out = []
  for (const m of raw.matchAll(re)) {
    const url = m[0].split('?')[0].split('#')[0]
    if (url === publicPrefix) continue
    if (!out.includes(url)) out.push(url)
  }
  return out
}

// Cuántas FILAS mencionan la URL (no cuántas veces aparece).
export function countReferences(rows, campo, url) {
  if (!Array.isArray(rows)) return 0
  if (typeof campo !== 'string' || !campo) return 0
  if (typeof url !== 'string' || !url) return 0
  let n = 0
  for (const row of rows) {
    const valor = row?.[campo]
    if (typeof valor === 'string' && valor.includes(url)) n++
  }
  return n
}

// Las referencias que no están en el inventario. Son CANDIDATAS a estar rotas:
// la confirmación la hace el HEAD en admin.js, porque un inventario incompleto
// produciría falsos positivos.
export function diffBrokenUrls(referenced, existing) {
  if (!Array.isArray(referenced)) return []
  const set = new Set(Array.isArray(existing) ? existing : [])
  const out = []
  for (const url of referenced) {
    if (typeof url !== 'string' || !url) continue
    if (set.has(url) || out.includes(url)) continue
    out.push(url)
  }
  return out
}
