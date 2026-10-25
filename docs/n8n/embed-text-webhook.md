# Webhook `embed-text` — embeber un texto y devolver el vector

Creado el 2026-10-08 para la Tanda 1 del plan de la bandeja de vacíos.

- **Workflow:** "Embeber Texto (bandeja de vacios)", id `vFczxAxH5QGggcDY`, activo.
- **URL:** `https://n8n.mplasesores.com/webhook/embed-text`
- **Auth:** header `x-api-key` con el mismo token que `embed-lesson`
  (`EMBED_TOKEN` en `js/admin.js`).

## Contrato

| Caso | Respuesta |
|---|---|
| `{"text":"..."}` válido | `200 {"embedding":[768 floats]}` |
| header ausente o token malo | `401 {"error":"unauthorized","message":"..."}` |
| `text` ausente o en blanco | `400 {"error":"validation_error","message":"text requerido"}` |
| falla Vertex | `502 {"error":"upstream_error","message":"..."}` |

Los cinco casos se probaron con curl el 2026-10-08.

## Por qué es un workflow aparte y no una rama de `embed-lesson`

`embed-lesson` **escribe** el embedding en `lecciones` y devuelve `{"ok":true}`.
Acá hacen falta el vector de vuelta y ninguna escritura: lo necesitan el script de
calibración del umbral y la rama de registro de vacíos del bot.

## Forma

```
Webhook (responseNode)
  └─ Validar entrada (Code, onError: continueErrorOutput)
       ├─ main[0] → Generar embedding (HTTP, Vertex nativo, retryOnFail 3×5s,
       │              onError: continueErrorOutput)
       │               ├─ main[0] → Respuesta OK (200)
       │               └─ main[1] → Respuesta error
       └─ main[1] → Respuesta error  (un solo responder, código por expresión)
```

Mismo modelo y mismo endpoint que `embed-lesson`
(`text-multilingual-embedding-002:predict`, credencial googleApi "Vertex - BoldBot",
768 dimensiones), **a propósito**: si el modelo difiriera, los vectores no serían
comparables con `lecciones.embedding` y el agrupamiento no significaría nada.

## Dos trampas que costaron una iteración

1. **El item de error trae `error` como STRING**, no como objeto con `.message`.
   Un `$json.error.message` da `undefined` y todos los errores caen al 502.
   Hay que leer `typeof e === 'string' ? e : e.message`.
2. **n8n recorta lo que va antes de `:`** en el mensaje de un `throw` del Code
   node: `throw new Error('validation_error: falta text')` llega como
   `"falta text [line 1]"`. Por eso los mensajes son de **un solo token**
   (`unauthorized`, `validation_error`) y la expresión los busca con `includes`.

## Pendiente conocido

El token va literal dentro del Code node, igual que en `embed-lesson`. Es la
convención viva de estos workflows, no una decisión nueva; lo correcto sería una
credencial de n8n. Se deja anotado, no se cambió acá para no desviarse del patrón
existente.

---

# Rama de registro de vacios en "Bold POS Chat"

Agregada el 2026-10-25 (Tanda 8). Workflow `dZGuYJbRbG6h8aqv`, 21 nodos.

```
Respond to Webhook
  └─ Detectar vacio (Code)        ← lee knowledge_gap de "Formatear respuesta"
       └─ Hay vacio? (IF)
            ├─ true  → Embeber vacio (Vertex, onError: continueErrorOutput)
            │            ├─ main[0] ─┐
            │            └─ main[1] ─┴→ Registrar vacio (RPC, service-role)
            └─ false → (nada: la rama termina)
```

**Va despues de `Respond to Webhook` a proposito.** El estudiante ya recibio su
respuesta; el registro no puede hacerlo esperar. Verificado: con la rama
fallando, el bot respondio igual.

**Las dos salidas de `Embeber vacio` van al mismo registro.** Si Vertex falla,
la pregunta se guarda con `embedding = null` (sin clasificar) en vez de
perderse. El dato original es irrecuperable; no agruparlo no lo es.

**Credencial:** `supabaseApi` -> "Supabase Academia (service-role)"
(`Szz5zeGA5Wxy3Rtj`), referenciada por id. La RPC esta concedida solo a
`service_role`; el resto del workflow usa la key anon y con esa daria 42501.

## Tres trampas que costaron iteraciones

1. **Un Code node de n8n NO acepta `return []`** para cortar una rama: tira
   "Code doesn't return items properly". Por eso hay un nodo IF de verdad. Su
   esquema se copio del "Router modulo?" de este mismo workflow, que ya
   funciona, en vez de escribirlo de memoria.
2. **El `jsCode` se arma con saltos de linea REALES.** Concatenar fragmentos en
   una sola linea con comentarios `//` comenta el codigo entero y el nodo deja
   de devolver items, sin error claro.
3. **`Registrar vacio` va SIN `retryOnFail`.** n8n no logra serializar la
   respuesta de la RPC (`Converting circular structure to JSON`, intenta volcar
   el `IncomingMessage` crudo) y da el nodo por fallido **aunque la fila ya se
   escribio**. Con reintentos, la misma pregunta se insertaba 3 veces separadas
   por `waitBetweenTries` — verificado en los datos. Perder un registro ante un
   fallo transitorio es menos daniño que triplicar cada vacio, y el detector de
   silencio de la bandeja cubre el fallo sostenido. `responseFormat: text` y
   `typeVersion: 4.2` no bastaron para quitar el error.

## Nota sobre el respaldo

`n8n/bold-pos-chat-con-registro-vacios.json` se escribe con `ensure_ascii`:
algunos nombres de nodo traen surrogates sueltos que rompen la escritura en
utf-8.
