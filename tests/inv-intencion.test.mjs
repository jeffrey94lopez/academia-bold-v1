import test from 'node:test'
import assert from 'node:assert/strict'
import { esIntencionInventario } from '../js/inv-intencion.js'
import { PREGUNTAS_AL_BOT, slugLeccion } from '../js/inv-camino.js'

test('habla de cargar el inventario en bloque', () => {
  for (const t of [
    'Quiero subir mi inventario', 'como cargo mis productos?', '¿Cómo importo los items de Alegra?',
    'necesito migrar mi inventario de siigo', 'tengo un excel con mis productos, como lo paso a bold',
    'me dan la plantilla de items?', 'importación masiva de productos', 'pasar mi catálogo a Bold POS',
  ]) assert.equal(esIntencionInventario(t), true, t)
})

test('habla de crear productos uno por uno', () => {
  for (const t of [
    'como creo un producto', 'cómo agrego un artículo', 'quiero registrar mis productos', 'como creo un item',
    'creación de ítems de forma individual', 'cómo meto mis productos a Bold', 'necesito crear los productos de mi tienda',
    'creación masiva de ítems',
  ]) assert.equal(esIntencionInventario(t), true, t)
})

test('otros temas con palabras parecidas no disparan la pregunta', () => {
  for (const t of [
    'cómo hago una venta', 'como subir una factura', 'paso a paso para vender productos',
    'quiero ver mi inventario', 'hola', '', 'como cambio el precio de un item',
    'como hago un ajuste de inventario', 'crear variantes de un producto', 'configurar la lista de precios',
    'me sale error al subir mi inventario', 'registrar una compra de productos', 'agregar un cliente',
    'como creo una categoria', 'como creo un usuario',
  ]) assert.equal(esIntencionInventario(t), false, t)
})

test('mensajes largos se dejan al bot', () => {
  assert.equal(esIntencionInventario('quiero subir mi inventario '.repeat(20)), false)
})

test('cada camino con lección tiene su pregunta detallada y su lección por vertical', () => {
  for (const c of ['individual', 'masivo']) {
    assert.match(PREGUNTAS_AL_BOT[c], /paso a paso, con todo el detalle/)
    assert.ok(slugLeccion(c, 'retail'))
    assert.match(slugLeccion(c, 'restaurantes'), /-2$/)
    assert.equal(slugLeccion(c, null), slugLeccion(c, 'retail'))
  }
  assert.equal(slugLeccion('herramienta', 'retail'), null)
})
