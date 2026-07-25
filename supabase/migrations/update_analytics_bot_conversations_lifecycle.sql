-- analytics_bot_conversations + lifecycle por fila y filtro p_lifecycle
-- (Sub-proyecto B). p_status YA significa calidad (resolution_status): el
-- filtro de ciclo de vida es un parámetro APARTE, no se reusa ese.
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.
drop function if exists public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int);
create or replace function public.analytics_bot_conversations(
  p_from      timestamptz,
  p_to        timestamptz,
  p_status    text default null,
  p_sentiment text default null,
  p_support   boolean default null,
  p_category  text default null,
  p_search    text default null,
  p_limit     int default 100,
  p_lifecycle text default null
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with res as (
    select
      id, started_at, ended_at, status, sentiment, support_redirected,
      bot_no_info,
      messages, lessons_used, summary,
      coalesce(category, topic, 'Sin categoría') as cat,
      coalesce(resolution_status,
        case when resolved is true then 'resuelta'
             when resolved is false then 'no_resuelta' end) as eff_status,
      case when support_redirected   then 'escalada'
           when status = 'completed' then 'cerrada_cliente'
           when status = 'abandoned' then 'abandonada'
           else 'en_curso' end as lifecycle,
      (select m->>'content'
         from jsonb_array_elements(messages) m
        where m->>'role' = 'user'
        limit 1) as first_user_msg
    from bodi_conversations
    where started_at >= p_from and started_at <= p_to
      and (p_sentiment is null or sentiment = p_sentiment)
      and (p_support  is null or coalesce(support_redirected, false) = p_support)
      and (p_category is null or coalesce(category, topic, 'Sin categoría') = p_category)
      and (p_search   is null or messages::text ilike '%' || p_search || '%')
      and (p_status   is null or coalesce(resolution_status,
             case when resolved is true then 'resuelta'
                  when resolved is false then 'no_resuelta' end) = p_status)
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.started_at desc), '[]'::jsonb)
  from (
    select * from res
     where p_lifecycle is null or lifecycle = p_lifecycle
     order by started_at desc
     limit p_limit
  ) r;
$$;
revoke execute on function public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int, text) from public, anon;
grant  execute on function public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int, text) to authenticated;
