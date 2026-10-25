# Abrir el recorrido guiado de Academia Bold al crear una cuenta

**Para:** equipo de desarrollo de Bold POS

**De:** equipo de BoldBot POS — Academia Oficial de Bold POS

**Objetivo:** que, apenas un comercio termina de crear su cuenta por self
service, Bold le muestre un recorrido guiado interactivo (una práctica, no su
cuenta real) de las tareas básicas de Bold POS: crear un ítem, verlo en su
lista, hacer una venta, registrar un gasto y revisar sus historiales.

**Relacionado:** reutiliza el mismo mecanismo que ya tienen implementado para
Ayuda — el `bold:context` de `Requerimiento-Contexto-BoldBot-v2.docx` y el
handshake `academia:ready`. Si ya integraron eso, este documento agrega dos
mensajes nuevos y un momento nuevo para abrir un iframe.

---

## 0. Resumen en 30 segundos

Al terminar el registro self service, abran un **modal a pantalla completa**
con un iframe apuntando a:

```
https://academia.localizadoc.com/onboarding
```

Mándenle el `bold:context` de siempre cuando el iframe avise
`academia:ready` (igual que ya hacen en `pos-help-window`). El recorrido les
va a pedir dos cosas por `postMessage`, validando siempre `event.origin`:

```js
// El recorrido terminó, lo saltaron, o no aplica para su vertical → cierren el modal.
{ type: 'academia:onboarding-close', v: 1, reason: 'skip' | 'complete' | 'no_aplica' }

// El cliente terminó y quiere crear su primer producto de verdad → naveguen.
{ type: 'academia:navigate', v: 1, to: 'items' }
```

**No hay nada que Bold tenga que guardar.** El avance del recorrido vive en el
navegador del cliente, del lado de Academia.

---

## 1. Cuándo abrirlo

- **Disparador:** justo después de que el comercio termina de crear su cuenta
  por self service (el flujo de alta sin agente de ventas).
- **Solo retail, por ahora.** Restaurantes todavía no tiene su propio
  recorrido. Si pueden filtrar por `business_type` antes de abrir el modal,
  mejor. Si no pueden o no es fácil en ese punto del flujo, **no pasa nada**:
  el recorrido ya se autofiltra — si le llega `bold:context` con vertical
  restaurantes, muestra una pantalla corta "Pronto tendremos tu recorrido" y
  se cierra solo mandando `{ reason: 'no_aplica' }` (ver §3). Abrirlo sin
  filtrar es seguro, solo un poco menos prolijo.
- **Solo escritorio (web), no app móvil.** El recorrido replica las pantallas
  del POS web; en una pantalla angosta (celular) se ve apretado. La propia
  página ya detecta el ancho y muestra "Este recorrido se ve mejor en
  computador" con *Continuar igual* / *Saltar*, así que no tienen que medir
  nada ustedes — pero si su self service de la app móvil puede evitar
  abrirlo del todo, mejor.

No hace falta coordinar un horario ni un flag de rollout de nuestro lado: el
`/onboarding` ya está en producción. Pueden activarlo cuando les convenga.

---

## 2. Cómo abrirlo

Un modal propio de Bold, a pantalla completa, con un iframe adentro — igual
patrón que usan hoy para Ayuda (`pos-help-window`), pero en un modal en vez
de un panel lateral.

```html
<div class="bold-onboarding-modal">
  <iframe #onboardingFrame
          class="bold-onboarding-modal__iframe"
          src="https://academia.localizadoc.com/onboarding"
          title="Recorrido guiado de Bold POS"></iframe>
</div>
```

**Importante: el iframe tiene que vivir bajo `pos.bold.co`**, igual que el de
Ayuda — no lo abran como pestaña nueva ni como ventana aparte en nuestro
dominio. La razón es el avance guardado: el recorrido guarda el paso donde
va en el `localStorage` del navegador, y ese almacenamiento queda
particionado por el sitio que lo contiene. Si el modal corre bajo
`pos.bold.co`, el mismo avance lo puede leer después el iframe de Academia
que ustedes muestran en **Ayuda** (también bajo `pos.bold.co`), y ahí el
portal ofrece una tarjeta "Continúa tu recorrido" para retomarlo donde quedó.
Si el recorrido se abriera en una pestaña aparte de nuestro dominio, esa
tarjeta nunca vería el avance: para el navegador sería un almacenamiento
distinto.

El resto es responsabilidad suya: tamaño del modal, cómo se cierra
visualmente, overlay, foco, etc. Nosotros solo les avisamos *cuándo* cerrarlo
(§3).

---

## 3. El contexto del comercio (`bold:context`)

Es el mismo mecanismo que ya tienen para Ayuda, sin cambios. Apenas el
iframe del recorrido cargue, les va a mandar:

```js
{ type: 'academia:ready', v: 1 }
```

reintentándolo cada ~2 segundos por unos 10 segundos si todavía nadie
respondió. Respondan con el `bold:context` de siempre, al mismo iframe:

```js
onboardingFrame.contentWindow.postMessage({
  type: 'bold:context',
  v: 1,
  accountId:    session.accountId,
  businessType: session.businessType,   // 'retail' o 'restaurant'
  businessName: session.businessName,
  platform:     'web',
  user: { id: session.userId, name: session.userName, email: session.userEmail }
}, 'https://academia.localizadoc.com');
```

Si ya tienen este código para `pos-help-window`, es literalmente la misma
función apuntando a un iframe distinto. El campo que de verdad usa el
recorrido es `businessType`: con `restaurant`/`restaurante`/`restaurants`/
`food` muestra la pantalla "Pronto tendremos tu recorrido" y se cierra solo
(§1). Sin contexto, asume retail.

Detalle del contrato completo (campos, por qué `sub` puede o no ser el
comercio, seguridad): `Requerimiento-Contexto-BoldBot-v2.docx`. No lo
repetimos acá.

---

## 4. Los mensajes que tienen que escuchar

Dos tipos de mensaje, los dos salen del iframe hacia `window.parent`.
Instalen un listener en la ventana que contiene el modal:

```js
const ACADEMIA_ORIGIN = 'https://academia.localizadoc.com';

window.addEventListener('message', e => {
  if (e.origin !== ACADEMIA_ORIGIN) return;   // validar SIEMPRE, ver §5

  if (e.data?.type === 'academia:onboarding-close') {
    cerrarModalDeOnboarding();                // reason: 'skip' | 'complete' | 'no_aplica'
    return;
  }
  if (e.data?.type === 'academia:navigate' && e.data.to === 'items') {
    cerrarModalDeOnboarding();
    router.navigate(['/retail/inventory/item']);   // Ítems → Lista de ítems (la ruta real de ustedes)
  }
});
```

### 4.1 `academia:onboarding-close`

```jsonc
{ "type": "academia:onboarding-close", "v": 1, "reason": "skip" | "complete" | "no_aplica" }
```

**Qué hacer:** cerrar el modal. Eso es todo — no hace falta distinguir el
`reason` para cerrarlo (es el mismo cierre en los tres casos). Se los
mandamos por si quieren medir algo de su lado (por ejemplo, cuántos lo
saltan); no es obligatorio que lo usen.

- `'skip'`: el cliente tocó "Saltar recorrido" antes de terminar.
- `'complete'`: el cliente llegó al final y tocó el botón de cierre (sin
  pedir ir a Ítems — ver 4.2 para el caso en que sí lo pide).
- `'no_aplica'`: el comercio es de vertical restaurantes (§3); el recorrido
  se cerró solo sin que el cliente hiciera nada.

### 4.2 `academia:navigate`

```jsonc
{ "type": "academia:navigate", "v": 1, "to": "items" }
```

**Qué hacer:** cerrar el modal **y** llevar al cliente a **Ítems → Lista de
ítems**. Es lo que dispara el botón final del recorrido, "Crear mi primer
producto de verdad": el cliente acaba de practicar crear un ítem y queremos
que lo haga de verdad en su cuenta, en el lugar correcto. Hoy `to` solo vale
`'items'`; si agregamos otro destino más adelante, lo documentamos aparte.

> Si todavía no implementan este mensaje, el recorrido no se queda colgado:
> muestra "Ya puedes cerrar esta ventana. En tu Bold POS entra a Ítems → Lista
> de ítems para crear tu primer producto de verdad." El cliente lo puede
> hacer a mano, pero la experiencia es peor — por eso vale la pena
> implementarlo.

---

## 5. Seguridad — validar el origen

Antes de actuar sobre cualquiera de los dos mensajes, comparen
`event.origin` contra `https://academia.localizadoc.com` (exactamente ese
string, con un `===`). Es la misma regla que ya aplican para `bold:context`
y para `academia:ready`: el origen lo fija el navegador y no se puede
falsificar desde JavaScript, así que es la única verificación que hace falta.

Una diferencia respecto al `bold:context` que ustedes mandan: estos dos
mensajes los manda la Academia hacia *ustedes*, y para dirigirlos usamos el
origen del contenedor que el navegador expone
(`document.location.ancestorOrigins`). Ese dato no existe en todos los
navegadores (Firefox no lo expone); cuando falta, el recorrido manda el
mensaje con `targetOrigin: '*'` porque no tiene forma de saber el origen
exacto de antemano. Por eso **la validación tiene que estar de su lado,
leyendo `event.origin`** — no asuman que el mensaje solo pudo haber llegado
de un origen correcto porque nosotros usamos `'*'` en algunos navegadores.

---

## 6. Qué NO hace falta

- **No hay que guardar nada del lado de Bold.** Ni el paso donde va el
  cliente, ni si completó o saltó el recorrido, ni cuándo. Todo eso vive en
  el `localStorage` del navegador del cliente, del lado de Academia (por eso
  el iframe tiene que vivir bajo `pos.bold.co`, §2).
- **No hay que mandar ningún dato nuevo además de `bold:context`.** El
  recorrido no pide token, ni datos de ventas, ni nada de la cuenta real.
- **No hay que cambiar el `src` del iframe ni recargarlo** cuando llega
  `academia:onboarding-close` o `academia:navigate`: ambos mensajes piden
  cerrar el modal entero, no navegar *dentro* de él.
- **No hace falta mandar `?desde=ayuda` ni ningún otro parámetro en la
  URL.** `https://academia.localizadoc.com/onboarding`, pelado, es la URL
  completa. (Ese parámetro existe para un caso interno nuestro — cuando el
  propio portal de Academia, dentro de Ayuda, abre el recorrido navegando en
  el mismo iframe en vez de un modal — y no es algo que a ustedes les toque
  mandar.)

---

## 7. Cómo probarlo

**Staging ya está permitido de nuestro lado**: `pos.stg.bold.co` está en la
lista de orígenes que Academia acepta (la agregamos en 2026-10-02 porque ahí
prueban Bold, igual que para Ayuda). No hace falta que les habilitemos nada
nuevo.

1. En `pos.stg.bold.co`, completen el alta self service de una cuenta
   **retail** y disparen la apertura del modal (o ábranlo a mano apuntando el
   iframe a `https://academia.localizadoc.com/onboarding` — sí, la URL de
   **producción**: es la misma que ya usan para Ayuda desde staging).
2. Confirmen que el modal recibe el contexto: el recorrido debería arrancar
   ya filtrado a retail. Si quieren confirmar visualmente que el
   `bold:context` llegó bien, usen la misma página de diagnóstico que para
   Ayuda: `https://academia.localizadoc.com/embed-test.html`.
3. Toquen **Saltar recorrido** → el modal debe cerrarse al recibir
   `{ reason: 'skip' }`.
4. Vuelvan a abrirlo y complétenlo hasta el final → en la pantalla de cierre,
   toquen **Crear mi primer producto de verdad** → debe cerrarse el modal y
   navegar a Ítems → Lista de ítems (`{ to: 'items' }`).
5. *(Opcional)* con una cuenta de **restaurante**, abran el modal y
   confirmen que se cierra solo casi de inmediato con `{ reason: 'no_aplica' }`
   sin que el cliente haga nada.
6. *(Opcional)* abran la consola del navegador y verifiquen que no hay
   errores de `postMessage` (origen no coincide, etc.) al hacer los pasos
   2–5.

---

## 8. Checklist

- [ ] El modal a pantalla completa abre un iframe con
      `src="https://academia.localizadoc.com/onboarding"`, viviendo bajo
      `pos.bold.co` (no en pestaña ni dominio aparte).
- [ ] Se dispara justo al terminar el alta self service de una cuenta retail.
- [ ] Responden al `academia:ready` con el `bold:context` de siempre, con
      `targetOrigin` explícito (`https://academia.localizadoc.com`, nunca
      `'*'`).
- [ ] Escuchan `academia:onboarding-close` y cierran el modal.
- [ ] Escuchan `academia:navigate` con `to: 'items'`, cierran el modal y
      navegan a Ítems → Lista de ítems.
- [ ] Validan `event.origin === 'https://academia.localizadoc.com'` antes de
      actuar sobre cualquiera de los dos mensajes.
- [ ] Probado en `pos.stg.bold.co`: saltar, completar + ir a ítems, y
      (opcional) una cuenta de restaurante.

---

## 9. Esfuerzo y responsables

| Tarea | Responsable | Estimación |
|---|---|---|
| Abrir el modal al terminar el alta self service | Bold | — |
| Reenviar `bold:context` al nuevo iframe (ya lo hacen para Ayuda) | Bold | ~15 min si reutilizan la función existente |
| Escuchar `academia:onboarding-close` y `academia:navigate` | Bold | ~30 min |
| Probar en staging (§7) | Bold | ~15 min |
| Recorrido, filtro por vertical y por ancho de pantalla | BoldBot | ya en producción |

Sin cambios de backend. Sin datos que Bold tenga que persistir.

---

**Contacto BoldBot** · soportetecnico@mpl.hn

**Origen de la Academia (para `targetOrigin` y para validar `event.origin`)**: `https://academia.localizadoc.com`

**URL del recorrido**: `https://academia.localizadoc.com/onboarding`
