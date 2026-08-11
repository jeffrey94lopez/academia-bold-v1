# Alinear taxonomías bot ↔ lecciones — Plan de implementación

> **Para trabajadores agénticos:** pasos con checkbox (`- [ ]`). Marca [código]/[MANUAL] según dónde vive el cambio.

**Goal:** Que el clasificador del bot (n8n) y las lecciones usen **una sola lista de categorías**, para que "Qué atender ahora" deje de marcar falsos "contenido faltante" por nombres que no calzan.

**Contexto del problema:** el detector de gaps compara nombres exactos (`lecciones.categoria = category_del_bot`). Hoy el bot emite `Facturación/Cuenta`, `Hardware/Periféricos`, `Otro`, que no existen como categoría de lección → falso "contenido faltante" (ej.: Facturación aparece como faltante aunque el contenido existe bajo `Ingresos`).

## Taxonomía única (decidida 2026-08-11)

Categorías canónicas (compartidas por bot y lecciones):
`Ventas`, `Inventario`, `Ingresos`, `Egresos`, `Configuración`, `Contactos`, `Reportes`, `Hardware/Periféricos`, `Casos de Uso` (solo lecciones), `Otro` (solo bot, catch-all).

Decisiones de reconciliación:
- **Facturación → `Ingresos`** (no categoría propia; las lecciones de facturación ya viven ahí).
- **Cuenta / perfil / sucursal / admin → `Configuración`**.
- **Hardware/Periféricos → categoría propia** en bot y lecciones (datáfono, impresora, scanner).
- **Otro → solo bot**, y **no cuenta como "contenido faltante"**.

## Global Constraints

- Rama `sandbox`; nada a `master` sin visto bueno.
- El clasificador es parte del bot en producción (n8n "Bold POS Chat"): cambiarlo afecta solo a conversaciones **nuevas**.
- Tras cada tarea de código: `node --check` + `node --test tests/*.test.mjs` (baseline 177).

---

### Task 1: Excluir "Otro" de "Qué atender ahora" — [código] ✅ HECHO (2026-08-11)

**Files:** `js/bot-attention.js`, `tests/bot-attention.test.mjs`

- [x] `rankAttention` acepta `exclude = ['Otro', 'Sin categoría']` y salta esas categorías (no son categorías reales de lección).
- [x] Test `rankAttention: excluye "Otro"...` (TDD). Suite 177.

### Task 2: Agregar la categoría `Hardware/Periféricos` a las lecciones — [MANUAL / admin]

**Dónde:** tabla `categorias` (la crea el admin, no es código). Requiere sesión autenticada.

- [ ] **Step 1:** En el admin → panel **Lecciones** → gestión de categorías, crear la categoría `Hardware/Periféricos` (elegir emoji, p. ej. 🖨️/🔌, y orden). Alternativa SQL (correr en Supabase):

```sql
insert into public.categorias (nombre, emoji, orden)
values ('Hardware/Periféricos', '🖨️', 99)
on conflict do nothing;
```

- [ ] **Step 2:** (opcional) crear al menos una lección de hardware (datáfono/impresora) — es de las #1 dudas sin respuesta del bot.

### Task 3: Actualizar el clasificador del bot en n8n — [MANUAL / n8n]

**Dónde:** workflow "Bold POS Chat" en n8n.mplasesores.com, nodo clasificador (Text Classifier o el prompt de categorización).

- [ ] **Step 1:** Reemplazar el set de categorías que emite el clasificador por las canónicas y sus reglas de ruteo. Texto exacto sugerido para el prompt/sistema del clasificador:

```
Clasifica la consulta del usuario en EXACTAMENTE una de estas categorías (usa el nombre tal cual):
- Ventas — vender, cobrar, medios de pago, cambios/devoluciones, cliente en la venta.
- Inventario — productos, ítems, variantes, códigos de barras, stock, importar/exportar inventario.
- Ingresos — facturación (electrónica, XML, comprobantes, diseño/impresión de factura), notas, ingresos.
- Egresos — gastos, compras, egresos de efectivo.
- Configuración — cuenta, perfil, datos del negocio, sucursales, cambiar administrador, eliminar cuenta, ajustes.
- Contactos — clientes y proveedores (alta/edición de contactos).
- Reportes — reportes de ventas, cierres, informes.
- Hardware/Periféricos — datáfono, impresora, tickets, escáner/lector de código, periféricos.
- Otro — SOLO si no encaja claramente en ninguna de las anteriores.

Devuelve únicamente el nombre de la categoría.
```

- [ ] **Step 2:** Quitar la etiqueta `Facturación/Cuenta` del set (queda repartida en `Ingresos` y `Configuración`).
- [ ] **Step 3:** Probar con 3-4 mensajes reales de cada tipo (facturación → Ingresos; sucursal → Configuración; datáfono → Hardware/Periféricos) y verificar la salida.

### Task 4: (opcional) Remapear el histórico — [MANUAL / SQL]

**Contexto:** el cambio del clasificador solo afecta conversaciones nuevas; las ~40 viejas siguen como `Facturación/Cuenta`. La mayoría son facturación → `Ingresos`. Es imperfecto para las que eran "cuenta", pero facturación domina.

- [ ] **Step 1 (opcional):** correr en Supabase:

```sql
update public.bodi_conversations
set category = 'Ingresos'
where category = 'Facturación/Cuenta';
```

- [ ] Alternativa más fina: dejar el histórico como está y que el efecto se vea solo hacia adelante.

### Task 5: Verificación — [verify]

- [ ] Tras Task 2 y 3, en el dashboard → BoldBot POS, "Qué atender ahora" ya no muestra `Facturación/Cuenta` como contenido faltante (facturación cae en `Ingresos`, que tiene lección); `Otro` no aparece; `Hardware/Periféricos` aparece solo si de verdad no hay lección de hardware.

## Pasos MANUALES del usuario (resumen)

1. **Task 2:** crear categoría `Hardware/Periféricos` (admin o SQL).
2. **Task 3:** actualizar el prompt del clasificador en n8n con el texto de arriba + quitar `Facturación/Cuenta`.
3. **Task 4 (opcional):** remapear histórico con el UPDATE.
