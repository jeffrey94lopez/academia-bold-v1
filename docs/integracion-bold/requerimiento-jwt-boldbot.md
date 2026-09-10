# Requerimiento para desarrolladores de Bold POS — JWT para BoldBot

**Producto:** BoldBot POS (asistente + academia embebida en el menú *Ayuda*)
**Origen de BoldBot:** `https://academia.localizadoc.com`
**Fecha:** 2026-08-19

## Objetivo

Que Bold emita, para la sesión del comercio, un **JWT propio de BoldBot** (no el
token de sesión del POS) y nos lo entregue por `postMessage`. Con ese JWT
BoldBot: (1) muestra la vertical y personaliza, y (2) —en la etapa de datos— nos
autoriza a consultar la API de Bold por la cuenta correcta.

> **No** necesitamos el token de acceso del POS (`localStorage.token`). Es una
> credencial de larga duración y no queremos custodiarla. Necesitamos un JWT
> aparte, corto, con audiencia propia, descrito abajo.

---

## 1. El JWT que necesitamos

### Header

```json
{ "alg": "RS256", "typ": "JWT", "kid": "boldbot-key-1" }
```

### Payload (claims)

```jsonc
{
  "iss": "bold-pos",                 // emisor
  "aud": "boldbot",                  // audiencia: este JWT es SOLO para BoldBot
  "sub": 7993,                       // ID de cuenta del comercio
  "business_type": "retail",         // vertical (retail | restaurant)
  "business_name": "accionahn",      // nombre del comercio
  "user": {                          // quién abrió la sesión
    "id": 456,                       // opcional (si difiere de sub)
    "name": "Jeffrey Martínez",      // opcional
    "email": "correo@comercio.com"   // deseable
  },
  "scope": "read:sales read:invoices read:products",  // solo lectura (para etapa de datos)
  "iat": 1787131030,                 // emitido
  "exp": 1787131330                  // expira PRONTO (ver §3)
}
```

| Claim           | Tipo            | Obligatorio | Notas                                   |
|-----------------|-----------------|-------------|-----------------------------------------|
| `iss`           | string          | sí          | `"bold-pos"`                            |
| `aud`           | string          | sí          | `"boldbot"` (rechazamos otra audiencia) |
| `sub`           | number/string   | sí          | ID de cuenta                            |
| `business_type` | string          | sí          | vertical                                |
| `business_name` | string          | sí          | nombre del comercio                     |
| `user.email`    | string          | deseable    | correo del usuario                      |
| `user.name`     | string          | opcional    |                                         |
| `scope`         | string          | sí (etapa datos) | permisos de **solo lectura**       |
| `iat` / `exp`   | number (epoch s)| sí          | ventana corta                           |

## 2. Firma y verificación (elijan una)

BoldBot **verifica la firma en su servidor** antes de confiar en el JWT. Dos vías:

- **Opción recomendada — RS256 + JWKS (sin secreto compartido).**
  Bold firma con su clave privada y publica la clave pública en un JWKS, ej.
  `https://api.pos.bold.co/.well-known/jwks.json`. BoldBot valida contra ese
  JWKS. Ventaja: no se comparte ningún secreto y Bold puede rotar claves.

- **Alternativa — HS256 (secreto compartido).**
  Bold y BoldBot comparten un secreto por canal seguro. Más simple, pero exige
  custodiar el secreto de ambos lados.

## 3. Vigencia

- `exp` **corto**: minutos (sugerido 5–15 min), no horas ni días.
- Renovable: cuando expira, BoldBot pide uno nuevo con el handshake (§4).
- Motivo: si el JWT se filtrara, su ventana de uso es mínima.

## 4. Entrega — postMessage con handshake

BoldBot avisa cuando está listo; Bold responde con el JWT. Así no depende del
timing de carga del iframe.

```ts
// lado Bold — en el componente pos-help-window
const ACADEMIA_ORIGIN = 'https://academia.localizadoc.com';

@ViewChild('academiaFrame') academiaFrame!: ElementRef<HTMLIFrameElement>;

@HostListener('window:message', ['$event'])
onMessage(e: MessageEvent) {
  if (e.origin !== ACADEMIA_ORIGIN) return;              // validar origen SIEMPRE
  if (e.data?.type === 'academia:ready') {
    this.academiaFrame.nativeElement.contentWindow?.postMessage(
      { type: 'bold:token', jwt: this.mintBoldBotJwt() }, // JWT firmado de §1
      ACADEMIA_ORIGIN                                      // destino explícito, nunca '*'
    );
  }
}
```

BoldBot lo recibe validando el origen `https://pos.bold.co` y luego verifica la
firma en su backend.

Si el usuario cambia de comercio/sucursal sin recargar el iframe, reenviar un
`bold:token` nuevo (ideal, no bloqueante).

## 5. Qué hace BoldBot con el JWT

- Verifica firma, `aud === "boldbot"`, `exp` vigente.
- Usa `business_type` para el autofiltro y `business_name`/`user` para personalizar.
- (Etapa de datos) Lo presenta a la API de lectura de Bold para traer datos
  **solo** de la cuenta `sub`. El JWT no se persiste; se usa y se descarta.

## 6. Confirmaciones que necesitamos de ustedes

1. **Firma**: ¿RS256 + JWKS (recomendado) o HS256 con secreto compartido?
2. **Vertical**: ¿qué string usa `business_type` para restaurantes?
   (`restaurant` / `restaurante`). Retail lo asumimos `retail`.
3. **Usuario**: ¿pueden incluir `email`? ¿`user.id` difiere de `sub` cuando hay
   varios usuarios por comercio?
4. **Scope**: ¿qué permisos de solo lectura pueden otorgar (ventas, facturas,
   productos, turnos)?

## 7. Impacto para ustedes

- Emitir el JWT (firmar con los claims de §1) + entregarlo por `postMessage`.
- ~15–20 líneas en el componente `pos-help-window`, más el firmado del JWT.
- No exponen el token de sesión del POS.

**Nuestro origen (para `targetOrigin`):** `https://academia.localizadoc.com`
