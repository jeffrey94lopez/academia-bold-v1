import test from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from '../js/markdown.js'

// El cuerpo del mensaje viene del bot (n8n/LLM) → es contenido NO confiable.
// renderMarkdown se inyecta con innerHTML, así que todo lo que no sea un token
// de markdown reconocido tiene que salir escapado.

test('escapa HTML en el texto plano del cuerpo (XSS almacenado)', () => {
  const out = renderMarkdown('hola <img src=x onerror=alert(1)>')
  assert.ok(!/<img/.test(out), 'no debe quedar un <img crudo del cuerpo')
  assert.ok(out.includes('&lt;img src=x onerror=alert(1)&gt;'))
})

test('escapa etiquetas <script> del cuerpo', () => {
  const out = renderMarkdown('antes <script>alert(1)</script> despues')
  assert.ok(!/<script/i.test(out))
  assert.ok(out.includes('&lt;script&gt;'))
})

test('el label de un link se escapa (no inyecta HTML)', () => {
  const out = renderMarkdown('[<img src=x onerror=alert(1)>](https://ejemplo.com)')
  assert.ok(!/<img/.test(out), 'el label no debe producir un <img crudo')
  assert.ok(out.includes('<a href="https://ejemplo.com"'))
})

test('una comilla en la URL no rompe el atributo href', () => {
  const out = renderMarkdown('[t](https://ejemplo.com/x")')
  // La " debe quedar como entidad dentro del valor del atributo.
  assert.ok(out.includes('&quot;'))
  assert.ok(!/href="https:\/\/ejemplo\.com\/x">/.test(out))
})

test('no convierte javascript: en link', () => {
  const out = renderMarkdown('[x](javascript:alert(1))')
  assert.ok(!/href="javascript:/i.test(out))
})

test('imagen markdown usa data-lightbox, no onclick inline (CSP)', () => {
  const out = renderMarkdown('![foto](https://ejemplo.com/a.png)')
  assert.ok(!/onclick/.test(out), 'no debe usar onclick inline (lo bloquea la CSP)')
  assert.ok(out.includes('data-lightbox="https://ejemplo.com/a.png"'))
  assert.ok(out.includes('class="chat-img"'))
})

test('el alt de una imagen se escapa', () => {
  const out = renderMarkdown('![<b>x</b>](https://ejemplo.com/a.png)')
  assert.ok(!/<b>/.test(out))
  assert.ok(out.includes('alt="&lt;b&gt;x&lt;/b&gt;"'))
})

test('ampersand en la URL de imagen queda como &amp; (HTML válido)', () => {
  const out = renderMarkdown('![a](https://ejemplo.com/i.png?x=1&y=2)')
  assert.ok(out.includes('src="https://ejemplo.com/i.png?x=1&amp;y=2"'))
})

test('link de YouTube produce iframe embebido', () => {
  const out = renderMarkdown('[ver](https://youtu.be/abc123XYZ_-)')
  assert.ok(out.includes('youtube.com/embed/abc123XYZ_-'))
  assert.ok(!/onclick/.test(out))
})

test('negrita **texto** se convierte en <strong>', () => {
  assert.ok(renderMarkdown('**hola**').includes('<strong>hola</strong>'))
})

test('los saltos de línea se convierten en <br>', () => {
  assert.ok(renderMarkdown('a\nb').includes('a<br>b'))
})

test('la negrita del cuerpo no permite inyectar HTML', () => {
  const out = renderMarkdown('**<i>x</i>**')
  assert.ok(out.includes('<strong>&lt;i&gt;x&lt;/i&gt;</strong>'))
})

test('vacío o null devuelve cadena vacía', () => {
  assert.equal(renderMarkdown(''), '')
  assert.equal(renderMarkdown(null), '')
  assert.equal(renderMarkdown(undefined), '')
})
