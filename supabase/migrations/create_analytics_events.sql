-- analytics_events: telemetría de uso del portal (visitas, lecciones, exámenes,
-- búsquedas, certificados). La tabla ya existe en producción; esta migración la
-- versiona (create if not exists = no-op si ya está) y asegura los índices que
-- las RPCs de analytics necesitan para agregar por fecha/tipo sin escaneo total.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
create table if not exists public.analytics_events (
  id          bigint generated always as identity primary key,
  event_type  text not null,
  payload     jsonb default '{}'::jsonb,
  session_id  text,
  mode        text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_analytics_events_type_date
  on public.analytics_events (event_type, created_at desc);
create index if not exists idx_analytics_events_created
  on public.analytics_events (created_at desc);
