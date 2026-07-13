// js/storage.js — acceso a localStorage que nunca lanza.
// Dentro de un iframe third-party el navegador puede bloquear el storage
// (SecurityError) o borrarlo; aquí se degrada a un Map en memoria.
const memory = new Map()

const canUseLocalStorage = (() => {
  try {
    const k = '__bold_storage_test__'
    localStorage.setItem(k, '1')
    localStorage.removeItem(k)
    return true
  } catch {
    return false
  }
})()

export function storageGet(key) {
  if (canUseLocalStorage) {
    try {
      const v = localStorage.getItem(key)
      if (v !== null) return v
    } catch {}
  }
  return memory.has(key) ? memory.get(key) : null
}

export function storageSet(key, value) {
  if (canUseLocalStorage) {
    try {
      localStorage.setItem(key, value)
      memory.delete(key)
      return
    } catch {}
  }
  memory.set(key, String(value))
}

export function storageRemove(key) {
  if (canUseLocalStorage) {
    try {
      localStorage.removeItem(key)
    } catch {}
  }
  memory.delete(key)
}
