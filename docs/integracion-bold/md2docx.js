// md2docx.js — conversor Markdown → .docx para los requerimientos de integración.
// Uso: node md2docx.js entrada.md salida.docx "Título del documento"
const fs = require('fs')
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  PageOrientation, LevelFormat, convertInchesToTwip,
} = require('docx')

const [, , inPath, outPath, docTitle] = process.argv
const md = fs.readFileSync(inPath, 'utf8').replace(/\r\n/g, '\n')

const PAGE_W = 12240, MARGIN = 1440             // Letter
const CONTENT_W = PAGE_W - MARGIN * 2           // 9360
const MONO = 'Consolas'
const SANS = 'Calibri'
const BLUE = '121E6C'
const GREY = '606060'

// ---------- inline ----------
function runs(text, base = {}) {
  const out = []
  // **negrita**, `código`, *cursiva*
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g
  let last = 0, m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }))
    const t = m[0]
    if (t.startsWith('**')) out.push(new TextRun({ text: t.slice(2, -2), bold: true, ...base }))
    else if (t.startsWith('`')) out.push(new TextRun({ text: t.slice(1, -1), font: MONO, size: 19, color: 'B02020', ...base }))
    else out.push(new TextRun({ text: t.slice(1, -1), italics: true, ...base }))
    last = m.index + t.length
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }))
  return out.length ? out : [new TextRun({ text: '', ...base })]
}

const stripMd = s => s.replace(/\*\*/g, '').replace(/`/g, '')

// ---------- bloques ----------
const children = []
const lines = md.split('\n')
let i = 0

function heading(level, text) {
  const map = { 1: HeadingLevel.HEADING_1, 2: HeadingLevel.HEADING_2, 3: HeadingLevel.HEADING_3, 4: HeadingLevel.HEADING_4 }
  const sizes = { 1: 30, 2: 24, 3: 20, 4: 18 }
  children.push(new Paragraph({
    heading: map[level],
    spacing: { before: level === 1 ? 0 : 260, after: 120 },
    children: [new TextRun({ text: stripMd(text), bold: true, size: sizes[level], color: level <= 2 ? BLUE : '1E1E1E', font: SANS })],
    ...(level === 2 ? { border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D2D4E1', space: 4 } } } : {}),
  }))
}

function codeBlock(codeLines) {
  codeLines.forEach((l, idx) => children.push(new Paragraph({
    shading: { type: ShadingType.CLEAR, fill: 'F3F4F8' },
    spacing: { before: idx === 0 ? 120 : 0, after: idx === codeLines.length - 1 ? 140 : 0, line: 240 },
    indent: { left: 120, right: 120 },
    children: [new TextRun({ text: l || ' ', font: MONO, size: 17 })],
  })))
}

function tableBlock(rowsIn) {
  let rows = rowsIn
  // rows se normaliza abajo
  const cols = rows[0].length
  // Normalizar: toda fila con el mismo número de celdas que el encabezado.
  rows = rows.map(r => r.length === cols ? r
    : r.length > cols ? r.slice(0, cols - 1).concat(r.slice(cols - 1).join(' | '))
    : r.concat(new Array(cols - r.length).fill('')))
  const lens = new Array(cols).fill(6)
  rows.forEach(r => r.forEach((c, j) => { lens[j] = Math.max(lens[j], Math.min(stripMd(c).length, 60)) }))
  const total = lens.reduce((a, b) => a + b, 0)
  let widths = lens.map(l => Math.max(900, Math.round(CONTENT_W * l / total)))
  const diff = CONTENT_W - widths.reduce((a, b) => a + b, 0)
  widths[widths.length - 1] += diff

  const tRows = rows.map((cells, ri) => new TableRow({
    tableHeader: ri === 0,
    children: cells.map((c, j) => new TableCell({
      width: { size: widths[j], type: WidthType.DXA },
      shading: ri === 0 ? { type: ShadingType.CLEAR, fill: BLUE } : (ri % 2 === 0 ? { type: ShadingType.CLEAR, fill: 'F7F8FB' } : undefined),
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [new Paragraph({
        spacing: { before: 20, after: 20 },
        children: runs(c, ri === 0 ? { bold: true, color: 'FFFFFF', size: 18 } : { size: 19 }),
      })],
    })),
  }))
  children.push(new Table({
    columnWidths: widths,
    width: { size: CONTENT_W, type: WidthType.DXA },
    rows: tRows,
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 2, color: 'D2D4E1' },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: 'D2D4E1' },
      left:   { style: BorderStyle.SINGLE, size: 2, color: 'D2D4E1' },
      right:  { style: BorderStyle.SINGLE, size: 2, color: 'D2D4E1' },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'E5E7F0' },
      insideVertical:   { style: BorderStyle.SINGLE, size: 2, color: 'E5E7F0' },
    },
  }))
  children.push(new Paragraph({ spacing: { after: 140 }, children: [new TextRun('')] }))
}

while (i < lines.length) {
  const line = lines[i]

  if (/^```/.test(line)) {
    const buf = []
    i++
    while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++])
    i++
    codeBlock(buf)
    continue
  }

  const h = line.match(/^(#{1,4})\s+(.*)$/)
  if (h) { heading(h[1].length, h[2]); i++; continue }

  if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
    const rows = []
    // \| es un pipe literal dentro de una celda: se protege antes de cortar.
    const parse = l => l.trim().replace(/\\\|/g, '').replace(/^\||\|$/g, '')
      .split('|').map(s => s.trim().replace(//g, '|'))
    rows.push(parse(lines[i])); i += 2
    while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(parse(lines[i++]))
    tableBlock(rows)
    continue
  }

  if (/^(---|\*\*\*|___)\s*$/.test(line)) {
    children.push(new Paragraph({
      spacing: { before: 120, after: 180 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'D2D4E1', space: 1 } },
      children: [new TextRun('')],
    }))
    i++; continue
  }

  if (/^>\s?/.test(line)) {
    const buf = []
    while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''))
    children.push(new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: 'FFF8E1' },
      border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'FFC217', space: 8 } },
      indent: { left: 200, right: 120 },
      spacing: { before: 120, after: 160 },
      children: runs(buf.join(' '), { size: 20 }),
    }))
    continue
  }

  const li = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/)
  if (li) {
    const nivel = Math.min(Math.floor(li[1].length / 2), 2)
    let texto = li[3]
    // Continuación del ítem: líneas indentadas que no abren otro bloque.
    let j = i + 1
    while (j < lines.length && lines[j].trim() &&
           !/^\s*([-*]|\d+\.)\s/.test(lines[j]) &&
           !/^(```|#{1,4}\s|>|---\s*$)/.test(lines[j]) &&
           !/^\s*\|/.test(lines[j]) && /^\s+\S/.test(lines[j])) {
      texto += ' ' + lines[j].trim(); j++
    }
    i = j - 1
    let marca = null
    const chk = texto.match(/^\[( |x|X)\]\s+(.*)$/)
    if (chk) { marca = chk[1].trim() ? '☑' : '☐'; texto = chk[2] }
    const bullet = marca || (/\d/.test(li[2]) ? li[2] : '•')
    children.push(new Paragraph({
      indent: { left: 260 + nivel * 260, hanging: 240 },
      spacing: { after: 60, line: 260 },
      children: [new TextRun({ text: bullet + '  ', size: 20, color: marca ? '1E1E1E' : BLUE, bold: !marca }), ...runs(texto, { size: 20 })],
    }))
    i++; continue
  }

  if (!line.trim()) { i++; continue }

  // Párrafo: se juntan las líneas consecutivas (así **negrita** o `código`
  // partidos por un salto de línea siguen siendo un solo run).
  const buf = []
  while (i < lines.length && lines[i].trim() &&
         !/^(```|#{1,4}\s|>|\s*[-*]\s|\s*\d+\.\s|---\s*$)/.test(lines[i]) &&
         !/^\s*\|/.test(lines[i])) {
    buf.push(lines[i].trim()); i++
  }
  children.push(new Paragraph({
    spacing: { after: 140, line: 280 },
    children: runs(buf.join(' '), { size: 20 }),
  }))
}

const doc = new Document({
  creator: 'BoldBot POS',
  title: docTitle || 'Requerimiento',
  styles: { default: { document: { run: { font: SANS, size: 20, color: '1E1E1E' } } } },
  sections: [{
    properties: {
      page: {
        size: { width: PAGE_W, height: 15840, orientation: PageOrientation.PORTRAIT },
        margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      },
    },
    children,
  }],
})

Packer.toBuffer(doc).then(b => { fs.writeFileSync(outPath, b); console.log('OK →', outPath, b.length, 'bytes') })
