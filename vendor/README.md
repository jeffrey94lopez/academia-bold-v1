# vendor/

Librerías y assets servidos desde el portal, sin CDN.

## SheetJS

- `xlsx.full.min.js` — SheetJS 0.20.3 (lectura y escritura de xlsx). Se carga lazy desde
  `js/inv-sesion.js:cargarXlsx`. El proyecto usa esta copia (no npm) porque el CSP solo
  permite `'self'` y la versión de npm 0.18.5 tiene avisos de seguridad conocidos.

## Códigos de barras y QR

Se cargan lazy desde `js/barras-render.js:cargarLib`. Antes venían de cdn.jsdelivr.net sin
SRI; ahora son copias locales (el archivo es idéntico, byte a byte, al del tarball de npm
publicado en registry.npmjs.org, verificado con sha256).

| Archivo | Paquete / versión | Fuente | Licencia | sha256 |
|---|---|---|---|---|
| `jsbarcode-3.11.5.all.min.js` | jsbarcode 3.11.5 | `dist/JsBarcode.all.min.js` | MIT | `e307d9489aca4985f8e1c9bc246e8c275a091953c539e2b7b50b511efea59509` |
| `qrcode-generator-1.4.4.js` | qrcode-generator 1.4.4 | `qrcode.js` | MIT | `18ae399f81182bc9de916e9c77b195df20cc58d6f2d55a62b085a299f1bf1780` |
| `jszip-3.10.1.min.js` | jszip 3.10.1 | `dist/jszip.min.js` | MIT OR GPL-3.0-or-later (se usa bajo MIT) | `acc7e41455a80765b5fd9c7ee1b8078a6d160bbbca455aeae854de65c947d59e` |

URLs: `https://registry.npmjs.org/<paquete>/-/<paquete>-<versión>.tgz` (carpeta `package/`).
Para actualizar: bajar el tarball nuevo, comparar sha256 contra jsDelivr, reemplazar el
archivo y la ruta en `LIBS` de `js/barras-render.js`.

## Lucide

- `lucide.min.js` — íconos SVG. Se carga en todas las páginas.

## Plantillas base de Bold POS

Las usa el camino **mono-sucursal** del conversor de inventario para armar una plantilla
sintética sin pedirle al cliente que descargue la suya (ver
`docs/superpowers/specs/2026-11-11-inventario-monosucursal-y-saneamiento-design.md`).

- `bold-plantilla-base-inventariable.xlsx` — plantilla "Sin Factura Electrónica" de
  inventariables. Una sola columna de existencia (`Sucursal-2611 - Sucursal Principal`). El
  runtime la renombra al `warehouseId` del cliente y, si tiene FE activa, le inyecta la
  columna `Impuesto*` y reescribe la hoja `Instrucciones`.
- `bold-plantilla-base-noinventariable.xlsx` — ídem para no-inventariables. Sin columnas
  de existencia (por definición).

### Cómo rotar

Bold puede cambiar el formato en cualquier momento. Rotación manual:

1. Entrar a una cuenta Bold POS con **una sola sucursal** y **sin facturación electrónica**.
2. Ítems → Lista de ítems → Importar → Iniciar creación masiva.
3. Descargar las dos plantillas (inventariable + no inventariable).
4. Reemplazar los 2 archivos de `vendor/` por los recién bajados, conservando los nombres
   `bold-plantilla-base-inventariable.xlsx` y `bold-plantilla-base-noinventariable.xlsx`.
5. Correr `node --test tests/inv-plantilla-sintetica.test.mjs` — el smoke test valida la
   estructura.
6. Si el test falla por cambio de estructura, hay que actualizar `js/inv-plantilla-sintetica.js`
   para acompañar el cambio.

Última rotación: 2026-11-11 (cuenta demo de Jeffrey, `warehouseId=2611`).
