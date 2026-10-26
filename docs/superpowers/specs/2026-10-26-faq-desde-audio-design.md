# Generar una FAQ desde un audio de Soporte — diseño

Fecha: 2026-10-26 · Estado: aprobado para planificar

## Qué es y por qué

Hoy, cuando Soporte resuelve un caso con un cliente, el conocimiento existe
—alguien acaba de explicar el paso a paso en voz alta— pero vive en la cabeza
de quien atendió la llamada. La parte cara no es escribir la respuesta: es
acordarse de escribirla después de colgar.

La bandeja de vacíos ya dice exactamente qué falta y cuántos lo preguntaron.
Lo que falta es el puente entre "sé la respuesta" y "la respuesta está escrita".

Esta función es ese puente: desde un vacío pendiente, Soporte graba un audio
contando el paso a paso, y la IA lo convierte en el borrador de la FAQ que ese
vacío necesita.

**La meta declarada por el usuario es la velocidad:** "la idea es limpiar los
vacíos lo más pronto posible". Cuando haya que elegir entre una función más
completa y una más rápida de usar, gana la rápida.

## El flujo

1. Soporte abre un vacío **pendiente** en la bandeja y ve la pregunta real del
   cliente.
2. Toca un botón de grabar que está ahí mismo, al lado de la pregunta.
3. Habla: el mismo paso a paso que acaba de hacer en la llamada.
4. Para. El audio viaja a n8n, se transcribe y se redacta la FAQ.
5. El formulario de resolver —que **ya existe**— aparece precargado: pregunta
   base, variaciones, respuesta. La lección destino viene pre-elegida.
6. Soporte lee, corrige lo que esté mal y guarda. Ahí se cierra el vacío por el
   camino que ya existe hoy.
7. El audio no se guarda en ningún lado. Queda la transcripción y el texto que
   una persona aprobó.

## Objetivos

- Que resolver un vacío con contenido nuevo pase de "escribir una FAQ desde
  cero" a "revisar y corregir un borrador".
- Que Soporte lo haga solo, sin pasarle la grabación a nadie. Soporte tiene
  usuario propio en el panel.
- Que todo ocurra dentro del detalle del vacío: sin cambiar de pantalla, sin
  sitios de terceros, sin archivos dando vueltas.

## No-objetivos

- **No** se procesa video. El usuario lo descartó explícitamente: "el video
  haría un paso adicional, pero de momento eso tarda más". Lo que sirve está en
  lo que Soporte dice mientras lo hace, no en lo que se ve en la pantalla.
- **No** se crea una lección nueva. La salida es un bloque de FAQ dentro de una
  lección que ya existe, igual que hoy.
- **No** se transcribe la llamada con el cliente. Lo que se graba es a Soporte
  explicando, no la conversación.

## Anti-objetivos

Cosas que harían fracasar esto aunque funcionara técnicamente:

- **Que se publique sin revisión humana.** El borrador es un borrador. Una FAQ
  generada y publicada sola envenena la fuente de la que el bot aprende, y el
  error se descubre cuando un cliente recibe la respuesta equivocada.
- **Que el audio quede guardado.** Una grabación de Soporte resolviendo un caso
  puede nombrar al cliente, su negocio o sus datos. El usuario decidió tirarla:
  "se tira, solo queremos la transcripción". Guardarla "por las dudas" convierte
  una función de productividad en un repositorio de datos de clientes.
- **Que sea más lento que escribirlo a mano.** Si entre grabar, esperar y
  corregir se tarda más que tipear la respuesta, nadie lo va a usar dos veces.

## Restricciones

### El micrófono está apagado por configuración

`vercel.json` manda `Permissions-Policy: microphone=()` para todo el sitio. Eso
apaga el micrófono en el navegador antes de que ningún código pida permiso.
**Hay que abrirlo solo para `/admin(.*)`**, que ya tiene su propio bloque de
headers. El portal de estudiantes —que se embebe en un iframe de Bold POS y
tiene `frame-ancestors *`— debe quedar como está.

Este cambio afloja una restricción de seguridad real. Va acotado al panel
autenticado y no se toca `camera`, `geolocation` ni `payment`.

### La CSP ya permite hablar con n8n

`connect-src` incluye `https://n8n.mplasesores.com`, así que el panel puede
mandarle el audio directo. No hace falta proxy nuevo.

### El audio no toca la base ni Storage

Viaja del navegador a n8n y de ahí al modelo. Lo que vuelve es texto. Nada se
escribe en el bucket `material` ni en ninguna tabla.

### El volumen es bajo, y eso cambia qué hay que construir

Unas **5 transcripciones por semana** mientras se ponen al día con los 72
pendientes, y menos después. A ese ritmo la cuota no es una restricción: **no
hace falta batching, ni cola, ni backoff**. Una llamada por vez, hecha por una
persona que está esperando mirando la pantalla.

Esto contrasta con la otra operación de IA del proyecto, que sí topa cuota: el
embedding masivo necesitó 12 segundos por llamada (ver `reembedAllLessons` en
js/admin.js). Esa restricción **no aplica acá** y copiar su maquinaria sería
construir para un problema que no existe.

Lo que sí importa a 5 por semana es lo contrario: que la primera vez funcione.
Nadie va a desarrollar el hábito de usar algo que falla una de cada cinco veces
si solo lo toca una vez por semana.

### Lo que ya existe y hay que reusar, no reescribir

- El formulario de resolver, con sus campos `gapLeccion`, `gapPregunta`,
  `gapVariaciones`, `gapRespuesta`, `gapAcordeon` (`js/admin-gaps.js`).
- `buildFaqBlock` / `contenidoConFaqInfo` (`js/gap-faq-block.js`), que arman el
  bloque `bot_faq` dentro del contenido de la lección.
- `embedLesson` (`js/lesson-embed.js`), que re-embebe después de guardar. Sin
  eso el bot no encuentra lo que se acaba de escribir.
- `match_lessons(query_embedding, match_count, match_threshold, p_vertical,
  p_plataforma)`, que es como el bot encuentra lecciones.

### Trampas del proyecto que aplican

- **`css/tw.css` está precompilado.** Una clase de Tailwind que no estaba en el
  código cuando se generó no existe. Verificar contra el archivo antes de usar.
- **supabase-js no lanza ante error**, devuelve `{ error }`. Un error tragado se
  vuelve un dato creíble en pantalla.
- **n8n:** un Code node no acepta `return []` para cortar una rama; el `jsCode`
  se arma con saltos de línea reales; el item del error output trae `error` como
  string. Ver `docs/n8n/embed-text-webhook.md`.
- **La credencial `service_role` de Supabase en n8n la crea el usuario** y se
  referencia solo por id. Claude no maneja su valor.

## Decisiones ya tomadas

### Por el usuario

1. **Audio, no video.** Por velocidad.
2. **Grabar desde la página** es el camino principal. Era su preferencia ("si
   podemos grabar el audio desde la página sería genial") y resultó ser además
   la opción más simple: el navegador graba sin librerías y el archivo nunca
   toca el disco.
3. **La grabación se tira.** Solo queda la transcripción.
4. **La salida es una FAQ dentro de una lección que ya existe**, "así como
   está" — no una lección nueva.
5. **Siempre hay revisión humana** antes de guardar.
6. **El botón vive dentro del detalle del vacío**, no en una pantalla aparte.
7. **Soporte revisa y guarda su propio borrador.** No hay segundo par de ojos:
   quien grabó es quien aprueba. Es coherente con la meta de velocidad —un
   revisor aparte convertiría minutos en días— pero conviene saberlo: la única
   defensa contra una FAQ mal redactada es que quien la aprueba es quien acaba
   de resolver el caso. Queda rastro de quién fue en `bot_vacios.resuelto_por` y
   en el registro de actividad.

### Por el constructor (mías, cambiables)

7. **La lección destino viene pre-elegida.** El vacío ya guarda su embedding
   ancla, y `match_lessons` ya sabe encontrar la lección más parecida. Eso
   ahorra el campo que más frena al resolver. El embedding **no debe viajar al
   cliente**: hace falta una RPC `security definer` que haga el match adentro y
   devuelva solo el id y el título sugeridos. Se puede cambiar siempre a mano.

8. **Subir un archivo de audio queda como respaldo**, no como camino principal.
   Si alguien ya grabó la llamada por su lado, obligarlo a repetirla sería
   absurdo.

9. **La transcripción se muestra al lado de la FAQ generada.** Si el modelo
   entendió mal una palabra, la respuesta va a sonar perfecta y estar
   equivocada; ver qué escuchó es lo único que lo delata. No se guarda en la
   lección: es para la revisión.

## Lo que queda al constructor

- **El formato de audio.** Qué entrega `MediaRecorder` en los navegadores que
  usa el equipo y qué acepta el modelo que transcribe. Puede hacer falta
  convertir o elegir un códec distinto al que el navegador da por defecto.
- **Qué modelo transcribe y dónde.** El proyecto ya habla con Vertex AI desde
  n8n; la decisión es del constructor, con la cuota en mente.
- **El prompt que redacta la FAQ.** Debe producir los mismos campos que el
  formulario ya tiene, en el tono de las FAQ que ya están escritas. Mirar las
  que existen antes de inventar uno.
- **Qué pasa cuando falla.** Sin señal, con un audio mudo, con una
  transcripción vacía o con el modelo caído. La regla del proyecto es que un
  fallo se vea como fallo y no como un formulario vacío.
- **El límite de duración**, y qué se le dice a quien lo pasa.
- **Si hace falta un estado intermedio** mientras procesa, o alcanza con
  deshabilitar el botón.

## Preguntas abiertas para el usuario

Ninguna: las dos que había quedaron contestadas y están arriba, como decisión 7
y en la sección de volumen.
