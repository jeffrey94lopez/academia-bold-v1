# Integración con Bold POS — requerimientos para el equipo dev de Bold

Contexto: BoldBot (academia.localizadoc.com) está embebido como iframe en el
menú **Ayuda** del POS (componente `pos-help-window`). Hoy el iframe se carga
**sin ningún dato** del comercio; por aislamiento de orígenes no podemos leer
nada de `pos.bold.co`. Estos documentos piden a Bold que nos pase el contexto.

Verificado en vivo (2026-08-19): el JWT de sesión de Bold trae `sub` (ID de
cuenta) y `business_type` (vertical). El nombre del negocio y el usuario salen
de su perfil, no del token.

## Los documentos

| Archivo | Etapa | Qué pide | Complejidad para Bold |
|---|---|---|---|
| `Requerimiento-Contexto-BoldBot-v2.docx` **← enviar este** | **2 — identidad y filtro** | id de cuenta, vertical, nombre, plataforma y usuario, por `postMessage` (texto plano) | Baja (~12 líneas, sin backend, sin firma) |
| `Requerimiento-Contexto-BoldBot.docx` (v1, 2026-08-19) | 2 | lo mismo, en 2 páginas | — |
| `Requerimiento-JWT-BoldBot.docx` | **3 — datos de la cuenta** | un JWT firmado (RS256/JWKS o HS256), corto, con `scope` de solo lectura | Media (firmar JWT + entregarlo) |

**La v2 (2026-09-09) reemplaza a la v1.** Se escribió porque el equipo de Bold no
ubicaba qué tocar y tenía dudas de seguridad. Agrega:

- paso a paso con el archivo/componente exacto y código completo (Angular y JS puro);
- sección §4 «Qué NO les estamos pidiendo» y §7 de seguridad con modelo de amenaza;
- campo nuevo `platform` (web/mobile) para filtrar también por plataforma;
- criterio de aceptación marcable y estimación por tarea;
- una **página de verificación en vivo** (abajo).

## Página de verificación — `/embed-test.html`

`embed-test.html` + `js/embed-test.js` (en la raíz del repo) publican
`https://academia.localizadoc.com/embed-test.html`: recibe el `postMessage`,
muestra el origen y valida campo por campo con ✓ / ! / ✗ y la razón. Detecta
también los valores de ejemplo copiados literales y avisa si nos mandan el token
de sesión por error. Trae un snippet de consola para que Bold pruebe **sin tocar
código** (30 s) y un botón para copiar un JSON de diagnóstico.

> Requiere deploy: el documento la referencia como si estuviera arriba, así que
> hay que publicarla **antes** de enviar el .docx.

## Alternativa discutida para la Etapa 3

En vez del JWT firmado (que exige compartir secreto o publicar un JWKS), Bold
puede emitir un **token opaco** y validarlo en un endpoint de introspección.
Nosotros nunca lo abrimos; se lo devolvemos a Bold para preguntar de quién es.
Ventaja: no se comparte secreto y Bold puede revocarlo. Si el equipo dev prefiere
esta vía, se ajusta el documento de la Etapa 3.

## Pendiente

1. Desplegar `embed-test.html` **y el receptor**.
2. Enviar la v2 del documento de Contexto.
3. Con lo que responda Bold sobre el string de restaurantes, ajustar
   `VERTICAL_POR_BUSINESS_TYPE` en `js/bold-context.js`.
4. Cuando Bold confirme que manda `account_id`/`business_name`, decidir en n8n
   qué hacer con ellos (hoy el bot los recibe y los ignora).

## Receptor (nuestro lado) — ya implementado (2026-09-09)

`js/bold-context.js` escucha el `postMessage`, valida el origen
(`https://pos.bold.co`, único aceptado), normaliza y **copia solo los campos
pedidos** — si Bold manda un token, no entra al portal. Expone
`onContextoBold()`, que dispara también para quien se suscribe tarde (el mensaje
puede llegar mientras el portal está cargando).

Quién lo usa:

| Archivo | Qué hace con el contexto |
|---|---|
| `js/main.js` | arranca el receptor y el handshake `academia:ready` |
| `js/lessons.js` | autofiltra vertical y plataforma (sin re-render si ya coincidía) |
| `js/assistant.js` | saluda por nombre y manda `account_id`/`business_name` a n8n |
| `js/clarify.js` | `chatRequestBody` agrega esas dos claves solo si existen |

La identidad **no se persiste**: vive en memoria durante la carga y se pierde al
cerrar. Guardarla dejaba el nombre pegado entre sesiones (el bot saludaba con el
nombre del comercio de la prueba anterior); `initBoldContext` además borra las
claves `bold_account_id`/`bold_business_name`/`bold_user_*` que dejó la versión
que sí guardaba. El correo del usuario no viaja al bot ni al LLM (doc §7.4).
Tests en `tests/bold-context.test.mjs`.

Los `.docx` se generan desde los `.md` de esta carpeta con `md2docx.js`
(docx-js). Editar el `.md` y regenerar:

```bash
npm i docx --no-save
node docs/integracion-bold/md2docx.js docs/integracion-bold/requerimiento-contexto-boldbot-v2.md docs/integracion-bold/Requerimiento-Contexto-BoldBot-v2.docx "Requerimiento — Contexto del comercio para BoldBot (v2)"
```
