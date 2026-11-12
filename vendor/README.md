# vendor/

Librerías y assets servidos desde el portal, sin CDN.

## SheetJS

- `xlsx.full.min.js` — SheetJS 0.20.3 (lectura y escritura de xlsx). Se carga lazy desde
  `js/inv-sesion.js:cargarXlsx`. El proyecto usa esta copia (no npm) porque el CSP solo
  permite `'self'` y la versión de npm 0.18.5 tiene avisos de seguridad conocidos.

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
