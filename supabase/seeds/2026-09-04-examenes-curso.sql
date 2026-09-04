-- Exámenes del curso Bold POS — 6 lecciones × 4 preguntas.
-- Generado el 2026-09-04. Las preguntas salen del propio `contenido` de cada lección.
--
-- El curso (js/course-tab.js) se arma con TODAS las lecciones activas que tengan
-- examen, sin filtrar por vertical ni plataforma: estas 6 lecciones retail/web SON
-- el curso. Se aprueba con 70% (js/course.js), así que con 4 preguntas el estudiante
-- puede fallar una (75%) y pasar.
--
-- Ejecutar en el SQL editor de Supabase. Al final hay una consulta de verificación
-- y, comentado, el rollback.

BEGIN;

-- Apertura de turno
UPDATE lecciones SET examen = $json$
{
  "preguntas": [
    {
      "pregunta": "¿Cómo se abre un turno?",
      "opciones": [
        "Desde las configuraciones",
        "En los reportes",
        "Desde Punto de Venta / Al iniciar una venta."
      ],
      "correcta": 2
    },
    {
      "pregunta": "¿Qué valor puedes digitar en el campo \"Monto inicial\" al abrir el turno?",
      "opciones": [
        "El total de las ventas del día anterior",
        "Cero o el monto base de efectivo con el que inicias el día",
        "El efectivo contado al final del turno",
        "Ninguno: el sistema lo calcula y no se puede editar"
      ],
      "correcta": 1
    },
    {
      "pregunta": "Además de abrirlo al iniciar una venta, ¿cuál es la otra ruta para abrir un turno?",
      "opciones": [
        "Configuración → Caja → Abrir turno",
        "Reportes → Turnos → Abrir nuevo turno",
        "Punto de venta → Turnos → Abrir nuevo turno",
        "Egresos → Gastos → Abrir turno"
      ],
      "correcta": 2
    },
    {
      "pregunta": "¿Qué ocurre si no abres el turno?",
      "opciones": [
        "No puedes comenzar a facturar",
        "Las ventas se guardan como borrador hasta que lo abras",
        "El sistema abre el turno automáticamente con base en cero",
        "Solo se bloquean los reportes del día"
      ],
      "correcta": 0
    }
  ]
}
$json$::jsonb WHERE id = 'a5bd9f77-9fb5-4130-8ae6-6f188f88a81e';

-- Cierre de turno
UPDATE lecciones SET examen = $json$
{
  "preguntas": [
    {
      "pregunta": "¿Desde dónde se cierra un turno?",
      "opciones": [
        "Reportes → Cierre de caja",
        "Punto de venta → Turnos → botón Cerrar turno",
        "Configuración → Turnos → Cerrar",
        "Egresos → Gastos → Cerrar turno"
      ],
      "correcta": 1
    },
    {
      "pregunta": "Al cerrar el turno, ¿cuál de estos campos es obligatorio?",
      "opciones": [
        "Observaciones",
        "Saldo inicial",
        "Método de pago",
        "Efectivo contado"
      ],
      "correcta": 3
    },
    {
      "pregunta": "¿Qué debes digitar en el campo \"Efectivo contado\"?",
      "opciones": [
        "La cantidad real de dinero físico que tienes en la caja",
        "El total de las ventas registradas en el turno",
        "El monto base con el que abriste el turno",
        "La diferencia entre lo esperado y lo contado"
      ],
      "correcta": 0
    },
    {
      "pregunta": "Si el efectivo contado no coincide con el esperado, ¿qué pasa?",
      "opciones": [
        "El sistema bloquea el cierre hasta que los montos coincidan",
        "El sistema ajusta el efectivo esperado para que cuadre",
        "El sistema calcula la diferencia automáticamente y tú escribes el motivo en Observaciones",
        "Se anulan las ventas en efectivo del turno"
      ],
      "correcta": 2
    }
  ]
}
$json$::jsonb WHERE id = 'b05beb6c-dac0-4ef1-8d66-071514edbfab';

-- Creación de ítems de forma individual
UPDATE lecciones SET examen = $json$
{
  "preguntas": [
    {
      "pregunta": "¿Cuál es la ruta para crear un ítem de forma individual?",
      "opciones": [
        "Ítems → Lista de ítems → Nuevo ítem",
        "Inventario → Ajuste de inventario → Nuevo",
        "Punto de venta → POS → Nuevo ítem",
        "Configuración → Productos → Agregar"
      ],
      "correcta": 0
    },
    {
      "pregunta": "Si dejas vacío el campo de código del producto, ¿qué ocurre?",
      "opciones": [
        "No se puede guardar el ítem",
        "El sistema le asigna un código de forma automática",
        "El ítem se crea sin código y no aparece en las búsquedas",
        "El código queda igual al nombre del ítem"
      ],
      "correcta": 1
    },
    {
      "pregunta": "En la sección \"precio total de venta\", ¿qué valor debes introducir?",
      "opciones": [
        "El precio final con impuestos incluidos; el sistema los descuenta",
        "El costo de adquisición del producto",
        "El precio base antes de impuestos y luego seleccionar el impuesto; el sistema calcula el total",
        "El precio base; los impuestos se configuran solo al momento de facturar"
      ],
      "correcta": 2
    },
    {
      "pregunta": "¿Cuándo debes activar el botón de disponibilidad?",
      "opciones": [
        "Siempre, es obligatorio para poder crear el ítem",
        "Cuando el ítem es un servicio",
        "Cuando el producto no tiene costo de adquisición",
        "Cuando el producto es inventariable, para ingresar las unidades listas para la venta"
      ],
      "correcta": 3
    }
  ]
}
$json$::jsonb WHERE id = '240b1b6d-b77c-41b9-b3d8-1a4770d14627';

-- Creación de clientes y proveedores
UPDATE lecciones SET examen = $json$
{
  "preguntas": [
    {
      "pregunta": "¿Cuál es la ruta para crear un contacto de forma individual?",
      "opciones": [
        "Contactos → Importar → Nuevo",
        "Contactos → Nuevo contacto",
        "Ventas → Clientes → Nuevo",
        "Configuración → Terceros → Agregar"
      ],
      "correcta": 1
    },
    {
      "pregunta": "Si un tercero es a la vez cliente y proveedor, ¿qué haces en \"Tipo de contacto\"?",
      "opciones": [
        "Puedes marcar ambas opciones en el mismo contacto",
        "Debes crear dos contactos separados",
        "Solo puedes elegir uno de los dos roles",
        "El sistema lo define según la primera transacción que registres"
      ],
      "correcta": 0
    },
    {
      "pregunta": "Para la creación masiva de contactos, ¿por dónde empiezas?",
      "opciones": [
        "Armando tu propio archivo CSV con las columnas que necesites",
        "Desde la app móvil, escaneando los documentos de cada contacto",
        "Contactos → Importar → Iniciar creación masiva, y descargas la plantilla de Excel",
        "Contactos → Nuevo contacto, y pegas la lista en un campo de texto"
      ],
      "correcta": 2
    },
    {
      "pregunta": "En la plantilla de Excel de contactos, ¿cómo identificas las columnas obligatorias?",
      "opciones": [
        "Están marcadas con un asterisco",
        "Están resaltadas en color rojo",
        "Son siempre las primeras cinco columnas",
        "Todas las columnas de la plantilla son obligatorias"
      ],
      "correcta": 0
    }
  ]
}
$json$::jsonb WHERE id = '4ffa465e-3e96-48d9-8a63-a092cedb0ca3';

-- Venta por medio de factura electrónica
UPDATE lecciones SET examen = $json$
{
  "preguntas": [
    {
      "pregunta": "Para emitir una factura electrónica, ¿qué debes seleccionar en la sección \"Resolución\"?",
      "opciones": [
        "La opción comprobante de venta",
        "La opción consumidor final",
        "La opción factura electrónica",
        "Nada: la resolución se define al momento de pagar"
      ],
      "correcta": 2
    },
    {
      "pregunta": "Si el cliente no está registrado en el sistema, ¿qué puedes hacer?",
      "opciones": [
        "Crearlo desde la misma venta completando los campos obligatorios, o usar Consumidor final",
        "Cancelar la venta y registrarlo primero en el módulo de Contactos",
        "Facturar sin cliente; el sistema lo solicita después",
        "Únicamente usar la opción Consumidor final"
      ],
      "correcta": 0
    },
    {
      "pregunta": "¿Cómo aplicas un descuento a toda la venta y no a un solo producto?",
      "opciones": [
        "Haciendo clic sobre cada producto y editando su precio",
        "Con el botón descuento en la parte inferior, por porcentaje o por valor",
        "Cambiando el precio del ítem en el módulo de Ítems",
        "En la ventana de pago, restando el valor del monto total"
      ],
      "correcta": 1
    },
    {
      "pregunta": "Una factura electrónica que ya fue guardada:",
      "opciones": [
        "Se puede editar el mismo día de su emisión",
        "Se puede modificar mientras el turno siga abierto",
        "Se edita desde Reportes con permiso de administrador",
        "No se puede editar ni modificar"
      ],
      "correcta": 3
    }
  ]
}
$json$::jsonb WHERE id = 'fc5790c7-db32-43bd-aa08-0e547c45d3ce';

-- Registro de gastos
UPDATE lecciones SET examen = $json$
{
  "preguntas": [
    {
      "pregunta": "¿Cuál es la ruta para registrar un gasto?",
      "opciones": [
        "Ingresos → Gastos → Nuevo",
        "Reportes → Gastos → Agregar",
        "Egresos → Gastos → Nuevo gasto",
        "Contactos → Proveedores → Nuevo gasto"
      ],
      "correcta": 2
    },
    {
      "pregunta": "¿Cuáles de estos campos son obligatorios al crear un gasto?",
      "opciones": [
        "Categoría, fecha y método de pago",
        "Proveedor, categoría y observaciones",
        "Proveedor, fecha e imagen del recibo",
        "Únicamente el método de pago"
      ],
      "correcta": 0
    },
    {
      "pregunta": "Si activas el botón para asociar el gasto al turno actual, ¿qué pasa?",
      "opciones": [
        "El gasto queda pendiente hasta que cierres el turno",
        "El gasto se resta automáticamente del dinero de ese turno al hacer el cierre de caja",
        "El gasto se registra pero no afecta el efectivo del turno",
        "El turno se cierra de forma automática"
      ],
      "correcta": 1
    },
    {
      "pregunta": "¿Es obligatorio asociar un proveedor al gasto?",
      "opciones": [
        "Sí, sin proveedor no se puede crear el gasto",
        "Sí, y además debe estar registrado previamente en Contactos",
        "No, es opcional; y si es nuevo lo puedes crear con el botón + azul",
        "No, pero entonces el gasto no afecta el inventario"
      ],
      "correcta": 2
    }
  ]
}
$json$::jsonb WHERE id = '6d28f3c8-d773-4085-887c-6a6654827d3d';

COMMIT;

-- ── Verificación ───────────────────────────────────────────────────────────
-- Deben salir 6 filas, cada una con 4 preguntas.
-- select titulo, categoria, jsonb_array_length(examen->'preguntas') as preguntas
-- from lecciones where examen is not null order by categoria, orden;

-- ── Rollback ───────────────────────────────────────────────────────────────
-- Deja el curso como estaba: sin examen en las 6 lecciones.
-- OJO: "Apertura de turno" tenía 1 pregunta antes de este script; el rollback
-- también la borra. Su valor original era:
--   {"preguntas":[{"correcta":2,"opciones":["Desde las configuraciones","En los reportes",
--   "Desde Punto de Venta / Al iniciar una venta."],"pregunta":"Como se abre un turno"}]}
-- update lecciones set examen = null where id in (
--   'a5bd9f77-9fb5-4130-8ae6-6f188f88a81e',
--   'b05beb6c-dac0-4ef1-8d66-071514edbfab',
--   '240b1b6d-b77c-41b9-b3d8-1a4770d14627',
--   '4ffa465e-3e96-48d9-8a63-a092cedb0ca3',
--   'fc5790c7-db32-43bd-aa08-0e547c45d3ce',
--   '6d28f3c8-d773-4085-887c-6a6654827d3d'
-- );
