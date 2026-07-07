-- supabase/migrations/enable_realtime_app_settings.sql
-- Habilita realtime para app_settings (toggles de chips del bot en vivo).
-- Ejecutar UNA sola vez en el SQL Editor; si reporta "already member of
-- publication" es benigno (solo pasa al re-ejecutar).
alter publication supabase_realtime add table public.app_settings;
