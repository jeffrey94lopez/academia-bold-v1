-- El comercio en cada fila del explorador de conversaciones.
--
-- Por que: una conversacion sin comercio no se puede seguir. El explorador
-- mostraba hora, mensaje, badges y categoria, pero no de quien era — y esa es
-- la primera pregunta de cualquiera que la este leyendo para atender algo.
--
-- Las dos columnas ya existen en bodi_conversations: `account_id` desde
-- add_cruce_vertical.sql y `business_name` desde add_identidad_comercio_vacios.sql.
-- Solo faltaba que la RPC las devolviera.
--
-- OJO: `business_name` se empezo a escribir el 2026-10-26, asi que las
-- conversaciones anteriores tienen id y no nombre. El panel cae al id acortado
-- (js/gap-comercio.js) y, sin ninguno de los dos, dice "Sin identificar" en vez
-- de pintar una etiqueta vacia.
--
-- COPIA EXACTA de la version vigente (add_vertical_analytics_bot.sql) con dos
-- columnas agregadas al select. La firma NO cambia: mismos parametros, mismo
-- tipo de retorno.
--
-- Ejecutar UNA sola vez en el SQL Editor del proyecto Supabase.

drop function if exists public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int, text, boolean);
create or replace function public.analytics_bot_conversations(
  p_from      timestamptz,
  p_to        timestamptz,
  p_status    text default null,
  p_sentiment text default null,
  p_support   boolean default null,
  p_category  text default null,
  p_search    text default null,
  p_limit     int default 100,
  p_lifecycle text default null,
  p_no_info   boolean default null,
  p_vertical  text default null
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with res as (
    select
      id, started_at, ended_at, status, sentiment, support_redirected,
      bot_no_info, vertical, account_id, business_name,
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
      and (p_no_info  is null or bot_no_info = p_no_info)
      -- 'sin_vertical' es el mismo bucket que arma by_vertical arriba: si el
      -- recuadro lo muestra, el explorador tiene que saber filtrarlo.
      and (p_vertical is null
           or (p_vertical = 'sin_vertical' and nullif(btrim(coalesce(vertical, '')), '') is null)
           or vertical = p_vertical)
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
revoke execute on function public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int, text, boolean, text) from public, anon;
grant  execute on function public.analytics_bot_conversations(timestamptz, timestamptz, text, text, boolean, text, text, int, text, boolean, text) to authenticated;
