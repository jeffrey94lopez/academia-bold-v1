# Verticales Retail / Restaurantes en el Centro de Ayuda

**Fecha:** 2026-07-13
**Estado:** aprobado por el usuario (mockups en artifacts de la sesión)

## Contexto

La plataforma Bold ahora tiene dos verticales de producto — **Retail** y **Restaurantes** — y cada una se usa en dos plataformas: **Web** y **Mobile**. Hoy todas las lecciones del Centro de Ayuda son de Retail y están mezcladas sin distinción de vertical ni plataforma. Existe una columna `lecciones.dispositivo` (`web` / `app` / `datafono`) que el admin ya asigna pero el portal del estudiante no usa.

**Alcance acordado:** solo las **lecciones** se separan por vertical/plataforma. Material de apoyo, glosario, curso certificable y el bot siguen compartidos. El bot recibe metadatos para no confundir lecciones (ver §5), pero la conversación donde pregunta la vertical al cliente es una fase futura.

## 1. Modelo de datos

Nuevas columnas en `public.lecciones`:

```sql
alter table public.lecciones
  add column if not exists vertical text not null default 'retail'
    check (vertical in ('retail', 'restaurantes')),
  add column if not exists plataforma text not null default 'web'
    check (plataforma in ('web', 'mobile'));

-- Backfill desde dispositivo: web→web; app y datafono→mobile. Vertical: todo retail.
update public.lecciones
  set plataforma = case dispositivo when 'web' then 'web' else 'mobile' end;
```

- La columna `dispositivo` **deja de usarse** en el código pero no se elimina en esta fase (se borra en una limpieza posterior, cuando el equipo termine de reclasificar).
- La migración se guarda en `supabase/migrations/add_vertical_plataforma_lecciones.sql` y se ejecuta una sola vez en el SQL Editor (mismo flujo que las migraciones existentes).
- Orden de despliegue: primero la migración (las columnas nuevas no rompen el código viejo), después el deploy del frontend.

## 2. Portal del estudiante (`js/lessons.js`)

Selector de dos niveles sobre la lista de lecciones (estilo aprobado: tarjetas con iconos monocromos + chips):

- **Tarjetas de vertical**: `Retail` (icono lucide `store`) y `Restaurantes` (icono lucide `utensils`), trazo monocromo `currentColor`, sin emojis de color. La activa se marca con borde y fondo azul (`--blue-100` / fondo suave).
- **Chips de plataforma**: `Web` y `Mobile`; el activo en azul sólido.
- **Persistencia**: la selección se guarda vía `js/storage.js` (claves `bold_vertical`, `bold_plataforma`). Primera visita: `retail` + `web`.
- **Filtrado**: se mantiene la consulta única actual (todas las lecciones activas) y el filtrado por `vertical`/`plataforma` se hace en cliente — el catálogo es pequeño y así cambiar de pestaña es instantáneo, sin nuevas consultas. Las categorías muestran solo lecciones de la combinación activa; una categoría sin lecciones en esa combinación no se lista. Los contadores y la búsqueda operan dentro de la selección.
- **Estado vacío**: si la combinación no tiene lecciones, mensaje amable («Aún no hay lecciones aquí») con botón para saltar a la otra plataforma de la misma vertical.
- **Layouts**: en desktop las tarjetas + chips van en una franja sobre el panel de categorías; en móvil (stack de 3 pantallas) van arriba de la pantalla de categorías.
- **Analytics**: `page_view` y `lesson_open` agregan `vertical` y `plataforma` al payload para poder segmentar después.

## 3. Admin — pantalla de lecciones rediseñada (`js/admin.js`)

- **Barra de filtro** encima de la lista: tarjetas Retail/Restaurantes (mismo estilo monocromo) + chips **Todas / Web / Mobile** + la búsqueda existente. El filtro es solo de visualización; por defecto `Retail` + `Todas`.
- **Tarjetas de lección** (vista lista y cuadrícula): badge `<icono vertical> Retail · Mobile` junto a los badges existentes (`Oculta`, `Sin IA`, `#orden`). Acciones actuales sin cambios (ojo, bot, embedding, WhatsApp, borrar, drag & drop de orden).
- **Formulario de lección**: el select «Dispositivo» se reemplaza por:
  - **Vertical**: toggle de dos tarjetas (Retail / Restaurantes).
  - **Plataforma**: chips (Web / Mobile).
  - Al guardar se escriben `vertical` y `plataforma`; `dispositivo` ya no se escribe.
- El buscador y los filtros se combinan (buscar dentro del filtro activo).

## 4. Sin cambios

- Pestañas Curso, Recursos (material de apoyo), Glosario y bolbot POS del portal.
- Tabla `categorias` (las categorías son compartidas entre verticales; una categoría puede tener lecciones de ambas).
- Flujo de progreso del curso y certificados.

## 5. Bot (contrato de datos, fase parcial)

Para que el bot no confunda lecciones de Web con Mobile ni de verticales distintas:

- **`match_lessons`** (RPC de búsqueda vectorial usada por n8n) devuelve además `vertical` y `plataforma` de cada lección. Si la firma actual lo permite, se agregan parámetros opcionales de filtro (`p_vertical`, `p_plataforma`) con default `null` (sin filtro) para no romper el workflow actual.
- **`js/assistant.js`** incluye en el payload del webhook de n8n la selección actual del estudiante (`vertical`, `plataforma` desde storage), para que el workflow pueda filtrar o priorizar resultados.
- **Workflow n8n** («Bold POS Chat»): ajustar el prompt/consulta para usar esos campos. Este cambio vive fuera del repo; el plan lo lista como tarea manual coordinada.
- **Fase futura (fuera de alcance)**: que el bot pregunte al cliente su vertical cuando no la conozca y la recuerde durante la conversación.

## 6. Verificación

- Tests con `node --test` para la lógica pura que se extraiga (p. ej. mapeo dispositivo→plataforma si queda en JS, filtrado/agrupación de lecciones por selección) — siguiendo el patrón de `tests/storage.test.mjs`.
- Verificación manual end-to-end: portal (cambiar vertical/plataforma, persistencia al recargar, estado vacío, búsqueda), admin (filtrar, crear/editar lección con toggle+selector, badges correctos), y bot (webhook recibe vertical/plataforma).
- Post-migración: query de control — ninguna lección con `plataforma` nulo y todas en `vertical='retail'`.
