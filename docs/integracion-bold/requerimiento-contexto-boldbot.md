# Requerimiento para desarrolladores de Bold POS — pasar el contexto del comercio a BoldBot (id, vertical y usuario)

**Producto:** BoldBot POS (asistente + academia embebida en el menú *Ayuda*)
**Origen de BoldBot:** `https://academia.localizadoc.com`
**Fecha:** 2026-08-19

## Objetivo

Hoy el iframe de la Academia se carga **sin ningún dato** del comercio logueado,
y por el aislamiento de orígenes del navegador BoldBot no puede leer nada de
`pos.bold.co`. Necesitamos que Bold nos envíe el contexto del comercio para
mostrar automáticamente la vertical correcta y reconocer al comercio (sin que el
usuario configure nada).

## 1. Datos que solicitamos

| Campo               | Descripción                              | Fuente en Bold                 |
|---------------------|------------------------------------------|--------------------------------|
| **ID de cuenta**    | Identificador único del comercio         | claim `sub` del JWT de sesión  |
| **Vertical**        | Tipo de negocio (retail / restaurante)   | claim `business_type` del JWT  |
| **Nombre del negocio** | Razón social / nombre comercial       | perfil de cuenta               |
| **Usuario**         | Nombre y correo de quién abrió la sesión | perfil de usuario              |

**No necesitamos el token de sesión del POS.** Solo estos cuatro datos como
texto plano. No son credenciales.

## 2. Cómo entregarlo — postMessage (recomendado)

Al mostrar el iframe de Ayuda, envían un `postMessage` a nuestro origen con los
datos. El origen destino debe ser explícito, nunca `'*'`.

```ts
// lado Bold — en el componente pos-help-window, tras el load del iframe
const ACADEMIA_ORIGIN = 'https://academia.localizadoc.com';

@ViewChild('academiaFrame') academiaFrame!: ElementRef<HTMLIFrameElement>;

onAcademiaLoad() {
  this.academiaFrame.nativeElement.contentWindow?.postMessage({
    type: 'bold:context',
    accountId:    7993,              // sub del JWT
    businessType: 'retail',          // business_type del JWT
    businessName: 'accionahn',       // del perfil de cuenta
    user: {
      name:  'Jeffrey Martínez',     // del perfil de usuario
      email: 'correo@comercio.com'
    }
  }, ACADEMIA_ORIGIN);
}
```

> Importante: leer los valores **en vivo**. Si se dejan literales, todos los
> comercios llegarían con el mismo dato.

Nosotros lo recibimos validando estrictamente el origen:

```js
// lado BoldBot
window.addEventListener('message', (e) => {
  if (e.origin !== 'https://pos.bold.co') return;  // el navegador fija e.origin: no es falsificable
  if (e.data?.type === 'bold:context') aplicarContexto(e.data);
});
```

Si el usuario cambia de comercio/sucursal sin recargar el iframe, reenviar el
mensaje con el nuevo dato (ideal, no bloqueante).

## 3. Alternativa — parámetros en la URL

Si el `postMessage` no es viable, anexar los datos al `src` del iframe:

```
https://academia.localizadoc.com/?accountId=7993&v=retail&biz=accionahn&email=correo%40comercio.com
```

Desventaja: los datos (incluido el correo) quedan en URL, historial y logs. Por
eso preferimos el `postMessage`.

## 4. Seguridad

- **Origen validado:** solo aceptamos mensajes de `https://pos.bold.co`.
  `e.origin` lo fija el navegador y no es falsificable.
- **Sin credenciales:** no se envía el token de sesión, solo los cuatro campos.

## 5. Confirmaciones que necesitamos de ustedes

1. **Vertical:** ¿qué string envía `business_type` para restaurantes?
   (`restaurant` / `restaurante`). Retail lo asumimos `retail`. Toleramos
   mayúsculas/minúsculas.
2. **Usuario:** ¿pueden incluir el correo? ¿el ID de usuario es el mismo `sub`
   de la cuenta, o distinto cuando hay varios usuarios por comercio?
3. **Cambio de comercio:** ¿pueden reenviar el mensaje al cambiar de sucursal sin
   recargar el iframe?

## 6. Impacto para ustedes

- `postMessage`: ~10 líneas en el componente `pos-help-window` (ya existente).
- URL: 1 línea (construir el `src` con los parámetros).
- Sin cambios de backend. No exponen el token.

**Nuestro origen (para `targetOrigin`):** `https://academia.localizadoc.com`
