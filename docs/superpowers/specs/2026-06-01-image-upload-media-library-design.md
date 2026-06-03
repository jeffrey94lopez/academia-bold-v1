# Spec: Subida de imágenes nativa + biblioteca de medios

**Proyecto:** Bold POS Academy — Academia Oficial de Bold POS  
**Fecha:** 2026-06-01  
**Estado:** Aprobado

---

## Contexto

El admin actual requiere que los administradores suban archivos manualmente desde el dashboard de Supabase, copien la URL pública y la peguen en el campo de URL del bloque de imagen. Este flujo es lento y propenso a errores. Se necesita subida nativa con drag & drop directamente desde el admin.

---

## Alcance

### Incluido
- Widget de drag & drop (o clic para buscar) en el bloque de imagen del editor de lecciones
- Modal de biblioteca de medios: galería de archivos ya subidos, buscador, selección que inyecta el URL automáticamente
- Panel Material renovado: galería en cuadrícula con todos los archivos del bucket, subida, copia de URL y eliminación
- Módulo `js/upload.js` centralizado que maneja toda la lógica de Supabase Storage
- Renombrar la app a **Bold POS Academy — Academia Oficial de Bold POS** en `admin.html` e `index.html`

### Excluido
- Redimensionado o compresión de imágenes (se sube el archivo original)
- Control de acceso por rol (el admin ya requiere auth)
- Versionado de archivos

---

## Arquitectura

### Nuevo módulo: `js/upload.js`

Tres funciones exportadas, sin dependencias externas más allá del cliente Supabase existente:

```js
// Sube un archivo al bucket. Devuelve { url, path } o lanza error.
async function uploadFile(file, bucket = 'material', folder = null)

// Lista todos los archivos de una carpeta del bucket.
// Devuelve array de { name, url, size, type, created_at }
async function listFiles(bucket = 'material', folder = null)

// Elimina un archivo por su path dentro del bucket.
async function deleteFile(bucket, path)
```

La carpeta se determina automáticamente por tipo MIME si `folder` es null:
- `image/*` → `images/`
- `application/pdf` → `docs/`
- `video/*` → `videos/`
- otros → `other/`

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `js/upload.js` | Nuevo módulo |
| `admin.html` | Importar upload.js, añadir modal de biblioteca, renombrar título |
| `js/admin.js` | Reemplazar campo URL manual del bloque imagen; integrar galería en panel Material |
| `index.html` | Renombrar título a Bold POS Academy |

No se tocan: `supabase.js`, `auth.js`, `lessons.js`, `block-renderer.js`, ni ningún otro módulo.

---

## UI: Widget de drag & drop (bloque de imagen)

Reemplaza el campo de texto de URL manual. Muestra:

1. **Zona de arrastre** con borde punteado, ícono y texto "Arrastra una imagen aquí o"
2. **Dos botones:**
   - "📁 Buscar archivo" — abre `<input type="file">` nativo
   - "🗂️ Elegir de biblioteca" — abre el modal de biblioteca de medios
3. **Barra de progreso** durante la subida (usa el evento `onUploadProgress` del SDK de Supabase)
4. **Estado post-subida:** miniatura del archivo + URL copiable + botón para cambiar
5. La zona cambia de color (highlight) cuando un archivo se arrastra encima (`dragover`)

---

## UI: Modal de biblioteca de medios

Modal overlay que se añade al final de `admin.html` y se controla con JS puro.

**Estructura:**
- Barra superior: botón "Subir archivo", buscador de texto, contador de archivos
- Cuadrícula de 4 columnas con tarjetas por archivo (ícono por tipo, nombre truncado, tamaño)
- Tarjeta seleccionada: borde azul destacado
- Footer del modal: botón "Cancelar" y botón "Usar [nombre]" (activo solo cuando hay selección)
- Botón de eliminar en cada tarjeta (hover) con confirmación inline

**Modo de apertura:**
- Exclusivamente desde el bloque de imagen del editor de lecciones. Al confirmar la selección, inyecta el URL en el bloque y cierra el modal.
- El panel Material tiene su propia galería integrada (no usa este modal).

---

## UI: Panel Material renovado

Reemplaza el contenido actual del panel Material con:

1. **Zona de drag & drop** en la parte superior para subir nuevos archivos (igual que el widget del bloque de imagen, pero sin el botón "Elegir de biblioteca")
2. **Cuadrícula de archivos** usando `listFiles()` al entrar al panel
3. **Cada tarjeta** muestra ícono por tipo, nombre, tamaño y dos acciones en hover:
   - 📋 Copiar URL (con toast de confirmación)
   - 🗑️ Eliminar (con confirmación)
4. **Buscador** filtra la cuadrícula en tiempo real (client-side, sin nueva llamada a Supabase)

---

## Flujo de datos

```
Usuario arrastra/selecciona archivo
  → upload.js valida tamaño (máx 50MB) y tipo MIME
  → Determina carpeta destino
  → supabase.storage.from('material').upload(path, file, { upsert: true })
  → Supabase devuelve path
  → supabase.storage.from('material').getPublicUrl(path)
  → upload.js devuelve { url, path }
  → admin.js inyecta URL en el bloque / refresca galería
```

---

## Manejo de errores

| Caso | Comportamiento |
|---|---|
| Archivo > 50MB | Mensaje de error antes de intentar la subida. Sin llamada a Supabase. |
| Error de red / Supabase | Toast de error con mensaje legible. El archivo seleccionado no se pierde. |
| Error al listar archivos | Galería muestra estado vacío con mensaje y botón "Reintentar" |
| Archivo duplicado | Supabase sobrescribe (upsert: true). Sin error al usuario. |
| Eliminación fallida | Toast de error. El archivo permanece en la galería. |

---

## Permisos de Supabase Storage

El bucket `material` ya existe. Antes de implementar, verificar en el dashboard de Supabase que la política RLS del bucket permite `INSERT` y `DELETE` con el anon key (o con el JWT del usuario autenticado). Si no, añadir política:

```sql
-- Permitir subida a usuarios autenticados
CREATE POLICY "Admins can upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'material');

CREATE POLICY "Admins can delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'material');
```

---

## Renombrado de la app

Todos los `<title>`, headers visibles, y metadatos en `admin.html` e `index.html` pasan de "Academia Bold" a **"Bold POS Academy — Academia Oficial de Bold POS"**.

---

## Criterios de éxito

- [ ] Se puede subir un archivo arrastrándolo a la zona de drag & drop
- [ ] Se puede subir un archivo haciendo clic y seleccionando desde el explorador
- [ ] La barra de progreso muestra avance real durante la subida
- [ ] Al subir desde el bloque de imagen, el URL se inyecta automáticamente en el bloque
- [ ] La biblioteca de medios muestra todos los archivos del bucket en cuadrícula
- [ ] El buscador filtra archivos en tiempo real
- [ ] Copiar URL desde Material muestra un toast de confirmación
- [ ] Eliminar un archivo lo remueve del bucket y de la cuadrícula sin recargar la página
- [ ] El título de la app dice "Bold POS Academy — Academia Oficial de Bold POS"
- [ ] Errores muestran mensajes claros sin romper la UI
