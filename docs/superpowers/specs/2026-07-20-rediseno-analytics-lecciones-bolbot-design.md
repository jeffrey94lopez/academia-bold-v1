# Rediseño de Analytics — Lecciones y BolBot

**Fecha:** 2026-07-20
**Estado:** Diseño aprobado (dashboards). Pendiente: specs de implementación por sub-proyecto.

## Contexto y problema

El portal academia-bold ya recopila bastante telemetría, pero el analytics actual **no es accionable** y **le faltan métricas clave**. Los dos dolores confirmados por el usuario:

1. **"No me dice qué hacer"** — hay muchos conteos pero no señalan qué lección arreglar, qué duda del bot atender ni dónde está el problema.
2. **"Faltan métricas clave"** — no medimos cosas que importan (calidad real del bot, lectura completa de lecciones, embudos, gaps de contenido).

Acciones que el analytics debe habilitar (todas confirmadas):
- Mejorar/crear lecciones.
- Afinar el bot (FAQs, chips, prompt de n8n).
- Cerrar el ciclo **bot → lección** (dudas recurrentes sin lección = contenido faltante).
- **Reportar a dirección, orientado sobre todo al BolBot** (el bot es la pieza estratégica).

Alcance de datos elegido: **el máximo**, incluida **auto-evaluación de calidad del bot con LLM en n8n**.

Restricciones heredadas (ver auditoría 2026-07-20):
- Se mantiene **JS vanilla** (no Next.js): el portal va embebido como iframe cross-origin en pos.bold.co.
- El analytics no debe bajar miles de filas al cliente → **RPC / vistas materializadas** para pre-agregar (punto #8 de la auditoría).
- Hoy el dashboard vive en `js/admin-analytics.js` (monolítico, con truncados `.limit(5000)`/`.limit(2000)` sin aviso).

## Decisión de arquitectura de información

**Tres pestañas** (opción B aprobada):

1. **Resumen** — ejecutivo, foco en el bot, para dirección.
2. **Lecciones** — operativo.
3. **BolBot** — operativo.

Las dos pestañas operativas usan una **estructura en 3 capas**:
- **① Impacto** — fila de KPIs.
- **② Requiere tu atención** — tarjetas de señales accionables; cada una nombra la acción concreta que dispara.
- **③ Exploración** — detalle, tablas y gráficos.

**Requisito global (fechas):** las tres pestañas llevan **selector de rango de fechas con picker de calendario** (dos campos inicio→fin) más atajos rápidos (Hoy / 7d / 30d).

**Requisito global (sistema visual — tema Merlin):** todo el rediseño debe usar el **tema Merlin** ya definido en `css/style.css` (sección "Merlin Design Tokens"). No inventar colores. En concreto:
- Azul de marca `--blue-100 (#121e6c)` y su escala; coral/CTA `--coral-100 (#ff2947)`.
- Tipografía **Montserrat** (`--font-family`).
- Feedback con los tokens existentes: `--error-*`, `--warning-*`, `--success-*`, `--info-*` (p. ej. las tarjetas "Requiere tu atención" en rojo/naranja usan error/warning; las señales positivas usan success).
- Fondo de página `--background-page (#f7f8fb)`, neutrales `--black-*`, gradientes de marca si aplica.
- Nota: los mockups de brainstorming usaron colores genéricos y variables del marco; **son solo referencia de layout**, no de color.

### Convención de fuente de dato (para planeación)

Cada métrica se clasifica por su origen — determina a qué sub-proyecto pertenece:
- **YA** — ya se recopila; solo hay que derivarla/mostrarla mejor.
- **FRONT** — requiere captura nueva ligera en el portal del estudiante.
- **LLM** — requiere auto-evaluación con LLM en el flujo de n8n.

## Dashboards diseñados

### Pestaña BolBot

**① Impacto (KPIs):**
- Conversaciones atendidas + tendencia. `YA`
- **Resolución real** (LLM). `LLM` — reemplaza al "resuelto" actual, que solo mide al ~9% que pulsa el botón.
- **Sentimiento neto** = %positivo − %negativo, mostrado como **número + barra apilada con porcentajes** (positivo/neutro/negativo). `YA`
- **Resuelto sin pasar a soporte** (% y nº estimado de casos sin humano). `YA`

**② Requiere tu atención:**
- 🔴 Dudas recurrentes NO resueltas → crear FAQ / afinar prompt. `LLM`
- 🔗 Contenido faltante (tema muy preguntado sin lección) → crear lección [puente bot→lección]. `LLM`
- 😟 Temas con sentimiento negativo alto → revisar respuesta/lección. `YA`
- ↗ Temas que escalan a soporte → reforzar contenido. `YA`

**③ Exploración:**
- Dudas por **categoría estable** (taxonomía LLM, no `topic` libre). `LLM`
- Tendencia de resolución & sentimiento en el tiempo. `LLM`
- Heatmap hora × día de la semana. `YA`
- **Explorador de conversaciones** con filtros (ver abajo); al expandir una fila: resumen de 1 línea `LLM` + transcripción + lecciones usadas.

**Explorador — barra de filtros (colapsable):**
- Se pliega/despliega; **con los filtros activos visibles como etiquetas aunque esté plegada**, más un "limpiar".
- Filtros combinables:
  - Búsqueda de texto libre en los mensajes.
  - **Rango de fechas con picker de calendario** + atajos.
  - Estado: **Resuelta / No resuelta / Ambigua**. `LLM`
  - Sentimiento: Positivo / Neutro / Negativo. `YA`
  - Soporte: Escaló / No escaló. `YA`
  - Categoría. `LLM`
  - Vertical / plataforma (Retail/Restaurantes · Web/App). `FRONT` (el bot ya recibe estos datos; falta persistirlos por conversación).
  - Longitud de la conversación.

**Esquema de resolución (3 estados):** el LLM clasifica cada conversación en **Resuelta / No resuelta / Ambigua** (bot respondió pero el usuario se fue sin señal clara). Métrica **"Resolución real" = resueltas ÷ (resueltas + no resueltas)**; las ambiguas quedan visibles aparte y no ensucian el número.

### Pestaña Lecciones

**① Impacto (KPIs):** Visitas `YA` · Estudiantes en curso `YA` · **% que termina el curso** `YA` · Certificados `YA`.

**② Requiere tu atención:**
- 🔴 Lecciones **"trampa"** — alta reprobación / puntaje bajo → reescribir. `YA`
- 👻 Lecciones **"zombie"** — activas con casi cero visitas → despublicar/refundir/promocionar. `YA`
- 📉 **Se abren pero no se terminan** — abandono de lectura → acortar/mejorar inicio. `FRONT` (scroll/tiempo).
- 🔎 **Búsquedas sin resultado** — demanda de contenido inexistente → crear lección. `YA`

**③ Exploración:**
- **Embudo del curso**: entró → abrió lección → presentó examen → aprobó → terminó, con las fugas (%) marcadas. `YA` + `FRONT`.
- Tabla de lecciones: vistas + **% leída completa** `FRONT` + % aprueban `YA`.
- Búsquedas de estudiantes con "0 resultados" resaltadas. `YA`
- Tendencia de visitas + estudiantes nuevos por día. `YA`

### Pestaña Resumen ejecutivo

- **Barra superior:** selector de mes/rango (picker de calendario) + comparación con período previo + **Exportar (PDF/CSV)**.
- **El BolBot este mes** (hero, protagonista): Conversaciones · Resolución real (LLM) · **Resuelto sin pasar a soporte** (con nº estimado de casos sin humano) · Satisfacción (número neto + barra).
- **Formación/lecciones** (compacto): Estudiantes en curso · % que termina · Certificados.
- **Tendencia e insights:**
  - Volumen y resolución del bot a 6 meses.
  - Temas más consultados.
  - **Insights que cruzan bot ↔ lecciones**: contenido faltante, punto débil compartido (tema con sentimiento negativo del bot + alta reprobación de su lección), descarga a soporte.

## Descomposición en sub-proyectos

Cada uno con su propio ciclo spec → plan → implementación.

### ① Fundación de datos (construir primero — todo depende de él)

**Captura FRONT (portal del estudiante):**
- Tiempo y scroll por lección; evento de "lectura completa". (Bug conocido a respetar: no romper el realtime de lecciones, punto #7 de la auditoría.)
- Abandono de examen; modo "explore" real (hoy solo se emite `course`).
- Vertical y plataforma por conversación del bot (persistir lo que ya se envía).
- (Opcional) clics en chips del bot.

**Auto-evaluación LLM en n8n (por conversación):**
- Estado de resolución (Resuelta / No resuelta / Ambigua).
- Categoría según taxonomía estable.
- Detección de gap de conocimiento (tema sin lección que lo cubra).
- Resumen de 1 línea.
- Se escribe de vuelta a `bodi_conversations` en columnas nuevas.

**Supabase (esquema + agregación):**
- Columnas nuevas en `bodi_conversations`: resolución LLM, categoría, gap, resumen, vertical, plataforma. (Además: consolidar la discrepancia `started_at` vs `created_at` y formalizar `lessons_used`, hoy sin migración.)
- Nuevos eventos/columnas para telemetría de lectura de lecciones.
- **RPC / vistas materializadas** que pre-agregan los KPIs y series; el admin consume el resultado, no baja miles de filas. Refresco vía `pg_cron` o Database Webhook.
- Migraciones versionadas (hoy el esquema no lo está).

### ② Dashboard Lecciones (rediseño accionable)

Consume ①. Reescribe la vista de Lecciones de `admin-analytics.js` con la estructura de 3 capas y las señales accionables descritas.

### ③ Dashboard BolBot + Resumen ejecutivo + puente bot→lección

Consume ①. Incluye la vista BolBot, el Resumen ejecutivo y las acciones directas del puente (crear lección/FAQ desde una señal).

**Orden de construcción:** ① primero; luego ② y ③ (en paralelo o secuencia).

## Fuera de alcance (por ahora)

- No se migra a Next.js.
- No se rediseñan otros paneles del admin (Home, Registro de actividad, Resultados del curso) salvo lo necesario para navegación.
- La corrección de los bugs de seguridad de la auditoría (XSS, RLS, auth anónima) es un trabajo aparte, aunque ① debe evitar reintroducir o chocar con esos problemas.

## Criterios de éxito

- Cada tarjeta de "Requiere tu atención" enlaza a una acción concreta (editar/crear lección, crear FAQ, afinar prompt).
- El bot reporta **calidad real** (resolución LLM) en vez del botón auto-reportado.
- El Resumen ejecutivo se puede exportar y presentar a dirección sin edición manual.
- El analytics no baja miles de filas al cliente (todo pre-agregado).
- Existe el puente bot→lección: una duda recurrente sin lección se puede convertir en lección desde el dashboard.
