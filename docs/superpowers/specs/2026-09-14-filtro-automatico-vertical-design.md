# Filtrado automático por vertical — diseño

Fecha: 2026-09-14
Estado: aprobado, pendiente de plan de implementación

## Problema

Bold POS ya nos dice en producción a qué vertical pertenece el comercio
(`bold:context` con `businessType`, ver `js/bold-context.js`). Hoy ese dato solo
se usa para preseleccionar la vertical en la pestaña de Lecciones. El resto del
portal lo ignora:

| Superficie | Estado al 2026-09-14 |
|---|---|
| Lecciones (portal) | Filtra y autoaplica el contexto de Bold (`js/lessons.js:636`) |
| Bot — `match_lessons` | La RPC acepta `p_vertical`/`p_plataforma`, pero el nodo "Buscar lecciones" de n8n no los manda |
| Bot — `faq_context` | El front manda **todas** las FAQ en el body del webhook |
| Preguntas frecuentes | Sin columna `vertical` |
| Glosario | Sin columna `vertical` |
| `bodi_conversations.vertical` | La columna existe y está en `null` en las 559 filas: nadie la escribe |

Resultado: un restaurante ve preguntas frecuentes de retail, y el bot puede
citarle lecciones de una vertical que no es la suya.

## Alcance

**Dentro:** lecciones (valor `ambas`), preguntas frecuentes, glosario, el bot
(retrieval + `faq_context` + lenguaje), y guardar la vertical en analíticas.

**Fuera:** material de apoyo y la pestaña Curso — decisión explícita del
usuario. También queda fuera reclasificar el contenido existente: es trabajo de
contenido, no de código.

## Decisiones

1. **Modelo de datos: un valor más en la columna de texto.** `vertical` acepta
   `'retail' | 'restaurantes' | 'ambas'` en las tres tablas. Se descartó una
   columna de arreglo (`verticales text[]`): soportaría N verticales pero obliga
   a migrar `lecciones` de `text` a `text[]` y a tocar todo lo que hoy lee
   `l.vertical` (admin, analíticas, `match_lessons`, duplicar-lección, badges),
   por una tercera vertical que nadie ha pedido. Bold solo tiene dos
   `business_type`, ambos verificados en cuentas reales. Migrar de este modelo
   al de arreglo, si algún día hace falta, es un `ALTER` mecánico.

2. **`'ambas'` es el default de las tablas nuevas.** Las FAQ y términos que ya
   existen siguen visibles para todos: la migración no esconde contenido y nadie
   tiene que reclasificar nada antes del deploy.

3. **La vertical de Bold no se sobrescribe.** Hoy `resolverSeleccion` cambia de
   vertical sola si la elegida no tiene lecciones. Con el selector oculto eso
   sería mentir. Pasa a resolver solo la plataforma; si la vertical de Bold no
   tiene contenido, sale el estado vacío que ya existe.

4. **El interruptor del admin sigue mandando.** `vertical_<v>_enabled = 'false'`
   gana sobre el dato de Bold: es el control deliberado de "todavía no
   lanzamos".

5. **Se oculta la tarjeta de vertical, no el chip de plataforma.** Bold no manda
   `platform` (va fijo en `'web'`). Ocultar los dos controles dejaría a todos
   clavados en Web sin forma de llegar a las lecciones Mobile.

6. **El bot filtra por vertical pero NO por plataforma.** La vertical es un dato
   duro del POS; la plataforma sale del chip del usuario, con `web` por defecto.
   Filtrar por plataforma haría que un comercio que usa la app móvil dejara de
   encontrar respuestas existentes, con el síntoma "el bot no sabe nada" y
   ninguna pista de por qué.

7. **No se rellena el histórico de analíticas.** Las 559 conversaciones sin
   vertical se quedan en `null`. Asignarles `retail` porque "todo el contenido
   era retail" sería fabricar un dato.

## Arquitectura

### Regla única de filtrado

En `js/vertical.js`:

```js
export function aplicaA(item, vertical) {
  const v = item?.vertical || 'retail'   // ausente = retail, convención del repo
  return v === 'ambas' || v === vertical
}
```

La usan `lessons.js`, `resources.js`, `assistant.js` y `admin.js`. La misma
condición se replica en SQL dentro de `match_lessons`. Es el único lugar donde
se define qué significa que un contenido "aplique" a una vertical.

En `lecciones`, `vertical` ausente cuenta como `retail` (convención existente).
En las tablas nuevas la columna es `NOT NULL DEFAULT 'ambas'`, así que ese caso
no se da, pero la función queda tolerante para que un `select` parcial que no
traiga la columna no esconda contenido.

### Migración SQL

Un archivo nuevo en `supabase/migrations/`:

```sql
alter table public.lecciones drop constraint if exists lecciones_vertical_check;
alter table public.lecciones add constraint lecciones_vertical_check
  check (vertical in ('retail','restaurantes','ambas'));

alter table public.preguntas_frecuentes
  add column if not exists vertical text not null default 'ambas'
    check (vertical in ('retail','restaurantes','ambas'));

alter table public.glosario
  add column if not exists vertical text not null default 'ambas'
    check (vertical in ('retail','restaurantes','ambas'));
```

El nombre real de la constraint hay que confirmarlo contra
`information_schema.table_constraints` antes de ejecutar: si Postgres la creó
con otro nombre, el `drop ... if exists` no hace nada y el `add` falla por
duplicado.

Y otra migración para `match_lessons`, que solo cambia el `WHERE`:

```sql
AND (p_vertical IS NULL OR l.vertical = p_vertical OR l.vertical = 'ambas')
```

El tipo de retorno no se mueve, así que `CREATE OR REPLACE` basta sin `DROP`
previo (mismo razonamiento documentado en `update_match_lessons_activas.sql`).
La base es la versión vigente, que incluye `notas`, `active` y `bot_active`.

### Portal

**`js/lessons.js`** — en `selectorHtml()` (línea 82):

```js
const showVerticales = verticalesShown.length >= 2 && !verticalFijadaPorBold()
```

con `verticalFijadaPorBold()` = `!!getContextoBold()?.vertical && !isStaff()`. El
re-render ya está resuelto: `onContextoBold` llama a `applySeleccion`, que llama
a `renderSelectors()`, así que si el mensaje de Bold llega después del primer
pintado la tarjeta desaparece sola. `isStaff()` (hoy privada en `lessons.js:25`)
se mueve a `js/utils.js` para que la use también `resources.js`: es modo de
operación del portal, no algo propio de las verticales, así que no va en
`vertical.js`.

**`js/resources.js`** — hoy no importa nada de verticales. Las consultas de FAQ y
glosario piden también la columna `vertical`; el render filtra con `aplicaA`; el
módulo se suscribe a `onContextoBold` para repintar si el contexto llega tarde.
La sub-pestaña de material de apoyo no se toca. No lleva selector visible.

**`js/assistant.js`** — `loadFaqContext()` pide la columna `vertical` y sigue
cacheando **todas** las FAQ. El filtrado con `aplicaA` ocurre en `sendMessage`,
justo antes de pasar `faqContext` a `chatRequestBody`, no al cargar: así, si el
contexto de Bold llega después de la carga inicial de FAQs, el primer mensaje ya
sale filtrado. `clarify.js` no cambia y sigue siendo puro: recibe las FAQ ya
filtradas.

### Admin

- Formulario de lecciones: el toggle de vertical gana la tercera opción
  **Ambas**.
- Filtro del listado (`admin.js:991`): hoy es
  `(l.vertical || 'retail') === adminVertical`, comparación estricta que
  desaparecería una lección `'ambas'` de las dos pestañas. Pasa a
  `aplicaA(l, adminVertical)`.
- Badges: la etiqueta "Retail · Web" está escrita a mano en `admin.js:1096` y
  `:1143` con un ternario de dos ramas, mientras `vertical.js` ya exporta
  `etiqueta()` para eso. Se reemplazan por la llamada a `etiqueta()`, que gana la
  rama `'ambas'` (icono `layers`). Es la deduplicación que ya estaba anotada como
  pendiente y que «Ambas» obliga a hacer de todas formas.
- Duplicar a la otra vertical: `otraVertical('ambas')` devolvería
  `'restaurantes'`, que no significa nada. El botón se deshabilita cuando la
  lección es `'ambas'`.
- FAQ y glosario: cada formulario gana un selector de vertical de tres opciones
  (**Ambas** por defecto en altas nuevas), cada ítem del listado muestra su
  badge, y los dos paneles ganan los mismos chips de filtro que ya tiene
  lecciones, incluido "Todas".

### Bot — workflow n8n `Bold POS Chat` (`dZGuYJbRbG6h8aqv`)

No hay herramientas de n8n conectadas en la sesión: los cambios van por la API
REST con `curl` (permisos ya aprobados en `.claude/settings.local.json`).
**Respaldo del workflow a `docs/superpowers/backups/` antes de tocar nada.**

- **Nodo "Buscar lecciones"**: agregar `p_vertical` leído del body del webhook.
  `p_plataforma` se deja en `null` (decisión 6).
- **Nodo "Construir prompt"**: antepone una instrucción corta de lenguaje según
  la vertical — mesas/comandas/meseros para restaurantes,
  productos/inventario/proveedores para retail — y la regla de no ofrecer
  funciones de la otra vertical. Texto fijo por vertical, no generado.

Dos cuidados ya documentados que aplican aquí: al editar `jsCode` por la API, un
`\n` dentro de un string JS debe quedar como barra invertida + `n` literal o el
Code node tira "Invalid or unexpected token" y tumba el bot; y en el `PUT` hay
que filtrar `settings` a las claves que acepta la API pública.

### Analíticas

`createConversation()` (`assistant.js:139`) pasa a insertar `vertical` y
`plataforma` con la selección vigente. Las columnas ya existen.

En el dashboard de BolBot, un chip de filtro Retail / Restaurantes / Todas junto
al selector de rango. Las conversaciones históricas aparecen como "sin vertical".
Filtrar de verdad implica pasar `p_vertical` a varias RPCs de analítica: va al
final del plan y, si se alarga, se entrega como tanda aparte. El valor grande
está en empezar a guardar el dato.

## Riesgos

- **Bold manda una vertical equivocada.** Con el selector oculto el comercio no
  tiene escape. Mitigación: `?staff=1` muestra el selector para que soporte
  pueda verificar y reproducir.
- **La constraint de `lecciones` puede tener otro nombre.** Se confirma contra
  `information_schema` antes de ejecutar la migración.
- **`supabase-js` no lanza en error** y un `?? 0` en el render fabrica datos
  creíbles. Después de migrar, se verifica por REST crudo que las columnas
  existen y que las consultas filtradas devuelven lo esperado; no basta con que
  la UI se vea bien.
- **Editar el workflow por API puede tumbar el bot.** Respaldo previo y prueba
  del webhook con `x-api-key` antes de dar por bueno el cambio.

## Pruebas

Unitarias con `node:test`, como el resto del repo:

- `aplicaA`: los 3 valores × 2 verticales, valor ausente, valor basura.
- Filtrado de FAQ y glosario.
- `otraVertical` con `'ambas'`.
- `chatRequestBody` manda la vertical y las FAQ ya filtradas.

En navegador, sobre el portal real, simulando el `postMessage` de Bold con el
snippet que ya existe, en las dos verticales: que la tarjeta de vertical
desaparezca, que el chip Web/Mobile siga, que FAQ y glosario filtren, y que
`?staff=1` devuelva el selector.

## Orden sugerido

1. Migración SQL + `aplicaA` + pruebas unitarias.
2. Portal: lecciones (ocultar tarjeta), resources (FAQ y glosario), assistant
   (`faq_context`).
3. Admin: lecciones con `'ambas'`, dedupe de badges, formularios y chips de FAQ
   y glosario.
4. Bot: `match_lessons` y los dos nodos de n8n.
5. Analíticas: escribir `vertical`/`plataforma`; el filtro del dashboard al
   final.
