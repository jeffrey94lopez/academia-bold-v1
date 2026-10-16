# Abrir una lección de la academia desde Bold POS

**Para:** equipo de Bold POS (MFE de Ayuda, componente `pos-help-window`)
**Objetivo:** que un botón dentro del POS abra una lección concreta de la
academia **dentro del mismo iframe de Ayuda**, sin recargarlo y sin salir a otra
página.

## Qué tienen que hacer

Mandar un `postMessage` al iframe de la academia:

```js
iframe.contentWindow.postMessage(
  { type: 'bold:open-lesson', slug: 'asociar-la-resolucion-de-facturacion' },
  'https://academia.localizadoc.com'   // targetOrigin: siempre este, nunca '*'
)
```

Eso es todo el contrato. Un solo campo, `slug`.

- **`type`**: exactamente `bold:open-lesson`.
- **`slug`**: el identificador de la lección. Solo minúsculas, dígitos y guiones
  (`a-z`, `0-9`, `-`). Máximo 160 caracteres. Lo que no cumpla se ignora.
- La lista de slugs está en `docs/links-lecciones.md` (se la pasamos aparte).
  Cada lección ya pertenece a una vertical y plataforma; la academia cambia sola
  a la que corresponde.

## Cuándo mandarlo (esto es lo que más importa)

El iframe se crea al hacer clic en Ayuda, y **un mensaje enviado antes de que
cargue se pierde**. Es el mismo problema que tuvo `bold:context`: si se llama
`postMessage` justo después de crear el iframe, la ventana destino todavía es
`about:blank` y el navegador descarta el mensaje con el error "no coincide con el
origen de la ventana del destinatario".

Hay dos casos:

**1. El iframe todavía no existe (el usuario aún no abrió Ayuda).** Guarden el
slug, creen el iframe y manden el mensaje **cuando la academia avise que está
lista**. La academia manda `{ type: 'academia:ready', v: 1 }` al padre; respondan
a esa ventana con `e.source`:

```js
let slugPendiente = null

window.addEventListener('message', e => {
  if (e.origin !== 'https://academia.localizadoc.com') return
  if (e.data?.type !== 'academia:ready') return
  // Mismo handler que ya usan para bold:context:
  e.source.postMessage(contextoBold, e.origin)
  if (slugPendiente) {
    e.source.postMessage({ type: 'bold:open-lesson', slug: slugPendiente }, e.origin)
    slugPendiente = null
  }
})

function abrirLeccion(slug) {
  slugPendiente = slug
  abrirVentanaAyuda()        // crea el iframe si no existe
}
```

**2. El iframe ya está abierto y cargado.** Manden el mensaje directo, sin
esperar nada:

```js
iframe.contentWindow.postMessage(
  { type: 'bold:open-lesson', slug }, 'https://academia.localizadoc.com')
```

Si no están seguros de cuál caso es, el flujo del caso 1 sirve para los dos: si
el iframe ya estaba abierto, no habrá nuevo `academia:ready`, así que en ese caso
hay que mandarlo directo (caso 2).

## Qué NO hace falta

- No hay que mandar token, cuenta ni datos del usuario en este mensaje. Solo el
  slug.
- No hay que cambiar el `src` del iframe ni recargarlo.
- No hay que mandar `bold:context` otra vez: sigue funcionando igual.

## Seguridad

La academia solo acepta este mensaje si viene de `https://pos.bold.co` o
`https://pos.stg.bold.co`. Cualquier otro origen se ignora. Por eso el
`targetOrigin` y el origen del mensaje tienen que ser exactamente esos.

## Cómo probarlo

1. Abran el POS, abran Ayuda y esperen a que cargue la academia.
2. En la consola del POS (no la del iframe), ejecuten:

```js
document.querySelector('iframe.pos-help-window__iframe')
  .contentWindow.postMessage(
    { type: 'bold:open-lesson', slug: 'asociar-la-resolucion-de-facturacion' },
    'https://academia.localizadoc.com')
```

3. **Resultado esperado:** la academia abre la lección "Asociar la resolución de
   facturación" sin recargar la página.
4. Si el slug no existe, la academia no hace nada y deja un aviso en la consola
   del iframe (`[bold:open-lesson] Lección no encontrada`). No rompe.

## Criterio de aceptación

- Un botón del POS abre la lección correcta con Ayuda **cerrada** (caso 1).
- El mismo botón abre la lección correcta con Ayuda **ya abierta** (caso 2).
- No aparecen errores de `postMessage` en la consola del POS al hacerlo.

## Alternativa mientras tanto

Si prefieren no implementar el mensaje, funciona hoy sin cambios nuestros poner
el slug en el `src` del iframe:
`https://academia.localizadoc.com/?leccion=<slug>`. El iframe recarga con la
lección abierta; el usuario no sale del POS.
