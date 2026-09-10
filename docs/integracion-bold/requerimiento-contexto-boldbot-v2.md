# Requerimiento técnico — Pasar el contexto del comercio a BoldBot

**Versión 2 (detallada) · 2026-09-09**

**Para:** equipo de desarrollo de Bold POS

**De:** equipo de BoldBot POS — Academia Oficial de Bold POS

**Reemplaza a:** «Requerimiento-Contexto-BoldBot» del 2026-08-19 (mismo pedido, explicado paso a paso)

**Etapa:** 2 de 3. **No** es el requerimiento del JWT — ese es otro documento y va después.

---

## 0. Resumen en 30 segundos

Hoy el iframe de la Academia que ustedes embeben en el menú **Ayuda** se carga sin
saber quién es el comercio. Necesitamos que, al abrirlo, le envíen **cuatro datos
de texto plano** por `postMessage`.

> **El cambio son ~12 líneas en un solo componente que ustedes ya tienen
> (`pos-help-window`). No hay cambios de backend, no hay que firmar nada, y no
> nos tienen que dar ninguna credencial.**

```ts
this.iframe.nativeElement.contentWindow.postMessage({
  type: 'bold:context',
  accountId:    <ID de cuenta>,
  businessType: <vertical>,
  businessName: <nombre del comercio>,
  platform:     'web',
  user: { name: <nombre>, email: <correo> }
}, 'https://academia.localizadoc.com');
```

Y para que no quede duda de si quedó bien, publicamos una página que lo verifica
en pantalla: **https://academia.localizadoc.com/embed-test.html** (ver §6).

---

## 1. Contexto: qué es esto y dónde está hoy

BoldBot POS es la academia + asistente que Bold muestra dentro del POS. Lo
inspeccionamos desde el navegador el 2026-08-19 en una cuenta real:

- Menú **Ayuda** → componente `pos-help-window`.
- Dentro hay: `<iframe class="pos-help-window__iframe" src="https://academia.localizadoc.com">`.
- Ese `src` va **pelado**: sin query params, sin `sandbox`, sin `referrerpolicy`.

Como `pos.bold.co` y `academia.localizadoc.com` son **orígenes distintos**, el
navegador nos aísla por completo: desde adentro del iframe no podemos leer nada
de la página que nos contiene (ni cookies, ni `localStorage`, ni el DOM). Eso es
correcto y no queremos cambiarlo. La única forma de que sepamos quién está del
otro lado es que **ustedes nos lo digan explícitamente**.

---

## 2. El problema que resuelve

| Hoy | Con el cambio |
|---|---|
| Un restaurante abre Ayuda y ve, por defecto, las lecciones de **Retail**. Tiene que cambiar la vertical a mano. | Ve directamente las lecciones de **Restaurantes**. |
| El asistente saluda genérico y no sabe de qué negocio le hablan. | Saluda por el nombre del comercio y responde con el contexto de su vertical. |
| Si un comercio escribe al bot y hay que darle seguimiento, no sabemos qué cuenta es. | La conversación queda ligada al `accountId` de Bold. |
| Un usuario del POS móvil ve lecciones con capturas de la versión web. | Ve las lecciones de su plataforma. |

Todo esto ya está construido de nuestro lado (el portal filtra por vertical y por
plataforma). Lo único que falta es el dato de entrada.

---

## 3. Los datos que pedimos

| # | Campo | Obligatorio | Tipo | De dónde lo sacan ustedes |
|---|---|---|---|---|
| 1 | `accountId` | **Sí** | número o texto | Claim `sub` del JWT de sesión del POS |
| 2 | `businessType` | **Sí** | texto | Claim `business_type` del JWT de sesión |
| 3 | `businessName` | Recomendado | texto | Perfil de la cuenta |
| 4 | `platform` | Recomendado | `"web"` \| `"mobile"` | Ustedes ya saben en qué build corre |
| 5 | `user.email` | Recomendado | texto | Perfil del usuario logueado |
| 6 | `user.name` | Opcional | texto | Perfil del usuario logueado |
| 7 | `user.id` | Opcional | número o texto | Solo si difiere de `accountId` |

Notas:

- **`businessType`**: lo mapeamos a nuestras verticales. Ya toleramos
  `retail`, `store`, `tienda` → *Retail*, y `restaurant`, `restaurante`,
  `restaurants` → *Restaurantes*, en mayúsculas o minúsculas. **Si su string es
  otro, díganlo y lo agregamos** (no hace falta que lo cambien ustedes).
- **`platform`**: es el campo nuevo respecto a la versión anterior del documento.
  Nuestras lecciones están separadas por Web y Mobile.
- Si un campo recomendado no lo pueden mandar, **manden el resto igual**. El
  portal funciona con los dos obligatorios; los demás mejoran la experiencia.

---

## 4. Qué NO les estamos pidiendo

Esto es importante porque en la conversación anterior quedó la duda. Lo decimos
en negativo, campo por campo:

- ❌ **No** queremos el token de sesión del POS (`localStorage.token`). Sabemos
  que existe y que es un JWT de ~14 meses de vida; justamente por eso **no lo
  queremos**: es una credencial de larga duración y no queremos custodiarla.
  Nuestra página de prueba marca en rojo si nos lo mandan por error.
- ❌ **No** queremos cookies, ni `Authorization` headers, ni acceso a su API.
- ❌ **No** queremos datos de pago, montos, ventas, tarjetas ni PAN.
- ❌ **No** pedimos que quiten el aislamiento de orígenes, ni CORS, ni
  `allow-same-origin`, ni ningún permiso del iframe.
- ❌ **No** pedimos cambios en su backend, ni en su API, ni firmar nada.

Lo que pedimos son **cuatro datos de identificación de negocio**, del mismo tipo
que ya viaja hoy en cualquier chat de soporte cuando el comercio escribe.

> El pedido de un **JWT firmado** es un documento aparte (Etapa 3), para cuando
> BoldBot deba responder preguntas con datos reales de la cuenta
> («¿cuánto vendí esta semana?»). **Ese no es este documento.** Si al leer esto
> alguien recordó «nos estaban pidiendo un token», es porque está pensando en el
> otro. Este pedido no tiene nada firmado ni ninguna credencial.

---

## 5. Implementación, paso a paso

### 5.1 Dónde va el cambio

Un solo componente: el que ya contiene el iframe de Ayuda.

- Nombre observado desde el navegador: **`pos-help-window`**
  (clase CSS del iframe: `pos-help-window__iframe`).
- En un proyecto Angular estándar eso corresponde a
  `pos-help-window.component.ts` + `pos-help-window.component.html`.
- Por los microfrontends que vimos (`mfe.core.bold.co`, `mfe.retail.bold.co`,
  `mfe.restaurant.bold.co`), lo más probable es que viva en el MFE core.
- **Si en su repo está en otra ruta, no importa: es el único archivo a tocar.**
  El criterio para encontrarlo es: buscar en el código
  `academia.localizadoc.com` o `pos-help-window`.

### 5.2 Paso 1 — Tener una referencia al iframe

En el template, marcar el iframe:

```html
<!-- pos-help-window.component.html -->
<iframe #academiaFrame
        class="pos-help-window__iframe"
        src="https://academia.localizadoc.com"></iframe>
```

En el componente:

```ts
@ViewChild('academiaFrame') academiaFrame!: ElementRef<HTMLIFrameElement>;
```

### 5.3 Paso 2 — Esperar a que la Academia avise que está lista (*handshake*)

Este paso es el que evita el error más común: **mandar el mensaje antes de que el
iframe tenga listener y que se pierda**. Nuestra página, apenas carga, le manda a
su contenedor:

```js
{ type: 'academia:ready', v: 1 }
```

y lo repite cada 2 segundos por unos 10 segundos, por si su listener se registra
tarde (la página de prueba de §6 insiste 30 segundos). Ustedes solo tienen que
responder a ese mensaje.

### 5.4 Paso 3 — Construir el payload con datos **en vivo**

```ts
private buildContext() {
  const s = this.session;                 // <-- su store/servicio de sesión real
  return {
    type: 'bold:context',
    accountId:    s.accountId,            // claim sub
    businessType: s.businessType,         // claim business_type
    businessName: s.businessName,
    platform:     'web',                  // o 'mobile' en el build móvil
    user: { name: s.userName, email: s.userEmail }
  };
}
```

> ⚠️ **El error #1 en integraciones así**: dejar los valores de ejemplo
> literales (`7993`, `'accionahn'`). Todos los comercios llegarían iguales y no
> serviría de nada. Nuestra página de prueba **detecta y marca en amarillo** si
> llegan los valores de ejemplo de este documento.

### 5.5 Paso 4 — Enviarlo con destino explícito

```ts
frame.contentWindow?.postMessage(payload, 'https://academia.localizadoc.com');
```

El segundo parámetro (`targetOrigin`) es obligatorio para nosotros: **nunca
`'*'`**. Con el origen explícito, el navegador **no entrega** el mensaje si en ese
iframe hay cargada una página de otro dominio. Es la garantía de que el dato solo
puede llegarnos a nosotros.

### 5.6 Código completo — Angular (copiar y pegar)

```ts
import { Component, ElementRef, ViewChild, HostListener } from '@angular/core';

const ACADEMIA_ORIGIN = 'https://academia.localizadoc.com';

@Component({ selector: 'pos-help-window', templateUrl: './pos-help-window.component.html' })
export class PosHelpWindowComponent {
  @ViewChild('academiaFrame') academiaFrame!: ElementRef<HTMLIFrameElement>;

  // 1) La Academia avisa que está lista; recién ahí mandamos el contexto.
  @HostListener('window:message', ['$event'])
  onMessage(e: MessageEvent) {
    if (e.origin !== ACADEMIA_ORIGIN) return;        // validar SIEMPRE el origen
    if (e.data?.type === 'academia:ready') this.sendContext();
  }

  // 2) Y por si acaso, también al terminar de cargar el iframe.
  onIframeLoad() { this.sendContext(); }

  private sendContext() {
    const s = this.session;                          // su servicio de sesión
    this.academiaFrame?.nativeElement?.contentWindow?.postMessage({
      type: 'bold:context',
      v: 1,
      accountId:    s.accountId,                     // claim sub del JWT
      businessType: s.businessType,                  // claim business_type
      businessName: s.businessName,
      platform:     'web',
      user: { id: s.userId, name: s.userName, email: s.userEmail }
    }, ACADEMIA_ORIGIN);                             // destino explícito, nunca '*'
  }
}
```

```html
<iframe #academiaFrame
        class="pos-help-window__iframe"
        src="https://academia.localizadoc.com"
        (load)="onIframeLoad()"></iframe>
```

Mandar el mensaje **dos veces (en `academia:ready` y en `load`) no es un
problema**: nosotros aplicamos el último que llega y es idempotente.

### 5.7 Versión en JavaScript puro (si el MFE de ayuda no es Angular)

```js
const ACADEMIA_ORIGIN = 'https://academia.localizadoc.com';
const frame = document.querySelector('iframe.pos-help-window__iframe');

function sendContext() {
  frame.contentWindow.postMessage({
    type: 'bold:context', v: 1,
    accountId: session.accountId,
    businessType: session.businessType,
    businessName: session.businessName,
    platform: 'web',
    user: { name: session.userName, email: session.userEmail }
  }, ACADEMIA_ORIGIN);
}

window.addEventListener('message', e => {
  if (e.origin !== ACADEMIA_ORIGIN) return;
  if (e.data && e.data.type === 'academia:ready') sendContext();
});
frame.addEventListener('load', sendContext);
```

### 5.8 Alternativa mínima (si `postMessage` no es viable)

Anexar los datos al `src` del iframe. Es **una línea**, pero la preferimos menos:

```
https://academia.localizadoc.com/?accountId=7993&v=retail&biz=accionahn&plat=web
```

Contras: los valores quedan en la URL, en el historial y en los logs del CDN. Por
eso, si van por esta vía, **no incluyan el correo del usuario**; manden solo
`accountId`, vertical y plataforma. Lo aceptamos como plan B.

### 5.9 Errores comunes (los cuatro que hemos visto en integraciones así)

1. Usar `'*'` como `targetOrigin` → funciona, pero lo rechazamos en revisión de
   seguridad. Usen el origen explícito.
2. Mandar el mensaje antes de que el iframe cargue → se pierde en silencio. Por
   eso está el handshake de §5.3.
3. Dejar los valores de ejemplo literales → todos los comercios llegan iguales.
4. Mandarlo solo una vez: si el usuario **cambia de sucursal o de comercio sin
   recargar**, reenvíen el mensaje con el dato nuevo. Ideal, no bloqueante.

---

## 6. Cómo verificar que quedó bien (sin preguntarnos)

Publicamos una página de diagnóstico, pensada solo para ustedes:

**https://academia.localizadoc.com/embed-test.html**

Muestra en pantalla: si el mensaje llegó, desde qué origen, y una tabla campo por
campo con ✓ / ! / ✗ y la razón. Tres formas de usarla, de menor a mayor esfuerzo:

### A. Sin tocar una línea de código (30 segundos)

1. Abrir `https://pos.bold.co` con una cuenta real y entrar al menú **Ayuda**.
2. Abrir la consola del navegador (F12).
3. Pegar el snippet que la propia página de prueba trae con un botón
   **«Copiar snippet»**. Ese snippet cambia el iframe a la página de prueba, lee
   el `sub` y el `business_type` del token de sesión real, y manda el
   `postMessage`.
   > Si Chrome bloquea el pegado («Warning: Don't paste code into the DevTools
   > Console…»), escriban `allow pasting` en la consola y Enter. Es la protección
   > del navegador contra código pegado a ciegas y se pide una sola vez por
   > perfil. El snippet no hace ninguna petición de red: lee el token de sesión
   > **sin sacarlo del navegador** y solo hace un `postMessage` al iframe.
4. Mirar el iframe: debe quedar el banner verde **«Contexto recibido y válido»**.

Esto sirve para **confirmar que el mecanismo funciona en su entorno real antes de
escribir el código definitivo**, y para ver con qué string exacto llega
`business_type` en una cuenta de restaurante.

### B. En su ambiente de desarrollo

Cambiar temporalmente el `src` del iframe a
`https://academia.localizadoc.com/embed-test.html`, implementar §5.6, y ver el
banner. Cuando esté verde, devolver el `src` al original.

### C. En producción

Con el `src` normal, el portal usa el dato y filtra la vertical solo. Si algo no
llega, degradamos al comportamiento actual (ver §7.5): nada se rompe.

> **Nuestro lado ya está listo (2026-09-09).** El portal escucha el mensaje,
> aplica vertical y plataforma, y saluda por nombre. No hace falta que nos
> avisen ni coordinar un despliegue: el día que ustedes manden el
> `postMessage`, empieza a funcionar.

> La página trae un botón **«Copiar diagnóstico»** que copia un JSON con lo que
> llegó. Si algo no cuadra, mándennos ese JSON y lo resolvemos en minutos.

---

## 7. Seguridad — el análisis completo

Esta sección responde a la duda que quedó abierta. Va en detalle.

### 7.1 Qué información sale de Bold

Cuatro campos de identificación de negocio: un ID de cuenta, el tipo de negocio,
el nombre comercial y —opcionalmente— nombre y correo del usuario. **Ninguno es
una credencial**: con ellos no se puede iniciar sesión, ni leer ventas, ni
llamar a la API de Bold, ni suplantar a nadie. Es la misma información que un
comercio escribe en el primer mensaje cuando pide soporte.

### 7.2 Por qué `postMessage` con `targetOrigin` explícito es seguro

`postMessage` es la API estándar del navegador para comunicación entre orígenes;
está diseñada exactamente para este caso. Dos propiedades relevantes:

1. **El destino se controla en el emisor.** Al pasar
   `'https://academia.localizadoc.com'` como segundo argumento, el navegador
   compara ese origen con el de la página cargada en el iframe **en el momento
   del envío**. Si no coincide, **no entrega el mensaje** y no hay forma de
   interceptarlo. Si mañana el iframe cargara otra cosa (un redirect, un
   secuestro de DNS, un cambio de proveedor), el mensaje simplemente no llega.
2. **El origen del emisor lo pone el navegador, no la página.** Cuando nosotros
   recibimos, leemos `event.origin`. Ese valor lo escribe el navegador y **no es
   falsificable desde JavaScript**. Por eso podemos descartar con seguridad
   cualquier mensaje que no venga de `https://pos.bold.co`.

Nuestro receptor:

```js
window.addEventListener('message', e => {
  if (e.origin !== 'https://pos.bold.co') return;   // el navegador fija e.origin
  if (e.data?.type === 'bold:context') aplicarContexto(e.data);
});
```

### 7.3 Modelo de amenaza, caso por caso

| Escenario | ¿Puede pasar? | Por qué |
|---|---|---|
| Otro sitio embebe la Academia y recibe el contexto de un comercio | **No** | El mensaje lo emite *el contenedor hacia su iframe*. Un tercero que nos embeba no tiene forma de emitir un mensaje con el contexto de un comercio de Bold: no tiene el dato. |
| Un script en la página del POS «escucha» el mensaje | Ya tendría acceso a todo | Cualquier script que corra en `pos.bold.co` ya lee el `localStorage.token`. Este mensaje no agrega superficie. |
| Un atacante nos manda un `bold:context` falso desde otro origen | Lo descartamos | Validamos `e.origin`, que el navegador fija. |
| Un atacante se pone en medio y lee el mensaje | **No** | `postMessage` no viaja por la red: es memoria del navegador, dentro de la misma pestaña. |
| El dato queda en logs / historial | **No** con `postMessage` | Sí pasaría con la alternativa de query params (§5.8): por eso la preferimos menos. |
| Alguien usa el `accountId` para consultar datos de ventas | **No** | No es una credencial. Consultar la API de Bold requiere autenticación de Bold, que no tenemos y no pedimos aquí. |
| El JWT de sesión del POS se filtra a un tercero | **No aplica** | No lo pedimos, no lo recibimos, no lo guardamos. |

### 7.4 Qué hacemos con los datos de nuestro lado

- Se usan **en el navegador del usuario** para elegir la vertical/plataforma y
  personalizar el saludo. Se guardan en `localStorage` del propio iframe.
- El `accountId` y el correo se asocian a la conversación del bot para poder dar
  seguimiento a un comercio que pidió ayuda. **No se venden, no se comparten con
  terceros, no se usan para marketing.**
- No enviamos el correo del usuario al modelo de lenguaje del asistente.
- El transporte es HTTPS con HSTS; el portal corre con Content-Security-Policy
  estricta (`script-src 'self'`, sin scripts inline).
- Si Bold nos pide borrar los datos de una cuenta, se borran.

### 7.5 Degradación: qué pasa si no llega el mensaje

Nada se rompe. Si el mensaje no llega, llega tarde o llega incompleto, el portal
se comporta **exactamente como hoy**: vertical por defecto y el usuario la puede
cambiar a mano. Es una mejora aditiva, sin riesgo de regresión para el POS.
Ustedes pueden apagarla en cualquier momento borrando el `postMessage`, sin
coordinar nada con nosotros.

### 7.6 Lo que ustedes controlan siempre

- **Qué campos mandan.** Si el correo del usuario no pasa su revisión de
  privacidad, mándenlo sin correo: con `accountId` + `businessType` ya
  resolvemos el 80% del valor.
- **Cuándo lo mandan.** Solo mientras el menú de Ayuda esté abierto.
- **A quién.** El `targetOrigin` es de ustedes; si cambian de proveedor, deja de
  llegar.

---

## 8. Criterio de aceptación

La integración está lista cuando, con una cuenta real:

- [ ] Al abrir el menú Ayuda, la Academia recibe un mensaje `bold:context` desde
      el origen `https://pos.bold.co`.
- [ ] `accountId` corresponde al comercio logueado (no un valor fijo).
- [ ] `businessType` corresponde a la vertical real (probado al menos en una
      cuenta de retail **y** una de restaurante).
- [ ] `platform` dice `web` en el POS web y `mobile` en la app.
- [ ] El `targetOrigin` del envío es `https://academia.localizadoc.com`
      (no `'*'`).
- [ ] La página `embed-test.html` muestra el banner verde.
- [ ] *(Deseable)* Al cambiar de comercio o sucursal sin recargar, se reenvía el
      mensaje.

---

## 9. Lo que necesitamos que nos confirmen

Cuatro respuestas cortas y arrancamos:

1. **Vertical**: ¿qué string exacto trae `business_type` en una cuenta de
   restaurante? (`restaurant` / `restaurante` / otro). Retail lo vimos como
   `retail`. *(Se puede responder en 1 minuto con el método de §6.A.)*
2. **Usuario**: ¿pueden incluir nombre y correo del usuario logueado? ¿`user.id`
   difiere de `sub` cuando hay varios usuarios por comercio?
3. **Plataforma**: ¿pueden distinguir en el payload si el POS corre en web o en
   la app móvil?
4. **Cambio de sucursal**: ¿pueden reenviar el mensaje cuando el usuario cambia
   de comercio/sucursal sin recargar el iframe?

Y si algo de este documento no se entiende o no comparten el enfoque:
**díganos qué parte** y la reescribimos o buscamos otra vía. La alternativa de
§5.8 (query params) sigue en pie.

---

## 10. Esfuerzo y responsables

| Tarea | Responsable | Estimación |
|---|---|---|
| Prueba exploratoria con el snippet de consola (§6.A) | Bold | 5 min |
| Implementar el `postMessage` en `pos-help-window` (§5.6) | Bold | ~1 hora |
| Verificar con `embed-test.html` (§6.B) | Bold | 15 min |
| Consumir el contexto y autofiltrar la vertical | BoldBot | ya en curso |
| Mapear el string de vertical que nos confirmen | BoldBot | 10 min |

Sin cambios de backend. Sin despliegue coordinado: cada lado puede salir a
producción por separado, en cualquier orden.

---

## Anexo A — Glosario (por si el documento lo lee alguien no técnico)

- **Origen**: la combinación de protocolo + dominio + puerto
  (`https://pos.bold.co`). El navegador aísla por completo lo que pasa en
  orígenes distintos.
- **iframe**: una página web mostrada dentro de otra. La Academia es un iframe
  dentro del POS.
- **`postMessage`**: la función estándar del navegador para que una página le
  pase un dato a otra de distinto origen. Es el mecanismo diseñado para esto.
- **`targetOrigin`**: el destinatario del `postMessage`. Si el iframe no es de
  ese origen, el navegador no entrega el mensaje.
- **Claim**: cada uno de los campos que vienen dentro de un JWT (`sub`,
  `business_type`, etc.).

## Anexo B — Contrato del mensaje

```jsonc
{
  "type": "bold:context",   // obligatorio, exactamente este string
  "v": 1,                   // opcional, versión del contrato
  "accountId": 7993,        // obligatorio · number | string
  "businessType": "retail", // obligatorio · string
  "businessName": "Mi Comercio S.A.",  // recomendado · string
  "platform": "web",        // recomendado · "web" | "mobile"
  "user": {                 // recomendado · object
    "id": 456,              // opcional
    "name": "Nombre Apellido",         // opcional
    "email": "correo@comercio.com"     // recomendado
  }
}
```

- Campos extra: los ignoramos (excepto los que parezcan credenciales, que
  reportamos como error).
- Si algún día cambia el contrato, subimos `v` y seguimos aceptando `v: 1`.

## Anexo C — Qué viene después (no es parte de este pedido)

**Etapa 3**: para que BoldBot pueda responder «¿cuánto vendí esta semana?» hará
falta una credencial verificable y una API de lectura de Bold. Eso está descrito
en el documento *Requerimiento-JWT-BoldBot*, y **depende de que esta Etapa 2 esté
resuelta primero**. Si prefieren no emitir un JWT firmado, existe la alternativa
de un token opaco con endpoint de introspección: nunca lo abrimos, se lo
devolvemos a ustedes para preguntar de quién es. Ese análisis va aparte.

---

**Contacto BoldBot** · soportetecnico@mpl.hn

**Origen de la Academia (para `targetOrigin`)**: `https://academia.localizadoc.com`

**Página de verificación**: `https://academia.localizadoc.com/embed-test.html`
