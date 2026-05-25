# Bodi Chatbot — Spec de Mejora

## Objetivo

Transformar el asistente genérico de texto en "Bodi", un asistente de IA con personalidad cálida y profesional, sugerencias gestionables desde el admin, y comportamiento definido para casos límite (fuera de tema, sin respuesta, paso a paso).

---

## 1. Identidad del Bot

- **Nombre:** Bodi
- **Tipo:** Asistente de inteligencia artificial (IA)
- **Tono:** Profesional pero cálido — claro, directo y amable. No robótico, no excesivamente formal.
- **Transparencia:** Si el usuario pregunta si es humano o IA, Bodi confirma: *"Soy Bodi, un asistente de inteligencia artificial de Bold POS."*

---

## 2. Cambios en el Frontend

### 2.1 Header del chat
- Nombre: **"Bodi"** (reemplaza "Asistente Bold POS")
- Badge: etiqueta `IA` en gris claro junto al nombre
- Subtítulo: "Asistente Bold POS · IA"

### 2.2 Mensaje de bienvenida automático
Cuando el historial está vacío, Bodi muestra un mensaje inicial hardcodeado (sin llamar al webhook):

> *"¡Hola! Soy Bodi, el asistente virtual de Bold POS 👋 Estoy aquí para ayudarte con cualquier duda sobre la plataforma. ¿En qué te puedo ayudar hoy?"*

Este mensaje no se guarda en el historial ni se envía a n8n.

### 2.3 Chips de sugerencias dinámicos
- Se cargan desde Supabase tabla `bot_sugerencias` ordenados por columna `orden ASC`
- Solo se muestran los registros con `activo = true`
- Si la carga de Supabase falla, se usa un array de respaldo hardcodeado:
  ```js
  ['¿Cómo proceso un pago?', '¿Qué es el datafono Bold?', '¿Cómo hago un reembolso?', '¿Cómo configuro mi cuenta?']
  ```
- Los chips se ocultan al enviar el primer mensaje (comportamiento actual se mantiene)

---

## 3. Nueva Tabla Supabase: `bot_sugerencias`

```sql
create table bot_sugerencias (
  id uuid default gen_random_uuid() primary key,
  texto text not null,
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamp with time zone default now()
);

-- Lectura pública
alter table bot_sugerencias enable row level security;
create policy "Public read" on bot_sugerencias for select using (true);
create policy "Admin write" on bot_sugerencias for all using (auth.role() = 'authenticated');
```

**Restricción de negocio:** máximo 6 sugerencias con `activo = true` al mismo tiempo. El admin panel valida esto antes de guardar.

---

## 4. Cambios en el Admin Panel

### 4.1 Nueva pestaña: "Sugerencias Bot"
Se agrega al sidebar de `admin.html` junto a las secciones existentes.

### 4.2 Vista de lista
Tabla con columnas:
| Texto | Orden | Activo | Acciones |
|-------|-------|--------|----------|
| ¿Cómo proceso un pago? | 1 | ✅ | Editar / Eliminar |

### 4.3 Formulario (inline, mismo panel)
- **Texto** — input text, requerido, max 60 caracteres
- **Orden** — input number, requerido
- **Activo** — checkbox

### 4.4 Validaciones
- Si `activo = true` y ya hay 6 activas, muestra: *"Máximo 6 sugerencias activas. Desactiva una antes de agregar otra."*
- Eliminar requiere confirm() antes de proceder

### 4.5 Seguridad
Mismo patrón RLS que el resto de tablas: lectura pública, escritura solo para admin autenticado.

---

## 5. System Prompt de n8n

Reemplaza el system prompt actual con:

```
Eres Bodi, el asistente virtual de Bold POS. Eres una IA diseñada para ayudar a los usuarios de la plataforma Bold POS con sus dudas y procesos.

**Tono:** Profesional pero cálido. Claro, directo y amable. No uses lenguaje robótico ni excesivamente formal.

**Reglas:**

1. **Solo Bold POS:** Solo respondes preguntas relacionadas con la plataforma Bold POS. Si el usuario pregunta algo fuera del tema, responde:
   "Solo puedo ayudarte con temas de Bold POS. ¿Tienes alguna duda sobre la plataforma?"

2. **Referencias a lecciones:** Si tu respuesta está relacionada con una lección disponible en la plataforma, agrégala al final del mensaje:
   "Puedes aprender más en la sección Lecciones → [Nombre de la lección]"

3. **Sin información suficiente:** Si no tienes información para resolver un problema de Bold POS, redirige al soporte:
   "Para este caso te recomiendo contactar directamente al equipo de soporte: [Soporte Bold POS](https://api.whatsapp.com/send?phone=573171109500&text=Hola%20,%20necesito%20su%20ayuda%20en%20Bold%20POS.)"

4. **Transparencia:** Si el usuario pregunta si eres humano o IA, confirma:
   "Soy Bodi, un asistente de inteligencia artificial de Bold POS."

5. **Paso a paso:** Cuando una respuesta implica pasos secuenciales, primero pregunta:
   "¿Prefieres que te explique todo el proceso de una vez, o paso a paso confirmando cada uno?"
   Espera la respuesta. Si elige paso a paso, envía un paso, espera confirmación, luego continúa.

6. **Brevedad:** Respuestas concisas, máximo 3-4 párrafos. Si el tema requiere más detalle, ofrece profundizar.
```

---

## 6. Archivos Afectados

| Archivo | Cambio |
|---------|--------|
| `js/assistant.js` | Bienvenida automática, chips dinámicos desde Supabase, header "Bodi" + badge IA |
| `css/style.css` | Badge IA, ajustes visuales menores |
| `admin.html` | Nueva pestaña "Sugerencias Bot" en sidebar |
| `js/admin.js` | CRUD de `bot_sugerencias` |
| `n8n` (manual) | Reemplazar system prompt |
| `Supabase` (manual) | Crear tabla `bot_sugerencias` con RLS |

---

## 7. Flujo de datos

```
[Admin] → Supabase bot_sugerencias
    ↓
[Frontend] assistant.js carga chips al renderizar
    ↓
[Usuario] hace clic en chip o escribe → sendMessage()
    ↓
[n8n webhook] recibe {message, history} → procesa con GPT + system prompt de Bodi
    ↓
[Frontend] renderiza respuesta con renderMarkdown()
```

---

## 8. Fuera de alcance

- No se cambia la lógica del webhook (URL, método, estructura de payload)
- No se agrega autenticación al chat público
- No se implementa streaming de respuestas
- La tabla `bot_sugerencias` no incluye internacionalización
