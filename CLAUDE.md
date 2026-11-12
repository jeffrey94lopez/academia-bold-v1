# Academia Bold POS — guía para Claude

Portal de capacitación y soporte de Bold POS ("Bold POS AI Soporte"): lecciones, BolBot (chat IA vía n8n),
conversor de inventario y panel admin con analytics. Ver `README.md` para tablas y estructura.

## Stack y comandos
- HTML + JS vanilla (módulos ES), Tailwind, Supabase (Postgres + RLS + Auth + Storage), Vercel, n8n.
- Tests: `node --test tests/*.test.mjs` (no `node --test tests/`: no encuentra los archivos).
- Servidor local: `npx serve -l 4173 .` → http://localhost:4173 (los módulos ES no funcionan con `file://`).
- Supabase vinculado al proyecto `academia-bold` (ref `tczcngfhuendmldafbrc`). Vercel: proyecto `academia-bold-v1`.

## Ramas y despliegue
- **`master` = producción.** Cada push despliega a https://academia.localizadoc.com. Nunca hacer push a `master`
  sin pasar la puerta de seguridad (abajo) y sin que el usuario lo pida.
- **`sandbox`** = trabajo en curso. Todo cambio nuevo se hace en `sandbox` o en una rama propia.
- Las migraciones SQL (`supabase/migrations/`) se aplican a mano en el proyecto remoto: avisar al usuario
  cuando un cambio necesite una.

## Convenciones
- Commits en español, estilo `tipo(alcance): descripcion` en minúsculas (`feat(inventario): ...`,
  `fix(bot): ...`). El cuerpo explica el *por qué*, con datos concretos si los hay.
- Diseños en `docs/superpowers/specs/`, planes en `docs/superpowers/plans/` (formato superpowers).
- Textos de la UI en español neutro/hondureño. Escapar siempre el HTML dinámico (`escapeHtml` en `js/utils.js`).

## Flujo de trabajo
1. **Entender:** `grill-me` para aclarar requisitos; `superpowers:brainstorming` → spec en `docs/superpowers/specs/`.
2. **Planear:** `superpowers:writing-plans` → plan en `docs/superpowers/plans/`.
3. **Implementar:** `superpowers:executing-plans` / `subagent-driven-development`, con TDD.
   UI: `frontend-design` y `design-taste-frontend`. Bugs: `diagnosing-bugs`.
4. **Verificar:** suite completa verde + prueba en navegador real (Playwright MCP) de los flujos tocados.
5. **Puerta de seguridad — obligatoria antes de mergear a `master`:**
   - `differential-review` sobre `master...<rama>`.
   - `/security-review`.
   - Si hubo cambios de base de datos o RLS: advisors de seguridad de Supabase (`get_advisors`).
   - Si cambió `package.json` o hay librerías nuevas en `vendor/`: `supply-chain-risk-auditor`.
   - Reportar hallazgos al usuario; los críticos/altos se corrigen antes del merge.
6. **Mensual:** `insecure-defaults` y `sharp-edges` sobre todo el repo; `static-analysis` (Semgrep) si hay tiempo.

## Puntos sensibles
- `api/chat.js` es el proxy al webhook de n8n: no exponer URLs ni secretos del webhook al cliente.
- La anon key de Supabase es pública por diseño; la seguridad real depende de RLS. Toda tabla nueva necesita
  políticas RLS explícitas.
- El acceso "propio" de estudiantes/conversaciones se valida con el header `x-student-id` en RLS.
- Nunca mostrar al cliente JSON interno del bot (ver `textoSeguroDelBot`).
