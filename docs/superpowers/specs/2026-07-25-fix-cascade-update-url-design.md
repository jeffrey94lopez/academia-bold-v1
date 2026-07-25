# Hotfix — `cascadeUpdateUrl` borra el contenido de las lecciones · Spec de diseño

**Item #1 de la auditoría del 2026-07-20** (`auditoria-errores-mejoras`). Sale **solo**, como hotfix: es pérdida de datos activa en producción. Los items #2, #7 y #10 van en un lote aparte con su propio ciclo. El #9 de esa lista ya estaba arreglado (`utils.js:30-34` `csvCell` neutraliza `=+-@\t\r` y los tres dashboards pasan por `exportCSV`).

## Objetivo

Que mover un archivo a una carpeta en el panel de Material deje de destruir el contenido de las lecciones que referenciaban ese archivo.

## El bug

`cascadeUpdateUrl` (`js/admin.js:1616-1628`) tiene **dos** defectos, no uno:

```js
const updated = (Array.isArray(l.contenido) ? l.contenido : []).map(b =>
  b.url === oldUrl ? { ...b, url: newUrl } : b
)
await supabase.from('lecciones').update({ contenido: updated }).eq('id', l.id)
```

1. **`Array.isArray(l.contenido)` es siempre `false`.** `contenido` se guarda como **string**: `js/admin.js:720` escribe `contenido: JSON.stringify(currentBlocks)`, y los lectores lo parsean (`js/lessons.js:181`, `js/course-tab.js:217`). Así que la rama que se toma es `[]`, y `[].map(...)` es `[]`.
2. **La escritura usa una forma distinta a la del resto del código.** La línea 1625 pasa `updated` como array de JS, no como string; incompatible con el `JSON.stringify` de la línea 720 y con los `JSON.parse` que leen. Aun arreglando el defecto 1, esto seguiría escribiendo una forma que después revienta al leerse.

**Disparador:** `handleFileMoveToFolder` (`js/admin.js:1630-1640`), o sea arrastrar un archivo a una carpeta. Falla en silencio: no lanza, y muestra `showToast('Archivo movido…')`.

**Alcance del daño:** toda lección cuyo `contenido` contenga la URL vieja. Incluye las **legacy**: el filtro actual (`JSON.stringify(l.contenido).includes(oldUrl)`) las selecciona igual, así que hoy también se vacían las lecciones viejas escritas a mano como HTML.

## Los dos formatos de `contenido`

La misma columna guarda dos cosas (`js/lessons.js:178-183` es la referencia):

| Formato | Qué es | Cómo se detecta |
|---|---|---|
| Moderno | string JSON de un array de bloques | `JSON.parse` funciona **y** devuelve un array |
| Legacy | HTML crudo escrito a mano | `JSON.parse` falla, o parsea a algo que no es array |

El fix tiene que servir para los dos. Un enfoque estructural (parsear → buscar `b.url === oldUrl` → volver a serializar) solo cubre el moderno y deja al legacy con el link roto — o peor, vaciado, si el manejo del caso "no es array" se equivoca otra vez.

## Diseño

### Módulo puro nuevo `js/content-url.js`

Sigue el patrón de los módulos puros del proyecto (`clarify.js`, `bot-attention.js`, `inactivity.js`): sin DOM, sin red, import-safe en Node y por lo tanto testeable en aislamiento.

```
remapContentUrl(raw, oldUrl, newUrl) => string | null
```

`null` significa **no escribir esta lección**. Las reglas, en orden:

1. Si `raw` es falsy o no es string → `null`. Si `oldUrl` o `newUrl` no son strings no vacíos → `null`. Si `raw` no incluye `oldUrl` → `null`. (Nada que cambiar, o no hay con qué; no se toca la fila.)

   El guard sobre `newUrl` no es decorativo: sin él, un `newUrl` `undefined` haría que `split().join()` escribiera literalmente la palabra `undefined` dentro del contenido, y uno vacío borraría la URL. Los dos casos son silenciosos.
2. Reemplazar **todas** las ocurrencias de `oldUrl` por `newUrl` sobre el texto crudo.
3. Si `raw` parseaba como JSON y el resultado **no** parsea → `null`. Se niega a escribir algo que acaba de romper.
4. Si no, devolver el string nuevo.

La clave del diseño es que **opera sobre el string crudo**, no sobre la estructura. Consecuencias:

- **Un solo camino sirve para los dos formatos.** El moderno sigue siendo JSON válido después del reemplazo (una URL por otra dentro de un valor string); el legacy es texto y el reemplazo le arregla el link igual.
- **Es imposible que vacíe contenido.** No hay ninguna rama que produzca `[]` ni `''`: o devuelve un string que contiene todo lo que había (con la URL cambiada), o devuelve `null` y la fila no se toca.
- **La regla 3 es el fail-closed.** Cubre el caso de que `newUrl` traiga un `"` o un `\` que invalide el JSON. Las URLs de Supabase Storage vienen percent-encoded y no deberían traerlos, pero el guard no depende de ese supuesto.

Nota sobre el reemplazo por substring: si `oldUrl` fuera prefijo de otra URL distinta (`foo.png` y `foo.png.bak`), el reemplazo tocaría las dos. Se acepta: las URLs de Storage son completas y específicas, y el modo de falla (un link apuntando al archivo movido) es incomparablemente menos grave que vaciar la lección.

### Cambio en `cascadeUpdateUrl`

```
para cada lección de select('id, contenido'):
  next = remapContentUrl(l.contenido, oldUrl, newUrl)
  si next es null → saltar
  si no → update({ contenido: next })
la actualización de material_apoyo queda igual
```

Se **elimina** el filtro `affected` con `JSON.stringify(l.contenido).includes(oldUrl)`: doble-codificaba (envolvía el string en comillas y escapaba) y su trabajo lo hace ahora la regla 1 del helper. No cambia el costo de lectura: el `select` ya bajaba todas las lecciones sin filtro.

## Interfaces / unidades

- `remapContentUrl(raw, oldUrl, newUrl)` — puro, sin dependencias. Entrada: el `contenido` tal como viene de la base (string) más las dos URLs. Salida: string a escribir, o `null` para no escribir. Testeable en aislamiento.
- `cascadeUpdateUrl` — queda como orquestador de I/O: lee, delega la decisión al helper, escribe. Sin lógica de formato propia.

## Testing

`tests/content-url.test.mjs` (nuevo):

- **Moderno:** JSON de array con un bloque que matchea → devuelve JSON que sigue parseando, con la URL nueva y los demás bloques intactos.
- **Ocurrencias múltiples:** la URL repetida en varios bloques → se reemplazan todas.
- **Legacy:** HTML crudo con la URL adentro → devuelve el HTML con la URL cambiada y el resto igual.
- **Sin coincidencia:** `raw` no contiene `oldUrl` → `null`.
- **Entradas degeneradas:** `null`, `''`, y un valor que no sea string → `null`, sin lanzar.
- **Fail-closed:** JSON válido que quedaría inválido porque `newUrl` trae un `"` → `null`.
- **Legacy que no es JSON ni antes ni después:** se permite escribir (la regla 3 solo aplica si el original parseaba).

`js/admin.js` usa `document` y no es import-safe en Node → el cableado se verifica con `node --check` más la suite verde.

**Verificación manual sugerida al usuario:** hacerla con un archivo y una lección de descarte, no con contenido bueno — la prueba real mueve un archivo en Storage.

## Alcance

- Rama `sandbox`, merge a `master` cuando el usuario apruebe. Estilo del repo: 2 espacios, **sin punto y coma**, comentarios en español.
- Solo frontend. **Sin migraciones**: se descartó la red de seguridad en base (trigger que rechace vaciados) porque el diseño ya es fail-closed por construcción y habría que verificar que no rompa un "vaciar lección" legítimo del admin.

**Fuera de alcance:**

- **Reparar lo ya perdido.** El fix detiene la pérdida futura, no restaura. El diagnóstico quedó pendiente: la consulta `select count(*) from lecciones where contenido is null or length(contenido::text) <= 2` no pudo correr (el dashboard de Supabase devolvió "Failed to fetch" contra `api.supabase.com`, dos veces, incluso con una consulta de una sola fila). Hay que reintentarla y, si da > 0, decidir aparte si hay algo reconstruible.
- Los items #2 (escapar el cuerpo en `renderMarkdown` + el `onclick` del lightbox roto por la CSP), #7 (el realtime de lecciones muere al cambiar de pestaña) y #10 (borrar categoría no chequea el `error` del count) — lote aparte.
- El XSS del contenido legacy (`js/lessons.js:204` hace `innerHTML` directo).
- Migrar `contenido` a `jsonb` y limpiar los `JSON.parse` repartidos: es el arreglo de fondo del doble formato, pero toca muchos lectores y no es lo que pide un hotfix.
