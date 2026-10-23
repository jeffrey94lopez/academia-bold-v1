-- Recorrido guiado (onboarding.html): BolBot se abre en un panel lateral de la
-- práctica, y esas conversaciones tienen que poder separarse de las del portal.
-- Sin la marca no se puede responder "¿qué pregunta la gente MIENTRAS practica?"
-- ni evitar que esas dudas (de alguien que todavía no usa Bold POS) se mezclen
-- con las de comercios en operación en el dashboard de BolBot.
--
-- `origin` null = portal (todas las filas existentes y las nuevas del portal:
-- assistant.js solo escribe la columna cuando hay origen, ver js/bot-origin.js).
-- CHECK porque un tipeo del cliente rompería en silencio los GROUP BY de la
-- analítica; el cliente ya filtra a los valores de esta lista.
--
-- ORDEN: hasta que esto corra, el INSERT de las conversaciones del recorrido
-- falla (columna inexistente) y esos chats quedan sin fila. El chat igual
-- responde: createConversation captura el error y sigue sin conversationId.
--
-- Es idempotente: se puede volver a ejecutar sin riesgo. Ejecutar en el SQL
-- Editor del proyecto Supabase (base compartida por sandbox y producción).

alter table public.bodi_conversations
  add column if not exists origin text check (origin in ('onboarding'));

-- ── Verificación ───────────────────────────────────────────────────────────
-- 1) La columna existe con su check.
select column_name, data_type, is_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'bodi_conversations'
    and column_name = 'origin';

-- 2) Las políticas de INSERT siguen dejando entrar la fila. El repo NO refleja
--    las políticas vivas (ver memoria "Lectura anónima vía RLS"): leerlas acá.
--    Esperado: INSERT para {anon} y para {authenticated} con `with_check` que
--    no mire columnas (true). Si alguna política de INSERT enumerara columnas o
--    validara `origin`, la fila del recorrido se rechazaría con 42501.
select policyname, cmd, roles, qual, with_check
  from pg_policies
  where schemaname = 'public'
    and tablename = 'bodi_conversations'
  order by cmd, policyname;
