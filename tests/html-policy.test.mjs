import test from 'node:test'
import assert from 'node:assert/strict'
import { isAllowedTag, isDroppedWithContent, isAllowedAttr, isSafeUrlValue } from '../js/html-policy.js'

test('isSafeUrlValue: acepta los esquemas de uso normal', () => {
  assert.equal(isSafeUrlValue('https://x.com/f.png'), true)
  assert.equal(isSafeUrlValue('http://x.com/f.png'), true)
  assert.equal(isSafeUrlValue('mailto:soporte@mpl.hn'), true)
  assert.equal(isSafeUrlValue('tel:+50412345678'), true)
  assert.equal(isSafeUrlValue('data:image/png;base64,iVBORw0KGgo='), true)
})

test('isSafeUrlValue: acepta rutas relativas y anclas (no tienen esquema)', () => {
  assert.equal(isSafeUrlValue('/material/f.png'), true)
  assert.equal(isSafeUrlValue('imagen.png'), true)
  assert.equal(isSafeUrlValue('#seccion'), true)
})

test('isSafeUrlValue: rechaza javascript: en todas sus disfraces', () => {
  assert.equal(isSafeUrlValue('javascript:alert(1)'), false)
  assert.equal(isSafeUrlValue('  javascript:alert(1)'), false)
  assert.equal(isSafeUrlValue('jAvAsCrIpT:alert(1)'), false)
  assert.equal(isSafeUrlValue('java\nscript:alert(1)'), false)
  assert.equal(isSafeUrlValue('java\tscript:alert(1)'), false)
  assert.equal(isSafeUrlValue('java\0script:alert(1)'), false)
  assert.equal(isSafeUrlValue('vbscript:msgbox(1)'), false)
})

test('isSafeUrlValue: rechaza data: que no sea imagen, y file:', () => {
  assert.equal(isSafeUrlValue('data:text/html,<script>alert(1)</script>'), false)
  assert.equal(isSafeUrlValue('data:application/javascript,alert(1)'), false)
  assert.equal(isSafeUrlValue('file:///C:/Windows/System32'), false)
})

test('isSafeUrlValue: entradas degeneradas son inseguras', () => {
  assert.equal(isSafeUrlValue(''), false)
  assert.equal(isSafeUrlValue('   '), false)
  assert.equal(isSafeUrlValue(null), false)
  assert.equal(isSafeUrlValue(undefined), false)
  assert.equal(isSafeUrlValue(42), false)
})

test('isAllowedTag: pasa el marcado de una lección, no el resto', () => {
  for (const t of ['p', 'br', 'strong', 'ul', 'li', 'h2', 'img', 'a', 'table', 'td', 'code']) {
    assert.equal(isAllowedTag(t), true, t)
  }
  for (const t of ['script', 'iframe', 'form', 'svg', 'marquee', 'blink']) {
    assert.equal(isAllowedTag(t), false, t)
  }
})

test('isAllowedTag: no depende de las mayúsculas', () => {
  assert.equal(isAllowedTag('P'), true)
  assert.equal(isAllowedTag('IMG'), true)
  assert.equal(isAllowedTag('SCRIPT'), false)
})

test('isDroppedWithContent: los peligrosos se van con su contenido; los desconocidos no', () => {
  for (const t of ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'svg', 'math']) {
    assert.equal(isDroppedWithContent(t), true, t)
  }
  // marquee no está permitida, pero su TEXTO se conserva: se desenvuelve.
  assert.equal(isDroppedWithContent('marquee'), false)
  assert.equal(isDroppedWithContent('p'), false)
  assert.equal(isDroppedWithContent('SCRIPT'), true)
})

test('isAllowedAttr: href solo en a, src solo en img', () => {
  assert.equal(isAllowedAttr('a', 'href'), true)
  assert.equal(isAllowedAttr('p', 'href'), false)
  assert.equal(isAllowedAttr('img', 'src'), true)
  assert.equal(isAllowedAttr('div', 'src'), false)
})

test('isAllowedAttr: los genéricos van en cualquier etiqueta', () => {
  assert.equal(isAllowedAttr('p', 'class'), true)
  assert.equal(isAllowedAttr('img', 'title'), true)
  assert.equal(isAllowedAttr('div', 'id'), true)
})

test('isAllowedAttr: nunca on* ni style', () => {
  assert.equal(isAllowedAttr('img', 'onerror'), false)
  assert.equal(isAllowedAttr('a', 'onclick'), false)
  assert.equal(isAllowedAttr('div', 'onmouseover'), false)
  assert.equal(isAllowedAttr('p', 'style'), false)
  assert.equal(isAllowedAttr('img', 'ONERROR'), false)
})

test('isAllowedAttr: colspan solo en celdas', () => {
  assert.equal(isAllowedAttr('td', 'colspan'), true)
  assert.equal(isAllowedAttr('th', 'rowspan'), true)
  assert.equal(isAllowedAttr('div', 'colspan'), false)
})

test('isAllowedAttr: entradas degeneradas devuelven false', () => {
  assert.equal(isAllowedAttr('', 'class'), false)
  assert.equal(isAllowedAttr('p', ''), false)
  assert.equal(isAllowedAttr(null, 'class'), false)
  assert.equal(isAllowedAttr('p', null), false)
})
