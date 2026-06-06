# Academia Bold POS

Plataforma oficial de capacitación y soporte para el sistema **Bold POS**. Acceso público sin registro requerido para explorar; registro opcional para seguir progreso y obtener certificado.

## Características

### Cursos y Progreso
- Registro de estudiante con nombre y apellido (UUID anónimo, sin contraseña)
- Seguimiento de progreso por lección
- Examen por lección con puntaje mínimo del 70% para aprobar
- Certificado de finalización al completar todas las lecciones
- Modo "solo explorar" sin registro

### Lecciones
- Organizadas por categorías (Ventas, Inventario, Ingresos, Egresos, Contactos, Configuración)
- Sidebar acordeón por categoría en desktop
- Navegación de 3 pantallas en móvil (categorías → lecciones → contenido)
- Editor de contenido enriquecido con formato B/I/U en el admin
- Videos YouTube embebidos como iframes

### Asistente IA — Bodi
- Chat inteligente especializado en Bold POS
- Powered by n8n + IA generativa (proxy via Vercel serverless)
- Historial de conversación persistente en localStorage
- Sugerencias rápidas desde base de datos
- Registro de conversaciones con tema, sentimiento y resolución
- Botones de resolución (¿Logré ayudarte?)

### Recursos
- **Glosario:** términos Bold POS con búsqueda en tiempo real
- **Material de apoyo:** PDFs, links y videos

### Panel de Administración (`/admin`)
- Login seguro con Supabase Auth
- CRUD completo de lecciones, categorías, glosario, material y sugerencias de Bodi
- Subida de archivos a Supabase Storage (bucket `material`)
- Dashboard de analytics: progreso de estudiantes, eventos de uso, conversaciones de Bodi

### UI
- Dark mode con persistencia en localStorage
- Diseño responsive (mobile-first)
- Seguridad de contenido (CSP, HSTS, X-Frame-Options) vía `vercel.json`

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML, CSS, JavaScript vanilla (módulos ES) |
| Estilos | Tailwind CSS (CDN) |
| Iconos | Lucide Icons (CDN) |
| Base de datos / Auth / Storage | Supabase (PostgreSQL + RLS) |
| Hosting | Vercel (auto-deploy desde `master`) |
| Chatbot / Automatización | n8n webhooks |
| Proxy de chat | Vercel serverless (`api/chat.js`) |

## Estructura del Proyecto

```
├── index.html                  # App principal (lecciones, recursos, asistente)
├── admin.html                  # Panel de administración
├── api/
│   └── chat.js                 # Proxy serverless para el chatbot Bodi
├── css/
│   └── style.css               # Estilos custom
├── js/
│   ├── supabase.js             # Cliente Supabase + studentClient()
│   ├── main.js                 # Punto de entrada y navegación principal
│   ├── auth.js                 # Autenticación admin
│   ├── course.js               # Registro de estudiantes y progreso
│   ├── lessons.js              # Sección de lecciones y categorías
│   ├── assistant.js            # Chatbot Bodi
│   ├── resources.js            # Glosario y material de apoyo
│   ├── analytics.js            # Tracking de eventos de uso
│   ├── admin.js                # CRUD del panel admin
│   ├── admin-analytics.js      # Dashboard de analytics para admin
│   ├── block-renderer.js       # Renderizado de bloques de contenido de lecciones
│   ├── certificate.js          # Generación de certificado de finalización
│   ├── step-formatter.js       # Formato enriquecido (B/I/U) en pasos del admin
│   ├── upload.js               # Subida de archivos a Supabase Storage
│   ├── theme-init.js           # Inicialización de dark mode (carga antes del body)
│   ├── tailwind-config.js      # Configuración de Tailwind (dark mode class)
│   ├── utils.js                # Utilidades compartidas (escapeHtml, etc.)
│   └── whatsapp-copy.js        # Compartir via WhatsApp
├── supabase/
│   └── migrations/
│       └── create_bodi_conversations.sql
└── vercel.json                 # Headers de seguridad y rewrites
```

## Base de Datos (Supabase)

### Tablas

| Tabla | Descripción | Campos clave |
|-------|-------------|--------------|
| `categorias` | Categorías de lecciones | id, nombre, emoji, orden |
| `lecciones` | Contenido del curso | id, titulo, descripcion, contenido (jsonb), categoria, examen (jsonb), orden |
| `glosario` | Términos Bold POS | id, termino, definicion |
| `material_apoyo` | PDFs, links y videos | id, titulo, tipo, url |
| `bot_sugerencias` | Chips de sugerencia de Bodi | id, texto, activo, orden |
| `progreso_estudiantes` | Progreso por estudiante | id (UUID), nombre, apellido, progreso (jsonb), completado, fecha_completado |
| `analytics_events` | Eventos de uso de la app | event_type, payload, session_id, mode, created_at |
| `bodi_conversations` | Conversaciones con Bodi | id, session_id, messages (jsonb), topic, sentiment, status, resolved |

### Seguridad (Row Level Security)

| Tabla | Anónimo | Autenticado |
|-------|---------|-------------|
| `categorias` | SELECT | ALL |
| `lecciones` | SELECT | ALL |
| `glosario` | SELECT | ALL |
| `material_apoyo` | SELECT | ALL |
| `bot_sugerencias` | SELECT | ALL |
| `progreso_estudiantes` | INSERT + SELECT/UPDATE propio* | SELECT todos |
| `analytics_events` | INSERT | SELECT |
| `bodi_conversations` | INSERT + UPDATE propia* | SELECT |

\* El acceso "propio" se enforcea server-side: el cliente pasa el UUID del estudiante en el header `x-student-id` y RLS verifica que coincida con el row.

## Despliegue

Vercel despliega automáticamente en cada push a `master`. No se requieren variables de entorno — las credenciales de Supabase (`SUPABASE_URL` y `anon key`) son públicas por diseño y van en `js/supabase.js`.

## Desarrollo Local

```bash
git clone https://github.com/jeffrey94lopez/academia-bold-v1.git
cd academia-bold-v1
# Abre con Live Server en VS Code (requerido por los módulos ES)
```

> Los módulos ES (`import/export`) requieren servidor HTTP. No abrir `index.html` directamente desde el sistema de archivos (`file://`).

## Panel Admin

Accede en `/admin` con las credenciales configuradas en Supabase Authentication. Solo usuarios con sesión activa pueden crear, editar o eliminar contenido.
