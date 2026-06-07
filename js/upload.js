import { supabase } from './supabase.js'

const BUCKET = 'material'
const MAX_BYTES = 50 * 1024 * 1024

export async function uploadFile(file, onProgress) {
  if (file.size > MAX_BYTES) throw new Error('El archivo supera el límite de 50MB')

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const ext = safe.match(/\.[^.]+$/)?.[0] ?? ''
  const base = ext ? safe.slice(0, -ext.length) : safe
  const path = `${base || 'archivo'}-${Date.now()}${ext}`

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

export async function listFiles() {
  const { data, error } = await supabase.storage.from(BUCKET).list('', {
    limit: 200,
    sortBy: { column: 'created_at', order: 'desc' },
  })
  if (error) throw error

  return (data || [])
    .filter(f => f.name !== '.emptyFolderPlaceholder')
    .map(f => ({
      name: f.name,
      size: f.metadata?.size || 0,
      type: f.metadata?.mimetype || '',
      url: supabase.storage.from(BUCKET).getPublicUrl(f.name).data.publicUrl,
    }))
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
  const newPath = `${base}-${Date.now()}${ext}`
  const { error } = await supabase.storage.from(BUCKET).move(oldPath, newPath)
  if (error) throw error
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(newPath)
  return { path: newPath, url: data.publicUrl }
}
