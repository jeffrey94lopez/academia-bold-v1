-- Visibilidad de lecciones por entorno de deploy.
--
-- `lecciones.active` es UNA columna en una tabla que comparten todos los
-- deploys, así que ocultar una lección desde el admin del sandbox la ocultaba
-- también en el portal real. Mismo problema que tenían los toggles de módulos
-- (ver add_env_app_settings.sql) y mismo modelo de solución.
--
-- Producción SIGUE viviendo en `lecciones.active`; esta tabla guarda solo lo
-- que cada entorno no-prod cambió. Por eso el check contra 'prod': una fila
-- así no la leería nadie y sería una segunda fuente de verdad silenciosa.
--
-- Consecuencia buscada: mientras no haya filas acá, el comportamiento es
-- idéntico al de hoy, y revertir no requiere migrar nada de vuelta.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

create table if not exists public.leccion_visibilidad (
  leccion_id uuid        not null references public.lecciones(id) on delete cascade,
  env        text        not null check (env <> 'prod'),
  active     boolean     not null,
  updated_at timestamptz not null default now(),
  primary key (leccion_id, env)
);

-- El on delete cascade es a propósito: si se borra la lección, sus overrides
-- dejan de tener sentido y no deben quedar huérfanos apuntando a un uuid que
-- ya no existe.

alter table public.leccion_visibilidad enable row level security;

-- Mismas políticas que app_settings: el portal lee con la clave anon y solo un
-- admin autenticado escribe. Se declaran acá y no solo en el dashboard porque
-- el repo venía sin reflejar las policies vivas.
drop policy if exists "public read" on public.leccion_visibilidad;
create policy "public read" on public.leccion_visibilidad
  for select to anon, authenticated using (true);

drop policy if exists "auth write" on public.leccion_visibilidad;
create policy "auth write" on public.leccion_visibilidad
  for all to authenticated using (true) with check (true);

-- Realtime, para que ocultar una lección se vea sin recargar. El guard hace el
-- archivo re-ejecutable: `add table` revienta si la tabla ya está publicada.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname    = 'supabase_realtime'
       and schemaname = 'public'
       and tablename  = 'leccion_visibilidad') then
    alter publication supabase_realtime add table public.leccion_visibilidad;
  end if;
end $$;
