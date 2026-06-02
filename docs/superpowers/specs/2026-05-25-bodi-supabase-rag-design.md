# Bodi — Búsqueda en Supabase con clasificación de intención

## Objetivo

Reemplazar el Google Doc como base de conocimiento de Bodi por las lecciones almacenadas en Supabase. El bot clasifica la intención del usuario en tres casos: módulo claro (busca lecciones), intención vaga (pregunta conversacional de aclaración), o reporte de bug (manda a soporte). El flujo vive íntegramente en n8n.

---

## Contexto actual

El flujo actual (`Bold POS Chat.json`) funciona así:

```
Webhook → Doc en cache? → Obtener Google Doc → Guardar cache + prompt
                       ↘ Prompt desde cache ↗
                                             → OpenAI Chat → Formatear → Respond
```

El Google Doc completo se inyecta en el system prompt en cada consulta. Se elimina completamente y se reemplaza por búsqueda en Supabase.

---

## Flujo nuevo

```
Webhook
  ↓
Clasificar intención (OpenAI, max_tokens: 20)
  ↓
Router (Switch node — 3 ramas)
  ├── Módulo claro → Buscar lecciones en Supabase → Construir prompt → OpenAI Chat → Formatear → Respond
  ├── desconocido  → OpenAI Clarificación (prompt corto) → Formatear → Respond
  └── soporte      → Respuesta soporte fija → Respond
```

---

## Nodos

### 1. Webhook
Sin cambios. Recibe `POST` con body `{ message: string, history: array }`.

---

### 2. Clasificar intención
**Tipo:** HTTP Request → `POST https://api.openai.com/v1/chat/completions`
**Credencial:** OpenAI account (existente)
**Body:**
```json
{
  "model": "gpt-4o-mini",
  "temperature": 0,
  "max_tokens": 20,
  "messages": [
    {
      "role": "system",
      "content": "Eres un clasificador de intención para Bold POS. Dado el mensaje del usuario, responde ÚNICAMENTE con una de estas palabras:\n\nVentas | Inventario | Ingresos | Egresos | Contactos | Configuración | desconocido | soporte\n\nUsa 'soporte' cuando el usuario reporte que algo no funciona, tiene un error, un bug, o la plataforma falla.\nUsa 'desconocido' cuando no puedas determinar el módulo con seguridad.\nSin explicaciones. Solo la palabra."
    },
    {
      "role": "user",
      "content": "={{ $('Webhook').first().json.body.message }}"
    }
  ]
}
```
**Output usado:** `choices[0].message.content.trim()`

---

### 3. Router (Switch node)
Evalúa el valor del clasificador usando la expresión:
`{{ $json.choices[0].message.content.trim() }}`

| Condición (string equals) | Rama |
|---------------------------|------|
| Ventas | Buscar lecciones |
| Inventario | Buscar lecciones |
| Ingresos | Buscar lecciones |
| Egresos | Buscar lecciones |
| Contactos | Buscar lecciones |
| Configuración | Buscar lecciones |
| desconocido | Clarificar |
| soporte | Respuesta soporte |

En n8n, usar 8 condiciones "String equals" con "Fallthrough" activado en las 6 de módulo para que todas apunten al mismo nodo "Buscar lecciones".

---

### 4. Buscar lecciones en Supabase
**Tipo:** HTTP Request → `GET`
**URL (expresión n8n):**
```
https://tczcngfhuendmldafbrc.supabase.co/rest/v1/lecciones?select=titulo,descripcion,contenido,notas,categoria&categoria=eq.{{ $('Clasificar intención').first().json.choices[0].message.content.trim() }}&activo=eq.true&order=orden
```

**Headers:**
```
apikey: <SUPABASE_ANON_KEY>
Authorization: Bearer <SUPABASE_ANON_KEY>
```

---

### 5. Construir prompt
**Tipo:** Code node (JavaScript)

Responsabilidades:
- Iterar las lecciones devueltas por Supabase
- Extraer texto de los bloques tipo `step` del campo `contenido` (JSON array); ignorar bloques de tipo `image`, `video`, `link`
- Para lecciones legacy (contenido no parseable como JSON): incluir `contenido` como texto plano eliminando etiquetas HTML básicas
- Formatear cada lección como:
  ```
  ## {titulo}
  {descripcion}
  Pasos:
  1. {step1}
  2. {step2}
  ...
  Notas: {notas}   ← solo si notas no es null
  ---
  ```
- Construir el array `messages` con system prompt + history + mensaje del usuario
- System prompt idéntico al actual con la sección `DOCUMENTACIÓN:` reemplazada por las lecciones formateadas

**Lógica de extracción de pasos:**
```js
function lessonToText(lesson) {
  let text = `## ${lesson.titulo}\n`
  if (lesson.descripcion) text += `${lesson.descripcion}\n`
  try {
    const blocks = JSON.parse(lesson.contenido)
    if (Array.isArray(blocks)) {
      const steps = blocks.filter(b => b.type === 'step' && b.text)
      if (steps.length) {
        text += 'Pasos:\n'
        steps.forEach((b, i) => { text += `${i + 1}. ${b.text}\n` })
      }
    } else {
      text += String(lesson.contenido || '').replace(/<[^>]+>/g, '') + '\n'
    }
  } catch (_) {
    text += String(lesson.contenido || '').replace(/<[^>]+>/g, '') + '\n'
  }
  if (lesson.notas) text += `Notas: ${lesson.notas}\n`
  return text
}
```

---

### 6. OpenAI Chat
Sin cambios. Recibe el array `messages` del nodo anterior.
Modelo: `gpt-4o-mini`, temperature: 0.3, max_tokens: 800.

---

### 7. Clarificar (rama "desconocido")
**Tipo:** HTTP Request → `POST https://api.openai.com/v1/chat/completions`
**Body:**
```json
{
  "model": "gpt-4o-mini",
  "temperature": 0.4,
  "max_tokens": 120,
  "messages": [
    {
      "role": "system",
      "content": "Eres Bodi, asistente de Bold POS. El usuario hizo una pregunta poco específica. Genera UNA sola pregunta corta, amigable y conversacional para aclarar si su duda es sobre Ventas, Inventario, Ingresos, Egresos, Contactos o Configuración. Basa la pregunta en lo que dijo el usuario para que se sienta natural, no como un menú. Sin listas. Solo la pregunta."
    },
    {
      "role": "user",
      "content": "={{ $('Webhook').first().json.body.message }}"
    }
  ]
}
```

---

### 8. Respuesta soporte (rama "soporte")
**Tipo:** Code node
```js
return [{
  json: {
    response: "Parece que tienes un problema con el funcionamiento de la plataforma. Para este caso te recomiendo contactar directamente al equipo de soporte de Bold POS:\n\n[📲 Soporte Bold POS](https://api.whatsapp.com/send?phone=573171109500&text=Hola%20,%20necesito%20su%20ayuda%20en%20Bold%20POS.)\n\nEllos podrán revisar el error directamente en tu cuenta."
  }
}]
```

---

### 9. Formatear respuesta
Sin cambios. Las tres ramas (módulo claro, clarificación, soporte) convergen en este nodo antes de responder al webhook. El nodo lee `$json.choices[0].message.content` para las ramas de OpenAI, y `$json.response` para la rama de soporte — ambos casos ya están cubiertos por la lógica actual: `$json.choices?.[0]?.message?.content ?? $json.message?.content ?? ''`. Para la rama soporte, el Code node devuelve `{ response: '...' }`, por lo que el Formatear respuesta debe incluir también `?? $json.response ?? ''`.

---

### 10. Respond to Webhook
Sin cambios.

---

## Supabase — requerimientos

- La columna `activo` debe existir en la tabla `lecciones` (ya existe según el código actual)
- La columna `categoria` debe existir con los valores exactos: Ventas, Inventario, Ingresos, Egresos, Contactos, Configuración (ya migrada)
- La política RLS de lectura pública debe estar activa (ya existe)
- No se requiere ningún cambio en Supabase

---

## Lo que se elimina

- Nodo **Obtener Google Doc**
- Nodo **Doc en cache?**
- Nodo **Guardar cache + prompt**
- Nodo **Prompt desde cache**
- Credencial Google Docs (ya no necesaria en este flujo)

---

## Fuera de alcance

- Embeddings vectoriales (pgvector) — mejora futura si la búsqueda por categoría no es suficiente
- Búsqueda por palabras clave dentro de una categoría — el clasificador de módulo es suficiente para este volumen
- Invalidación de cache — se elimina el cache; cada consulta busca en Supabase en tiempo real (latencia aceptable para este uso)
- Lecciones que cruzan dos módulos — el clasificador elige el más relevante; mejora futura si se detecta necesidad
