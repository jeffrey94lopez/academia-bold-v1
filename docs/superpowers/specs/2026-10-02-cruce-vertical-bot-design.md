# Cruce entre verticales en el bot — diseño

Fecha: 2026-10-02
Estado: aprobado, pendiente de plan de implementación

## Problema

Desde el 2026-10-02 el bot filtra su recuperación por la vertical del comercio
(`p_vertical` en `match_lessons`). El filtro es duro, a nivel SQL: el bot no
puede ver el contenido de la otra vertical.

Eso arregló el ruido —un retail ya no recibe respuestas sobre mesas y comandas—
pero creó un callejón sin salida. Si alguien de retail pregunta algo que solo
está documentado en restaurantes, el bot responde *"todavía no tengo información
sobre eso"*, que es falso: la información existe, solo que no en su vertical.

Verificado en producción el 2026-10-02: la pregunta "cómo gestiono las mesas de
mi negocio" responde completo con `vertical: restaurantes` y cae en
"no tengo información" con `vertical: retail`.

Tres cosas se pierden con ese callejón:

1. El comercio se va sin su respuesta aunque la tengamos escrita.
2. No nos enteramos de que una lección quizá sirve a las dos verticales y
   debería estar marcada `'ambas'`.
3. No nos enteramos de que un comercio concreto cruza una y otra vez, que es la
   señal de que Bold nos manda su vertical equivocada.

## Alcance

**Dentro:** detectar el cruce en n8n, ofrecerlo en el chat, responder si lo
aceptan, ofrecer cambiar la vertical de la sesión, y registrar cada cruce para
analítica.

**Fuera:** el dashboard que consume ese registro (necesita su propio diseño; acá
solo se garantiza que el dato quede bien guardado). Tampoco entra reclasificar
contenido: el registro es la entrada de ese trabajo, no el trabajo.

## Decisiones

1. **Dos búsquedas, siempre, en cadena.** `Embeber pregunta → Buscar lecciones
   (filtrada) → Buscar en otra vertical (sin filtro) → Construir prompt`. Se
   descartaron dos alternativas:
   - *Una sola búsqueda sin filtro, con la vertical como etiqueta y el prompt
     decidiendo*: reabre la puerta que acabamos de cerrar y vuelve a depender de
     que el modelo obedezca una instrucción, que es exactamente lo que el filtro
     duro reemplazó.
   - *Un nodo IF que dispare la segunda búsqueda solo cuando la primera viene
     vacía*: ahorra una llamada en el camino feliz, pero introduce convergencia
     de ramas, donde `$json` pasa a ser "la rama que corrió última" y falla en
     silencio. El ahorro no lo justifica: es una búsqueda vectorial con el
     embedding ya calculado, frente a una respuesta que hoy tarda ~5 s.

2. **El cruce lo decide el código, no el modelo.** `Construir prompt` tiene los
   dos conjuntos de resultados y decide deterministamente si hay cruce. El id y
   el título de la lección **nunca pasan por el LLM**: los adjunta
   `Formatear respuesta` al JSON final. El modelo solo redacta la prosa.

3. **Mostrar una vez y además ofrecer el cambio**, en dos momentos separados:
   - El bot ofrece el cruce → si aceptan, responde desde esa lección **solo en
     ese turno**.
   - Después de responder, el portal ofrece aparte cambiar la vertical de la
     sesión. Eso **no pasa por el bot**: es `applySeleccion` en el navegador.

   La separación mantiene chico el contrato del bot: resuelve una pregunta; el
   cambio de sesión es cosa del portal.

4. **El cambio de vertical dura solo la sesión, por construcción.**
   `onContextoBold` vuelve a aplicar la vertical de Bold en cada carga. Un
   comercio bien clasificado vuelve solo a lo suyo; uno mal clasificado cruza
   todos los días, que es justo la señal que queremos que la analítica delate.
   No hay que programar nada para esto: es consecuencia del diseño que ya existe.

5. **Se guarda `account_id` en `bodi_conversations`.** Hace falta para responder
   "¿este comercio está mal clasificado?". Matiza la decisión previa de no
   persistir identidad, y es deliberado:
   - Lo que se decidió no persistir fue la identidad **en el navegador**
     (`localStorage`), porque se filtraba entre comercios en un equipo
     compartido. Esto es del lado servidor.
   - El `account_id` ya queda registrado en los logs de ejecución de n8n desde
     el 2026-09-30. No es una exposición nueva.
   - Es el número de cuenta de un comercio, no de una persona. El nombre y el
     correo del usuario siguen sin salir del navegador.

6. **Un registro por cruce, en tabla aparte.** Una conversación puede cruzar más
   de una vez; columnas en `bodi_conversations` no lo representarían.

## Arquitectura

### n8n — workflow `Bold POS Chat` (`dZGuYJbRbG6h8aqv`)

**Nodo nuevo "Buscar en otra vertical"**, copia de `Buscar lecciones` sin
`p_vertical`, insertado entre `Buscar lecciones` y `Construir prompt`.

**`Construir prompt`** (Code v2) hoy lee las lecciones con
`$('Buscar lecciones').all()` — **por nombre de nodo**. Un segundo nodo no lo
alimenta solo: hay que leerlo explícitamente con `$('Buscar en otra vertical').all()`.
La lógica nueva:

- Si `Buscar lecciones` trajo resultados → todo igual que hoy.
- Si vino vacío y `Buscar en otra vertical` trajo algo **por encima del umbral
  de cruce** → se arma un prompt que instruye al bot a **ofrecer** ese contenido,
  nombrando la lección y la vertical, sin responder todavía la pregunta.
- Si los dos vienen vacíos, o el de la otra vertical no supera el umbral →
  `knowledge_gap`, como hoy.

**El umbral de cruce es 0.35**, deliberadamente más alto que el 0.15 de la
búsqueda normal. El razonamiento: una búsqueda vectorial sin filtro casi siempre
devuelve *algo*, y un cruce ofrecido de más es peor que un "no tengo
información" — hace ruido en el chat y ensucia la analítica, que es la mitad del
valor de esta función. Es el primer número a ajustar si en la práctica ofrece
cruces absurdos o se queda corto; conviene revisarlo con los datos reales de
`bot_cruces_vertical` a las pocas semanas.

La vertical se lee del **Webhook**, no de `wb`: `wb` es la salida de
"Normalizar intención", que no arrastra todos los campos del body.

**`Formatear respuesta`** adjunta al JSON, cuando hubo cruce:

```json
"cross_vertical": {
  "leccion_id": "<uuid>",
  "titulo": "Gestión de mesas",
  "vertical": "restaurantes"
}
```

**El turno de aceptación:** el frontend reenvía con
`cross_vertical_accepted: "<leccion_id>"` en el body. `Construir prompt`, al
verlo, arma el prompt con esa lección aunque no esté en la vertical del
comercio.

Cuidados ya documentados que aplican: al editar `jsCode` por la API, un `\n`
dentro de un string JS debe quedar como barra invertida + `n` literal; y en el
`PUT` hay que filtrar `settings` a las claves que acepta la API pública.
Respaldo del workflow antes de tocar nada.

### Frontend

**`js/assistant.js`:**

- Al recibir `data.cross_vertical`, renderiza botones Sí/No reusando el patrón
  de `appendResolutionButtons()` (`js/assistant.js:586`).
- "Sí" → manda el siguiente mensaje con `cross_vertical_accepted`.
- Tras la respuesta del cruce, renderiza aparte un botón *"Ver siempre contenido
  de \<vertical\>"* que llama a `applySeleccion`.
- Registra el cruce en la tabla nueva: **una sola fila por cruce**, insertada
  cuando el bot lo ofrece (con `acepto` en `null`) y actualizada por `id` cuando
  el usuario responde. No son dos filas: "ofrecido" y "aceptado" son dos estados
  del mismo hecho, y contarlos por separado inflaría el volumen al doble.

**`js/clarify.js`** gana `cross_vertical_accepted` en `chatRequestBody`. Sigue
siendo puro y testeable.

**`js/lessons.js`** expone `applySeleccion` para que el asistente pueda
invocarla. Hoy es privada de `renderLessons()`; se expone por `window`, igual que
`window.openLessonById` (`js/lessons.js:597`), que ya resuelve este mismo
problema de comunicación entre pestañas.

### Base de datos

```sql
alter table public.bodi_conversations
  add column if not exists account_id text;

create table if not exists public.bot_cruces_vertical (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid references public.bodi_conversations(id) on delete cascade,
  account_id        text,
  vertical_comercio text not null,
  vertical_contenido text not null,
  leccion_id        uuid,
  leccion_titulo    text,
  acepto            boolean,
  created_at        timestamptz not null default now()
);
create index if not exists idx_cruces_leccion on public.bot_cruces_vertical (leccion_id);
create index if not exists idx_cruces_cuenta  on public.bot_cruces_vertical (account_id);
create index if not exists idx_cruces_fecha   on public.bot_cruces_vertical (created_at desc);
```

`acepto` es `null` mientras solo se ofreció y pasa a `true`/`false` cuando el
usuario responde: distingue "le ofrecimos" de "le interesó", que son preguntas
distintas.

**RLS:** la tabla necesita una policy de INSERT y UPDATE para `anon`, igual que
`bodi_conversations`, porque la escribe el portal. **El repo no refleja las
policies vivas** (ver la auditoría de RLS), así que hay que verificar contra la
base y no contra los archivos de migración.

### Las tres preguntas que responde

| Pregunta | Consulta |
|---|---|
| ¿Esta lección debería ser «Ambas»? | `group by leccion_id, vertical_comercio` — muchos retail cruzando a la misma lección de restaurantes |
| ¿Este comercio está mal clasificado? | `group by account_id` — una cuenta que cruza repetidamente y siempre hacia la misma vertical |
| ¿Cuánto pasa esto? | `count(*)` por período, y la proporción con `acepto = true` |

## Riesgos

- **El bot ofrece cruces irrelevantes.** La segunda búsqueda no tiene filtro, así
  que casi siempre devolverá *algo*. Mitigado con el umbral de cruce de 0.35
  (ver arriba), pero es el riesgo vivo de esta función y el número está puesto a
  ojo: hay que validarlo con los datos reales.
- **El modelo inventa el id de la lección.** Por eso la decisión 2: los ids no
  pasan por el LLM.
- **Editar el workflow por API puede tumbar el bot.** Respaldo previo y prueba
  del webhook en las dos verticales antes de dar por bueno el cambio. Ojo que un
  token mal extraído da `Unauthorized [line 4]`, que **no** es el bot roto.
- **RLS silenciosa.** Un INSERT bloqueado por RLS no da error en `supabase-js`:
  la analítica quedaría vacía sin que nadie se entere. Verificar por REST crudo
  que la fila se escribió.

## Pruebas

Unitarias con `node:test`:

- `chatRequestBody` incluye `cross_vertical_accepted` cuando se le pasa y lo
  omite cuando no.
- La lógica pura de decidir si hay cruce (conjunto filtrado vacío + no filtrado
  con resultado por encima del umbral), extraída a un módulo testeable.

En n8n, contra el webhook: la misma pregunta de restaurantes con
`vertical: retail` debe devolver `cross_vertical`; con `vertical: restaurantes`
debe responder normal y **sin** `cross_vertical`; sin vertical, como hoy.

En navegador: que los botones aparezcan, que aceptar traiga la respuesta, que el
botón de cambio de vertical cambie la pestaña de Lecciones, y que la fila quede
escrita en `bot_cruces_vertical` — verificada por REST, no por la UI.

## Orden sugerido

1. SQL: columna `account_id`, tabla nueva, policies RLS.
2. `account_id` en `createConversation`.
3. n8n: nodo nuevo, `Construir prompt`, `Formatear respuesta`.
4. Frontend: botones, reenvío, botón de cambio, registro del cruce.
5. Verificación end-to-end.
