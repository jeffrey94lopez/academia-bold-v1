-- analytics_content_gaps: temas del bot candidatos a "contenido faltante".
-- Agrupa por categoría (category con fallback a topic), y marca los de volumen
-- que (a) no tienen lección en 'lecciones.categoria', (b) resuelven mal, o
-- (c) el LLM marcó knowledge_gap. Base del puente bot→lección.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
drop function if exists public.analytics_content_gaps(timestamptz, timestamptz);
create or replace function public.analytics_content_gaps(
  p_from timestamptz,
  p_to   timestamptz
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with res as (
    select
      coalesce(category, topic, 'Sin categoría') as cat,
      coalesce(resolution_status,
        case when resolved is true then 'resuelta'
             when resolved is false then 'no_resuelta' end) as eff_status,
      knowledge_gap, support_redirected
    from bodi_conversations
    where started_at >= p_from and started_at <= p_to
      and coalesce(category, topic) is not null
  ),
  agg as (
    select cat,
           count(*) as total,
           round(100.0 * count(*) filter (where eff_status = 'resuelta')
                 / nullif(count(*) filter (where eff_status in ('resuelta','no_resuelta')), 0)) as resolved_pct,
           round(100.0 * count(*) filter (where support_redirected) / nullif(count(*), 0)) as support_pct,
           bool_or(coalesce(knowledge_gap, false)) as llm_gap
    from res group by cat
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'category', cat, 'total', total, 'resolved_pct', resolved_pct,
    'support_pct', support_pct,
    'has_lesson', exists (select 1 from lecciones l where l.categoria = agg.cat),
    'llm_gap', llm_gap) order by total desc), '[]'::jsonb)
  from agg
  where total >= 3
    and (not exists (select 1 from lecciones l where l.categoria = agg.cat)
         or resolved_pct is null or resolved_pct < 50
         or llm_gap);
$$;
revoke execute on function public.analytics_content_gaps(timestamptz, timestamptz) from public, anon;
grant  execute on function public.analytics_content_gaps(timestamptz, timestamptz) to authenticated;
