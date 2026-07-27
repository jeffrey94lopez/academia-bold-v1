# Tres pendientes: biblioteca recursiva, sanitizado del HTML legacy, archivos huérfanos · Spec de diseño

Los tres pendientes que quedaron abiertos al cerrar la puerta 3 (master `1c81c60`), elegidos por el usuario el 2026-07-27. **Queda explícitamente afuera** la migración de `contenido` a `jsonb` (sesión propia, con spec y plan aparte) y la policy de UPDATE en Storage (la tiene que aplicar el usuario en el dashboard; el código ya no la necesita).

## Frente A — El selector de biblioteca ve dentro de las carpetas

`openMediaLibrary` (`js/admin.js:2909`) lista con `listFiles('')`: **solo la raíz**. Un archivo dentro de una carpeta no se puede elegir, ni para reemplazar un enlace roto ni al armar un bloque de imagen. Es preexistente y afecta a los dos flujos.

`listAllFiles()` ya recorre el bucket entero paginando. Pasa a devolver **objetos** `{ path, size, type, url }` en vez de rutas peladas, y el selector lo usa. Su único consumidor actual (`escanearEnlaces`) se ajusta a `.map(f => f.url)`.

Dos ajustes chicos que van con esto:
- La búsqueda del selector filtra por **ruta completa**, no solo por el nombre del archivo, así se puede tipear el nombre de la carpeta.
- Cada tarjeta muestra la carpeta cuando el archivo está en una: sin eso, dos archivos con el mismo nombre en carpetas distintas se ven idénticos.

## Frente B — Sanear el HTML legacy antes de renderizarlo

El bloque `html` (`js/block-renderer.js`) pinta HTML crudo con `innerHTML`, igual que hacía `js/lessons.js:204` antes de la puerta 2. Solo un admin autenticado puede escribir ahí y la CSP de `vercel.json` bloquea scripts inline, pero el ítem sigue abierto en la auditoría y la puerta 2 lo dejó formalizado, no cerrado.

### La política, aislada y testeable

La decisión (*qué se permite*) va a un módulo puro nuevo `js/html-policy.js`; el recorrido del DOM (*mecánica*) vive en el renderer. Así la parte con criterio se testea en Node aunque el walker necesite `document`.

**Etiquetas permitidas** — las que puede haber escrito a mano un admin en una lección:

`p br strong b em i u s ul ol li h1 h2 h3 h4 h5 h6 blockquote code pre span div a img table thead tbody tfoot tr th td caption hr small sub sup`

**Todo lo demás se elimina, y con dos tratos distintos:**
- `script style iframe object embed form input button select textarea link meta svg math` → se borra **con su contenido** (lo que hay dentro no es texto de la lección).
- Cualquier otra etiqueta desconocida → se **desenvuelve**: se borra la etiqueta pero se conservan sus hijos, para no perder texto por un tag raro.

**Atributos permitidos:** `class`, `title`, `id` en cualquier etiqueta; `href` en `a`; `src alt width height loading` en `img`; `target rel` en `a`; `colspan rowspan` en `td`/`th`.

- **Todo `on*` se elimina** (`onerror`, `onclick`, …). Es el vector real: `<img src=x onerror=…>` pasa cualquier CSP de scripts inline porque es un atributo, no un `<script>`.
- `style` **se elimina**. No permite ejecutar JS en navegadores actuales, pero habilita `position:fixed` a pantalla completa sobre la UI del portal, y ninguna lección lo necesita.
- En `href` y `src` solo se aceptan `http:`, `https:`, `mailto:`, `tel:` y `data:image/`. Se rechaza `javascript:`, `vbscript:`, `file:`, cualquier otro `data:`, y las variantes con espacios, saltos de línea o mayúsculas mezcladas (`jAvAsCrIpT:`, `java\nscript:`). Si el valor no pasa, **se borra el atributo** y el elemento se queda.
- A todo `<a>` que quede se le fuerza `rel="noopener noreferrer"` y `target="_blank"`.

**Criterio de conservación:** ante la duda, conservar el contenido y descartar el atributo. Lo que este cambio no puede hacer es romper lecciones viejas: por eso las etiquetas desconocidas se desenvuelven en vez de borrarse, y un `href` inválido no se lleva puesto el texto del enlace.

### Alcance del sanitizado

Solo el bloque `html` en `js/block-renderer.js` — el único punto por el que hoy entra HTML legacy, gracias a que la puerta 2 unificó los tres lectores. **No** entra acá el ítem #2 de la auditoría (escapar el cuerpo del bot en `renderMarkdown` y el `onclick` roto del lightbox): es otro camino y otro lote.

## Frente C — Archivos huérfanos en la auditoría

`Revisar enlaces` gana una sección: archivos que están en el bucket y **nadie referencia**. Cubre los huérfanos que puede dejar un `copy` + `remove` fallido y, sobre todo, libera espacio.

### Lo que hace segura esta lista

Ofrecer "borrar" a partir de un escaneo incompleto es peligroso: si el escaneo no mira un campo donde alguien pegó una URL, marca como huérfano un archivo en uso y el admin lo borra. Hoy las referencias se buscan solo en `lecciones.contenido`, `material_apoyo.url` y `preguntas_frecuentes.link_url` — pero nada impide que una URL del bucket esté en las `notas` de una lección, en la `respuesta` de una FAQ o en la `definicion` de un término del glosario.

Por eso la recolección de referencias se generaliza: `select('*')` sobre las tablas con texto libre —`lecciones`, `material_apoyo`, `preguntas_frecuentes`, `glosario`, `bot_sugerencias`— y `extractBucketUrls` aplicado a **todos los valores string de cada fila**, no a un campo elegido a mano. Así aparecen también las URLs de campos que ni conocemos, y de paso mejora la detección de enlaces rotos.

**Fail-closed:** si cualquiera de esas consultas falla, no se muestran huérfanos (una lista de huérfanos armada con referencias incompletas es exactamente la que hace borrar cosas en uso).

**El límite que no se puede cerrar, y se dice en la UI:** un archivo puede estar en uso fuera de la Academia — un link compartido por WhatsApp, pegado en otro sitio. El escaneo no puede saberlo. Por eso el aviso dice "nadie los usa **dentro de la Academia**", el borrado es **uno por uno** con confirmación (no hay "borrar todos"), y se muestra el tamaño para que el admin decida.

## Interfaces / unidades

- `listAllFiles() => Promise<Array<{ path, size, type, url }>>` (`js/upload.js`) — **cambio de firma**: antes devolvía `string[]`.
- `js/html-policy.js` — puro: `isAllowedTag(tag)`, `isDroppedWithContent(tag)`, `isAllowedAttr(tag, attr)`, `isSafeUrlValue(value)`.
- `sanitizeInto(container, html)` (`js/block-renderer.js`) — la mecánica: parsea, recorre y aplica la política.
- `urlsDeFila(row, prefijo)` (`js/admin.js`) — todas las URLs del bucket en cualquier columna string de una fila.

## Testing

`tests/html-policy.test.mjs` (nuevo):
- `isSafeUrlValue`: acepta `http://`, `https://`, `mailto:`, `tel:`, `data:image/png;base64,…`; rechaza `javascript:alert(1)`, ` javascript:…` con espacios delante, `jAvAsCrIpT:`, `java\nscript:`, `vbscript:`, `data:text/html`, `file:///`, vacío y no-string.
- `isAllowedTag` / `isDroppedWithContent`: `p` y `img` permitidas; `script` e `iframe` se borran con contenido; `marquee` (desconocida) no está permitida pero **no** se borra con contenido → se desenvuelve.
- `isAllowedAttr`: `href` sí en `a` y no en `p`; `src` sí en `img`; `onerror` nunca; `style` nunca; `class` en cualquiera; `colspan` en `td` y no en `div`.

Los tests de `extractBucketUrls`, `countReferences`, `diffBrokenUrls` y `pathFromBucketUrl` ya existen y no cambian.

`js/block-renderer.js`, `js/admin.js` y `js/upload.js` usan `document`/`supabase` → `node --check` más la suite verde, más verificación en navegador:

1. Lección legacy con payload: `<p>hola</p><img src=x onerror="window.__xss=1"><script>window.__xss2=1</script><a href="javascript:alert(1)">link</a><marquee>texto</marquee>` → tiene que verse "hola", el texto del link, el texto del `marquee`, y `window.__xss`/`__xss2` tienen que quedar `undefined`.
2. Una lección legacy real, para confirmar que el marcado legítimo (listas, negritas, tablas) se ve igual que antes.
3. Selector de biblioteca: aparece un archivo que está dentro de una carpeta, y se puede elegir.
4. Huérfanos: subir un archivo que nadie usa → aparece listado; pegar su URL en las `notas` de una lección → deja de aparecer.

## Resultado de la verificación (2026-07-27)

Los tres frentes verificados en navegador contra la base real, con material de descarte que quedó borrado.

**Sanitizado**, con el payload del plan: `window.__xss` y `window.__xss2` quedaron `undefined` (ni el `onerror` ni el `<script>` corrieron), `script`/`iframe` desaparecieron, el `onerror` y el `style` se eliminaron, el `href="javascript:…"` se cayó **conservando el texto del enlace**, el `<marquee>` se desenvolvió conservando su texto, y el marcado legítimo quedó intacto (negrita, lista de 2 ítems, `colspan="2"`, `class`, `id`). Al `<a>` válido se le puso `rel="noopener noreferrer"` y `target="_blank"`.

**Selector de biblioteca:** pasó de listar solo la raíz a 82 archivos, incluido uno dentro de una carpeta, con la etiqueta `📁 zzz-carpeta-prueba` en la tarjeta.

**Huérfanos:** los dos archivos de prueba aparecieron listados (16 huérfanos en total en el bucket real). La prueba que valida el diseño: al pegar la URL de uno en las **notas** de una lección —un campo que el escaneo anterior no miraba— dejó de figurar como huérfano (15). Sin recorrer todas las columnas, esa lista habría ofrecido borrar un archivo en uso. El borrado individual funciona y pide confirmación.

**Nota de entorno:** una pestaña de Chrome quedó en un estado donde todo `fetch`/`import()` lanzado desde la automatización colgaba 45 s aunque la página funcionaba; se resolvió abriendo una pestaña nueva. No es un problema del código.

## Alcance

- Rama `sandbox`, merge a `master` cuando el usuario apruebe. Estilo del repo: 2 espacios, sin punto y coma, comentarios en español.
- Solo frontend. Sin migraciones.

**Fuera de alcance:** migrar `contenido` a `jsonb`; la policy de UPDATE en Storage; el ítem #2 de la auditoría (cuerpo del bot y lightbox); los ítems #7 y #10; limpieza automática de huérfanos sin intervención del admin.
