export function renderBlocks(blocks) {
  const frag = document.createDocumentFragment()
  let stepCount = 0

  for (const block of blocks) {
    if (block.type === 'step') {
      stepCount++
      const wrap = document.createElement('div')
      wrap.style.cssText = 'display:flex;gap:10px;align-items:flex-start;margin-bottom:14px'
      const circle = document.createElement('div')
      circle.style.cssText = 'width:24px;height:24px;background:#E92129;border-radius:50%;color:white;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px'
      circle.textContent = stepCount
      const p = document.createElement('p')
      p.style.cssText = 'font-size:13px;color:#334155;margin:3px 0 0;line-height:1.6'
      p.textContent = block.text || ''
      wrap.append(circle, p)
      frag.append(wrap)

    } else if (block.type === 'image') {
      let validUrl = false
      try { new URL(block.url); validUrl = true } catch (_) {}
      if (!validUrl) continue
      const wrap = document.createElement('div')
      wrap.style.cssText = 'border-radius:10px;overflow:hidden;border:1px solid #e2e8f0;margin-bottom:14px'
      const img = document.createElement('img')
      img.src = block.url
      img.alt = block.caption || ''
      img.style.cssText = 'width:100%;display:block'
      wrap.append(img)
      if (block.caption) {
        const cap = document.createElement('p')
        cap.style.cssText = 'font-size:11px;color:#94a3b8;margin:0;padding:8px 12px;background:#fff;border-top:1px solid #f1f5f9'
        cap.textContent = block.caption
        wrap.append(cap)
      }
      frag.append(wrap)

    } else if (block.type === 'video') {
      let validUrl = false
      try { new URL(block.url); validUrl = true } catch (_) {}
      if (!validUrl) continue
      const a = document.createElement('a')
      a.href = block.url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.style.cssText = 'display:block;margin-bottom:14px;text-decoration:none'
      const top = document.createElement('div')
      top.style.cssText = 'background:#1e293b;border-radius:10px 10px 0 0;height:80px;display:flex;align-items:center;justify-content:center'
      const playBtn = document.createElement('div')
      playBtn.style.cssText = 'width:36px;height:36px;background:#E92129;border-radius:50%;display:flex;align-items:center;justify-content:center'
      const playIcon = document.createElement('span')
      playIcon.style.cssText = 'color:white;font-size:16px;margin-left:3px'
      playIcon.textContent = '▶'
      playBtn.append(playIcon)
      top.append(playBtn)
      const bottom = document.createElement('div')
      bottom.style.cssText = 'background:#fff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;padding:10px 12px'
      const labelEl = document.createElement('p')
      labelEl.style.cssText = 'font-size:12px;font-weight:700;color:#1e293b;margin:0'
      labelEl.textContent = block.label || 'Ver video'
      bottom.append(labelEl)
      a.append(top, bottom)
      frag.append(a)

    } else if (block.type === 'link') {
      let validUrl = false
      try { new URL(block.url); validUrl = true } catch (_) {}
      if (!validUrl) continue
      const a = document.createElement('a')
      a.href = block.url
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.style.cssText = 'display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px;text-decoration:none;margin-bottom:14px'
      const icon = document.createElement('div')
      icon.style.cssText = 'width:32px;height:32px;background:#eff6ff;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0'
      icon.textContent = '🔗'
      const labelEl = document.createElement('p')
      labelEl.style.cssText = 'font-size:12px;font-weight:700;color:#1e293b;margin:0;flex:1'
      labelEl.textContent = block.label || block.url
      const arrow = document.createElement('span')
      arrow.style.cssText = 'color:#cbd5e1;font-size:14px'
      arrow.textContent = '→'
      a.append(icon, labelEl, arrow)
      frag.append(a)
    }
  }

  return frag
}
