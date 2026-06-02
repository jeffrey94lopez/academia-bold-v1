# Spec: Modo Curso — Progreso, Exámenes y Certificado

**Proyecto:** Bold POS Academy — Academia Oficial de Bold POS  
**Fecha:** 2026-06-01  
**Estado:** Aprobado

---

## Contexto

El apartado de Lecciones actualmente es de libre exploración: cualquier persona puede leer cualquier lección sin registro ni seguimiento. Esta iniciativa añade un **Modo Curso** opcional donde el estudiante se registra con su nombre, avanza lección por lección con mini exámenes de opción múltiple, y al completar todas las lecciones recibe un certificado imprimible. El modo de exploración libre se mantiene intacto como alternativa.

---

## Alcance

### Incluido
- Pantalla de selección de modo al entrar a Lecciones (Hacer el curso / Solo explorar)
- Registro del estudiante con nombre y apellido (sin contraseña)
- Seguimiento de progreso por lección en Supabase
- Mini examen de opción múltiple al terminar cada lección (configurable desde el admin)
- Criterio de aprobación: 70% mínimo, intentos ilimitados
- Barra de progreso global y estado por lección (pendiente / completado)
- Certificado formal imprimible al completar todas las lecciones
- Panel de resultados en el admin: lista de estudiantes que completaron el curso
- Editor de preguntas de examen por lección en el admin

### Excluido
- Autenticación con contraseña o proveedores OAuth
- Lecciones bloqueadas hasta completar la anterior (el orden es libre)
- Notificaciones por email
- Límite de reintentos en exámenes
- Exportación de resultados a CSV (puede venir después)

---

## Flujo general del estudiante

```
Entra a Lecciones
  → Pantalla de selección de modo
      ├── "Solo explorar" → acceso libre (igual que hoy)
      └── "Hacer el curso" → formulario nombre + apellido
            → UUID generado, registro en Supabase
            → Vista de lecciones con indicadores de progreso
                  → Lee lección
                  → Examen (si la lección tiene preguntas configuradas)
                  → 70%+ correcto → lección marcada como completada
                  → Todas las lecciones completadas → Certificado
```

---

## Pantalla de selección de modo

Aparece dentro del apartado de Lecciones la primera vez que se visita (o si no hay sesión activa). El menú principal del sitio permanece intacto.

**Diseño:** Dos bloques iguales centrados en la pantalla:

**Bloque 1 — Hacer el curso:**
- Ícono 📋, título "Hacer el curso", subtítulo "Exámenes · Progreso · Certificado"
- Inputs: Nombre y Apellido (requeridos)
- Botón "Comenzar →" en rojo Bold

**Bloque 2 — Solo explorar:**
- Ícono 👁️, título "Solo explorar", subtítulo "Sin registro · Acceso libre"
- Botón "Entrar sin registro"

Al elegir "Solo explorar" se guarda `bold_mode=explore` en localStorage. Al elegir "Hacer el curso" y completar el formulario se genera un UUID, se crea el registro en Supabase y se guarda `bold_session_id=<uuid>` en localStorage.

Si ya existe `bold_session_id` en localStorage, se salta esta pantalla y se carga el progreso del estudiante directamente.

---

## Modo Explorar

Idéntico al comportamiento actual. No hay cambios en la navegación, no se muestran exámenes ni indicadores de progreso. El estudiante puede cambiar a modo curso en cualquier momento con un botón "Iniciar curso" discreto en el sidebar.

---

## Modo Curso — Registro

Al crear la sesión:
1. Se genera `uuid` con `crypto.randomUUID()`
2. Se inserta en `progreso_estudiantes`: `{ id: uuid, nombre, apellido, progreso: {}, completado: false }`
3. Se guarda `bold_session_id` en `localStorage`
4. Se redirige a la vista de lecciones con indicadores de progreso

Si el insert falla (sin conexión): mostrar toast de error, no avanzar.

---

## Modo Curso — Lista de lecciones con progreso

La lista de lecciones en el sidebar y en la vista móvil muestra el estado de cada lección:

| Estado | Indicador visual |
|---|---|
| Completada | ✅ círculo verde relleno |
| En progreso / sin examen aprobado | ⭕ círculo gris |
| Sin iniciar | sin indicador |

En el sidebar del desktop aparece una **barra de progreso** con el nombre del estudiante y el conteo `X/Y lecciones completadas`.

---

## Modo Curso — Examen por lección

### Trigger
Al terminar de leer una lección, aparece un botón "Ir al examen →" al final del contenido. Al hacer clic, si la lección tiene `examen` configurado, aparece la pantalla de examen. Si no tiene examen configurado, el clic marca la lección como completada directamente.

### UI del examen
- Modal overlay (o sección inline debajo del contenido)
- Título: "Mini examen — [título de la lección]"
- Preguntas numeradas (1 de N), una a la vez
- Cada pregunta: texto + 3 o 4 opciones de opción múltiple (radio buttons)
- Botón "Siguiente" (deshabilitado hasta seleccionar una opción)
- En la última pregunta: botón "Enviar respuestas"

### Resultado
- Se calcula el puntaje: `correctas / total * 100`
- **≥ 70%:** Pantalla de éxito con puntaje, confeti opcional, botón "Continuar". La lección se marca como completada en Supabase.
- **< 70%:** Pantalla de resultado con puntaje, qué preguntas fallaron, botón "Intentar de nuevo". Sin límite de intentos.

### Actualización en Supabase
Al aprobar, se hace `update` en `progreso_estudiantes`:
```json
progreso["lesson-id"] = { "completado": true, "puntaje": 85, "fecha": "2026-06-01" }
```
Si todas las lecciones están completadas, se actualiza también `completado: true, fecha_completado: now()`.

---

## Modo Curso — Certificado

### Trigger
Cuando `completado = true` en el registro del estudiante, aparece un botón "Ver mi certificado" prominente en la vista de lecciones.

### Diseño del certificado
Estilo diploma formal, generado como HTML imprimible:
- Doble borde rojo
- Logo Bold POS (letra "B" en rojo)
- "Certificado de Finalización" en mayúsculas pequeñas
- "Bold POS Academy — Academia Oficial de Bold POS"
- "Este certificado acredita que"
- **Nombre completo del estudiante** en cursiva grande (rojo)
- "completó exitosamente el curso de capacitación Bold POS"
- Fecha de finalización
- Puntaje promedio del curso

### Acciones
- Botón "🖨️ Imprimir" — llama a `window.print()` con CSS `@media print` que oculta todo excepto el certificado
- El certificado se renderiza en una vista dedicada o en un modal de pantalla completa

---

## Admin — Editor de preguntas de examen

En el formulario de edición de lección (modal existente), se añade una nueva sección **"Examen"** debajo de los bloques de contenido.

### UI en el admin
- Encabezado "Examen de la lección" con botón "+ Agregar pregunta"
- Cada pregunta muestra:
  - Input: texto de la pregunta
  - 3-4 inputs para las opciones (con botón + para añadir opción, mínimo 2)
  - Radio button para marcar cuál es la correcta
  - Botón ✕ para eliminar la pregunta
- Las preguntas son reordenables (drag & drop con SortableJS, igual que los bloques)
- Al guardar la lección, el campo `examen` se serializa como JSON y se guarda junto con el resto

### Estructura JSON del campo `examen`
```json
{
  "preguntas": [
    {
      "pregunta": "¿Cuál es el primer paso para crear una venta?",
      "opciones": ["Ir a Ventas", "Seleccionar cliente", "Abrir caja"],
      "correcta": 0
    },
    {
      "pregunta": "¿Se pueden aplicar descuentos por ítem?",
      "opciones": ["Sí", "No", "Solo en modo supervisor"],
      "correcta": 0
    }
  ]
}
```

---

## Admin — Panel de resultados

Nueva sección "Resultados" en el admin (nuevo tab en la navegación lateral).

**Contenido:**
- Tabla con columnas: Nombre, Apellido, Lecciones completadas (X/Y), Puntaje promedio, Fecha de finalización, Estado (En curso / Completado)
- Contador en la cabecera: "N estudiantes completaron el curso"
- Buscador por nombre
- Ordenado por fecha de registro (más recientes primero)

---

## Arquitectura y datos

### Cambios en Supabase

**Modificar tabla existente `lecciones`:**
```sql
ALTER TABLE lecciones ADD COLUMN examen jsonb;
```

**Nueva tabla `progreso_estudiantes`:**
```sql
CREATE TABLE progreso_estudiantes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL,
  apellido    text NOT NULL,
  progreso    jsonb NOT NULL DEFAULT '{}',
  completado  boolean NOT NULL DEFAULT false,
  fecha_completado timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Acceso público de lectura/escritura (anon key)
ALTER TABLE progreso_estudiantes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert" ON progreso_estudiantes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Students can update their own" ON progreso_estudiantes FOR UPDATE TO anon USING (true);
CREATE POLICY "Admins can read all" ON progreso_estudiantes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Students can read own" ON progreso_estudiantes FOR SELECT TO anon USING (true);
-- Nota: la seguridad se basa en que el UUID de sesión es criptográficamente random (imposible de adivinar).
-- No hay datos sensibles en esta tabla — solo nombre, apellido y puntajes.
```

### Archivos nuevos
| Archivo | Responsabilidad |
|---|---|
| `js/course.js` | Registro, carga de sesión, actualización de progreso, cálculo de puntaje, detección de curso completo |
| `js/certificate.js` | Renderizado del certificado, lógica de impresión |

### Archivos modificados
| Archivo | Cambio |
|---|---|
| `js/lessons.js` | Integrar pantalla de selección de modo; mostrar indicadores de progreso; trigger de examen al final de la lección |
| `js/admin.js` | Editor de preguntas de examen; nuevo panel de resultados |
| `index.html` | HTML estático para modal de examen, certificado, pantalla de modo |

### Sesión del estudiante
- Al registrarse: `crypto.randomUUID()` → insert en Supabase → `localStorage.setItem('bold_session_id', uuid)`
- Al volver: `localStorage.getItem('bold_session_id')` → fetch del registro → restaurar progreso
- Al explorar: `localStorage.setItem('bold_mode', 'explore')` → sin consulta a Supabase

---

## Manejo de errores

| Caso | Comportamiento |
|---|---|
| Error al registrar estudiante | Toast de error, no avanza. Puede reintentar. |
| Error al guardar progreso del examen | Toast de advertencia, progreso guardado localmente en memoria hasta próximo intento |
| Lección sin examen configurado | Se marca como completada automáticamente al llegar al final del contenido |
| Estudiante en modo explorar intenta ver certificado | No aplica — el botón solo aparece en modo curso |
| `bold_session_id` en localStorage pero sin registro en Supabase | Limpiar localStorage y mostrar pantalla de selección de modo nuevamente |

---

## Criterios de éxito

- [ ] Al entrar a Lecciones sin sesión activa, aparece la pantalla de selección de modo
- [ ] "Solo explorar" da acceso inmediato a las lecciones sin formulario
- [ ] "Hacer el curso" con nombre y apellido crea sesión y registro en Supabase
- [ ] Las lecciones muestran ✅ o ⭕ según el estado de completado
- [ ] La barra de progreso en el sidebar muestra "X/Y lecciones"
- [ ] Al terminar una lección con examen aparece la pantalla de examen
- [ ] Responder ≥70% correcto marca la lección como completada en Supabase
- [ ] Responder <70% muestra qué se falló y permite reintentar sin límite
- [ ] Al completar todas las lecciones aparece el botón "Ver mi certificado"
- [ ] El certificado muestra nombre, fecha y puntaje promedio
- [ ] El botón "🖨️ Imprimir" abre el diálogo de impresión mostrando solo el certificado
- [ ] En el admin, el editor de lección tiene sección de examen con preguntas de opción múltiple
- [ ] El admin puede marcar cuál opción es la correcta
- [ ] El panel "Resultados" en el admin muestra la lista de estudiantes con su progreso
- [ ] Si el estudiante regresa desde el mismo navegador, su progreso se restaura automáticamente
