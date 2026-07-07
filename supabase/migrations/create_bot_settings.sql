-- supabase/migrations/create_bot_settings.sql
-- Configuración del comportamiento del bot editable desde el admin.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
create table if not exists public.bot_settings (
  clave text primary key,
  valor boolean not null default true
);

insert into public.bot_settings (clave, valor) values
  ('chips_inicio', true),
  ('chips_tras_respuesta', true)
on conflict (clave) do nothing;

alter table public.bot_settings enable row level security;

-- Nombres de política sin comillas: al copiar el SQL desde un chat/editor las
-- comillas dobles pueden volverse tipográficas y romper el parseo.
drop policy if exists bot_settings_lectura_publica on public.bot_settings;
create policy bot_settings_lectura_publica
  on public.bot_settings for select using (true);

drop policy if exists bot_settings_escritura_autenticados on public.bot_settings;
create policy bot_settings_escritura_autenticados
  on public.bot_settings for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Realtime para que el portal reaccione sin recargar
alter publication supabase_realtime add table public.bot_settings;
