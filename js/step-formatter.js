export function applyFormat(textarea, marker) {
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const val = textarea.value

  if (start !== end) {
    const selected = val.slice(start, end)
    textarea.value = val.slice(0, start) + marker + selected + marker + val.slice(end)
    textarea.selectionStart = start + marker.length
    textarea.selectionEnd = end + marker.length
  } else {
    textarea.value = val.slice(0, start) + marker + marker + val.slice(start)
    const pos = start + marker.length
    textarea.selectionStart = pos
    textarea.selectionEnd = pos
  }

  textarea.focus()
  textarea.dispatchEvent(new Event('input'))
}

export function renderStepText(text) {
  const frag = document.createDocumentFragment()
  if (text == null) return frag
  let remaining = String(text)

  // Order matters: ** must come before * so "**bold**" matches strong, not em
  const patterns = [
    { re: /\*\*(.+?)\*\*/s, tag: 'strong' },
    { re: /\*(.+?)\*/s,     tag: 'em'     },
    { re: /__(.+?)__/s,     tag: 'u'      },
  ]

  while (remaining.length > 0) {
    let earliest = null
    for (const { re, tag } of patterns) {
      const m = re.exec(remaining)
      if (m && (earliest === null || m.index < earliest.index)) {
        earliest = { index: m.index, length: m[0].length, inner: m[1], tag }
      }
    }

    if (!earliest) {
      frag.append(document.createTextNode(remaining))
      break
    }

    if (earliest.index > 0) {
      frag.append(document.createTextNode(remaining.slice(0, earliest.index)))
    }

    const el = document.createElement(earliest.tag)
    el.textContent = earliest.inner
    frag.append(el)

    remaining = remaining.slice(earliest.index + earliest.length)
  }

  return frag
}
