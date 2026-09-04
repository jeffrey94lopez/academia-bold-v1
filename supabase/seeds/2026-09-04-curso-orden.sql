-- Secuencia del curso Bold POS: el arco de un día de trabajo.
-- Requiere la migración add_curso_orden_lecciones.sql y las 6 lecciones con
-- examen de 2026-09-04-examenes-curso.sql.
--
-- Antes de esto el curso ordenaba por `orden`, que es relativo a la categoría:
-- cuatro de las seis lecciones tienen orden = 1, así que salían en un orden
-- arbitrario y "Cierre de turno" caía después de "Registro de gastos".

BEGIN;

-- 1. Apertura de turno
UPDATE lecciones SET curso_orden = 1 WHERE id = 'a5bd9f77-9fb5-4130-8ae6-6f188f88a81e';

-- 2. Creación de ítems de forma individual  (no puedes vender sin productos)
UPDATE lecciones SET curso_orden = 2 WHERE id = '240b1b6d-b77c-41b9-b3d8-1a4770d14627';

-- 3. Creación de clientes y proveedores  (ni facturar sin cliente)
UPDATE lecciones SET curso_orden = 3 WHERE id = '4ffa465e-3e96-48d9-8a63-a092cedb0ca3';

-- 4. Venta por medio de factura electrónica
UPDATE lecciones SET curso_orden = 4 WHERE id = 'fc5790c7-db32-43bd-aa08-0e547c45d3ce';

-- 5. Registro de gastos
UPDATE lecciones SET curso_orden = 5 WHERE id = '6d28f3c8-d773-4085-887c-6a6654827d3d';

-- 6. Cierre de turno  (lo último del día)
UPDATE lecciones SET curso_orden = 6 WHERE id = 'b05beb6c-dac0-4ef1-8d66-071514edbfab';

COMMIT;

-- ── Verificación ───────────────────────────────────────────────────────────
-- Deben salir las 6 lecciones del curso, numeradas 1 a 6 en el orden de arriba.
-- select curso_orden, titulo, categoria, orden
-- from lecciones
-- where examen is not null
-- order by curso_orden nulls last, orden, titulo;

-- ── Rollback ───────────────────────────────────────────────────────────────
-- El curso vuelve a ordenarse por `orden` (el comportamiento anterior).
-- update lecciones set curso_orden = null where curso_orden is not null;
