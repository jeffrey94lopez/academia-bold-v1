import test from 'node:test'
import assert from 'node:assert/strict'
import { armarPedido, validarRespuesta, resumenGrupos, huboCambios, LIMITES } from '../js/inv-ia.js'

const pedidoCat = armarPedido({ modo: 'categorias', categorias: ['Bebidas', 'BEBIDA FRIA', 'Aseo'] })
const respOk = { grupos: [
  { nombre: 'Bebidas', miembros: ['Bebidas', 'BEBIDA FRIA'] },
  { nombre: 'Aseo', miembros: ['Aseo'] },
] }

test('LIMITES', () => {
  assert.deepEqual(LIMITES, { maxElementos: 300, maxLargo: 80 })
})

test('armarPedido dedup y recorte', () => {
  const p = armarPedido({ modo: 'categorias', categorias: ['Bebidas', 'bebidas', 'x'.repeat(90)] })
  assert.deepEqual(p.categorias, ['Bebidas', 'x'.repeat(80)])
})

test('armarPedido > 300 → null', () => {
  const muchas = Array.from({ length: 301 }, (_, i) => 'c' + i)
  assert.equal(armarPedido({ modo: 'categorias', categorias: muchas }), null)
  assert.equal(armarPedido({ modo: 'categorias', categorias: ['a'], existentes: muchas }), null)
})

test('armarPedido lista principal vacía → null', () => {
  assert.equal(armarPedido({ modo: 'categorias', categorias: [] }), null)
  assert.equal(armarPedido({ modo: 'unidades', categorias: ['a'] }), null)
  assert.ok(armarPedido({ modo: 'unidades', unidades: ['UND'] }))
})

test('validarRespuesta categorias ok', () => {
  const r = validarRespuesta(pedidoCat, respOk)
  assert.equal(r.ok, true)
  assert.equal(r.mapeo['BEBIDA FRIA'], 'Bebidas')
  assert.equal(r.mapeo['Aseo'], 'Aseo')
})

test('validarRespuesta rechaza respuestas inválidas', () => {
  const malo = grupos => validarRespuesta(pedidoCat, { grupos })
  const inval = { ok: false, codigo: 'ia_respuesta_invalida' }
  assert.deepEqual(malo([{ nombre: 'Bebidas', miembros: ['Bebidas', 'BEBIDA FRIA'] }]), inval) // falta Aseo
  assert.deepEqual(malo([...respOk.grupos, { nombre: 'Aseo', miembros: ['Aseo'] }]), inval) // repetido
  assert.deepEqual(malo([...respOk.grupos, { nombre: 'Otra', miembros: ['Otra'] }]), inval) // desconocido
  assert.deepEqual(malo([{ nombre: 'Bebidas|frías', miembros: ['Bebidas', 'BEBIDA FRIA'] }, respOk.grupos[1]]), inval)
  assert.deepEqual(malo([{ nombre: '¡!', miembros: ['Bebidas', 'BEBIDA FRIA'] }, respOk.grupos[1]]), inval)
  assert.deepEqual(validarRespuesta(pedidoCat, {}), inval)
  assert.deepEqual(validarRespuesta(pedidoCat, null), inval)
})

test('categorias: nombre debe ser miembro o existente', () => {
  const p = armarPedido({ modo: 'categorias', categorias: ['Gaseosa', 'Soda'] })
  assert.equal(validarRespuesta(p, { grupos: [{ nombre: 'Refrescos', miembros: ['Gaseosa', 'Soda'] }] }).ok, false)
  assert.equal(validarRespuesta(p, { grupos: [{ nombre: 'Soda', miembros: ['Gaseosa', 'Soda'] }] }).ok, true)
})

test('existentes: dos en un grupo o nombre distinto se rechazan', () => {
  const p = armarPedido({ modo: 'categorias', categorias: ['Bebida', 'Gaseosa'], existentes: ['Bebidas', 'Refrescos'] })
  assert.equal(validarRespuesta(p, { grupos: [{ nombre: 'Bebidas', miembros: ['Bebidas', 'Refrescos', 'Bebida', 'Gaseosa'] }] }).ok, false)
  assert.equal(validarRespuesta(p, { grupos: [{ nombre: 'Bebida', miembros: ['Bebidas', 'Bebida'] }, { nombre: 'Gaseosa', miembros: ['Gaseosa'] }] }).ok, false)
  const r = validarRespuesta(p, { grupos: [{ nombre: 'Bebidas', miembros: ['Bebidas', 'Bebida'] }, { nombre: 'Gaseosa', miembros: ['Gaseosa'] }] })
  assert.equal(r.ok, true)
  assert.equal(r.mapeo['Bebida'], 'Bebidas')
})

test('simplificar acepta nombre nuevo', () => {
  const p = armarPedido({ modo: 'simplificar', categorias: ['Arroz', 'Frijol'] })
  const r = validarRespuesta(p, { grupos: [{ nombre: 'Abarrotes', miembros: ['Arroz', 'Frijol'] }] })
  assert.equal(r.ok, true)
  assert.equal(r.mapeo['Arroz'], 'Abarrotes')
})

test('unidades', () => {
  const p = armarPedido({ modo: 'unidades', unidades: ['UND', 'Kgs', 'Docena'] })
  const r = validarRespuesta(p, { unidades: { UND: 'Unidades', Kgs: 'Kilogramos', Docena: null } })
  assert.equal(r.ok, true)
  assert.deepEqual({ ...r.mapeo }, { UND: 'Unidades', Kgs: 'Kilogramos', Docena: null })
  assert.equal(validarRespuesta(p, { unidades: { UND: 'Cajas', Kgs: 'Kilogramos', Docena: null } }).ok, false)
  assert.equal(validarRespuesta(p, { unidades: { UND: 'Unidades', Kgs: 'Kilogramos' } }).ok, false)
})

test('resumenGrupos y huboCambios', () => {
  const { mapeo } = validarRespuesta(pedidoCat, respOk)
  assert.deepEqual(resumenGrupos(mapeo), [
    { nombre: 'Aseo', miembros: ['Aseo'], cambia: false },
    { nombre: 'Bebidas', miembros: ['Bebidas', 'BEBIDA FRIA'], cambia: true },
  ])
  assert.equal(huboCambios(mapeo), true)
  assert.equal(huboCambios({ Aseo: 'Aseo' }), false)
})

test('un miembro "__proto__" queda como clave propia del mapeo', () => {
  const pedido = armarPedido({ modo: 'categorias', categorias: ['__proto__', 'Aseo'] })
  const r = validarRespuesta(pedido, { grupos: [
    { nombre: 'Aseo', miembros: ['__proto__', 'Aseo'] },
  ] })
  assert.equal(r.ok, true)
  assert.equal(Object.hasOwn(r.mapeo, '__proto__'), true)
  assert.equal(r.mapeo['__proto__'], 'Aseo')
  assert.equal(huboCambios(r.mapeo), true)
  assert.ok(resumenGrupos(r.mapeo).length >= 1)
})

// ── Helpers de la conversación (Task 6) ──
import { firmaIA, filtrarMapeo, componerMapeos, corregirMapeo, cuantosQuedan } from '../js/inv-ia.js'

const nulo = o => Object.assign(Object.create(null), o)

test('firmaIA: igual para las mismas listas, distinta si cambia una', () => {
  const a = firmaIA({ categorias: ['A', 'B'], existentes: ['General'], unidades: ['UND'] })
  assert.equal(a, firmaIA({ categorias: ['A', 'B'], existentes: ['General'], unidades: ['UND'] }))
  assert.notEqual(a, firmaIA({ categorias: ['A', 'B'], existentes: ['General'], unidades: [] }))
  assert.notEqual(a, firmaIA({ categorias: ['A,B'], existentes: ['General'], unidades: ['UND'] }))
  assert.equal(firmaIA(), firmaIA({}))
})

test('filtrarMapeo deja solo las claves pedidas; las que faltan se quedan con su nombre', () => {
  const m = nulo({ Bebidas: 'Bebidas', 'BEBIDA FRIA': 'Bebidas', General: 'General' })
  const f = filtrarMapeo(m, ['BEBIDA FRIA', 'Bebidas', 'constructor', 'Otra'])
  assert.deepEqual({ ...f }, { 'BEBIDA FRIA': 'Bebidas', Bebidas: 'Bebidas', constructor: 'constructor', Otra: 'Otra' })
  assert.equal(Object.getPrototypeOf(f), null)
})

test('componerMapeos: canónica → grupo1 → grupo2', () => {
  const base = nulo({ 'BEBIDA FRIA': 'Bebidas', Bebidas: 'Bebidas', Jugos: 'Jugos', Aseo: 'Aseo' })
  const encima = nulo({ Bebidas: 'Líquidos', Jugos: 'Líquidos' })
  assert.deepEqual({ ...componerMapeos(base, encima) }, { 'BEBIDA FRIA': 'Líquidos', Bebidas: 'Líquidos', Jugos: 'Líquidos', Aseo: 'Aseo' })
  // Un grupo llamado como una propiedad de Object.prototype no rompe la búsqueda.
  assert.deepEqual({ ...componerMapeos(nulo({ x: 'constructor' }), nulo({})) }, { x: 'constructor' })
})

test('corregirMapeo: renombra (saneado) y saca miembros', () => {
  const m = nulo({ 'BEBIDA FRIA': 'Bebidas', Bebidas: 'Bebidas', Refrescos: 'Bebidas', Aseo: 'Aseo' })
  const c = corregirMapeo(m, { nombres: { Bebidas: '  Bebidas {frías}! ' }, sacados: ['Refrescos'] })
  assert.deepEqual({ ...c }, { 'BEBIDA FRIA': 'Bebidas frías', Bebidas: 'Bebidas frías', Refrescos: 'Refrescos', Aseo: 'Aseo' })
  // Nombre vacío tras sanear → se queda el original.
  assert.equal(corregirMapeo(m, { nombres: { Bebidas: '{}' } }).Bebidas, 'Bebidas')
  // Sin correcciones devuelve lo mismo.
  assert.deepEqual({ ...corregirMapeo(m) }, { ...m })
})

test('cuantosQuedan cuenta nombres finales distintos', () => {
  assert.equal(cuantosQuedan(nulo({ a: 'X', b: 'X', c: 'Y' })), 2)
  assert.equal(cuantosQuedan(nulo({})), 0)
})

test('validarRespuesta: nombre de grupo de más de 80 caracteres → inválida (simplificar)', () => {
  const p = armarPedido({ modo: 'simplificar', categorias: ['Cerveza', 'Vino'] })
  const nombre = 'L'.repeat(LIMITES.maxLargo)
  assert.equal(validarRespuesta(p, { grupos: [{ nombre, miembros: ['Cerveza', 'Vino'] }] }).ok, true)
  assert.equal(validarRespuesta(p, { grupos: [{ nombre: nombre + 'x', miembros: ['Cerveza', 'Vino'] }] }).ok, false)
})
