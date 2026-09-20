# Bandeja de vacíos del bot — diseño

Fecha: 2026-09-19
Estado: aprobado, pendiente de plan de implementación

## Problema

El bot no sabe responder el **41% de las conversaciones**. Medido en producción
el 2026-09-19:

| Métrica | Valor |
|---|---|
| Conversaciones totales | 605 |
| Con `knowledge_gap` (juicio del LLM) | 250 (41%) |
| Con `bot_no_info` (señal determinista) | 127 (21%) |
| De los últimos 30 días | 308 (51% de toda la historia) |

La mitad de la historia está en el último mes: ~10 conversaciones/día y ~4
vacíos/día, y subiendo.

La detección ya existe; lo que no existe es el paso de detección a contenido
publicado. Hoy hay tres superficies y ninguna cierra el ciclo:

| Superficie | Qué hace | Por qué no alcanza |
|---|---|---|
| `analytics_content_gaps` | Agrupa por **categoría** y marca las que no tienen lección | Una categoría no es una pregunta: no dice qué escribir |
| Explorador de conversaciones | Filtra por `bot_no_info` / `knowledge_gap` | Lista conversaciones, no problemas; sin estado, nada queda "atendido" |
| ✨ Sugerir desde preguntas reales (`js/admin.js:1554`) | Trae preguntas fallidas de la categoría al editor | Solo sirve si ya decidiste escribir esa FAQ; no te dice cuál escribir |

### Los dos defectos de la señal actual

**1. `bot_no_info` se pisa en cada turno.** `js/assistant.js:780` hace un upsert
con `bot_no_info: data.knowledge_gap` en *cada* respuesta del bot. Si el turno 4
falla y el turno 5 contesta bien, la columna vuelve a `false` y ese vacío
desaparece del conteo. Es la explicación principal de la brecha entre los 250
que juzga el LLM y los 127 marcados.

**2. Es a nivel de conversación, no de turno.** No existe en ningún lado el
texto de *la pregunta que falló*. Hoy se aproxima con el primer mensaje del
usuario (`firstUserMessage`, `js/faq-suggest.js`), que en una conversación de
varios turnos suele ser otra pregunta distinta.

De ahí la decisión de fondo de esta spec: **el vacío se captura en el turno que
falla, con el texto exacto de esa pregunta.** Es una fila nueva, no una
relectura de `bodi_conversations`.

## Alcance

**Dentro:**

- Captura de la pregunta fallida en el turno, escrita desde n8n.
- Agrupación por similitud de embedding en un "vacío" con identidad estable.
- Panel nuevo en el admin: lista, detalle, resolución, descarte y división.
- Resolución hacia un bloque `bot_faq` de una lección existente.
- Badge de pendientes en el sidebar + resumen diario.
- Detector de silencio del registro.
- Calibración del umbral con las ~250 preguntas históricas.

**Fuera, y por qué:**

| Fuera | Razón |
|---|---|
| Lecciones anidadas / mini-lecciones | No existen: `lecciones` es una tabla plana sin `parent_id`. Es un cambio al modelo de contenido (jerarquía, navegación del portal, `curso_orden`, embeddings por hijo), no un destino de la bandeja. Proyecto aparte. |
| Destinos "lección nueva" y "bloque de pasos" | v2 de la bandeja. `bot_faq` es el camino más corto de vacío a bot respondiendo, y el único destino que ya tiene editor, embedding y sugerencias. |
| Borrador redactado por LLM | Subsistema 3 del plan mayor. Se apoya sobre esta spec. |
| MCP Claude ↔ bot | Subsistema 4. Después de esto es una capa delgada sobre las mismas RPCs; antes de esto sería releer conversaciones crudas en cada sesión, sin dejar rastro. |
| Fusionar dos vacíos, y re-anclar uno | Ver decisión 7: el riesgo con la calibración prevista es el contrario (absorber de más, no partir de más), y re-anclar reintroduce el problema que evita la decisión 3. Fusionar queda a un parámetro de distancia si hace falta. |
| Las 21 filas de `preguntas_frecuentes` | Hallazgo aparte, ver "Hallazgos colaterales". |

## Decisiones

### 1. Escribe n8n, no el navegador

Va en contra de lo que hace hoy `assistant.js`, que escribe las señales de
interacción desde el cliente. Tres razones:

- El navegador se puede cerrar justo después de la respuesta fallida, y ese
  vacío se perdería. El dato original es irrecuperable.
- n8n ya tiene el nodo de Vertex que genera embeddings, y la pregunta necesita
  uno.
- Escribir desde el frontend obligaría a abrirle un `INSERT` a `anon` sobre las
  tablas nuevas — justo el tipo de política que se cerró en
  `bodi_conversations` después del 2026-09-16 (verificado: `anon` ya devuelve 0
  filas de esa tabla, mientras `lecciones` devuelve 37).

**A verificar antes de implementar:** con qué credencial escribe hoy el webhook
de embeddings (`EMBED_WEBHOOK`, `js/admin.js:29`) en `lecciones.embedding`. Si
resulta ser `anon`, el diseño de escritura cambia y hay que revisarlo.

### 2. Una sola RPC transaccional, no tres viajes

`registrar_pregunta_sin_respuesta(texto, embedding, conversation_id, vertical,
plataforma, categoria) → vacio_id`.

Dentro de la función, en una transacción: buscar el vacío más cercano por
coseno con el mismo filtro de vertical; si alguno pasa el umbral, colgar la
pregunta de él; si no, crear un vacío nuevo con esa pregunta como título
provisional.

Si n8n hiciera buscar → decidir → insertar en tres llamadas, dos preguntas
parecidas que llegan a la vez abrirían dos vacíos duplicados.

### 3. El embedding del vacío es un ancla fija, no un centroide

Se graba el embedding de la primera pregunta y **no se recalcula**. Un centroide
móvil hace que el vacío se desplace: entra una pregunta en el borde, el centro
se corre, y a las veinte preguntas el vacío absorbe cosas que no tienen que ver
con la original. Con ancla fija el vacío significa siempre lo mismo, que es lo
que un flujo con estado exige.

Se guarda igual el embedding de **cada** pregunta: no cuesta nada, es lo que
permite dividir un vacío (decisión 7) y deja abierta la puerta a recalcular si
el ancla resulta mala.

El precio de esta decisión es que un umbral flojo hace que un vacío absorba
preguntas vecinas y nada lo corrige solo. La salida es manual y explícita:
dividir.

### 4. El matching filtra por vertical

La misma pregunta en Retail y en Restaurantes no es el mismo vacío, porque la
respuesta es distinta. `match_lessons` ya filtra por vertical
(`update_match_lessons_vertical.sql`); esto sigue esa convención.

### 5. Ningún estado cambia solo

`pendiente` → `resuelto` (con lección) o `descartado` (con motivo). Las
preguntas nuevas se siguen colgando en los tres estados y solo mueven
contadores.

Un vacío resuelto que recibe preguntas nuevas **no se reabre**: se muestra
aparte como *"resuelto hace 8 días, y desde entonces lo preguntaron 5 veces
más"*. Eso no dice "falta contenido" — dice **el contenido existe y el bot no lo
está recuperando**, que es un problema distinto (umbral de `match_lessons`,
embedding sin regenerar, lección apagada). Es la señal más valiosa del sistema y
sale de contar filas.

Lo mismo con los descartados: si algo descartado vuelve muchas veces, la bandeja
lo saca otra vez a la superficie.

### 6. El umbral se calibra con datos, no a ojo

Las ~250 preguntas históricas son el set de calibración. Un umbral muy alto da
250 vacíos de una pregunta cada uno (inútil: es el explorador que ya existe);
uno muy bajo mete "cómo cobro con tarjeta" y "cómo anulo una venta" en el mismo
saco (peor que inútil).

El valor final vive en `app_settings` con su columna `env`, así que se puede
mover en sandbox sin tocar producción.

### 7. Dividir un vacío es manual, y no toca el ancla del original

Cuando un vacío absorbió preguntas que no van juntas, en el detalle se
seleccionan las que sobran y se mandan a un vacío nuevo.

**El vacío original conserva su ancla.** Recalcularla al dividir sería el
centroide móvil que descarta la decisión 3, por la puerta de atrás: el vacío
original cambiaría de significado justo cuando alguien estaba atendiéndolo. El
vacío nuevo toma como ancla el embedding de la pregunta **más antigua** de las
seleccionadas, que es la misma regla con la que nace cualquier vacío.

No hace falta re-anclar el original para que la división sirva hacia adelante:
el matching elige el vacío **más cercano** por encima del umbral, así que en
cuanto existe el vacío nuevo, las preguntas futuras de ese tema caen ahí solas.
Por eso **re-anclar queda fuera** — no resuelve nada que la división no resuelva
ya, y sí reintroduce el problema que la decisión 3 evita.

`dividir_vacio(p_vacio_id, p_pregunta_ids uuid[], p_titulo text) → uuid`,
transaccional, con cuatro validaciones:

| Caso | Qué hace |
|---|---|
| Selección vacía | Rechaza |
| Alguna pregunta no pertenece a ese vacío | Rechaza entera, no parcial |
| Se seleccionan **todas** las preguntas | Rechaza: eso es renombrar el vacío, no dividirlo, y dejaría un vacío huérfano de cero preguntas |
| Selección válida | Crea el vacío nuevo, remapea `vacio_id`, y **recalcula** `preguntas_total`, `primera_vez` y `ultima_vez` de los dos desde `bot_vacios_preguntas` |

Los contadores se recalculan y no se incrementan: después de mover filas, un
contador derivado por suma se desincroniza en cuanto algo falla a mitad de
camino.

**Si el vacío original estaba `resuelto`, el nuevo nace `pendiente`** — y esto
es lo importante, no un detalle: la FAQ que se escribió no cubre lo que se
acaba de separar. Nacer heredando `resuelto` escondería contenido faltante
detrás de un vacío ya cerrado.

La división se registra en `activity_log` con la acción `move` ("Movió"), que ya
existe (`js/admin.js:2837`), con el vacío origen y destino en `details`.

**Fusionar queda fuera de v1.** Es el problema inverso (umbral alto que parte un
mismo tema en dos) y el riesgo real con la calibración prevista es el contrario.
La RPC está pensada para que agregarlo después sea un parámetro nullable de
destino: `null` crea un vacío nuevo, un id manda las preguntas a uno existente.
Es la misma operación con otro destino.

### 8. Enfoques descartados

**Job nocturno con un LLM que agrupa.** Agrupa mejor semánticamente y titula
solo, pero cada corrida re-agrupa desde cero: un vacío resuelto puede reaparecer
partido en dos, y uno que estabas atendiendo cambia de forma bajo los pies. Una
bandeja con estado necesita que las filas no se muevan.

**Normalización de texto (dedup por texto + categoría).** Casi gratis y la mitad
ya existe, pero "¿cómo hago una devolución?" y "como devuelvo un producto"
quedarían como dos vacíos distintos. Con este volumen produce una bandeja de N
vacíos de una pregunta cada uno, que es el explorador actual con otro nombre.

## Modelo de datos

Dos tablas nuevas. **No se agrega ni se modifica ninguna columna de
`bodi_conversations` ni de `lecciones`.** El explorador de conversaciones y el
dashboard BolBot no se tocan: la bandeja se para sobre tablas nuevas, así que no
puede romper nada que ya esté en producción.

### `bot_vacios`

| columna | tipo | nota |
|---|---|---|
| `id` | `uuid` pk | |
| `titulo` | `text` | provisional = la pregunta que lo abrió; editable a mano |
| `embedding` | `vector(768)` | el ancla, ver decisión 3 |
| `categoria` | `text` | heredada de la primera pregunta |
| `vertical` | `text` | heredada; participa del matching |
| `plataforma` | `text` | heredada |
| `estado` | `text` | `check (estado in ('pendiente','resuelto','descartado'))` |
| `motivo_descarte` | `text` | null salvo descartado |
| `leccion_id` | `uuid` | `references lecciones(id) on delete set null` |
| `preguntas_total` | `int` | contador desnormalizado, para ordenar barato |
| `primera_vez` | `timestamptz` | |
| `ultima_vez` | `timestamptz` | |
| `resuelto_at` | `timestamptz` | |
| `resuelto_por` | `text` | correo del usuario autenticado que lo cerró, como en `logActivity` |
| `created_at` | `timestamptz` | |

### `bot_vacios_preguntas`

| columna | tipo | nota |
|---|---|---|
| `id` | `uuid` pk | |
| `vacio_id` | `uuid` **nullable** | `references bot_vacios(id) on delete cascade`. Null = sin clasificar, ver "Errores" |
| `texto` | `text` | la pregunta exacta del turno que falló |
| `embedding` | `vector(768)` | nullable, ver "Errores" |
| `conversation_id` | `uuid` | `references bodi_conversations(id) on delete set null` |
| `created_at` | `timestamptz` | |

### Índices

- `hnsw` sobre `bot_vacios.embedding` con `vector_cosine_ops`.
- `(estado, ultima_vez desc)` sobre `bot_vacios`, para la bandeja.
- `(vacio_id, created_at desc)` sobre `bot_vacios_preguntas`, para el detalle.

### Acceso

Cero políticas para `anon` en ambas tablas. Lectura y escritura solo por RPC
`security definer` con `revoke ... from public, anon` y `grant execute to
authenticated`, igual que todas las analíticas del repo.

## Flujo

1. El flujo **Bold POS Chat** determina `knowledge_gap: true` (ya lo hace; es lo
   que alimenta `data.knowledge_gap` en `assistant.js`).
2. En esa misma rama, n8n genera el embedding de **la pregunta de ese turno**.
3. n8n llama a `registrar_pregunta_sin_respuesta(...)` y recibe el `vacio_id`.
4. El admin lee la bandeja con `analytics_bot_vacios(...)`.
5. Resolver escribe un bloque `bot_faq` en la lección elegida y dispara el
   re-embeber que ya existe.

## La bandeja

**Dónde vive.** Panel nuevo en el sidebar del admin, después de "Sugerencias",
detrás de un toggle de módulo en `app_settings` — el mecanismo por entorno que
entró en producción el 2026-09-16. Se enciende en sandbox, se usa con datos
reales, y producción no lo ve hasta que se decida.

**La lista.** Vacíos `pendiente` ordenados por `preguntas_total` desc: el más
preguntado arriba, que es el que más duele. Cada fila: título, *"preguntado 9
veces · última hace 2 días"*, chips de vertical y categoría. Filtros por estado,
vertical y categoría.

Arriba, separada, una franja con **"resueltos que siguen preguntándose"**. Va
primero porque es más barata de arreglar que escribir contenido nuevo, y porque
si no se ve, nadie se entera nunca.

**El detalle.** Al abrir un vacío se ven las preguntas reales con su fecha, cada
una con enlace a su conversación en el explorador que ya existe. Eso es lo que
permite escribir la respuesta: no se adivina qué quiso decir el usuario, se leen
los nueve intentos.

Es también donde se nota que el agrupamiento se equivocó. Cada pregunta lleva un
checkbox; con una o más seleccionadas aparece **"Mover a un vacío nuevo"**, que
pide un título y llama a `dividir_vacio` (decisión 7). La acción está en el
detalle y no en la lista a propósito: dividir bien exige leer las preguntas, y
desde la lista solo se ve el título.

**Resolver.** Un modal con selector de lección destino, **Pregunta base**
(precargada con el título), **Variaciones** (precargadas con las preguntas del
cluster pasadas por `dedupeQuestions`, que ya existe y ya está testeado) y
**Respuesta**, que es lo único que se escribe de cero. Al confirmar: leer el
`contenido` de la lección, agregar el bloque `bot_faq`, guardar, disparar
`embedLesson` (`js/admin.js:29`) y pasar el vacío a `resuelto` con su
`leccion_id`.

Modal propio, y no "abrir el editor de lecciones con el bloque ya puesto",
porque hilar dos pantallas para saber cuándo marcar el vacío como resuelto es
más código y más frágil que reusar los dos módulos puros. El bloque queda
editable después desde el editor normal.

**Descartar.** Motivo de una lista corta (`no aplica` / `es soporte` /
`duplicado` / `ruido`) más una nota opcional. El motivo no es burocracia: a los
dos meses dice si el detector genera basura y de qué tipo.

**El aviso.** Badge con el conteo de pendientes en el sidebar (se ve al entrar,
cuesta una consulta) más un resumen diario por n8n con los vacíos nuevos y los
que cruzaron el **umbral de urgencia**: un `preguntas_total` a partir del cual
un vacío deja de ser uno más de la lista. Vive en `app_settings` junto al umbral
de coseno, arranca en 5 y se ajusta con uso.

Una vez al día y no uno por vacío: con ~4 vacíos diarios, un aviso inmediato se
silencia en una semana.

## Errores y observabilidad

### El silencio de n8n es el riesgo número uno

Esta spec mete una dependencia dura en n8n. Si el nodo nuevo falla o alguien
edita mal el workflow, los vacíos dejan de registrarse **sin error visible en
ningún lado**, y un módulo muerto se ve igual que un buen día sin vacíos.

Detector barato: la bandeja compara el `max(started_at)` de las conversaciones
con `knowledge_gap` en `bodi_conversations` contra el `max(created_at)` de
`bot_vacios_preguntas`. Si la primera es mucho más reciente, se avisa en la
cara: *"el bot reportó vacíos hace 3 horas pero no se registra ninguno desde
hace 2 días"*. Son dos `max()` y una resta.

### `supabase-js` no lanza en error

Toda lectura de la bandeja verifica `error` explícitamente y pinta un estado de
error. **Prohibido el `?? 0` en el render**: un contador que dice "0 vacíos
pendientes" porque la consulta falló es peor que una pantalla rota, porque
parece una buena noticia. Ya pasó tres veces en este proyecto.

### Si Vertex tira cuota, la pregunta no se pierde

La RPC acepta `embedding null`: la pregunta se guarda con `vacio_id` en null —
el cubo de "sin clasificar" — y se reprocesa después, cuando haya cuota. Perder
la pregunta sería perder un dato irrecuperable; no agruparla es un inconveniente
reversible.

La bandeja muestra ese cubo como una franja propia con su conteo, no lo esconde:
si crece, es que la cuota de Vertex está topando de forma sostenida y hay que
mirarlo.

### Escribir `lecciones.contenido` desde un segundo lugar

Es exactamente la clase de bug que ya vació lecciones antes (ver
`2026-07-27-integridad-contenido-lecciones-design.md`). El modal debe:

1. Releer `contenido` **justo antes** de escribir, no usar una copia leída al
   abrir el modal.
2. Parsearlo con `parseLessonBlocks`, que ya maneja el doble formato JSON /
   HTML legacy.
3. Agregar el bloque al arreglo parseado — **nunca** construir `contenido` desde
   cero.

Si alguien tenía la lección abierta en el editor, el último en guardar pisa al
otro; con relectura inmediata la ventana es de milisegundos en vez de minutos.

## Pruebas

Baseline al 2026-09-19: **311 tests, 311 pasan** (`node --test tests/*.test.mjs`).

Lógica pura en módulos import-safe, según el patrón del repo:

- **`js/gap-faq-block.js`** — dado un vacío y los bloques parseados de una
  lección, devolver el arreglo nuevo. Es el test que protege contra volver a
  vaciar una lección, y al ser puro se puede probar a fondo: contenido JSON,
  HTML legacy, contenido vacío, lección con bloques existentes, lección con un
  `bot_faq` que ya trata el mismo tema.
- **`js/gap-lifecycle.js`** — derivar el estado mostrado (pendiente /
  resuelto-pero-sigue-preguntándose / descartado-que-vuelve) a partir de
  contadores y fechas, y el veredicto del detector de silencio.
- **`js/gap-split.js`** — dadas las preguntas de un vacío y una selección,
  validar la división y calcular los contadores resultantes de ambos vacíos.
  Cubre los cuatro casos de la decisión 7: selección vacía, pregunta ajena,
  selección total, y el caso válido. Las mismas reglas viven en la RPC (que es
  quien manda, porque es transaccional); el módulo puro es lo que permite
  probarlas a fondo y lo que deshabilita el botón antes de un viaje perdido.
- `dedupeQuestions` ya está testeado; solo se reusa.

**Lo que no se puede cubrir con `node --test`**, dicho en vez de fingir
cobertura: la RPC SQL, el nodo de n8n y la UI. Esos van con verificación manual
documentada: mandar una pregunta de prueba por el webhook, ver la fila aparecer
en la bandeja, resolverla, y confirmar que el bot responde con esa FAQ.

Para la división, una verificación manual propia porque toca la identidad de los
vacíos: dividir uno con varias preguntas, confirmar que los contadores de ambos
cuadran con las filas reales, que el ancla del original no cambió, y que una
pregunta nueva del tema separado cae en el vacío nuevo y no en el viejo.

## Pasos manuales del usuario

- Correr las migraciones SQL en el SQL Editor de Supabase (las tablas, los
  índices y las RPCs). El editor muestra solo el resultado de la última
  sentencia, así que las consultas de diagnóstico van de a una.
- Aprobar el cambio en el workflow de n8n "Bold POS Chat".
- Revisar los grupos que produzca la calibración y elegir el umbral.

## Calibración (antes de encender el registro en vivo)

Script de un solo uso en `scripts/`: toma las ~250 preguntas históricas con
`knowledge_gap`, las embebe, y imprime los grupos que salen con varios umbrales
para poder elegir mirando. Es desechable.

## Hallazgos colaterales

**Hay dos cosas llamadas "FAQ" y el bot solo ve una.** `preguntas_frecuentes` es
una tabla propia con 21 filas, panel "P. Frecuentes", visible en el portal, con
columnas `pregunta`, `respuesta`, `orden`, `leccion_id`, `link_url`. **No tiene
`embedding` ni `vertical`**, y `match_lessons` solo busca en `lecciones` → el
bot no puede usar ninguna de esas 21 respuestas. Resolver un vacío en un bloque
`bot_faq` tampoco lo publica en ese panel. Fuera del alcance de esta spec, pero
vale la pena decidirlo aparte.

**La política de lectura anónima de `bodi_conversations` se cerró.** Verificado
el 2026-09-19: `anon` devuelve 0 filas de esa tabla y 37 de `lecciones`. Esto
contradice lo registrado el 2026-09-16 y es una buena noticia.

## Subsistemas en cola

Esta spec es el primero de cuatro. El orden importa: el 3 y el 4 son baratos
encima de este y caros sin él.

| # | Pieza | Depende de |
|---|---|---|
| **1+2** | Vacío concreto + bandeja (**esta spec**) | — |
| **3** | Borrador redactado por LLM desde el cluster | 1+2 |
| **4** | MCP Claude ↔ bot, sobre las mismas RPCs | 1+2 |
| **5** | Lecciones anidadas / mini-lecciones (modelo de contenido) | independiente |
