-- supabase/migrations/enable_realtime_content.sql
-- Habilita Supabase Realtime (postgres_changes) para el contenido que el
-- portal del cliente refresca en vivo. (`lecciones` ya está en la publicación
-- desde la feature de realtime de lecciones.) Ejecutar UNA sola vez en el SQL
-- Editor del proyecto Supabase (falla con "already member" si se repite: ignorar).
alter publication supabase_realtime add table public.preguntas_frecuentes;
alter publication supabase_realtime add table public.bot_sugerencias;
