# Integridad del contenido de las lecciones: formato garantizado + historial · Spec de diseño

Cierre del hilo abierto en `lecciones-contenido-doble-formato`. Reemplaza el proyecto "migrar `contenido` a `jsonb`" por algo más barato con casi el mismo beneficio, después de medir los datos.

## El dato que cambió el proyecto

La migración a `jsonb` se justificaba por el doble formato: unos registros con JSON de bloques y otros con HTML crudo. **Medido el 2026-07-27 contra producción: las 32 lecciones ya están en JSON válido de array. Cero legacy, cero vacías, cero nulas**, tamaño máximo 8.451 caracteres y promedio 4.076.

Los datos ya están unificados —las tres puertas y el editor los fueron normalizando—, así que migrar el tipo no arreglaría nada existente: solo cambiaría el tipo. Lo que falta es que la base **impida volver** al doble formato, y eso no necesita un `ALTER TYPE`.

**Decisión: no se migra a `jsonb`.** Un `CHECK` sobre la columna `text` da la garantía de formato sin tocar una línea de código de la aplicación. Migrar a `jsonb` obligaría a reescribir los tres helpers que hoy operan sobre el string crudo (`remapContentUrl`, `extractBucketUrls`, `countReferences`), cambiar el escritor, y coordinar un `ALTER` que ejecuta el usuario con dos deploys — todo para ganar consultas SQL sobre bloques que nadie pidió. Si algún día hacen falta índices GIN o consultar bloques desde SQL, la migración sigue disponible y sobre datos ya garantizados como JSON, que es el escenario fácil.

## Lo que sí se hace

### 1. `CHECK` de formato, con una función que no explota

```
es_array_json(t text) => boolean
```

Un `check (jsonb_typeof(contenido::jsonb) = 'array')` a secas rechaza el HTML crudo, pero lanzando `invalid input syntax for type json`: un error de cast, no una violación de constraint, con un mensaje que no dice qué regla se rompió. La función auxiliar atrapa el error y devuelve `false`, así el rechazo llega siempre como violación del constraint, con su nombre.

Es `IMMUTABLE` porque un `CHECK` lo exige. Acepta `NULL` (una lección sin contenido es legítima; hoy no hay ninguna) y rechaza todo lo demás que no sea un array JSON: HTML crudo, `'{}'`, `'42'`, `'texto'`, `''`.

**Lo que este CHECK no previene, dicho claro:** `'[]'` es un array válido, y `'[]'` es exactamente lo que escribía el bug de la puerta 2. El CHECK cierra la puerta del *formato*, no la del *vaciado*. De eso se encarga el punto 2.

### 2. Historial automático del contenido

Tabla `lecciones_contenido_historial` con `leccion_id`, `operacion`, `contenido_anterior`, `contenido_nuevo`, `chars_anterior`, `chars_nuevo`, `cambiado_en`, `cambiado_por`. Un trigger `AFTER UPDATE OR DELETE` sobre `lecciones` la llena, y solo cuando `contenido` cambió de verdad (`IS DISTINCT FROM`) — editar el título no genera una fila.

**Incluye el `DELETE`** a propósito: si se borra una lección, su contenido queda recuperable.

**Por qué historial y no un trigger que prohíba vaciar:** un trigger que rechace el vaciado también impide vaciar una lección a propósito, y desde SQL no hay forma de distinguir intención. Además convertiría un bug futuro en un error opaco al guardar. El historial no bloquea nada y hace recuperable cualquier pérdida, venga de un bug, de un guardado en falso o de un borrado a mano.

La función del trigger va `SECURITY DEFINER` para poder insertar sin depender de una policy de escritura. La tabla lleva RLS con `SELECT` solo para `authenticated`: el contenido no es secreto (se publica en el portal), pero no hay razón para exponer el historial a la anon key.

**Volumen:** 32 lecciones de ~4 KB. Cien ediciones por lección serían ~13 MB. No necesita política de retención todavía; si algún día la necesita, se borra por `cambiado_en`.

### 3. Vista `lecciones_vaciadas` — la alarma

Los cambios donde el contenido pasó de tener bloques a estar vacío (`chars_anterior > 2` y `chars_nuevo <= 2`; `2` es el largo de `'[]'`). Si un bug futuro vuelve a vaciar algo, se ve con un `select * from lecciones_vaciadas`. Va con `security_invoker = on` para que respete la RLS de la tabla base en vez de correr con los permisos del owner.

### 4. El único cambio de código: chequear el error en `cascadeUpdateUrl`

`cascadeUpdateUrl` (`js/admin.js:1630`) no mira el `error` de sus `update` — pendiente heredado de la puerta 1. Con un `CHECK` activo eso deja de ser un descuido: un rechazo dejaría la URL sin propagar **en silencio**, que es la firma de toda esta clase de bugs. Pasa a acumular los fallos y avisarlos con un toast, sin abortar el resto de la cascada (si una lección falla, las demás igual deben actualizarse).

## Interfaces / unidades

- `supabase/migrations/add_contenido_integridad_historial.sql` — todo el SQL, re-ejecutable, con la consulta de recuperación documentada adentro.
- `es_array_json(text) => boolean` — predicado del CHECK.
- `registrar_cambio_contenido()` — función del trigger.
- `lecciones_vaciadas` — vista de alarma.
- `cascadeUpdateUrl(oldUrl, newUrl)` — mismo contrato, ahora reporta fallos.

## Aplicación y verificación

**El SQL lo ejecuta el usuario** en el SQL Editor de Supabase: el MCP de Supabase de esta cuenta apunta a otra organización y no alcanza este proyecto. El archivo es re-ejecutable (`drop ... if exists` antes de crear) para que un segundo intento no falle a mitad.

Orden: el cambio de código y el SQL son independientes; ninguno rompe al otro si se aplica primero.

**Verificación (yo, desde el navegador, después de que el usuario corra el SQL):**

1. Una lección real sigue leyéndose y el portal la renderiza igual.
2. `update lecciones set contenido = '<p>hola</p>'` sobre una lección de descarte → **rechazado** por `lecciones_contenido_es_array`.
3. `update ... set contenido = '{}'` y `= 'texto'` → rechazados.
4. `update ... set contenido = '[]'` → **aceptado** (es un array válido) y aparece en `lecciones_vaciadas`.
5. Editar el contenido de una lección de descarte deja una fila en el historial con el valor anterior completo; editar solo el título **no** deja fila.
6. Borrar la lección de descarte deja su contenido en el historial con `operacion = 'delete'`.
7. La consulta de recuperación documentada restaura el contenido anterior.
8. Con la anon key (sin sesión) el historial no se puede leer.

## Alcance

- Rama `sandbox`, merge a `master` cuando el usuario apruebe. SQL versionado en `supabase/migrations/` siguiendo el estilo del repo: comentarios en español, re-ejecutable, `security definer` donde hace falta.

**Fuera de alcance:**

- Migrar `contenido` a `jsonb` (explícitamente descartado arriba; queda disponible si aparece una necesidad concreta).
- UI para ver o restaurar versiones. La recuperación es una consulta documentada; una pantalla de versiones es una feature que nadie pidió.
- Política de retención del historial.
- Extender el historial a otras tablas (glosario, FAQ, material).
- Los ítems #2, #7 y #10 de la auditoría del 2026-07-20.
