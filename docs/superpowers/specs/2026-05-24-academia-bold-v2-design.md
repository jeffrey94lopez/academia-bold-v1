# Academia Bold V2 — Diseño

**Fecha:** 2026-05-24
**Estado:** Aprobado

---

## Resumen

Reconstrucción desde cero de Academia Bold POS como una aplicación web simple, abierta al público, sin lógica de progreso ni quizzes. El foco principal es el **Asistente IA** como herramienta central para resolver dudas sobre Bold POS.

---

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML, CSS, JavaScript vanilla |
| Estilos | Tailwind CSS via CDN |
| Iconos | Lucide Icons via CDN |
| Backend/DB | Supabase (base de datos + auth + storage) |
| Hosting | Vercel |
| Chatbot | n8n webhook existente (sin cambios) |

---

## Estructura de Archivos

```
academia-bold-v2/
├── index.html           ← App completa (navegación entre 3 secciones)
├── admin.html           ← Panel admin protegido con Supabase Auth
│
├── js/
│   ├── supabase.js      ← Inicialización del cliente Supabase (compartido)
│   ├── auth.js          ← Login/logout del admin
│   ├── assistant.js     ← Asistente IA conectado al webhook n8n
│   ├── lessons.js       ← Carga y renderiza lecciones desde Supabase
│   └── resources.js     ← Glosario y material de apoyo desde Supabase
│
├── css/
│   └── style.css        ← Solo estilos custom que Tailwind no cubre
│
└── assets/
    └── logo.png
```

---

## Las 3 Secciones

### 1. Asistente IA (pantalla por defecto)
- Pantalla completa, prominente, es lo primero que ve el usuario
- Interfaz de chat limpia con burbujas de conversación
- Conectado al webhook n8n: `https://n8n.mplasesores.com/webhook/bold-pos-chat`
- Historial de conversación en `localStorage` (máximo 20 mensajes)
- Sugerencias rápidas predefinidas: "¿Cómo proceso un pago?", "¿Qué es el datafono Bold?", "¿Cómo hago un reembolso?"
- Cuando la respuesta menciona una lección, incluye enlace directo a ella
- Enfocado exclusivamente en información sobre Bold POS

### 2. Lecciones
- Tarjetas de lecciones cargadas desde Supabase
- Sin progreso, sin quizzes, sin certificados
- Cada lección tiene: título, descripción corta, contenido completo
- Al hacer clic en una tarjeta se expande o abre el contenido completo
- El admin controla el orden mediante el campo `orden`

### 3. Recursos (Glosario + Material de apoyo)
- Dos sub-tabs dentro de la misma sección
- **Glosario:** lista de términos Bold POS con definición, buscable por texto
- **Material de apoyo:** tarjetas con título, tipo (PDF/Link/Video) y botón de descarga/acceso

---

## Navegación

- **Móvil:** barra de navegación fija en la parte inferior con 3 íconos
- **Escritorio:** barra lateral o tabs superiores con 3 secciones
- La sección activa por defecto es siempre el **Asistente IA**

---

## Base de Datos (Supabase)

### Tabla: `lecciones`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK automático |
| titulo | text | Título de la lección |
| descripcion | text | Resumen corto |
| contenido | text | Contenido completo (HTML o Markdown) |
| orden | int | Para ordenar las tarjetas |
| created_at | timestamp | Automático |

### Tabla: `glosario`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK automático |
| termino | text | Palabra o frase |
| definicion | text | Explicación |

### Tabla: `material_apoyo`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid | PK automático |
| titulo | text | Nombre del recurso |
| tipo | text | 'pdf', 'link', o 'video' |
| url | text | URL pública (Supabase Storage o externa) |

### Storage
- Bucket `material` para PDFs e imágenes subidos desde el admin
- Acceso público de lectura, escritura solo autenticada

---

## Autenticación

- **Usuarios regulares:** ninguno — la app es completamente pública
- **Admin:** un único usuario creado manualmente en Supabase Auth
- El `admin.html` verifica sesión activa con Supabase; si no hay sesión, muestra login
- Al cerrar sesión, redirige a `index.html`

---

## Panel Admin (`admin.html`)

Permite gestionar todo el contenido sin tocar código:

- **Lecciones:** crear, editar, reordenar, eliminar
- **Glosario:** agregar, editar, eliminar términos
- **Material:** subir archivos a Supabase Storage o agregar links externos
- **Sugerencias rápidas del chat:** editar las frases predefinidas

---

## Seguridad

- Sin contraseñas hardcodeadas en el código
- Las credenciales de Supabase (URL + anon key) son públicas por diseño — Supabase usa Row Level Security (RLS) para proteger escritura
- Solo el admin autenticado puede escribir/modificar datos
- Lectura de lecciones, glosario y material: pública

---

## Despliegue

- Repositorio: `https://github.com/jeffrey94lopez/academia-bold-v1`
- Hosting: Vercel (conectado al repo, deploy automático en cada push a `main`)
- Variables de entorno en Vercel: `SUPABASE_URL`, `SUPABASE_ANON_KEY`

---

## Lo que se elimina vs V1

| V1 | V2 |
|----|-----|
| Progreso del usuario | Eliminado |
| Quizzes | Eliminado |
| Certificados | Eliminado |
| Contraseña hardcodeada (admin123) | Supabase Auth |
| Todo en 2 archivos HTML gigantes | Archivos separados por responsabilidad |
| localStorage para datos | Supabase (persistente) |
| Hosting actual | Vercel |
