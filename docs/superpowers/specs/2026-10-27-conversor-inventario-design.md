# Conversor de inventario a plantilla Bold POS — diseño

Fecha: 2026-10-27 · Estado: implementación en `sandbox` (solo ítems simples; **variantes fuera de alcance**)

## Por qué

Las cuentas nuevas se atascan al cargar el inventario: migrar desde el sistema anterior,
crearlo desde cero o adivinar la plantilla. Hoy lo hace el equipo a mano.

## Qué es

Una página del portal (`inventario.html`), enlazada desde el Centro de Ayuda, que corre
**100 % en el navegador del cliente**: no usa IA, no gasta tokens y los datos no salen del
equipo. El cliente sube:

1. su(s) **plantilla(s) de Bold POS** (inventariables y/o no inventariables), y
2. el **archivo de productos** de su sistema anterior (Alegra, Siigo, Excel propio…),

y descarga la plantilla de Bold llena, con el mismo ID de sucursal y las mismas listas.

## Decisiones tomadas por el usuario

- Cada plantilla de Bold es única por cuenta (el encabezado de existencia lleva
  `Sucursal-<id> - <nombre>`; la hoja *Instrucciones* lleva impuestos, unidades y
  categorías de esa cuenta). Nunca se genera una plantilla propia: **se rellena la que sube el cliente**.
- Las categorías deben existir en Bold antes de importar → la herramienta lista las que faltan
  con botón **Copiar** (una por línea) para pegarlas al crearlas.
- La columna **ISV/impuesto** solo existe en la plantilla si la cuenta tiene facturación
  electrónica; es la **última columna**. La herramienta lo pregunta (y lo detecta si la plantilla
  ya la trae).
- Variantes: después.

## Decisiones mías (a revisar)

- Sin IA en esta versión. Más adelante, solo para proponer el mapeo de columnas que el
  diccionario no reconozca (encabezados + 3 filas, nunca el archivo entero).
- Librería de Excel: SheetJS 0.20.x autoalojada en `vendor/` (el CSP solo permite `'self'` y jsDelivr;
  la versión de npm 0.18.5 tiene avisos de seguridad conocidos).
- La salida se reescribe con SheetJS Community, que **no conserva los estilos** de la plantilla
  (colores, anchos sí). Los datos, encabezados y hojas se conservan. Si Bold rechazara el archivo,
  el siguiente paso es parchar el XML de la plantilla directamente.
- Visible solo fuera de producción (`APP_ENV !== 'prod'`) hasta que el usuario decida lanzarlo.

## Flujo

1. **Plantillas de Bold.** Se reconoce cuál es cuál por el nombre de la hoja (`Item Inventariable`
   / `Item No Inventariable`) y se leen: columnas, encabezado de existencia (ID de sucursal),
   listas de impuestos / unidades / categorías, y si trae columna ISV.
2. **Archivo del cliente.** Se elige la hoja y la fila de encabezados con mejor coincidencia, y se
   mapean columnas con un diccionario de sinónimos (nombre, categoría, unidad, costo, precio,
   existencia, impuesto, inventariable/tipo…). El cliente corrige el mapeo con listas desplegables.
3. **Revisión.** Resumen (filas, a cuál plantilla va cada una), avisos por fila, unidades sin
   equivalente (el cliente elige), categorías por crear (con **Copiar**), pregunta del ISV y del
   formato de números.
4. **Descarga.** Un `.xlsx` por plantilla usada. Cada fila con error se omite y queda en el reporte.

## Reglas de conversión

- **Inventariable vs no:** columna `Inventariable`/`Tipo` si existe (Alegra la trae); si no, por
  presencia de columna de existencia; si no, el cliente elige para todo el archivo.
- **Números:** aceptan `5000,000000`, `1.234,50`, `1,234.50`, `$ 5.950`. Un separador con exactamente
  3 dígitos detrás se toma como miles; el cliente puede forzar «punto decimal» o «coma decimal».
- **Precio Venta Total:** se usa el total del archivo; si solo hay precio base + impuesto, se calcula.
- **Impuesto → ISV:** se busca en la lista de la plantilla por el número del nombre (`IVA-19` → 19);
  0 → `EXENTO`.
- **Unidades:** coincidencia sin tildes/plurales + sinónimos (`und`, `kg`, `lb`…); lo desconocido lo elige el cliente.
- **Categoría vacía:** `General` si existe en la plantilla.
- **Códigos largos:** se tratan como texto; los que Excel ya dañó (`7.5E+12`) generan aviso.
- **Existencia:** si el archivo no la trae (el export de Alegra **no** la trae; está en el reporte
  *Valor de inventario*) se deja en 0 y se avisa.
- Filas sin nombre o sin precio válido: error, no se exportan.

## Fuera de alcance

Variantes · segunda carga de existencias · enlace desde el bot (n8n) · IA para el mapeo.

## Archivos

`js/inv-numeros.js`, `js/inv-origen.js`, `js/inv-plantilla.js`, `js/inv-convertir.js`,
`js/inv-ui.js`, `inventario.html`, `css/inventario.css`, `vendor/xlsx.full.min.js`,
pruebas en `tests/inv-*.test.mjs` con fixtures reales en `tests/fixtures/`.
