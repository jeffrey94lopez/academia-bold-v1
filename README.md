# Academia Bold POS

Plataforma web oficial de capacitación para el sistema de pagos **Bold POS**. Acceso público, sin registro requerido.

## Características

### Asistente IA
- Chat inteligente especializado en Bold POS
- Powered by n8n + IA generativa
- Historial de conversación persistente
- Sugerencias rápidas predefinidas
- Indicador de escritura animado

### Lecciones
- Contenido de capacitación organizado por orden
- Tarjetas con título y descripción
- Modal de lectura con contenido completo
- Datos gestionados desde el panel admin

### Recursos
- **Glosario:** términos Bold POS con definiciones, búsqueda en tiempo real
- **Material de apoyo:** PDFs, links y videos descargables

### Panel de Administración
- Login seguro con Supabase Auth
- CRUD completo de lecciones, glosario y material
- Subida de archivos via Supabase Storage
- Acceso en `/admin`

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | HTML, CSS, JavaScript vanilla |
| Estilos | Tailwind CSS (CDN) |
| Iconos | Lucide Icons (CDN) |
| Backend / DB | Supabase (PostgreSQL + Auth + Storage) |
| Hosting | Vercel |
| Chatbot | n8n webhook |

## Estructura del Proyecto

```
├── index.html          # App principal (3 secciones)
├── admin.html          # Panel de administración
├── js/
│   ├── supabase.js     # Cliente Supabase
│   ├── auth.js         # Autenticación admin
│   ├── assistant.js    # Asistente IA
│   ├── lessons.js      # Sección lecciones
│   ├── resources.js    # Glosario y material
│   └── admin.js        # CRUD del panel admin
├── css/
│   └── style.css       # Estilos custom
└── assets/             # Imágenes y recursos estáticos
```

## Base de Datos (Supabase)

### Tablas
| Tabla | Campos |
|-------|--------|
| `lecciones` | id, titulo, descripcion, contenido, orden, created_at |
| `glosario` | id, termino, definicion |
| `material_apoyo` | id, titulo, tipo (pdf/link/video), url |

### Seguridad
- Lectura pública en las 3 tablas (sin autenticación)
- Escritura solo para administrador autenticado (Row Level Security)
- Storage bucket `material` con acceso público de lectura

## Despliegue

El proyecto se despliega automáticamente en Vercel en cada push a `master`.

### Variables requeridas
No se requieren variables de entorno en Vercel — las credenciales de Supabase (URL + anon key) son públicas por diseño y van directamente en `js/supabase.js`.

## Desarrollo Local

Clona el repo y abre `index.html` directamente en el navegador, o usa Live Server en VS Code.

```bash
git clone https://github.com/jeffrey94lopez/academia-bold-v1.git
cd academia-bold-v1
# Abre index.html con Live Server
```

> Los módulos ES (`import/export`) requieren que los archivos se sirvan desde un servidor HTTP, no desde el sistema de archivos directamente (`file://`). Usa Live Server o similar.

## Panel Admin

Accede en `/admin` con las credenciales configuradas en Supabase Authentication.
