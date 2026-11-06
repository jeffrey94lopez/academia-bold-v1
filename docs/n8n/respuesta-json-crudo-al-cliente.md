# El bot le mostró JSON crudo a un cliente (2026-11-02)

Incidente real, con su causa raíz y los tres arreglos que se aplicaron el
2026-11-06. Se documenta porque dos de los tres viven en n8n, fuera de este
repositorio, y sin esto no queda rastro de por qué el código es como es.

## Qué pasó

Un cliente de FERRETERIA ORSA preguntó cómo configurar su impresora en Windows
y recibió en la burbuja del chat **11.410 caracteres de JSON crudo**, con
nuestros campos internos adentro: `"sentiment"`, `"knowledge_gap"`,
`"support_redirected"`. Después abandonó la conversación.

No fue un problema de cómo se guarda ni de cómo lo pinta el admin: en
`js/assistant.js` el mismo string `reply` se pinta en pantalla, se guarda en el
transcripto y se manda como historial al turno siguiente. Lo que quedó guardado
es exactamente lo que el cliente leyó.

## La cadena, de atrás para adelante

| Eslabón | Qué pasó |
|---|---|
| Lección de impresoras | Es enorme (seis guías de periféricos publicadas el 2026-10-25) |
| `OpenAI Chat` | `max_tokens: 4000`; el modelo devolvió `finish_reason: length` |
| JSON del modelo | Quedó cortado a mitad de palabra, en `"Gráf` |
| `Formatear respuesta` | `JSON.parse` falló → `segments = null` |
| El respaldo de ese nodo | `reply = parsed ? (parsed.reply \|\| raw) : raw` → **mandó `raw`** |
| `js/assistant.js` | Pintó `reply` tal cual. No había ninguna defensa |

Evidencia: ejecución n8n **11773** del 2026-11-02T17:41:36Z. La prueba numérica
del techo llegó después: al reintentar la misma pregunta con el límite en 8000,
la respuesta usó **4.047 tokens de salida** — apenas por encima del viejo 4.000.
Por eso se cortaba, y por eso no se cortaba casi nunca con otras preguntas: la
segunda respuesta más larga de las 96 ejecuciones medidas llegaba a 1.845.

Frecuencia medida antes de arreglar: **1 de 96** ejecuciones en cinco días.

## Los tres arreglos

**1. `Formatear respuesta` (n8n) — rescata en vez de volcar.** Si el JSON vino
roto, extrae los `"content"` de los segmentos, incluido el último que quedó sin
comilla de cierre, y agrega un aviso de que la respuesta quedó cortada. Si no
hay nada que rescatar, pide repetir la pregunta. **Nunca** manda `raw`.

Clave para no romper lo que funcionaba: el rescate solo corre si el texto
*parece un envoltorio nuestro* (empieza con `{` **y** trae alguna de nuestras
claves). Las ramas de soporte y de clarificación llegan a ese nodo con texto
plano y tienen que pasar intactas — aplicar el rescate a ciegas las habría
reemplazado por el mensaje de disculpa.

**2. `OpenAI Chat` (n8n) — `max_tokens` de 4000 a 8000.** Compra aire, no cierra
el problema: siempre va a existir una lección más larga. Por eso el arreglo 1 y
el 3 no sobran.

**3. `js/bot-respuesta-segura.js` (este repo) — la última barrera.** Sanea
`data.response` antes de que toque la pantalla. Es redundante con el arreglo 1 a
propósito: no depende de que n8n esté bien, y n8n se edita a mano desde una UI.

Se aplica en el punto donde nace `reply`, no más abajo, porque ese valor se usa
en tres lugares (burbuja, transcripto guardado e historial del turno siguiente);
saneando el origen quedan cubiertos los tres. Sin eso, un volcado de JSON
viajaría además como historial y envenenaría la respuesta siguiente.

## Cómo verificar que sigue arreglado

```bash
node --test tests/bot-respuesta-segura.test.mjs
```

Para el lado de n8n hay que ir a los datos, no a la consola del navegador
(ver [[bolbot-n8n-workflow]]): en una ejecución, `OpenAI Chat` debe traer
`finish_reason: 'stop'`, y la salida de `Formatear respuesta` debe traer
`segments` no nulo y un `response` que no empiece con `{`.

Respaldo del workflow previo al cambio:
`backups/n8n/2026-11-06-bold-pos-chat-ANTES-json-crudo.json` (la carpeta está en
`.gitignore`, así que vive solo en disco).
