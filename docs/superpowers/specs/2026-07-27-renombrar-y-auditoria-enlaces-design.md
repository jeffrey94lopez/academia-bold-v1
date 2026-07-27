# Renombrar sin romper enlaces + auditoría de enlaces rotos · Spec de diseño

**Puerta 3** de la clase de bug documentada en `lecciones-contenido-doble-formato`, más el daño histórico que esa puerta viene acumulando. Las puertas 1 (`cascadeUpdateUrl`, 2026-07-25) y 2 (el editor de lecciones legacy, 2026-07-27) están cerradas y en producción (`master` en `48935b2`).

## Objetivo

Que renombrar un archivo deje de romper las lecciones que lo usan, que borrar uno diga a quién va a afectar antes de hacerlo, y que el admin pueda ver y reparar los enlaces que ya están rotos.

## El bug

```js
// js/admin.js:2963-2968 — confirmar el renombrado
try {
  await renameFile(_renameCurrentPath, newName)
  modal.classList.add('hidden')
  showToast('Archivo renombrado correctamente')
  ...
```

`renameFile` (`js/upload.js:67-82`) mueve el objeto en Storage a una ruta nueva —siempre distinta, porque le agrega `-${Date.now()}`— y devuelve `{ path, url }`. **El handler descarta ese retorno y nunca llama a `cascadeUpdateUrl`.** Las lecciones y los materiales de apoyo quedan apuntando a un objeto que ya no existe: imagen rota, contenido intacto.

Es la misma omisión que la puerta 1, por la entrada de al lado: `handleFileMoveToFolder` (`js/admin.js:1640-1650`) sí hace la cascada; `confirmRename` no.

**El caso hermano, sin arreglo posible:** borrar un archivo referenciado (`js/admin.js:1978-1992`) rompe las mismas lecciones. Ahí no hay URL nueva a la que apuntar, así que lo único honesto es avisar antes.

**El daño acumulado:** hasta hoy, cada renombrado dejó referencias colgadas. No hay forma de saber cuántas sin mirar.

## Corrección durante la implementación: la confirmación no puede ser un HEAD al CDN

El diseño elegía confirmar cada candidata con un `HEAD` a la URL pública. La verificación en navegador lo desmintió: **el CDN sirve objetos ya borrados desde su caché.** Medido sobre un archivo eliminado hace segundos:

| prueba | resultado |
|---|---|
| `HEAD` a la URL pública | **200** |
| `HEAD` con `cache: 'no-store'` | 400 |
| `HEAD` con query nueva (`?v=…`) | 400 |
| API de Storage (`list` + `search`) | **no lo encuentra** |

Dos consecuencias: el HEAD plano daba falsos "sana" (el escaneo no reportaba nada), y el endpoint público responde **400, no 404**, cuando el objeto no está — el código solo trataba 404 como rota.

La confirmación pasa a ser `fileExists(path)` contra la **API de Storage**, el mismo origen de verdad que ejecutó el borrado: sin caché de por medio y sin depender de los status codes del CDN. La ruta se deriva de la URL con `pathFromBucketUrl(url, prefijo)`, que es puro y va con tests. Los tres estados y el fail-closed se mantienen: si la API no puede responder, la URL es "no verificable" y no ofrece reemplazo.

## Corrección durante la implementación: son tres tablas, no dos

El brainstorm concluyó que solo `lecciones.contenido` y `material_apoyo.url` referencian el bucket. Falta una: **`preguntas_frecuentes.link_url`** (`js/admin.js:1477`). Es un campo "Link externo (opcional)", un `input type="url"` que el admin escribe a mano, sin selector de biblioteca — pero nada impide pegar ahí la URL de un PDF del bucket, y en ese caso mover, renombrar o borrar el archivo lo rompe igual.

Se incluye en los tres lugares: la cascada (`cascadeUpdateUrl`), el aviso de borrado y el escaneo. **Tenían que ser los tres o ninguno:** si la auditoría reportara un `link_url` roto pero la cascada no lo actualizara, el botón "Reemplazar…" no arreglaría nada y la entrada volvería a aparecer en el escaneo siguiente.

## Diseño

### 1. `js/bucket-urls.js` — el núcleo común, puro y testeable

Las tres piezas necesitan lo mismo: *¿qué URLs del bucket menciona este texto, y cuáles ya no existen?* Módulo puro nuevo (patrón de `content-url.js` y `lesson-blocks.js`: sin DOM, sin supabase, import-safe en Node).

```
extractBucketUrls(raw, publicPrefix) => string[]
countReferences(rows, campo, url)    => number
diffBrokenUrls(referenced, existing) => string[]
```

**`extractBucketUrls(raw, publicPrefix)`** — todas las URLs del bucket presentes en un string, únicas y en orden de aparición.

| Entrada | Salida |
|---|---|
| JSON de bloques con dos imágenes distintas | las dos URLs |
| HTML legacy con `<img src="…">` | la URL del `src` |
| la misma URL dos veces | una sola vez |
| URL con `?t=123` o `#x` | la URL sin query ni hash |
| `null`, `undefined`, `''`, no-string | `[]` |
| prefijo vacío o no-string | `[]` |

Opera sobre el **texto crudo**, no sobre la estructura parseada — la lección de las puertas 1 y 2: un solo camino sirve para el JSON de bloques y para el HTML legacy, y ninguna rama depende de que el contenido parsee.

El corte de la URL es por caracteres que no pueden formar parte de ella en este contexto: espacios, `"`, `'`, `<`, `>`, `)` y `\`. Cubre tanto `"url":"…"` del JSON como `src="…"` del HTML.

El prefijo público se construye de forma determinista, no con `getPublicUrl`: `${SUPABASE_URL}/storage/v1/object/public/material/`. Se exporta desde `js/upload.js` como `publicUrlPrefix()` para que exista un solo lugar que lo arma.

**`countReferences(rows, campo, url)`** — cuántas **filas** mencionan la URL (no cuántas veces aparece). Alimenta el aviso de borrado. Filas sin ese campo, o con valor no-string, no cuentan.

**`diffBrokenUrls(referenced, existing)`** — las referencias que no están en el inventario, sin duplicados y en orden de entrada. Devuelve **candidatas**, no veredictos: la confirmación es el HEAD.

### 2. El fix del renombrado

`renameFile` pasa a devolver `{ newPath, newUrl, oldUrl }` — **la misma firma que `moveFile`** (`js/upload.js:84-93`), que ya resuelve exactamente este problema. Hoy devuelve `{ path, url }` y su único consumidor (`js/admin.js:2964`) descarta el retorno, así que el cambio de firma no rompe nada.

`confirmRename` queda igual que `handleFileMoveToFolder`: renombrar → `cascadeUpdateUrl(oldUrl, newUrl)` → toast → recargar. **No se escribe lógica de contenido nueva**: `remapContentUrl` ya está probado y en producción desde la puerta 1.

### 3. El aviso de borrado

Antes del `confirm` de `js/admin.js:1982`, contar referencias en `lecciones.contenido` y `material_apoyo.url` con `countReferences`, y decirlo:

> ¿Eliminar "manual.pdf"?
> La usan 3 lecciones y 1 material de apoyo. Van a quedar con el enlace roto.
> Esta acción no se puede deshacer.

Solo cambia el texto. Si confirmás, borra igual — no se bloquea el borrado. Si el conteo falla, se muestra el confirm de hoy sin el detalle: nunca se impide borrar por un error de lectura.

### 4. La auditoría

Botón `🔗 Revisar enlaces` en el header del panel de Material, junto a "Nueva carpeta" (`js/admin.js:1678-1683`). Abre un modal (`#brokenLinksModal` en `admin.html`, mismo patrón que el de renombrar) con tres estados: escaneando, resultado, error.

El escaneo, en orden:

1. **Inventario.** `listAllFiles()` nuevo en `js/upload.js`: recorre el bucket recursivamente y **pagina explícitamente** — el `listFiles` actual (`js/upload.js:28-33`) corta en 200 por carpeta y en un bucket grande eso inventa archivos faltantes. Devuelve todas las rutas existentes.
2. **Referencias.** Bajar `lecciones (id, titulo, contenido)` y `material_apoyo (id, titulo, url)`, y extraer las URLs con `extractBucketUrls`.
3. **Candidatas.** `diffBrokenUrls(referencias, inventario)`.
4. **Confirmación.** Un HEAD por candidata. Tres estados, no dos:
   - **rota** — el HEAD responde 404: se lista con botón de reemplazo.
   - **sana** — el HEAD responde OK: falso positivo del listado, se descarta en silencio.
   - **no verificable** — timeout, error de red, o cualquier status que no sea 200-ish ni 404: se lista en una sección aparte, **sin botón de reemplazo**.

El resultado se agrupa **por URL rota**, no por lección: el nombre visible (`displayName`, `js/admin.js:2824`), la URL, y debajo dónde se usa ("Lección: Apertura de turno", "Material de apoyo: Manual"). El botón `Reemplazar…` abre `openMediaLibrary()` —el mismo selector que usa el editor de bloques (`js/admin.js:2789`)— y aplica `cascadeUpdateUrl(urlRota, urlElegida)`, luego re-escanea.

Sin hallazgos: "Todos los enlaces apuntan a archivos que existen."

### Manejo de errores — todo fail-closed

- **Si el inventario falla, no se reporta nada roto.** Mensaje de error y fin. Un inventario incompleto es la única forma de que esta herramienta te haga pisar contenido sano, así que ante la duda no dice nada.
- Los HEAD van con `AbortController` (timeout 8s) y de a 5 en paralelo. Lo que no concluye es "no verificable", nunca "rota".
- **El escaneo no escribe nada.** La única escritura del flujo es el reemplazo, y siempre la dispara el admin eligiendo un archivo.
- Si el reemplazo falla, toast de error y la lista queda como estaba.

## Interfaces / unidades

- `extractBucketUrls(raw, publicPrefix) => string[]` — puro. Entrada: el `contenido` o la `url` tal como vienen de la base.
- `countReferences(rows, campo, url) => number` — puro.
- `diffBrokenUrls(referenced, existing) => string[]` — puro.
- `publicUrlPrefix() => string` (`js/upload.js`) — el prefijo público del bucket, armado en un solo lugar.
- `listAllFiles() => Promise<string[]>` (`js/upload.js`) — I/O aislada: recorre y pagina el bucket, devuelve rutas.
- `renameFile(oldPath, newDisplayName) => Promise<{ newPath, newUrl, oldUrl }>` — **cambio de firma**, alineado con `moveFile`.

## Testing

`tests/bucket-urls.test.mjs` (nuevo):

- **extractBucketUrls:** JSON de bloques con dos imágenes → las dos; HTML legacy con `<img src>` → la del `src`; la misma URL repetida → una sola vez; URL con `?t=1` y con `#x` → normalizadas; `null`/`''`/número → `[]`; prefijo vacío → `[]`; texto sin ninguna URL del bucket → `[]`.
- **countReferences:** cuenta filas, no ocurrencias (una fila que menciona la URL dos veces suma 1); respeta el campo pedido (`contenido` vs `url`); filas con el campo ausente o no-string no cuentan; lista vacía → 0.
- **diffBrokenUrls:** devuelve solo las ausentes, en orden y sin duplicados; si están todas → `[]`; inventario vacío → todas las referencias.

Los consumidores (`js/admin.js`, `js/upload.js`) usan `document` o `supabase` y no son import-safe en Node → se verifican con `node --check` más la suite verde.

**Verificación manual (en el navegador), con material de descarte:**

1. Subir una imagen, usarla en un bloque de una lección de prueba, guardar.
2. Renombrarla desde el panel de Material.
3. Abrir la lección: la imagen tiene que seguir cargando (antes de este fix, quedaba rota).
4. Intentar borrar la imagen: el confirm tiene que decir cuántas lecciones la usan. Cancelar.
5. Borrarla de verdad y abrir `Revisar enlaces`: la lección tiene que aparecer con esa URL rota.
6. Tocar `Reemplazar…`, elegir otra imagen, y confirmar que la lección la muestra.
7. Borrar la lección y el material de prueba.

## Alcance

- Rama `sandbox`, merge a `master` cuando el usuario apruebe. Estilo del repo: 2 espacios, **sin punto y coma**, comentarios en español.
- Solo frontend. Sin migraciones.

**Dos límites dichos, no resueltos:**

1. `cascadeUpdateUrl` no es transaccional: si falla a mitad, quedan lecciones actualizadas y otras no. Ya es así hoy al mover un archivo; este trabajo no lo cambia.
2. La auditoría no repara sola. Muestra el daño y da la herramienta para repararlo archivo por archivo, con el admin eligiendo cada reemplazo.

**Fuera de alcance:**

- Reparar automáticamente, sin intervención del admin.
- Quitar de la lección el bloque cuya imagen se rompió: es una escritura destructiva automática sobre `contenido`, exactamente la clase de operación que vació lecciones en las puertas 1 y 2.
- Cambiar el esquema de nombres de `renameFile` (el sufijo `-${Date.now()}`): con la cascada funcionando, que la URL cambie siempre deja de ser un problema.
- Escanear en automático al abrir el panel: el escaneo es bajo demanda.
- Migrar `contenido` a `jsonb` y unificar el doble formato de raíz.
- Los items #2 (escapar el cuerpo en `renderMarkdown` + el `onclick` del lightbox roto por la CSP), #7 (realtime de lecciones) y #10 (borrar categoría sin chequear `error`) de la auditoría del 2026-07-20.
- El XSS del contenido legacy, que la puerta 2 formalizó sin cerrar.
