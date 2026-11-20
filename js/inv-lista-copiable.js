// js/inv-lista-copiable.js — lista de textos con un botón Copiar por fila.
// Se usa para las categorías que el cliente debe crear en Bold POS: copia una,
// la pega al crearla, vuelve y copia la siguiente.

const FILAS_SIN_SCROLL = 15

export function listaCopiable(items, { esc, copiar = texto => navigator.clipboard.writeText(texto), alCopiar = () => {} } = {}) {
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
        // Sin portapapeles: el texto sigue a la vista para copiarlo a mano; no se marca.
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
