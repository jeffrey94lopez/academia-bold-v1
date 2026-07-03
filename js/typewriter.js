// js/typewriter.js
// Escritura progresiva: el HTML de la burbuja ya está completo en el DOM;
// se vacían sus nodos de texto y se revelan por partes con un TreeWalker.
// Elementos atómicos (img/iframe/svg) se ocultan con visibility (conservan
// su espacio, sin saltos de layout) y aparecen cuando les llega el turno.

const CHARS_PER_TICK = 3   // ~190 caracteres/seg a 16 ms por tick
const TICK_MS = 16

let active = null // { root, skip } de la animación en curso

export function skipActiveTypewriter() {
  active?.skip()
}

function buildRevealPlan(root) {
  const steps = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let node
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.nodeValue) continue
      steps.push({ kind: 'text', node, full: node.nodeValue })
      node.nodeValue = ''
    } else if (['IMG', 'IFRAME', 'SVG'].includes((node.tagName || '').toUpperCase())) {
      node.style.visibility = 'hidden'
      steps.push({ kind: 'atom', node })
    }
  }
  return steps
}

export function typewrite(root, { onTick } = {}) {
  return new Promise(resolve => {
    const steps = buildRevealPlan(root)
    root.classList.add('tw-running')
    let i = 0, pos = 0, finished = false

    function finish() {
      if (finished) return
      finished = true
      clearInterval(timer)
      for (; i < steps.length; i++) {
        const s = steps[i]
        if (s.kind === 'text') s.node.nodeValue = s.full
        else s.node.style.visibility = ''
      }
      root.classList.remove('tw-running')
      if (active?.root === root) active = null
      onTick?.()
      resolve()
    }

    const timer = setInterval(() => {
      let budget = CHARS_PER_TICK
      while (budget > 0 && i < steps.length) {
        const s = steps[i]
        if (s.kind === 'atom') { s.node.style.visibility = ''; i++; continue }
        const take = Math.min(budget, s.full.length - pos)
        pos += take
        budget -= take
        s.node.nodeValue = s.full.slice(0, pos)
        if (pos >= s.full.length) { i++; pos = 0 }
      }
      onTick?.()
      if (i >= steps.length) finish()
    }, TICK_MS)

    active = { root, skip: finish }
  })
}
