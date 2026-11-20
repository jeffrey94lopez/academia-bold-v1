// js/inv-lista-copiable.js — lista de textos con un botón Copiar por fila.
// Se usa para las categorías que el cliente debe crear en Bold POS: copia una,
// la pega al crearla, vuelve y copia la siguiente.

const FILAS_SIN_SCROLL = 15

// Portapapeles moderno; si no existe o el iframe no lo permite (falta allow="clipboard-write"),
// cae a execCommand('copy') con un textarea temporal. Lanza si ambos fallan.
async function copiarPorDefecto(texto) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('sin API')
    await navigator.clipboard.writeText(texto)
    return
  } catch { /* sigue al respaldo */ }
  const ta = document.createElement('textarea')
  ta.value = texto
  ta.readOnly = true
  ta.setAttribute('aria-hidden', 'true')
  ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0'
  document.body.appendChild(ta)
  try {
    ta.select()
    if (!document.execCommand('copy')) throw new Error('execCommand falló')
  } finally {
    ta.remove()
  }
}

export function listaCopiable(items, { esc, copiar = copiarPorDefecto, alCopiar = () => {} } = {}) {
  const total = items.length
  const copiadas = new Set()

  const raiz = document.createElement('div')
  raiz.className = 'inv-copia'

  const lista = document.createElement('ul')
  lista.className = 'inv-copia-lista'
  if (total > FILAS_SIN_SCROLL) lista.classList.add('inv-copia-scroll')

  const contador = document.createElement('p')
  contador.className = 'inv-copia-contador'
  contador.setAttribute('aria-live', 'polite')
  const pintarContador = () => { contador.textContent = `${copiadas.size} de ${total} copiadas` }
  pintarContador()

  items.forEach((item, i) => {
    const fila = document.createElement('li')
    fila.className = 'inv-copia-fila'
    fila.innerHTML = `<span class="inv-copia-check" aria-hidden="true"></span><span class="inv-copia-texto">${esc(item)}</span>`
    const boton = document.createElement('button')
    boton.type = 'button'
    boton.className = 'inv-chipbtn inv-copia-boton'
    boton.textContent = 'Copiar'
    boton.setAttribute('aria-label', `Copiar ${item}`)
    boton.addEventListener('click', async () => {
      try {
        await copiar(item)
      } catch {
        // Sin portapapeles: no se marca; se selecciona el texto para que el cliente use Ctrl+C.
        boton.textContent = 'Selecciona y copia'
        const rango = document.createRange()
        rango.selectNodeContents(fila.querySelector('.inv-copia-texto'))
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(rango)
        return
      }
      copiadas.add(i)
      fila.classList.add('inv-copia-hecha')
      fila.querySelector('.inv-copia-check').textContent = '✓'
      boton.textContent = 'Copiada'
      boton.setAttribute('aria-label', `Copiada ${item}, volver a copiar`)
      pintarContador()
      alCopiar(item, copiadas.size)
    })
    fila.append(boton)
    lista.append(fila)
  })

  raiz.append(lista, contador)
  return raiz
}
