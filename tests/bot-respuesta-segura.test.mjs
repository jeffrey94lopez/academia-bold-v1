import test from 'node:test'
import assert from 'node:assert/strict'
import { textoSeguroDelBot, pareceSobreEnvoltorio } from '../js/bot-respuesta-segura.js'

// Forma REAL del incidente del 2026-11-02 (ejecucion n8n 11773): el modelo
// corto su JSON a mitad de palabra por finish_reason=length, JSON.parse fallo
// y n8n mando el string crudo como `response`.
//
// Los `\\n` de adentro son a proposito: en el JSON de verdad el salto de linea
// viaja ESCAPADO, y desescaparlo es justo lo que se esta probando. Un salto
// real aca haria pasar el test sin ejercitar nada.
const CRUDO_TRUNCADO = `{
  "sentiment": "neutro",
  "support_redirected": false,
  "asked_clarification": false,
  "knowledge_gap": false,
  "segments": [
    {
      "type": "text",
      "content": "¡Perfecto! Para configurar tu impresora térmica en Windows, el proceso tiene dos partes."
    },
    {
      "type": "text",
      "content": "## Paso 1\\n\\nDescarga el controlador oficial del fabricante."
    },
    {
      "type": "text",
      "content": "Escala: 100 %. No uses «Ajustar al ancho».\\n\\nEncabezados: desactivado.\\n\\nGráf`

test('un texto normal pasa intacto', () => {
  const t = 'Para abrir turno, entra a Ventas y toca Abrir turno.'
  assert.equal(textoSeguroDelBot(t), t)
})

test('NUNCA le muestra al cliente el JSON interno', () => {
  // Es el fallo del 2026-11-02: el cliente leyo "sentiment", "knowledge_gap" y
  // "support_redirected" en la burbuja del chat.
  const out = textoSeguroDelBot(CRUDO_TRUNCADO)
  for (const clave of ['sentiment', 'knowledge_gap', 'support_redirected', '"segments"', '"type"']) {
    assert.ok(!out.includes(clave), `se filtro ${clave}`)
  }
  assert.ok(!out.trimStart().startsWith('{'), 'sigue arrancando como JSON')
})

test('rescata el texto que el modelo alcanzo a escribir', () => {
  // Una respuesta incompleta sirve; un volcado de JSON no. Incluido el ultimo
  // fragmento, que quedo sin cerrar comillas.
  const out = textoSeguroDelBot(CRUDO_TRUNCADO)
  assert.ok(out.includes('impresora térmica en Windows'), 'perdio el primer bloque')
  assert.ok(out.includes('controlador oficial del fabricante'), 'perdio el segundo bloque')
  assert.ok(out.includes('Ajustar al ancho'), 'perdio el bloque truncado')
})

test('convierte los saltos escapados en saltos de verdad', () => {
  const out = textoSeguroDelBot(CRUDO_TRUNCADO)
  assert.ok(!out.includes('\\n'), 'dejo los saltos escapados del JSON')
  assert.ok(out.includes('## Paso 1\n'), 'no desescapo el salto de linea')
})

test('avisa que la respuesta quedo cortada', () => {
  // Honestidad: el texto rescatado termina a mitad de frase. Callarlo deja al
  // cliente creyendo que eso era toda la respuesta.
  const out = textoSeguroDelBot(CRUDO_TRUNCADO)
  assert.ok(/cort|complet/i.test(out), 'no avisa que falta contenido')
})

test('si no hay nada que rescatar, da un mensaje util y no un vacio', () => {
  const out = textoSeguroDelBot('{"sentiment":"neutro","segments":[')
  assert.ok(out.length > 20, 'devolvio algo vacio o inservible')
  assert.ok(!out.includes('sentiment'), 'filtro el JSON igual')
  assert.ok(!out.trimStart().startsWith('{'))
})

test('un JSON de envoltorio BIEN formado tambien se desarma', () => {
  const ok = JSON.stringify({ sentiment: 'neutro', knowledge_gap: false,
    segments: [{ type: 'text', content: 'Primero esto.' }, { type: 'image', url: 'u' },
               { type: 'text', content: 'Y después esto.' }] })
  const out = textoSeguroDelBot(ok)
  assert.equal(out, 'Primero esto.\n\nY después esto.')
})

test('NO toca un texto que apenas empieza con llave', () => {
  // El cliente puede preguntar por JSON, o el bot explicar un archivo de
  // configuracion. Solo es envoltorio si trae NUESTRAS claves.
  const t = '{ "nombre": "camisa", "precio": 50000 } es el formato del archivo.'
  assert.equal(textoSeguroDelBot(t), t)
  assert.equal(pareceSobreEnvoltorio(t), false)
})

test('tolera vacio, null y no-texto sin reventar', () => {
  for (const v of [null, undefined, '', 0, {}, []]) {
    assert.equal(typeof textoSeguroDelBot(v), 'string', `reventó con ${JSON.stringify(v)}`)
  }
})
