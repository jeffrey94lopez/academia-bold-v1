import { supabase, SUPABASE_URL } from './supabase.js'

const BUCKET = 'material'
const MAX_BYTES = 50 * 1024 * 1024

// El prefijo público del bucket, armado en un solo lugar. Llega hasta el
// nombre del bucket: la parte del path va aparte y puede llevar url-encoding.
export function publicUrlPrefix() {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`
}

// La URL pública de una ruta, por el MISMO mecanismo que generó las URLs ya
// guardadas en la base (getPublicUrl url-encodea; createFolder no sanea el
// nombre de la carpeta, así que una con espacios o acentos no se reproduce
// concatenando a mano).
export function publicUrlFor(path) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

export async function uploadFile(file, onProgress, targetFolder = '') {
  if (file.size > MAX_BYTES) throw new Error('El archivo supera el límite de 50MB')

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const ext = safe.match(/\.[^.]+$/)?.[0] ?? ''
  const base = ext ? safe.slice(0, -ext.length) : safe
  const filename = `${base || 'archivo'}-${Date.now()}${ext}`
  const path = targetFolder ? `${targetFolder}/${filename}` : filename

  const { data, error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    onUploadProgress: (p) => {
      if (onProgress && p.total) onProgress(Math.round((p.loaded / p.total) * 100))
    },
  })

  if (error) throw error

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path)
  return { url: urlData.publicUrl, path: data.path }
}

export async function listFiles(path = '') {
  const { data, error } = await supabase.storage.from(BUCKET).list(path || '', {
    limit: 200,
    sortBy: { column: 'created_at', order: 'desc' },
  })
  if (error) throw error

  const items = data || []

  const folders = items
    .filter(f => f.id === null)
    .map(f => ({ name: f.name, isFolder: true }))

  const files = items
    .filter(f => f.id !== null && f.name !== '.emptyFolderPlaceholder')
    .map(f => {
      const fullPath = path ? `${path}/${f.name}` : f.name
      return {
        name: fullPath,
        size: f.metadata?.size || 0,
        type: f.metadata?.mimetype || '',
        url: supabase.storage.from(BUCKET).getPublicUrl(fullPath).data.publicUrl,
      }
    })

  return { folders, files }
}

// Todas las rutas del bucket, recorriendo carpetas y paginando de a 100.
// listFiles corta en 200 por carpeta y sin paginar inventaría de menos, lo que
// haría marcar como rotos archivos que existen. Si el listado falla, lanza: el
// llamador tiene que fallar cerrado y no reportar nada roto.
export async function listAllFiles() {
  const PAGE = 100
  const rutas = []
  const pendientes = ['']
  while (pendientes.length) {
    const carpeta = pendientes.shift()
    let offset = 0
    for (;;) {
      const { data, error } = await supabase.storage.from(BUCKET).list(carpeta, {
        limit: PAGE,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      })
      if (error) throw error
      const items = data || []
      for (const item of items) {
        const full = carpeta ? `${carpeta}/${item.name}` : item.name
        if (item.id === null) pendientes.push(full)
        else if (item.name !== '.emptyFolderPlaceholder') rutas.push(full)
      }
      if (items.length < PAGE) break
      offset += PAGE
    }
  }
  return rutas
}

// ¿Existe este objeto? Le pregunta a la API de Storage y NO a la URL pública:
// el CDN sirve objetos ya borrados desde su caché (verificado: un HEAD plano
// devolvió 200 para un archivo eliminado), así que el CDN da falsos "existe".
// Devuelve null si no se pudo determinar — el llamador tiene que fallar cerrado.
export async function fileExists(path) {
  if (typeof path !== 'string' || !path) return null
  const barra = path.lastIndexOf('/')
  const carpeta = barra >= 0 ? path.slice(0, barra) : ''
  const nombre = barra >= 0 ? path.slice(barra + 1) : path
  const { data, error } = await supabase.storage.from(BUCKET).list(carpeta, { limit: 100, search: nombre })
  if (error) return null
  return (data || []).some(f => f.name === nombre)
}

export async function createFolder(folderPath) {
  const placeholder = `${folderPath}/.emptyFolderPlaceholder`
  const { error } = await supabase.storage.from(BUCKET).upload(placeholder, new Blob(['']), { upsert: true })
  if (error) throw error
}

export async function deleteFile(path) {
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) throw error
}

export async function renameFile(oldPath, newDisplayName) {
  const ext = oldPath.match(/(\.[^.]+)?$/)[0] || ''
  const rawBase = newDisplayName.replace(/\.[^.]+$/, '').trim()
  const base = rawBase
    .normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9\-_]/g, '')
    .toLowerCase() || 'archivo'
  const lastSlash = oldPath.lastIndexOf('/')
  const folder = lastSlash >= 0 ? oldPath.slice(0, lastSlash) : ''
  const newPath = folder ? `${folder}/${base}-${Date.now()}${ext}` : `${base}-${Date.now()}${ext}`
  // La URL vieja se calcula ANTES de mover, y se devuelve junto con la nueva:
  // misma forma que moveFile, para que el llamador pueda hacer la cascada.
  const oldUrl = publicUrlFor(oldPath)
  const { error } = await supabase.storage.from(BUCKET).move(oldPath, newPath)
  if (error) throw error
  return { newPath, newUrl: publicUrlFor(newPath), oldUrl }
}

export async function moveFile(oldPath, targetFolderPath) {
  const filename = oldPath.split('/').pop()
  const newPath = targetFolderPath ? `${targetFolderPath}/${filename}` : filename
  const oldUrl = supabase.storage.from(BUCKET).getPublicUrl(oldPath).data.publicUrl
  if (oldPath === newPath) return { newPath, newUrl: oldUrl, oldUrl }
  const { error } = await supabase.storage.from(BUCKET).move(oldPath, newPath)
  if (error) throw error
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(newPath)
  return { newPath, newUrl: data.publicUrl, oldUrl }
}
