-- Resumen para el aviso diario. Lo llama un workflow de n8n una vez al día.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
drop function if exists public.analytics_vacios_resumen_diario();
create or replace function public.analytics_vacios_resumen_diario()
returns jsonb
language sql stable security definer set search_path = public
as $$
  with umbral as (
    select coalesce((select value::int from app_settings
                      where key = 'gap_umbral_urgencia' and env = 'prod'
                        and value ~ '^[0-9]+$' limit 1), 5) as n
  )
  select jsonb_build_object(
    'nuevos_24h', (select coalesce(jsonb_agg(jsonb_build_object(
                            'titulo', titulo, 'preguntas', preguntas_total) order by preguntas_total desc), '[]'::jsonb)
                     from bot_vacios
                    where estado = 'pendiente' and created_at > now() - interval '24 hours'),
    'urgentes',   (select coalesce(jsonb_agg(jsonb_build_object(
                            'titulo', titulo, 'preguntas', preguntas_total) order by preguntas_total desc), '[]'::jsonb)
                     from bot_vacios, umbral
                    where estado = 'pendiente' and preguntas_total >= umbral.n),
    'reincidentes', (select count(*) from bot_vacios v
                      where v.estado = 'resuelto' and v.resuelto_at is not null
                        and exists (select 1 from bot_vacios_preguntas p
                                     where p.vacio_id = v.id and p.created_at > v.resuelto_at)),
    'en_silencio', (select (select max(started_at) from bodi_conversations where knowledge_gap is true)
                         > coalesce((select max(created_at) from bot_vacios_preguntas), '-infinity'::timestamptz)
                           + interval '6 hours')
  );
$$;
revoke execute on function public.analytics_vacios_resumen_diario() from public, anon;
grant  execute on function public.analytics_vacios_resumen_diario() to authenticated, service_role;
