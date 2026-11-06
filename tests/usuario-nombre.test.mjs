import test from 'node:test'
import assert from 'node:assert/strict'
import { nombreUsuario } from '../js/usuario-nombre.js'

test('normaliza el "Nombre - Apellido" con que llega de Bold', () => {
  // Bold concatena los dos campos de su propia pantalla con " - ". Pintado
  // crudo, ese guion parece un error nuestro.
  assert.equal(nombreUsuario({ user_name: 'Adriana - Lopez' }).texto, 'Adriana Lopez')
  assert.equal(nombreUsuario({ user_name: 'Anggie Tatiana - Muñoz mafla' }).texto,
               'Anggie Tatiana Muñoz mafla')
})

test('NO toca un guion sin espacios: es parte del nombre', () => {
  // El separador de Bold siempre viene rodeado de espacios. Un apellido
  // compuesto no, y romperlo sería escribir mal el nombre de una persona.
  assert.equal(nombreUsuario({ user_name: 'Jean-Paul - Sartre' }).texto, 'Jean-Paul Sartre')
  assert.equal(nombreUsuario({ user_name: 'Ana-María Gómez' }).texto, 'Ana-María Gómez')
})

test('un nombre sin separador pasa tal cual', () => {
  assert.equal(nombreUsuario({ user_name: 'Carolina Restrepo' }).texto, 'Carolina Restrepo')
})

test('sin nombre NO está identificado', () => {
  // Una conversación de fuera del POS no trae ni comercio ni usuario. La fila
  // tiene que poder no pintar nada, en vez de un hueco con icono.
  for (const v of [null, undefined, '', '   ', '\n\t']) {
    const u = nombreUsuario({ user_name: v })
    assert.equal(u.identificado, false, `fallo con ${JSON.stringify(v)}`)
    assert.equal(u.texto, '')
  }
  assert.equal(nombreUsuario(null).identificado, false)
  assert.equal(nombreUsuario(undefined).identificado, false)
})

test('el nombre largo se corta, pero `completo` lo conserva entero', () => {
  // `completo` es lo que va al title: cortar ahí también dejaría el dato
  // inalcanzable, que es justo lo que el tooltip existe para evitar.
  const largo = 'MARIA FERNANDA DE LOS ANGELES - GUTIERREZ HERNANDEZ'
  const u = nombreUsuario({ user_name: largo })
  assert.ok(u.texto.length <= 29, `quedó en ${u.texto.length}`)
  assert.ok(u.texto.endsWith('…'))
  assert.equal(u.completo, 'MARIA FERNANDA DE LOS ANGELES GUTIERREZ HERNANDEZ')
  assert.equal(u.identificado, true)
})

test('una cuenta generica igual se muestra', () => {
  // "Admin - Punto+" y "BADOO - EXTREME" no son personas, son cuentas del
  // comercio. Igual sirven: distinguen quién escribió dentro de un comercio.
  assert.equal(nombreUsuario({ user_name: 'Admin - Punto+' }).texto, 'Admin Punto+')
})

test('colapsa espacios de mas', () => {
  assert.equal(nombreUsuario({ user_name: '  Luis   Carlos  -  Pérez  ' }).texto, 'Luis Carlos Pérez')
})

// ── El render real de la fila de chat ───────────────────────────────────────
import { convRows } from '../js/admin-bot-analytics.js'

const chat = extra => ({
  id: 'a', started_at: '2026-11-05T15:00:00Z', first_user_msg: 'hola',
  cat: 'Inventario', account_id: '9548', business_name: 'FERRETERIA ORSA', ...extra,
})

test('la fila de chat pinta el nombre del usuario', () => {
  const html = convRows([chat({ user_name: 'Adriana - Lopez' })])
  assert.ok(html.includes('Adriana Lopez'), 'falta el nombre normalizado')
  assert.ok(!html.includes('Adriana - Lopez'), 'pintó el guion crudo de Bold')
})

test('sin nombre, la fila no pinta un hueco con icono', () => {
  const html = convRows([chat({ user_name: null })])
  assert.ok(!html.includes('👤'), 'pintó el icono sin nombre detrás')
  assert.ok(html.includes('FERRETERIA ORSA'), 'y el comercio tiene que seguir ahí')
})

test('el nombre se pinta tambien en Chats Comercios', () => {
  // Ahí el comercio es el encabezado del grupo y no se repite en la fila, pero
  // CUÁL de sus usuarios escribió sigue siendo dato nuevo.
  const html = convRows([chat({ user_name: 'Andre - Sierra' })], { mostrarComercio: false })
  assert.ok(!html.includes('FERRETERIA ORSA'), 'repitió el comercio')
  assert.ok(html.includes('Andre Sierra'), 'falta el usuario')
})

test('el nombre viene de FUERA y se escapa', () => {
  // Llega por postMessage desde el POS. bold-context.js le saca los caracteres
  // de control, pero no el HTML: escaparlo es responsabilidad de quien pinta.
  const html = convRows([chat({ user_name: '<img src=x onerror=alert(1)>' })])
  assert.ok(!html.includes('<img'), 'inyectó HTML crudo en el panel')
  assert.ok(html.includes('&lt;img'), 'debería estar escapado')
})
