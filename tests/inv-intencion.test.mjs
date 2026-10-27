import test from 'node:test'
import assert from 'node:assert/strict'
import { esIntencionInventario } from '../js/inv-intencion.js'

test('pide cargar el inventario', () => {
  for (const t of [
    'Quiero subir mi inventario', 'como cargo mis productos?', '¿Cómo importo los items de Alegra?',
    'necesito migrar mi inventario de siigo', 'tengo un excel con mis productos, como lo paso a bold',
    'me dan la plantilla de items?', 'importación masiva de productos', 'pasar mi catálogo a Bold POS',
  ]) assert.equal(esIntencionInventario(t), true, t)
})

test('dudas de uso normales no disparan el conversor', () => {
  for (const t of [
    'como creo un producto', 'cómo hago una venta', 'como subir una factura', 'paso a paso para vender productos',
    'quiero ver mi inventario', 'hola', '', 'como cambio el precio de un item',
  ]) assert.equal(esIntencionInventario(t), false, t)
})

test('mensajes largos se dejan al bot', () => {
  assert.equal(esIntencionInventario('quiero subir mi inventario '.repeat(20)), false)
})
