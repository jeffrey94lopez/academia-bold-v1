# FAQ con Lección/Link — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar 2 columnas a `preguntas_frecuentes` (leccion_id, link_url), poblar 16 FAQs desde chats de soporte, y actualizar el panel admin + vista del estudiante para vincular cada FAQ a una lección interna o URL externa.

**Architecture:** Migración SQL en Supabase → `lessons.js` expone `window.openLessonById` → `admin.js` agrega dropdown de lección + campo URL al formulario FAQ → `resources.js` renderiza botón/enlace condicional en el acordeón del estudiante.

**Tech Stack:** Vanilla JS (ES modules), Supabase JS v2, Tailwind CSS (CDN), Lucide icons.

---

## Archivos modificados

| Archivo | Cambio |
|---------|--------|
| Supabase SQL | `ALTER TABLE` + `INSERT` de 16 FAQs |
| `js/lessons.js` | Exponer `window.openLessonById` al final de `renderLessons()` |
| `js/admin.js` | `renderFaqPanel`: cargar lecciones, badges, formulario extendido, guardado |
| `js/resources.js` | `loadFaq`: botón/enlace condicional en cuerpo del acordeón |

---

## Task 1: Migración de base de datos — agregar columnas

**Files:**
- Modify: Supabase → SQL Editor

- [ ] **Step 1: Ejecutar migración en Supabase**

En el SQL Editor de Supabase (project → SQL Editor → New query), pegar y ejecutar:

```sql
ALTER TABLE preguntas_frecuentes
  ADD COLUMN IF NOT EXISTS leccion_id UUID REFERENCES lecciones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS link_url   TEXT;
```

- [ ] **Step 2: Verificar columnas**

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'preguntas_frecuentes'
ORDER BY ordinal_position;
```

Esperado: aparecen `leccion_id` (uuid, YES) y `link_url` (text, YES) en el listado.

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "feat(db): add leccion_id and link_url columns to preguntas_frecuentes"
```

---

## Task 2: Insertar las 16 FAQs iniciales

**Files:**
- Modify: Supabase → SQL Editor

- [ ] **Step 1: Insertar FAQs**

En el SQL Editor de Supabase, ejecutar:

```sql
INSERT INTO preguntas_frecuentes (pregunta, respuesta, orden) VALUES
(
  '¿Qué hago si una factura electrónica se quedó en estado borrador?',
  'Ingresa al módulo de Facturas desde el inicio, abre la factura y presiona el botón "Reenviar". Debería cambiar a Aceptada. Si no ocurre de inmediato, es por intermitencias de la DIAN — espera 20 a 30 minutos e inténtalo nuevamente.',
  1
),
(
  '¿Qué son las intermitencias de la DIAN y cuánto duran?',
  'Son fallas temporales en el sistema de la DIAN que impiden que las facturas sean aceptadas al instante. Generalmente duran entre 20 y 30 minutos. Durante ese tiempo las facturas pueden quedar en estado borrador o pendiente. Solo espera y usa el botón "Reenviar" cuando el sistema se restablezca.',
  2
),
(
  '¿Cómo anulo un comprobante y lo convierto en factura electrónica?',
  'Ve a Ingresos > Comprobantes, abre el comprobante y haz clic en "Eliminar" en la parte superior — ingresa el motivo de eliminación. Una vez eliminado, crea la factura electrónica nuevamente. Si no ves el botón Eliminar, no tienes permiso para anular; debe hacerlo el usuario administrador.',
  3
),
(
  '¿Cómo hago un cargue masivo de productos con variantes de talla y color?',
  'Ve a Ítems > Variantes de Inventario y verifica que las variantes estén creadas. Si no existen, créalas con "Nuevo". Para tallas únicas, crea una variante llamada "Tallas especiales". Con las variantes listas, procede con el cargue masivo desde Ítems. Si tienes dudas, contáctanos para programar una videollamada de apoyo.',
  4
),
(
  '¿Puedo ingresar inventario desde el celular?',
  'Desde la app móvil no es posible. Sin embargo, puedes hacerlo desde el navegador web del celular (como Google Chrome). Ingresa a tu cuenta de Bold POS desde el navegador y podrás registrar entradas de inventario sin problema.',
  5
),
(
  '¿Cómo actualizo el tipo de IVA de mis productos?',
  'Ve a Ítems, abre cada producto que necesita ajuste, modifica el campo de tipo de IVA y guarda. Por defecto todos los productos tienen IVA del 19%. El comprobante no es documento fiscal válido y muestra precios sin IVA — para cobrar con IVA usa la factura electrónica.',
  6
),
(
  '¿Qué motivos de nota de crédito regresan el ítem al inventario?',
  'Solo dos motivos permiten el reingreso automático: "Devolución parcial de los bienes y/o no aceptación parcial del servicio" y "Anulación de factura electrónica". El motivo "Ajuste de Precio" NO regresa el inventario. Si lo usaste, haz el ajuste manualmente desde Ítems > Ajuste de inventario.',
  7
),
(
  '¿Por qué la venta sigue en el reporte después de hacer una nota de crédito?',
  'La nota de crédito no anula la factura internamente, por lo que la venta original siempre permanece en el historial. Es el comportamiento normal del sistema. Puedes ver el detalle en Reportes > Notas de Crédito para tener el cuadre completo.',
  8
),
(
  '¿Cómo creo un usuario con acceso restringido (rol Vendedor)?',
  'Ve a Ajustes > Usuarios desde el navegador (pos.bold.co). Haz clic en "Nuevo usuario", usa un correo diferente al tuyo y asigna el rol "Vendedor". Este rol tiene funciones restringidas que limitan el acceso a información sensible del negocio.',
  9
),
(
  '¿Puedo tener diferentes usuarios para diferentes dispositivos?',
  'Sí. Si dos dispositivos muestran los mismos permisos es porque usan el mismo usuario. Crea un usuario nuevo con correo diferente y rol Vendedor desde Ajustes > Usuarios. Cada dispositivo debe tener su propio acceso con el nivel de permisos correspondiente.',
  10
),
(
  '¿Cómo creo mi cuenta en Bold POS?',
  'Ingresa a https://pos.bold.co/#/signup, completa el formulario y crea tu contraseña. Una vez creada la cuenta, contáctanos para activar el plan que adquiriste y programar tu capacitación inicial.',
  11
),
(
  '¿Cómo cambio mi plan?',
  'El cambio de plan lo realiza el equipo de soporte. Escríbenos indicando el plan deseado, el nombre de tu negocio y el correo de tu cuenta. Recuerda que todas nuestras suscripciones son anuales.',
  12
),
(
  '¿Dónde consulto los precios de la plataforma?',
  'Puedes ver los planes en https://bold.co/sistema-pos-split. Si quieres orientación personalizada sobre qué plan se adapta a tu negocio, un asesor comercial se pondrá en contacto contigo.',
  13
),
(
  '¿Cómo configuro mi impresora de tickets?',
  'La configuración depende del modelo de tu impresora. Contáctanos indicando el modelo exacto y nuestro equipo puede asistirte de forma remota vía Anydesk para verificar la conexión y el formato de impresión.',
  14
),
(
  '¿Cómo registro un pago dividido (efectivo + transferencia)?',
  '[Respuesta pendiente de corrección por el administrador]',
  15
),
(
  '¿Cómo descargo el reporte de facturas para el contador?',
  'Ve a Reportes en la plataforma (pos.bold.co/#/reports). Genera el reporte de Facturas de Venta, Comprobantes o Cierre de Caja y usa el botón "Exportar a Excel" en la parte superior. El reporte de Notas de Crédito lo encuentras debajo del reporte de facturas de venta.',
  16
);
```

- [ ] **Step 2: Verificar inserción**

```sql
SELECT orden, pregunta FROM preguntas_frecuentes ORDER BY orden;
```

Esperado: 16 filas, ordenadas del 1 al 16.

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "feat(data): seed 16 initial FAQs from support chat analysis"
```

---

## Task 3: `lessons.js` — exponer `window.openLessonById`

**Files:**
- Modify: `js/lessons.js:322-328`

- [ ] **Step 1: Agregar `window.openLessonById` al final de `renderLessons()`**

Localizar el bloque `// ── Initialize` al final de `renderLessons()` (línea ~322). Reemplazar:

```js
  // ── Initialize ────────────────────────────────────────────────────────────
  renderMobileCatList()
  renderMobileLessonList()
  showScreen('categories')
  renderAccordion()
  renderDeskContent()
}
```

Por:

```js
  // ── Initialize ────────────────────────────────────────────────────────────
  renderMobileCatList()
  renderMobileLessonList()
  showScreen('categories')
  renderAccordion()
  renderDeskContent()

  window.openLessonById = (id) => {
    const lesson = lessons.find(l => String(l.id) === String(id))
    if (!lesson) return
    activeLesson = lesson
    // Desktop
    renderAccordion()
    renderDeskContent()
    // Mobile
    const titleSpan = document.getElementById('ls-mob-lesson-title')
    if (titleSpan) titleSpan.textContent = lesson.titulo
    const mobContent = document.getElementById('ls-mob-content')
    if (mobContent) renderLessonContent(mobContent, lesson)
    showScreen('content')
  }
}
```

- [ ] **Step 2: Verificar en consola del navegador**

Abrir la app del estudiante, esperar que carguen las lecciones, luego en la consola:

```js
typeof window.openLessonById  // debe retornar "function"
```

- [ ] **Step 3: Commit**

```bash
git add js/lessons.js
git commit -m "feat(lessons): expose window.openLessonById for cross-module navigation"
```

---

## Task 4: `admin.js` — formulario FAQ extendido con lecciones y link

**Files:**
- Modify: `js/admin.js` → función `renderFaqPanel` (líneas ~1098-1222)

### Step 1: Cargar lecciones al inicio de `renderFaqPanel`

- [ ] Localizar la línea 1100 en `renderFaqPanel`:

```js
  const { data } = await supabase.from('preguntas_frecuentes').select('*').order('orden').order('created_at')
  const items = data || []
```

Reemplazar por:

```js
  const [{ data }, { data: lecciones }] = await Promise.all([
    supabase.from('preguntas_frecuentes').select('*').order('orden').order('created_at'),
    supabase.from('lecciones').select('id,titulo').eq('active', true).order('orden')
  ])
  const items = data || []
  const leccionesList = lecciones || []
```

### Step 2: Actualizar `renderList` — agregar badges y data attributes

- [ ] Localizar la función `renderList` (~línea 1103). Reemplazar completamente:

```js
  function renderList(list) {
    return list.length ? list.map(f => `
      <div data-id="${f.id}" class="faq-item bg-white border border-[var(--blue-10)] rounded-xl px-4 py-3 flex items-start gap-3">
        <div class="flex-1 min-w-0">
          <p class="font-bold text-sm text-[var(--blue-100)]">${escapeHtml(f.pregunta)}</p>
          <p class="text-xs text-[var(--black-60)] mt-0.5 line-clamp-2">${escapeHtml(f.respuesta)}</p>
        </div>
        <div class="flex gap-1.5 shrink-0">
          <button data-id="${f.id}" data-pregunta="${escapeHtml(f.pregunta)}" data-respuesta="${escapeHtml(f.respuesta)}"
            class="edit-faq px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--blue-10)] text-[var(--blue-100)] hover:bg-[var(--blue-20)]">Editar</button>
          <button data-id="${f.id}" data-pregunta="${escapeHtml(f.pregunta)}"
            class="del-faq px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--coral-10)] text-[var(--coral-100)] hover:bg-[var(--coral-30)]">Eliminar</button>
        </div>
      </div>
    `).join('') : '<p class="text-[var(--black-40)] text-sm text-center py-6">No hay preguntas aún.</p>'
  }
```

Por:

```js
  function renderList(list) {
    return list.length ? list.map(f => `
      <div data-id="${f.id}" class="faq-item bg-white border border-[var(--blue-10)] rounded-xl px-4 py-3 flex items-start gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1.5 flex-wrap">
            <p class="font-bold text-sm text-[var(--blue-100)]">${escapeHtml(f.pregunta)}</p>
            ${f.leccion_id ? '<span class="text-[10px] font-bold bg-[var(--blue-10)] text-[var(--blue-100)] px-1.5 py-0.5 rounded-full">📚 Lección</span>' : ''}
            ${f.link_url ? '<span class="text-[10px] font-bold bg-[var(--black-10)] text-[var(--black-60)] px-1.5 py-0.5 rounded-full">🔗 Link</span>' : ''}
          </div>
          <p class="text-xs text-[var(--black-60)] mt-0.5 line-clamp-2">${escapeHtml(f.respuesta)}</p>
        </div>
        <div class="flex gap-1.5 shrink-0">
          <button data-id="${f.id}" data-pregunta="${escapeHtml(f.pregunta)}" data-respuesta="${escapeHtml(f.respuesta)}"
            data-leccion-id="${f.leccion_id || ''}" data-link-url="${escapeHtml(f.link_url || '')}"
            class="edit-faq px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--blue-10)] text-[var(--blue-100)] hover:bg-[var(--blue-20)]">Editar</button>
          <button data-id="${f.id}" data-pregunta="${escapeHtml(f.pregunta)}"
            class="del-faq px-3 py-1.5 text-xs font-bold rounded-lg bg-[var(--coral-10)] text-[var(--coral-100)] hover:bg-[var(--coral-30)]">Eliminar</button>
        </div>
      </div>
    `).join('') : '<p class="text-[var(--black-40)] text-sm text-center py-6">No hay preguntas aún.</p>'
  }
```

### Step 3: Actualizar el formulario HTML — agregar dropdown y link

- [ ] Dentro del `el.innerHTML`, localizar el bloque del formulario inline (~línea 1140):

```js
    <div id="faqFormInline" class="hidden mt-3 bg-white rounded-2xl border border-[var(--blue-20)] p-4">
      <input type="hidden" id="faqId">
      <label class="block text-[9px] font-black uppercase tracking-widest text-[var(--black-40)] mb-1">Pregunta</label>
      <input id="faqPregunta" placeholder="Pregunta frecuente" required class="w-full px-3 py-2 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)] mb-2">
      <label class="block text-[9px] font-black uppercase tracking-widest text-[var(--black-40)] mb-1">Respuesta</label>
      <textarea id="faqRespuesta" placeholder="Respuesta" rows="3" required class="w-full px-3 py-2 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)] resize-none mb-2"></textarea>
      <p id="faqFormError" class="hidden text-red-500 text-xs mb-2"></p>
      <div class="flex gap-2">
        <button id="cancelFaq" class="flex-1 py-2 rounded-xl border border-[var(--blue-20)] text-sm font-bold text-[var(--black-60)]">Cancelar</button>
        <button id="saveFaq" class="flex-1 py-2 rounded-xl bg-[var(--blue-100)] text-white text-sm font-bold">Guardar</button>
      </div>
    </div>
```

Reemplazar por:

```js
    <div id="faqFormInline" class="hidden mt-3 bg-white rounded-2xl border border-[var(--blue-20)] p-4">
      <input type="hidden" id="faqId">
      <label class="block text-[9px] font-black uppercase tracking-widest text-[var(--black-40)] mb-1">Pregunta</label>
      <input id="faqPregunta" placeholder="Pregunta frecuente" required class="w-full px-3 py-2 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)] mb-2">
      <label class="block text-[9px] font-black uppercase tracking-widest text-[var(--black-40)] mb-1">Respuesta</label>
      <textarea id="faqRespuesta" placeholder="Respuesta" rows="3" required class="w-full px-3 py-2 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)] resize-none mb-2"></textarea>
      <label class="block text-[9px] font-black uppercase tracking-widest text-[var(--black-40)] mb-1 mt-1">Lección relacionada (opcional)</label>
      <select id="faqLeccionId" class="w-full px-3 py-2 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)] mb-2 bg-white">
        <option value="">— Ninguna —</option>
        ${leccionesList.map(l => `<option value="${l.id}">${escapeHtml(l.titulo)}</option>`).join('')}
      </select>
      <label class="block text-[9px] font-black uppercase tracking-widest text-[var(--black-40)] mb-1">Link externo (opcional)</label>
      <input id="faqLinkUrl" type="url" placeholder="https://..." class="w-full px-3 py-2 rounded-xl border border-[var(--blue-20)] text-sm outline-none focus:border-[var(--blue-100)] mb-2">
      <p id="faqFormError" class="hidden text-red-500 text-xs mb-2"></p>
      <div class="flex gap-2">
        <button id="cancelFaq" class="flex-1 py-2 rounded-xl border border-[var(--blue-20)] text-sm font-bold text-[var(--black-60)]">Cancelar</button>
        <button id="saveFaq" class="flex-1 py-2 rounded-xl bg-[var(--blue-100)] text-white text-sm font-bold">Guardar</button>
      </div>
    </div>
```

### Step 4: Actualizar `showFaqForm` para pre-llenar los nuevos campos

- [ ] Localizar `function showFaqForm` (~línea 1162):

```js
  function showFaqForm(id = '', pregunta = '', respuesta = '') {
    document.getElementById('faqId').value = id
    document.getElementById('faqPregunta').value = pregunta
    document.getElementById('faqRespuesta').value = respuesta
    document.getElementById('faqFormError').classList.add('hidden')
    document.getElementById('faqFormInline').classList.remove('hidden')
    document.getElementById('faqPregunta').focus()
    document.querySelectorAll('.faq-item').forEach(el => el.classList.remove('!border-[var(--blue-100)]'))
    if (id) document.querySelector(`.faq-item[data-id="${id}"]`)?.classList.add('!border-[var(--blue-100)]')
  }
```

Reemplazar por:

```js
  function showFaqForm(id = '', pregunta = '', respuesta = '', leccionId = '', linkUrl = '') {
    document.getElementById('faqId').value = id
    document.getElementById('faqPregunta').value = pregunta
    document.getElementById('faqRespuesta').value = respuesta
    document.getElementById('faqLeccionId').value = leccionId
    document.getElementById('faqLinkUrl').value = linkUrl
    document.getElementById('faqFormError').classList.add('hidden')
    document.getElementById('faqFormInline').classList.remove('hidden')
    document.getElementById('faqPregunta').focus()
    document.querySelectorAll('.faq-item').forEach(el => el.classList.remove('!border-[var(--blue-100)]'))
    if (id) document.querySelector(`.faq-item[data-id="${id}"]`)?.classList.add('!border-[var(--blue-100)]')
  }
```

### Step 5: Actualizar `bindFaqActions` para pasar los nuevos data attributes

- [ ] Localizar `function bindFaqActions` (~línea 1173):

```js
  function bindFaqActions() {
    document.querySelectorAll('.edit-faq').forEach(b => b.addEventListener('click', () =>
      showFaqForm(b.dataset.id, b.dataset.pregunta, b.dataset.respuesta)))
```

Reemplazar esa línea del forEach por:

```js
  function bindFaqActions() {
    document.querySelectorAll('.edit-faq').forEach(b => b.addEventListener('click', () =>
      showFaqForm(b.dataset.id, b.dataset.pregunta, b.dataset.respuesta, b.dataset.leccionId || '', b.dataset.linkUrl || '')))
```

### Step 6: Actualizar la lógica de guardado para incluir los nuevos campos

- [ ] Localizar el listener de `saveFaq` (~línea 1189). Localizar las líneas:

```js
    const pregunta = document.getElementById('faqPregunta').value.trim()
    const respuesta = document.getElementById('faqRespuesta').value.trim()
    if (!pregunta || !respuesta) { errorEl.textContent = 'La pregunta y respuesta son requeridas.'; errorEl.classList.remove('hidden'); return }
    btn.disabled = true; btn.textContent = 'Guardando...'
    let savedId = id
    const { data: saved, error } = id
      ? await supabase.from('preguntas_frecuentes').update({ pregunta, respuesta }).eq('id', id).select('id').single()
      : await supabase.from('preguntas_frecuentes').insert({ pregunta, respuesta }).select('id').single()
```

Reemplazar por:

```js
    const pregunta = document.getElementById('faqPregunta').value.trim()
    const respuesta = document.getElementById('faqRespuesta').value.trim()
    const leccion_id = document.getElementById('faqLeccionId').value || null
    const link_url = document.getElementById('faqLinkUrl').value.trim() || null
    if (!pregunta || !respuesta) { errorEl.textContent = 'La pregunta y respuesta son requeridas.'; errorEl.classList.remove('hidden'); return }
    btn.disabled = true; btn.textContent = 'Guardando...'
    let savedId = id
    const { data: saved, error } = id
      ? await supabase.from('preguntas_frecuentes').update({ pregunta, respuesta, leccion_id, link_url }).eq('id', id).select('id').single()
      : await supabase.from('preguntas_frecuentes').insert({ pregunta, respuesta, leccion_id, link_url }).select('id').single()
```

- [ ] **Verificar en el navegador:**
  1. Abrir panel admin → P. Frecuentes
  2. Verificar que aparecen las 16 FAQs en el listado
  3. Clic en "Nueva pregunta" → el formulario muestra el dropdown de lecciones y el campo de link
  4. Clic en "Editar" en una FAQ → los campos se pre-llenan correctamente
  5. Editar una FAQ, seleccionar una lección del dropdown, guardar → el badge 📚 aparece en el listado
  6. Editar otra FAQ, pegar una URL, guardar → el badge 🔗 aparece en el listado

- [ ] **Step 7: Commit**

```bash
git add js/admin.js
git commit -m "feat(admin): extend FAQ form with lesson dropdown and external link field"
```

---

## Task 5: `resources.js` — botón/enlace en la vista del estudiante

**Files:**
- Modify: `js/resources.js` → función `loadFaq` (líneas ~70-97)

- [ ] **Step 1: Actualizar `loadFaq` para renderizar botón/enlace condicional**

Localizar la función `loadFaq` completa (~línea 70). Reemplazar el bloque `list.innerHTML = data.map(...)`:

```js
  list.innerHTML = data.map(f => `
    <details class="rounded-xl border border-[var(--blue-10)] bg-white overflow-hidden">
      <summary class="flex items-center justify-between gap-2 p-3 cursor-pointer list-none font-bold text-sm select-none">
        <span>${escapeHtml(f.pregunta)}</span>
        <i data-lucide="chevron-down" class="w-4 h-4 shrink-0 text-[var(--black-60)] transition-transform faq-chevron"></i>
      </summary>
      <div class="px-3 pb-3 text-xs text-[var(--black-60)] border-t border-[var(--blue-10)] pt-2 mt-0">${escapeHtml(f.respuesta)}</div>
    </details>
  `).join('')
```

Por:

```js
  list.innerHTML = data.map(f => {
    const hasLesson = !!f.leccion_id
    const hasLink = !!f.link_url
    const actionBtn = hasLesson
      ? `<button data-lesson-id="${f.leccion_id}" class="faq-lesson-btn mt-2 text-xs font-bold text-[var(--blue-100)] hover:underline flex items-center gap-1">Ver lección →</button>`
      : hasLink
      ? `<a href="${escapeHtml(f.link_url)}" target="_blank" rel="noopener" class="mt-2 inline-block text-xs font-bold text-[var(--blue-100)] hover:underline">Más información →</a>`
      : ''
    return `
      <details class="rounded-xl border border-[var(--blue-10)] bg-white overflow-hidden">
        <summary class="flex items-center justify-between gap-2 p-3 cursor-pointer list-none font-bold text-sm select-none">
          <span>${escapeHtml(f.pregunta)}</span>
          <i data-lucide="chevron-down" class="w-4 h-4 shrink-0 text-[var(--black-60)] transition-transform faq-chevron"></i>
        </summary>
        <div class="px-3 pb-3 text-xs text-[var(--black-60)] border-t border-[var(--blue-10)] pt-2 mt-0">
          ${escapeHtml(f.respuesta)}
          ${actionBtn}
        </div>
      </details>
    `
  }).join('')
```

- [ ] **Step 2: Agregar listeners para los botones de lección**

Localizar el bloque que viene justo después del `list.innerHTML = ...`, donde están el `lucide.createIcons()` y el listener de `toggle`. Agregar después de `lucide.createIcons()`:

```js
  list.querySelectorAll('.faq-lesson-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelector('[data-tab="lessons"]')?.click()
      window.openLessonById?.(btn.dataset.lessonId)
    })
  })
```

- [ ] **Step 3: Verificar en el navegador:**
  1. Abrir la app del estudiante → sección Recursos → Preguntas frecuentes
  2. Las 16 FAQs aparecen como acordeones
  3. Abrir una FAQ que tenga `leccion_id` → aparece botón "Ver lección →"
  4. Hacer clic en "Ver lección →" → navega al tab Lecciones y abre la lección correcta (desktop y mobile)
  5. Abrir una FAQ que tenga solo `link_url` → aparece enlace "Más información →"
  6. Hacer clic en "Más información →" → abre el link en nueva pestaña
  7. Abrir una FAQ sin vínculos → no aparece botón ni enlace adicional

- [ ] **Step 4: Commit**

```bash
git add js/resources.js
git commit -m "feat(resources): add lesson navigation and external link button to FAQ accordion"
```

---

## Criterios de aceptación finales

- [ ] 16 FAQs visibles en el panel admin y en la vista del estudiante
- [ ] El formulario admin muestra dropdown de lecciones + campo de URL
- [ ] Badges 📚 / 🔗 visibles en el listado del admin cuando corresponde
- [ ] Al editar, los campos se pre-llenan con los valores guardados
- [ ] Guardar persiste `leccion_id` y `link_url` en Supabase
- [ ] FAQ con lección → botón "Ver lección →" navega correctamente en desktop y mobile
- [ ] FAQ con solo URL → enlace "Más información →" abre en nueva pestaña
- [ ] FAQ sin vínculo → sin botón adicional
- [ ] El embedding Bolbot sigue funcionando (Re-embedear todo sin errores)
