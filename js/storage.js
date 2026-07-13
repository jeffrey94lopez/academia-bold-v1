// js/storage.js — acceso a localStorage que nunca lanza.
// Dentro de un iframe third-party el navegador puede bloquear el storage
// (SecurityError) o borrarlo; aquí se degrada a un Map en memoria.
// En Node tests, cada ?caso=N obtiene un Map fresco para aislamiento.
const memoryPerCase = new Map() // Map<caso, Map<key, value>>

function getCaseKey() {
  // En Node, globalThis.__bold_caso es seteado por vertical.js que lo extrae de import.meta
  if (typeof globalThis !== 'undefined' && globalThis.__bold_caso) {
    return globalThis.__bold_caso
  }
  return 'default'
}

function getMemory() {
  const caso = getCaseKey()
  if (!memoryPerCase.has(caso)) {
    memoryPerCase.set(caso, new Map())
  }
  return memoryPerCase.get(caso)
}

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
  const memory = getMemory()
  return memory.has(key) ? memory.get(key) : null
}

export function storageSet(key, value) {
  if (canUseLocalStorage) {
    try {
      localStorage.setItem(key, value)
      getMemory().delete(key)
      return
    } catch {}
  }
  getMemory().set(key, String(value))
}

export function storageRemove(key) {
  if (canUseLocalStorage) {
    try {
      localStorage.removeItem(key)
    } catch {}
  }
  getMemory().delete(key)
}
